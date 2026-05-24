import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const testDbPath = path.join(os.tmpdir(), `dinkcard-bitnob-${Date.now()}.db`);

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = testDbPath;
process.env.JWT_SECRET = 'test-jwt-secret-for-flow';
process.env.COOKIE_SECRET = 'test-cookie-secret-for-flow';
process.env.CARD_DATA_ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.BITNOB_CLIENT_ID = 'test-client';
process.env.BITNOB_CLIENT_SECRET = 'test-secret';
process.env.BITNOB_WEBHOOK_SECRET = 'test-webhook';
process.env.BITNOB_WEBHOOK_URL = 'https://example.com/api/webhooks/bitnob';
process.env.CHAPA_SECRET_KEY = 'CHASECK_TEST_local_verification';

const { db } = await import('../server/db.js');
const { createVirtualCardForUser, fundVirtualCard, handleBitnobWebhook } = await import('../server/bitnob.js');
const { getFeeSettings } = await import('../server/payments.js');
const { nowIso, hmacSha512Hex } = await import('../server/utils.js');

try {
  const now = nowIso();
  const user = {
    id: 'usr_test',
    email: 'test@example.com',
    full_name: 'Test User',
    phone: '+251911111111',
    role: 'user'
  };

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'user', ?, ?)
  `).run(user.id, user.email, 'x', user.full_name, user.phone, now, now);
  db.prepare(`
    INSERT INTO wallets (id, user_id, currency, available_balance, locked_balance, status, created_at, updated_at)
    VALUES (?, ?, 'USD', 100, 0, 'active', ?, ?)
  `).run('wal_test', user.email, now, now);
  db.prepare(`
    INSERT INTO kyc_submissions (
      id, user_id, legal_name, date_of_birth, phone, email, address, city, country,
      id_type, id_number, front_id_url, selfie_url, level, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, 'approved', ?, ?)
  `).run(
    'kyc_test',
    user.email,
    'Test User',
    '1995-01-01',
    user.phone,
    user.email,
    'Bole',
    'Addis Ababa',
    'ETH',
    'passport',
    'A1234567',
    '/uploads/a.jpg',
    '/uploads/b.jpg',
    now,
    now
  );

  let createBody;
  let fundBody;
  globalThis.fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.endsWith('/api/customers') && options.method === 'POST') {
      return new Response(JSON.stringify({
        success: true,
        data: {
          customer: {
            id: 'provider-customer-1',
            status: 'active',
            email: body.email
          }
        }
      }), { status: 200 });
    }
    if (url.endsWith('/api/cards') && options.method === 'POST') {
      createBody = body;
      return new Response(JSON.stringify({
        success: true,
        data: {
          card: {
            id: 'provider-card-1',
            status: 'pending',
            balance_amount: '2000000',
            display_amount: 20,
            last_four_digit: '4242',
            masked_pan: '428852******4242',
            card_brand: 'credit_card'
          }
        }
      }), { status: 200 });
    }
    if (url.endsWith('/api/cards/provider-card-1/balance') && options.method === 'POST') {
      fundBody = body;
      return new Response(JSON.stringify({
        success: true,
        data: { success: false, transaction: { status: 'pending', reference: body.reference } }
      }), { status: 200 });
    }
    throw new Error(`Unexpected fetch ${options.method} ${url}`);
  };

  await createVirtualCardForUser(user, { fundingAmount: 20 });
  const card = db.prepare('SELECT * FROM virtual_cards WHERE user_id = ?').get(user.email);
  const walletAfterCreate = db.prepare('SELECT available_balance FROM wallets WHERE user_id = ?').get(user.email).available_balance;

  if (createBody.amount !== 20000000) throw new Error(`Expected create amount 20000000, got ${createBody.amount}`);
  if (createBody.name !== 'Test User') throw new Error('Expected KYC legal name on card payload');
  if (createBody.customer_id !== 'provider-customer-1') throw new Error('Expected card payload to use linked Bitnob customer ID');
  if (createBody.contactless_payment !== true) throw new Error('Expected contactless payment to be enabled');
  if (walletAfterCreate !== 79) throw new Error(`Expected wallet 79, got ${walletAfterCreate}`);

  db.prepare("UPDATE virtual_cards SET status = 'active', balance = 20 WHERE id = ?").run(card.id);
  await fundVirtualCard(user, card.id, 5);
  const request = db.prepare('SELECT * FROM card_funding_requests WHERE card_id = ?').get(card.id);

  if (fundBody.amount !== 5000000) throw new Error(`Expected fund amount 5000000, got ${fundBody.amount}`);
  if (request.fee !== 1) throw new Error(`Expected top-up fee 1, got ${request.fee}`);
  if (request.total_wallet_deduction !== 6) throw new Error(`Expected funding deduction 6, got ${request.total_wallet_deduction}`);

  handleBitnobWebhook({
    event: 'virtualcard.topup.complete',
    data: { cardId: 'provider-card-1', amount: 5, status: 'success', reference: request.provider_reference }
  });
  let updated = db.prepare('SELECT * FROM virtual_cards WHERE id = ?').get(card.id);
  let completed = db.prepare('SELECT * FROM card_funding_requests WHERE id = ?').get(request.id);
  if (updated.balance !== 25) throw new Error(`Expected topup balance 25, got ${updated.balance}`);
  if (completed.status !== 'completed') throw new Error(`Expected funding completed, got ${completed.status}`);

  handleBitnobWebhook({ event: 'virtualcard.transaction.debit', data: { cardId: 'provider-card-1', amount: 2, reference: 'purchase-1' } });
  updated = db.prepare('SELECT * FROM virtual_cards WHERE id = ?').get(card.id);
  if (updated.balance !== 23) throw new Error(`Expected debit balance 23, got ${updated.balance}`);

  handleBitnobWebhook({ event: 'virtualcard.transaction.reversed', data: { cardId: 'provider-card-1', amount: 2, reference: 'reverse-1' } });
  updated = db.prepare('SELECT * FROM virtual_cards WHERE id = ?').get(card.id);
  if (updated.balance !== 25) throw new Error(`Expected reversal balance 25, got ${updated.balance}`);

  const raw = JSON.stringify({ event: 'virtualcard.topup.complete' });
  if (hmacSha512Hex('test-webhook', raw).length !== 128) throw new Error('Webhook HMAC length mismatch');
  if (!getFeeSettings()?.usd_to_etb_rate) throw new Error('Fee settings unavailable');

  console.log(JSON.stringify({
    ok: true,
    createAmount: createBody.amount,
    fundAmount: fundBody.amount,
    walletAfterCreate,
    finalCardBalance: updated.balance
  }));
} finally {
  db.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
}
