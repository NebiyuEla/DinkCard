import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import { config } from './config.js';

export function nowIso() {
  return new Date().toISOString();
}

export function generateId(prefix) {
  return `${prefix}_${nanoid(16)}`;
}

export function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    full_name: user.full_name,
    phone: user.phone,
    role: user.role,
    account_status: user.account_status || 'active',
    restricted_reason: user.restricted_reason,
    restricted_by: user.restricted_by,
    restricted_at: user.restricted_at,
    terms_accepted_version: user.terms_accepted_version,
    two_factor_enabled: Boolean(Number(user.two_factor_enabled || 0)),
    created_date: user.created_at,
    updated_date: user.updated_at
  };
}

function getKey() {
  return crypto.createHash('sha256').update(config.encryptionKey).digest();
}

export function encryptValue(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptValue(payload) {
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function hmacSha256Hex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function hmacSha512Hex(secret, payload) {
  return crypto.createHmac('sha512', secret).update(payload).digest('hex');
}

export function money(value) {
  return Number(Number(value || 0).toFixed(2));
}
