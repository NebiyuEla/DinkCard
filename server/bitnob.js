import crypto from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';
import { debitWallet, creditWallet, getFeeSettings, calculateTopupProviderFeeUsd } from './payments.js';
import { generateId, money, nowIso, hmacSha512Hex } from './utils.js';

// Bitnob virtual-card docs use card units where 5,000,000 represents $50.00.
const BITNOB_AMOUNT_SCALE = 100_000;

function toBitnobAmount(amountUsd) {
  return Math.round(Number(amountUsd || 0) * BITNOB_AMOUNT_SCALE);
}

function fromBitnobAmount(baseUnits) {
  return money(Number(baseUnits || 0) / BITNOB_AMOUNT_SCALE);
}

function getBitnobCard(response) {
  return response?.data?.card || response?.data || response?.card || {};
}

function getEffectiveMinCardFunding(settings) {
  const raw = Number(settings?.min_card_funding_usd);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  // Older deployments used 2 as the default floor even though our current product floor is 1.
  return raw === 2 ? 1 : raw;
}

function getEffectiveMinCardCreation(settings) {
  const raw = Number(settings?.min_card_creation_usd);
  if (!Number.isFinite(raw) || raw <= 0) return 2;
  return Math.max(2, raw);
}

function signBitnob(body = '') {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const signingString = `${config.bitnob.clientId}:${timestamp}:${nonce}:${body}`;
  const signature = crypto
    .createHmac('sha256', config.bitnob.clientSecret)
    .update(signingString)
    .digest('hex');
  return {
    'Content-Type': 'application/json',
    'X-Auth-Client': config.bitnob.clientId,
    'X-Auth-Timestamp': timestamp,
    'X-Auth-Nonce': nonce,
    'X-Auth-Signature': signature
  };
}

export async function bitnobRequest(method, requestPath, payload) {
  if (!config.bitnob.clientId || !config.bitnob.clientSecret) {
    throw new Error('Missing card provider credentials. Set BITNOB_CLIENT_ID and BITNOB_CLIENT_SECRET.');
  }
  const body = payload ? JSON.stringify(payload) : '';
  const response = await fetch(`${config.bitnob.baseUrl}${requestPath}`, {
    method,
    headers: signBitnob(body),
    body: body || undefined
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!response.ok || data?.success === false) {
    const validationDetails = [
      data?.errors,
      data?.error?.errors,
      data?.details,
      data?.detail?.errors,
      data?.extensions?.validation,
      data?.extensions?.metadata?.errors
    ].filter(Boolean);
    const formattedValidation = validationDetails
      .flatMap((value) => {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') {
          return Object.entries(value).map(([field, detail]) => `${field}: ${Array.isArray(detail) ? detail.join(', ') : detail}`);
        }
        return [String(value)];
      })
      .filter(Boolean)
      .join('; ');
    const providerDetail = formattedValidation || data?.detail || data?.error?.message || data?.message;
    const errorCode = data?.extensions?.metadata?.error_code || data?.error?.code || data?.code;
    const message = providerDetail || `Card provider request failed with status ${response.status}`;
    if (data?.error?.code === 'ORG_NOT_ACTIVE') {
      throw new Error('Card service is not active for this account yet. Please contact the administrator.');
    }
    if (errorCode === 'COMPANY_INSUFFICIENT_BALANCE') {
      const required = data?.extensions?.metadata?.required;
      const available = data?.extensions?.metadata?.available;
      throw new Error(`Insufficient company wallet balance.${required ? ` Required: ${required} USDC.` : ''}${available ? ` Available: ${available} USDC.` : ''}`);
    }
    const error = new Error(message);
    error.providerResponse = data;
    error.providerStatus = response.status;
    throw error;
  }
  return data;
}

export function toBitnobBaseUnits(amountUsd) {
  return toBitnobAmount(amountUsd);
}

export function fromBitnobBaseUnits(baseUnits) {
  return fromBitnobAmount(baseUnits);
}

