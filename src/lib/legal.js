export const BRAND_NAME = 'Dink Card';
export const LEGAL_BUSINESS_NAME = 'Dink Card';
export const SUPPORT_EMAIL = 'support@dinkcard.cc';
export const SUPPORT_LINK = '/contact-support';
export const BUSINESS_ADDRESS = 'Addis Ababa, Ethiopia';
export const TERMS_VERSION = 'v1.2';
export const LAST_UPDATED = 'May 23, 2026';

export const legalLinks = [
  { label: 'Terms', path: '/terms' },
  { label: 'Privacy', path: '/privacy-policy' },
  { label: 'Refunds', path: '/refund-policy' },
  { label: 'Fees', path: '/fee-disclosure' },
  { label: 'KYC & Compliance', path: '/kyc-compliance' },
  { label: 'Acceptable Use', path: '/acceptable-use' },
  { label: 'Card Usage Notice', path: '/risk-disclosure' },
  { label: 'Contact', path: '/contact' },
  { label: 'Account Deletion', path: '/account-deletion' },
  { label: 'Complaints', path: '/complaints' }
];

export const platformDisclaimer = `${BRAND_NAME} helps verified users access and manage virtual card-related services through approved third-party infrastructure partners. Card creation, funding, processing, settlement, limits, availability, and acceptance are subject to partner provider rules, compliance checks, merchant acceptance, technical availability, and applicable regulations.`;

export const footerDisclaimer = `${BRAND_NAME} is operated by ${LEGAL_BUSINESS_NAME}. ${BRAND_NAME} is not a bank or financial institution. Card issuance, payment processing, merchant acceptance, refunds, and transaction rules may depend on authorized third-party providers and merchants. Merchant acceptance is not guaranteed.`;

export const appStoreDescription = `${BRAND_NAME} helps users in Ethiopia access supported virtual card-related services with clear ETB pricing, exchange-rate visibility, and simple service processing.`;

export const appStoreDisclaimer = `${BRAND_NAME} is not a bank or financial institution. Card issuance, payment processing, merchant acceptance, refunds, and transaction rules may depend on authorized third-party providers and merchants.`;

export const checkoutAgreement = 'I understand that card approval, funding, processing, and merchant acceptance are subject to verification, provider rules, compliance checks, service availability, and applicable fees.';

