import React, { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { useCurrentUser, useNotifications } from '@/hooks/useAppData';
import StatCard from '@/components/ui-custom/StatCard';
import { 
  LayoutDashboard, Users, ShieldCheck, DollarSign, CreditCard, 
  HeadphonesIcon, Settings, ArrowLeft, FileText, Activity, WalletCards, BellRing, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ThemeToggle from '@/components/ThemeToggle';
import { Skeleton } from '@/components/ui/skeleton';
import { matchesProviderEnvironment, normalizeProviderEnvironment } from '@/lib/providerEnvironment';
import { announceNewNotifications, getNotificationPermission, markNotificationsAsSeen, requestDeviceNotificationPermission } from '@/lib/deviceNotifications';

function formatUsd(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function hasAnyAdminRoleLocal(user) {
  return ['support', 'support_response', 'kyc_checker', 'admin', 'superadmin'].includes(user?.role);
}

function getAlertsButtonLabel(permission) {
  if (permission === 'granted') return 'Alerts Enabled';
  if (permission === 'denied') return 'Alerts Blocked';
  return 'Enable Alerts';
}

const ADMIN_SOUND_KEY = 'dinkcard_admin_sounds';

function playAdminTone(type) {
  if (typeof window === 'undefined') return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const frequencyMap = {
    user: 520,
    deposit: 660,
    card: 740,
    kyc: 580,
    support: 440,
    security: 220
  };
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type === 'security' ? 'sawtooth' : 'sine';
  oscillator.frequency.value = frequencyMap[type] || 500;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.24);
  setTimeout(() => context.close().catch(() => {}), 350);
}

const adminNav = [
  { label: 'Overview', path: '/admin', icon: LayoutDashboard },
  { label: 'Users', path: '/admin/users', icon: Users, ownerOnly: true },
  { label: 'KYC', path: '/admin/kyc', icon: ShieldCheck },
  { label: 'Deposits', path: '/admin/deposits', icon: DollarSign },
  { label: 'Cards', path: '/admin/cards', icon: CreditCard },
  { label: 'Tickets', path: '/admin/tickets', icon: HeadphonesIcon },
  { label: 'Broadcast', path: '/admin/broadcast', icon: BellRing },
  { label: 'Pricing Settings', path: '/admin/fees', icon: Settings, ownerOnly: true },
  { label: 'Audit Logs', path: '/admin/audit', icon: FileText, ownerOnly: true },
];

const roleNavAccess = {
  support: new Set(['/admin', '/admin/tickets', '/admin/broadcast']),
  support_response: new Set(['/admin', '/admin/tickets', '/admin/broadcast']),
  kyc_checker: new Set(['/admin', '/admin/kyc']),
  admin: new Set(['/admin', '/admin/kyc', '/admin/deposits', '/admin/cards', '/admin/tickets', '/admin/broadcast']),
  superadmin: null
};

function AdminOverviewSkeleton() {
  return (
    <div className="space-y-6 rounded-[28px] border border-border bg-card p-4 md:p-6">
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { data: currentUser } = useCurrentUser();
  const { data: adminNotifications } = useNotifications(currentUser?.email);
  const [soundMuted, setSoundMuted] = useState(() => localStorage.getItem(ADMIN_SOUND_KEY) === 'muted');
  const [notificationPermission, setNotificationPermission] = useState(() => getNotificationPermission());
  const previousStatsRef = useRef(null);
  const previousNotificationIdsRef = useRef(null);
  const access = roleNavAccess[currentUser?.role] || roleNavAccess.support;
  const visibleNav = adminNav.filter((item) => {
    if (currentUser?.role === 'superadmin') return true;
    if (item.ownerOnly) return false;
    return access?.has(item.path);
  });

  const usersQuery = useQuery({ queryKey: ['admin-users'], queryFn: () => apiClient.entities.User.list('-created_date', 100), refetchInterval: REFRESH.admin });
  const kycQuery = useQuery({ queryKey: ['admin-kyc'], queryFn: () => apiClient.entities.KYCSubmission.list('-created_date', 100), refetchInterval: REFRESH.admin });
  const depositsQuery = useQuery({ queryKey: ['admin-deposits'], queryFn: () => apiClient.entities.Deposit.list('-created_date', 100), refetchInterval: REFRESH.admin });
  const companyBalancesQuery = useQuery({ queryKey: ['bitnob-balances'], queryFn: apiClient.admin.balances, refetchInterval: REFRESH.fees, retry: false, staleTime: 0, refetchOnMount: 'always' });
  const { data: companyBalances } = companyBalancesQuery;
  const activeEnvironment = normalizeProviderEnvironment(companyBalances?.environment);
  const cardsQuery = useQuery({ queryKey: ['admin-overview-cards', activeEnvironment || 'current'], queryFn: () => apiClient.entities.VirtualCard.list('-created_date', 100), enabled: Boolean(activeEnvironment) || companyBalancesQuery.isError, refetchInterval: REFRESH.admin, staleTime: 0, refetchOnMount: 'always' });
  const ticketsQuery = useQuery({ queryKey: ['admin-tickets'], queryFn: () => apiClient.entities.SupportTicket.list('-created_date', 100), refetchInterval: REFRESH.admin });
  const walletSummaryQuery = useQuery({ queryKey: ['admin-wallet-summary'], queryFn: apiClient.admin.walletSummary, refetchInterval: REFRESH.admin });
  const { data: users } = usersQuery;
  const { data: kycSubs } = kycQuery;
  const { data: deposits } = depositsQuery;
  const cards = (cardsQuery.data || []).filter((card) => matchesProviderEnvironment(card, activeEnvironment));
  const { data: tickets } = ticketsQuery;
  const { data: walletSummary } = walletSummaryQuery;

  const pendingKYC = kycSubs?.filter(k => k.status === 'pending')?.length || 0;
  const pendingDeposits = deposits?.filter(d => d.status === 'awaiting_review')?.length || 0;
  const openTickets = tickets?.filter(t => ['open', 'under_review'].includes(t.status))?.length || 0;
  const totalUsableBalance = Number(walletSummary?.totalUsableBalance || 0);
  const stableCompanyBalance = Number(companyBalances?.totalUsd || companyBalances?.stableUsd || 0);
  const activeCards = cards?.filter((card) => String(card.status || '').toLowerCase() === 'active')?.length || 0;
  const frozenCards = cards?.filter((card) => String(card.status || '').toLowerCase() === 'frozen')?.length || 0;
  const unreadAdminNotifications = adminNotifications?.filter((item) => !item.read)?.length || 0;
  const alertsLabel = getAlertsButtonLabel(notificationPermission);

  useEffect(() => {
    localStorage.setItem(ADMIN_SOUND_KEY, soundMuted ? 'muted' : 'enabled');
  }, [soundMuted]);

  useEffect(() => {
    const stats = {
      users: users?.length || 0,
      kyc: pendingKYC,
      deposits: pendingDeposits,
      cards: cards?.length || 0,
      tickets: openTickets
    };
    const previous = previousStatsRef.current;
    previousStatsRef.current = stats;
    if (!previous || soundMuted || !hasAnyAdminRoleLocal(currentUser)) return;
    if (stats.deposits > previous.deposits) playAdminTone('deposit');
    else if (stats.kyc > previous.kyc) playAdminTone('kyc');
    else if (stats.tickets > previous.tickets) playAdminTone('support');
    else if (stats.cards > previous.cards) playAdminTone('card');
    else if (stats.users > previous.users) playAdminTone('user');
  }, [cards?.length, currentUser, openTickets, pendingDeposits, pendingKYC, soundMuted, users?.length]);

  const isOverview = location.pathname === '/admin';
  const overviewQueries = [usersQuery, kycQuery, depositsQuery, cardsQuery, ticketsQuery, walletSummaryQuery, companyBalancesQuery];
  const overviewLoading = isOverview && overviewQueries.some((query) => query.isLoading);
  const overviewError = isOverview && overviewQueries.some((query) => query.isError && !query.data);
  const syncProvider = useMutation({
    mutationFn: apiClient.admin.customers.syncBitnob,
    onSuccess: async (result) => {
      await invalidateOperationalData(queryClient);
      const skipped = Number(result?.skippedCustomers || 0) + Number(result?.skippedCards || 0);
      toast.success(`Synced ${result?.importedCustomers || result?.imported || 0}/${result?.providerCustomerCount ?? '?'} customers and ${result?.importedCards || 0} cards${skipped ? `, skipped ${skipped}` : ''}.`);
    },
    onError: (error) => toast.error(error.message || 'Sync failed')
  });

  const refreshDashboard = async () => {
    await invalidateOperationalData(queryClient);
    toast.success('Dashboard refreshed');
  };

  const requestAlerts = async () => {
    if (notificationPermission === 'granted') {
      toast.success('Admin device alerts are already enabled.');
      return;
    }
    const result = await requestDeviceNotificationPermission();
    setNotificationPermission(result);
    if (result === 'granted') toast.success('Admin device alerts enabled.');
    else toast.error(result === 'denied' ? 'Alerts are blocked in this browser. Allow notifications in browser settings.' : 'Device alerts were not enabled.');
  };

  useEffect(() => {
    if (!currentUser?.email || !window.EventSource) return undefined;
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const events = new EventSource(`${baseUrl}/api/events`, { withCredentials: true });

    events.addEventListener('notification_count', () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', currentUser.email] });
      queryClient.invalidateQueries({ queryKey: ['notifications', currentUser.email] });
      invalidateOperationalData(queryClient);
    });

    events.onerror = () => {};

    return () => events.close();
  }, [currentUser?.email, queryClient]);

  useEffect(() => {
    if (!currentUser?.email || !adminNotifications?.length) return;
    const unreadIds = new Set(adminNotifications.filter((item) => !item.read && item.id).map((item) => item.id));
    const previousIds = previousNotificationIdsRef.current;
    previousNotificationIdsRef.current = unreadIds;

    if (notificationPermission === 'granted') {
      announceNewNotifications(adminNotifications);
    } else {
      markNotificationsAsSeen(adminNotifications.filter((item) => item.read));
    }

    if (!previousIds || soundMuted || !hasAnyAdminRoleLocal(currentUser)) return;
    const hasFreshUnread = [...unreadIds].some((id) => !previousIds.has(id));
    if (hasFreshUnread) playAdminTone('support');
  }, [adminNotifications, currentUser, notificationPermission, soundMuted]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 overflow-x-hidden px-2 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] sm:space-y-6 sm:px-0 sm:pb-4 md:pt-6 lg:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/dashboard">
            <button className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">Platform management</p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <ThemeToggle compact className="w-full justify-center sm:w-auto" />
          {notificationPermission !== 'unsupported' && (
            <button
              type="button"
              onClick={requestAlerts}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/15 sm:w-auto"
            >
              <BellRing className="h-4 w-4" /> {alertsLabel}
            </button>
          )}
          <Link
            to="/notifications"
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:w-auto"
          >
            <BellRing className="h-4 w-4" /> Alerts{unreadAdminNotifications ? ` (${unreadAdminNotifications})` : ''}
          </Link>
          <button
            type="button"
            onClick={() => setSoundMuted((current) => !current)}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:w-auto"
            title={soundMuted ? 'Turn admin notification sounds on' : 'Turn admin notification sounds off'}
          >
            <BellRing className="h-4 w-4" /> {soundMuted ? 'Sounds Off' : 'Sounds On'}
          </button>
          <button
            type="button"
            onClick={refreshDashboard}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:w-auto"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => syncProvider.mutate()}
            disabled={syncProvider.isPending}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60 sm:w-auto"
          >
            <RefreshCw className={cn('h-4 w-4', syncProvider.isPending && 'animate-spin')} />
            {syncProvider.isPending ? 'Syncing...' : 'Sync Provider'}
          </button>
        </div>
      </div>

      {/* Admin nav tabs */}
      {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
        <div className="rounded-2xl border border-primary/20 bg-primary/8 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Enable admin alerts</p>
              <p className="text-xs text-muted-foreground">
                Turn on browser alerts and sound so new deposits, KYC reviews, tickets, and card updates reach you instantly.
              </p>
            </div>
            <button
              type="button"
              onClick={requestAlerts}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground sm:w-auto"
            >
              <BellRing className="h-4 w-4" /> {alertsLabel}
            </button>
          </div>
        </div>
      )}
      <div className="rounded-2xl border border-border bg-card p-2">
        <div className="flex gap-1 overflow-x-auto">
        {visibleNav.map(item => (
          <Link key={item.path} to={item.path}>
            <button className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
              location.pathname === item.path ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}>
              <item.icon className="w-4 h-4" />
              {item.label}
              {item.label === 'KYC' && pendingKYC > 0 && <span className="w-5 h-5 rounded-full bg-yellow-500 text-[10px] font-bold text-white flex items-center justify-center">{pendingKYC}</span>}
              {item.label === 'Deposits' && pendingDeposits > 0 && <span className="w-5 h-5 rounded-full bg-yellow-500 text-[10px] font-bold text-white flex items-center justify-center">{pendingDeposits}</span>}
              {item.label === 'Tickets' && openTickets > 0 && <span className="w-5 h-5 rounded-full bg-accent text-[10px] font-bold text-white flex items-center justify-center">{openTickets}</span>}
            </button>
          </Link>
        ))}
        </div>
      </div>

      {isOverview ? (
        overviewLoading ? (
          <AdminOverviewSkeleton />
        ) : overviewError ? (
          <div className="rounded-[28px] border border-border bg-card p-5 text-sm">
            <p className="font-semibold">Could not load admin overview.</p>
            <p className="mt-1 text-muted-foreground">Retry when the connection is stable.</p>
            <button type="button" onClick={refreshDashboard} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Retry</button>
          </div>
        ) : (
        <div className="space-y-6 rounded-[28px] border border-border bg-card p-4 md:p-6">
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-500">
            All deposits, KYC reviews, card requests, refunds, and manual approvals must be reviewed according to provider rules, customer verification, transaction records, internal policy, and applicable compliance requirements.
          </div>
          <div className="grid auto-rows-fr grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            <StatCard title="Total Users" value={users?.length || 0} icon={Users} />
            <StatCard title="Pending KYC" value={pendingKYC} icon={ShieldCheck} accentClass={pendingKYC > 0 ? 'text-yellow-500' : 'text-primary'} />
            <StatCard title="Pending Deposits" value={pendingDeposits} icon={DollarSign} accentClass={pendingDeposits > 0 ? 'text-yellow-500' : 'text-primary'} />
            <StatCard title="Company Wallet" value={`$${stableCompanyBalance.toFixed(2)}`} subtitle={`${Number(companyBalances?.usdc || 0).toFixed(2)} USDC / ${Number(companyBalances?.usdt || 0).toFixed(4)} USDT`} icon={WalletCards} />
            <StatCard title="Platform Balance" value={`$${totalUsableBalance.toFixed(2)}`} icon={Activity} />
            <StatCard title="Total Cards" value={cards?.length || 0} subtitle={`${activeCards} active / ${frozenCards} frozen`} icon={CreditCard} />
            <StatCard title="Open Tickets" value={openTickets} icon={HeadphonesIcon} accentClass={openTickets > 0 ? 'text-accent' : 'text-primary'} />
          </div>

          {/* Recent deposits needing review */}
          {pendingDeposits > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-3">Deposits Awaiting Review</h3>
              <div className="space-y-2">
                {deposits?.filter(d => d.status === 'awaiting_review').slice(0, 5).map(d => (
                  <Link key={d.id} to="/admin/deposits">
                    <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
                      <div>
                        <p className="text-sm font-medium">{d.user_id}</p>
                        <p className="text-xs text-muted-foreground">{d.payment_method} • Ref: {d.transaction_reference}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-semibold">{formatUsd(d.requested_usd_amount)}</p>
                        <p className="text-xs text-muted-foreground">{d.total_payable_etb?.toLocaleString()} ETB</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        )
      ) : (
        <div className="rounded-[28px] border border-border bg-card p-4 md:p-6">
          <Outlet />
        </div>
      )}
    </div>
  );
}
