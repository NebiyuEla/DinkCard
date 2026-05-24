import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { config } from './config.js';
import { db, mapRow } from './db.js';
import { authMiddleware, clearSessionCookie, comparePassword, hashPassword, readSession, readTwoFactorChallenge, setSessionCookie, signTwoFactorChallenge } from './auth.js';
import { sanitizeUser, parseJson, generateId, money, nowIso } from './utils.js';
import { createEntity, queryEntities, updateEntity } from './entities.js';
import { approveDeposit, creditWallet, expirePendingChapaDeposits, getFeeSettings, initializeChapaPayment, finalizeChapaDeposit, setWalletBalance, verifyChapaWebhookSignature } from './payments.js';
import { buildTwoFactorRecoverySummary, formatSecretForDisplay, getOtpAuthUrl, getTwoFactorSetupForUser, isTwoFactorEnabled, readEncryptedTwoFactorSecret, replacementRecoveryState, verifyTotp, verifyTwoFactorCode } from './two-factor.js';
import {
  bitnobService,
  changeCardStatus,
  createVirtualCardForUser,
  fundVirtualCard,
  handleBitnobWebhook,
  revealCardDetails,
  terminateCard,
  toBitnobBaseUnits,
  fromBitnobBaseUnits,
  verifyBitnobWebhook
} from './bitnob.js';

fs.mkdirSync(config.uploadDir, { recursive: true });
const distDir = path.join(config.rootDir, 'dist');
const indexHtml = path.join(distDir, 'index.html');
const uploadLimitBytes = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
const allowedUploadTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf'
]);

const allowedUploadExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.pdf']);

function getClientIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req?.ip || '').split(',')[0].trim() || null;
}

function writeAudit({
  actor,
  userId,
  action,
  entityType,
  entityId,
  oldValue,
  newValue,
  reason,
  environment,
  provider,
  providerStatus,
  providerResponse,
  ipAddress,
  req
}) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (
        id, admin_id, user_id, action, entity_type, entity_id, old_value, new_value, reason,
        environment, provider, provider_status, provider_response, ip_address, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId('adt'),
      actor || 'system',
      userId || null,
      action,
      entityType || null,
      entityId || null,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      reason || null,
      environment || config.bitnob.env || null,
      provider || null,
      providerStatus || null,
      providerResponse ? JSON.stringify(providerResponse) : null,
      ipAddress || getClientIp(req),
      nowIso()
    );
  } catch (error) {
    console.error('Audit log failed:', error);
  }
}

function hasAnyAdminRole(user) {
  return ['admin', 'superadmin'].includes(user?.role);
}

function requireAdmin(req, res) {
  if (!hasAnyAdminRole(req.user)) {
    res.status(403).json({ message: 'Forbidden' });
    return false;
  }
  return true;
}

function getUploadExtension(file) {
  const originalExt = path.extname(file.originalname || '').toLowerCase();
  if (allowedUploadExtensions.has(originalExt)) return originalExt;
  if (file.mimetype === 'image/jpeg') return '.jpg';
  if (file.mimetype === 'image/png') return '.png';
  if (file.mimetype === 'image/webp') return '.webp';
  if (file.mimetype === 'image/gif') return '.gif';
  if (file.mimetype === 'image/heic') return '.heic';
  if (file.mimetype === 'image/heif') return '.heif';
  if (file.mimetype === 'application/pdf') return '.pdf';
  if (file.mimetype?.startsWith('image/')) return '.jpg';
  return '.upload';
}

const uploadStorage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (req, file, callback) => {
    const ownerId = String(req.user?.id || 'user').replace(/[^a-zA-Z0-9_-]/g, '');
    callback(null, `${ownerId}_${generateId('upl')}${getUploadExtension(file)}`);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: uploadLimitBytes },
  fileFilter: (req, file, callback) => {
    const originalExt = path.extname(file.originalname || '').toLowerCase();
    if (allowedUploadTypes.has(file.mimetype) || file.mimetype?.startsWith('image/') || allowedUploadExtensions.has(originalExt) || file.mimetype === 'application/octet-stream') {
      return callback(null, true);
    }
    return callback(new Error('Upload failed. Please try another file.'));
  }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  message: { message: 'Too many upload attempts. Please wait a few minutes and try again.' }
});

function readUploadSignature(file) {
  if (!file?.path) return { valid: false };
  const header = fs.readFileSync(file.path).subarray(0, 4096);
  const ascii = header.toString('ascii');
  const hex = header.toString('hex');

  if (hex.startsWith('ffd8ff')) return { valid: true, ext: '.jpg' };
  if (hex.startsWith('89504e47')) return { valid: true, ext: '.png' };
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return { valid: true, ext: '.gif' };
  if (ascii.startsWith('%PDF')) return { valid: true, ext: '.pdf' };
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return { valid: true, ext: '.webp' };

  if (ascii.includes('ftypheic') || ascii.includes('ftypheif') || ascii.includes('ftypmif1') || ascii.includes('ftypmsf1')) {
    return { valid: true, ext: '.heic' };
  }

  if (file.mimetype?.startsWith('image/') && file.size > 0) return { valid: true, ext: getUploadExtension(file) || '.jpg' };
  return { valid: false };
}

function normalizeUploadedFile(file, signature) {
  const currentExt = path.extname(file.path).toLowerCase();
  const nextExt = signature.ext || currentExt;

  if (!nextExt || currentExt === nextExt) return file;

  const nextPath = file.path.replace(/\.[^.\\/]+$/, '') + nextExt;

  if (!path.resolve(nextPath).startsWith(config.uploadDir)) return file;

  fs.renameSync(file.path, nextPath);
  file.path = nextPath;
  file.filename = path.basename(nextPath);
  return file;
}

function removeUploadedFile(file) {
  if (!file?.path) return;
  try {
    const resolved = path.resolve(file.path);
    if (resolved.startsWith(config.uploadDir)) fs.unlinkSync(resolved);
  } catch {}
}

function getUploadFilename(req) {
  const filename = path.basename(String(req.params.filename || ''));
  if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif|heic|heif|pdf)$/i.test(filename)) return null;
  return filename;
}

function uploadUrlFor(filename) {
  return `/uploads/${filename}`;
}

function serveIndex(req, res) {
  if (!fs.existsSync(indexHtml)) {
    return res.status(200).send('Dink Card API is running. Open the frontend on http://localhost:5173');
  }

  const html = fs.readFileSync(indexHtml, 'utf8')
    .replace('<script type="module" crossorigin ', '<script defer ')
    .replace('<link rel="stylesheet" crossorigin ', '<link rel="stylesheet" ');

  return res.type('html').send(html);
}

function canAccessUpload(req, filename) {
  if (hasAnyAdminRole(req.user)) return true;
  if (filename.startsWith(`${req.user.id}_`)) return true;

  const url = uploadUrlFor(filename);
  const email = req.user.email;

  const kyc = db.prepare(`
    SELECT id FROM kyc_submissions
    WHERE user_id = ? AND (front_id_url = ? OR back_id_url = ? OR selfie_url = ?)
    LIMIT 1
  `).get(email, url, url, url);

  if (kyc) return true;

  const deposit = db.prepare('SELECT id FROM deposits WHERE user_id = ? AND proof_url = ? LIMIT 1').get(email, url);
  if (deposit) return true;

  const ticket = db.prepare('SELECT id FROM support_tickets WHERE user_id = ? AND screenshot_url = ? LIMIT 1').get(email, url);
  if (ticket) return true;

  const message = db.prepare(`
    SELECT sm.id FROM support_messages sm
    JOIN support_tickets st ON st.id = sm.ticket_id
    WHERE st.user_id = ? AND sm.attachment_url = ?
    LIMIT 1
  `).get(email, url);

  return Boolean(message);
}

function isSuperadmin(user) {
  return user?.role === 'superadmin';
}

function requireSuperadmin(req, res) {
  if (!isSuperadmin(req.user)) {
    res.status(403).json({ message: 'Superadmin access required.' });
    return false;
  }
  return true;
}

function serializeTwoFactorUser(user) {
  return {
    ...sanitizeUser(user),
    ...buildTwoFactorRecoverySummary(user)
  };
}

function collectUserUploadUrls(userEmail) {
  const urls = new Set();

  for (const row of db.prepare('SELECT front_id_url, back_id_url, selfie_url FROM kyc_submissions WHERE user_id = ?').all(userEmail)) {
    [row.front_id_url, row.back_id_url, row.selfie_url].forEach((url) => url && urls.add(url));
  }

  for (const row of db.prepare('SELECT proof_url FROM deposits WHERE user_id = ?').all(userEmail)) {
    if (row.proof_url) urls.add(row.proof_url);
  }

  for (const row of db.prepare('SELECT id, screenshot_url FROM support_tickets WHERE user_id = ?').all(userEmail)) {
    if (row.screenshot_url) urls.add(row.screenshot_url);

    for (const message of db.prepare('SELECT attachment_url FROM support_messages WHERE ticket_id = ?').all(row.id)) {
      if (message.attachment_url) urls.add(message.attachment_url);
    }
  }

  return [...urls];
}

function removeUploadUrl(url) {
  if (!url) return;

  try {
    const pathname = url.startsWith('http') ? new URL(url).pathname : url;
    const filename = path.basename(pathname);

    if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif|heic|heif|pdf)$/i.test(filename)) return;

    const filePath = path.resolve(config.uploadDir, filename);

    if (filePath.startsWith(config.uploadDir) && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {}
}

function deleteUserCascade(user) {
  const ids = [user.email];
  const ticketIds = db.prepare('SELECT id FROM support_tickets WHERE user_id = ?').all(user.email).map((row) => row.id);

  db.exec('BEGIN IMMEDIATE');

  try {
    if (ticketIds.length) {
      db.prepare(`DELETE FROM support_messages WHERE ticket_id IN (${ticketIds.map(() => '?').join(',')})`).run(...ticketIds);
    }

    for (const table of ['wallet_transactions', 'wallets', 'kyc_submissions', 'deposits', 'notifications', 'support_tickets', 'virtual_cards', 'card_funding_requests']) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(...ids);
    }

    db.prepare('DELETE FROM audit_logs WHERE user_id = ? OR admin_id = ?').run(user.email, user.email);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function isPrivateDevOrigin(origin) {
  if (process.env.NODE_ENV === 'production') return false;

  try {
    const hostname = new URL(origin).hostname;

    return hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  } catch {
    return false;
  }
}

function ensureWallet(userEmail) {
  const existing = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userEmail);
  if (existing) return existing;

  const now = nowIso();
  const walletId = generateId('wal');

  db.prepare(`
    INSERT INTO wallets (id, user_id, currency, available_balance, locked_balance, status, created_at, updated_at)
    VALUES (?, ?, 'USD', 0, 0, 'active', ?, ?)
  `).run(walletId, userEmail, now, now);

  return db.prepare('SELECT * FROM wallets WHERE id = ?').get(walletId);
}

