export function cleanName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function comparableName(value) {
  return cleanName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function accountDisplayName(user) {
  return cleanName(user?.full_name)
    || cleanName([user?.first_name, user?.last_name].filter(Boolean).join(' '))
    || cleanName(user?.email);
}

export function kycDisplayName(kyc) {
  return cleanName(kyc?.legal_name)
    || cleanName([kyc?.first_name, kyc?.last_name].filter(Boolean).join(' '))
    || cleanName(kyc?.user_id);
}

export function getNameMismatch(user, kyc) {
  const accountName = accountDisplayName(user);
  const kycName = kycDisplayName(kyc);
  if (!user || !kyc || !accountName || !kycName || accountName.includes('@') || kycName.includes('@')) return null;
  if (comparableName(accountName) === comparableName(kycName)) return null;
  return { accountName, kycName };
}
