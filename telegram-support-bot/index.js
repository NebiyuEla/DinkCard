import fs from 'node:fs';
import path from 'node:path';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://dinkcard.et';
const SUPPORT_URL = process.env.SUPPORT_URL || `${PLATFORM_URL}/contact`;
const SUPERADMIN_ID = String(process.env.SUPERADMIN_ID || '8773629714');
const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'support-state.json');
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required.');
}

const WELCOME_TEXT = `Welcome to Dink Support.

This is the official support platform for Dink services.

You can browse FAQs, find step-by-step help, or open a live support case when you need direct help from our team.

For your safety, never share your password, OTP, recovery code, full card number, CVV, or other private security details here.`;

const SERVICE_CATALOG = [
  {
    id: 'dink_card',
    title: 'Dink Card',
    issues: [
      { id: 'kyc_issue', title: 'KYC issue' },
      { id: 'card_issue', title: 'Card issue' },
      { id: 'funding_issue', title: 'Funding issue' },
      { id: 'login_issue', title: 'Login issue' },
      { id: 'security_issue', title: 'Security issue' },
      { id: 'other_issue', title: 'Other issue' }
    ]
  },
  {
    id: 'dink_pay',
    title: 'Dink Pay',
    issues: [
      { id: 'deposit_issue', title: 'Deposit issue' },
      { id: 'checkout_issue', title: 'Checkout issue' },
      { id: 'payment_delay', title: 'Payment delay' },
      { id: 'refund_issue', title: 'Refund issue' },
      { id: 'verification_issue', title: 'Verification issue' },
      { id: 'other_issue', title: 'Other issue' }
    ]
  },
  {
    id: 'digital_services',
    title: 'Digital Services',
    issues: [
      { id: 'order_problem', title: 'Order problem' },
      { id: 'payment_failed', title: 'Payment failed' },
      { id: 'access_issue', title: 'Access issue' },
      { id: 'refund_issue', title: 'Refund issue' },
      { id: 'delivery_delay', title: 'Delivery delay' },
      { id: 'other_issue', title: 'Other issue' }
    ]
  }
];

const FAQ_CATEGORIES = [
  {
    id: 'getting_started',
    title: 'Getting Started',
    icon: '🚀',
    questions: [
      ['account_setup', 'How do I start using Dink?', 'Create your account, complete KYC, add funds, then request your virtual card from the Cards page.'],
      ['sign_in', 'How can I sign in?', 'You can sign in using email, phone number, or username.'],
      ['card_limit', 'How many cards can I create?', 'A verified account can create up to 3 virtual cards in total.'],
      ['install_app', 'Can I add the site to my home screen?', 'Yes. You can install it from your mobile browser for faster access.'],
      ['best_flow', 'What is the best order to follow?', 'A smooth order is: create account, pass KYC, add funds, request card, then enable 2FA.'],
      ['need_support', 'When should I contact support?', 'Use support if something stays stuck after refresh, if a payment result looks wrong, or if a required action is missing.']
    ]
  },
  {
    id: 'funding',
    title: 'Funding & Deposits',
    icon: '💵',
    questions: [
      ['add_funds_etb', 'How do I add funds in ETB?', 'Open Add Funds, enter the amount, review the total, agree to the notice, then continue to checkout.'],
      ['crypto_deposit', 'Can I deposit with crypto?', 'Yes, if crypto deposit is enabled for your account. Open Add Funds and choose the available crypto option.'],
      ['deposit_pending', 'Why is my deposit pending?', 'A deposit can stay pending during review, provider confirmation, payment verification, or compliance checks.'],
      ['receipt', 'Where do I find my receipt?', 'Open your transactions and use the receipt download option for the payment you made.'],
      ['wrong_amount', 'I sent the wrong amount. What should I do?', 'Open live support and send the payment reference, the exact amount sent, and what you expected to happen.'],
      ['cancelled_checkout', 'What happens if checkout is cancelled?', 'No balance is added when checkout is cancelled or expires. Start a new funding request from Add Funds.']
    ]
  },
  {
    id: 'cards',
    title: 'Cards',
    icon: '💳',
    questions: [
      ['create_card', 'How do I create a card?', 'After KYC approval and enough balance, open Cards and request a new virtual card.'],
      ['create_failed', 'Why did card creation fail?', 'Common reasons are incomplete KYC, low balance, card limit reached, provider downtime, or a review check.'],
      ['reveal_details', 'How do I reveal card details?', 'Open your card, enter your card PIN, then choose Reveal Details.'],
      ['freeze_card', 'How do freeze and unfreeze work?', 'Open the card and use Freeze to pause it. Unfreeze when you want it active again.'],
      ['card_pin', 'Why do I need a card PIN?', 'Your card PIN protects sensitive actions like revealing details and terminating a card.'],
      ['terminated_history', 'Will terminated cards still show?', 'Yes. Terminated cards remain visible in your card history for reference.']
    ]
  },
  {
    id: 'transactions',
    title: 'Transactions',
    icon: '📄',
    questions: [
      ['history', 'Where do I see transaction history?', 'Open Transactions or the card activity section to see recent and older records.'],
      ['declined', 'Why was my payment declined?', 'Declines can happen because of merchant rules, balance issues, billing mismatch, region limits, or provider checks.'],
      ['refunds', 'How do refunds work?', 'Refund timing depends on the transaction stage, provider response, and platform review.'],
      ['stuck', 'My transaction looks stuck. What should I do?', 'Refresh the page first, then check the latest status. If it still looks wrong, contact support with the reference.'],
      ['charge_fee', 'Why do I see a card charge or usage fee?', 'Some card activity can include provider-side or service-side deductions depending on the operation performed.']
    ]
  },
  {
    id: 'kyc',
    title: 'KYC & Verification',
    icon: '🪪',
    questions: [
      ['kyc_required', 'Why is KYC required?', 'KYC is required before card requests and most funding actions.'],
      ['accepted_docs', 'Which ID types are accepted?', 'Passport and Drivers License are supported. Only the front image and selfie are required for these options.'],
      ['kyc_rejected', 'Why was my KYC rejected?', 'Common reasons include blurry image, wrong ID number, missing selfie, incomplete profile details, or mismatched information.'],
      ['resubmit', 'How do I resubmit KYC?', 'Open KYC, correct the requested fields, upload the needed file again, and submit a fresh review.'],
      ['review_time', 'How long does KYC review take?', 'Review time depends on queue size, document clarity, and whether the details need manual review.']
    ]
  },
  {
    id: 'account',
    title: 'Account & Security',
    icon: '🔐',
    questions: [
      ['change_password', 'How do I change my password?', 'Open Account and Security and use Change password.'],
      ['reset_password', 'How do I reset my password?', 'Use Forgot password and confirm with your last name and date of birth.'],
      ['enable_2fa', 'How do I enable 2FA?', 'Open Account and Security and complete the authenticator setup.'],
      ['delete_account', 'Can I delete my account?', 'Yes. Open Account and Security, choose Delete account, and confirm your password.'],
      ['restricted', 'Why is my account restricted?', 'Restrictions can happen after verification issues, repeated failed checks, suspicious activity, or security review.']
    ]
  },
  {
    id: 'digital_services',
    title: 'Digital Services',
    icon: '🌐',
    questions: [
      ['supported_services', 'What can I use the card for?', 'Supported uses may include subscriptions, digital tools, app stores, online services, shopping, and selected ad platforms.'],
      ['works_everywhere', 'Will the card work everywhere?', 'No. Merchant acceptance is not guaranteed and depends on the merchant, region, and provider rules.'],
      ['subscriptions', 'Can I use it for subscriptions?', 'Yes, if the merchant accepts the card and the payment passes provider checks.'],
      ['service_failed', 'A service says payment failed. What should I do?', 'Check your balance, card status, and billing details first. If it still fails, contact support.']
    ]
  },
  {
    id: 'safety',
    title: 'Safety',
    icon: '🛡️',
    questions: [
      ['never_share', 'What should I never share?', 'Never share your password, OTP, recovery codes, full card number, CVV, expiry, or any private security detail.'],
      ['fake_support', 'How do I avoid fake support?', 'Use only official Dink links and verified channels. Never send secrets to anyone claiming to be staff.'],
      ['report_risk', 'How do I report suspicious activity?', `Open ${SUPPORT_URL} or contact security@dinkcard.et.`],
      ['two_factor', 'Should I enable 2FA?', 'Yes. Two-factor authentication adds strong protection to your account.']
    ]
  }
];

