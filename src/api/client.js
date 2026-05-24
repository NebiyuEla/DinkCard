const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
  } catch {
    const networkError = new Error('Cannot reach the server. Make sure the backend is running and try again.');
    networkError.status = 0;
    throw networkError;
  }

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const payload = await response.json();
      message = payload.message || message;
    } catch {}
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

function validateUploadFile(file) {
  if (!file) throw new Error('Choose a file to upload.');
  if (file.size > UPLOAD_MAX_BYTES) throw new Error('File is too large. Upload a file under 10MB.');
}

function buildQuery(filter, sort, limit) {
  const params = new URLSearchParams();
  if (filter && Object.keys(filter).length) params.set('filter', JSON.stringify(filter));
  if (sort) params.set('sort', sort);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return query ? `?${query}` : '';
}

function entityApi(entity) {
  return {
    list: (sort = '-created_date', limit = 100) =>
      request(`/api/entities/${entity}${buildQuery({}, sort, limit)}`),
    filter: (filter = {}, sort = '-created_date', limit) =>
      request(`/api/entities/${entity}${buildQuery(filter, sort, limit)}`),
    create: (data) => request(`/api/entities/${entity}`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/entities/${entity}/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  };
}

export const apiClient = {
  auth: {
    me: () => request('/api/auth/me'),
    login: (payload) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
    verifyTwoFactorLogin: (payload) => request('/api/auth/login/2fa', { method: 'POST', body: JSON.stringify(payload) }),
    register: (payload) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
    requestPasswordReset: (payload) => request('/api/auth/password-reset/request', { method: 'POST', body: JSON.stringify(payload) }),
    confirmPasswordReset: (payload) => request('/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify(payload) }),
    logout: async (redirectTo = '/') => {
      try {
        await request('/api/auth/logout', { method: 'POST' });
      } finally {
        localStorage.clear();
        sessionStorage.clear();
      }
      window.location.href = redirectTo;
    },
    updateMe: (payload) => request('/api/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),
    getTwoFactorStatus: () => request('/api/auth/2fa/status'),
    setupTwoFactor: (payload) => request('/api/auth/2fa/setup', { method: 'POST', body: JSON.stringify(payload) }),
    enableTwoFactor: (payload) => request('/api/auth/2fa/enable', { method: 'POST', body: JSON.stringify(payload) }),
    disableTwoFactor: (payload) => request('/api/auth/2fa/disable', { method: 'POST', body: JSON.stringify(payload) }),
    deleteAccount: (payload) => request('/api/auth/account', { method: 'DELETE', body: JSON.stringify(payload) })
  },
  entities: {
    User: entityApi('User'),
    Wallet: entityApi('Wallet'),
    WalletTransaction: entityApi('WalletTransaction'),
    KYCSubmission: entityApi('KYCSubmission'),
    VirtualCard: entityApi('VirtualCard'),
    Deposit: entityApi('Deposit'),
    Notification: entityApi('Notification'),
    SupportTicket: entityApi('SupportTicket'),
    SupportMessage: entityApi('SupportMessage'),
    FeeSettings: entityApi('FeeSettings'),
    CardFundingRequest: entityApi('CardFundingRequest'),
    AuditLog: entityApi('AuditLog'),
    PaymentMethod: entityApi('PaymentMethod')
  },
  integrations: {
    Core: {
      UploadFile: async ({ file }) => {
        validateUploadFile(file);
        const form = new FormData();
        form.append('file', file);
        let response;
        try {
          response = await fetch(`${API_BASE_URL}/api/uploads`, {
            method: 'POST',
            credentials: 'include',
            body: form
          });
        } catch {
          throw new Error('Upload could not reach the server. Check your connection and try again.');
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || 'Upload failed');
        }
        return response.json();
      }
    }
  },
  payments: {
    initializeChapa: (payload) => request('/api/payments/chapa/initialize', { method: 'POST', body: JSON.stringify(payload) }),
    getChapaStatus: (txRef) => request(`/api/payments/chapa/status/${encodeURIComponent(txRef)}`),
    invoiceUrl: (txRef) => `${API_BASE_URL}/api/payments/invoice/${encodeURIComponent(txRef)}/download`
  },
  wallet: {
    lookupShareRecipient: (identifier) => request('/api/wallet/share/lookup', { method: 'POST', body: JSON.stringify({ identifier }) }),
    shareBalance: (payload) => request('/api/wallet/share', { method: 'POST', body: JSON.stringify(payload) })
  },
  notifications: {
    markRead: (id) => request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
    markAllRead: () => request('/api/notifications/read-all', { method: 'POST' })
  },
  cards: {
    create: (payload) => request('/api/cards', { method: 'POST', body: JSON.stringify(payload) }),
    fund: (cardId, amount) => request(`/api/cards/${cardId}/fund`, { method: 'POST', body: JSON.stringify({ amount }) }),
    updateStatus: (cardId, status, pin) => request(`/api/cards/${cardId}/status`, { method: 'POST', body: JSON.stringify({ status, pin }) }),
    terminate: (cardId, pin) => request(`/api/cards/${cardId}`, { method: 'DELETE', body: JSON.stringify({ pin }) }),
    reveal: (cardId, pin) => request(`/api/cards/${cardId}/reveal`, { method: 'POST', body: JSON.stringify({ pin }) }),
    setPin: (cardId, pin) => request(`/api/cards/${cardId}/pin`, { method: 'POST', body: JSON.stringify({ pin }) })
  },
  admin: {
    kyc: {
      approve: (id) => request(`/api/admin/kyc/${id}/approve`, { method: 'POST' }),
      unapprove: (id, payload) => request(`/api/admin/kyc/${id}/unapprove`, { method: 'POST', body: JSON.stringify(payload || {}) }),
      requestFix: (id, payload) => request(`/api/admin/kyc/${id}/reject`, { method: 'POST', body: JSON.stringify(payload) }),
      manualReview: (id, payload) => request(`/api/admin/kyc/${id}/manual-review`, { method: 'POST', body: JSON.stringify(payload || {}) })
    },
    users: {
      suspend: (id, reason) => request(`/api/admin/users/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),
      activate: (id) => request(`/api/admin/users/${id}/activate`, { method: 'POST' }),
      setRole: (id, role, reason) => request(`/api/admin/users/${id}/role`, { method: 'POST', body: JSON.stringify({ role, reason }) }),
      addMoney: (id, payload) => request(`/api/admin/users/${id}/add-money`, { method: 'POST', body: JSON.stringify(payload) }),
      setBalance: (id, payload) => request(`/api/admin/users/${id}/set-balance`, { method: 'POST', body: JSON.stringify(payload) }),
      passKyc: (id, payload) => request(`/api/admin/users/${id}/pass-kyc`, { method: 'POST', body: JSON.stringify(payload) }),
      createManualCard: (id, payload) => request(`/api/admin/users/${id}/manual-card`, { method: 'POST', body: JSON.stringify(payload) }),
      createStaff: (payload) => request('/api/admin/users/create-staff', { method: 'POST', body: JSON.stringify(payload) }),
      delete: (id, reason) => request(`/api/admin/users/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) })
    },
    cards: {
      suspend: (id, reason) => request(`/api/admin/cards/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),
      activate: (id, reason) => request(`/api/admin/cards/${id}/activate`, { method: 'POST', body: JSON.stringify({ reason }) }),
      terminate: (id, reason) => request(`/api/admin/cards/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
      list: () => request('/api/admin/cards'),
      get: (id) => request(`/api/admin/cards/${encodeURIComponent(id)}`),
      create: (payload) => request('/api/admin/cards', { method: 'POST', body: JSON.stringify(payload) }),
      fund: (id, payload) => request(`/api/admin/cards/${encodeURIComponent(id)}/fund`, { method: 'POST', body: JSON.stringify(payload) }),
      withdraw: (id, payload) => request(`/api/admin/cards/${encodeURIComponent(id)}/withdraw`, { method: 'POST', body: JSON.stringify(payload) }),
      freeze: (id, payload = {}) => request(`/api/admin/cards/${encodeURIComponent(id)}/freeze`, { method: 'POST', body: JSON.stringify(payload) }),
      unfreeze: (id, payload = {}) => request(`/api/admin/cards/${encodeURIComponent(id)}/unfreeze`, { method: 'POST', body: JSON.stringify(payload) }),
      secure: (id) => request(`/api/admin/cards/${encodeURIComponent(id)}/secure`),
      transactions: (id) => request(`/api/admin/cards/${encodeURIComponent(id)}/transactions`),
      allTransactions: () => request('/api/admin/cards/transactions')
    },
    customers: {
      list: () => request('/api/admin/customers'),
      get: (id) => request(`/api/admin/customers/${encodeURIComponent(id)}`),
      create: (payload) => request('/api/admin/customers', { method: 'POST', body: JSON.stringify(payload) }),
      update: (id, payload) => request(`/api/admin/customers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
      delete: (id, payload) => request(`/api/admin/customers/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify(payload || {}) }),
      syncBitnob: () => request('/api/admin/customers/sync-bitnob', { method: 'POST' }),
      cards: (customerId) => request(`/api/admin/customers/${encodeURIComponent(customerId)}/cards`)
    },
    bitnob: {
      whoami: () => request('/api/admin/bitnob/whoami'),
      balances: () => request('/api/admin/bitnob/balances')
    },
    walletSummary: () => request('/api/admin/wallet-summary'),
    providerStatus: () => request('/api/admin/settings/provider-status'),
    balances: () => request('/api/admin/bitnob/balances'),
    auditLogs: () => request('/api/admin/audit-logs'),
    deleteAuditLog: (id) => request(`/api/admin/audit-logs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    system: {
      clearData: (payload) => request('/api/admin/system/clear-data', { method: 'POST', body: JSON.stringify(payload) })
    }
  }
};

