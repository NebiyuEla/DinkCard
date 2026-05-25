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
import { sanitizeUser, parseJson, generateId, money, nowIso, normalizeEthiopianPhone, toUsername, hmacSha256Hex } from './utils.js';
import { createEntity, queryEntities, updateEntity } from './entities.js';
import { approveDeposit, creditWallet, debitWallet, expirePendingChapaDeposits, getFeeSettings, initializeChapaPayment, finalizeChapaDeposit, setWalletBalance, verifyChapaWebhookSignature } from './payments.js';
import { buildTwoFactorRecoverySummary, formatSecretForDisplay, getOtpAuthUrl, getTwoFactorSetupForUser, isTwoFactorEnabled, readEncryptedTwoFactorSecret, replacementRecoveryState, verifyTotp, verifyTwoFactorCode } from './two-factor.js';
import {
  bitnobService,
  changeCardStatus,
  createVirtualCardForUser,
  fundVirtualCard,
  getVirtualCardTransactions,
  handleBitnobWebhook,
  reconcilePendingUsdcDeposits,
  revealCardDetails,
  setCardPin,
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

function createNotification(userId, title, message, type = 'system', link = null) {
  try {
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link, read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(generateId('ntf'), userId, title, message, type, link, nowIso());
  } catch {}
}

const ADMIN_ROLES = ['support', 'support_response', 'kyc_checker', 'admin', 'superadmin'];

function hasAnyAdminRole(user) {
  return ADMIN_ROLES.includes(user?.role);
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

function normalizeUsername(value) {
  return toUsername(value);
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

async function cleanupBitnobResourcesForUser(user, actor, req, reason = 'Account deleted') {
  const providerCards = db.prepare(`
    SELECT * FROM virtual_cards
    WHERE user_id = ? AND provider = 'bitnob' AND provider_card_id IS NOT NULL AND status != 'terminated'
    ORDER BY created_at DESC
  `).all(user.email);

  for (const card of providerCards) {
    try {
      await terminateCard({ role: 'superadmin', email: actor || 'system' }, card.id, null, `${reason}: provider cleanup`);
    } catch (error) {
      writeAudit({
        actor: actor || 'system',
        userId: user.email,
        action: 'bitnob_card_cleanup_failed',
        entityType: 'virtual_card',
        entityId: card.id,
        oldValue: mapRow(card),
        provider: 'bitnob',
        providerStatus: error.providerStatus || 'failed',
        providerResponse: error.providerResponse || { message: error.message },
        reason,
        req
      });
    }
  }

  const customers = db.prepare(`
    SELECT * FROM bitnob_customers
    WHERE environment = ? AND (user_id = ? OR email = ?)
    ORDER BY created_at DESC
  `).all(config.bitnob.env, user.email, user.email);

  for (const customer of customers) {
    if (!customer.bitnob_customer_id) continue;
    try {
      await bitnobService.deleteCustomer(customer.bitnob_customer_id);
      writeAudit({
        actor: actor || 'system',
        userId: user.email,
        action: 'bitnob_customer_deleted_during_cleanup',
        entityType: 'bitnob_customer',
        entityId: customer.id,
        oldValue: mapRow(customer),
        provider: 'bitnob',
        reason,
        req
      });
    } catch (error) {
      writeAudit({
        actor: actor || 'system',
        userId: user.email,
        action: 'bitnob_customer_cleanup_failed',
        entityType: 'bitnob_customer',
        entityId: customer.id,
        oldValue: mapRow(customer),
        provider: 'bitnob',
        providerStatus: error.providerStatus || 'failed',
        providerResponse: error.providerResponse || { message: error.message },
        reason,
        req
      });
    }
  }
}

function clearOperationalData(scope = 'all') {
  const uploadUrls = new Set();
  const addUrls = (values) => values.filter(Boolean).forEach((value) => uploadUrls.add(value));

  if (['kyc', 'all'].includes(scope)) {
    for (const row of db.prepare('SELECT front_id_url, back_id_url, selfie_url FROM kyc_submissions').all()) {
      addUrls([row.front_id_url, row.back_id_url, row.selfie_url]);
    }
  }

  if (['deposits', 'all'].includes(scope)) {
    for (const row of db.prepare('SELECT proof_url FROM deposits').all()) {
      addUrls([row.proof_url]);
    }
  }

  if (['support', 'all'].includes(scope)) {
    for (const row of db.prepare('SELECT screenshot_url FROM support_tickets').all()) {
      addUrls([row.screenshot_url]);
    }
    for (const row of db.prepare('SELECT attachment_url FROM support_messages').all()) {
      addUrls([row.attachment_url]);
    }
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    if (scope === 'notifications' || scope === 'all') db.prepare('DELETE FROM notifications').run();
    if (scope === 'deposits' || scope === 'all') db.prepare('DELETE FROM deposits').run();
    if (scope === 'cards' || scope === 'all') {
      db.prepare('DELETE FROM card_funding_requests').run();
      db.prepare('DELETE FROM virtual_cards').run();
    }
    if (scope === 'customers' || scope === 'all') db.prepare('DELETE FROM bitnob_customers').run();
    if (scope === 'kyc' || scope === 'all') db.prepare('DELETE FROM kyc_submissions').run();
    if (scope === 'support' || scope === 'all') {
      db.prepare('DELETE FROM support_messages').run();
      db.prepare('DELETE FROM support_tickets').run();
    }
    if (scope === 'transactions' || scope === 'all') {
      db.prepare('DELETE FROM wallet_transactions').run();
      db.prepare('UPDATE wallets SET available_balance = 0, locked_balance = 0, updated_at = ?').run(nowIso());
    }
    if (scope === 'audit' || scope === 'all') db.prepare("DELETE FROM audit_logs WHERE action != 'login' AND action != 'login_failed'").run();
    if (scope === 'webhooks' || scope === 'all') db.prepare('DELETE FROM webhook_events').run();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  [...uploadUrls].forEach(removeUploadUrl);
  return uploadUrls.size;
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
  if ((target === 'USDC' || target === 'USDT') && Number.isInteger(numeric) && Math.abs(numeric) >= 1000) {
    return numeric / 1_000_000;
  }
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

function normalizeStablecoinChains(payload, currency = 'USDC') {
  const target = String(currency || 'USDC').toUpperCase();
  const data = payload?.data;
  const rawChains = []
    .concat(Array.isArray(data?.chains) ? data.chains : [])
    .concat(Array.isArray(data) ? data : [])
    .concat(Array.isArray(payload?.chains) ? payload.chains : []);

  const seen = new Set();
  return rawChains.flatMap((entry) => {
    const stablecoins = []
      .concat(Array.isArray(entry?.stablecoins) ? entry.stablecoins : [])
      .concat(Array.isArray(entry?.assets) ? entry.assets : [])
      .concat(Array.isArray(entry?.currencies) ? entry.currencies : []);
    const entrySymbols = [
      entry?.symbol,
      entry?.code,
      entry?.asset,
      entry?.currency,
      entry?.ticker
    ].map((value) => String(value || '').toUpperCase());
    const supportsTarget = stablecoins.some((coin) => {
      const symbol = String(coin?.symbol || coin?.code || coin?.asset || coin || '').toUpperCase();
      return symbol === target;
    }) || entrySymbols.includes(target);
    if (!supportsTarget) return [];

    const chainValue = String(entry?.name || entry?.chain || entry?.network || entry?.code || '').trim();
    if (!chainValue) return [];
    const key = chainValue.toUpperCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      value: chainValue,
      label: chainValue.replace(/_/g, ' '),
      currency: target
    }];
  });
}

function extractGeneratedAddress(payload) {
  const data = extractProviderData(payload);
  return String(
    data?.address
      || data?.wallet_address
      || data?.deposit_address
      || data?.account
      || payload?.data?.address
      || payload?.address
      || ''
  ).trim();
}

function buildBitnobCustomerPayload(payload = {}) {
  const { phoneNumber, dialCode } = normalizeBitnobPhone(payload.phone || payload.phone_number);
  const addressParts = [
    payload.street_address,
    payload.address,
    payload.state,
    payload.postal_code
  ].filter((value) => String(value || '').trim());
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
    address: addressParts.join(', ') || payload.address,
    city: payload.city
  });
}

function compactPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload || {}).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
  );
}