function extractProviderData(payload) {
  return payload?.data?.card || payload?.data?.customer || payload?.data || payload?.card || payload?.customer || payload || {};
}

function normalizeProviderList(payload) {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.cards)) return data.cards;
  if (Array.isArray(data?.customers)) return data.customers;
  if (Array.isArray(data?.transactions)) return data.transactions;
  if (Array.isArray(payload?.cards)) return payload.cards;
  if (Array.isArray(payload?.customers)) return payload.customers;
  if (Array.isArray(payload?.transactions)) return payload.transactions;
  return [];
}

const ASSET_AMOUNT_SCALES = {
  USDC: 1_000_000,
  USDT: 1_000_000,
  BTC: 100_000_000
};

function normalizeAssetBalanceAmount(amount, asset, row = {}) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return null;

  const raw = String(amount ?? '');
  if (raw.includes('.')) return numeric;

  const explicitDecimals = Number(row.decimals ?? row.asset?.decimals ?? row.currency?.decimals);
  if (Number.isInteger(explicitDecimals) && explicitDecimals > 0 && explicitDecimals <= 18 && Math.abs(numeric) >= 1000) {
    return numeric / (10 ** explicitDecimals);
  }

  const target = String(asset || '').toUpperCase();
  const scale = ASSET_AMOUNT_SCALES[target];
  const threshold = target === 'BTC' ? 10_000 : 100_000;
  if (scale && Number.isInteger(numeric) && Math.abs(numeric) >= threshold) {
    return numeric / scale;
  }

  return numeric;
}

function findAssetBalance(payload, asset = 'USDC') {
  const target = String(asset).toUpperCase();
  const found = [];

  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const symbolValue = value.asset?.symbol || value.asset?.code || value.currency?.symbol || value.currency?.code ||
      value.asset || value.currency || value.symbol || value.code || value.name || value.ticker || value.asset_code || '';
    const symbol = String(symbolValue).toUpperCase();
    if (symbol === target) {
      const amount = value.available ?? value.available_balance ?? value.availableBalance ??
        value.spendable ?? value.balance ?? value.amount ?? value.value ?? value.total;
      const numeric = normalizeAssetBalanceAmount(amount, target, value);
      if (Number.isFinite(numeric)) found.push(numeric);
    }

    Object.values(value).forEach(visit);
  }

  visit(payload);
  return found.length ? Math.max(...found) : 0;
}

function buildBitnobCustomerPayload(payload = {}) {
  const { phoneNumber, dialCode } = normalizeBitnobPhone(payload.phone || payload.phone_number);
  return compactPayload({
    customer_type: payload.customer_type || 'individual',
    first_name: payload.first_name,
    last_name: payload.last_name,
    date_of_birth: payload.date_of_birth,
    id_type: payload.id_type,
    id_number: payload.id_number,
    email: payload.email,
    phone_number: phoneNumber,
    dial_code: dialCode,
    country: payload.country || 'ETH',
    country_code: payload.country_code || payload.country || 'ETH',
    address: payload.address,
    city: payload.city
  });
}

function compactPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload || {}).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
  );
}

function normalizeBitnobPhone(phoneValue) {
  let digits = String(phoneValue || '').trim().replace(/\D/g, '');
  if (digits.startsWith('00251')) digits = digits.slice(5);
  if (digits.startsWith('251')) digits = digits.slice(3);
  digits = digits.replace(/^0+/, '');
  if (digits.length > 9 && digits.startsWith('9')) digits = digits.slice(0, 9);
  return { phoneNumber: digits || undefined, dialCode: '+251' };
}

function saveBitnobCustomer({ payload = {}, providerResponse, providerCustomer, userId }) {
  const customer = providerCustomer || extractProviderData(providerResponse);
  const bitnobCustomerId = customer.id || customer.customer_id || customer.customerId || payload.bitnob_customer_id;
  if (!bitnobCustomerId) throw new Error('Provider did not return a customer ID.');

  const environment = config.bitnob.env;
  const now = nowIso();
  const existing = db
    .prepare('SELECT id FROM bitnob_customers WHERE bitnob_customer_id = ? AND environment = ?')
    .get(bitnobCustomerId, environment);
  const normalizedPhone = normalizeBitnobPhone(
    payload.phone_number || payload.phone || customer.phone_number || customer.phoneNumber || customer.phone || ''
  );
  const savedPayload = {
    user_id: userId || payload.user_id || payload.email || customer.email,
    customer_type: payload.customer_type || customer.customer_type || customer.type || 'individual',
    first_name: payload.first_name || customer.first_name || customer.firstName || '',
    last_name: payload.last_name || customer.last_name || customer.lastName || '',
    email: payload.email || customer.email || '',
    phone_number: normalizedPhone.phoneNumber || '',
    dial_code: normalizedPhone.dialCode,
    date_of_birth: payload.date_of_birth || customer.date_of_birth || customer.dateOfBirth || '',
    id_type: payload.id_type || customer.id_type || customer.idType || '',
    id_number: payload.id_number || customer.id_number || customer.idNumber || '',
    country: payload.country || customer.country || 'ETH',
    address: payload.address || payload.line1 || customer.line1 || customer.address || '',
    city: payload.city || customer.city || '',
    status: customer.status || payload.status || 'active'
  };

  if (existing) {
    db.prepare(`
      UPDATE bitnob_customers
      SET user_id = ?, customer_type = ?, first_name = ?, last_name = ?, email = ?, phone_number = ?, dial_code = ?,
          date_of_birth = ?, id_type = ?, id_number = ?, country = ?, address = ?, city = ?, status = ?,
          environment = ?, provider = 'bitnob', provider_payload = ?, updated_at = ?
      WHERE id = ?
    `).run(
      savedPayload.user_id,
      savedPayload.customer_type,
      savedPayload.first_name,
      savedPayload.last_name,
      savedPayload.email,
      savedPayload.phone_number,
      savedPayload.dial_code,
      savedPayload.date_of_birth,
      savedPayload.id_type,
      savedPayload.id_number,
      savedPayload.country,
      savedPayload.address,
      savedPayload.city,
      savedPayload.status,
      environment,
      JSON.stringify(providerResponse || customer),
      now,
      existing.id
    );
    return mapRow(db.prepare('SELECT * FROM bitnob_customers WHERE id = ?').get(existing.id));
  }

  const id = generateId('cus');
  db.prepare(`
    INSERT INTO bitnob_customers (
      id, user_id, bitnob_customer_id, customer_type, first_name, last_name, email, phone_number, dial_code,
      date_of_birth, id_type, id_number, country, address, city, status, environment, provider, provider_payload, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bitnob', ?, ?, ?)
  `).run(
    id,
    savedPayload.user_id,
    bitnobCustomerId,
    savedPayload.customer_type,
    savedPayload.first_name,
    savedPayload.last_name,
    savedPayload.email,
    savedPayload.phone_number,
    savedPayload.dial_code,
    savedPayload.date_of_birth,
    savedPayload.id_type,
    savedPayload.id_number,
    savedPayload.country,
    savedPayload.address,
    savedPayload.city,
    savedPayload.status,
    environment,
    JSON.stringify(providerResponse || customer),
    now,
    now
  );
  return mapRow(db.prepare('SELECT * FROM bitnob_customers WHERE id = ?').get(id));
}

function normalizeCountryCode(country) {
  const value = String(country || '').trim().toUpperCase();
  const known = {
    ETHIOPIA: 'ETH',
    ETH: 'ETH',
    ET: 'ETH',
    USA: 'USA',
    US: 'USA',
    'UNITED STATES': 'USA',
    'UNITED STATES OF AMERICA': 'USA'
  };
  return known[value] || value || 'ETH';
}

function dialCodeForCountry(country) {
  return '+251';
}

function kycToBitnobCustomerPayload(kyc, user) {
  const legalName = String(kyc?.legal_name || user?.full_name || '').trim();
  const [firstName, ...lastNameParts] = legalName.split(/\s+/).filter(Boolean);
  const payload = {
    customer_type: 'individual',
    first_name: kyc?.first_name || firstName || '',
    last_name: kyc?.last_name || lastNameParts.join(' ') || firstName || '',
    date_of_birth: kyc?.date_of_birth || '',
    id_type: kyc?.id_type || '',
    id_number: kyc?.id_number || '',
    email: kyc?.email || user?.email || kyc?.user_id || '',
    phone_number: kyc?.phone || user?.phone || '',
    dial_code: dialCodeForCountry(kyc?.country),
    country: normalizeCountryCode(kyc?.country),
    address: kyc?.address || '',
    city: kyc?.city || 'Addis Ababa'
  };
  const required = ['first_name', 'last_name', 'date_of_birth', 'id_type', 'id_number', 'email', 'country'];
  const missing = required.filter((field) => !String(payload[field] || '').trim());
  if (missing.length) {
    throw new Error(`Cannot create Bitnob customer because KYC is missing: ${missing.join(', ')}.`);
  }
  return payload;
}

