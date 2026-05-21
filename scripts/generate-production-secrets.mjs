import crypto from 'node:crypto';

function secret(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url');
}

console.log(`JWT_SECRET=${secret()}`);
console.log(`COOKIE_SECRET=${secret()}`);
console.log(`CARD_DATA_ENCRYPTION_KEY=${secret(32)}`);
console.log(`CHAPA_WEBHOOK_SECRET=${secret(32)}`);
console.log(`BITNOB_WEBHOOK_SECRET=${secret(32)}`);