function findUserByIdentifier(identifier) {
  const normalized = String(identifier || '').trim().toLowerCase();
  if (!normalized) return null;
  let normalizedPhone = null;
  try {
    normalizedPhone = normalizeEthiopianPhone(normalized);
  } catch {}
  return db.prepare("SELECT * FROM users WHERE lower(email) = ? OR lower(ifnull(username, '')) = ? OR phone = ?").get(normalized, normalized, normalizedPhone);
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
    street_address: kyc?.street_address || '',
    state: kyc?.state || '',
    postal_code: kyc?.postal_code || '',
    address: kyc?.street_address || kyc?.address || '',
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
  const isStablecoinDeposit = ['usdc', 'crypto'].includes(String(deposit.payment_method || '').toLowerCase());
  const rows = isStablecoinDeposit
    ? [
        ['Payment reference', deposit.transaction_reference],
        ['Order status', status],
        ['Funding amount', `${Number(deposit.payment_amount || deposit.final_usd_credit || 0).toFixed(2)} ${deposit.payment_currency || 'USDC'}`],
        ['Network', deposit.payment_network || deposit.payment_currency || 'USDC'],
        ['Deposit address', deposit.payment_address || '-'],
        ['USD credit', `$${Number(deposit.final_usd_credit || 0).toFixed(2)}`],
        ['ETB equivalent', `${Number(deposit.etb_amount || 0).toLocaleString()} ETB`],
        ['Created', deposit.created_at]
      ]
    : [
        ['Payment reference', deposit.transaction_reference],
        ['Processor reference', deposit.provider_reference || '-'],
        ['Order status', status],
        ['Payment method', 'Hosted ETB checkout'],
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
  <title>Dink Card Receipt ${escapeHtml(deposit.transaction_reference)}</title>
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
        <h1>Dink Card Receipt</h1>
        <p>${escapeHtml(isStablecoinDeposit ? 'USDC funding request receipt' : 'Hosted checkout payment receipt')}</p>
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

  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (req.path.startsWith('/api/auth')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  });

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
    const {
      firstName,
      lastName,
      username,
      email,
      phone,
      password,
      acceptedTerms
    } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'First name, last name, email, and password are required.' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    if (!acceptedTerms) {
      return res.status(400).json({ message: 'You must agree to the Terms & Conditions before using the platform.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedUsername = normalizeUsername(username);
    const normalizedPhone = normalizeEthiopianPhone(phone);
    const cleanFirstName = String(firstName).trim();
    const cleanLastName = String(lastName).trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (normalizedUsername && !/^[a-zA-Z0-9_]+$/.test(normalizedUsername)) {
      return res.status(400).json({ message: 'Username can only contain letters, numbers, and underscore.' });
    }

    const existing = normalizedUsername
      ? db.prepare("SELECT id FROM users WHERE lower(email) = ? OR lower(ifnull(username, '')) = ? OR phone = ?").get(normalizedEmail, normalizedUsername, normalizedPhone || null)
      : db.prepare("SELECT id FROM users WHERE lower(email) = ? OR phone = ?").get(normalizedEmail, normalizedPhone || null);

    if (existing) {
      return res.status(409).json({ message: 'An account with this email, phone number, or username already exists.' });
    }

    const now = nowIso();
    const userId = generateId('usr');
    const passwordHash = await hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, first_name, last_name, full_name, phone, role, terms_accepted_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?)
    `).run(
      userId,
      normalizedEmail,
      normalizedUsername || null,
      passwordHash,
      cleanFirstName,
      cleanLastName,
      `${cleanFirstName} ${cleanLastName}`.trim(),
      normalizedPhone,
      config.termsVersion,
      now,
      now
    );

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

    const user = findUserByIdentifier(normalized);

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

  app.post('/api/auth/password-reset/request', authLimiter, (req, res) => {
    const identifier = String(req.body.identifier || '').trim().toLowerCase();
    const providedLastName = String(req.body.lastName || '').trim().toLowerCase();
    const providedDob = String(req.body.dateOfBirth || '').trim();
    if (!identifier) return res.status(400).json({ message: 'Enter your email, phone number, or username.' });
    if (!providedLastName || !providedDob) {
      return res.status(400).json({ message: 'Last name and date of birth are required to reset your password.' });
    }

    const user = findUserByIdentifier(identifier);
    if (!user) {
      return res.json({ message: 'If the account exists, a password reset link has been prepared.' });
    }

    const kyc = db.prepare(`
      SELECT * FROM kyc_submissions
      WHERE user_id = ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `).get(user.email);

    if (!kyc?.date_of_birth || !kyc?.last_name) {
      return res.status(403).json({ message: 'We could not verify this reset request. Contact admin for help.' });
    }

    if (String(kyc.last_name || '').trim().toLowerCase() !== providedLastName || String(kyc.date_of_birth || '').trim() !== providedDob) {
      writeAudit({
        actor: user.email,
        userId: user.email,
        action: 'password_reset_verification_failed',
        entityType: 'auth',
        reason: 'last_name_or_dob_mismatch'
      });
      return res.status(403).json({ message: 'We could not verify this reset request. Contact admin for help.' });
    }

    const resetToken = generateId('rst');
    const tokenHash = hmacSha256Hex(config.jwtSecret, resetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = ?, updated_at = ? WHERE id = ?')
      .run(tokenHash, expiresAt, nowIso(), user.id);

    res.json({
      message: 'Password reset requested. Use the link below to choose a new password.',
      resetUrl: `${config.appUrl}/reset-password?token=${encodeURIComponent(resetToken)}`
    });
  });

  app.post('/api/auth/password-reset/confirm', authLimiter, async (req, res) => {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    if (!token || !password) return res.status(400).json({ message: 'Reset token and new password are required.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

    const tokenHash = hmacSha256Hex(config.jwtSecret, token);
    const user = db.prepare('SELECT * FROM users WHERE password_reset_token_hash = ?').get(tokenHash);
    if (!user || !user.password_reset_expires_at || Date.parse(user.password_reset_expires_at) < Date.now()) {
      return res.status(400).json({ message: 'This password reset link is invalid or expired.' });
    }

    const passwordHash = await hashPassword(password);
    db.prepare(`
      UPDATE users
      SET password_hash = ?, password_reset_token_hash = NULL, password_reset_expires_at = NULL, updated_at = ?
      WHERE id = ?
    `).run(passwordHash, nowIso(), user.id);

    createNotification(user.email, 'Password Updated', 'Your Dink Card password was changed successfully.', 'security', '/account');
    writeAudit({ actor: user.email, userId: user.email, action: 'password_reset_completed', entityType: 'auth' });
    res.json({ message: 'Password updated successfully.' });
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

  app.delete('/api/auth/account', authMiddleware(db), async (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'user') {
      return res.status(403).json({ message: 'This account must be removed from the admin side.' });
    }

    const password = String(req.body?.password || '');
    const validPassword = await comparePassword(password, user.password_hash);
    if (!validPassword) {
      writeAudit({ actor: user.email, userId: user.email, action: 'account_delete_failed', entityType: 'auth', reason: 'invalid_password' });
      return res.status(401).json({ message: 'Password confirmation failed.' });
    }

    const uploadUrls = collectUserUploadUrls(user.email);
    await cleanupBitnobResourcesForUser(user, user.email, req, 'Account deleted by user');
    deleteUserCascade(user);
    uploadUrls.forEach(removeUploadUrl);
    clearSessionCookie(res);

    writeAudit({
      actor: user.email,
      userId: user.email,
      action: 'account_deleted_by_user',
      entityType: 'user',
      entityId: user.id,
      oldValue: sanitizeUser(user)
    });

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

    ensureWallet(user.email);
    return res.json(serializeTwoFactorUser(user));
  });

  app.patch('/api/auth/me', authMiddleware(db), (req, res) => {
    const updates = [];
    const values = [];
    const approvedKyc = db.prepare(`
      SELECT id FROM kyc_submissions
      WHERE user_id = ? AND status = 'approved'
      ORDER BY created_at DESC LIMIT 1
    `).get(req.user.email);

    const requestedFirstName = typeof req.body.first_name === 'string' ? String(req.body.first_name).trim() : null;
    const requestedLastName = typeof req.body.last_name === 'string' ? String(req.body.last_name).trim() : null;
    if (!approvedKyc && (requestedFirstName !== null || requestedLastName !== null || typeof req.body.full_name === 'string')) {
      const current = db.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(req.user.id);
      const firstName = requestedFirstName ?? current?.first_name ?? '';
      const lastName = requestedLastName ?? current?.last_name ?? '';
      const fullName = String(req.body.full_name || `${firstName} ${lastName}`.trim()).trim();
      if (!firstName || !lastName) return res.status(400).json({ message: 'First name and last name are required.' });
      updates.push('first_name = ?', 'last_name = ?', 'full_name = ?');
      values.push(firstName, lastName, fullName);
    }

    if (!approvedKyc && typeof req.body.phone === 'string') {
      const normalizedPhone = normalizeEthiopianPhone(req.body.phone);
      const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(normalizedPhone, req.user.id);
      if (existingPhone) return res.status(409).json({ message: 'That phone number is already in use.' });
      updates.push('phone = ?');
      values.push(normalizedPhone);
    }

    if (typeof req.body.username === 'string') {
      const username = normalizeUsername(req.body.username);
      if (username) {
        if (!/^[a-z0-9_]+$/.test(username)) return res.status(400).json({ message: 'Username can only contain letters, numbers, and underscore.' });
        const existing = db.prepare('SELECT id FROM users WHERE lower(username) = ? AND id != ?').get(username, req.user.id);
        if (existing) return res.status(409).json({ message: 'That username is already in use.' });
      }
      updates.push('username = ?');
      values.push(username || null);
    }

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

  app.post('/api/wallet/share/lookup', authMiddleware(db), (req, res) => {
    const identifier = String(req.body?.identifier || '').trim();
    if (!identifier) return res.status(400).json({ message: 'Enter an email, phone number, or username.' });
    const recipient = findUserByIdentifier(identifier);
    if (!recipient || recipient.id === req.user.id) {
      return res.status(404).json({ message: 'Receiver not found.' });
    }
    res.json({
      id: recipient.id,
      email: recipient.email,
      phone: recipient.phone,
      username: recipient.username,
      full_name: recipient.full_name || `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim()
    });
  });

  app.post('/api/wallet/share', authMiddleware(db), (req, res) => {
    try {
      const identifier = String(req.body?.identifier || '').trim();
      const amount = Number(req.body?.amount || 0);
      if (!identifier) return res.status(400).json({ message: 'Choose a receiver first.' });
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Enter a valid amount.' });

      const recipient = findUserByIdentifier(identifier);
      if (!recipient || recipient.id === req.user.id) {
        return res.status(404).json({ message: 'Receiver not found.' });
      }

      ensureWallet(req.user.email);
      ensureWallet(recipient.email);
      const transferId = `SND-${Date.now()}-${generateId('bal')}`;
      debitWallet(req.user.email, amount, 'balance_share_sent', `Sent money to ${recipient.full_name || recipient.email}`, `${transferId}-debit`);
      creditWallet(recipient.email, amount, 'balance_share_received', `Received money from ${req.user.full_name || req.user.email}`, `${transferId}-credit`);
      createNotification(recipient.email, 'Balance Received', `$${money(amount).toFixed(2)} was shared to you by ${req.user.full_name || req.user.email}.`, 'wallet', '/wallet');
      createNotification(req.user.email, 'Balance Sent', `You shared $${money(amount).toFixed(2)} to ${recipient.full_name || recipient.email}.`, 'wallet', '/wallet');
      writeAudit({
        actor: req.user.email,
        userId: recipient.email,
        action: 'balance_shared',
        entityType: 'wallet',
        entityId: transferId,
        newValue: { from: req.user.email, to: recipient.email, amount: money(amount) },
        req
      });
      res.json({
        ok: true,
        reference: transferId,
        amount: money(amount),
        receiver: {
          full_name: recipient.full_name || `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim(),
          email: recipient.email
        }
      });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Balance share failed.' });
    }
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
        reconcilePendingUsdcDeposits();
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
      const totalUsd = money(usdc + usdt);
      res.json({ provider, environment: config.bitnob.env, usdc, usdt, btc, stableUsd: totalUsd, totalUsd });
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
      const [customersProvider, cardsProvider] = await Promise.all([
        bitnobService.listCustomers(),
        bitnobService.listCards()
      ]);
      const providerCustomers = normalizeProviderList(customersProvider);
      const savedCustomers = providerCustomers.map((customer) => saveBitnobCustomer({ providerResponse: customer, providerCustomer: customer }));
      const customerByBitnobId = new Map(savedCustomers.map((customer) => [customer.bitnob_customer_id, customer]));
      const providerCards = normalizeProviderList(cardsProvider);
      const savedCards = providerCards.map((card) => {
        const providerCustomerId = card.customer_id || card.customerId || '';
        return providerCardToDb({
          card,
          customer: customerByBitnobId.get(providerCustomerId),
          fallbackUserId: customerByBitnobId.get(providerCustomerId)?.user_id || card.customer_email || card.email || '',
          nickname: card.name || 'Virtual Card',
          providerPayload: card
        });
      });
      writeAudit({
        actor: req.user.email,
        userId: req.user.email,
        action: 'bitnob_sync_completed',
        entityType: 'bitnob_customer',
        environment: config.bitnob.env,
        provider: 'bitnob',
        providerStatus: 'success',
        providerResponse: { importedCustomers: savedCustomers.length, importedCards: savedCards.length },
        req
      });
      res.json({ imported: savedCustomers.length, importedCustomers: savedCustomers.length, importedCards: savedCards.length, customers: savedCustomers, cards: savedCards });
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
        contactless_payment: req.body.contactless_payment !== false,
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

    const allowedRoles = new Set(['user', 'support', 'support_response', 'kyc_checker', 'admin', 'superadmin']);
    const requestedRole = String(req.body.role || '').trim().toLowerCase();
    const nextRole = allowedRoles.has(requestedRole) ? requestedRole : 'user';
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

  app.post('/api/admin/users/create-staff', authMiddleware(db), async (req, res) => {
    if (!requireSuperadmin(req, res)) return;

    try {
      const fullName = String(req.body.fullName || req.body.full_name || '').trim();
      const email = String(req.body.email || '').trim().toLowerCase();
      const username = normalizeUsername(req.body.username);
      const password = String(req.body.password || '');
      const role = String(req.body.role || '').trim().toLowerCase();
      const allowedRoles = new Set(['support', 'support_response', 'kyc_checker', 'admin', 'superadmin']);

      if (!fullName || !email || !username || !password) {
        return res.status(400).json({ message: 'Full name, email, username, and password are required.' });
      }
      if (!allowedRoles.has(role)) {
        return res.status(400).json({ message: 'Role must be support, support response, KYC checker, admin, or superadmin.' });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters.' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
      }

      const duplicate = db.prepare("SELECT id FROM users WHERE lower(email) = ? OR lower(ifnull(username, '')) = ?").get(email, username);
      if (duplicate) {
        return res.status(409).json({ message: 'A user with that email or username already exists.' });
      }

      const now = nowIso();
      const userId = generateId('usr');
      const passwordHash = await hashPassword(password);

      db.prepare(`
        INSERT INTO users (id, email, username, password_hash, first_name, last_name, full_name, phone, role, terms_accepted_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        email,
        username,
        passwordHash,
        fullName.split(/\s+/)[0] || fullName,
        fullName.split(/\s+/).slice(1).join(' '),
        fullName,
        req.body.phone ? normalizeEthiopianPhone(req.body.phone) : '',
        role,
        config.termsVersion,
        now,
        now
      );

      db.prepare(`
        INSERT INTO wallets (id, user_id, currency, available_balance, locked_balance, status, created_at, updated_at)
        VALUES (?, ?, 'USD', 0, 0, 'active', ?, ?)
      `).run(generateId('wal'), email, now, now);

      const created = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      writeAudit({
        actor: req.user.email,
        userId: created.email,
        action: 'staff_account_created',
        entityType: 'user',
        entityId: created.id,
        newValue: { role: created.role, username: created.username },
        reason: req.body.reason || null,
        req
      });

      res.status(201).json(sanitizeUser(created));
    } catch (error) {
      res.status(400).json({ message: error.message || 'Could not create staff account.' });
    }
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

  app.post('/api/admin/system/clear-data', authMiddleware(db), (req, res) => {
    if (!requireSuperadmin(req, res)) return;

    const scope = String(req.body?.scope || 'all');
    const allowedScopes = new Set(['notifications', 'deposits', 'cards', 'customers', 'kyc', 'support', 'transactions', 'audit', 'webhooks', 'all']);
    if (!allowedScopes.has(scope)) {
      return res.status(400).json({ message: 'Unsupported clear-data scope.' });
    }

    try {
      const removedUploads = clearOperationalData(scope);
      writeAudit({
        actor: req.user.email,
        userId: null,
        action: 'system_data_cleared',
        entityType: 'system',
        entityId: scope,
        newValue: { scope, removedUploads }
      });
      res.json({ ok: true, scope, removedUploads });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Could not clear data.' });
    }
  });

  app.delete('/api/admin/users/:id', authMiddleware(db), async (req, res) => {
    if (!requireSuperadmin(req, res)) return;

    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    if (!target) return res.status(404).json({ message: 'User not found' });

    if (target.role === 'superadmin' || target.id === req.user.id) {
      return res.status(400).json({ message: 'This account cannot be deleted.' });
    }

    const reason = String(req.body?.reason || '').trim() || 'Deleted by superadmin';
    const uploadUrls = collectUserUploadUrls(target.email);
    await cleanupBitnobResourcesForUser(target, req.user.email, req, reason);

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

  app.get('/api/payments/crypto/networks', authMiddleware(db), async (req, res) => {
    try {
      const currency = String(req.query.currency || 'USDC').toUpperCase();
      if (!['USDC', 'USDT', 'BTC'].includes(currency)) {
        return res.status(400).json({ message: 'Choose USDC, USDT, or BTC.' });
      }
      const supportedChains = await bitnobService.getSupportedChains();
      const networks = normalizeStablecoinChains(supportedChains, currency);
      res.json({ currency, networks });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to load deposit networks right now.' });
    }
  });

  app.post('/api/payments/crypto/address', authMiddleware(db), async (req, res) => {
    try {
      const approvedKyc = db.prepare(`
        SELECT id FROM kyc_submissions
        WHERE user_id = ? AND status = 'approved'
        ORDER BY created_at DESC LIMIT 1
      `).get(req.user.email);
      if (!approvedKyc) {
        return res.status(400).json({ message: 'Approved KYC is required before adding funds.' });
      }

      const settings = getFeeSettings();
      const amountUsd = Number(req.body?.amountUsd || 0);
      const network = String(req.body?.network || '').trim();
      const currency = String(req.body?.currency || 'USDC').toUpperCase();
      if (!['USDC', 'USDT', 'BTC'].includes(currency)) {
        return res.status(400).json({ message: 'Choose USDC, USDT, or BTC.' });
      }
      if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
        return res.status(400).json({ message: 'Enter a valid USD amount.' });
      }
      if (amountUsd < Number(settings.min_deposit_usd || 5)) {
        return res.status(400).json({ message: `Minimum deposit is $${Number(settings.min_deposit_usd || 5).toFixed(2)}.` });
      }
      if (amountUsd > Number(settings.max_deposit_usd || 1000)) {
        return res.status(400).json({ message: `Maximum deposit is $${Number(settings.max_deposit_usd || 1000).toFixed(2)}.` });
      }
      if (!network) {
        return res.status(400).json({ message: `Choose a ${currency} network first.` });
      }

      const supportedChains = await bitnobService.getSupportedChains();
      const networks = normalizeStablecoinChains(supportedChains, currency);
      const selectedNetwork = networks.find((item) => item.value.toUpperCase() === network.toUpperCase());
      if (!selectedNetwork) {
        return res.status(400).json({ message: `That ${currency} network is not available right now.` });
      }

      db.prepare(`
        UPDATE deposits
        SET status = 'cancelled',
            provider_status = 'replaced',
            rejection_reason = 'Replaced by a newer USDC funding request.',
            updated_at = ?
        WHERE user_id = ?
          AND payment_method = 'crypto'
          AND status IN ('pending_transfer', 'awaiting_review')
      `).run(nowIso(), req.user.email);

      const txRef = `dinkcard_${currency.toLowerCase()}_${generateId('tx')}`;
      const providerResponse = await bitnobService.generateAddress({
        chain: selectedNetwork.value,
        currency,
        asset: currency,
        customer_email: req.user.email,
        label: `Dink Card ${currency} ${selectedNetwork.label}`,
        reference: txRef
      });
      const address = extractGeneratedAddress(providerResponse);
      if (!address) {
        return res.status(400).json({ message: 'A deposit address was not returned for that network.' });
      }

      const rate = Number(settings.usd_to_etb_rate || 190);
      const etbEquivalent = money(amountUsd * rate);
      const now = nowIso();
      const depositId = generateId('dep');
      db.prepare(`
        INSERT INTO deposits (
          id, user_id, payment_method, payment_currency, payment_network, payment_address, payment_amount,
          requested_usd_amount, exchange_rate, etb_amount, service_fee_etb, gateway_fee_etb, total_payable_etb,
          final_usd_credit, sender_name, sender_phone, transaction_reference, status, provider_status, provider_payload,
          source, created_at, updated_at
        ) VALUES (?, ?, 'crypto', ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 'pending_transfer', 'address_generated', ?, 'dinkcard', ?, ?)
      `).run(
        depositId,
        req.user.email,
        currency,
        selectedNetwork.value,
        address,
        money(amountUsd),
        money(amountUsd),
        rate,
        etbEquivalent,
        etbEquivalent,
        money(amountUsd),
        req.user.full_name || req.user.email,
        req.user.phone || '',
        txRef,
        JSON.stringify(providerResponse || {}),
        now,
        now
      );

      res.status(201).json({
        id: depositId,
        reference: txRef,
        currency,
        network: selectedNetwork.value,
        address,
        amountUsd: money(amountUsd),
        amountCrypto: money(amountUsd)
      });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to create a funding address right now.' });
    }
  });

  app.post('/api/payments/usdc/:depositId/submit', authMiddleware(db), (req, res) => {
    try {
      const deposit = db.prepare('SELECT * FROM deposits WHERE id = ? AND user_id = ?').get(req.params.depositId, req.user.email);
      if (!deposit) return res.status(404).json({ message: 'Funding request not found.' });
      if (!['usdc', 'crypto'].includes(deposit.payment_method)) return res.status(400).json({ message: 'This funding request is not a crypto transfer.' });
      if (!['pending_transfer', 'awaiting_review'].includes(deposit.status)) {
        return res.status(400).json({ message: 'This funding request can no longer be submitted.' });
      }

      const txHash = String(req.body?.txHash || '').trim();
      const now = nowIso();
      db.prepare(`
        UPDATE deposits
        SET status = 'awaiting_review',
            provider_status = 'submitted_by_user',
            tx_hash = ?,
            updated_at = ?
        WHERE id = ?
      `).run(txHash || null, now, deposit.id);

      createNotification(req.user.email, 'USDC Transfer Submitted', 'Your USDC funding request is awaiting admin verification.', 'deposit', '/dashboard');
      writeAudit({
        actor: req.user.email,
        userId: req.user.email,
        action: 'usdc_funding_submitted',
        entityType: 'deposit',
        entityId: deposit.id,
        newValue: { network: deposit.payment_network, amount: deposit.payment_amount, txHash: txHash || null },
        req
      });

      res.json(mapRow(db.prepare('SELECT * FROM deposits WHERE id = ?').get(deposit.id)));
    } catch (error) {
      res.status(400).json({ message: error.message || 'Unable to submit this USDC transfer right now.' });
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
      await changeCardStatus(req.user, req.params.id, req.body.status, req.body.pin);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/cards/:id/transactions', authMiddleware(db), async (req, res) => {
    try {
      const transactions = await getVirtualCardTransactions(req.user, req.params.id);
      res.json({ transactions });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/cards/:id/pin', authMiddleware(db), async (req, res) => {
    try {
      await setCardPin(req.user, req.params.id, req.body.pin);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete('/api/cards/:id', authMiddleware(db), async (req, res) => {
    try {
      await terminateCard(req.user, req.params.id, req.body?.pin);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/cards/:id/reveal', authMiddleware(db), async (req, res) => {
    try {
      const details = await revealCardDetails(req.user, req.params.id, req.body.pin);
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

  app.post('/api/admin/kyc/:id/unapprove', authMiddleware(db), (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;

      const kyc = db.prepare('SELECT * FROM kyc_submissions WHERE id = ?').get(req.params.id);
      if (!kyc) return res.status(404).json({ message: 'KYC submission not found' });
      if (kyc.status !== 'approved') return res.status(400).json({ message: 'Only approved KYC can be reopened.' });

      const now = nowIso();
      db.prepare(`
        UPDATE kyc_submissions
        SET status = 'pending',
            level = 0,
            reviewed_by = ?,
            reviewed_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(req.user.email, now, now, kyc.id);

      createNotification(kyc.user_id, 'KYC Reopened', 'Your KYC approval was removed and your profile is back in review.', 'kyc', '/kyc');
      writeAudit({
        actor: req.user.email,
        userId: kyc.user_id,
        action: 'kyc_approval_removed',
        entityType: 'kyc_submission',
        entityId: kyc.id,
        oldValue: kyc,
        newValue: { status: 'pending', level: 0 },
        reason: String(req.body?.reason || '').trim() || 'Approval removed by admin',
        req
      });

      res.json(mapRow(db.prepare('SELECT * FROM kyc_submissions WHERE id = ?').get(kyc.id)));
    } catch (error) {
      res.status(400).json({ message: error.message || 'Could not remove KYC approval.' });
    }
  });

  app.post('/api/admin/kyc/:id/manual-review', authMiddleware(db), (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const kyc = db.prepare('SELECT * FROM kyc_submissions WHERE id = ?').get(req.params.id);
      if (!kyc) return res.status(404).json({ message: 'KYC submission not found' });
      const now = nowIso();
      db.prepare(`
        UPDATE kyc_submissions
        SET status = 'manual_review', rejection_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(String(req.body.reason || 'Marked for manual review.'), req.user.email, now, now, kyc.id);
      res.json(mapRow(db.prepare('SELECT * FROM kyc_submissions WHERE id = ?').get(kyc.id)));
    } catch (error) {
      res.status(400).json({ message: error.message || 'Could not mark KYC for manual review.' });
    }
  });

  app.delete('/api/admin/audit-logs/:id', authMiddleware(db), (req, res) => {
    if (!requireSuperadmin(req, res)) return;
    const log = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(req.params.id);
    if (!log) return res.status(404).json({ message: 'Audit log not found' });
    db.prepare('DELETE FROM audit_logs WHERE id = ?').run(log.id);
    res.json({ ok: true });
  });

  app.get('/api/kyc/status', authMiddleware(db), (req, res) => {
    const kyc = db.prepare(`
      SELECT * FROM kyc_submissions
      WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(req.user.email);
    res.json(kyc ? mapRow(kyc) : { status: 'not_started' });
  });

  app.post('/api/kyc/submit', authMiddleware(db), (req, res) => {
    try {
      const existing = db.prepare(`
        SELECT * FROM kyc_submissions
        WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(req.user.email);
      const result = existing?.id
        ? updateEntity(db, 'KYCSubmission', existing.id, req.body, req.user)
        : createEntity(db, 'KYCSubmission', { ...req.body, user_id: req.user.email }, req.user);
      res.status(existing?.id ? 200 : 201).json(result);
    } catch (error) {
      res.status(400).json({ message: error.message || 'KYC submission failed.' });
    }
  });

  app.post('/api/kyc/webhook', (req, res) => {
    res.json({ ok: true, message: 'KYC webhook placeholder ready.' });
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
