import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { DEFAULT_SETTINGS } from '@/lib/feeCalculator';
import { REFRESH } from '@/lib/realtime';

export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: () => apiClient.auth.me(),
    retry: false,
    refetchInterval: REFRESH.user
  });
}

export function useWallet(userId) {
  return useQuery({
    queryKey: ['wallet', userId],
    queryFn: async () => {
      if (!userId) return null;
      const wallets = await apiClient.entities.Wallet.filter({ user_id: userId });
      return wallets[0] || null;
    },
    enabled: !!userId,
    refetchInterval: REFRESH.user
  });
}

export function useKYCStatus(userId) {
  return useQuery({
    queryKey: ['kyc', userId],
    queryFn: async () => {
      if (!userId) return null;
      const submissions = await apiClient.entities.KYCSubmission.filter({ user_id: userId }, '-created_date', 1);
      return submissions[0] || null;
    },
    enabled: !!userId,
    refetchInterval: REFRESH.user
  });
}

export function useCards(userId) {
  return useQuery({
    queryKey: ['cards', userId],
    queryFn: async () => {
      if (!userId) return [];
      return await apiClient.entities.VirtualCard.filter({ user_id: userId }, '-created_date');
    },
    enabled: !!userId,
    refetchInterval: REFRESH.user
  });
}

export function useDeposits(userId) {
  return useQuery({
    queryKey: ['deposits', userId],
    queryFn: async () => {
      if (!userId) return [];
      return await apiClient.entities.Deposit.filter({ user_id: userId }, '-created_date');
    },
    enabled: !!userId,
    refetchInterval: REFRESH.user
  });
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
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      if (!userId) return [];
      return await apiClient.entities.Notification.filter({ user_id: userId }, '-created_date', 20);
    },
    enabled: !!userId,
    refetchInterval: REFRESH.notifications
  });
}

export function useWalletTransactions(userId) {
  return useQuery({
    queryKey: ['walletTransactions', userId],
    queryFn: async () => {
      if (!userId) return [];
      return await apiClient.entities.WalletTransaction.filter({ user_id: userId }, '-created_date', 50);
    },
    enabled: !!userId,
    refetchInterval: REFRESH.user
  });
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