function friendlyBitnobError(error) {
  const message = String(error?.message || error || 'Card provider request failed');
  if (/authentication|signature|unauthorized|forbidden/i.test(message)) {
    return new Error('Provider authentication failed. Check server environment keys.');
  }
  const minimumFundingMatch = message.match(/minimum funding of \$?(\d+(?:\.\d+)?)/i);
  if (minimumFundingMatch) {
    const providerMinimum = Number(minimumFundingMatch[1]);
    if (Number.isFinite(providerMinimum)) {
      return new Error(`Card provider currently requires at least $${providerMinimum.toFixed(2)} for this action. Increase the amount and try again.`);
    }
  }
  const belowMinimumMatch = message.match(/below minimum funding of \$?(\d+(?:\.\d+)?)/i);
  if (belowMinimumMatch) {
    const providerMinimum = Number(belowMinimumMatch[1]);
    if (Number.isFinite(providerMinimum)) {
      return new Error(`Card provider currently requires at least $${providerMinimum.toFixed(2)} to create a card. Increase the starting amount and try again.`);
    }
  }
  return error;
}

async function safeBitnob(method, requestPath, payload) {
  try {
    return await bitnobRequest(method, requestPath, payload);
  } catch (error) {
    throw friendlyBitnobError(error);
  }
}

export const bitnobService = {
  request: bitnobRequest,
  environment: config.bitnob.env,
  whoami: () => safeBitnob('GET', '/api/whoami'),
  createCustomer: (data) => safeBitnob('POST', '/api/customers', data),
  listCustomers: () => safeBitnob('GET', '/api/customers'),
  getCustomer: (customerId) => safeBitnob('GET', `/api/customers/${encodeURIComponent(customerId)}`),
  updateCustomer: (customerId, data) => safeBitnob('PUT', `/api/customers/${encodeURIComponent(customerId)}`, data),
  deleteCustomer: (customerId) => safeBitnob('DELETE', `/api/customers/${encodeURIComponent(customerId)}`),
  createCard: (data) => safeBitnob('POST', '/api/cards', data),
  listCards: () => safeBitnob('GET', '/api/cards'),
  getCard: (cardId) => safeBitnob('GET', `/api/cards/${encodeURIComponent(cardId)}`),
  getCustomerCards: (customerId) => safeBitnob('GET', `/api/customers/${encodeURIComponent(customerId)}/cards`),
  getSecureCardDetails: (cardId) => safeBitnob('GET', `/api/cards/${encodeURIComponent(cardId)}/secure`),
  fundCard: (cardId, amount, reference) => safeBitnob('POST', `/api/cards/${encodeURIComponent(cardId)}/balance`, {
    type: 'fund',
    amount: toBitnobAmount(amount),
    reference
  }),
  withdrawCard: (cardId, amount, reference) => safeBitnob('POST', `/api/cards/${encodeURIComponent(cardId)}/balance`, {
    type: 'withdraw',
    amount: toBitnobAmount(amount),
    reference
  }),
  freezeCard: (cardId) => safeBitnob('POST', `/api/cards/${encodeURIComponent(cardId)}/status`, { status: 'frozen' }),
  unfreezeCard: (cardId) => safeBitnob('POST', `/api/cards/${encodeURIComponent(cardId)}/status`, { status: 'active' }),
  getCardTransactions: (cardId) => safeBitnob('GET', `/api/cards/${encodeURIComponent(cardId)}/transactions`),
  listCardTransactions: () => safeBitnob('GET', '/api/cards/transactions'),
  getAllCardTransactions: () => safeBitnob('GET', '/api/cards/transactions'),
  getBalances: () => safeBitnob('GET', '/api/balances'),
  generateAddress: (data) => safeBitnob('POST', '/api/addresses', data),
  listAddresses: () => safeBitnob('GET', '/api/addresses'),
  getSupportedChains: () => safeBitnob('GET', '/api/addresses/supported-chains')
};