async function ensureBitnobCustomerForKyc({ kyc, user, actor, reason, req }) {
  const environment = config.bitnob.env;
  const email = kyc?.email || user?.email || kyc?.user_id;
  const existing = db.prepare(`
    SELECT * FROM bitnob_customers
    WHERE environment = ? AND (user_id = ? OR email = ?)
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).get(environment, kyc.user_id, email);

  if (existing?.bitnob_customer_id) return mapRow(existing);

  const payload = kycToBitnobCustomerPayload(kyc, user);
  writeAudit({
    actor,
    userId: kyc.user_id,
    action: 'kyc_bitnob_customer_create_attempted',
    entityType: 'bitnob_customer',
    entityId: kyc.id,
    environment,
    provider: 'bitnob',
    newValue: { email: payload.email },
    reason,
    req
  });

  const provider = await bitnobService.createCustomer(buildBitnobCustomerPayload(payload));
  const saved = saveBitnobCustomer({ payload: { ...payload, user_id: kyc.user_id }, providerResponse: provider, userId: kyc.user_id });
  writeAudit({
    actor,
    userId: kyc.user_id,
    action: 'kyc_bitnob_customer_created',
    entityType: 'bitnob_customer',
    entityId: saved.id,
    environment,
    provider: 'bitnob',
    providerStatus: provider?.status || provider?.message || 'success',
    providerResponse: provider,
    newValue: saved,
    reason,
    req
  });
  return saved;
}

function providerCardToDb({ card, customer, fallbackUserId, nickname, providerPayload }) {
  const now = nowIso();
  const providerCardId = card.id || card.card_id || card.cardId;
  if (!providerCardId) throw new Error('Card provider did not return a card ID.');

  const customerId = card.customer_id || card.customerId || customer?.bitnob_customer_id || customer?.id || '';
  const maskedPan = card.masked_pan || card.maskedPan || card.masked || '';
  const lastFour = card.last_four_digit || card.last_four || card.last4 || maskedPan.replace(/\D/g, '').slice(-4) || '';
  const balance = card.display_amount !== undefined
    ? Number(card.display_amount)
    : card.balance_amount !== undefined
      ? fromBitnobBaseUnits(card.balance_amount)
      : Number(card.balance || 0);

  const existing = db.prepare('SELECT id FROM virtual_cards WHERE provider_card_id = ?').get(providerCardId);

  if (existing) {
    db.prepare(`
      UPDATE virtual_cards
      SET bitnob_customer_id = ?,
          customer_reference = ?,
          card_nickname = ?,
          card_type = ?,
          brand = ?,
          last_four = ?,
          expiry_month = ?,
          expiry_year = ?,
          balance = ?,
          status = ?,
          billing_address = ?,
          masked_pan = ?,
          environment = ?,
          meta = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      customerId,
      customerId,
      nickname || card.name || 'Virtual Card',
      card.card_type || 'virtual',
      card.card_brand || card.brand || 'visa',
      lastFour,
      card.expiry_month || '',
      card.expiry_year || '',
      money(balance),
      card.status || 'pending',
      JSON.stringify(card.billing_address || {}),
      maskedPan,
      config.bitnob.env,
      JSON.stringify(providerPayload || card),
      now,
      existing.id
    );
    return mapRow(db.prepare('SELECT * FROM virtual_cards WHERE id = ?').get(existing.id));
  }

  const id = generateId('crd');
  db.prepare(`
    INSERT INTO virtual_cards (
      id, user_id, provider, bitnob_customer_id, provider_card_id, customer_reference, card_nickname, card_type, brand, currency,
      last_four, expiry_month, expiry_year, balance, status, billing_address, masked_pan, environment, meta, created_at, updated_at
    ) VALUES (?, ?, 'bitnob', ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    customer?.user_id || fallbackUserId || customer?.email || '',
    customerId,
    providerCardId,
    customerId,
    nickname || card.name || 'Virtual Card',
    card.card_type || 'virtual',
    card.card_brand || card.brand || 'visa',
    lastFour,
    card.expiry_month || '',
    card.expiry_year || '',
    money(balance),
    card.status || 'pending',
    JSON.stringify(card.billing_address || {}),
    maskedPan,
    config.bitnob.env,
    JSON.stringify(providerPayload || card),
    now,
    now
  );
  return mapRow(db.prepare('SELECT * FROM virtual_cards WHERE id = ?').get(id));
}

function addOrigin(allowedOrigins, origin) {
  if (!origin) return;

  try {
    allowedOrigins.add(new URL(origin).origin);
  } catch {}
}

function buildAllowedOrigins() {
  const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ]);

  [
    config.appUrl,
    config.apiUrl,
    process.env.RENDER_EXTERNAL_URL,
    process.env.PUBLIC_APP_URL,
    process.env.PUBLIC_RENDER_URL,
    'https://dinkcard-imfs.onrender.com'
  ].forEach((origin) => addOrigin(allowedOrigins, origin));

  return allowedOrigins;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function invoiceHtml(deposit) {
  const status = String(deposit.status || '').replace(/_/g, ' ');
  const serviceProcessingFee = Number(deposit.service_fee_etb || 0) || Math.max(0, Number(deposit.total_payable_etb || 0) - Number(deposit.etb_amount || 0));
  const rows = [
    ['Payment reference', deposit.transaction_reference],
    ['Order status', status],
    ['Card amount', `$${Number(deposit.requested_usd_amount || 0).toFixed(2)}`],
    ['Exchange rate', `1 USD = ${Number(deposit.exchange_rate || 0).toFixed(2)} ETB`],
    ['Service & processing fee', `${serviceProcessingFee.toLocaleString()} ETB`],
    ['Total paid', `${Number(deposit.total_payable_etb || 0).toLocaleString()} ETB`],
    ['Created', deposit.created_at]
  ];

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Dink Card Invoice ${escapeHtml(deposit.transaction_reference)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 0; padding: 32px; background: #f8fafc; }
    .invoice { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 28px; }
    .brand { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 18px; margin-bottom: 18px; }
    h1 { margin: 0; font-size: 28px; }
    .status { text-transform: capitalize; color: #047857; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    td { border-bottom: 1px solid #f1f5f9; padding: 11px 0; font-size: 14px; }
    td:first-child { color: #64748b; }
    td:last-child { text-align: right; font-weight: 600; }
    .note { margin-top: 22px; padding: 14px; border-radius: 12px; background: #ecfdf5; color: #065f46; font-size: 13px; line-height: 1.5; }
  </style>
</head>
<body>
  <section class="invoice">
    <div class="brand">
      <div>
        <h1>Dink Card Invoice</h1>
        <p>Card-related service funding receipt</p>
      </div>
      <div>
        <p class="status">${escapeHtml(status)}</p>
        <p>${escapeHtml(deposit.created_at)}</p>
      </div>
    </div>
    <table>
      <tbody>
        ${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="note">
      Dink Card is not a bank or financial institution. Card issuance, payment processing, merchant acceptance, refunds, and transaction rules may depend on authorized third-party providers and merchants.
    </div>
  </section>
</body>
</html>`;
}

