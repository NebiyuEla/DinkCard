import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { DEFAULT_SETTINGS } from '@/lib/feeCalculator';
import { REFRESH } from '@/lib/realtime';
import { useAuth } from '@/lib/AuthContext';

function retryUnlessUnauthorized(failureCount, error) {
  return error?.status !== 401 && failureCount < 2;
}

export function useCurrentUser() {
  const { user, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: () => apiClient.auth.me(),
    enabled: isAuthenticated,
    initialData: user || undefined,
    staleTime: 30 * 1000,
    retry: retryUnlessUnauthorized,
    refetchInterval: isAuthenticated ? REFRESH.user : false
  });
}

export function useDashboardData(userId, select, options = {}) {
  return useQuery({
    queryKey: ['dashboard', userId],
    queryFn: () => apiClient.dashboard.get(),
    enabled: !!userId,
    select,
    staleTime: 15 * 1000,
    retry: retryUnlessUnauthorized,
    refetchInterval: options.refetchInterval ?? REFRESH.user
  });
}

export function useWallet(userId) {
  return useDashboardData(userId, (data) => data.wallet);
}

export function useKYCStatus(userId) {
  return useDashboardData(userId, (data) => data.kyc);
}

export function useCards(userId) {
  return useDashboardData(userId, (data) => data.cards || []);
}

export function useDeposits(userId) {
  return useDashboardData(userId, (data) => data.deposits || []);
}

export function useFeeSettings() {
  return useQuery({
    queryKey: ['feeSettings'],
    queryFn: async () => {
      const settings = await apiClient.entities.FeeSettings.filter({ key: 'default' });
      return settings[0] || DEFAULT_SETTINGS;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: REFRESH.fees
  });
}

export function useNotifications(userId) {
  return useDashboardData(userId, (data) => data.notifications || [], { refetchInterval: REFRESH.notifications });
}

export function useWalletTransactions(userId) {
  return useDashboardData(userId, (data) => data.transactions || []);
}

export function useSupportTickets(userId) {
  return useQuery({
    queryKey: ['supportTickets', userId],
    queryFn: async () => {
      if (!userId) return [];
      return await apiClient.entities.SupportTicket.filter({ user_id: userId }, '-created_date');
    },
    enabled: !!userId,
    refetchInterval: REFRESH.user
  });
}

export function usePaymentMethods() {
  return useQuery({
    queryKey: ['paymentMethods'],
    queryFn: async () => {
      return await apiClient.entities.PaymentMethod.filter({ enabled: true });
    },
    refetchInterval: REFRESH.fees
  });
}
