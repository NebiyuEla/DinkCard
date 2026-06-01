export const REFRESH = {
  user: 60000,
  admin: 5000,
  fees: 2000,
  notifications: 3000
};

export async function invalidateOperationalData(queryClient) {
  const keys = [
    'currentUser',
    'dashboard',
    'feeSettings',
    'wallet',
    'walletTransactions',
    'cards',
    'deposits',
    'kyc',
    'supportTickets',
    'ticketMessages',
    'notifications',
    'paymentMethods',
    'admin-users',
    'admin-wallet-summary',
    'admin-kyc',
    'admin-deposits',
    'admin-cards',
    'admin-tickets',
    'admin-users-broadcast',
    'bitnob-customers',
    'bitnob-balances',
    'bitnob-transactions',
    'provider-status',
    'audit-logs',
    'sa-users',
    'sa-kyc',
    'sa-deposits',
    'sa-cards',
    'sa-tickets',
    'sa-wallet-summary'
  ];

  keys.forEach((key) => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });

  await queryClient.refetchQueries({
    type: 'active',
    predicate: (query) => keys.includes(String(query.queryKey?.[0] || ''))
  });
}
