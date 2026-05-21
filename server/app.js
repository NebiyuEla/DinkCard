import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { config } from './config.js';
import { db } from './db.js';
import { authMiddleware, clearSessionCookie, comparePassword, hashPassword, readSession, setSessionCookie } from './auth.js';
import { sanitizeUser, parseJson, generateId, nowIso } from './utils.js';
import { createEntity, queryEntities, updateEntity } from './entities.js';
import { approveDeposit, initializeChapaPayment, finalizeChapaDeposit, verifyChapaWebhookSignature } from './payments.js';
import { changeCardStatus, createVirtualCardForUser, fundVirtualCard, handleBitnobWebhook, revealCardDetails, terminateCard, verifyBitnobWebhook } from './bitnob.js';

const UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  (process.env.RENDER ? "/tmp/uploads" : path.join(process.cwd(), "uploads"));

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}


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

function writeAudit({ actor, userId, action, entityType, entityId, oldValue, newValue, reason }) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, admin_id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  return '';
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
    if (allowedUploadTypes.has(file.mimetype) || file.mimetype?.startsWith('image/') || allowedUploadExtensions.has(originalExt)) {
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

function isValidUploadSignature(file) {
  if (!file?.path) return false;
  const header = fs.readFileSync(file.path).subarray(0, 4096);
  const ascii = header.toString('ascii');
  const hex = header.toString('hex');
  const ext = path.extname(file.originalname || file.path).toLowerCase();
  if (hex.startsWith('ffd8ff')) return ['.jpg', '.jpeg'].includes(ext) || file.mimetype === 'image/jpeg';
  if (hex.startsWith('89504e47')) return ext === '.png' || file.mimetype === 'image/png';
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return ext === '.gif' || file.mimetype === 'image/gif';
  if (ascii.startsWith('%PDF')) return ext === '.pdf' || file.mimetype === 'application/pdf';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return ext === '.webp' || file.mimetype === 'image/webp';
  if (ascii.includes('ftypheic') || ascii.includes('ftypheif') || ascii.includes('ftypmif1') || ascii.includes('ftypmsf1')) {
    return ['.heic', '.heif'].includes(ext) || ['image/heic', 'image/heif'].includes(file.mimetype);
  }
  if (file.mimetype?.startsWith('image/') && file.size > 0 && ext !== '.pdf') return true;
  return false;
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
    if (filePath.startsWith(config.uploadDir) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
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

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser(config.cookieSecret));
  const allowedOrigins = new Set([
    config.appUrl,
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ]);
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
    if (fs.existsSync(indexHtml)) {
      return res.sendFile(indexHtml);
    }
    res.status(200).send('DinkCard API is running. Open the frontend on http://localhost:5173');
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
    res.status(201).json({ user: sanitizeUser(user) });
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
    setSessionCookie(res, user);
    writeAudit({ actor: user.email, userId: user.email, action: 'login', entityType: 'auth', newValue: { role: user.role, portal: portal || 'user' } });
    res.json({ user: sanitizeUser(user) });
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
    return res.json(sanitizeUser(user));
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
    res.json(sanitizeUser(user));
  });

  app.post('/api/uploads', authMiddleware(db), uploadLimiter, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'File is required.' });
    if (!isValidUploadSignature(req.file)) {
      removeUploadedFile(req.file);
      return res.status(400).json({ message: 'Upload failed. Please try another file.' });
    }
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
    writeAudit({ actor: req.user.email, userId: target.email, action: 'user_restricted', entityType: 'user', entityId: target.id, oldValue: target, newValue: { account_status: 'suspended' }, reason });
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
    writeAudit({ actor: req.user.email, userId: target.email, action: 'user_restored', entityType: 'user', entityId: target.id, oldValue: target, newValue: { account_status: 'active' } });
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
    writeAudit({ actor: req.user.email, userId: target.email, action: 'user_role_changed', entityType: 'user', entityId: target.id, oldValue: { role: target.role }, newValue: { role: nextRole }, reason: req.body.reason || null });
    res.json(sanitizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)));
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
    writeAudit({ actor: req.user.email, userId: target.email, action: 'user_deleted', entityType: 'user', entityId: target.id, oldValue: sanitizeUser(target), reason });
    res.json({ ok: true });
  });

  app.post('/api/payments/chapa/initialize', authMiddleware(db), async (req, res) => {
    try {
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
      res.json(deposit);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/payments/chapa/callback', async (req, res) => {
    const txRef = req.query.trx_ref || req.query.tx_ref;
    if (txRef) {
      try {
        await finalizeChapaDeposit(txRef);
      } catch {}
    }
    res.redirect(`${config.appUrl}/add-money?tx_ref=${encodeURIComponent(txRef || '')}`);
  });

  app.post('/api/webhooks/chapa', async (req, res) => {
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
  });

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
      writeAudit({ actor: req.user.email, userId: card.user_id, action: 'card_suspended', entityType: 'virtual_card', entityId: card.id, oldValue: card, newValue: { status: 'frozen' }, reason: req.body.reason || null });
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
      writeAudit({ actor: req.user.email, userId: card.user_id, action: 'card_reactivated', entityType: 'virtual_card', entityId: card.id, oldValue: card, newValue: { status: 'active' }, reason: req.body.reason || null });
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
      writeAudit({ actor: req.user.email, userId: card.user_id, action: 'card_terminated', entityType: 'virtual_card', entityId: card.id, oldValue: card, newValue: { status: 'terminated' }, reason: req.body?.reason || null });
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
    writeAudit({ actor: req.user.email, userId: deposit.user_id, action: 'deposit_rejected', entityType: 'deposit', entityId: deposit.id, oldValue: deposit, newValue: { status: 'rejected' }, reason });
    res.json({ ok: true });
  });

  app.post('/api/admin/kyc/:id/approve', authMiddleware(db), (req, res) => {
    if (!requireAdmin(req, res)) return;
    const kyc = db.prepare('SELECT * FROM kyc_submissions WHERE id = ?').get(req.params.id);
    if (!kyc) return res.status(404).json({ message: 'KYC submission not found' });
    const now = nowIso();
    db.prepare(`
      UPDATE kyc_submissions SET status = 'approved', level = 2, reviewed_by = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(req.user.email, now, now, kyc.id);
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
      VALUES (?, ?, 'KYC Approved', 'Your identity has been verified. You now have full access.', 'kyc', 0, ?)
    `).run(generateId('ntf'), kyc.user_id, now);
    writeAudit({ actor: req.user.email, userId: kyc.user_id, action: 'kyc_approved', entityType: 'kyc_submission', entityId: kyc.id, oldValue: kyc, newValue: { status: 'approved' } });
    res.json({ ok: true });
  });

  app.post('/api/admin/kyc/:id/reject', authMiddleware(db), (req, res) => {
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
    res.json({ ok: true });
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
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
        return res.sendFile(indexHtml);
      }
      return next();
    });
  }

  app.use((err, req, res, next) => {
    console.error(err);
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