const STATUS_LABELS = {
  queued: 'Queued',
  open: 'Open',
  hold: 'On Hold',
  solved: 'Solved',
  cancelled: 'Cancelled',
  closed: 'Closed'
};

const FAQ_CATEGORY_MAP = new Map(FAQ_CATEGORIES.map((category) => [category.id, category]));
const FAQ_QUESTION_MAP = new Map(
  FAQ_CATEGORIES.flatMap((category) =>
    category.questions.map(([id, question, answer]) => [id, { categoryId: category.id, question, answer }])
  )
);
const SERVICE_MAP = new Map(SERVICE_CATALOG.map((service) => [service.id, service]));

function ensureStateFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify(
        {
          admins: [],
          tickets: [],
          sessions: {},
          counters: { ticket: 1 }
        },
        null,
        2
      )
    );
  }
}

function loadState() {
  ensureStateFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const admins = Array.isArray(parsed.admins) ? parsed.admins : [];
    const tickets = Array.isArray(parsed.tickets) ? parsed.tickets.map(normalizeTicket) : [];
    const sessions = parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {};
    const counters = parsed.counters && typeof parsed.counters === 'object' ? parsed.counters : { ticket: 1 };
    return { admins, tickets, sessions, counters };
  } catch {
    return { admins: [], tickets: [], sessions: {}, counters: { ticket: 1 } };
  }
}