function getExistingBitnobCustomer(user, kyc) {
  return db.prepare(`
    SELECT * FROM bitnob_customers
    WHERE environment = ? AND (user_id = ? OR email = ?)
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).get(config.bitnob.env, user.email, kyc.email || user.email);
}

function normalizeEthiopianPhone(phoneValue) {
  let digits = String(phoneValue || '').trim().replace(/\D/g, '');
  if (digits.startsWith('00251')) digits = digits.slice(5);
  if (digits.startsWith('251')) digits = digits.slice(3);
  digits = digits.replace(/^0+/, '');
  return digits || undefined;
}

async function ensureBitnobCustomerForCard(user, kyc) {
  const existing = getExistingBitnobCustomer(user, kyc);
  if (existing?.bitnob_customer_id) return existing;

  const legalName = String(kyc.legal_name || user.full_name || user.email || '').trim();
  const [firstName, ...lastParts] = legalName.split(/\s+/).filter(Boolean);
  const response = await bitnobRequest('POST', '/api/customers', {
    customer_type: 'individual',
    first_name: firstName || 'Dink',
    last_name: lastParts.join(' ') || 'Card',
    email: kyc.email || user.email,
    date_of_birth: kyc.date_of_birth || undefined,
    id_type: kyc.id_type || undefined,
    id_number: kyc.id_number || undefined,
    phone_number: normalizeEthiopianPhone(kyc.phone || user.phone),
    dial_code: '+251',
    country: 'ETH',
    country_code: 'ETH',
    address: kyc.address || undefined,
    city: kyc.city || 'Addis Ababa'
  });
  const customer = response?.data?.customer || response?.data || response?.customer || {};
  const bitnobCustomerId = customer.id || customer.customer_id || customer.customerId;
  if (!bitnobCustomerId) {
    throw new Error('Card provider did not return a customer ID. Check Bitnob customer access and credentials.');
  }
  const now = nowIso();
  const id = generateId('cus');
  db.prepare(`
    INSERT INTO bitnob_customers (
      id, user_id, bitnob_customer_id, customer_type, first_name, last_name, email, phone_number, dial_code,
      date_of_birth, id_type, id_number, country, address, city, status, environment, provider, provider_payload, created_at, updated_at
    ) VALUES (?, ?, ?, 'individual', ?, ?, ?, ?, '+251', ?, ?, ?, ?, ?, ?, ?, ?, 'bitnob', ?, ?, ?)
  `).run(
    id,
    user.email,
    bitnobCustomerId,
    firstName || 'Dink',
    lastParts.join(' ') || 'Card',
    kyc.email || user.email,
    normalizeEthiopianPhone(kyc.phone || user.phone) || '',
    kyc.date_of_birth || '',
    kyc.id_type || '',
    kyc.id_number || '',
    kyc.country || 'ETH',
    kyc.address || '',
    kyc.city || '',
    customer.status || 'active',
    config.bitnob.env,
    JSON.stringify(response),
    now,
    now
  );
  return db.prepare('SELECT * FROM bitnob_customers WHERE id = ?').get(id);
}

export async function createVirtualCardForUser(user, payload) {
  const cardNickname = String(payload.nickname || 'Virtual Card').trim() || 'Virtual Card';
  const kyc = db.prepare(`
    SELECT * FROM kyc_submissions
    WHERE user_id = ? AND status = 'approved'
    ORDER BY created_at DESC LIMIT 1
  `).get(user.email);
  if (!kyc) {
    throw new Error('Approved KYC is required before creating a card.');
  }

  const settings = getFeeSettings();
  const activeCards = db.prepare(`
    SELECT COUNT(*) AS total FROM virtual_cards
    WHERE user_id = ? AND status != 'terminated'
  `).get(user.email);

  const maxCards = Math.min(Number(settings.max_cards_per_user || 3), 3);
  if (activeCards.total >= maxCards) {
    throw new Error(`You have reached the maximum of ${maxCards} active virtual cards.`);
  }

  const fundingAmount = Number(payload.fundingAmount || 0);
  const minFunding = getEffectiveMinCardCreation(settings);
  if (!Number.isFinite(fundingAmount) || fundingAmount < minFunding) {
    throw new Error(`Minimum card creation amount is $${Number(minFunding).toFixed(2)}.`);
  }
  if (fundingAmount > Number(settings.max_card_funding_usd || 500)) {
    throw new Error(`Maximum card funding is $${Number(settings.max_card_funding_usd || 500).toFixed(2)}.`);
  }
  const creationFee = Number(settings.card_creation_fee_usd ?? 1);
  const fundingFee = 0;
  const totalDeduction = money(creationFee + fundingAmount);
  const bitnobCustomer = await ensureBitnobCustomerForCard(user, kyc);
  debitWallet(
    user.email,
    totalDeduction,
    'card_creation',
    `Card creation: ${cardNickname} + $${fundingAmount} funding`,
    `CRT-${Date.now()}`
  );

  try {
    const response = await bitnobRequest('POST', '/api/cards', {
      amount: toBitnobAmount(fundingAmount),
      card_type: 'virtual',
      currency: 'USD',
      name: kyc.legal_name,
      webhook_url: config.bitnob.webhookUrl,
      customer_id: bitnobCustomer.bitnob_customer_id
    });

    const card = getBitnobCard(response);
    if (!card?.id) {
      throw new Error('Card provider did not return a card ID. Check Bitnob virtual card access and credentials.');
    }
    const now = nowIso();
    const maskedPan = card.masked_pan || '';
    const lastFour = card.last_four_digit || card.last_four || maskedPan.replace(/\D/g, '').slice(-4) || '';
    const initialBalance = card.display_amount !== undefined
      ? Number(card.display_amount)
      : card.balance_amount !== undefined
        ? fromBitnobAmount(card.balance_amount)
        : fundingAmount;

    db.prepare(`
      INSERT INTO virtual_cards (
        id, user_id, provider, bitnob_customer_id, provider_card_id, customer_reference, card_nickname, card_type, brand, currency,
        last_four, expiry_month, expiry_year, balance, status, billing_address, masked_pan, meta, created_at, updated_at
      ) VALUES (?, ?, 'bitnob', ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId('crd'),
      user.email,
      card.customer_id || '',
      card.id,
      card.customer_id || '',
      cardNickname,
      'credit_card',
      card.card_brand || 'credit_card',
      lastFour,
      '',
      '',
      money(initialBalance),
      card.status || 'pending',
      JSON.stringify(card.billing_address || {}),
      maskedPan,
      JSON.stringify(card),
      now,
      now
    );
    const created = db.prepare('SELECT * FROM virtual_cards WHERE provider_card_id = ?').get(card.id);
    return created;
  } catch (error) {
    creditWallet(
      user.email,
      totalDeduction,
      'refund',
      `Card creation refund: ${cardNickname}`,
      `CRF-${Date.now()}`
    );
    throw error;
  }
}