export const policies = {
  terms: {
    title: 'Terms & Conditions',
    intro: [
      `Last updated: ${LAST_UPDATED}`,
      `Welcome to ${BRAND_NAME}. These Terms & Conditions govern your access to and use of our website, platform, services, available platform/service balance features, virtual card request features, support tools, and related digital services.`,
      `By creating an account or using our services, you agree to these Terms. If you do not agree, please do not use the platform.`
    ],
    sections: [
      ['About Our Service', `${BRAND_NAME} is a digital card access and management platform operated by ${LEGAL_BUSINESS_NAME}. ${BRAND_NAME} is not a bank, foreign exchange bureau, financial institution, or independent international payment card issuer. We provide a digital platform that helps verified users request, fund, and manage virtual card-related services through approved third-party infrastructure partners. Card creation, card processing, card settlement, card availability, transaction approval, limits, restrictions, refunds, and merchant acceptance are subject to the rules, terms, compliance checks, and technical availability of our third-party infrastructure partners.`],
      ['Eligibility', `To use ${BRAND_NAME}, you must be legally allowed to use the service in your country, provide accurate personal, contact, and payment information, complete verification/KYC when requested, use the service only for lawful supported online payments, and comply with our policies and partner provider requirements. We may refuse, suspend, or terminate access if account activity, documents, or transactions create legal, fraud, compliance, financial, security, or operational risk.`],
      ['Account Registration', 'You are responsible for keeping your login details secure. You must not share your account, password, OTP, card details, verification documents, or private account access with unauthorized persons. You are responsible for activity performed through your account unless you quickly report unauthorized access and we confirm the issue.'],
      ['Verification and KYC', 'We may require identity verification, business verification, proof of address, payment proof, phone verification, email verification, or additional documents before allowing funding, card requests, card funding, refunds, or account upgrades. All documents and information submitted must be true, accurate, current, and legally yours. False, misleading, forged, edited, stolen, third-party, or unauthorized documents may result in rejection, suspension, cancellation, permanent ban, refund delay, or reporting where required.'],
      ['Add Money and Available Service Balance', 'When you add funds, you are adding value for supported card-related service requests on the platform. Your displayed balance represents available platform/service balance for eligible services. It is not a bank deposit, savings account, foreign currency account, stored bank account, or interest-bearing account. Payments may be subject to review, confirmation, provider approval, payment gateway response, manual verification, anti-fraud checks, and compliance requirements.'],
      ['Exchange Rate and Fees', 'Before confirming a payment or card request, we show available information such as exchange rate, service fee, payment method fee, card creation fee, card funding fee, total payable amount, expected credited value, and estimated processing time. Rates and fees may change based on market conditions, provider fees, payment gateway fees, bank charges, operational cost, and risk level.'],
      ['Virtual Card Requests', 'Users may request virtual cards through the platform after meeting verification and funding requirements. We do not independently issue cards. Virtual cards are provided, processed, and controlled through third-party infrastructure partners. A request may be approved, delayed, declined, frozen, blocked, terminated, or limited based on KYC status, provider rules, card network rules, merchant restrictions, risk checks, suspicious activity, insufficient balance, technical issues, legal or compliance requirements, and service availability.'],
      ['Card Usage', 'Virtual cards are intended for supported online payments only. They may not work for every merchant, website, subscription, country, platform, or transaction type. Merchant acceptance is not guaranteed. A card may fail because of merchant restrictions, region restrictions, provider rules, 3D Secure requirements, insufficient balance, billing address mismatch, unsupported merchant category, subscription restrictions, fraud/risk checks, or network/provider downtime.'],
      ['Prohibited Use', `You must not use ${BRAND_NAME} for fraud, scams, money laundering, terrorist financing, illegal activity, prohibited gambling, illegal adult content, weapons or restricted goods, stolen accounts, stolen payment methods, unauthorized crypto/forex/investment schemes, unauthorized card resale, sanctions evasion, false documents, chargeback abuse, refund fraud, or activity that creates legal, compliance, security, or reputational risk.`],
      ['Transactions and Records', 'We keep records of funding requests, card requests, card funding, card transactions, refunds, support requests, KYC reviews, admin actions, login activity, and account activity. Transaction records, provider responses, payment gateway logs, admin review records, and support records may be used to resolve disputes, process refunds, investigate fraud, and meet compliance requirements.'],
      ['Refunds', 'Refund eligibility depends on transaction status, provider response, payment gateway status, processing stage, and platform policy. Refunds may not be available after a virtual card has been successfully created, funded, used, charged by the provider, or processed by a third-party service. Fees charged by banks, payment gateways, card providers, network providers, or third-party processors may be non-refundable unless otherwise stated.'],
      ['Account Suspension or Termination', 'We may suspend, restrict, or terminate your account if you violate these Terms, submit false or suspicious information, fail verification, create risky or unlawful transactions, abuse support/refunds/chargebacks/platform systems, or if a provider, bank, payment gateway, regulator, or compliance partner requires restriction.'],
      ['Third-Party Providers', 'Our platform depends on third-party providers, including payment gateways, banks, infrastructure providers, hosting providers, verification providers, and communication services. We are not responsible for delays, failures, restrictions, fees, downtime, declined transactions, or service changes caused by third-party providers.'],
      ['No Guarantee', 'We do not guarantee card approval, instant processing, merchant acceptance, availability of all services, successful payment on every website, fixed exchange rates forever, unlimited card creation, uninterrupted provider access, or refund eligibility after processing has started.'],
      ['User Responsibility', 'You are responsible for entering correct payment details, sending exact payment amounts when required, uploading real proof of payment, using your own legal documents, keeping card details private, checking merchant compatibility before payment, reading fee and refund information before confirming, and contacting support quickly when issues happen.'],
      ['Compliance With Law', 'You agree to use the platform according to applicable laws, regulations, payment rules, provider requirements, and platform policies. Where required, we may request additional information, delay processing, reject transactions, keep records, or report suspicious activity to relevant partners or authorities.'],
      ['Payment Processing', 'Payment gateways are used only to process supported payments for the platform. Payment confirmation, account crediting, service balance updates, and order processing are subject to backend verification, transaction reference matching, gateway status, fraud review, and platform approval. A successful payment screen alone does not guarantee final approval until the platform verifies the payment.'],
      ['Changes to Terms', 'We may update these Terms from time to time. Updated Terms will be posted on the platform. Continued use of the service after updates means you accept the revised Terms.'],
      ['Contact', `For support, questions, refunds, or complaints, contact us through Email: ${SUPPORT_EMAIL}; Support: ${SUPPORT_LINK}; Address: ${BUSINESS_ADDRESS}; Legal Operator: ${LEGAL_BUSINESS_NAME}.`]
    ]
  },
  privacy: {
    title: 'Privacy Policy',
    intro: [`Last updated: ${LAST_UPDATED}`, `This policy explains how ${BRAND_NAME} collects, uses, stores, and protects information needed to operate a verified digital card access and management service.`],
    sections: [
      ['Information We Collect', 'We may collect account details, contact information, KYC information, submitted documents, payment records, service balance records, card request records, support messages, device/session data, and admin review records.'],
      ['How We Use Information', 'We use information to provide the platform, verify users, process funding requests, review card-related service requests, prevent fraud, protect accounts, meet compliance obligations, resolve disputes, and provide support.'],
      ['Sharing', 'We may share necessary information with approved third-party infrastructure partners, payment processors, verification providers, hosting providers, compliance partners, and authorities where required by law or risk controls.'],
      ['Retention and Security', 'We keep records as needed for operations, dispute resolution, fraud prevention, and compliance. We use access controls, server-side authorization, encrypted sessions, and audit records to reduce unauthorized access risk.'],
      ['Your Choices', 'You may contact support to request corrections, account help, or information about your data, subject to security, compliance, and recordkeeping requirements.']
    ]
  },
  refunds: {
    title: 'Refund Policy',
    intro: [`Last updated: ${LAST_UPDATED}`, 'Refunds are handled based on transaction status, provider response, payment gateway status, processing costs, and platform policy.'],
    sections: [
      ['Funding Requests', 'If a funding request cannot be processed or is rejected before service processing begins, eligible amounts may be returned after review. Processing fees charged by gateways, banks, card providers, or third-party processors may be non-refundable unless otherwise stated.'],
      ['Card Requests and Funding', 'Refunds may not be available after a virtual card has been created, funded, used, charged by a provider, or processed by a third-party service.'],
      ['Disputes and Delays', 'Refund timing depends on gateway, provider, bank, and compliance review. We may request additional information before processing a refund.'],
      ['Restricted Accounts', 'Accounts under fraud, chargeback, sanctions, KYC, or compliance review may experience delayed, partial, or denied refunds according to law, provider rules, and platform policy.']
    ]
  },
  feeDisclosure: {
    title: 'Fee Disclosure',
    intro: [
      `Last updated: ${LAST_UPDATED}`,
      'We show the final payable amount and exchange rate before payment. The customer checkout may combine several business costs into one clear service & processing fee to keep pricing easy to understand.'
    ],
    sections: [
      ['What the Checkout Shows', 'The main checkout shows the card amount in USD, the exchange rate used, the service & processing fee, and the total payable in ETB before payment.'],
      ['What the Fee May Include', 'The service & processing fee may include card provider costs, payment gateway costs, service margin, exchange-rate protection, settlement costs, operational costs, and ETB rounding.'],
      ['Configurable Fees', 'Rates, margins, provider costs, gateway costs, minimum fees, safety buffers, and rounding rules may change based on admin settings, market conditions, provider pricing, fraud risk, or operational needs.'],
      ['Extra Card-Related Fees', 'Some international websites, failed authorizations, refunds, provider actions, merchant restrictions, or network events may create extra card-related fees. We will notify users when this applies.'],
      ['No Hidden Final Price', 'We do not hide the final payable amount. Users should review the total payable and exchange rate before confirming payment.']
    ]
  },
  kyc: {
    title: 'KYC & Compliance Policy',
    intro: [`Last updated: ${LAST_UPDATED}`, 'Users must provide accurate identity, contact, and payment information before using supported card-related services.'],
    sections: [
      ['Verification Requirements', 'We may request identity documents, selfies, proof of address, payment proof, phone/email verification, source-of-funds information, or additional documents when needed.'],
      ['Document Rules', 'False, misleading, forged, edited, third-party, unauthorized, or stolen information may result in account restriction, transaction cancellation, service denial, refund delay, permanent ban, or reporting where required.'],
      ['Review Outcomes', 'KYC may be approved, rejected, or returned for specific corrections. We may require a complete resubmission when documents are unclear, inconsistent, expired, or suspicious.'],
      ['Ongoing Compliance', 'We may continue monitoring transactions and request additional information after approval if provider rules, internal policy, or applicable regulations require it.']
    ]
  },
  acceptableUse: {
    title: 'Acceptable Use Policy',
    intro: [`Last updated: ${LAST_UPDATED}`, `${BRAND_NAME} may be used only for lawful supported online payments through approved service flows.`],
    sections: [
      ['Prohibited Activity', 'Do not use the platform for fraud, scams, money laundering, terrorist financing, sanctions evasion, illegal goods/services, stolen accounts, stolen payment methods, unauthorized resale, chargeback abuse, refund fraud, card testing, or identity misuse.'],
      ['Merchant Restrictions', 'Some merchants, categories, subscriptions, regions, or transaction types may be unsupported or blocked by provider rules, network rules, risk checks, or compliance standards.'],
      ['Enforcement', 'We may block, freeze, reject, restrict, terminate, or report suspicious activity where required.']
    ]
  },
  risk: {
    title: 'Risk Disclosure / Card Usage Notice',
    intro: [`Last updated: ${LAST_UPDATED}`, 'Virtual card-related services are subject to provider rules, compliance checks, technical availability, and merchant acceptance.'],
    sections: [
      ['No Acceptance Guarantee', 'Merchant acceptance is not guaranteed. A virtual card may fail because of merchant restrictions, region restrictions, provider rules, 3D Secure requirements, insufficient balance, billing address mismatch, unsupported merchant category, subscription restrictions, fraud/risk checks, or downtime.'],
      ['Provider Control', 'Card creation, funding, processing, settlement, limits, freezes, restrictions, terminations, and refunds may depend on approved third-party infrastructure partners.'],
      ['User Responsibility', 'Check merchant compatibility, fees, refund rules, and transaction details before confirming any funding or card request.']
    ]
  },
  contact: {
    title: 'Contact & Support',
    intro: [`Need help with ${BRAND_NAME}? Use the in-app support page when signed in, or contact us using the details below.`],
    sections: [
      ['Support Email', SUPPORT_EMAIL],
      ['Support Link', SUPPORT_LINK],
      ['Business Address', BUSINESS_ADDRESS],
      ['Legal Operator', LEGAL_BUSINESS_NAME]
    ]
  },
  accountDeletion: {
    title: 'Account Deletion Request',
    intro: [`Last updated: ${LAST_UPDATED}`, `Users may request deletion or restriction of their ${BRAND_NAME} account, subject to identity verification, security checks, dispute handling, and required recordkeeping.`],
    sections: [
      ['How to Request Deletion', `Contact support at ${SUPPORT_EMAIL} or use the in-app support page. Include your registered email and a clear request to delete or close the account.`],
      ['Verification', 'We may ask for identity or account verification before deleting, closing, or restricting access to prevent unauthorized account takeover.'],
      ['Records We May Keep', 'We may retain transaction records, KYC records, payment records, support records, audit logs, fraud-prevention data, and compliance records where required for legal, security, dispute, provider, or accounting reasons.'],
      ['Open Balances and Disputes', 'Deletion may be delayed if there are open payments, card requests, refunds, chargebacks, disputes, investigations, restricted accounts, or unresolved provider actions.'],
      ['Processing Time', 'We aim to review account deletion requests within a reasonable time after receiving the required verification and resolving any open obligations.']
    ]
  },
  complaints: {
    title: 'Complaint & Dispute Page',
    intro: [`Last updated: ${LAST_UPDATED}`, 'Use this page to understand how complaints, transaction questions, failed payments, refunds, and service disputes are reviewed.'],
    sections: [
      ['How to Submit a Complaint', `Contact support at ${SUPPORT_EMAIL} or use the in-app support page with your payment reference, card request reference, screenshots if available, and a clear description of the issue.`],
      ['Review Process', 'We review platform records, payment gateway status, provider responses, KYC records, admin action logs, and user-submitted evidence before making a decision.'],
      ['Payment Disputes', 'A successful payment screen alone does not guarantee final approval. Payment status must be verified by the backend and matched to the correct Dink Card transaction reference.'],
      ['Card-Related Disputes', 'Card creation, funding, merchant acceptance, refunds, freezes, restrictions, and failed transactions may depend on authorized third-party providers and merchant/network rules.'],
      ['Response Time', 'We aim to respond as soon as practical. Complex cases involving providers, gateway checks, fraud review, or compliance review may take longer.']
    ]
  }
};