let state = loadState();

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function normalizeTicket(ticket) {
  const normalizedStatus = ticket.status === 'active' ? 'open' : ticket.status;
  const service = ticket.service || ticket.path?.split(' -> ')[0] || 'Dink Card';
  const issue = ticket.issue || ticket.path?.split(' -> ')[1] || 'General issue';
  return {
    id: ticket.id,
    userId: String(ticket.userId || ticket.user?.id || ''),
    userChatId: String(ticket.userChatId || ticket.user?.chatId || ''),
    userFullName: ticket.userFullName || ticket.user?.fullName || ticket.user?.name || '',
    userUsername: ticket.userUsername || ticket.user?.username || '',
    contactDetail: ticket.contactDetail || ticket.user?.contactDetail || '',
    service,
    issue,
    path: `${service} -> ${issue}`,
    status: normalizedStatus || 'queued',
    assignedAdminId: ticket.assignedAdminId ? String(ticket.assignedAdminId) : '',
    createdAt: ticket.createdAt || new Date().toISOString(),
    updatedAt: ticket.updatedAt || ticket.createdAt || new Date().toISOString(),
    lastMessage: ticket.lastMessage || '',
    messages: Array.isArray(ticket.messages) ? ticket.messages.map((message) => ({
      id: message.id || `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderType: message.senderType || 'user',
      senderId: String(message.senderId || ''),
      text: message.text || '',
      caption: message.caption || '',
      kind: message.kind || 'text',
      originChatId: String(message.originChatId || ''),
      originMessageId: message.originMessageId ?? null,
      createdAt: message.createdAt || ticket.createdAt || new Date().toISOString()
    })) : []
  };
}

function nowIso() {
  return new Date().toISOString();
}

function isSuperAdmin(chatId) {
  return String(chatId) === SUPERADMIN_ID;
}

function isSupportAdmin(chatId) {
  return state.admins.some((admin) => admin.id === String(chatId));
}

function getSupportAdmin(adminId) {
  return state.admins.find((admin) => admin.id === String(adminId)) || null;
}

function adminLabel(adminId) {
  return getSupportAdmin(adminId)?.label || `Admin ${adminId}`;
}

function getSession(chatId) {
  return state.sessions[String(chatId)] || null;
}

function setSession(chatId, value) {
  state.sessions[String(chatId)] = value;
  saveState();
}

function clearSession(chatId) {
  delete state.sessions[String(chatId)];
  saveState();
}

function createTicketId() {
  const next = Number(state.counters.ticket || 1);
  state.counters.ticket = next + 1;
  saveState();
  return `DK-${String(next).padStart(5, '0')}`;
}

function makeUserLabel(user) {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  if (user?.username) return `@${user.username}`;
  return `User ${user?.id || ''}`.trim();
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function getTicket(ticketId) {
  return state.tickets.find((ticket) => ticket.id === ticketId) || null;
}

function getUserOpenTicket(userId) {
  return state.tickets.find(
    (ticket) =>
      ticket.userId === String(userId) &&
      ['queued', 'open', 'hold'].includes(ticket.status)
  ) || null;
}

function getAdminLoad(adminId) {
  return state.tickets.filter(
    (ticket) =>
      ticket.assignedAdminId === String(adminId) &&
      ['open', 'hold'].includes(ticket.status)
  ).length;
}

function pickAvailableAdmin() {
  const sorted = [...state.admins].sort((left, right) => {
    const loadGap = getAdminLoad(left.id) - getAdminLoad(right.id);
    if (loadGap !== 0) return loadGap;
    return left.label.localeCompare(right.label);
  });
  return sorted.find((admin) => getAdminLoad(admin.id) === 0) || null;
}

function faqHomeKeyboard() {
  return {
    inline_keyboard: [
      ...FAQ_CATEGORIES.map((category) => [{ text: `${category.icon} ${category.title}`, callback_data: `faqcat:${category.id}` }]),
      [{ text: '💬 Contact live support', callback_data: 'support:start' }]
    ]
  };
}

function faqCategoryKeyboard(categoryId) {
  const category = FAQ_CATEGORY_MAP.get(categoryId);
  if (!category) return faqHomeKeyboard();
  return {
    inline_keyboard: [
      ...category.questions.map(([id, question]) => [{ text: question, callback_data: `faqq:${id}` }]),
      [{ text: '⬅️ Back to categories', callback_data: 'faq:home' }],
      [{ text: '💬 Contact live support', callback_data: 'support:start' }]
    ]
  };
}

function supportServiceKeyboard() {
  return {
    inline_keyboard: [
      ...SERVICE_CATALOG.map((service) => [{ text: service.title, callback_data: `svc:${service.id}` }]),
      [{ text: '⬅️ Back to FAQ', callback_data: 'faq:home' }]
    ]
  };
}

function supportIssueKeyboard(serviceId) {
  const service = SERVICE_MAP.get(serviceId);
  if (!service) return supportServiceKeyboard();
  return {
    inline_keyboard: [
      ...service.issues.map((issue) => [{ text: issue.title, callback_data: `iss:${service.id}:${issue.id}` }]),
      [{ text: '⬅️ Back', callback_data: 'support:start' }]
    ]
  };
}

function adminDashboardKeyboard(chatId) {
  if (isSuperAdmin(chatId)) {
    return {
      inline_keyboard: [
        [{ text: '📬 Open tickets', callback_data: 'saview:open' }, { text: '🕓 Queued', callback_data: 'saview:queued' }],
        [{ text: '✅ Solved', callback_data: 'saview:solved' }, { text: '🚫 Cancelled', callback_data: 'saview:cancelled' }],
        [{ text: '📦 Closed', callback_data: 'saview:closed' }, { text: '🗂️ All tickets', callback_data: 'saview:all' }],
        [{ text: '👥 View admins', callback_data: 'sa:admins' }, { text: '➕ Add admin', callback_data: 'sa:add' }]
      ]
    };
  }

  return {
    inline_keyboard: [
      [{ text: '📬 My open cases', callback_data: 'adview:open' }, { text: '⏸️ On hold', callback_data: 'adview:hold' }],
      [{ text: '✅ Solved', callback_data: 'adview:solved' }, { text: '🗂️ All my cases', callback_data: 'adview:all' }]
    ]
  };
}

function ticketActionKeyboard(ticket, viewerRole) {
  const closed = ['solved', 'cancelled', 'closed'].includes(ticket.status);
  const keyboard = [];

  if (viewerRole === 'superadmin') {
    keyboard.push([{ text: '📄 Case details', callback_data: `td:${ticket.id}` }]);

    if (!closed) {
      const assignRows = [];
      for (const admin of state.admins) {
        assignRows.push([{ text: `👤 Assign ${admin.label}`, callback_data: `ta:${ticket.id}:${admin.id}` }]);
      }
      keyboard.push(...assignRows);
      if (ticket.status === 'hold') {
        keyboard.push([{ text: '▶️ Resume', callback_data: `ts:${ticket.id}:open` }]);
      } else {
        keyboard.push([{ text: '⏸️ Hold', callback_data: `ts:${ticket.id}:hold` }]);
      }
      keyboard.push([{ text: '✅ Solved', callback_data: `ts:${ticket.id}:solved` }, { text: '🚫 Cancel', callback_data: `ts:${ticket.id}:cancelled` }]);
      keyboard.push([{ text: '📦 Close', callback_data: `ts:${ticket.id}:closed` }]);
    }
    return { inline_keyboard: keyboard };
  }

  keyboard.push([{ text: '💬 Reply', callback_data: `tr:${ticket.id}` }, { text: '📄 Case details', callback_data: `td:${ticket.id}` }]);
  if (!closed) {
    if (ticket.status === 'hold') {
      keyboard.push([{ text: '▶️ Resume', callback_data: `ts:${ticket.id}:open` }]);
    } else {
      keyboard.push([{ text: '⏸️ Hold', callback_data: `ts:${ticket.id}:hold` }]);
    }
    keyboard.push([{ text: '✅ Solved', callback_data: `ts:${ticket.id}:solved` }, { text: '🚫 Cancel', callback_data: `ts:${ticket.id}:cancelled` }]);
  }
  return { inline_keyboard: keyboard };
}

function formatTicketCard(ticket) {
  return [
    `🎫 Ticket ${ticket.id}`,
    `👤 User: ${ticket.userFullName || 'Unknown user'}`,
    `🆔 Telegram ID: ${ticket.userId}`,
    `💬 Chat ID: ${ticket.userChatId}`,
    `🔗 Username: ${ticket.userUsername || 'N/A'}`,
    `📨 Contact/Login: ${ticket.contactDetail || 'Not provided'}`,
    `🧭 Path: ${ticket.path}`,
    `📌 Status: ${statusLabel(ticket.status)}`,
    `👥 Assigned: ${ticket.assignedAdminId ? `${adminLabel(ticket.assignedAdminId)} (${ticket.assignedAdminId})` : 'Unassigned'}`,
    `📝 Last message: ${ticket.lastMessage || 'No message yet'}`
  ].join('\n');
}

function formatTicketHistory(ticket) {
  if (!ticket.messages.length) {
    return 'No chat history yet.';
  }
  return ticket.messages
    .map((message) => {
      const sender =
        message.senderType === 'admin'
          ? adminLabel(message.senderId)
          : ticket.userFullName || 'User';
      const content = message.text || message.caption || `[${message.kind}]`;
      return `• [${sender}] ${content}`;
    })
    .join('\n');
}

function formatAdminCard(admin) {
  const assigned = state.tickets.filter(
    (ticket) =>
      ticket.assignedAdminId === admin.id &&
      ['open', 'hold'].includes(ticket.status)
  );
  return [
    `👤 ${admin.label}`,
    `🆔 Telegram ID: ${admin.id}`,
    `📬 Active cases: ${assigned.length}`,
    `🎫 Tickets: ${assigned.length ? assigned.map((ticket) => ticket.id).join(', ') : 'None'}`
  ].join('\n');
}

function filterTickets(view, adminId = null) {
  const rows = [...state.tickets].sort(
    (left, right) => new Date(right.updatedAt) - new Date(left.updatedAt)
  );

  let filtered = rows;
  if (adminId) {
    filtered = filtered.filter((ticket) => ticket.assignedAdminId === String(adminId));
  }

  if (view === 'all') return filtered;
  return filtered.filter((ticket) => ticket.status === view);
}

function addMessageRecord(ticket, payload) {
  ticket.messages.push({
    id: `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    senderType: payload.senderType,
    senderId: String(payload.senderId || ''),
    text: payload.text || '',
    caption: payload.caption || '',
    kind: payload.kind || 'text',
    originChatId: String(payload.originChatId || ''),
    originMessageId: payload.originMessageId ?? null,
    createdAt: nowIso()
  });
  ticket.lastMessage = payload.text || payload.caption || `[${payload.kind || 'message'}]`;
  ticket.updatedAt = nowIso();
}

async function telegram(method, payload) {
  const response = await fetch(`${API_URL}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(body.description || `Telegram ${method} failed`);
  }
  return body.result;
}

async function sendMessage(chatId, text, replyMarkup) {
  return telegram('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
    disable_web_page_preview: true
  });
}

async function editMessage(chatId, messageId, text, replyMarkup) {
  return telegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: replyMarkup,
    disable_web_page_preview: true
  }).catch(() => sendMessage(chatId, text, replyMarkup));
}

async function answerCallback(callbackId, text = '') {
  return telegram('answerCallbackQuery', {
    callback_query_id: callbackId,
    text
  }).catch(() => null);
}

async function copyMessage(targetChatId, sourceChatId, messageId, caption) {
  return telegram('copyMessage', {
    chat_id: targetChatId,
    from_chat_id: sourceChatId,
    message_id: messageId,
    caption
  });
}

async function sendTicketCard(chatId, ticket, role) {
  await sendMessage(chatId, formatTicketCard(ticket), ticketActionKeyboard(ticket, role));
}

async function sendAdminList(chatId) {
  if (!state.admins.length) {
    await sendMessage(chatId, 'No support admins have been added yet.', adminDashboardKeyboard(chatId));
    return;
  }

  for (const admin of state.admins) {
    await sendMessage(chatId, formatAdminCard(admin), {
      inline_keyboard: [
        [{ text: '✏️ Rename', callback_data: `sar:${admin.id}` }, { text: '🗑️ Remove', callback_data: `sax:${admin.id}` }]
      ]
    });
  }
}

async function sendHistoryMedia(ticket, adminId) {
  for (const item of ticket.messages) {
    if (!item.originChatId || !item.originMessageId || item.kind === 'text') continue;
    await copyMessage(adminId, item.originChatId, item.originMessageId, item.caption || undefined).catch(() => null);
  }
}

async function sendAssignedCase(ticket, adminId) {
  await sendMessage(
    adminId,
    `📥 New assigned case\n\n${formatTicketCard(ticket)}\n\n🧾 Full chat history:\n${formatTicketHistory(ticket)}`,
    ticketActionKeyboard(ticket, 'admin')
  );
  await sendHistoryMedia(ticket, adminId);
}

async function notifySuperadmin(text, replyMarkup) {
  await sendMessage(SUPERADMIN_ID, text, replyMarkup).catch(() => null);
}

async function assignTicket(ticket, adminId, { notifyUser = true, notifySuper = true } = {}) {
  const previousAdminId = ticket.assignedAdminId || '';
  if (previousAdminId && previousAdminId !== String(adminId)) {
    const previousSession = getSession(previousAdminId);
    if (previousSession?.mode === 'reply' && previousSession.ticketId === ticket.id) {
      clearSession(previousAdminId);
    }
  }

  ticket.assignedAdminId = String(adminId);
  ticket.status = 'open';
  ticket.updatedAt = nowIso();
  saveState();

  await sendAssignedCase(ticket, adminId);

  if (notifyUser) {
    await sendMessage(ticket.userChatId, 'A support admin is now handling your case. You can continue chatting here.');
  }
  if (notifySuper) {
    await notifySuperadmin(`✅ ${ticket.id} assigned to ${adminLabel(adminId)}.\n\n${formatTicketCard(ticket)}`, ticketActionKeyboard(ticket, 'superadmin'));
  }
}

async function assignQueuedTickets() {
  const queued = state.tickets
    .filter((ticket) => ticket.status === 'queued')
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));

  for (const ticket of queued) {
    const availableAdmin = pickAvailableAdmin();
    if (!availableAdmin) return;
    await assignTicket(ticket, availableAdmin.id, { notifyUser: true, notifySuper: true });
  }
}

function detectMessageKind(message) {
  if (message.photo) return 'photo';
  if (message.document) return 'document';
  if (message.video) return 'video';
  if (message.voice) return 'voice';
  if (message.audio) return 'audio';
  if (message.sticker) return 'sticker';
  return 'text';
}

async function forwardUserMessage(ticket, message) {
  const text = String(message.text || '').trim();
  const caption = String(message.caption || '').trim();
  const kind = detectMessageKind(message);

  addMessageRecord(ticket, {
    senderType: 'user',
    senderId: message.from.id,
    text,
    caption,
    kind,
    originChatId: message.chat.id,
    originMessageId: message.message_id
  });
  saveState();

  if (ticket.assignedAdminId) {
    if (kind === 'text') {
      await sendMessage(
        ticket.assignedAdminId,
        `💬 ${ticket.userFullName}\n${ticket.contactDetail}\n${ticket.path}\n\n${text}`,
        ticketActionKeyboard(ticket, 'admin')
      );
    } else {
      await copyMessage(ticket.assignedAdminId, message.chat.id, message.message_id, caption || undefined).catch(() => null);
      await sendMessage(
        ticket.assignedAdminId,
        `💬 Update from ${ticket.userFullName}\n${ticket.contactDetail}\n${ticket.path}`,
        ticketActionKeyboard(ticket, 'admin')
      );
    }
  }
}

async function forwardAdminMessage(ticket, message, admin) {
  const text = String(message.text || '').trim();
  const caption = String(message.caption || '').trim();
  const kind = detectMessageKind(message);

  addMessageRecord(ticket, {
    senderType: 'admin',
    senderId: admin.id,
    text,
    caption,
    kind,
    originChatId: message.chat.id,
    originMessageId: message.message_id
  });
  saveState();

  if (kind === 'text') {
    await sendMessage(ticket.userChatId, text);
  } else {
    await copyMessage(ticket.userChatId, message.chat.id, message.message_id, caption || undefined).catch(() => null);
  }
}

async function sendTicketList(chatId, view, role, adminId = null) {
  const rows = filterTickets(view, adminId);
  if (!rows.length) {
    await sendMessage(chatId, `No ${view} tickets found.`, adminDashboardKeyboard(chatId));
    return;
  }

  for (const ticket of rows) {
    await sendTicketCard(chatId, ticket, role);
  }
}

async function createTicket(message, session) {
  const service = SERVICE_MAP.get(session.serviceId);
  const issue = service?.issues.find((item) => item.id === session.issueId);
  const ticket = {
    id: createTicketId(),
    userId: String(message.from.id),
    userChatId: String(message.chat.id),
    userFullName: makeUserLabel(message.from),
    userUsername: message.from.username ? `@${message.from.username}` : '',
    contactDetail: session.contactDetail,
    service: service?.title || 'Dink Card',
    issue: issue?.title || 'General issue',
    path: `${service?.title || 'Dink Card'} -> ${issue?.title || 'General issue'}`,
    status: 'queued',
    assignedAdminId: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastMessage: '',
    messages: []
  };

  addMessageRecord(ticket, {
    senderType: 'user',
    senderId: message.from.id,
    text: session.issueText,
    kind: 'text',
    originChatId: message.chat.id,
    originMessageId: message.message_id
  });

  state.tickets.push(ticket);
  saveState();

  const availableAdmin = pickAvailableAdmin();
  if (availableAdmin) {
    await assignTicket(ticket, availableAdmin.id, { notifyUser: true, notifySuper: true });
  } else {
    await sendMessage(ticket.userChatId, 'All support admins are busy right now. Your case is queued and your next messages will still be saved.');
    await notifySuperadmin(`🕓 Queued ticket\n\n${formatTicketCard(ticket)}`, ticketActionKeyboard(ticket, 'superadmin'));
  }

  return ticket;
}

async function handleUserSessionMessage(message) {
  const chatId = String(message.chat.id);
  const openTicket = getUserOpenTicket(chatId);
  if (openTicket) {
    await forwardUserMessage(openTicket, message);
    return true;
  }

  const session = getSession(chatId);
  if (!session) return false;

  if (session.mode === 'contact_detail') {
    const contactDetail = String(message.text || '').trim();
    if (!contactDetail) {
      await sendMessage(chatId, 'Send the email, phone number, or login detail you used on the platform.');
      return true;
    }
    setSession(chatId, { ...session, mode: 'issue_text', contactDetail });
    await sendMessage(chatId, 'Now explain your issue clearly. You can add a reference, order ID, payment detail, or card nickname if needed.');
    return true;
  }

  if (session.mode === 'issue_text') {
    const issueText = String(message.text || message.caption || '').trim();
    if (!issueText) {
      await sendMessage(chatId, 'Send a clear explanation so support can help you faster.');
      return true;
    }
    const ticket = await createTicket(message, { ...session, issueText });
    clearSession(chatId);
    if (ticket.status === 'open') {
      await sendMessage(chatId, 'Your live support chat is open now. Keep sending messages here whenever you need to add more details.');
    }
    return true;
  }

  return false;
}

async function handleSuperadminText(message) {
  const session = getSession(message.chat.id);
  if (!session) return false;

  if (session.mode === 'add_admin_id') {
    const adminId = String(message.text || '').trim();
    if (!/^\d+$/.test(adminId)) {
      await sendMessage(message.chat.id, 'Send a valid Telegram numeric ID.');
      return true;
    }
    setSession(message.chat.id, { mode: 'add_admin_label', adminId });
    await sendMessage(message.chat.id, 'Now send the display name for this admin, for example `Abel Support` or `KYC Admin`.');
    return true;
  }

  if (session.mode === 'add_admin_label') {
    const label = String(message.text || '').trim();
    if (!label) {
      await sendMessage(message.chat.id, 'Send a valid admin name.');
      return true;
    }

    const existing = getSupportAdmin(session.adminId);
    if (existing) {
      existing.label = label;
    } else {
      state.admins.push({
        id: session.adminId,
        label,
        createdAt: nowIso()
      });
    }
    saveState();
    clearSession(message.chat.id);
    await sendMessage(message.chat.id, `Admin saved: ${label} (${session.adminId})`, adminDashboardKeyboard(message.chat.id));
    await assignQueuedTickets();
    return true;
  }

  if (session.mode === 'rename_admin') {
    const label = String(message.text || '').trim();
    const admin = getSupportAdmin(session.adminId);
    if (!admin) {
      clearSession(message.chat.id);
      await sendMessage(message.chat.id, 'Admin not found.', adminDashboardKeyboard(message.chat.id));
      return true;
    }
    admin.label = label || admin.label;
    saveState();
    clearSession(message.chat.id);
    await sendMessage(message.chat.id, `Admin renamed to ${admin.label}.`, adminDashboardKeyboard(message.chat.id));
    return true;
  }

  return false;
}

async function handleAdminReplyMessage(message) {
  const session = getSession(message.chat.id);
  if (!session || session.mode !== 'reply') return false;

  const ticket = getTicket(session.ticketId);
  if (!ticket) {
    clearSession(message.chat.id);
    await sendMessage(message.chat.id, 'That case no longer exists.', adminDashboardKeyboard(message.chat.id));
    return true;
  }

  if (ticket.assignedAdminId !== String(message.chat.id) || ['solved', 'cancelled', 'closed'].includes(ticket.status)) {
    clearSession(message.chat.id);
    await sendMessage(message.chat.id, 'That case is no longer assigned to you.', adminDashboardKeyboard(message.chat.id));
    return true;
  }

  await forwardAdminMessage(ticket, message, getSupportAdmin(message.chat.id));
  return true;
}

async function handleCallback(callback) {
  const chatId = String(callback.message.chat.id);
  const messageId = callback.message.message_id;
  const data = callback.data || '';
  await answerCallback(callback.id);

  if (data === 'faq:home') {
    clearSession(chatId);
    return editMessage(chatId, messageId, 'Choose a support category:', faqHomeKeyboard());
  }

  if (data.startsWith('faqcat:')) {
    const categoryId = data.slice('faqcat:'.length);
    const category = FAQ_CATEGORY_MAP.get(categoryId);
    return editMessage(chatId, messageId, category ? `${category.icon} ${category.title}` : 'FAQs', faqCategoryKeyboard(categoryId));
  }

  if (data.startsWith('faqq:')) {
    const questionId = data.slice('faqq:'.length);
    const item = FAQ_QUESTION_MAP.get(questionId);
    if (!item) {
      return editMessage(chatId, messageId, 'That FAQ item could not be found.', faqHomeKeyboard());
    }
    return editMessage(chatId, messageId, `${item.question}\n\n${item.answer}`, {
      inline_keyboard: [
        [{ text: '⬅️ Back', callback_data: `faqcat:${item.categoryId}` }],
        [{ text: '💬 Contact live support', callback_data: 'support:start' }]
      ]
    });
  }

  if (data === 'support:start') {
    const existingTicket = getUserOpenTicket(chatId);
    if (existingTicket) {
      return editMessage(chatId, messageId, `You already have an active support case.\n\n${formatTicketCard(existingTicket)}`, {
        inline_keyboard: [[{ text: '📄 View FAQ instead', callback_data: 'faq:home' }]]
      });
    }
    setSession(chatId, { mode: 'service' });
    return editMessage(chatId, messageId, 'Choose the service related to your issue:', supportServiceKeyboard());
  }

  if (data.startsWith('svc:')) {
    const serviceId = data.slice('svc:'.length);
    const service = SERVICE_MAP.get(serviceId);
    if (!service) {
      return editMessage(chatId, messageId, 'That service could not be found.', supportServiceKeyboard());
    }
    setSession(chatId, { mode: 'issue', serviceId });
    return editMessage(chatId, messageId, `${service.title}\n\nChoose the issue category:`, supportIssueKeyboard(serviceId));
  }

  if (data.startsWith('iss:')) {
    const [, serviceId, issueId] = data.split(':');
    const service = SERVICE_MAP.get(serviceId);
    const issue = service?.issues.find((item) => item.id === issueId);
    if (!service || !issue) {
      return editMessage(chatId, messageId, 'That issue option could not be found.', supportServiceKeyboard());
    }
    setSession(chatId, {
      mode: 'confirm',
      serviceId,
      issueId
    });
    return editMessage(
      chatId,
      messageId,
      `Selected path:\n${service.title} -> ${issue.title}\n\nIf the FAQ still did not solve it, continue to live support.`,
      {
        inline_keyboard: [
          [{ text: '✅ Continue to live support', callback_data: 'support:confirm' }],
          [{ text: '⬅️ Back to FAQ', callback_data: 'faq:home' }]
        ]
      }
    );
  }

  if (data === 'support:confirm') {
    const current = getSession(chatId) || {};
    const service = SERVICE_MAP.get(current.serviceId);
    const issue = service?.issues.find((item) => item.id === current.issueId);
    setSession(chatId, { ...current, mode: 'contact_detail' });
    return editMessage(
      chatId,
      messageId,
      `Selected path:\n${service?.title || 'Service'} -> ${issue?.title || 'Issue'}\n\nSend the email, phone number, or login detail you used on the platform.`
    );
  }

  if (data === 'sa:add' && isSuperAdmin(chatId)) {
    setSession(chatId, { mode: 'add_admin_id' });
    return editMessage(chatId, messageId, 'Send the Telegram ID of the support admin you want to add.');
  }

  if (data === 'sa:admins' && isSuperAdmin(chatId)) {
    await sendAdminList(chatId);
    return;
  }

  if (data.startsWith('sar:') && isSuperAdmin(chatId)) {
    const adminId = data.slice('sar:'.length);
    const admin = getSupportAdmin(adminId);
    if (!admin) {
      return editMessage(chatId, messageId, 'Admin not found.', adminDashboardKeyboard(chatId));
    }
    setSession(chatId, { mode: 'rename_admin', adminId });
    return editMessage(chatId, messageId, `Send the new name for ${admin.label}.`);
  }

  if (data.startsWith('sax:') && isSuperAdmin(chatId)) {
    const adminId = data.slice('sax:'.length);
    state.admins = state.admins.filter((admin) => admin.id !== adminId);
    for (const ticket of state.tickets) {
      if (ticket.assignedAdminId === adminId && ['open', 'hold'].includes(ticket.status)) {
        ticket.assignedAdminId = '';
        ticket.status = 'queued';
        ticket.updatedAt = nowIso();
      }
    }
    saveState();
    await editMessage(chatId, messageId, `Removed admin ${adminId}.`, adminDashboardKeyboard(chatId));
    await assignQueuedTickets();
    return;
  }

  if (data.startsWith('saview:') && isSuperAdmin(chatId)) {
    const view = data.slice('saview:'.length);
    await sendTicketList(chatId, view, 'superadmin');
    return;
  }

  if (data.startsWith('adview:') && isSupportAdmin(chatId)) {
    const view = data.slice('adview:'.length);
    await sendTicketList(chatId, view, 'admin', chatId);
    return;
  }

  if (data.startsWith('td:') && (isSuperAdmin(chatId) || isSupportAdmin(chatId))) {
    const ticketId = data.slice('td:'.length);
    const ticket = getTicket(ticketId);
    if (!ticket) {
      return editMessage(chatId, messageId, 'Ticket not found.');
    }
    const role = isSuperAdmin(chatId) ? 'superadmin' : 'admin';
    return editMessage(chatId, messageId, `${formatTicketCard(ticket)}\n\n🧾 Full chat history:\n${formatTicketHistory(ticket)}`, ticketActionKeyboard(ticket, role));
  }

  if (data.startsWith('ta:') && isSuperAdmin(chatId)) {
    const [, ticketId, adminId] = data.split(':');
    const ticket = getTicket(ticketId);
    if (!ticket) {
      return editMessage(chatId, messageId, 'Ticket not found.');
    }
    await assignTicket(ticket, adminId, { notifyUser: ticket.status === 'queued' || !ticket.assignedAdminId, notifySuper: false });
    return editMessage(chatId, messageId, `Ticket assigned.\n\n${formatTicketCard(ticket)}`, ticketActionKeyboard(ticket, 'superadmin'));
  }

  if (data.startsWith('tr:') && isSupportAdmin(chatId)) {
    const ticketId = data.slice('tr:'.length);
    const ticket = getTicket(ticketId);
    if (!ticket) {
      return editMessage(chatId, messageId, 'Ticket not found.');
    }
    if (ticket.assignedAdminId !== chatId) {
      return editMessage(chatId, messageId, 'This case is not assigned to you.');
    }
    setSession(chatId, { mode: 'reply', ticketId });
    return editMessage(
      chatId,
      messageId,
      `Reply mode is active for ${ticket.id}.\n\nSend your next text, photo, document, video, voice note, audio, or sticker here.`,
      ticketActionKeyboard(ticket, 'admin')
    );
  }

  if (data.startsWith('ts:') && (isSuperAdmin(chatId) || isSupportAdmin(chatId))) {
    const [, ticketId, nextStatus] = data.split(':');
    const ticket = getTicket(ticketId);
    if (!ticket) {
      return editMessage(chatId, messageId, 'Ticket not found.');
    }

    if (isSupportAdmin(chatId) && ticket.assignedAdminId !== chatId) {
      return editMessage(chatId, messageId, 'This case is not assigned to you.');
    }

    ticket.status = nextStatus;
    ticket.updatedAt = nowIso();
    saveState();

    if (['solved', 'cancelled', 'closed'].includes(nextStatus)) {
      const assignedSession = getSession(ticket.assignedAdminId || '');
      if (assignedSession?.mode === 'reply' && assignedSession.ticketId === ticket.id) {
        clearSession(ticket.assignedAdminId);
      }
      await sendMessage(ticket.userChatId, `Your support case ${ticket.id} is now ${statusLabel(nextStatus).toLowerCase()}.`);
      await notifySuperadmin(`${ticket.id} moved to ${statusLabel(nextStatus)}.\n\n${formatTicketCard(ticket)}`);
      await assignQueuedTickets();
    } else if (nextStatus === 'hold') {
      await sendMessage(ticket.userChatId, `Your support case ${ticket.id} is on hold. You can still send more details here.`);
      await notifySuperadmin(`${ticket.id} is now on hold.\n\n${formatTicketCard(ticket)}`);
    } else if (nextStatus === 'open') {
      await sendMessage(ticket.userChatId, `Your support case ${ticket.id} is active again.`);
      await notifySuperadmin(`${ticket.id} is active again.\n\n${formatTicketCard(ticket)}`);
    }

    const role = isSuperAdmin(chatId) ? 'superadmin' : 'admin';
    return editMessage(chatId, messageId, `${formatTicketCard(ticket)}\n\n🧾 Full chat history:\n${formatTicketHistory(ticket)}`, ticketActionKeyboard(ticket, role));
  }
}

async function handleMessage(message) {
  const chatId = String(message.chat.id);
  const text = String(message.text || '').trim();

  if (text === '/start' || text === '/help') {
    clearSession(chatId);
    if (isSuperAdmin(chatId) || isSupportAdmin(chatId)) {
      await sendMessage(chatId, WELCOME_TEXT, adminDashboardKeyboard(chatId));
      return;
    }
    await sendMessage(chatId, WELCOME_TEXT, faqHomeKeyboard());
    return;
  }

  if (text === '/cancel') {
    clearSession(chatId);
    await sendMessage(
      chatId,
      'Current action cancelled.',
      isSuperAdmin(chatId) || isSupportAdmin(chatId) ? adminDashboardKeyboard(chatId) : faqHomeKeyboard()
    );
    return;
  }

  if (isSuperAdmin(chatId) && await handleSuperadminText(message)) return;
  if (isSupportAdmin(chatId) && await handleAdminReplyMessage(message)) return;
  if (!isSuperAdmin(chatId) && !isSupportAdmin(chatId) && await handleUserSessionMessage(message)) return;

  if (!isSuperAdmin(chatId) && !isSupportAdmin(chatId)) {
    const openTicket = getUserOpenTicket(chatId);
    if (openTicket) {
      await forwardUserMessage(openTicket, message);
      return;
    }
    await sendMessage(chatId, 'Choose a FAQ category first. If it still does not solve your issue, the bot will guide you into live support.', faqHomeKeyboard());
    return;
  }

  await sendMessage(chatId, 'Use the support dashboard buttons to continue.', adminDashboardKeyboard(chatId));
}

async function bootstrapAdminsFromEnv() {
  const seedAdmins = String(process.env.SUPPORT_ADMIN_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!seedAdmins.length) return;

  let changed = false;
  seedAdmins.forEach((adminId, index) => {
    if (!state.admins.some((admin) => admin.id === adminId)) {
      state.admins.push({
        id: adminId,
        label: `Support ${index + 1}`,
        createdAt: nowIso()
      });
      changed = true;
    }
  });

  if (changed) saveState();
}

async function poll() {
  await bootstrapAdminsFromEnv();
  let offset = 0;
  console.log('Dink Support live chat bot started.');

  while (true) {
    try {
      const updates = await telegram('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message', 'callback_query']
      });

      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.callback_query) {
          await handleCallback(update.callback_query);
        }
        if (update.message) {
          await handleMessage(update.message);
        }
      }
    } catch (error) {
      console.error(error.message);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

poll();
