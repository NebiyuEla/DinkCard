const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://dinkcard.et';
const SUPPORT_URL = process.env.SUPPORT_URL || `${PLATFORM_URL}/contact`;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required.');
}

const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
const sessions = new Map();

const welcomeText = `Welcome to Dink Support.

This is the official support bot for Dink services.

You can get help with Dink Card, Dink Pay, digital service payments, subscriptions, orders, deposits, verification, platform issues, and general questions.

Browse FAQs or contact a live support agent when you need direct help.

For your safety, never share your password, OTP, full card details, or private account information in chat.`;

const categories = [
  {
    id: 'card',
    title: 'Dink Card',
    questions: [
      ['card_start', 'How do I create a Dink Card?', 'Create an account, complete KYC, add funds, then request a virtual card from the Cards page. Card approval and activation depend on verification, provider rules, and service availability.'],
      ['card_limit', 'How many cards can I create?', 'A verified user can create up to 3 virtual cards. Terminated cards still count toward the total created cards.'],
      ['card_details', 'Where do I see card number, CVV, and expiry?', 'Open My Cards, choose the card, set or enter your 4-digit card PIN, then tap Reveal Details. Do not share full card details with anyone.'],
      ['card_failed', 'Why did card creation fail?', 'Common reasons are incomplete KYC, not enough service balance, provider limits, unavailable card service, or risk review. Check the error shown in the app first.'],
      ['card_freeze', 'How do I freeze or unfreeze a card?', 'Open the card details page, enter your card PIN, then use Freeze or Unfreeze. If it still fails, contact support with the card nickname and error message.']
    ]
  },
  {
    id: 'payments',
    title: 'Deposits and Payments',
    questions: [
      ['pay_add', 'How do I add funds?', 'Open Add Money, enter the amount, review the total payable, agree to the notice, and continue to checkout.'],
      ['pay_pending', 'Why is my deposit pending?', 'A deposit can stay pending while payment verification, network confirmation, or admin review is still in progress. Check the reference in your dashboard.'],
      ['pay_receipt', 'How do I download a receipt?', 'Open Transactions or Recent Funding and tap Download receipt.'],
      ['pay_crypto', 'Can I deposit with crypto?', 'If enabled on your account, open Add Money or Funds, choose Crypto deposit, select the asset and network, then use the generated address.'],
      ['pay_cancel', 'What happens if payment is cancelled?', 'If checkout is cancelled or expires, no service balance is added. You can start a new funding request from Add Money.']
    ]
  },
  {
    id: 'kyc',
    title: 'KYC and Verification',
    questions: [
      ['kyc_need', 'Why do I need KYC?', 'KYC is required before deposits, card requests, and card funding. It helps protect accounts and meet platform requirements.'],
      ['kyc_docs', 'What documents are accepted?', 'The platform supports National ID, Passport, and Drivers License. Passport and Drivers License require front image and selfie.'],
      ['kyc_pending', 'How long does KYC review take?', 'Manual review time depends on document quality and queue size. If rejected, the app shows what needs to be fixed.'],
      ['kyc_reject', 'Why was my KYC rejected?', 'Common reasons include unclear image, mismatched name, invalid ID number, missing selfie, underage user, or unreadable document.']
    ]
  },
  {
    id: 'account',
    title: 'Account and Login',
    questions: [
      ['acc_login', 'Can I sign in with username?', 'Yes. You can sign in using email, phone number, or username.'],
      ['acc_reset', 'How do I reset password?', 'Use Forgot password. You must confirm last name and date of birth. If that fails, contact admin support.'],
      ['acc_2fa', 'How do I enable 2FA?', 'Open Account and Security, then enable two-factor authentication with an authenticator app. Keep recovery codes safe.'],
      ['acc_delete', 'Can I delete my account?', 'Yes. Open Account and Security, choose Delete account, and confirm your password. Some records may be kept where required for compliance or dispute handling.']
    ]
  },
  {
    id: 'services',
    title: 'Digital Services',
    questions: [
      ['srv_supported', 'What can I pay for?', 'Supported online payments may include subscriptions, digital tools, app stores, ads, shopping, and selected services. Merchant acceptance is not guaranteed.'],
      ['srv_decline', 'Why did a website decline my card?', 'A merchant may decline because of region rules, billing address mismatch, 3D Secure, merchant category restrictions, provider rules, or risk checks.'],
      ['srv_refund', 'How do refunds work?', 'Refunds depend on provider response, transaction stage, payment status, processing costs, and platform policy.']
    ]
  },
  {
    id: 'safety',
    title: 'Safety',
    questions: [
      ['safe_share', 'What should I never share?', 'Never share your password, OTP, recovery codes, full card number, CVV, expiry, or private account information.'],
      ['safe_scam', 'How do I report suspicious activity?', `Contact security support immediately through ${SUPPORT_URL} or email security@dinkcard.et.`],
      ['safe_official', 'How do I know it is official?', `Use only ${PLATFORM_URL}, the in-app support page, and official Dink support channels.`]
    ]
  }
];

