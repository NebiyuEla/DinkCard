import { db, mapRow } from './db.js';
import { config } from './config.js';
import { generateId, money, nowIso, hmacSha256Hex } from './utils.js';

export const DEFAULT_GATEWAY_FEE_PERCENTAGE = 2.5;
export const DEFAULT_FIXED_CHARGE_ETB = 100;
export const DEFAULT_PERCENT_CHARGE = 15;
const PENDING_PAYMENT_TIMEOUT_MS = 5 * 60 * 1000;

export function getFeeSettings() {
  return mapRow(db.prepare('SELECT * FROM fee_settings WHERE key = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1').get('default'));
}

export function getGatewayFeePercentage(settings = getFeeSettings()) {
  const value = Number(settings?.gateway_fee_percentage ?? DEFAULT_GATEWAY_FEE_PERCENTAGE);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_GATEWAY_FEE_PERCENTAGE;
}

function safeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundUpTo(value, nearest) {
  const step = safeNumber(nearest, 0);
  if (step <= 0) return money(value);
  return money(Math.ceil(Number(value || 0) / step) * step);
}

export function calculateTopupProviderFeeUsd(usdAmount, settings = getFeeSettings()) {
  const usd = safeNumber(usdAmount, 0);
  const fixedUnder100 = Math.max(0, safeNumber(settings?.bitnob_topup_fee_under_100_usd, 1));
  const percent100Plus = Math.max(0, safeNumber(settings?.bitnob_topup_fee_percent_100_plus, 1));
  if (usd <= 0) return 0;
  return money(usd < 100 ? fixedUnder100 : (usd * percent100Plus) / 100);
}

export function calculateDeposit(usdAmount, settings = getFeeSettings()) {
  const usd = Number(usdAmount);
  const rate = Math.max(0, safeNumber(settings?.usd_to_etb_rate, 190));
  const gatewayFeePercentage = getGatewayFeePercentage(settings);
  const serviceMarginPercentage = Math.max(0, safeNumber(settings?.service_margin_percentage, DEFAULT_PERCENT_CHARGE));
  const minimumServiceFeeEtb = Math.max(0, safeNumber(settings?.minimum_service_fee_etb, DEFAULT_FIXED_CHARGE_ETB));
  const settlementFeeEtb = Math.max(0, safeNumber(settings?.chapa_settlement_fee_etb, 0));
  const roundingRuleEtb = Math.max(0, safeNumber(settings?.rounding_rule_etb, 0));
  const feeDisplayStyle = ['simple', 'detailed', 'hybrid'].includes(settings?.customer_fee_display_style)
    ? settings.customer_fee_display_style
    : 'simple';

  const cardAmountEtb = money(usd * rate);
  const providerCostUsd = 0;
  const providerCostEtb = 0;
  const baseCostEtb = cardAmountEtb;
  const safetyBufferEtb = 0;
  const dinkServiceFeeEtb = money(minimumServiceFeeEtb + (cardAmountEtb * serviceMarginPercentage / 100));
  const requiredBeforeChapaEtb = money(baseCostEtb + dinkServiceFeeEtb + settlementFeeEtb);
  const grossTotalBeforeRoundEtb = money(requiredBeforeChapaEtb + (requiredBeforeChapaEtb * gatewayFeePercentage / 100));
  const totalPayableEtb = roundUpTo(grossTotalBeforeRoundEtb, roundingRuleEtb);
  const gatewayFeeEtb = money(Math.max(0, totalPayableEtb - requiredBeforeChapaEtb));
  const serviceAndProcessingFeeEtb = money(Math.max(0, totalPayableEtb - cardAmountEtb));
  const roundingAdjustmentEtb = money(Math.max(0, totalPayableEtb - grossTotalBeforeRoundEtb));
  const effectivePayableRate = usd > 0 ? money(totalPayableEtb / usd) : 0;

  return {
    cardAmountUsd: money(usd),
    cardAmountEtb,
    exchangeRate: rate,
    etbAmount: cardAmountEtb,
    serviceFeeEtb: dinkServiceFeeEtb,
    serviceAndProcessingFeeEtb,
    gatewayFeeEtb,
    gatewayFeePercentage,
    totalPayableEtb,
    effectivePayableRate,
    finalUsdCredit: money(usd),
    providerCostUsd,
    providerCostEtb,
    topupFeeUsd: 0,
    topupFeeEtb: providerCostEtb,
    safetyBufferEtb,
    dinkServiceFeeEtb,
    settlementFeeEtb,
    requiredBeforeChapaEtb,
    grossTotalBeforeRoundEtb,
    roundingAdjustmentEtb,
    roundingRuleEtb,
    feeDisplayStyle
  };
}

