import { db, mapRow } from './db.js';
import { generateId, nowIso } from './utils.js';

const tableMap = {
  User: 'users',
  Wallet: 'wallets',
  WalletTransaction: 'wallet_transactions',
  KYCSubmission: 'kyc_submissions',
  VirtualCard: 'virtual_cards',
  Deposit: 'deposits',
  Notification: 'notifications',
  SupportTicket: 'support_tickets',
  SupportMessage: 'support_messages',
  FeeSettings: 'fee_settings',
  CardFundingRequest: 'card_funding_requests',
  AuditLog: 'audit_logs',
  PaymentMethod: 'payment_methods'
};

const fieldMap = {
  User: ['id', 'email', 'username', 'full_name', 'phone', 'role', 'account_status', 'restricted_reason', 'restricted_by', 'restricted_at', 'terms_accepted_version', 'created_at', 'updated_at'],
  Wallet: ['id', 'user_id', 'currency', 'available_balance', 'locked_balance', 'status', 'created_at', 'updated_at'],
  WalletTransaction: ['id', 'user_id', 'wallet_id', 'type', 'amount', 'currency', 'balance_before', 'balance_after', 'status', 'reference', 'description', 'metadata', 'created_at'],
  KYCSubmission: ['id', 'user_id', 'legal_name', 'date_of_birth', 'gender', 'phone', 'email', 'address', 'city', 'country', 'id_type', 'id_number', 'front_id_url', 'back_id_url', 'selfie_url', 'level', 'status', 'rejection_reason', 'resubmission_scope', 'resubmission_fields', 'reviewed_by', 'reviewed_at', 'created_at', 'updated_at'],
  VirtualCard: ['id', 'user_id', 'provider', 'provider_card_id', 'customer_reference', 'card_nickname', 'card_type', 'brand', 'currency', 'last_four', 'expiry_month', 'expiry_year', 'balance', 'status', 'billing_address', 'masked_pan', 'meta', 'created_at', 'updated_at'],
  Deposit: ['id', 'user_id', 'payment_method', 'requested_usd_amount', 'exchange_rate', 'etb_amount', 'service_fee_etb', 'gateway_fee_etb', 'total_payable_etb', 'final_usd_credit', 'proof_url', 'sender_name', 'sender_phone', 'transaction_reference', 'status', 'rejection_reason', 'approved_by', 'approved_at', 'admin_note', 'promo_code', 'provider_reference', 'provider_status', 'provider_payload', 'source', 'verified_at', 'checkout_url', 'created_at', 'updated_at'],
  Notification: ['id', 'user_id', 'title', 'message', 'type', 'read', 'link', 'created_at'],
  SupportTicket: ['id', 'user_id', 'category', 'subject', 'message', 'screenshot_url', 'related_transaction_id', 'related_card_id', 'status', 'priority', 'created_at', 'updated_at'],
  SupportMessage: ['id', 'ticket_id', 'sender_type', 'sender_id', 'message', 'attachment_url', 'created_at'],
  FeeSettings: ['id', 'key', 'usd_to_etb_rate', 'deposit_fee_percentage', 'deposit_fixed_fee_etb', 'card_creation_fee_usd', 'card_funding_fee_percentage', 'card_withdrawal_fee_percentage', 'min_deposit_usd', 'max_deposit_usd', 'daily_deposit_limit_usd', 'monthly_deposit_limit_usd', 'min_card_funding_usd', 'max_card_funding_usd', 'max_cards_per_user', 'kyc_level1_deposit_limit', 'kyc_level2_deposit_limit', 'created_at', 'updated_at'],
  CardFundingRequest: ['id', 'user_id', 'card_id', 'amount', 'fee', 'total_wallet_deduction', 'status', 'provider_reference', 'failure_reason', 'created_at', 'updated_at'],
  AuditLog: ['id', 'admin_id', 'user_id', 'action', 'entity_type', 'entity_id', 'old_value', 'new_value', 'reason', 'created_at'],
  PaymentMethod: ['id', 'name', 'type', 'account_name', 'account_number', 'instructions', 'min_amount_etb', 'max_amount_etb', 'fixed_fee_etb', 'percentage_fee', 'enabled', 'logo_url', 'created_at', 'updated_at']
};

const userCreatable = new Set(['KYCSubmission', 'SupportTicket', 'SupportMessage']);
const adminCreatable = new Set(['AuditLog', 'FeeSettings', 'Notification', 'PaymentMethod', 'SupportMessage']);
const dedicatedEndpointOnly = new Set(['User', 'Wallet', 'WalletTransaction', 'VirtualCard', 'Deposit', 'CardFundingRequest']);

function isAdmin(user) {
  return ['admin', 'superadmin'].includes(user.role);
}

function isOwner(user) {
  return user.role === 'superadmin';
}

function writeAudit({ actor, userId, action, entityType, entityId, oldValue, newValue, reason }) {
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
}