const categoryMap = new Map(categories.map((category) => [category.id, category]));
const questionMap = new Map(categories.flatMap((category) => category.questions.map((question) => [question[0], { category, question }])));

function mainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'Browse FAQs', callback_data: 'faq:home' }],
      [{ text: 'Dink Card', callback_data: 'faq:cat:card' }, { text: 'Deposits', callback_data: 'faq:cat:payments' }],
      [{ text: 'KYC', callback_data: 'faq:cat:kyc' }, { text: 'Account', callback_data: 'faq:cat:account' }],
      [{ text: 'Digital Services', callback_data: 'faq:cat:services' }, { text: 'Safety', callback_data: 'faq:cat:safety' }],
      [{ text: 'Contact live support', callback_data: 'support:start' }]
    ]
  };
}

function categoryKeyboard(categoryId) {
  const category = categoryMap.get(categoryId);
  if (!category) return mainKeyboard();
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
      [{ text: 'Deposits or orders', callback_data: 'support:service:Deposits and orders' }],
      [{ text: 'Account or verification', callback_data: 'support:service:Account and verification' }],
      [{ text: 'Back to FAQ', callback_data: 'faq:home' }]
    ]
  };
}

function issueKeyboard(service) {
  return {
    inline_keyboard: [
      [{ text: 'Payment pending', callback_data: `support:issue:${service}:Payment pending` }],
      [{ text: 'Card or service failed', callback_data: `support:issue:${service}:Card or service failed` }],
      [{ text: 'KYC or account issue', callback_data: `support:issue:${service}:KYC or account issue` }],
      [{ text: 'Something else', callback_data: `support:issue:${service}:Other issue` }],
      [{ text: 'Back', callback_data: 'support:start' }]
    ]
  };
}

function finalSupportKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'I checked FAQ, still need agent', callback_data: 'support:confirm' }],
      [{ text: 'Back to FAQs', callback_data: 'faq:home' }]
    ]
  };
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

function userLabel(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || user?.id;
}

