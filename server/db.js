import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { generateId, nowIso } from './utils.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

export const db = new DatabaseSync(config.databasePath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  account_status TEXT NOT NULL DEFAULT 'active',
  restricted_reason TEXT,
  restricted_by TEXT,
  restricted_at TEXT,
  terms_accepted_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'USD',
  available_balance REAL NOT NULL DEFAULT 0,
  locked_balance REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  balance_before REAL NOT NULL,
  balance_after REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  reference TEXT UNIQUE NOT NULL,
  description TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  legal_name TEXT,
  date_of_birth TEXT,
  gender TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  country TEXT DEFAULT 'Ethiopia',
  id_type TEXT,
  id_number TEXT,
  front_id_url TEXT,
  back_id_url TEXT,
  selfie_url TEXT,
  level INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_submitted',
  rejection_reason TEXT,
  resubmission_scope TEXT,
  resubmission_fields TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS virtual_cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'bitnob',
  bitnob_customer_id TEXT,
  provider_card_id TEXT UNIQUE,
  customer_reference TEXT,
  card_nickname TEXT NOT NULL,
  card_type TEXT NOT NULL DEFAULT 'general',
  brand TEXT NOT NULL DEFAULT 'visa',
  currency TEXT NOT NULL DEFAULT 'USD',
  last_four TEXT,
  expiry_month TEXT,
  expiry_year TEXT,
  balance REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  billing_address TEXT,
  masked_pan TEXT,
  meta TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bitnob_customers (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  bitnob_customer_id TEXT UNIQUE NOT NULL,
  customer_type TEXT NOT NULL DEFAULT 'individual',
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone_number TEXT,
  dial_code TEXT,
  date_of_birth TEXT,
  id_type TEXT,
  id_number TEXT,
  country TEXT,
  address TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  provider_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  requested_usd_amount REAL NOT NULL,
  exchange_rate REAL NOT NULL,
  etb_amount REAL NOT NULL,
  service_fee_etb REAL NOT NULL DEFAULT 0,
  gateway_fee_etb REAL NOT NULL DEFAULT 0,
  total_payable_etb REAL NOT NULL,
  final_usd_credit REAL NOT NULL,
  proof_url TEXT,
  sender_name TEXT,
  sender_phone TEXT,
  transaction_reference TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  rejection_reason TEXT,
  approved_by TEXT,
  approved_at TEXT,
  admin_note TEXT,
  promo_code TEXT,
  provider_reference TEXT,
  provider_status TEXT,
  provider_payload TEXT,
  source TEXT NOT NULL DEFAULT 'dinkcard',
  verified_at TEXT,
  checkout_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  link TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  screenshot_url TEXT,
  related_transaction_id TEXT,
  related_card_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  sender_id TEXT,
  message TEXT NOT NULL,
  attachment_url TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fee_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  usd_to_etb_rate REAL NOT NULL DEFAULT 135,
  deposit_fee_percentage REAL NOT NULL DEFAULT 0,
  deposit_fixed_fee_etb REAL NOT NULL DEFAULT 0,
  card_creation_fee_usd REAL NOT NULL DEFAULT 3,
  card_funding_fee_percentage REAL NOT NULL DEFAULT 0,
  card_withdrawal_fee_percentage REAL NOT NULL DEFAULT 1,
  min_deposit_usd REAL NOT NULL DEFAULT 5,
  max_deposit_usd REAL NOT NULL DEFAULT 1000,
  daily_deposit_limit_usd REAL NOT NULL DEFAULT 2000,
  monthly_deposit_limit_usd REAL NOT NULL DEFAULT 10000,
  min_card_funding_usd REAL NOT NULL DEFAULT 1,
  max_card_funding_usd REAL NOT NULL DEFAULT 500,
  max_cards_per_user INTEGER NOT NULL DEFAULT 3,
  kyc_level1_deposit_limit REAL NOT NULL DEFAULT 100,
  kyc_level2_deposit_limit REAL NOT NULL DEFAULT 1000,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS card_funding_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  amount REAL NOT NULL,
  fee REAL NOT NULL DEFAULT 0,
  total_wallet_deduction REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_reference TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  account_name TEXT,
  account_number TEXT,
  instructions TEXT,
  min_amount_etb REAL NOT NULL DEFAULT 100,
  max_amount_etb REAL NOT NULL DEFAULT 500000,
  fixed_fee_etb REAL NOT NULL DEFAULT 0,
  percentage_fee REAL NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  logo_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

db.exec(schema);

function ensureColumn(table, column, definition) {
  const exists = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => row.name === column);

  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

ensureColumn('kyc_submissions', 'legal_name', 'TEXT');
ensureColumn('kyc_submissions', 'date_of_birth', 'TEXT');
ensureColumn('kyc_submissions', 'gender', 'TEXT');
ensureColumn('kyc_submissions', 'phone', 'TEXT');
ensureColumn('kyc_submissions', 'email', 'TEXT');
ensureColumn('kyc_submissions', 'address', 'TEXT');
ensureColumn('kyc_submissions', 'city', 'TEXT');
ensureColumn('kyc_submissions', 'country', "TEXT DEFAULT 'Ethiopia'");
ensureColumn('kyc_submissions', 'id_type', 'TEXT');
ensureColumn('kyc_submissions', 'id_number', 'TEXT');
ensureColumn('kyc_submissions', 'front_id_url', 'TEXT');
ensureColumn('kyc_submissions', 'back_id_url', 'TEXT');
ensureColumn('kyc_submissions', 'selfie_url', 'TEXT');
ensureColumn('kyc_submissions', 'level', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('kyc_submissions', 'rejection_reason', 'TEXT');
ensureColumn('kyc_submissions', 'resubmission_scope', 'TEXT');
ensureColumn('kyc_submissions', 'resubmission_fields', 'TEXT');
ensureColumn('kyc_submissions', 'reviewed_by', 'TEXT');
ensureColumn('kyc_submissions', 'reviewed_at', 'TEXT');

ensureColumn('virtual_cards', 'bitnob_customer_id', 'TEXT');

ensureColumn('deposits', 'provider_status', 'TEXT');
ensureColumn('deposits', 'provider_payload', 'TEXT');
ensureColumn('deposits', 'source', "TEXT NOT NULL DEFAULT 'dinkcard'");
ensureColumn('deposits', 'verified_at', 'TEXT');

db.prepare("UPDATE deposits SET source = 'dinkcard' WHERE source IS NULL OR source = ''").run();

ensureColumn('users', 'account_status', "TEXT NOT NULL DEFAULT 'active'");
ensureColumn('users', 'restricted_reason', 'TEXT');
ensureColumn('users', 'restricted_by', 'TEXT');
ensureColumn('users', 'restricted_at', 'TEXT');

db.prepare("UPDATE users SET account_status = 'active' WHERE account_status IS NULL OR account_status = ''").run();

const now = nowIso();

const defaultSettings = db.prepare('SELECT id FROM fee_settings WHERE key = ?').get('default');

if (!defaultSettings) {
  db.prepare(`
    INSERT INTO fee_settings (
      id, key, created_at, updated_at
    ) VALUES (?, 'default', ?, ?)
  `).run(generateId('fee'), now, now);
}

db.prepare(`
  UPDATE fee_settings
  SET deposit_fee_percentage = 0,
      deposit_fixed_fee_etb = 0,
      card_funding_fee_percentage = 0,
      updated_at = ?
  WHERE key = 'default'
`).run(now);

const chapaMethod = db.prepare('SELECT id FROM payment_methods WHERE name = ?').get('chapa');

if (!chapaMethod) {
  db.prepare(`
    INSERT INTO payment_methods (
      id, name, type, instructions, min_amount_etb, max_amount_etb, created_at, updated_at
    ) VALUES (?, 'chapa', 'automatic', 'Secure hosted checkout.', 100, 500000, ?, ?)
  `).run(generateId('pm'), now, now);
}

db.prepare('UPDATE payment_methods SET instructions = ?, updated_at = ? WHERE name = ?')
  .run('Secure hosted checkout.', now, 'chapa');

const superadmin = db
  .prepare('SELECT id FROM users WHERE username = ?')
  .get(config.superadmin.username);

if (!superadmin) {
  const userId = generateId('usr');
  const hash = bcrypt.hashSync(config.superadmin.password, 12);

  db.prepare(`
    INSERT INTO users (
      id, email, username, password_hash, full_name, phone, role, terms_accepted_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, '', 'superadmin', ?, ?, ?)
  `).run(
    userId,
    config.superadmin.email,
    config.superadmin.username,
    hash,
    'Super Admin',
    config.termsVersion,
    now,
    now
  );

  db.prepare(`
    INSERT INTO wallets (
      id, user_id, currency, available_balance, locked_balance, status, created_at, updated_at
    ) VALUES (?, ?, 'USD', 0, 0, 'active', ?, ?)
  `).run(generateId('wal'), config.superadmin.email, now, now);
}

const superadminUser = db
  .prepare('SELECT id, email FROM users WHERE username = ?')
  .get(config.superadmin.username);

if (superadminUser) {
  const legacyWallet = db
    .prepare('SELECT id FROM wallets WHERE user_id = ?')
    .get(superadminUser.id);

  const emailWallet = db
    .prepare('SELECT id FROM wallets WHERE user_id = ?')
    .get(superadminUser.email);

  if (legacyWallet && !emailWallet) {
    db.prepare('UPDATE wallets SET user_id = ?, updated_at = ? WHERE id = ?')
      .run(superadminUser.email, nowIso(), legacyWallet.id);
  }
}

export function mapRow(row) {
  if (!row) return row;

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (key === 'created_at') return ['created_date', value];
      if (key === 'updated_at') return ['updated_date', value];
      if (key === 'read') return ['read', Boolean(value)];
      if (value === null) return [key, undefined];
      return [key, value];
    })
  );
}
