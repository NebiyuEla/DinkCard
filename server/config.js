import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const isProduction = process.env.NODE_ENV === 'production';

function must(name, fallback = '') {
  const value = process.env[name];
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  return fallback;
}

function requireProductionSecret(name, value, { minLength = 32 } = {}) {
  if (!isProduction) return;
  const unsafeValues = new Set([
    '',
    'change-me-in-production',
    'change-me-32-char-secret-key-123456',
    'D!nkCard0'
  ]);
  if (!value || unsafeValues.has(value) || String(value).length < minLength) {
    throw new Error(`Production requires a strong ${name}. Set it in the hosting environment.`);
  }
}

export const config = {
  rootDir,
  port: Number(process.env.PORT || 3001),
  appUrl: must('APP_URL', 'http://localhost:5173'),
  apiUrl: must('API_URL', 'http://localhost:3001'),
  databasePath: path.resolve(rootDir, must('DATABASE_PATH', './server/data/dinkcard.db')),
  jwtSecret: must('JWT_SECRET', 'change-me-in-production'),
  cookieSecret: must('COOKIE_SECRET', 'change-me-in-production'),
  encryptionKey: must('CARD_DATA_ENCRYPTION_KEY', 'change-me-32-char-secret-key-123456'),
  uploadDir: path.resolve(rootDir, must('UPLOAD_DIR', './uploads')),
  termsVersion: must('TERMS_VERSION', 'v1.2'),
  superadmin: {
    username: must('SUPERADMIN_USERNAME', 'NebiyuEla'),
    password: must('SUPERADMIN_PASSWORD', 'D!nkCard0'),
    email: must('SUPERADMIN_EMAIL', 'superadmin@dinkcard.cc')
  },
  chapa: {
    mode: must('CHAPA_MODE', 'test'),
    publicKey: must('CHAPA_PUBLIC_KEY'),
    secretKey: must('CHAPA_SECRET_KEY'),
    webhookSecret: must('CHAPA_WEBHOOK_SECRET'),
    callbackUrl: must('CHAPA_CALLBACK_URL', 'http://localhost:3001/api/payments/chapa/callback'),
    returnUrl: must('CHAPA_RETURN_URL', 'http://localhost:5173/add-money')
  },
  bitnob: {
    env: must('BITNOB_ENV', 'sandbox'),
    clientId: must('BITNOB_CLIENT_ID'),
    clientSecret: must('BITNOB_CLIENT_SECRET'),
    baseUrl: must('BITNOB_BASE_URL', 'https://api.bitnob.com'),
    webhookSecret: must('BITNOB_WEBHOOK_SECRET'),
    webhookUrl: must('BITNOB_WEBHOOK_URL', 'http://localhost:3001/api/webhooks/bitnob')
  }
};

requireProductionSecret('JWT_SECRET', config.jwtSecret);
requireProductionSecret('COOKIE_SECRET', config.cookieSecret);
requireProductionSecret('CARD_DATA_ENCRYPTION_KEY', config.encryptionKey);
requireProductionSecret('SUPERADMIN_PASSWORD', config.superadmin.password, { minLength: 12 });
requireProductionSecret('CHAPA_SECRET_KEY', config.chapa.secretKey, { minLength: 12 });
requireProductionSecret('CHAPA_WEBHOOK_SECRET', config.chapa.webhookSecret, { minLength: 12 });
requireProductionSecret('BITNOB_CLIENT_ID', config.bitnob.clientId, { minLength: 12 });
requireProductionSecret('BITNOB_CLIENT_SECRET', config.bitnob.clientSecret, { minLength: 12 });
requireProductionSecret('BITNOB_WEBHOOK_SECRET', config.bitnob.webhookSecret, { minLength: 12 });