async function handleCallback(callback) {
  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;
  const data = callback.data || '';
  await answerCallback(callback.id);

  if (data === 'faq:home') {
    sessions.delete(callback.from.id);
    return editMessage(chatId, messageId, 'Choose a support category:', mainKeyboard());
  }

  if (data.startsWith('faq:cat:')) {
    const categoryId = data.split(':')[2];
    const category = categoryMap.get(categoryId);
    return editMessage(chatId, messageId, category ? category.title : 'FAQs', categoryKeyboard(categoryId));
  }

  if (data.startsWith('faq:q:')) {
    const questionId = data.split(':')[2];
    const item = questionMap.get(questionId);
    if (!item) return editMessage(chatId, messageId, 'Question not found.', mainKeyboard());
    const [id, title, answer] = item.question;
    return editMessage(chatId, messageId, `${title}\n\n${answer}`, {
      inline_keyboard: [
        [{ text: 'Back', callback_data: `faq:cat:${item.category.id}` }],
        [{ text: 'Contact live support', callback_data: 'support:start' }]
      ]
    });
  }

  if (data === 'support:start') {
    sessions.set(callback.from.id, { step: 'service' });
    return editMessage(chatId, messageId, 'Before connecting you to a live agent, choose the service related to your issue:', serviceKeyboard());
  }

  if (data.startsWith('support:service:')) {
    const service = data.replace('support:service:', '');
    sessions.set(callback.from.id, { step: 'issue', service });
    return editMessage(chatId, messageId, `Service: ${service}\n\nWhat kind of issue are you having?`, issueKeyboard(service));
  }

  if (data.startsWith('support:issue:')) {
    const [, , service, issue] = data.split(':');
    sessions.set(callback.from.id, { step: 'confirm', service, issue });
    return editMessage(
      chatId,
      messageId,
      `Please check the FAQs first.\n\nService: ${service}\nIssue: ${issue}\n\nIf the FAQ did not solve it, continue to a live agent.`,
      finalSupportKeyboard()
    );
  }

  if (data === 'support:confirm') {
    const current = sessions.get(callback.from.id) || {};
    sessions.set(callback.from.id, { ...current, step: 'await_message' });
    return editMessage(chatId, messageId, 'Send one clear message with your issue, payment reference or order ID if available, and a screenshot/file if needed. Do not send passwords, OTP, CVV, or full card details.');
  }
}

async function notifyAdmin(message) {
  if (!ADMIN_CHAT_ID) return false;
  await sendMessage(ADMIN_CHAT_ID, message);
  return true;
}

async function handleSupportMessage(message) {
  const from = message.from;
  const session = sessions.get(from.id);
  if (!session || session.step !== 'await_message') return false;

  const summary = `New Dink Support request

User: ${userLabel(from)}
Telegram ID: ${from.id}
Username: ${from.username ? `@${from.username}` : 'N/A'}
Service: ${session.service || 'N/A'}
Issue: ${session.issue || 'N/A'}

Message:
${message.text || message.caption || '[file or media attached]'}

Reply with: /reply ${from.id} your message`;

  const delivered = await notifyAdmin(summary);
  if (delivered && !message.text) {
    await telegram('copyMessage', {
      chat_id: ADMIN_CHAT_ID,
      from_chat_id: message.chat.id,
      message_id: message.message_id
    }).catch(() => null);
  }

  sessions.delete(from.id);
  await sendMessage(message.chat.id, delivered
    ? 'Your support request was sent to the team. Please wait for a reply here.'
    : `Live agent routing is not configured yet. Please use ${SUPPORT_URL}.`);
  return true;
}

async function handleAdminReply(message) {
  if (!ADMIN_CHAT_ID || String(message.chat.id) !== String(ADMIN_CHAT_ID)) return false;
  const text = message.text || '';
  if (!text.startsWith('/reply ')) return false;
  const [, userId, ...parts] = text.split(' ');
  const reply = parts.join(' ').trim();
  if (!userId || !reply) {
    await sendMessage(message.chat.id, 'Usage: /reply USER_TELEGRAM_ID your message');
    return true;
  }
  await sendMessage(userId, `Dink Support:\n\n${reply}`);
  await sendMessage(message.chat.id, 'Reply sent.');
  return true;
}

async function handleMessage(message) {
  if (await handleAdminReply(message)) return;
  if (message.text === '/start' || message.text === '/help') {
    sessions.delete(message.from.id);
    await sendMessage(message.chat.id, welcomeText, mainKeyboard());
    return;
  }
  if (message.text === '/faq') {
    await sendMessage(message.chat.id, 'Choose a support category:', mainKeyboard());
    return;
  }
  if (message.text === '/agent') {
    sessions.set(message.from.id, { step: 'service' });
    await sendMessage(message.chat.id, 'Choose the service related to your issue first:', serviceKeyboard());
    return;
  }
  if (message.text === '/cancel') {
    sessions.delete(message.from.id);
    await sendMessage(message.chat.id, 'Support request cancelled.', mainKeyboard());
    return;
  }
  if (await handleSupportMessage(message)) return;
  await sendMessage(message.chat.id, 'Please choose a FAQ category first. If the FAQ does not solve it, the bot will guide you to live support.', mainKeyboard());
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