function paymentExpired(createdAt) {
  const createdMs = Date.parse(createdAt || '');
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs >= PENDING_PAYMENT_TIMEOUT_MS;
}

export function expirePendingChapaDeposits(userId) {
  const threshold = new Date(Date.now() - PENDING_PAYMENT_TIMEOUT_MS).toISOString();
  const now = nowIso();
  const sql = `
    UPDATE deposits
    SET status = 'cancelled',
        provider_status = COALESCE(NULLIF(provider_status, ''), 'expired'),
        rejection_reason = COALESCE(NULLIF(rejection_reason, ''), 'Payment checkout expired after 5 minutes.'),
        updated_at = ?
    WHERE payment_method = 'chapa'
      AND status = 'pending_payment'
      AND created_at <= ?
      ${userId ? 'AND user_id = ?' : ''}
  `;
  const params = userId ? [now, threshold, userId] : [now, threshold];
  return db.prepare(sql).run(...params);
}

export function cancelChapaDeposit(txRef, reason = 'Payment was cancelled.', providerStatus = 'cancelled', providerPayload) {
  const deposit = db.prepare('SELECT * FROM deposits WHERE transaction_reference = ?').get(txRef);
  if (!deposit) throw new Error('Deposit not found');
  if (deposit.status === 'approved') return mapRow(deposit);
  if (['failed', 'rejected', 'refunded', 'cancelled', 'canceled'].includes(deposit.status)) return mapRow(deposit);

  const now = nowIso();
  db.prepare(`
    UPDATE deposits
    SET status = 'cancelled',
        provider_status = ?,
        rejection_reason = ?,
        provider_payload = COALESCE(?, provider_payload),
        updated_at = ?
    WHERE id = ?
  `).run(providerStatus, reason, providerPayload ? JSON.stringify(providerPayload) : null, now, deposit.id);

  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
    VALUES (?, ?, 'Payment Cancelled', ?, 'deposit', 0, ?)
  `).run(generateId('ntf'), deposit.user_id, reason, now);

  return mapRow(db.prepare('SELECT * FROM deposits WHERE id = ?').get(deposit.id));
}

function buildChapaReturnUrl(txRef) {
  const url = new URL('/dashboard', config.appUrl);
  url.searchParams.set('tx_ref', txRef);
  url.searchParams.set('payment', 'chapa');
  return url.toString();
}

function providerMessage(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export async function initializeChapaPayment({ user, amountUsd, phoneNumber }) {
  if (!config.chapa.secretKey) {
    throw new Error('Missing checkout credentials. Set CHAPA_SECRET_KEY in the environment.');
  }
  const settings = getFeeSettings();
  const usd = Number(amountUsd);
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error('Enter a valid USD amount.');
  }
  if (usd < Number(settings.min_deposit_usd || 5)) {
    throw new Error(`Minimum deposit is $${Number(settings.min_deposit_usd || 5).toFixed(2)}.`);
  }
  if (usd > Number(settings.max_deposit_usd || 1000)) {
    throw new Error(`Maximum deposit is $${Number(settings.max_deposit_usd || 1000).toFixed(2)}.`);
  }
  const approvedKyc = db.prepare(`
    SELECT id FROM kyc_submissions
    WHERE user_id = ? AND status = 'approved'
    ORDER BY created_at DESC LIMIT 1
  `).get(user.email);
  if (!approvedKyc) {
    throw new Error('Approved KYC is required before adding funds.');
  }
  const calc = calculateDeposit(amountUsd, settings);
  const txRef = `dinkcard_service_${generateId('tx')}`;
  const firstName = user.first_name || user.full_name?.split(' ')[0] || 'Dink';
  const lastName = user.last_name || user.full_name?.split(' ').slice(1).join(' ') || 'User';
  const now = nowIso();

  db.prepare(`
    INSERT INTO deposits (
      id, user_id, payment_method, requested_usd_amount, exchange_rate, etb_amount, service_fee_etb,
      gateway_fee_etb, total_payable_etb, final_usd_credit, sender_name, sender_phone, transaction_reference,
      status, provider_status, source, created_at, updated_at
    ) VALUES (?, ?, 'chapa', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', 'initialized', 'dinkcard', ?, ?)
  `).run(
    generateId('dep'),
    user.email,
    usd,
    calc.exchangeRate,
    calc.etbAmount,
    calc.serviceFeeEtb,
    calc.gatewayFeeEtb,
    calc.totalPayableEtb,
    calc.finalUsdCredit,
    user.full_name || user.email,
    phoneNumber || user.phone || '',
    txRef,
    now,
    now
  );

  const response = await fetch('https://api.chapa.co/v1/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.chapa.secretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: String(calc.totalPayableEtb),
      currency: 'ETB',
      email: user.email,
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber || user.phone || '',
      tx_ref: txRef,
      callback_url: config.chapa.callbackUrl,
      return_url: buildChapaReturnUrl(txRef),
      customization: {
        title: 'Dink Card',
        description: 'Supported card-related service funding'
      }
    })
  });

  const payload = await response.json();
  if (!response.ok || payload?.status !== 'success') {
    const message = providerMessage(payload?.message, 'Failed to initialize checkout');
    db.prepare('UPDATE deposits SET status = ?, provider_status = ?, rejection_reason = ?, provider_payload = ?, updated_at = ? WHERE transaction_reference = ?')
      .run('failed', 'initialize_failed', message, JSON.stringify(payload || {}), nowIso(), txRef);
    throw new Error(message);
  }

  db.prepare('UPDATE deposits SET checkout_url = ?, provider_status = ?, provider_payload = ?, updated_at = ? WHERE transaction_reference = ?')
    .run(payload.data.checkout_url, 'checkout_created', JSON.stringify(payload || {}), nowIso(), txRef);

  return {
    txRef,
    checkoutUrl: payload.data.checkout_url,
    amountUsd: usd,
    amountEtb: calc.totalPayableEtb
  };
}

export async function verifyChapaTransaction(txRef) {
  const response = await fetch(`https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(txRef)}`, {
    headers: {
      Authorization: `Bearer ${config.chapa.secretKey}`
    }
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(providerMessage(payload?.message, 'Failed to verify checkout transaction'));
  }
  return payload;
}

export function creditWallet(userId, amount, type, description, reference) {
  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
  if (!wallet) throw new Error('Service balance account not found');
  const existing = db.prepare('SELECT id FROM wallet_transactions WHERE reference = ?').get(reference);
  if (existing) {
    return Number(wallet.available_balance || 0);
  }
  const before = Number(wallet?.available_balance || 0);
  const after = money(before + Number(amount));
  const now = nowIso();
  db.prepare(`
    INSERT INTO wallet_transactions (
      id, user_id, wallet_id, type, amount, currency, balance_before, balance_after, status, reference, description, created_at
    ) VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, 'completed', ?, ?, ?)
  `).run(generateId('wtx'), userId, wallet.id, type, Number(amount), before, after, reference, description, now);
  db.prepare('UPDATE wallets SET available_balance = ?, updated_at = ? WHERE id = ?').run(after, now, wallet.id);
  return after;
}

export function debitWallet(userId, amount, type, description, reference) {
  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
  if (!wallet) throw new Error('Service balance account not found');
  const existing = db.prepare('SELECT id FROM wallet_transactions WHERE reference = ?').get(reference);
  if (existing) {
    return Number(wallet.available_balance || 0);
  }
  const before = Number(wallet?.available_balance || 0);
  if (before < amount) {
    throw new Error('Insufficient available service balance');
  }
  const after = money(before - Number(amount));
  const now = nowIso();
  db.prepare(`
    INSERT INTO wallet_transactions (
      id, user_id, wallet_id, type, amount, currency, balance_before, balance_after, status, reference, description, created_at
    ) VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, 'completed', ?, ?, ?)
  `).run(generateId('wtx'), userId, wallet.id, type, -Number(amount), before, after, reference, description, now);
  db.prepare('UPDATE wallets SET available_balance = ?, updated_at = ? WHERE id = ?').run(after, now, wallet.id);
  return after;
}

export function setWalletBalance(userId, amount, description, reference) {
  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
  if (!wallet) throw new Error('Service balance account not found');
  const nextBalance = Number(amount);
  if (!Number.isFinite(nextBalance) || nextBalance < 0) {
    throw new Error('Enter a valid non-negative balance.');
  }
  const existing = db.prepare('SELECT id FROM wallet_transactions WHERE reference = ?').get(reference);
  if (existing) {
    return Number(wallet.available_balance || 0);
  }
  const before = Number(wallet.available_balance || 0);
  const delta = money(nextBalance - before);
  const now = nowIso();
  db.prepare(`
    INSERT INTO wallet_transactions (
      id, user_id, wallet_id, type, amount, currency, balance_before, balance_after, status, reference, description, created_at
    ) VALUES (?, ?, ?, 'balance_set', ?, 'USD', ?, ?, 'completed', ?, ?, ?)
  `).run(generateId('wtx'), userId, wallet.id, delta, before, money(nextBalance), reference, description, now);
  db.prepare('UPDATE wallets SET available_balance = ?, updated_at = ? WHERE id = ?').run(money(nextBalance), now, wallet.id);
  return money(nextBalance);
}

export function approveDeposit(deposit, approvedBy) {
  if (deposit.status === 'approved') return deposit;
  if (['rejected', 'failed', 'refunded'].includes(deposit.status)) {
    throw new Error('This funding request can no longer be approved.');
  }
  const now = nowIso();
  const newBalance = creditWallet(
    deposit.user_id,
    Number(deposit.final_usd_credit),
    'deposit',
    `Funding approved: ${deposit.payment_method} - Ref: ${deposit.transaction_reference}`,
    `DEP-${deposit.id}`
  );
  db.prepare(`
    UPDATE deposits
    SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ?
    WHERE id = ?
  `).run(approvedBy, now, now, deposit.id);
  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
    VALUES (?, ?, 'Deposit Approved', ?, 'deposit', 0, ?)
  `).run(
    generateId('ntf'),
    deposit.user_id,
    `Your funding request of $${Number(deposit.final_usd_credit).toFixed(2)} has been credited to your available service balance.`,
    now
  );
  db.prepare(`
    INSERT INTO audit_logs (id, admin_id, user_id, action, entity_type, entity_id, new_value, created_at)
    VALUES (?, ?, ?, 'deposit_approved', 'deposit', ?, ?, ?)
  `).run(generateId('adt'), approvedBy, deposit.user_id, deposit.id, JSON.stringify({ amount: deposit.final_usd_credit, balance: newBalance }), now);
  return mapRow(db.prepare('SELECT * FROM deposits WHERE id = ?').get(deposit.id));
}