function normalizeField(entity, field) {
  const normalized = String(field || '').replace('created_date', 'created_at').replace('updated_date', 'updated_at');
  if (!fieldMap[entity]?.includes(normalized)) {
    throw new Error(`Unsupported field: ${field}`);
  }
  return normalized;
}

function normalizeSort(entity, sort) {
  const raw = String(sort || '-created_at');
  const direction = raw.startsWith('-') ? 'DESC' : 'ASC';
  const field = normalizeField(entity, raw.replace(/^-/, ''));
  return `${field} ${direction}`;
}

function pick(entity, data, allowedOverride) {
  const allowed = new Set(allowedOverride || fieldMap[entity] || []);
  const payload = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    const field = key.replace('created_date', 'created_at').replace('updated_date', 'updated_at');
    if (allowed.has(field) && !['id', 'created_at', 'updated_at'].includes(field)) {
      payload[field] = value;
    }
  });
  return payload;
}

function requireFields(payload, fields, message) {
  const missing = fields.filter((field) => !String(payload[field] || '').trim());
  if (missing.length) {
    throw new Error(message || `Missing required fields: ${missing.join(', ')}`);
  }
}

function getOwnerField(entity) {
  return ['Wallet', 'KYCSubmission', 'VirtualCard', 'Deposit', 'Notification', 'WalletTransaction', 'SupportTicket', 'CardFundingRequest'].includes(entity)
    ? 'user_id'
    : null;
}

export function queryEntities(entity, { filter = {}, sort, limit }, user) {
  const table = tableMap[entity];
  if (!table) throw new Error('Unsupported entity');
  if (user.role === 'user' && ['AuditLog', 'PaymentMethod'].includes(entity)) {
    throw new Error('Forbidden');
  }
  if (user.role === 'admin' && ['AuditLog', 'FeeSettings', 'PaymentMethod', 'User', 'Wallet', 'WalletTransaction'].includes(entity)) {
    throw new Error('Owner access required');
  }

  const clauses = [];
  const params = [];
  const ownerField = getOwnerField(entity);

  if (user.role === 'user' && ownerField) {
    clauses.push(`${ownerField} = ?`);
    params.push(user.email);
  }
  if (user.role === 'user' && entity === 'SupportMessage') {
    const ticketIds = db.prepare('SELECT id FROM support_tickets WHERE user_id = ?').all(user.email).map((row) => row.id);
    if (!ticketIds.length) return [];
    clauses.push(`ticket_id IN (${ticketIds.map(() => '?').join(', ')})`);
    params.push(...ticketIds);
  }
  if (user.role === 'user' && entity === 'User') {
    clauses.push('email = ?');
    params.push(user.email);
  }

  Object.entries(filter || {}).forEach(([key, value]) => {
    const field = normalizeField(entity, key);
    clauses.push(`${field} = ?`);
    params.push(value);
  });

  const sql = `SELECT * FROM ${table} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY ${normalizeSort(entity, sort)}${limit ? ` LIMIT ${Math.min(Number(limit), 500)}` : ''}`;
  return db.prepare(sql).all(...params).map(mapRow);
}

export function createEntity(entity, data, user) {
  const table = tableMap[entity];
  if (!table) throw new Error('Unsupported entity');
  if (dedicatedEndpointOnly.has(entity)) throw new Error('Use dedicated endpoints for this action');
  if (user.role === 'user' && !userCreatable.has(entity)) throw new Error('Forbidden');
  if (user.role !== 'user' && !adminCreatable.has(entity) && entity !== 'SupportTicket' && entity !== 'KYCSubmission') {
    throw new Error('Forbidden');
  }

  const now = nowIso();
  let payload = pick(entity, data);

  if (entity === 'SupportTicket') {
    payload = pick(entity, data, ['category', 'subject', 'message', 'screenshot_url', 'related_transaction_id', 'related_card_id']);
    payload.user_id = user.email;
    payload.status = 'open';
    payload.priority = 'medium';
  }

  if (entity === 'SupportMessage') {
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(payload.ticket_id);
    if (!ticket) throw new Error('Ticket not found');
    if (user.role === 'user' && ticket.user_id !== user.email) throw new Error('Forbidden');
    payload.sender_type = user.role === 'user' ? 'user' : 'admin';
    payload.sender_id = user.email;
  }

  if (entity === 'KYCSubmission') {
    if (user.role !== 'user') throw new Error('Forbidden');
    payload = pick(entity, data, ['legal_name', 'date_of_birth', 'gender', 'phone', 'address', 'city', 'country', 'id_type', 'id_number', 'front_id_url', 'back_id_url', 'selfie_url']);
    payload.user_id = user.email;
    payload.email = user.email;
    payload.status = 'pending';
    payload.level = 2;
    requireFields(payload, ['legal_name', 'date_of_birth', 'phone', 'id_type', 'id_number', 'front_id_url', 'selfie_url'], 'Complete all required KYC fields and uploads before submitting.');
  }

  if (entity === 'FeeSettings') {
    if (!isOwner(user)) throw new Error('Owner access required');
    payload = normalizeFeeSettings(payload);
    const existing = db.prepare('SELECT id FROM fee_settings WHERE key = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1').get(payload.key);
    if (existing) {
      return updateEntity(entity, existing.id, payload, user);
    }
  }

  if (entity === 'Notification' && !isAdmin(user)) throw new Error('Forbidden');
  if (entity === 'AuditLog' && !isOwner(user)) throw new Error('Owner access required');
  if (entity === 'PaymentMethod' && !isOwner(user)) throw new Error('Owner access required');

  const columns = ['id', ...Object.keys(payload), 'created_at', ...(table === 'support_messages' || table === 'notifications' || table === 'audit_logs' ? [] : ['updated_at'])];
  const values = [generateId(table.slice(0, 3)), ...Object.values(payload), now, ...(table === 'support_messages' || table === 'notifications' || table === 'audit_logs' ? [] : [now])];
  const placeholders = columns.map(() => '?').join(', ');
  db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);
  const created = mapRow(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(values[0]));
  if (isAdmin(user) && ['FeeSettings', 'PaymentMethod', 'SupportMessage', 'SupportTicket'].includes(entity)) {
    writeAudit({
      actor: user.email,
      userId: created.user_id,
      action: `${entity.toLowerCase()}_created`,
      entityType: table,
      entityId: created.id,
      newValue: created
    });
  }
  return created;
}