export async function fundVirtualCard(user, cardId, amount) {
  const card = db.prepare('SELECT * FROM virtual_cards WHERE id = ? AND user_id = ?').get(cardId, user.email);
  if (!card) throw new Error('Card not found');
  if (!['active', 'frozen'].includes(card.status)) {
    throw new Error('Only active or frozen cards can be funded.');
  }
  const settings = getFeeSettings();
  const fundingAmount = Number(amount);
  const minFunding = getEffectiveMinCardFunding(settings);
  if (!Number.isFinite(fundingAmount) || fundingAmount < minFunding) {
    throw new Error(`Minimum card funding is $${Number(minFunding).toFixed(2)}.`);
  }
  if (fundingAmount > Number(settings.max_card_funding_usd || 500)) {
    throw new Error(`Maximum card funding is $${Number(settings.max_card_funding_usd || 500).toFixed(2)}.`);
  }
  const fundingFee = calculateTopupProviderFeeUsd(fundingAmount, settings);
  const total = money(fundingAmount + fundingFee);
  const reference = `fund_${generateId('ref')}`;
  debitWallet(user.email, total, 'card_funding', `Fund card: ${card.card_nickname}`, reference);

  try {
    const response = await bitnobRequest('POST', `/api/cards/${card.provider_card_id}/balance`, {
      amount: toBitnobAmount(fundingAmount),
      type: 'fund',
      reference
    });
    const now = nowIso();
    db.prepare(`
      INSERT INTO card_funding_requests (
        id, user_id, card_id, amount, fee, total_wallet_deduction, status, provider_reference, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(generateId('cfr'), user.email, card.id, fundingAmount, fundingFee, total, reference, now, now);
    return response;
  } catch (error) {
    creditWallet(user.email, total, 'refund', `Card funding refund: ${card.card_nickname}`, `refund_${reference}`);
    throw error;
  }
}

export async function changeCardStatus(user, cardId, status) {
  if (!['active', 'frozen'].includes(status)) {
    throw new Error('Unsupported card status action.');
  }
  const card = db.prepare('SELECT * FROM virtual_cards WHERE id = ?').get(cardId);
  if (!card) throw new Error('Card not found');
  if (user.role === 'user' && card.user_id !== user.email) throw new Error('Forbidden');
  if (!card.provider_card_id) throw new Error('Card provider reference is not available yet.');
  await bitnobRequest('POST', `/api/cards/${card.provider_card_id}/status`, { status });
  db.prepare('UPDATE virtual_cards SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), card.id);
}

export async function terminateCard(user, cardId) {
  const card = db.prepare('SELECT * FROM virtual_cards WHERE id = ?').get(cardId);
  if (!card) throw new Error('Card not found');
  if (user.role === 'user' && card.user_id !== user.email) throw new Error('Forbidden');
  if (!card.provider_card_id) throw new Error('Card provider reference is not available yet.');
  const response = await bitnobRequest('DELETE', `/api/cards/${card.provider_card_id}`, { reason: 'User terminated card' });
  const remainingBaseUnits = response?.data?.remaining_balance ?? response.remaining_balance ?? 0;
  const remaining = fromBitnobAmount(remainingBaseUnits);
  if (remaining > 0) {
    creditWallet(card.user_id, remaining, 'card_withdrawal', `Card termination refund: ${card.card_nickname}`, `TRM-${Date.now()}`);
  }
  db.prepare('UPDATE virtual_cards SET status = ?, balance = 0, updated_at = ? WHERE id = ?')
    .run('terminated', nowIso(), card.id);
}

export async function revealCardDetails(user, cardId, password) {
  const dbUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  const validPassword = await import('bcryptjs').then(({ default: bcrypt }) => bcrypt.compare(password, dbUser.password_hash));
  if (!validPassword) {
    throw new Error('Incorrect password');
  }
  const card = db.prepare('SELECT * FROM virtual_cards WHERE id = ?').get(cardId);
  if (!card) throw new Error('Card not found');
  if (user.role === 'user' && card.user_id !== user.email) throw new Error('Forbidden');
  if (!['active', 'frozen'].includes(card.status)) throw new Error('Card details are unavailable for this card status.');
  if (!card.provider_card_id) throw new Error('Card provider reference is not available yet.');
  const response = await bitnobRequest('GET', `/api/cards/${card.provider_card_id}/secure`);
  const secure = response?.data?.card || response?.data || {};
  return {
    card_number: secure.pan || secure.card_number || secure.full_pan || '',
    cvv: secure.cvv || '',
    expiry_month: secure.expiry_month || card.expiry_month || '',
    expiry_year: secure.expiry_year || card.expiry_year || ''
  };
}

export function verifyBitnobWebhook(rawBody, headerValue) {
  if (!config.bitnob.webhookSecret && !config.bitnob.clientSecret) return true;
  const secret = config.bitnob.webhookSecret || config.bitnob.clientSecret;
  return hmacSha512Hex(secret, rawBody) === headerValue;
}

function extractProviderCardId(payload) {
  const data = payload.data || {};
  return data.card?.id || data.card_id || data.cardId || data.id || payload.card_id || payload.cardId || payload.id;
}

function extractDisplayBalance(cardData, fallback) {
  if (cardData.display_amount !== undefined) return Number(cardData.display_amount);
  if (cardData.balance !== undefined) return Number(cardData.balance);
  if (cardData.balance_amount !== undefined) return fromBitnobAmount(cardData.balance_amount);
  if (cardData.balanceAfter !== undefined) return Number(cardData.balanceAfter);
  if (cardData.balance_after !== undefined) return fromBitnobAmount(cardData.balance_after);
  return fallback;
}

function extractProviderAmount(value) {
  if (value === undefined || value === null || value === '') return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.abs(numeric) >= BITNOB_AMOUNT_SCALE ? fromBitnobAmount(numeric) : money(numeric);
}

function extractEventAmount(data) {
  if (data.display_amount !== undefined) return Number(data.display_amount);
  if (data.card?.display_amount !== undefined) return Number(data.card.display_amount);
  if (data.amount !== undefined) return extractProviderAmount(data.amount);
  if (data.card?.amount !== undefined) return extractProviderAmount(data.card.amount);
  return 0;
}

function eventIsOneOf(event, names) {
  return names.includes(String(event || '').toLowerCase());
}

function writeCardNotification(card, title, message) {
  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
    VALUES (?, ?, ?, ?, 'card', 0, ?)
  `).run(generateId('ntf'), card.user_id, title, message, nowIso());
}

export function handleBitnobWebhook(payload) {
  const eventKey = payload.event_id || `${payload.event}:${payload.data?.card?.id || payload.data?.id || Date.now()}`;
  const exists = db.prepare('SELECT id FROM webhook_events WHERE event_key = ?').get(eventKey);
  if (exists) return;
  db.prepare('INSERT INTO webhook_events (id, provider, event_key, payload, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(generateId('whk'), 'bitnob', eventKey, JSON.stringify(payload), nowIso());

  const event = String(payload.event || '').toLowerCase();
  const cardData = payload.data?.card || payload.data || {};
  const data = payload.data || {};
  const providerCardId = extractProviderCardId(payload);
  if (!providerCardId) return;
  const card = db.prepare('SELECT * FROM virtual_cards WHERE provider_card_id = ?').get(providerCardId);
  if (!card) return;

  if (eventIsOneOf(event, ['virtualcard.created.complete', 'virtualcard.created.success'])) {
    db.prepare(`
      UPDATE virtual_cards
      SET status = ?, masked_pan = ?, last_four = ?, balance = ?, meta = ?, updated_at = ?
      WHERE id = ?
    `).run(
      cardData.status || 'active',
      cardData.masked_pan || card.masked_pan,
      (cardData.masked_pan || '').slice(-4) || card.last_four,
      extractDisplayBalance(cardData, card.balance),
      JSON.stringify(payload),
      nowIso(),
      card.id
    );
    writeCardNotification(card, 'Virtual Card Ready', 'Your virtual card request has been approved and is ready to use.');
  }

  if (eventIsOneOf(event, ['virtualcard.topup.complete', 'virtualcard.topup.success', 'virtualcard.withdrawal.success'])) {
    const reference = payload.data?.reference || payload.reference || payload.data?.transaction?.reference || '';
    const request = reference
      ? db.prepare('SELECT * FROM card_funding_requests WHERE provider_reference = ?').get(reference)
      : null;
    const eventAmount = Number(request?.amount ?? extractEventAmount(data));
    const providerBalance = extractDisplayBalance(cardData, undefined);
    const signedAmount = event === 'virtualcard.withdrawal.success' ? -eventAmount : eventAmount;
    const nextBalance = providerBalance !== undefined && Number.isFinite(providerBalance)
      ? money(providerBalance)
      : money(Math.max(0, Number(card.balance || 0) + signedAmount));
    db.prepare('UPDATE virtual_cards SET balance = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(nextBalance, cardData.status || card.status || 'active', nowIso(), card.id);
    if (request) {
      db.prepare('UPDATE card_funding_requests SET status = ?, updated_at = ? WHERE id = ?')
        .run('completed', nowIso(), request.id);
    }
  }

  if (eventIsOneOf(event, ['virtualcard.topup.failed', 'virtualcard.withdrawal.failed'])) {
    const reference = payload.data?.reference || payload.reference || payload.data?.transaction?.reference || '';
    const request = reference
      ? db.prepare('SELECT * FROM card_funding_requests WHERE provider_reference = ?').get(reference)
      : null;
    if (request && request.status !== 'failed') {
      db.prepare('UPDATE card_funding_requests SET status = ?, failure_reason = ?, updated_at = ? WHERE id = ?')
        .run('failed', payload.data?.reason || payload.message || 'Card funding failed', nowIso(), request.id);
      creditWallet(request.user_id, Number(request.total_wallet_deduction), 'refund', `Card funding refund: ${card.card_nickname}`, `refund_${reference}`);
    }
  }

  if (event === 'virtualcard.created.failed') {
    db.prepare('UPDATE virtual_cards SET status = ?, meta = ?, updated_at = ? WHERE id = ?')
      .run('failed', JSON.stringify(payload), nowIso(), card.id);
    writeCardNotification(card, 'Card Request Failed', data.reason || data.failure_reason || 'Your virtual card request could not be completed. Contact support for help.');
  }

  if (eventIsOneOf(event, [
    'virtualcard.transaction.debit',
    'virtualcard.transaction.crossborder',
    'virtualcard.transaction.verification'
  ])) {
    const providerBalance = extractDisplayBalance(cardData, undefined);
    const amount = extractEventAmount(data);
    const nextBalance = providerBalance !== undefined && Number.isFinite(providerBalance)
      ? money(providerBalance)
      : money(Math.max(0, Number(card.balance || 0) - amount));
    db.prepare('UPDATE virtual_cards SET balance = ?, meta = ?, updated_at = ? WHERE id = ?')
      .run(nextBalance, JSON.stringify(payload), nowIso(), card.id);
  }

  if (eventIsOneOf(event, [
    'virtualcard.transaction.refund',
    'virtualcard.transaction.credit',
    'virtualcard.transaction.reversed',
    'virtualcard.transaction.terminated.refund'
  ])) {
    const providerBalance = extractDisplayBalance(cardData, undefined);
    const amount = extractEventAmount(data);
    const nextBalance = providerBalance !== undefined && Number.isFinite(providerBalance)
      ? money(providerBalance)
      : money(Number(card.balance || 0) + amount);
    db.prepare('UPDATE virtual_cards SET balance = ?, meta = ?, updated_at = ? WHERE id = ?')
      .run(nextBalance, JSON.stringify(payload), nowIso(), card.id);
  }

  if (eventIsOneOf(event, ['virtualcard.transaction.declined.frozen'])) {
    db.prepare('UPDATE virtual_cards SET status = ?, meta = ?, updated_at = ? WHERE id = ?')
      .run('frozen', JSON.stringify(payload), nowIso(), card.id);
    writeCardNotification(card, 'Card Frozen', data.reason || 'Your card was frozen by the provider after a declined transaction.');
  }

  if (eventIsOneOf(event, ['virtualcard.transaction.declined.terminated'])) {
    db.prepare('UPDATE virtual_cards SET status = ?, meta = ?, updated_at = ? WHERE id = ?')
      .run('terminated', JSON.stringify(payload), nowIso(), card.id);
    writeCardNotification(card, 'Card Terminated', data.reason || 'Your card was terminated by the provider after a declined transaction.');
  }
}
