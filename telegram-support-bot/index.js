const BOT_TOKEN = process.env.BOT_TOKEN;
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://dinkcard.et';
const SUPPORT_URL = process.env.SUPPORT_URL || `${PLATFORM_URL}/contact`;
const SUPERADMIN_ID = String(process.env.SUPERADMIN_ID || '8773629714');
const SUPPORT_ADMIN_IDS = String(process.env.SUPPORT_ADMIN_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .slice(0, 3);

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required.');
}

const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
const sessions = new Map();
const tickets = new Map();
const userActiveTickets = new Map();

const supportAdmins = SUPPORT_ADMIN_IDS.map((id, index) => ({
  id,
  label: `Support ${index + 1}`
}));

const welcomeText = `Welcome to Dink Support.

This is the official support bot for Dink services.

You can get help with Dink Card, Dink Pay, digital service payments, subscriptions, orders, deposits, verification, platform issues, and general questions.

Browse FAQs or contact a live support agent when you need direct help.

For your safety, never share your password, OTP, full card details, or private account information in chat.`;

const faqCategories = [
  {
    id: 'getting_started',
    title: 'Getting Started',
    questions: [
      ['start_account', 'How do I begin?', 'Open Dink Card, create your account, verify your details, add funds, then request your virtual card from the Cards page.'],
      ['start_need_kyc', 'Do I need KYC first?', 'Yes. KYC approval is required before card requests, card funding, and most deposit actions.'],
      ['start_login', 'What can I use to sign in?', 'You can sign in with email, phone number, or username.'],
      ['start_limit', 'How many cards can I create?', 'A verified user can create up to 3 cards in total. The app shows your card count like 1/3, 2/3, or 3/3.'],
      ['start_progress', 'What should I finish first?', 'A smooth order is: create account, pass KYC, add funds, request card, then enable 2FA for extra account protection.']
    ]
  },
  {
    id: 'funding',
    title: 'Funding and Deposits',
    questions: [
      ['fund_add_money', 'How do I add funds in ETB?', 'Open Add Funds, enter your amount, review the total, agree to the notice, and continue to checkout.'],
      ['fund_crypto', 'Can I fund with crypto?', 'Yes, if crypto funding is enabled on your account. Open Add Funds and choose the available crypto deposit option.'],
      ['fund_pending', 'Why is my deposit pending?', 'Pending means payment review, provider confirmation, or admin review is still in progress. Check the reference inside your dashboard.'],
      ['fund_receipt', 'Where do I get my receipt?', 'Open your transactions and choose the receipt download option for the payment you made.'],
      ['fund_wrong_amount', 'What if I sent the wrong amount?', 'Do not create another request immediately. Open support and send the payment reference plus the amount you actually sent.'],
      ['fund_cancelled', 'What happens if checkout was cancelled?', 'If checkout is cancelled or expires, no service balance is added. You can start a fresh funding request from Add Funds.']
    ]
  },
  {
    id: 'cards',
    title: 'Cards',
    questions: [
      ['card_create', 'How do I create a card?', 'After KYC approval and enough service balance, open Cards and request a new virtual card.'],
      ['card_failed', 'Why did card creation fail?', 'Typical reasons are incomplete KYC, not enough balance, card limit reached, provider availability, or risk review.'],
      ['card_reveal', 'How do I reveal card details?', 'Open the card, enter your card PIN, then use Reveal Details to view the card number, CVV, expiry, and billing details.'],
      ['card_freeze', 'How does freeze work?', 'Open your card and use Freeze when you want to stop new use temporarily. Unfreeze when you want it active again.'],
      ['card_pin', 'Why do I need a card PIN?', 'The PIN protects sensitive actions such as revealing details and terminating a card.'],
      ['card_terminated', 'Will terminated cards still show?', 'Yes. Terminated cards remain visible in your card history so you can keep a clear record.']
    ]
  },
  {
    id: 'transactions',
    title: 'Transactions',
    questions: [
      ['tx_history', 'Where do I see my full history?', 'Open Transactions or your card activity section to view older payment, funding, and card records.'],
      ['tx_declined', 'Why was my card payment declined?', 'A merchant may decline because of region rules, billing mismatch, provider rules, insufficient balance, or merchant restrictions.'],
      ['tx_refund', 'How do refunds work?', 'Refund timing depends on transaction stage, provider response, and platform review. Check the transaction status first before opening support.'],
      ['tx_fee', 'Are there card usage fees?', 'The app shows the current card-related deductions and funding pricing where applicable.'],
      ['tx_stuck', 'My transaction looks stuck. What should I do?', 'Wait a moment, refresh the page, then check the latest transaction state. If it still looks wrong, send the reference in support.']
    ]
  },
  {
    id: 'kyc',
    title: 'KYC and Verification',
    questions: [
      ['kyc_need', 'Why is KYC required?', 'KYC helps protect accounts and is required before most funding and card features are unlocked.'],
      ['kyc_docs', 'What ID types are accepted?', 'The platform supports Passport and Drivers License. Only the front image and selfie are required for those options.'],
      ['kyc_reject', 'Why was my KYC rejected?', 'Common reasons are blurry image, name mismatch, unreadable ID number, missing selfie, or incomplete personal details.'],
      ['kyc_fix', 'How do I resubmit KYC?', 'Open the KYC page, correct the requested fields, upload the needed file again, and submit a fresh review.'],
      ['kyc_time', 'How long does review take?', 'Review time depends on queue size and document quality. If more details are needed, the app will show what to fix.']
    ]
  },
  {
    id: 'account',
    title: 'Account and Security',
    questions: [
      ['acc_password', 'How do I change my password?', 'Open Account and Security, then use Change password.'],
      ['acc_reset', 'How do I reset my password?', 'Use Forgot password and confirm with your last name and date of birth. If that fails, contact support.'],
      ['acc_2fa', 'How do I enable 2FA?', 'Open Account and Security and follow the authenticator setup flow. Keep your recovery codes safe.'],
      ['acc_delete', 'Can I delete my account?', 'Yes. Open Account and Security, choose Delete account, and confirm your password.'],
      ['acc_restricted', 'Why is my account restricted?', 'Restrictions can happen after verification problems, suspicious activity, repeated failed checks, or platform policy violations.']
    ]
  },
  {
    id: 'services',
    title: 'Digital Services',
    questions: [
      ['srv_supported', 'What kinds of services can I use the card for?', 'Supported uses may include subscriptions, app stores, digital tools, shopping, ads, and selected online services.'],
      ['srv_everywhere', 'Will the card work everywhere?', 'No. Merchant acceptance is not guaranteed and depends on the merchant, region, provider rules, and transaction type.'],
      ['srv_subscriptions', 'Can I use it for subscriptions?', 'Yes, if the merchant accepts the card and the transaction passes provider and merchant checks.'],
      ['srv_ads', 'Can I use it for ads and tools?', 'Some ads and digital tool payments are supported, but acceptance still depends on the platform and provider rules.'],
      ['srv_failed', 'A service says payment failed. What next?', 'Check balance, billing details, card status, and merchant support first. Then open a support ticket if the issue stays unresolved.']
    ]
  },
  {
    id: 'safety',
    title: 'Safety',
    questions: [
      ['safe_never_share', 'What should I never share?', 'Never share your password, OTP, recovery codes, full card number, CVV, expiry, or personal security details.'],
      ['safe_phishing', 'How do I spot a fake support message?', 'Only trust official Dink links, the real app, and verified support channels. Never send secrets in chat.'],
      ['safe_report', 'How do I report suspicious activity?', `Use ${SUPPORT_URL} or contact security@dinkcard.et with the details.`],
      ['safe_device', 'Should I enable 2FA?', 'Yes. Two-factor authentication adds an extra layer of protection to your account.'],
      ['safe_home', 'Should I add the app to my home screen?', 'Yes, if you want faster access. It is optional and does not change your account status.']
    ]
  }
];