function normalizeFeeSettings(payload) {
  return {
    ...payload,
    key: payload.key || 'default',
    deposit_fee_percentage: 0,
    deposit_fixed_fee_etb: 0,
    card_funding_fee_percentage: 0
  };
}

export function updateEntity(entity, id, data, user) {
  const table = tableMap[entity];
  if (!table) throw new Error('Unsupported entity');
  const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!existing) throw new Error('Record not found');

  const ownerField = getOwnerField(entity);
  if (ownerField && user.role === 'user' && existing[ownerField] !== user.email) {
    throw new Error('Forbidden');
  }

  let payload = pick(entity, data);

  if (dedicatedEndpointOnly.has(entity)) {
    throw new Error('Use dedicated endpoints for this action');
  }
  if (entity === 'User') {
    throw new Error('Use dedicated endpoints for this action');
  }
  if (entity === 'FeeSettings') {
    if (!isOwner(user)) throw new Error('Owner access required');
    payload = normalizeFeeSettings(payload);
  }
  if (entity === 'Notification') {
    if (user.role === 'user') {
      payload = pick(entity, data, ['read']);
      payload.read = payload.read ? 1 : 0;
    } else if (!isAdmin(user)) {
      throw new Error('Forbidden');
    }
  }
  if (entity === 'SupportTicket') {
    if (!isAdmin(user)) throw new Error('Forbidden');
    payload = pick(entity, data, ['status', 'priority']);
  }
  if (entity === 'KYCSubmission') {
    if (user.role !== 'user') throw new Error('Use dedicated KYC review endpoints');
    if (!['rejected', 'resubmit_required'].includes(existing.status)) {
      throw new Error('Only rejected KYC submissions can be resubmitted.');
    }
    payload = pick(entity, data, ['legal_name', 'date_of_birth', 'gender', 'phone', 'address', 'city', 'country', 'id_type', 'id_number', 'front_id_url', 'back_id_url', 'selfie_url']);
    payload.email = user.email;
    payload.status = 'pending';
    payload.level = 2;
    payload.rejection_reason = null;
    payload.resubmission_scope = null;
    payload.resubmission_fields = null;
    payload.reviewed_by = null;
    payload.reviewed_at = null;
    requireFields(payload, ['legal_name', 'date_of_birth', 'phone', 'id_type', 'id_number', 'front_id_url', 'selfie_url'], 'Complete all required KYC fields and uploads before resubmitting.');
  }
  if (entity === 'PaymentMethod' && !isOwner(user)) throw new Error('Owner access required');
  if (entity === 'AuditLog') throw new Error('Audit logs are immutable');
  if (entity === 'SupportMessage') throw new Error('Support messages are immutable');

  const fields = Object.keys(payload);
  if (!fields.length) throw new Error('No supported fields to update.');
  const values = Object.values(payload);
  if (!['support_messages', 'wallet_transactions', 'notifications', 'audit_logs'].includes(table)) {
    fields.push('updated_at');
    values.push(nowIso());
  }
  const setClause = fields.map((field) => `${field} = ?`).join(', ');
  db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...values, id);
  const updated = mapRow(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
  if (isAdmin(user) && ['FeeSettings', 'PaymentMethod', 'SupportTicket', 'Notification'].includes(entity)) {
    writeAudit({
      actor: user.email,
      userId: updated.user_id,
      action: `${entity.toLowerCase()}_updated`,
      entityType: table,
      entityId: id,
      oldValue: mapRow(existing),
      newValue: updated
    });
  }
  return updated;
}
