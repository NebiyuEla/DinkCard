import { db, mapRow } from './db.js';
import { config } from './config.js';
import { generateId, money, nowIso, hmacSha256Hex } from './utils.js';

export const GATEWAY_FEE_PERCENTAGE = 2.5;

export function getFeeSettings() {
  return mapRow(db.prepare('SELECT * FROM fee_settings WHERE key = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1').get('default'));
}

export function calculateDeposit(usdAmount, settings) {
  const usd = Number(usdAmount);
  const rate = Number(settings.usd_to_etb_rate || 135);
  const etbAmount = money(usd * rate);
  const serviceFeeEtb = 0;
  const gatewayFeeEtb = money(etbAmount * GATEWAY_FEE_PERCENTAGE / 100);
  const totalPayableEtb = money(etbAmount + serviceFeeEtb + gatewayFeeEtb);
  return {
    exchangeRate: rate,
    etbAmount,
    serviceFeeEtb,
    gatewayFeeEtb,
    gatewayFeePercentage: GATEWAY_FEE_PERCENTAGE,
    totalPayableEtb,
    finalUsdCredit: money(usd)
  };
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
  const firstName = user.full_name?.split(' ')[0] || 'DinkCard';
  const lastName = user.full_name?.split(' ').slice(1).join(' ') || 'User';
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
      return_url: `${config.chapa.returnUrl}?tx_ref=${txRef}`,
      customization: {
        title: 'DinkCard',
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
  const deposit = db.prepare('SELECT * FROM deposits WHERE transaction_reference = ?').get(txRef);
  if (!deposit) {
    throw new Error('Deposit not found');
  }
  if (deposit.status === 'approved') {
    return mapRow(deposit);
  }
  if (deposit.source && deposit.source !== 'dinkcard') {
    throw new Error('Transaction source mismatch');
  }
  const verified = await verifyChapaTransaction(txRef);
  const data = verified?.data || {};
  if (String(data.status).toLowerCase() !== 'success') {
    db.prepare('UPDATE deposits SET provider_status = ?, provider_payload = ?, updated_at = ? WHERE id = ?')
      .run(String(data.status || 'pending'), JSON.stringify(verified || {}), nowIso(), deposit.id);
    return mapRow(deposit);
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
