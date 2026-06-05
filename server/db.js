import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { formatPersonName, generateId, nowIso } from './utils.js';

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
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  account_status TEXT NOT NULL DEFAULT 'active',
  restricted_reason TEXT,
  restricted_by TEXT,
  restricted_at TEXT,
  terms_accepted_version TEXT,
  two_factor_enabled INTEGER NOT NULL DEFAULT 0,
  two_factor_secret TEXT,
  two_factor_temp_secret TEXT,
  two_factor_recovery_codes TEXT,
  two_factor_enabled_at TEXT,
  username_changed_at TEXT,
  password_reset_token_hash TEXT,
  password_reset_expires_at TEXT,
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
  environment TEXT NOT NULL DEFAULT 'sandbox',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  legal_name TEXT,
  date_of_birth TEXT,
  gender TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  street_address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
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
  provider_card_id TEXT,
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
  card_pin_hash TEXT,
  card_pin_enabled_at TEXT,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  meta TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bitnob_customers (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  bitnob_customer_id TEXT NOT NULL,
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
  environment TEXT NOT NULL DEFAULT 'sandbox',
  provider TEXT NOT NULL DEFAULT 'bitnob',
  provider_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_currency TEXT,
  payment_network TEXT,
  payment_address TEXT,
  payment_amount REAL,
  tx_hash TEXT,
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
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_target_email TEXT,
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
  usd_to_etb_rate REAL NOT NULL DEFAULT 190,
  gateway_fee_percentage REAL NOT NULL DEFAULT 2.88,
  checkout_preview_fee_percentage REAL NOT NULL DEFAULT 2.5,
  deposit_fee_percentage REAL NOT NULL DEFAULT 0,
  deposit_fixed_fee_etb REAL NOT NULL DEFAULT 0,
  service_margin_percentage REAL NOT NULL DEFAULT 5,
  minimum_service_fee_etb REAL NOT NULL DEFAULT 0,
  maximum_service_fee_etb REAL NOT NULL DEFAULT 0,
  enable_minimum_fee INTEGER NOT NULL DEFAULT 0,
  show_gateway_fee_percentage INTEGER NOT NULL DEFAULT 1,
  total_amount_fee_percentage REAL NOT NULL DEFAULT 2.5,
  safety_buffer_percentage REAL NOT NULL DEFAULT 0,
  chapa_settlement_fee_etb REAL NOT NULL DEFAULT 0,
  card_creation_fee_usd REAL NOT NULL DEFAULT 1,
  bitnob_topup_fee_under_100_usd REAL NOT NULL DEFAULT 1,
  bitnob_topup_fee_percent_100_plus REAL NOT NULL DEFAULT 1,
  card_funding_fee_percentage REAL NOT NULL DEFAULT 0,
  card_withdrawal_fee_percentage REAL NOT NULL DEFAULT 1,
  rounding_rule_etb REAL NOT NULL DEFAULT 0,
  customer_fee_display_style TEXT NOT NULL DEFAULT 'simple',
  min_deposit_usd REAL NOT NULL DEFAULT 5,
  max_deposit_usd REAL NOT NULL DEFAULT 1000,
  daily_deposit_limit_usd REAL NOT NULL DEFAULT 2000,
  monthly_deposit_limit_usd REAL NOT NULL DEFAULT 10000,
  min_card_creation_usd REAL NOT NULL DEFAULT 3,
  min_card_funding_usd REAL NOT NULL DEFAULT 3,
  max_card_funding_usd REAL NOT NULL DEFAULT 500,
  max_cards_per_user INTEGER NOT NULL DEFAULT 3,
  kyc_level1_deposit_limit REAL NOT NULL DEFAULT 0,
  kyc_level2_deposit_limit REAL NOT NULL DEFAULT 0,
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
  environment TEXT,
  provider TEXT,
  provider_status TEXT,
  provider_response TEXT,
  ip_address TEXT,
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
ensureColumn('kyc_submissions', 'first_name', 'TEXT');
ensureColumn('kyc_submissions', 'last_name', 'TEXT');
ensureColumn('kyc_submissions', 'street_address', 'TEXT');
ensureColumn('kyc_submissions', 'city', 'TEXT');
ensureColumn('kyc_submissions', 'state', 'TEXT');
ensureColumn('kyc_submissions', 'postal_code', 'TEXT');
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
ensureColumn('virtual_cards', 'card_pin_hash', 'TEXT');
ensureColumn('virtual_cards', 'card_pin_enabled_at', 'TEXT');
ensureColumn('virtual_cards', 'environment', "TEXT NOT NULL DEFAULT 'sandbox'");
db.prepare("UPDATE virtual_cards SET environment = 'sandbox' WHERE environment IS NULL OR environment = ''").run();
db.prepare("UPDATE virtual_cards SET environment = LOWER(TRIM(environment)) WHERE environment IS NOT NULL").run();
db.prepare("UPDATE virtual_cards SET environment = 'live' WHERE environment IN ('prod', 'production')").run();
db.prepare("UPDATE virtual_cards SET environment = 'sandbox' WHERE environment IN ('test', 'testing')").run();
ensureColumn('wallet_transactions', 'environment', "TEXT NOT NULL DEFAULT 'sandbox'");
ensureColumn('bitnob_customers', 'environment', "TEXT NOT NULL DEFAULT 'sandbox'");
ensureColumn('bitnob_customers', 'provider', "TEXT NOT NULL DEFAULT 'bitnob'");
db.prepare("UPDATE bitnob_customers SET environment = 'sandbox' WHERE environment IS NULL OR environment = ''").run();
db.prepare("UPDATE bitnob_customers SET environment = LOWER(TRIM(environment)) WHERE environment IS NOT NULL").run();
db.prepare("UPDATE bitnob_customers SET environment = 'live' WHERE environment IN ('prod', 'production')").run();
db.prepare("UPDATE bitnob_customers SET environment = 'sandbox' WHERE environment IN ('test', 'testing')").run();
db.prepare("UPDATE bitnob_customers SET provider = 'bitnob' WHERE provider IS NULL OR provider = ''").run();
ensureColumn('fee_settings', 'gateway_fee_percentage', 'REAL NOT NULL DEFAULT 2.88');
ensureColumn('fee_settings', 'checkout_preview_fee_percentage', 'REAL NOT NULL DEFAULT 2.5');
ensureColumn('fee_settings', 'service_margin_percentage', 'REAL NOT NULL DEFAULT 5');
ensureColumn('fee_settings', 'minimum_service_fee_etb', 'REAL NOT NULL DEFAULT 0');
ensureColumn('fee_settings', 'maximum_service_fee_etb', 'REAL NOT NULL DEFAULT 0');
ensureColumn('fee_settings', 'enable_minimum_fee', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('fee_settings', 'show_gateway_fee_percentage', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('fee_settings', 'total_amount_fee_percentage', 'REAL NOT NULL DEFAULT 2.5');
ensureColumn('fee_settings', 'safety_buffer_percentage', 'REAL NOT NULL DEFAULT 0');
ensureColumn('fee_settings', 'chapa_settlement_fee_etb', 'REAL NOT NULL DEFAULT 0');
ensureColumn('fee_settings', 'bitnob_topup_fee_under_100_usd', 'REAL NOT NULL DEFAULT 1');
ensureColumn('fee_settings', 'bitnob_topup_fee_percent_100_plus', 'REAL NOT NULL DEFAULT 1');
ensureColumn('fee_settings', 'rounding_rule_etb', 'REAL NOT NULL DEFAULT 0');
ensureColumn('fee_settings', 'customer_fee_display_style', "TEXT NOT NULL DEFAULT 'simple'");
ensureColumn('fee_settings', 'min_card_creation_usd', 'REAL NOT NULL DEFAULT 3');
ensureColumn('fee_settings', 'min_card_funding_usd', 'REAL NOT NULL DEFAULT 3');
ensureColumn('audit_logs', 'environment', 'TEXT');
ensureColumn('audit_logs', 'provider', 'TEXT');
ensureColumn('audit_logs', 'provider_status', 'TEXT');
ensureColumn('audit_logs', 'provider_response', 'TEXT');
ensureColumn('audit_logs', 'ip_address', 'TEXT');

function migrateBitnobCustomersEnvironmentUniqueness() {
  const hasLegacyUniqueIndex = db
    .prepare("PRAGMA index_list('bitnob_customers')")
    .all()
    .some((row) => row.origin === 'u');

  if (!hasLegacyUniqueIndex) return;

  db.exec(`
    ALTER TABLE bitnob_customers RENAME TO bitnob_customers_legacy_unique;

    CREATE TABLE bitnob_customers (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      bitnob_customer_id TEXT NOT NULL,
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
      environment TEXT NOT NULL DEFAULT 'sandbox',
      provider TEXT NOT NULL DEFAULT 'bitnob',
      provider_payload TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO bitnob_customers (
      id, user_id, bitnob_customer_id, customer_type, first_name, last_name, email, phone_number, dial_code,
      date_of_birth, id_type, id_number, country, address, city, status, environment, provider, provider_payload, created_at, updated_at
    )
    SELECT
      id, user_id, bitnob_customer_id, customer_type, first_name, last_name, email, phone_number, dial_code,
      date_of_birth, id_type, id_number, country, address, city, status,
      COALESCE(NULLIF(environment, ''), 'sandbox'),
      COALESCE(NULLIF(provider, ''), 'bitnob'),
      provider_payload, created_at, updated_at
    FROM bitnob_customers_legacy_unique;

    DROP TABLE bitnob_customers_legacy_unique;
  `);
}

migrateBitnobCustomersEnvironmentUniqueness();
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_bitnob_customers_provider_env_id ON bitnob_customers(provider, environment, bitnob_customer_id);');

function migrateVirtualCardsEnvironmentUniqueness() {
  const hasLegacyUniqueIndex = db
    .prepare("PRAGMA index_list('virtual_cards')")
    .all()
    .some((row) => row.origin === 'u');

  if (!hasLegacyUniqueIndex) return;

  db.exec(`
    ALTER TABLE virtual_cards RENAME TO virtual_cards_legacy_unique;

    CREATE TABLE virtual_cards (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'bitnob',
      bitnob_customer_id TEXT,
      provider_card_id TEXT,
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
      card_pin_hash TEXT,
      card_pin_enabled_at TEXT,
      environment TEXT NOT NULL DEFAULT 'sandbox',
      meta TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO virtual_cards (
      id, user_id, provider, bitnob_customer_id, provider_card_id, customer_reference, card_nickname, card_type, brand, currency,
      last_four, expiry_month, expiry_year, balance, status, billing_address, masked_pan, card_pin_hash, card_pin_enabled_at,
      environment, meta, created_at, updated_at
    )
    SELECT
      id,
      user_id,
      COALESCE(NULLIF(provider, ''), 'bitnob'),
      bitnob_customer_id,
      provider_card_id,
      customer_reference,
      card_nickname,
      card_type,
      brand,
      currency,
      last_four,
      expiry_month,
      expiry_year,
      balance,
      status,
      billing_address,
      masked_pan,
      card_pin_hash,
      card_pin_enabled_at,
      COALESCE(NULLIF(environment, ''), 'sandbox'),
      meta,
      created_at,
      updated_at
    FROM virtual_cards_legacy_unique;

    DROP TABLE virtual_cards_legacy_unique;
  `);
}

migrateVirtualCardsEnvironmentUniqueness();
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_cards_provider_env_card_id ON virtual_cards(provider, environment, provider_card_id) WHERE provider_card_id IS NOT NULL AND provider_card_id != '';");

ensureColumn('deposits', 'provider_status', 'TEXT');
ensureColumn('deposits', 'provider_payload', 'TEXT');
ensureColumn('deposits', 'source', "TEXT NOT NULL DEFAULT 'dinkcard'");
ensureColumn('deposits', 'verified_at', 'TEXT');
ensureColumn('deposits', 'payment_currency', 'TEXT');
ensureColumn('deposits', 'payment_network', 'TEXT');
ensureColumn('deposits', 'payment_address', 'TEXT');
ensureColumn('deposits', 'payment_amount', 'REAL');
ensureColumn('deposits', 'tx_hash', 'TEXT');

db.prepare("UPDATE deposits SET source = 'dinkcard' WHERE source IS NULL OR source = ''").run();

ensureColumn('users', 'account_status', "TEXT NOT NULL DEFAULT 'active'");
ensureColumn('users', 'restricted_reason', 'TEXT');
ensureColumn('users', 'restricted_by', 'TEXT');
ensureColumn('users', 'restricted_at', 'TEXT');
ensureColumn('users', 'first_name', 'TEXT');
ensureColumn('users', 'last_name', 'TEXT');
ensureColumn('users', 'two_factor_enabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'two_factor_secret', 'TEXT');
ensureColumn('users', 'two_factor_temp_secret', 'TEXT');
ensureColumn('users', 'two_factor_recovery_codes', 'TEXT');
ensureColumn('users', 'two_factor_enabled_at', 'TEXT');
ensureColumn('users', 'username_changed_at', 'TEXT');
ensureColumn('users', 'password_reset_token_hash', 'TEXT');
ensureColumn('users', 'password_reset_expires_at', 'TEXT');
ensureColumn('support_tickets', 'contact_name', 'TEXT');
ensureColumn('support_tickets', 'contact_email', 'TEXT');
ensureColumn('support_tickets', 'contact_phone', 'TEXT');
ensureColumn('support_tickets', 'contact_target_email', 'TEXT');

db.prepare("UPDATE users SET account_status = 'active' WHERE account_status IS NULL OR account_status = ''").run();

function normalizeExistingPersonNames() {
  const userRows = db.prepare('SELECT id, first_name, last_name, full_name FROM users').all();
  const updateUser = db.prepare('UPDATE users SET first_name = ?, last_name = ?, full_name = ?, updated_at = ? WHERE id = ?');

  for (const row of userRows) {
    const firstName = formatPersonName(row.first_name);
    const lastName = formatPersonName(row.last_name);
    const fullName = firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(' ')
      : formatPersonName(row.full_name);

    if (firstName !== (row.first_name || '') || lastName !== (row.last_name || '') || fullName !== (row.full_name || '')) {
      updateUser.run(firstName || null, lastName || null, fullName || null, nowIso(), row.id);
    }
  }

  const kycRows = db.prepare('SELECT id, first_name, last_name, legal_name FROM kyc_submissions').all();
  const updateKyc = db.prepare('UPDATE kyc_submissions SET first_name = ?, last_name = ?, legal_name = ?, updated_at = ? WHERE id = ?');

  for (const row of kycRows) {
    const firstName = formatPersonName(row.first_name);
    const lastName = formatPersonName(row.last_name);
    const legalName = firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(' ')
      : formatPersonName(row.legal_name);

    if (firstName !== (row.first_name || '') || lastName !== (row.last_name || '') || legalName !== (row.legal_name || '')) {
      updateKyc.run(firstName || null, lastName || null, legalName || null, nowIso(), row.id);
    }
  }

  const customerRows = db.prepare('SELECT id, first_name, last_name FROM bitnob_customers').all();
  const updateCustomer = db.prepare('UPDATE bitnob_customers SET first_name = ?, last_name = ?, updated_at = ? WHERE id = ?');

  for (const row of customerRows) {
    const firstName = formatPersonName(row.first_name);
    const lastName = formatPersonName(row.last_name);

    if (firstName !== (row.first_name || '') || lastName !== (row.last_name || '')) {
      updateCustomer.run(firstName || null, lastName || null, nowIso(), row.id);
    }
  }
}

normalizeExistingPersonNames();

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
  SET usd_to_etb_rate = CASE
        WHEN usd_to_etb_rate IS NULL OR usd_to_etb_rate = 135 THEN 190
        ELSE usd_to_etb_rate
      END,
      deposit_fee_percentage = 0,
      deposit_fixed_fee_etb = 0,
      card_funding_fee_percentage = 0,
      card_creation_fee_usd = CASE
        WHEN card_creation_fee_usd IS NULL OR card_creation_fee_usd IN (3, 7) THEN 1
        ELSE card_creation_fee_usd
      END,
      gateway_fee_percentage = CASE
        WHEN gateway_fee_percentage IS NULL OR gateway_fee_percentage = 5.6 THEN 2.88
        ELSE gateway_fee_percentage
      END,
      checkout_preview_fee_percentage = COALESCE(checkout_preview_fee_percentage, 2.5),
      service_margin_percentage = COALESCE(service_margin_percentage, 5),
      minimum_service_fee_etb = 0,
      maximum_service_fee_etb = 0,
      enable_minimum_fee = 0,
      show_gateway_fee_percentage = COALESCE(show_gateway_fee_percentage, 1),
      total_amount_fee_percentage = CASE
        WHEN total_amount_fee_percentage IS NULL OR total_amount_fee_percentage = 0 THEN 2.5
        ELSE total_amount_fee_percentage
      END,
      safety_buffer_percentage = 0,
      chapa_settlement_fee_etb = COALESCE(chapa_settlement_fee_etb, 0),
      bitnob_topup_fee_under_100_usd = COALESCE(bitnob_topup_fee_under_100_usd, 1),
      bitnob_topup_fee_percent_100_plus = COALESCE(bitnob_topup_fee_percent_100_plus, 1),
      rounding_rule_etb = 0,
      min_card_creation_usd = 3,
      min_card_funding_usd = 3,
      max_cards_per_user = 3,
      customer_fee_display_style = 'simple',
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
      id, email, username, password_hash, first_name, last_name, full_name, phone, role, terms_accepted_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '', 'superadmin', ?, ?, ?)
  `).run(
    userId,
    config.superadmin.email,
    config.superadmin.username,
    hash,
    'Super',
    'Admin',
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
