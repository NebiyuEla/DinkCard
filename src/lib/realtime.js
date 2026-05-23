export const REFRESH = {
  user: 15000,
  admin: 8000,
  fees: 2000,
  notifications: 3000
};

export function invalidateOperationalData(queryClient) {
  [
    'feeSettings',
    'wallet',
    'walletTransactions',
    'cards',
    'deposits',
    'kyc',
    'supportTickets',
    'ticketMessages',
    'notifications',
    'admin-users',
    'admin-wallet-summary',
    'admin-kyc',
    'admin-deposits',
    'admin-cards',
    'admin-tickets',
    'audit-logs',
    'sa-users',
    'sa-kyc',
    'sa-deposits',
    'sa-cards',
    'sa-tickets'
  ].forEach((key) => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
}