export async function finalizeChapaDeposit(txRef) {
  if (!String(txRef || '').startsWith('dinkcard_service_')) {
    throw new Error('Invalid platform transaction reference');
  }
  expirePendingChapaDeposits();
  const deposit = db.prepare('SELECT * FROM deposits WHERE transaction_reference = ?').get(txRef);
  if (!deposit) {
    throw new Error('Deposit not found');
  }
  if (deposit.status === 'approved') {
    return mapRow(deposit);
  }
  if (['cancelled', 'canceled', 'failed', 'rejected', 'refunded'].includes(deposit.status)) {
    return mapRow(deposit);
  }
  if (paymentExpired(deposit.created_at)) {
    return cancelChapaDeposit(txRef, 'Payment checkout expired after 5 minutes.', 'expired');
  }
  if (deposit.source && deposit.source !== 'dinkcard') {
    throw new Error('Transaction source mismatch');
  }
  const verified = await verifyChapaTransaction(txRef);
  const data = verified?.data || {};
  const providerStatus = String(data.status || verified?.status || 'pending').toLowerCase();
  if (['cancelled', 'canceled', 'failed'].includes(providerStatus)) {
    return cancelChapaDeposit(txRef, `Payment ${providerStatus.replace('cancelled', 'cancelled')}.`, providerStatus, verified);
  }
  if (providerStatus !== 'success') {
    db.prepare('UPDATE deposits SET provider_status = ?, provider_payload = ?, updated_at = ? WHERE id = ?')
      .run(providerStatus, JSON.stringify(verified || {}), nowIso(), deposit.id);
    return mapRow(db.prepare('SELECT * FROM deposits WHERE id = ?').get(deposit.id));
  }
  if (String(data.currency).toUpperCase() !== 'ETB') {
    throw new Error('Currency mismatch from Chapa verification');
  }
  if (money(data.amount) !== money(deposit.total_payable_etb)) {
    throw new Error('Amount mismatch from Chapa verification');
  }
  const now = nowIso();
  db.prepare('UPDATE deposits SET provider_reference = ?, provider_status = ?, provider_payload = ?, verified_at = ?, updated_at = ? WHERE id = ?')
    .run(data.ref_id || data.reference || '', String(data.status || 'success'), JSON.stringify(verified || {}), now, now, deposit.id);
  return approveDeposit(deposit, 'system:chapa');
}

export function verifyChapaWebhookSignature(rawBody, headerValue) {
  if (!config.chapa.webhookSecret) return process.env.NODE_ENV !== 'production';
  return hmacSha256Hex(config.chapa.webhookSecret, rawBody) === headerValue;
}