function canReadDepositInvoice(user, deposit) {
  return hasAnyAdminRole(user) || deposit.user_id === user.email;
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  }));

  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser(config.cookieSecret));

  const allowedOrigins = buildAllowedOrigins();

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin) || isPrivateDevOrigin(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  }));

  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || req.path.startsWith('/api/webhooks')) {
      return next();
    }

    const origin = req.get('origin');

    if (!origin) return next();

    try {
      if (allowedOrigins.has(new URL(origin).origin)) return next();
    } catch {}

    if (isPrivateDevOrigin(origin)) return next();

    return res.status(403).json({ message: 'Invalid request origin.' });
  });

  app.use(helmet({
    crossOriginResourcePolicy: false,
    hsts: process.env.NODE_ENV === 'production'
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false
  }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 240 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please wait a moment and try again.' }
  });

  app.use('/api', apiLimiter);

  app.get('/uploads/:filename', authMiddleware(db), (req, res) => {
    const filename = getUploadFilename(req);

    if (!filename) return res.status(404).json({ message: 'File not found' });
    if (!canAccessUpload(req, filename)) return res.status(403).json({ message: 'Forbidden' });

    const filePath = path.resolve(config.uploadDir, filename);

    if (!filePath.startsWith(config.uploadDir) || !fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');

    return res.sendFile(filePath);
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/', (req, res) => {
    return serveIndex(req, res);
  });

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const { fullName, email, phone, password, acceptedTerms } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email, and password are required.' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    if (!acceptedTerms) {
      return res.status(400).json({ message: 'You must agree to the Terms & Conditions before using the platform.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);

    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const now = nowIso();
    const userId = generateId('usr');
    const passwordHash = await hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role, terms_accepted_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?)
    `).run(userId, normalizedEmail, passwordHash, fullName, phone || '', config.termsVersion, now, now);

    db.prepare(`
      INSERT INTO wallets (id, user_id, currency, available_balance, locked_balance, status, created_at, updated_at)
      VALUES (?, ?, 'USD', 0, 0, 'active', ?, ?)
    `).run(generateId('wal'), normalizedEmail, now, now);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    setSessionCookie(res, user);

    res.status(201).json({ user: serializeTwoFactorUser(user) });
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { identifier, email, username, password, portal } = req.body;
    const normalized = String(identifier || email || username || '').trim().toLowerCase();

    if (!normalized || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = db.prepare("SELECT * FROM users WHERE lower(email) = ? OR lower(ifnull(username, '')) = ?").get(normalized, normalized);

    if (!user) {
      writeAudit({ actor: 'system:auth', userId: normalized, action: 'login_failed', entityType: 'auth', reason: 'unknown_account' });
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    if (portal === 'superadmin' && user.role !== 'superadmin') {
      writeAudit({ actor: user.email, userId: user.email, action: 'login_failed', entityType: 'auth', reason: 'superadmin_access_required' });
      return res.status(403).json({ message: 'Superadmin access required.' });
    }

    if ((user.account_status || 'active') !== 'active') {
      writeAudit({ actor: user.email, userId: user.email, action: 'login_failed', entityType: 'auth', reason: user.account_status || 'restricted' });
      return res.status(403).json({ message: 'This account is restricted. Contact support for help.' });
    }

    const valid = await comparePassword(password || '', user.password_hash);

    if (!valid) {
      writeAudit({ actor: user.email, userId: user.email, action: 'login_failed', entityType: 'auth', reason: 'invalid_password' });
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    if (isTwoFactorEnabled(user)) {
      writeAudit({
        actor: user.email,
        userId: user.email,
        action: 'login_password_verified',
        entityType: 'auth',
        newValue: { role: user.role, portal: portal || 'user', second_factor_required: true }
      });
      return res.json({
        requiresTwoFactor: true,
        challengeToken: signTwoFactorChallenge(user, portal || 'user')
      });
    }

    setSessionCookie(res, user);

    writeAudit({ actor: user.email, userId: user.email, action: 'login', entityType: 'auth', newValue: { role: user.role, portal: portal || 'user' } });

    res.json({ user: serializeTwoFactorUser(user) });
  });

  app.post('/api/auth/login/2fa', authLimiter, async (req, res) => {
    const challenge = readTwoFactorChallenge(req.body.challengeToken);
    const code = String(req.body.code || '').trim();

    if (!challenge) {
      return res.status(401).json({ message: 'Your login session expired. Please sign in again.' });
    }

    if (!code) {
      return res.status(400).json({ message: 'Enter your authentication code.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(challenge.sub);

    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if ((user.account_status || 'active') !== 'active') {
      writeAudit({ actor: user.email, userId: user.email, action: 'login_failed', entityType: 'auth', reason: user.account_status || 'restricted' });
      return res.status(403).json({ message: 'This account is restricted. Contact support for help.' });
    }

    const verification = verifyTwoFactorCode(user, code);

    if (!verification.valid) {
      writeAudit({ actor: user.email, userId: user.email, action: 'login_failed', entityType: 'auth', reason: 'invalid_two_factor_code' });
      return res.status(401).json({ message: 'Invalid authentication code.' });
    }

    if (verification.method === 'recovery') {
      db.prepare('UPDATE users SET two_factor_recovery_codes = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(verification.nextRecoveryHashes || []), nowIso(), user.id);
    }

    setSessionCookie(res, user);

    writeAudit({
      actor: user.email,
      userId: user.email,
      action: 'login',
      entityType: 'auth',
      newValue: { role: user.role, portal: challenge.portal || 'user', second_factor: verification.method }
    });

    res.json({ user: serializeTwoFactorUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const session = readSession(req);

    if (!session) return res.status(401).json({ message: 'Authentication required' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.sub);

    if (!user) return res.status(401).json({ message: 'Authentication required' });

    if ((user.account_status || 'active') !== 'active') {
      clearSessionCookie(res);
      return res.status(403).json({ message: 'This account is restricted. Contact support for help.' });
    }

    return res.json(serializeTwoFactorUser(user));
  });

  app.patch('/api/auth/me', authMiddleware(db), (req, res) => {
    const updates = [];
    const values = [];

    if (req.body.terms_accepted_version) {
      updates.push('terms_accepted_version = ?');
      values.push(req.body.terms_accepted_version);
    }

    if (!updates.length) return res.status(400).json({ message: 'No supported fields to update.' });

    updates.push('updated_at = ?');
    values.push(nowIso());

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values, req.user.id);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    res.json(serializeTwoFactorUser(user));
  });

  app.get('/api/auth/2fa/status', authMiddleware(db), (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(buildTwoFactorRecoverySummary(user));
  });

  app.post('/api/auth/2fa/setup', authMiddleware(db), async (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const password = String(req.body.password || '');
    const validPassword = await comparePassword(password, user.password_hash);
    if (!validPassword) {
      writeAudit({ actor: user.email, userId: user.email, action: 'two_factor_setup_failed', entityType: 'auth', reason: 'invalid_password' });
      return res.status(401).json({ message: 'Password confirmation failed.' });
    }

    const setup = getTwoFactorSetupForUser(user);
    db.prepare('UPDATE users SET two_factor_temp_secret = ?, updated_at = ? WHERE id = ?')
      .run(setup.encryptedSecret, nowIso(), user.id);

    writeAudit({ actor: user.email, userId: user.email, action: 'two_factor_setup_started', entityType: 'auth' });

    res.json({
      secret: formatSecretForDisplay(setup.secret),
      secretRaw: setup.secret,
      issuer: 'Dink Card',
      account: user.email,
      otpauthUrl: getOtpAuthUrl({ secret: setup.secret, email: user.email })
    });
  });

  app.post('/api/auth/2fa/enable', authMiddleware(db), async (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const password = String(req.body.password || '');
    const code = String(req.body.code || '').trim();
    const validPassword = await comparePassword(password, user.password_hash);

    if (!validPassword) {
      writeAudit({ actor: user.email, userId: user.email, action: 'two_factor_enable_failed', entityType: 'auth', reason: 'invalid_password' });
      return res.status(401).json({ message: 'Password confirmation failed.' });
    }

    const tempSecret = readEncryptedTwoFactorSecret(user.two_factor_temp_secret);
    if (!tempSecret) {
      return res.status(400).json({ message: 'Start 2FA setup first.' });
    }

    if (!verifyTotp(tempSecret, code)) {
      writeAudit({ actor: user.email, userId: user.email, action: 'two_factor_enable_failed', entityType: 'auth', reason: 'invalid_code' });
      return res.status(400).json({ message: 'The authentication code is not valid.' });
    }

    const recovery = replacementRecoveryState();
    const now = nowIso();
    db.prepare(`
      UPDATE users
      SET two_factor_enabled = 1,
          two_factor_secret = ?,
          two_factor_temp_secret = NULL,
          two_factor_recovery_codes = ?,
          two_factor_enabled_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(user.two_factor_temp_secret, JSON.stringify(recovery.recoveryHashes), now, now, user.id);

    writeAudit({ actor: user.email, userId: user.email, action: 'two_factor_enabled', entityType: 'auth' });

    const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    res.json({
      user: serializeTwoFactorUser(refreshed),
      recoveryCodes: recovery.recoveryCodes
    });
  });

  app.post('/api/auth/2fa/disable', authMiddleware(db), async (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const password = String(req.body.password || '');
    const code = String(req.body.code || '').trim();
    const validPassword = await comparePassword(password, user.password_hash);

    if (!validPassword) {
      writeAudit({ actor: user.email, userId: user.email, action: 'two_factor_disable_failed', entityType: 'auth', reason: 'invalid_password' });
      return res.status(401).json({ message: 'Password confirmation failed.' });
    }

    const verification = verifyTwoFactorCode(user, code);
    if (!verification.valid) {
      writeAudit({ actor: user.email, userId: user.email, action: 'two_factor_disable_failed', entityType: 'auth', reason: 'invalid_code' });
      return res.status(400).json({ message: 'The authentication code is not valid.' });
    }

    db.prepare(`
      UPDATE users
      SET two_factor_enabled = 0,
          two_factor_secret = NULL,
          two_factor_temp_secret = NULL,
          two_factor_recovery_codes = NULL,
          two_factor_enabled_at = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(nowIso(), user.id);

    writeAudit({ actor: user.email, userId: user.email, action: 'two_factor_disabled', entityType: 'auth' });

    const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    res.json({ user: serializeTwoFactorUser(refreshed) });
  });

  app.post('/api/notifications/:id/read', authMiddleware(db), (req, res) => {
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.email);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(notification.id);
    res.json(mapRow(db.prepare('SELECT * FROM notifications WHERE id = ?').get(notification.id)));
  });

  app.post('/api/notifications/read-all', authMiddleware(db), (req, res) => {
    const result = db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(req.user.email);
    res.json({ ok: true, updated: result.changes || 0 });
  });

  app.get('/api/events', authMiddleware(db), (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let lastUnread = null;
    const send = () => {
      const row = db.prepare('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read = 0').get(req.user.email);
      const unread = Number(row?.unread || 0);
      if (unread !== lastUnread) {
        lastUnread = unread;
        res.write(`event: notification_count\n`);
        res.write(`data: ${JSON.stringify({ unread })}\n\n`);
      } else {
        res.write(`event: ping\n`);
        res.write(`data: {}\n\n`);
      }
    };

    send();
    const timer = setInterval(send, 3000);
    req.on('close', () => clearInterval(timer));
  });

  app.get('/api/admin/wallet-summary', authMiddleware(db), (req, res) => {
    if (!requireAdmin(req, res)) return;
    const wallets = db.prepare(`
      SELECT w.*, u.full_name, u.email, u.account_status
      FROM wallets w
      LEFT JOIN users u ON u.email = w.user_id
      ORDER BY w.updated_at DESC
      LIMIT 500
    `).all().map(mapRow);
    const totalUsableBalance = wallets.reduce((sum, wallet) => sum + Number(wallet.available_balance || 0), 0);
    res.json({ wallets, totalUsableBalance: money(totalUsableBalance) });
  });

  app.post('/api/uploads', authMiddleware(db), uploadLimiter, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'File is required.' });

    const signature = readUploadSignature(req.file);

    if (!signature.valid) {
      removeUploadedFile(req.file);
      return res.status(400).json({ message: 'Upload failed. Please try another file.' });
    }

    normalizeUploadedFile(req.file, signature);

    const filename = path.basename(req.file.path);

    res.status(201).json({
      file_url: uploadUrlFor(filename),
      file: {
        url: uploadUrlFor(filename),
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      }
    });
  });

  app.get('/api/entities/:entity', authMiddleware(db), (req, res) => {
    try {
      if (req.params.entity === 'Deposit') {
        expirePendingChapaDeposits(req.user.role === 'user' ? req.user.email : undefined);
      }
      const rows = queryEntities(
        req.params.entity,
        {
          filter: parseJson(req.query.filter, {}),
          sort: req.query.sort,
          limit: req.query.limit
        },
        req.user
      );

      res.json(rows);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/entities/:entity', authMiddleware(db), (req, res) => {
    try {
      const row = createEntity(req.params.entity, req.body, req.user);
      res.status(201).json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch('/api/entities/:entity/:id', authMiddleware(db), (req, res) => {
    try {
      const row = updateEntity(req.params.entity, req.params.id, req.body, req.user);
      res.json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  async function providerStatusHandler(req, res) {
    try {
      if (!requireAdmin(req, res)) return;
      res.json({
        environment: config.bitnob.env,
        baseUrl: config.bitnob.baseUrl,
        clientId: config.bitnob.clientId ? `${config.bitnob.clientId.slice(0, 6)}...${config.bitnob.clientId.slice(-4)}` : '',
        webhookUrl: config.bitnob.webhookUrl,
        provider: 'bitnob'
      });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to read provider settings.' });
    }
  }

  async function whoamiHandler(req, res) {
    try {
      if (!requireAdmin(req, res)) return;
      const provider = await bitnobService.whoami();
      writeAudit({ actor: req.user.email, userId: req.user.email, action: 'bitnob_connection_tested', entityType: 'provider', entityId: 'bitnob', environment: config.bitnob.env, provider: 'bitnob', providerStatus: provider?.status || provider?.message || 'success', providerResponse: provider, req });
      res.json({ message: `Connected to Bitnob ${config.bitnob.env} successfully.`, environment: config.bitnob.env, provider });
    } catch (error) {
      writeAudit({ actor: req.user?.email, userId: req.user?.email, action: 'bitnob_connection_failed', entityType: 'provider', entityId: 'bitnob', environment: config.bitnob.env, provider: 'bitnob', providerStatus: 'failed', providerResponse: { message: error.message }, req });
      res.status(400).json({ message: error.message || 'Bitnob authentication failed. Check environment variables.' });
    }
  }

  async function balancesHandler(req, res) {
    try {
      if (!requireAdmin(req, res)) return;
      const provider = await bitnobService.getBalances();
      const usdc = findAssetBalance(provider, 'USDC');
      const usdt = findAssetBalance(provider, 'USDT');
      const btc = findAssetBalance(provider, 'BTC');
      res.json({ provider, environment: config.bitnob.env, usdc, usdt, btc, stableUsd: Math.max(usdc, usdt) });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to fetch company wallet balance.' });
    }
  }

  app.get('/api/admin/settings/provider-status', authMiddleware(db), providerStatusHandler);
  app.get('/api/admin/bitnob/whoami', authMiddleware(db), whoamiHandler);
  app.get('/api/admin/bitnob/balances', authMiddleware(db), balancesHandler);
  app.get('/api/admin/balances', authMiddleware(db), balancesHandler);

  app.get('/api/admin/customers', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const rows = db.prepare('SELECT * FROM bitnob_customers WHERE environment = ? ORDER BY created_at DESC LIMIT 500').all(config.bitnob.env).map(mapRow);
      res.json(rows);
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to list customers.' });
    }
  });

  async function createCustomerHandler(req, res) {
    try {
      if (!requireAdmin(req, res)) return;
      const payload = req.body || {};
      const required = ['customer_type', 'email'];
      const missing = required.filter((field) => !String(payload[field] || '').trim());
      if (missing.length) return res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` });

      writeAudit({ actor: req.user.email, userId: payload.user_id || payload.email, action: 'customer_create_attempted', entityType: 'bitnob_customer', environment: config.bitnob.env, provider: 'bitnob', newValue: { email: payload.email }, reason: req.body.reason || null, req });
      const provider = await bitnobService.createCustomer(buildBitnobCustomerPayload(payload));
      const saved = saveBitnobCustomer({ payload, providerResponse: provider });
      writeAudit({ actor: req.user.email, userId: saved.user_id || saved.email, action: 'customer_created', entityType: 'bitnob_customer', entityId: saved.id, environment: config.bitnob.env, provider: 'bitnob', providerStatus: provider?.status || provider?.message || 'success', providerResponse: provider, newValue: saved, reason: req.body.reason || null, req });
      res.status(201).json(saved);
    } catch (error) {
      writeAudit({ actor: req.user?.email, userId: req.body?.email, action: 'customer_create_failed', entityType: 'bitnob_customer', environment: config.bitnob.env, provider: 'bitnob', providerStatus: error.providerStatus || 'failed', providerResponse: error.providerResponse || { message: error.message }, reason: req.body?.reason || null, req });
      res.status(400).json({ message: error.message || 'Customer creation failed.' });
    }
  }

  app.post('/api/admin/customers', authMiddleware(db), createCustomerHandler);
  app.post('/api/admin/customers/create', authMiddleware(db), createCustomerHandler);

  app.post('/api/admin/customers/sync-bitnob', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      writeAudit({ actor: req.user.email, userId: req.user.email, action: 'bitnob_sync_started', entityType: 'bitnob_customer', environment: config.bitnob.env, provider: 'bitnob', req });
      const provider = await bitnobService.listCustomers();
      const providerCustomers = normalizeProviderList(provider);
      const saved = providerCustomers.map((customer) => saveBitnobCustomer({ providerResponse: customer, providerCustomer: customer }));
      writeAudit({ actor: req.user.email, userId: req.user.email, action: 'bitnob_sync_completed', entityType: 'bitnob_customer', environment: config.bitnob.env, provider: 'bitnob', providerStatus: 'success', providerResponse: { imported: saved.length }, req });
      res.json({ imported: saved.length, customers: saved });
    } catch (error) {
      writeAudit({ actor: req.user?.email, userId: req.user?.email, action: 'bitnob_sync_failed', entityType: 'bitnob_customer', environment: config.bitnob.env, provider: 'bitnob', providerStatus: error.providerStatus || 'failed', providerResponse: error.providerResponse || { message: error.message }, req });
      res.status(400).json({ message: error.message || 'Bitnob customer sync failed.' });
    }
  });

  app.get('/api/admin/customers/:id', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const customer = db.prepare('SELECT * FROM bitnob_customers WHERE (id = ? OR bitnob_customer_id = ?) AND environment = ?').get(req.params.id, req.params.id, config.bitnob.env);
      if (!customer) return res.status(404).json({ message: 'Customer not found' });
      res.json(mapRow(customer));
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to get customer.' });
    }
  });

  app.put('/api/admin/customers/:id', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const existing = db.prepare('SELECT * FROM bitnob_customers WHERE (id = ? OR bitnob_customer_id = ?) AND environment = ?').get(req.params.id, req.params.id, config.bitnob.env);
      if (!existing) return res.status(404).json({ message: 'Customer not found' });
      const provider = await bitnobService.updateCustomer(existing.bitnob_customer_id, buildBitnobCustomerPayload({ ...existing, ...req.body }));
      const saved = saveBitnobCustomer({ payload: { ...existing, ...req.body }, providerResponse: provider });
      writeAudit({ actor: req.user.email, userId: saved.user_id || saved.email, action: 'customer_updated', entityType: 'bitnob_customer', entityId: saved.id, oldValue: mapRow(existing), newValue: saved, environment: config.bitnob.env, provider: 'bitnob', providerStatus: provider?.status || 'success', providerResponse: provider, reason: req.body.reason || null, req });
      res.json(saved);
    } catch (error) {
      res.status(400).json({ message: error.message || 'Customer update failed.' });
    }
  });

  app.delete('/api/admin/customers/:id', authMiddleware(db), async (req, res) => {
    try {
      if (!requireSuperadmin(req, res)) return;
      const reason = String(req.body?.reason || '').trim();
      if (!reason) return res.status(400).json({ message: 'A deletion reason is required.' });
      const existing = db.prepare('SELECT * FROM bitnob_customers WHERE (id = ? OR bitnob_customer_id = ?) AND environment = ?').get(req.params.id, req.params.id, config.bitnob.env);
      if (!existing) return res.status(404).json({ message: 'Customer not found' });

      const linkedCards = db.prepare(`
        SELECT COUNT(*) AS total FROM virtual_cards
        WHERE environment = ? AND bitnob_customer_id = ? AND status != 'terminated'
      `).get(config.bitnob.env, existing.bitnob_customer_id);

      if (linkedCards.total > 0 && req.body?.force !== true) {
        return res.status(400).json({ message: 'This customer has active cards. Terminate or freeze cards first, or use a forced owner deletion.' });
      }

      let provider = null;
      try {
        provider = await bitnobService.deleteCustomer(existing.bitnob_customer_id);
      } catch (error) {
        writeAudit({ actor: req.user.email, userId: existing.user_id || existing.email, action: 'bitnob_customer_delete_failed', entityType: 'bitnob_customer', entityId: existing.id, oldValue: mapRow(existing), environment: config.bitnob.env, provider: 'bitnob', providerStatus: error.providerStatus || 'failed', providerResponse: error.providerResponse || { message: error.message }, reason, req });
        return res.status(400).json({ message: error.message || 'Bitnob customer deletion failed.' });
      }

      db.prepare('DELETE FROM bitnob_customers WHERE id = ?').run(existing.id);
      writeAudit({ actor: req.user.email, userId: existing.user_id || existing.email, action: 'bitnob_customer_deleted', entityType: 'bitnob_customer', entityId: existing.id, oldValue: mapRow(existing), environment: config.bitnob.env, provider: 'bitnob', providerStatus: provider?.status || provider?.message || 'success', providerResponse: provider, reason, req });
      res.json({ ok: true, provider });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Customer deletion failed.' });
    }
  });

  app.get('/api/admin/customers/:customerId/cards', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const provider = await bitnobService.getCustomerCards(req.params.customerId);
      res.json({ provider, cards: normalizeProviderList(provider) });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to get customer cards.' });
    }
  });

  app.get('/api/admin/cards', authMiddleware(db), (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const rows = db.prepare(`
        SELECT vc.*, bc.first_name, bc.last_name, bc.email AS customer_email
        FROM virtual_cards vc
        LEFT JOIN bitnob_customers bc ON (bc.bitnob_customer_id = vc.bitnob_customer_id OR bc.bitnob_customer_id = vc.customer_reference) AND bc.environment = vc.environment
        WHERE vc.environment = ?
        ORDER BY vc.created_at DESC
        LIMIT 500
      `).all(config.bitnob.env).map(mapRow);
      res.json(rows);
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to list cards.' });
    }
  });

  async function createAdminCardHandler(req, res) {
    try {
      if (!requireAdmin(req, res)) return;
      const customer = db.prepare('SELECT * FROM bitnob_customers WHERE (id = ? OR bitnob_customer_id = ?) AND environment = ?').get(req.body.customerId, req.body.customerId, config.bitnob.env);
      if (!customer) return res.status(404).json({ message: 'Create or select a customer first.' });
      const cardOwner = customer.user_id || customer.email;
      const existingCards = db.prepare(`
        SELECT COUNT(*) AS total FROM virtual_cards
        WHERE environment = ? AND user_id = ? AND status != 'terminated'
      `).get(config.bitnob.env, cardOwner);
      if (existingCards.total >= 3) {
        return res.status(400).json({ message: 'This account already has the maximum of 3 active virtual cards.' });
      }
      const fundingAmount = Number(req.body.amount || req.body.fundingAmount || 0);
      if (!Number.isFinite(fundingAmount) || fundingAmount <= 0) return res.status(400).json({ message: 'Enter a valid funding amount.' });

      const balances = await bitnobService.getBalances();
      const availableUsdc = findAssetBalance(balances, 'USDC');
      const availableUsdt = findAssetBalance(balances, 'USDT');
      const settings = getFeeSettings();
      const requiredUsdc = money(fundingAmount + Number(settings.card_creation_fee_usd || 0));
      const availableStable = Math.max(availableUsdc, availableUsdt);
      const availableAsset = availableUsdt > availableUsdc ? 'USDT' : 'USDC';
      if (availableStable < requiredUsdc) {
        return res.status(400).json({ message: `Insufficient company wallet balance. Required: ${requiredUsdc.toFixed(2)} USDC/USDT. Available: ${availableStable.toFixed(2)} ${availableAsset}.` });
      }

      writeAudit({ actor: req.user.email, userId: customer.user_id || customer.email, action: 'card_create_attempted', entityType: 'bitnob_customer', entityId: customer.id, environment: config.bitnob.env, provider: 'bitnob', newValue: { fundingAmount, requiredUsdc, availableUsdc, availableUsdt }, reason: req.body.reason || null, req });
      const provider = await bitnobService.createCard({
        card_type: 'virtual',
        currency: 'USD',
        name: req.body.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Virtual Card',
        amount: toBitnobBaseUnits(fundingAmount),
        customer_id: customer.bitnob_customer_id,
        webhook_url: config.bitnob.webhookUrl,
        card_limits: req.body.card_limits || req.body.cardLimits || undefined
      });
      const card = providerCardToDb({ card: extractProviderData(provider), customer, fallbackUserId: customer.user_id || customer.email, nickname: req.body.nickname || 'Virtual Card', providerPayload: provider });
      writeAudit({ actor: req.user.email, userId: card.user_id, action: 'card_created', entityType: 'virtual_card', entityId: card.id, environment: config.bitnob.env, provider: 'bitnob', providerStatus: provider?.status || provider?.message || 'success', providerResponse: provider, newValue: { cardId: card.id, providerCardId: card.provider_card_id }, reason: req.body.reason || null, req });
      res.status(201).json(card);
    } catch (error) {
      writeAudit({ actor: req.user?.email, userId: req.body?.customerId, action: 'card_create_failed', entityType: 'virtual_card', environment: config.bitnob.env, provider: 'bitnob', providerStatus: 'failed', providerResponse: { message: error.message }, reason: req.body?.reason || null, req });
      res.status(400).json({ message: error.message || 'Card creation failed.' });
    }
  }

  app.post('/api/admin/cards', authMiddleware(db), createAdminCardHandler);
  app.post('/api/admin/cards/create', authMiddleware(db), createAdminCardHandler);

  app.get('/api/admin/cards/transactions', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const provider = await bitnobService.getAllCardTransactions();
      res.json({ provider, transactions: normalizeProviderList(provider) });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to list transactions.' });
    }
  });

  app.get('/api/admin/cards/:cardId', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const card = db.prepare('SELECT * FROM virtual_cards WHERE (id = ? OR provider_card_id = ?) AND environment = ?').get(req.params.cardId, req.params.cardId, config.bitnob.env);
      if (!card) return res.status(404).json({ message: 'Card not found' });
      let provider = null;
      if (card.provider_card_id) {
        try {
          provider = await bitnobService.getCard(card.provider_card_id);
        } catch {}
      }
      res.json({ card: mapRow(card), provider });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to get card.' });
    }
  });

  app.get('/api/admin/cards/:cardId/secure', authMiddleware(db), async (req, res) => {
    try {
      if (!requireSuperadmin(req, res)) return;
      const card = db.prepare('SELECT * FROM virtual_cards WHERE (id = ? OR provider_card_id = ?) AND environment = ?').get(req.params.cardId, req.params.cardId, config.bitnob.env);
      if (!card) return res.status(404).json({ message: 'Card not found' });
      const providerCardId = card.provider_card_id || req.params.cardId;
      const secure = await bitnobService.getSecureCardDetails(providerCardId);
      writeAudit({ actor: req.user.email, userId: card.user_id, action: 'secure_details_viewed', entityType: 'virtual_card', entityId: card.id, environment: config.bitnob.env, provider: 'bitnob', providerStatus: secure?.status || secure?.message || 'success', newValue: { providerCardId }, reason: req.query.reason || 'Admin viewed secure card details', req });
      res.json(secure);
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to view secure card details.' });
    }
  });

  app.post('/api/admin/cards/:cardId/fund', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const card = db.prepare('SELECT * FROM virtual_cards WHERE (id = ? OR provider_card_id = ?) AND environment = ?').get(req.params.cardId, req.params.cardId, config.bitnob.env);
      if (!card) return res.status(404).json({ message: 'Card not found' });
      const amount = Number(req.body.amount);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Enter a valid funding amount.' });
      const reference = `admin_fund_${generateId('ref')}`;
      const provider = await bitnobService.fundCard(card.provider_card_id, amount, reference);
      writeAudit({ actor: req.user.email, userId: card.user_id, action: 'card_funded', entityType: 'virtual_card', entityId: card.id, environment: config.bitnob.env, provider: 'bitnob', providerStatus: provider?.status || provider?.message || 'success', providerResponse: provider, newValue: { amount, reference }, reason: req.body.reason || null, req });
      res.json({ ok: true, reference, provider });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Card funding failed.' });
    }
  });

  app.post('/api/admin/cards/:cardId/withdraw', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const card = db.prepare('SELECT * FROM virtual_cards WHERE (id = ? OR provider_card_id = ?) AND environment = ?').get(req.params.cardId, req.params.cardId, config.bitnob.env);
      if (!card) return res.status(404).json({ message: 'Card not found' });
      const amount = Number(req.body.amount);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Enter a valid withdrawal amount.' });
      const reference = `admin_withdraw_${generateId('ref')}`;
      const provider = await bitnobService.withdrawCard(card.provider_card_id, amount, reference);
      writeAudit({ actor: req.user.email, userId: card.user_id, action: 'card_withdrawn', entityType: 'virtual_card', entityId: card.id, environment: config.bitnob.env, provider: 'bitnob', providerStatus: provider?.status || provider?.message || 'success', providerResponse: provider, newValue: { amount, reference }, reason: req.body.reason || null, req });
      res.json({ ok: true, reference, provider });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Card withdrawal failed.' });
    }
  });

  app.post('/api/admin/cards/:cardId/freeze', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const card = db.prepare('SELECT * FROM virtual_cards WHERE (id = ? OR provider_card_id = ?) AND environment = ?').get(req.params.cardId, req.params.cardId, config.bitnob.env);
      if (!card) return res.status(404).json({ message: 'Card not found' });
      const provider = await bitnobService.freezeCard(card.provider_card_id);
      db.prepare('UPDATE virtual_cards SET status = ?, updated_at = ? WHERE id = ?').run('frozen', nowIso(), card.id);
      writeAudit({ actor: req.user.email, userId: card.user_id, action: 'card_frozen', entityType: 'virtual_card', entityId: card.id, environment: config.bitnob.env, provider: 'bitnob', providerStatus: provider?.status || provider?.message || 'success', providerResponse: provider, reason: req.body.reason || null, req });
      res.json({ ok: true, provider });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Card freeze failed.' });
    }
  });

  app.post('/api/admin/cards/:cardId/unfreeze', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const card = db.prepare('SELECT * FROM virtual_cards WHERE (id = ? OR provider_card_id = ?) AND environment = ?').get(req.params.cardId, req.params.cardId, config.bitnob.env);
      if (!card) return res.status(404).json({ message: 'Card not found' });
      const provider = await bitnobService.unfreezeCard(card.provider_card_id);
      db.prepare('UPDATE virtual_cards SET status = ?, updated_at = ? WHERE id = ?').run('active', nowIso(), card.id);
      writeAudit({ actor: req.user.email, userId: card.user_id, action: 'card_unfrozen', entityType: 'virtual_card', entityId: card.id, environment: config.bitnob.env, provider: 'bitnob', providerStatus: provider?.status || provider?.message || 'success', providerResponse: provider, reason: req.body.reason || null, req });
      res.json({ ok: true, provider });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Card unfreeze failed.' });
    }
  });

  app.get('/api/admin/cards/:cardId/transactions', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const card = db.prepare('SELECT * FROM virtual_cards WHERE (id = ? OR provider_card_id = ?) AND environment = ?').get(req.params.cardId, req.params.cardId, config.bitnob.env);
      const providerCardId = card?.provider_card_id || req.params.cardId;
      const provider = await bitnobService.getCardTransactions(providerCardId);
      res.json({ provider, transactions: normalizeProviderList(provider) });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to list card transactions.' });
    }
  });

  app.get('/api/admin/audit-logs', authMiddleware(db), (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const rows = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 300').all().map(mapRow);
      res.json(rows);
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to list audit logs.' });
    }
  });

  app.post('/api/admin/users/:id/suspend', authMiddleware(db), (req, res) => {
    if (!requireSuperadmin(req, res)) return;

    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    if (!target) return res.status(404).json({ message: 'User not found' });
    if (target.role === 'superadmin') return res.status(400).json({ message: 'Superadmin accounts cannot be suspended here.' });

    const reason = String(req.body.reason || '').trim() || 'Suspended by superadmin';
    const now = nowIso();

    db.prepare(`
      UPDATE users
      SET account_status = 'suspended', restricted_reason = ?, restricted_by = ?, restricted_at = ?, updated_at = ?
      WHERE id = ?
    `).run(reason, req.user.email, now, now, target.id);

    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
      VALUES (?, ?, 'Account Restricted', ?, 'account', 0, ?)
    `).run(generateId('ntf'), target.email, `Your account has been restricted. Reason: ${reason}`, now);

    writeAudit({
      actor: req.user.email,
      userId: target.email,
      action: 'user_restricted',
      entityType: 'user',
      entityId: target.id,
      oldValue: target,
      newValue: { account_status: 'suspended' },
      reason
    });

    res.json(sanitizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)));
  });

  app.post('/api/admin/users/:id/activate', authMiddleware(db), (req, res) => {
    if (!requireSuperadmin(req, res)) return;

    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    if (!target) return res.status(404).json({ message: 'User not found' });

    const now = nowIso();

    db.prepare(`
      UPDATE users
      SET account_status = 'active', restricted_reason = NULL, restricted_by = NULL, restricted_at = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, target.id);

    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
      VALUES (?, ?, 'Account Restored', 'Your account access has been restored.', 'account', 0, ?)
    `).run(generateId('ntf'), target.email, now);

    writeAudit({
      actor: req.user.email,
      userId: target.email,
      action: 'user_restored',
      entityType: 'user',
      entityId: target.id,
      oldValue: target,
      newValue: { account_status: 'active' }
    });

    res.json(sanitizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)));
  });

  app.post('/api/admin/users/:id/role', authMiddleware(db), (req, res) => {
    if (!requireSuperadmin(req, res)) return;

    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    if (!target) return res.status(404).json({ message: 'User not found' });
    if (target.role === 'superadmin') return res.status(400).json({ message: 'Superadmin role cannot be changed here.' });

    const nextRole = req.body.role === 'admin' ? 'admin' : 'user';
    const now = nowIso();

    db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(nextRole, now, target.id);

    writeAudit({
      actor: req.user.email,
      userId: target.email,
      action: 'user_role_changed',
      entityType: 'user',
      entityId: target.id,
      oldValue: { role: target.role },
      newValue: { role: nextRole },
      reason: req.body.reason || null
    });

    res.json(sanitizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)));
  });

  app.post('/api/admin/users/:id/add-money', authMiddleware(db), (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;

      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
      if (!target) return res.status(404).json({ message: 'User not found' });

      const amount = Number(req.body.amount);
      const reason = String(req.body.reason || '').trim();

      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: 'Enter a valid amount.' });
      }
      if (amount > 10000 && !isSuperadmin(req.user)) {
        return res.status(403).json({ message: 'Only the owner can add more than $10,000 manually.' });
      }
      if (!reason) {
        return res.status(400).json({ message: 'A reason is required for manual funding.' });
      }

      ensureWallet(target.email);

      const reference = `manual_credit_${target.id}_${Date.now()}`;
      const balance = creditWallet(
        target.email,
        amount,
        'manual_credit',
        `Manual admin funding: ${reason}`,
        reference
      );
      const now = nowIso();

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
        VALUES (?, ?, 'Balance Updated', ?, 'wallet', 0, ?)
      `).run(generateId('ntf'), target.email, `Your available service balance was updated by $${amount.toFixed(2)}.`, now);

      writeAudit({
        actor: req.user.email,
        userId: target.email,
        action: 'manual_balance_credit',
        entityType: 'wallet',
        entityId: target.email,
        newValue: { amount, balance },
        reason
      });

      res.json({ ok: true, balance });
    } catch (error) {
      console.error('Manual balance credit failed:', error);
      res.status(400).json({ message: error.message || 'Manual balance credit failed.' });
    }
  });

  app.post('/api/admin/users/:id/set-balance', authMiddleware(db), (req, res) => {
    try {
      if (!requireSuperadmin(req, res)) return;

      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
      if (!target) return res.status(404).json({ message: 'User not found' });

      const amount = Number(req.body.amount);
      const reason = String(req.body.reason || '').trim();
      if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ message: 'Enter a valid non-negative balance.' });
      if (!reason) return res.status(400).json({ message: 'A reason is required for setting balance.' });

      ensureWallet(target.email);
      const before = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(target.email);
      const balance = setWalletBalance(target.email, amount, `Owner set usable balance: ${reason}`, `manual_set_${target.id}_${Date.now()}`);
      const now = nowIso();

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
        VALUES (?, ?, 'Balance Updated', ?, 'wallet', 0, ?)
      `).run(generateId('ntf'), target.email, `Your available service balance is now $${Number(balance).toFixed(2)}.`, now);

      writeAudit({
        actor: req.user.email,
        userId: target.email,
        action: 'manual_balance_set',
        entityType: 'wallet',
        entityId: target.email,
        oldValue: { available_balance: before?.available_balance },
        newValue: { available_balance: balance },
        reason,
        req
      });

      res.json({ ok: true, balance });
    } catch (error) {
      console.error('Set balance failed:', error);
      res.status(400).json({ message: error.message || 'Set balance failed.' });
    }
  });

  app.post('/api/admin/users/:id/pass-kyc', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;

      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
      if (!target) return res.status(404).json({ message: 'User not found' });

      const reason = String(req.body.reason || '').trim();
      if (!reason) return res.status(400).json({ message: 'A reason is required for manual KYC approval.' });

      const now = nowIso();
      const existing = db.prepare(`
        SELECT * FROM kyc_submissions
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(target.email);

      if (existing) {
        db.prepare(`
          UPDATE kyc_submissions
          SET status = 'approved',
              level = 2,
              legal_name = COALESCE(NULLIF(legal_name, ''), ?),
              email = COALESCE(NULLIF(email, ''), ?),
              phone = COALESCE(NULLIF(phone, ''), ?),
              rejection_reason = NULL,
              resubmission_scope = NULL,
              resubmission_fields = NULL,
              reviewed_by = ?,
              reviewed_at = ?,
              updated_at = ?
          WHERE id = ?
        `).run(target.full_name || target.email, target.email, target.phone || '', req.user.email, now, now, existing.id);
      } else {
        db.prepare(`
          INSERT INTO kyc_submissions (
            id, user_id, legal_name, phone, email, country, level, status, reviewed_by, reviewed_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'Ethiopia', 2, 'approved', ?, ?, ?, ?)
        `).run(generateId('kyc'), target.email, target.full_name || target.email, target.phone || '', target.email, req.user.email, now, now, now);
      }

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
        VALUES (?, ?, 'KYC Approved', 'Your identity verification has been approved by an administrator.', 'kyc', 0, ?)
      `).run(generateId('ntf'), target.email, now);

      const kyc = mapRow(db.prepare(`
        SELECT * FROM kyc_submissions
        WHERE user_id = ?
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `).get(target.email));

      let bitnobCustomer = null;
      let bitnobWarning = null;
      try {
        bitnobCustomer = await ensureBitnobCustomerForKyc({ kyc, user: target, actor: req.user.email, reason, req });
      } catch (error) {
        bitnobWarning = error.message || 'Bitnob customer creation failed.';
        writeAudit({
          actor: req.user.email,
          userId: target.email,
          action: 'kyc_bitnob_customer_create_failed',
          entityType: 'bitnob_customer',
          entityId: kyc?.id,
          environment: config.bitnob.env,
          provider: 'bitnob',
          providerStatus: error.providerStatus || 'failed',
          providerResponse: error.providerResponse || { message: bitnobWarning },
          reason,
          req
        });
      }

      writeAudit({
        actor: req.user.email,
        userId: target.email,
        action: 'manual_kyc_approved',
        entityType: 'kyc_submission',
        entityId: kyc?.id,
        newValue: { status: 'approved' },
        reason
      });

      res.json({ ...kyc, bitnob_customer: bitnobCustomer, bitnob_warning: bitnobWarning });
    } catch (error) {
      console.error('Manual KYC approval failed:', error);
      res.status(400).json({ message: error.message || 'Manual KYC approval failed.' });
    }
  });

  app.post('/api/admin/users/:id/manual-card', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;

      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
      if (!target) return res.status(404).json({ message: 'User not found' });

      const reason = String(req.body.reason || '').trim();
      const fundingAmount = Number(req.body.fundingAmount ?? req.body.balance ?? 0);
      const nickname = String(req.body.nickname || 'Virtual Card').trim() || 'Virtual Card';

      if (!reason) return res.status(400).json({ message: 'A reason is required for manual card creation.' });
      if (!Number.isFinite(fundingAmount) || fundingAmount <= 0) return res.status(400).json({ message: 'Enter a valid card funding amount.' });
      if (fundingAmount > 10000 && !isSuperadmin(req.user)) {
        return res.status(403).json({ message: 'Only the owner can create cards above $10,000.' });
      }

      ensureWallet(target.email);

      const card = mapRow(await createVirtualCardForUser(sanitizeUser(target), {
        nickname,
        fundingAmount
      }));

      writeAudit({
        actor: req.user.email,
        userId: target.email,
        action: 'admin_bitnob_card_created',
        entityType: 'virtual_card',
        entityId: card?.id,
        newValue: { cardId: card?.id, providerCardId: card?.provider_card_id, fundingAmount },
        reason
      });

      res.status(201).json(card);
    } catch (error) {
      console.error('Manual card creation failed:', error);
      res.status(400).json({ message: error.message || 'Manual card creation failed.' });
    }
  });

  app.delete('/api/admin/users/:id', authMiddleware(db), (req, res) => {
    if (!requireSuperadmin(req, res)) return;

    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    if (!target) return res.status(404).json({ message: 'User not found' });

    if (target.role === 'superadmin' || target.id === req.user.id) {
      return res.status(400).json({ message: 'This account cannot be deleted.' });
    }

    const reason = String(req.body?.reason || '').trim() || 'Deleted by superadmin';
    const uploadUrls = collectUserUploadUrls(target.email);

    deleteUserCascade(target);
    uploadUrls.forEach(removeUploadUrl);

    writeAudit({
      actor: req.user.email,
      userId: target.email,
      action: 'user_deleted',
      entityType: 'user',
      entityId: target.id,
      oldValue: sanitizeUser(target),
      reason
    });

    res.json({ ok: true });
  });

  app.post('/api/payments/chapa/initialize', authMiddleware(db), async (req, res) => {
    try {
      expirePendingChapaDeposits(req.user.email);
      const result = await initializeChapaPayment({
        user: req.user,
        amountUsd: req.body.amountUsd,
        phoneNumber: req.body.phoneNumber
      });

      res.json(result);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/payments/chapa/status/:txRef', authMiddleware(db), async (req, res) => {
    try {
      const deposit = await finalizeChapaDeposit(req.params.txRef);
      if (!canReadDepositInvoice(req.user, deposit)) return res.status(403).json({ message: 'Forbidden' });
      res.json(deposit);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/payments/invoice/:txRef/download', authMiddleware(db), (req, res) => {
    try {
      expirePendingChapaDeposits(req.user.role === 'user' ? req.user.email : undefined);
      const deposit = db.prepare('SELECT * FROM deposits WHERE transaction_reference = ? OR id = ?').get(req.params.txRef, req.params.txRef);
      if (!deposit) return res.status(404).json({ message: 'Invoice not found' });
      if (!canReadDepositInvoice(req.user, deposit)) return res.status(403).json({ message: 'Forbidden' });
      const filename = `dinkcard-invoice-${String(deposit.transaction_reference || deposit.id).replace(/[^a-zA-Z0-9_-]/g, '')}.html`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(invoiceHtml(deposit));
    } catch (error) {
      res.status(400).json({ message: error.message || 'Invoice download failed.' });
    }
  });

  app.get('/api/payments/chapa/callback', async (req, res) => {
    const txRef = req.query.trx_ref || req.query.tx_ref;

    if (txRef) {
      try {
        await finalizeChapaDeposit(txRef);
      } catch {}
    }

    const redirectUrl = new URL('/dashboard', config.appUrl);
    if (txRef) redirectUrl.searchParams.set('tx_ref', txRef);
    redirectUrl.searchParams.set('payment', 'chapa');
    res.redirect(redirectUrl.toString());
  });

  async function chapaWebhookHandler(req, res) {
    const signature = req.headers['x-chapa-signature'] || req.headers['chapa-signature'];

    if (!verifyChapaWebhookSignature(req.rawBody || JSON.stringify(req.body), String(signature || ''))) {
      return res.status(401).json({ message: 'Invalid webhook signature' });
    }

    const txRef = req.body?.trx_ref || req.body?.tx_ref;
    const eventKey = req.body?.event_id || req.body?.id || (txRef ? `chapa:${txRef}:${req.body?.status || req.body?.event || 'callback'}` : null);

    if (eventKey) {
      const existing = db.prepare('SELECT id FROM webhook_events WHERE event_key = ?').get(eventKey);

      if (existing) return res.json({ ok: true, duplicate: true });

      db.prepare('INSERT INTO webhook_events (id, provider, event_key, payload, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(generateId('whk'), 'chapa', eventKey, JSON.stringify(req.body || {}), nowIso());
    }

    if (txRef) {
      try {
        await finalizeChapaDeposit(txRef);
      } catch {}
    }

    res.json({ ok: true });
  }

  app.post('/api/webhooks/chapa', chapaWebhookHandler);
  app.post('/webhook/chapa', chapaWebhookHandler);

  app.post('/api/cards', authMiddleware(db), async (req, res) => {
    try {
      await createVirtualCardForUser(req.user, req.body);
      res.status(201).json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/cards/:id/fund', authMiddleware(db), async (req, res) => {
    try {
      await fundVirtualCard(req.user, req.params.id, Number(req.body.amount));
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/cards/:id/status', authMiddleware(db), async (req, res) => {
    try {
      await changeCardStatus(req.user, req.params.id, req.body.status);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/cards/:id', authMiddleware(db), async (req, res) => {
    try {
      await terminateCard(req.user, req.params.id);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/cards/:id/reveal', authMiddleware(db), async (req, res) => {
    try {
      const details = await revealCardDetails(req.user, req.params.id, req.body.password);
      res.json(details);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/admin/cards/:id/suspend', authMiddleware(db), async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const card = db.prepare('SELECT * FROM virtual_cards WHERE id = ?').get(req.params.id);

    if (!card) return res.status(404).json({ message: 'Card not found' });
    if (card.status === 'terminated') return res.status(400).json({ message: 'Terminated cards cannot be suspended.' });

    try {
      if (card.provider_card_id) {
        await changeCardStatus(req.user, card.id, 'frozen');
      } else {
        db.prepare('UPDATE virtual_cards SET status = ?, updated_at = ? WHERE id = ?').run('frozen', nowIso(), card.id);
      }

      writeAudit({
        actor: req.user.email,
        userId: card.user_id,
        action: 'card_suspended',
        entityType: 'virtual_card',
        entityId: card.id,
        oldValue: card,
        newValue: { status: 'frozen' },
        reason: req.body.reason || null
      });

      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/admin/cards/:id/activate', authMiddleware(db), async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const card = db.prepare('SELECT * FROM virtual_cards WHERE id = ?').get(req.params.id);

    if (!card) return res.status(404).json({ message: 'Card not found' });
    if (card.status === 'terminated') return res.status(400).json({ message: 'Terminated cards cannot be reactivated.' });

    try {
      if (card.provider_card_id) {
        await changeCardStatus(req.user, card.id, 'active');
      } else {
        db.prepare('UPDATE virtual_cards SET status = ?, updated_at = ? WHERE id = ?').run('active', nowIso(), card.id);
      }

      writeAudit({
        actor: req.user.email,
        userId: card.user_id,
        action: 'card_reactivated',
        entityType: 'virtual_card',
        entityId: card.id,
        oldValue: card,
        newValue: { status: 'active' },
        reason: req.body.reason || null
      });

      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/admin/cards/:id', authMiddleware(db), async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const card = db.prepare('SELECT * FROM virtual_cards WHERE id = ?').get(req.params.id);

    if (!card) return res.status(404).json({ message: 'Card not found' });

    try {
      if (card.provider_card_id && card.status !== 'terminated') {
        await terminateCard(req.user, card.id);
      } else {
        db.prepare('UPDATE virtual_cards SET status = ?, balance = 0, updated_at = ? WHERE id = ?')
          .run('terminated', nowIso(), card.id);
      }

      writeAudit({
        actor: req.user.email,
        userId: card.user_id,
        action: 'card_terminated',
        entityType: 'virtual_card',
        entityId: card.id,
        oldValue: card,
        newValue: { status: 'terminated' },
        reason: req.body?.reason || null
      });

      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/admin/deposits/:id/approve', authMiddleware(db), async (req, res) => {
    if (!requireAdmin(req, res)) return;

    try {
      const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(req.params.id);

      if (!deposit) return res.status(404).json({ message: 'Deposit not found' });

      const approved = approveDeposit(deposit, req.user.email);

      res.json(approved);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/admin/deposits/:id/reject', authMiddleware(db), (req, res) => {
    if (!requireAdmin(req, res)) return;

    const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(req.params.id);

    if (!deposit) return res.status(404).json({ message: 'Deposit not found' });
    if (deposit.status === 'approved') return res.status(400).json({ message: 'Approved deposits cannot be rejected.' });

    const now = nowIso();
    const reason = req.body.reason || 'Rejected by admin';

    db.prepare(`
      UPDATE deposits SET status = 'rejected', rejection_reason = ?, approved_by = ?, approved_at = ?, updated_at = ?
      WHERE id = ?
    `).run(reason, req.user.email, now, now, deposit.id);

    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
      VALUES (?, ?, 'Deposit Rejected', ?, 'deposit', 0, ?)
    `).run(generateId('ntf'), deposit.user_id, `Your funding request was rejected. Reason: ${reason}`, now);

    writeAudit({
      actor: req.user.email,
      userId: deposit.user_id,
      action: 'deposit_rejected',
      entityType: 'deposit',
      entityId: deposit.id,
      oldValue: deposit,
      newValue: { status: 'rejected' },
      reason
    });

    res.json({ ok: true });
  });

  app.post('/api/admin/kyc/:id/approve', authMiddleware(db), async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;

      const kyc = db.prepare('SELECT * FROM kyc_submissions WHERE id = ?').get(req.params.id);

      if (!kyc) return res.status(404).json({ message: 'KYC submission not found' });
      const target = db.prepare('SELECT * FROM users WHERE email = ?').get(kyc.user_id);
      if (!target) return res.status(404).json({ message: 'KYC user account not found' });

      let bitnobCustomer;
      try {
        bitnobCustomer = await ensureBitnobCustomerForKyc({
          kyc,
          user: target,
          actor: req.user.email,
          reason: req.body?.reason || 'KYC approval',
          req
        });
      } catch (error) {
        writeAudit({
          actor: req.user.email,
          userId: kyc.user_id,
          action: 'kyc_bitnob_customer_create_failed',
          entityType: 'bitnob_customer',
          entityId: kyc.id,
          environment: config.bitnob.env,
          provider: 'bitnob',
          providerStatus: error.providerStatus || 'failed',
          providerResponse: error.providerResponse || { message: error.message },
          reason: req.body?.reason || 'KYC approval',
          req
        });
        return res.status(400).json({
          message: error.message || 'Bitnob customer creation failed. Fix the KYC fields or provider settings, then approve again.'
        });
      }

      const now = nowIso();

      db.prepare(`
        UPDATE kyc_submissions
        SET status = 'approved',
            level = 2,
            rejection_reason = NULL,
            resubmission_scope = NULL,
            resubmission_fields = NULL,
            reviewed_by = ?,
            reviewed_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(req.user.email, now, now, kyc.id);

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
        VALUES (?, ?, 'KYC Approved', 'Your identity has been verified. You now have full access.', 'kyc', 0, ?)
      `).run(generateId('ntf'), kyc.user_id, now);

      writeAudit({
        actor: req.user.email,
        userId: kyc.user_id,
        action: 'kyc_approved',
        entityType: 'kyc_submission',
        entityId: kyc.id,
        oldValue: kyc,
        newValue: { status: 'approved', bitnob_customer_id: bitnobCustomer?.bitnob_customer_id },
        environment: config.bitnob.env,
        provider: 'bitnob'
      });

      res.json({ ...mapRow(db.prepare('SELECT * FROM kyc_submissions WHERE id = ?').get(kyc.id)), bitnob_customer: bitnobCustomer });
    } catch (error) {
      console.error('KYC approval failed:', error);
      res.status(400).json({ message: error.message || 'KYC approval failed.' });
    }
  });

  app.post('/api/admin/kyc/:id/reject', authMiddleware(db), (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;

      const kyc = db.prepare('SELECT * FROM kyc_submissions WHERE id = ?').get(req.params.id);

      if (!kyc) return res.status(404).json({ message: 'KYC submission not found' });

      const reason = String(req.body.reason || '').trim();

      if (!reason) {
        return res.status(400).json({ message: 'A correction message is required.' });
      }

      const resubmissionScope = req.body.resubmissionScope === 'complete' ? 'complete' : 'specific';

      const resubmissionFields = Array.isArray(req.body.resubmissionFields)
        ? req.body.resubmissionFields.map((field) => String(field)).filter(Boolean)
        : [];

      if (resubmissionScope === 'specific' && !resubmissionFields.length) {
        return res.status(400).json({ message: 'Select at least one KYC item the user must fix.' });
      }

      const now = nowIso();

      db.prepare(`
        UPDATE kyc_submissions
        SET status = 'resubmit_required',
            rejection_reason = ?,
            resubmission_scope = ?,
            resubmission_fields = ?,
            reviewed_by = ?,
            reviewed_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(reason, resubmissionScope, JSON.stringify(resubmissionFields), req.user.email, now, now, kyc.id);

      const correctionTarget = resubmissionScope === 'complete'
        ? 'Please redo the full KYC form.'
        : `Please fix: ${resubmissionFields.map((field) => field.replace(/_/g, ' ')).join(', ')}.`;

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
        VALUES (?, ?, 'KYC Needs Correction', ?, 'kyc', 0, ?)
      `).run(generateId('ntf'), kyc.user_id, `Your KYC needs correction. ${reason} ${correctionTarget}`, now);

      writeAudit({
        actor: req.user.email,
        userId: kyc.user_id,
        action: 'kyc_correction_requested',
        entityType: 'kyc_submission',
        entityId: kyc.id,
        oldValue: kyc,
        newValue: { status: 'resubmit_required', resubmissionScope, resubmissionFields },
        reason
      });

      res.json(mapRow(db.prepare('SELECT * FROM kyc_submissions WHERE id = ?').get(kyc.id)));
    } catch (error) {
      console.error('KYC correction request failed:', error);
      res.status(400).json({ message: error.message || 'KYC correction request failed.' });
    }
  });

  app.post('/api/webhooks/bitnob', (req, res) => {
    const signature = req.headers['x-bitnob-signature'];

    if (!verifyBitnobWebhook(req.rawBody || JSON.stringify(req.body), String(signature || ''))) {
      return res.status(401).json({ message: 'Invalid webhook signature' });
    }

    handleBitnobWebhook(req.body);

    res.json({ ok: true });
  });

  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));

    app.use((req, res, next) => {
      const looksLikeAsset = path.extname(req.path) !== '';

      if (req.method === 'GET' && !looksLikeAsset && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
        return serveIndex(req, res);
      }

      return next();
    });
  }

  app.use((err, req, res, next) => {
    console.error(err);

    if (err.message === 'Not allowed by CORS') {
      return res.status(403).json({ message: 'This site origin is not allowed. Check APP_URL/API_URL in hosting settings.' });
    }

    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `File is too large. Upload a file under ${Math.floor(uploadLimitBytes / (1024 * 1024))}MB.`
        : err.message;

      return res.status(400).json({ message });
    }

    if (err.message?.startsWith('Only ') || err.message?.startsWith('Upload failed')) {
      return res.status(400).json({ message: err.message });
    }

    res.status(500).json({ message: 'Internal server error' });
  });

  return app;
}