const categoryMap = new Map(faqCategories.map((category) => [category.id, category]));
const questionMap = new Map(
  faqCategories.flatMap((category) => category.questions.map((question) => [question[0], { category, question }]))
);

function isSuperAdmin(chatId) {
  return String(chatId) === SUPERADMIN_ID;
}

function isSupportAdmin(chatId) {
  return supportAdmins.some((admin) => admin.id === String(chatId));
}

function adminLabel(adminId) {
  return supportAdmins.find((admin) => admin.id === String(adminId))?.label || `Admin ${adminId}`;
}

function ticketStatusLabel(status) {
  return {
    waiting_assignment: 'Waiting assignment',
    active: 'Active',
    hold: 'On hold',
    solved: 'Solved',
    cancelled: 'Cancelled'
  }[status] || status;
}

function ticketId() {
  return `T${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

function userLabel(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || `User ${user?.id || ''}`.trim();
}

function faqHomeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'Getting Started', callback_data: 'faq:cat:getting_started' }],
      [{ text: 'Funding and Deposits', callback_data: 'faq:cat:funding' }, { text: 'Cards', callback_data: 'faq:cat:cards' }],
      [{ text: 'Transactions', callback_data: 'faq:cat:transactions' }, { text: 'KYC', callback_data: 'faq:cat:kyc' }],
      [{ text: 'Account and Security', callback_data: 'faq:cat:account' }, { text: 'Digital Services', callback_data: 'faq:cat:services' }],
      [{ text: 'Safety', callback_data: 'faq:cat:safety' }],
      [{ text: 'Contact live support', callback_data: 'support:start' }]
    ]
  };
}

function categoryKeyboard(categoryId) {
  const category = categoryMap.get(categoryId);
  if (!category) return faqHomeKeyboard();
  return {
    inline_keyboard: [
      ...category.questions.map(([id, title]) => [{ text: title, callback_data: `faq:q:${id}` }]),
      [{ text: 'Back to categories', callback_data: 'faq:home' }],
      [{ text: 'Contact live support', callback_data: 'support:start' }]
    ]
  };
}

function serviceKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'Dink Card', callback_data: 'support:service:Dink Card' }, { text: 'Dink Pay', callback_data: 'support:service:Dink Pay' }],
      [{ text: 'Deposits or checkout', callback_data: 'support:service:Deposits or checkout' }],
      [{ text: 'Account or verification', callback_data: 'support:service:Account or verification' }],
      [{ text: 'Digital services', callback_data: 'support:service:Digital services' }],
      [{ text: 'Back to FAQ', callback_data: 'faq:home' }]
    ]
  };
}

function issueKeyboard(service) {
  return {
    inline_keyboard: [
      [{ text: 'Payment pending', callback_data: `support:issue:${service}:Payment pending` }],
      [{ text: 'Card or order failed', callback_data: `support:issue:${service}:Card or order failed` }],
      [{ text: 'KYC or login issue', callback_data: `support:issue:${service}:KYC or login issue` }],
      [{ text: 'Need human review', callback_data: `support:issue:${service}:Need human review` }],
      [{ text: 'Back', callback_data: 'support:start' }]
    ]
  };
}

function supportConfirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'I checked FAQ, continue', callback_data: 'support:confirm' }],
      [{ text: 'Back to FAQ', callback_data: 'faq:home' }]
    ]
  };
}

function supportAdminKeyboard(ticket) {
  const replyMode = sessions.get(ticket.assignedAdminId || '')?.ticketId === ticket.id;
  return {
    inline_keyboard: [
      [{ text: replyMode ? 'Reply mode active' : 'Reply to user', callback_data: `ticket:reply:${ticket.id}` }],
      [{ text: 'Hold', callback_data: `ticket:status:${ticket.id}:hold` }, { text: 'Solved', callback_data: `ticket:status:${ticket.id}:solved` }],
      [{ text: 'Cancel ticket', callback_data: `ticket:status:${ticket.id}:cancelled` }, { text: 'Stop reply mode', callback_data: `ticket:stop:${ticket.id}` }]
    ]
  };
}

function superAdminKeyboard(ticket) {
  const rows = [];
  if (supportAdmins.length) {
    for (const admin of supportAdmins) {
      rows.push([{ text: `Assign ${admin.label}`, callback_data: `ticket:assign:${ticket.id}:${admin.id}` }]);
    }
  }
  rows.push([{ text: 'Mark hold', callback_data: `ticket:status:${ticket.id}:hold` }, { text: 'Mark solved', callback_data: `ticket:status:${ticket.id}:solved` }]);
  rows.push([{ text: 'Cancel ticket', callback_data: `ticket:status:${ticket.id}:cancelled` }]);
  return { inline_keyboard: rows };
}

function adminOverviewKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'View FAQ menu', callback_data: 'faq:home' }]
    ]
  };
}

function ticketSummary(ticket) {
  return [
    `Ticket ${ticket.id}`,
    `Status: ${ticketStatusLabel(ticket.status)}`,
    `User: ${ticket.userName}`,
    `Telegram ID: ${ticket.userId}`,
    `Username: ${ticket.username || 'N/A'}`,
    `Service: ${ticket.service || 'N/A'}`,
    `Issue: ${ticket.issue || 'N/A'}`,
    `Assigned: ${ticket.assignedAdminId ? adminLabel(ticket.assignedAdminId) : 'Not assigned'}`,
    '',
    `Latest message:`,
    ticket.lastMessage || 'No message yet'
  ].join('\n');
}

function activeTicketForUser(userId) {
  const ticketIdValue = userActiveTickets.get(String(userId));
  if (!ticketIdValue) return null;
  const ticket = tickets.get(ticketIdValue);
  if (!ticket || ['solved', 'cancelled'].includes(ticket.status)) {
    userActiveTickets.delete(String(userId));
    return null;
  }
  return ticket;
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

async function answerCallback(id, text = '') {
  return telegram('answerCallbackQuery', { callback_query_id: id, text }).catch(() => null);
}

async function copyMessage(toChatId, fromChatId, messageId, caption) {
  return telegram('copyMessage', {
    chat_id: toChatId,
    from_chat_id: fromChatId,
    message_id: messageId,
    caption
  }).catch(() => null);
}

async function notifySuperAdmin(text, replyMarkup) {
  return sendMessage(SUPERADMIN_ID, text, replyMarkup).catch(() => null);
}

async function notifyAssignedAdmin(ticket, text) {
  if (!ticket.assignedAdminId) return null;
  return sendMessage(ticket.assignedAdminId, text, supportAdminKeyboard(ticket)).catch(() => null);
}

async function mirrorTicketUpdate(ticket, note) {
  const body = `${note}\n\n${ticketSummary(ticket)}`;
  await notifySuperAdmin(body, superAdminKeyboard(ticket));
  if (ticket.assignedAdminId) {
    await sendMessage(ticket.assignedAdminId, body, supportAdminKeyboard(ticket)).catch(() => null);
  }
}

function startTicketForMessage(message, session) {
  const id = ticketId();
  const text = String(message.text || message.caption || '[file attached]').trim();
  const ticket = {
    id,
    userId: String(message.from.id),
    userChatId: String(message.chat.id),
    userName: userLabel(message.from),
    username: message.from.username ? `@${message.from.username}` : '',
    service: session?.service || '',
    issue: session?.issue || '',
    status: 'waiting_assignment',
    assignedAdminId: '',
    lastMessage: text,
    messages: [
      {
        sender: 'user',
        text,
        createdAt: Date.now()
      }
    ]
  };
  tickets.set(id, ticket);
  userActiveTickets.set(ticket.userId, id);
  sessions.delete(ticket.userId);
  return ticket;
}

async function routeUserMessageToTeam(ticket, message, text) {
  const summary = `User update on ${ticket.id}\n\n${ticketSummary(ticket)}`;
  await notifySuperAdmin(summary, superAdminKeyboard(ticket));
  if (ticket.assignedAdminId) {
    await sendMessage(ticket.assignedAdminId, `New user message on ${ticket.id}`, supportAdminKeyboard(ticket)).catch(() => null);
    if (message.text) {
      await sendMessage(ticket.assignedAdminId, `User message:\n\n${text}`, supportAdminKeyboard(ticket)).catch(() => null);
    } else {
      await copyMessage(ticket.assignedAdminId, message.chat.id, message.message_id, `User media on ${ticket.id}`);
    }
  }
}

async function forwardAdminReply(ticket, message, adminId) {
  const prefix = `Support reply from ${adminLabel(adminId)}`;
  if (message.text) {
    await sendMessage(ticket.userChatId, `${prefix}\n\n${message.text}`);
  } else {
    await copyMessage(ticket.userChatId, message.chat.id, message.message_id, prefix);
  }
  ticket.lastMessage = String(message.text || message.caption || '[file reply]').trim();
  ticket.messages.push({ sender: 'admin', adminId, text: ticket.lastMessage, createdAt: Date.now() });
  await notifySuperAdmin(`Admin reply sent on ${ticket.id} by ${adminLabel(adminId)}.\n\n${ticketSummary(ticket)}`, superAdminKeyboard(ticket));
}

async function handleCallback(callback) {
  const chatId = String(callback.message.chat.id);
  const messageId = callback.message.message_id;
  const data = callback.data || '';
  await answerCallback(callback.id);

  if (data === 'faq:home') {
    sessions.delete(String(callback.from.id));
    return editMessage(chatId, messageId, 'Choose a support category:', faqHomeKeyboard());
  }

  if (data.startsWith('faq:cat:')) {
    const categoryId = data.split(':')[2];
    const category = categoryMap.get(categoryId);
    return editMessage(chatId, messageId, category ? category.title : 'FAQs', categoryKeyboard(categoryId));
  }

  if (data.startsWith('faq:q:')) {
    const questionId = data.split(':')[2];
    const item = questionMap.get(questionId);
    if (!item) return editMessage(chatId, messageId, 'Question not found.', faqHomeKeyboard());
    const [, title, answer] = item.question;
    return editMessage(chatId, messageId, `${title}\n\n${answer}`, {
      inline_keyboard: [
        [{ text: 'Back', callback_data: `faq:cat:${item.category.id}` }],
        [{ text: 'Contact live support', callback_data: 'support:start' }]
      ]
    });
  }

  if (data === 'support:start') {
    sessions.set(String(callback.from.id), { step: 'service' });
    return editMessage(chatId, messageId, 'Choose the service related to your issue first:', serviceKeyboard());
  }

  if (data.startsWith('support:service:')) {
    const service = data.replace('support:service:', '');
    sessions.set(String(callback.from.id), { step: 'issue', service });
    return editMessage(chatId, messageId, `Service: ${service}\n\nWhat best matches your issue?`, issueKeyboard(service));
  }

  if (data.startsWith('support:issue:')) {
    const [, , service, issue] = data.split(':');
    sessions.set(String(callback.from.id), { step: 'confirm', service, issue });
    return editMessage(
      chatId,
      messageId,
      `Service: ${service}\nIssue: ${issue}\n\nPlease check the FAQ first. If it still does not solve it, continue to live support.`,
      supportConfirmKeyboard()
    );
  }

  if (data === 'support:confirm') {
    const current = sessions.get(String(callback.from.id)) || {};
    sessions.set(String(callback.from.id), { ...current, step: 'await_message' });
    return editMessage(
      chatId,
      messageId,
      'Send one clear message now. Add your reference, order ID, card nickname, or screenshot if needed. Do not send passwords, OTPs, or full card details.'
    );
  }

  if (data.startsWith('ticket:assign:')) {
    if (!isSuperAdmin(chatId)) return editMessage(chatId, messageId, 'Only the superadmin can assign tickets here.');
    const [, , ticketIdValue, adminId] = data.split(':');
    const ticket = tickets.get(ticketIdValue);
    if (!ticket) return editMessage(chatId, messageId, 'Ticket not found.');
    ticket.assignedAdminId = adminId;
    if (!['solved', 'cancelled'].includes(ticket.status)) ticket.status = 'active';
    await notifyAssignedAdmin(ticket, `You were assigned ${ticket.id}.\n\n${ticketSummary(ticket)}`);
    return editMessage(chatId, messageId, `Assigned ${ticket.id} to ${adminLabel(adminId)}.\n\n${ticketSummary(ticket)}`, superAdminKeyboard(ticket));
  }

  if (data.startsWith('ticket:reply:')) {
    const [, , ticketIdValue] = data.split(':');
    const ticket = tickets.get(ticketIdValue);
    if (!ticket) return editMessage(chatId, messageId, 'Ticket not found.');
    if (!isSupportAdmin(chatId) || ticket.assignedAdminId !== chatId) {
      return editMessage(chatId, messageId, 'Only the assigned support admin can reply to this ticket.');
    }
    sessions.set(chatId, { mode: 'admin_reply', ticketId: ticket.id });
    return editMessage(chatId, messageId, `Reply mode is active for ${ticket.id}.\n\nSend text, image, audio, or file messages here. Use Stop reply mode when you are done.`, supportAdminKeyboard(ticket));
  }

  if (data.startsWith('ticket:stop:')) {
    const [, , ticketIdValue] = data.split(':');
    const current = sessions.get(chatId);
    if (current?.mode === 'admin_reply' && current.ticketId === ticketIdValue) {
      sessions.delete(chatId);
    }
    const ticket = tickets.get(ticketIdValue);
    if (!ticket) return editMessage(chatId, messageId, 'Reply mode stopped.');
    return editMessage(chatId, messageId, `Reply mode stopped for ${ticket.id}.`, supportAdminKeyboard(ticket));
  }

  if (data.startsWith('ticket:status:')) {
    const [, , ticketIdValue, status] = data.split(':');
    const ticket = tickets.get(ticketIdValue);
    if (!ticket) return editMessage(chatId, messageId, 'Ticket not found.');
    const canManage = isSuperAdmin(chatId) || (isSupportAdmin(chatId) && ticket.assignedAdminId === chatId);
    if (!canManage) {
      return editMessage(chatId, messageId, 'You are not allowed to change this ticket.');
    }
    ticket.status = status;
    if (status !== 'active' && sessions.get(ticket.assignedAdminId || '')?.ticketId === ticket.id) {
      sessions.delete(ticket.assignedAdminId);
    }
    if (['solved', 'cancelled'].includes(status)) {
      userActiveTickets.delete(ticket.userId);
    }
    await sendMessage(ticket.userChatId, `Your support ticket ${ticket.id} is now ${ticketStatusLabel(status).toLowerCase()}.`);
    await notifySuperAdmin(`Ticket ${ticket.id} updated to ${ticketStatusLabel(status)}.\n\n${ticketSummary(ticket)}`, superAdminKeyboard(ticket));
    if (ticket.assignedAdminId) {
      await sendMessage(ticket.assignedAdminId, `Ticket ${ticket.id} is now ${ticketStatusLabel(status)}.`, supportAdminKeyboard(ticket)).catch(() => null);
    }
    return editMessage(chatId, messageId, `Ticket ${ticket.id} is now ${ticketStatusLabel(status)}.\n\n${ticketSummary(ticket)}`, isSuperAdmin(chatId) ? superAdminKeyboard(ticket) : supportAdminKeyboard(ticket));
  }
}

async function handleUserSupportMessage(message) {
  const userId = String(message.from.id);
  const session = sessions.get(userId);
  const activeTicket = activeTicketForUser(userId);
  const text = String(message.text || message.caption || '[file attached]').trim();

  if (activeTicket) {
    activeTicket.lastMessage = text;
    activeTicket.messages.push({ sender: 'user', text, createdAt: Date.now() });
    await routeUserMessageToTeam(activeTicket, message, text);
    await sendMessage(message.chat.id, `Added to ${activeTicket.id}. The support team will see your latest message.`);
    return true;
  }

  if (!session || session.step !== 'await_message') return false;

  const ticket = startTicketForMessage(message, session);
  await notifySuperAdmin(`New support ticket received.\n\n${ticketSummary(ticket)}`, superAdminKeyboard(ticket));
  await sendMessage(
    message.chat.id,
    `Your ticket ${ticket.id} was created. The support team will review it first. You can still send more details here while it is open.`
  );
  return true;
}

async function handleAdminReply(message) {
  const adminId = String(message.from.id);
  const session = sessions.get(adminId);
  if (!session || session.mode !== 'admin_reply') return false;
  const ticket = tickets.get(session.ticketId);
  if (!ticket || ticket.assignedAdminId !== adminId || ['solved', 'cancelled'].includes(ticket.status)) {
    sessions.delete(adminId);
    await sendMessage(message.chat.id, 'Reply mode ended because the ticket is no longer active.');
    return true;
  }
  await forwardAdminReply(ticket, message, adminId);
  return true;
}

function adminDashboardText(chatId) {
  const assigned = [...tickets.values()].filter((ticket) => ticket.assignedAdminId === String(chatId) && !['solved', 'cancelled'].includes(ticket.status));
  if (!assigned.length) {
    return 'No active assigned tickets right now.';
  }
  return [
    'Your active tickets:',
    '',
    ...assigned.map((ticket) => `${ticket.id} - ${ticket.userName} - ${ticketStatusLabel(ticket.status)}`)
  ].join('\n');
}

function superAdminDashboardText() {
  const active = [...tickets.values()].filter((ticket) => !['solved', 'cancelled'].includes(ticket.status));
  if (!active.length) {
    return 'No active tickets right now.';
  }
  return [
    'Active tickets:',
    '',
    ...active.map((ticket) => `${ticket.id} - ${ticket.userName} - ${ticketStatusLabel(ticket.status)} - ${ticket.assignedAdminId ? adminLabel(ticket.assignedAdminId) : 'Unassigned'}`)
  ].join('\n');
}

async function handleMessage(message) {
  const chatId = String(message.chat.id);
  const text = String(message.text || '').trim();

  if (text === '/start' || text === '/help') {
    sessions.delete(String(message.from.id));
    if (isSuperAdmin(chatId)) {
      await sendMessage(chatId, `${welcomeText}\n\n${superAdminDashboardText()}`, adminOverviewKeyboard());
      return;
    }
    if (isSupportAdmin(chatId)) {
      await sendMessage(chatId, `${welcomeText}\n\n${adminDashboardText(chatId)}`, adminOverviewKeyboard());
      return;
    }
    await sendMessage(chatId, welcomeText, faqHomeKeyboard());
    return;
  }

  if (text === '/faq') {
    await sendMessage(chatId, 'Choose a support category:', faqHomeKeyboard());
    return;
  }

  if (text === '/agent') {
    sessions.set(String(message.from.id), { step: 'service' });
    await sendMessage(chatId, 'Choose the service related to your issue first:', serviceKeyboard());
    return;
  }

  if (text === '/cancel') {
    sessions.delete(String(message.from.id));
    const activeTicket = activeTicketForUser(String(message.from.id));
    if (activeTicket) {
      activeTicket.status = 'cancelled';
      userActiveTickets.delete(activeTicket.userId);
      await mirrorTicketUpdate(activeTicket, `Ticket ${activeTicket.id} was cancelled by the user.`);
      await sendMessage(chatId, `Ticket ${activeTicket.id} was cancelled.`, faqHomeKeyboard());
      return;
    }
    await sendMessage(chatId, 'Support flow cancelled.', faqHomeKeyboard());
    return;
  }

  if (isSuperAdmin(chatId)) {
    await sendMessage(chatId, 'Superadmin monitoring is button-based here. Assign tickets from the ticket buttons instead of replying directly.', adminOverviewKeyboard());
    return;
  }

  if (isSupportAdmin(chatId) && await handleAdminReply(message)) {
    return;
  }

  if (await handleUserSupportMessage(message)) {
    return;
  }

  await sendMessage(chatId, 'Choose a FAQ category first. If the FAQ does not solve it, the bot will guide you to live support.', faqHomeKeyboard());
}

async function poll() {
  let offset = 0;
  console.log('Dink Support bot started.');
  while (true) {
    try {
      const updates = await telegram('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] });
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.callback_query) await handleCallback(update.callback_query);
        if (update.message) await handleMessage(update.message);
      }
    } catch (error) {
      console.error(error.message);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

poll();
