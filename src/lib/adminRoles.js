export const ADMIN_ROLES = ['support', 'support_response', 'kyc_checker', 'admin', 'superadmin'];

export function hasAdminRole(userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  return ADMIN_ROLES.includes(role);
}

export function getRoleHome(userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  if (role === 'superadmin') return '/superadmin/dashboard';
  if (hasAdminRole(role)) return '/admin';
  return '/dashboard';
}

