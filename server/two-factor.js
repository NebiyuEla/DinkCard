import crypto from 'node:crypto';
import { decryptValue, encryptValue, parseJson } from './utils.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;

function normalizeBase32(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/[^A-Z2-7]/g, '');
}

export function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeBase32(value) {
  const normalized = normalizeBase32(value);
  let bits = 0;
  let current = 0;
  const bytes = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;

    current = (current << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function totpCounter(offset = 0) {
  return Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS) + offset;
}

function counterBuffer(counter) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  return buffer;
}

function generateHotp(secret, counter) {
  const key = decodeBase32(secret);
  const digest = crypto.createHmac('sha1', key).update(counterBuffer(counter)).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);

  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0');
}

export function verifyTotp(secret, code, window = TOTP_WINDOW) {
  const normalizedCode = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalizedCode)) return false;

  for (let offset = -window; offset <= window; offset += 1) {
    if (generateHotp(secret, totpCounter(offset)) === normalizedCode) {
      return true;
    }
  }

  return false;
}

export function generateTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

export function getOtpAuthUrl({ secret, email }) {
  const issuer = 'Dink Card';
  const label = `${issuer}:${email}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS)
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(String(code || '').trim().toUpperCase()).digest('hex');
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}

export function hashRecoveryCodes(codes) {
  return (codes || []).map(hashRecoveryCode);
}

export function verifyRecoveryCode(user, code) {
  const hashes = parseJson(user.two_factor_recovery_codes, []);
  const incomingHash = hashRecoveryCode(code);
  const index = hashes.findIndex((entry) => entry === incomingHash);

  if (index < 0) return { valid: false, nextHashes: hashes };

  const nextHashes = hashes.filter((_, hashIndex) => hashIndex !== index);
  return { valid: true, nextHashes };
}

export function getTwoFactorSetupForUser(user) {
  const secret = generateTotpSecret();
  return {
    secret,
    encryptedSecret: encryptValue(secret),
    otpauthUrl: getOtpAuthUrl({ secret, email: user.email })
  };
}

export function readEncryptedTwoFactorSecret(value) {
  if (!value) return null;
  try {
    return decryptValue(value);
  } catch {
    return null;
  }
}

export function isTwoFactorEnabled(user) {
  return Boolean(Number(user?.two_factor_enabled || 0));
}

export function verifyTwoFactorCode(user, code) {
  const secret = readEncryptedTwoFactorSecret(user?.two_factor_secret);
  if (secret && verifyTotp(secret, code)) {
    return { valid: true, method: 'totp' };
  }

  const recovery = verifyRecoveryCode(user, code);
  if (recovery.valid) {
    return { valid: true, method: 'recovery', nextRecoveryHashes: recovery.nextHashes };
  }

  return { valid: false };
}

export function replacementRecoveryState() {
  const recoveryCodes = generateRecoveryCodes();
  return {
    recoveryCodes,
    recoveryHashes: hashRecoveryCodes(recoveryCodes)
  };
}

export function formatSecretForDisplay(secret) {
  return String(secret || '').match(/.{1,4}/g)?.join(' ') || '';
}

export function buildTwoFactorRecoverySummary(user) {
  const hashes = parseJson(user?.two_factor_recovery_codes, []);
  return {
    twoFactorEnabled: isTwoFactorEnabled(user),
    remainingRecoveryCodes: hashes.length
  };
}
