import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Link } from 'react-router-dom';
import StatCard from '@/components/ui-custom/StatCard';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { Users, ShieldCheck, DollarSign, CreditCard, HeadphonesIcon, WalletCards, RefreshCw, Search, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { matchesProviderEnvironment, normalizeProviderEnvironment } from '@/lib/providerEnvironment';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FilePreview from '@/components/FilePreview';

function formatUsd(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function normalizeCardStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['active', 'approved', 'ready', 'live'].includes(value)) return 'active';
  if (['frozen', 'suspended', 'paused'].includes(value)) return 'frozen';
  if (['deleted_remote', 'deleted', 'archived', 'failed', 'rejected'].includes(value)) return value;
  return value || 'pending';
}

function isCountableCard(card) {
  return !['deleted_remote', 'deleted', 'archived', 'failed', 'rejected'].includes(normalizeCardStatus(card?.status));
}

function shortId(value) {
  const clean = String(value || '');
  if (!clean) return '-';
  return clean.length > 14 ? `${clean.slice(0, 8)}...${clean.slice(-4)}` : clean;
}

function recordText(record) {
  return Object.values(record || {})
    .map((value) => typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''))
    .join(' ')
    .toLowerCase();
}

function buildSearchRows({ users = [], kycSubs = [], deposits = [], cards = [], tickets = [], walletTransactions = [], auditLogs = [] }) {
  return [
    ...users.map((record) => ({ type: 'User', title: record.full_name || record.email, subtitle: `${record.email || ''} ${record.phone || ''}`, record })),
    ...kycSubs.map((record) => ({ type: 'KYC', title: record.legal_name || `${record.first_name || ''} ${record.last_name || ''}`.trim() || record.user_id, subtitle: `${record.status || ''} ${record.id_type || ''} ${record.id_number || ''}`, record })),
    ...deposits.map((record) => ({ type: 'Deposit', title: record.user_id, subtitle: `${record.status || ''} ${record.transaction_reference || ''} $${Number(record.final_usd_credit || 0).toFixed(2)}`, record })),
    ...cards.map((record) => ({ type: 'Card', title: record.card_nickname || record.user_id || record.masked_pan, subtitle: `${record.status || ''} ${record.masked_pan || ''} ${record.provider_card_id || ''}`, record })),
    ...tickets.map((record) => ({ type: 'Ticket', title: record.subject || record.user_id, subtitle: `${record.status || ''} ${record.category || ''} ${record.user_id || ''}`, record })),
    ...walletTransactions.map((record) => ({ type: 'Transaction', title: record.description || record.type, subtitle: `${record.user_id || ''} ${record.reference || ''} ${record.amount || ''}`, record })),
    ...auditLogs.map((record) => ({ type: 'Audit', title: record.action || record.entity_type, subtitle: `${record.admin_id || ''} ${record.user_id || ''} ${record.entity_id || ''}`, record }))
  ];
}

function matchesUser(record = {}, user = {}) {
  const userKeys = [user.email, user.id, user.phone, user.username].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  if (!userKeys.length) return false;
  const recordKeys = [record.user_id, record.email, record.id, record.admin_id, record.actor, record.entity_id].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  return recordKeys.some((value) => userKeys.includes(value));
}

function DetailGrid({ title, record }) {
  if (!record) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(record || {}).map(([key, value]) => (
          <div key={key} className="min-w-0 rounded-lg border border-border bg-card p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{key.replace(/_/g, ' ')}</p>
            <p className="mt-1 break-words font-mono text-xs">{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '-')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelatedRows({ title, rows = [], empty = 'No related records.' }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {!rows.length ? (
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">{empty}</div>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {rows.map((row, index) => (
            <div key={row.id || row.reference || row.transaction_reference || index} className="rounded-lg border border-border bg-card p-3 text-xs">
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(row).slice(0, 12).map(([key, value]) => (
                  <div key={key} className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{key.replace(/_/g, ' ')}</p>
                    <p className="break-words font-mono">{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '-')}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SuperOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-52" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function SAOverview() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const usersQuery = useQuery({ queryKey: ['sa-users'], queryFn: () => apiClient.entities.User.list('-created_date', 200), refetchInterval: REFRESH.admin });
  const kycQuery = useQuery({ queryKey: ['sa-kyc'], queryFn: () => apiClient.entities.KYCSubmission.list('-created_date', 200), refetchInterval: REFRESH.admin });
  const depositsQuery = useQuery({ queryKey: ['sa-deposits'], queryFn: () => apiClient.entities.Deposit.list('-created_date', 200), refetchInterval: REFRESH.admin });
  const companyBalancesQuery = useQuery({ queryKey: ['bitnob-balances'], queryFn: apiClient.admin.balances, refetchInterval: REFRESH.fees, retry: false, staleTime: 0, refetchOnMount: 'always' });
  const { data: companyBalances } = companyBalancesQuery;
  const activeEnvironment = normalizeProviderEnvironment(companyBalances?.environment);
  const cardsQuery = useQuery({ queryKey: ['sa-cards', activeEnvironment || 'current'], queryFn: () => apiClient.entities.VirtualCard.list('-created_date', 200), enabled: Boolean(activeEnvironment) || companyBalancesQuery.isError, refetchInterval: REFRESH.admin, staleTime: 0, refetchOnMount: 'always' });
  const ticketsQuery = useQuery({ queryKey: ['sa-tickets'], queryFn: () => apiClient.entities.SupportTicket.list('-created_date', 200), refetchInterval: REFRESH.admin });
  const walletTxQuery = useQuery({ queryKey: ['sa-wallet-transactions'], queryFn: () => apiClient.entities.WalletTransaction.list('-created_date', 300), refetchInterval: REFRESH.admin });
  const auditQuery = useQuery({ queryKey: ['sa-audit'], queryFn: apiClient.admin.auditLogs, refetchInterval: REFRESH.admin });
  const { data: users } = usersQuery;
  const { data: kycSubs } = kycQuery;
  const { data: deposits } = depositsQuery;
  const cards = (cardsQuery.data || []).filter((card) => matchesProviderEnvironment(card, activeEnvironment));
  const { data: tickets } = ticketsQuery;
  const { data: walletTransactions } = walletTxQuery;
  const { data: auditLogs } = auditQuery;

  const pendingKYC = kycSubs?.filter(k => k.status === 'pending')?.length || 0;
  const pendingDeposits = deposits?.filter(d => d.status === 'awaiting_review')?.length || 0;
  const openTickets = tickets?.filter(t => ['open', 'under_review'].includes(t.status))?.length || 0;
  const stableCompanyBalance = Number(companyBalances?.totalUsd || companyBalances?.stableUsd || 0);
  const countableCards = cards.filter(isCountableCard);
  const activeCards = countableCards.filter((card) => normalizeCardStatus(card.status) === 'active').length;
  const frozenCards = countableCards.filter((card) => normalizeCardStatus(card.status) === 'frozen').length;
  const netProfitEtb = (deposits || [])
    .filter((deposit) => deposit.status === 'approved')
    .reduce((sum, deposit) => sum + Math.max(0, Number(deposit.service_fee_etb || 0)), 0);
  const approvedDepositCount = deposits?.filter((deposit) => deposit.status === 'approved')?.length || 0;
  const averageProfitEtb = approvedDepositCount ? netProfitEtb / approvedDepositCount : 0;
  const searchRows = useMemo(
    () => buildSearchRows({ users, kycSubs, deposits, cards, tickets, walletTransactions, auditLogs }),
    [users, kycSubs, deposits, cards, tickets, walletTransactions, auditLogs]
  );
  const visibleSearchRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return [];
    return searchRows.filter((item) => `${item.type} ${item.title} ${item.subtitle} ${recordText(item.record)}`.toLowerCase().includes(query)).slice(0, 30);
  }, [searchRows, searchTerm]);
  const selectedDetails = useMemo(() => {
    if (!selectedRecord) return null;
    const record = selectedRecord.record || {};
    const user = selectedRecord.type === 'User'
      ? record
      : (users || []).find((candidate) => matchesUser(record, candidate));
    const userKyc = user
      ? (kycSubs || []).filter((item) => matchesUser(item, user))
      : selectedRecord.type === 'KYC'
        ? [record]
        : [];
    const userCards = user ? cards.filter((item) => matchesUser(item, user)) : [];
    const userDeposits = user ? (deposits || []).filter((item) => matchesUser(item, user)) : [];
    const userTickets = user ? (tickets || []).filter((item) => matchesUser(item, user)) : [];
    const userTransactions = user ? (walletTransactions || []).filter((item) => matchesUser(item, user)) : [];
    const userAudits = user ? (auditLogs || []).filter((item) => matchesUser(item, user)) : [];
    return { user, userKyc, userCards, userDeposits, userTickets, userTransactions, userAudits };
  }, [selectedRecord, users, kycSubs, cards, deposits, tickets, walletTransactions, auditLogs]);
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

  const overviewQueries = [usersQuery, kycQuery, depositsQuery, cardsQuery, ticketsQuery, companyBalancesQuery, walletTxQuery, auditQuery];
  const overviewLoading = overviewQueries.some((query) => query.isLoading);
  const overviewError = overviewQueries.some((query) => query.isError && !query.data);

  if (overviewLoading) return <SuperOverviewSkeleton />;
  if (overviewError) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm">
        <p className="font-semibold">Could not load superadmin overview.</p>
        <p className="mt-1 text-muted-foreground">Retry when the connection is stable.</p>
        <button type="button" onClick={refreshDashboard} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground">Platform-wide statistics</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refreshDashboard}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => syncProvider.mutate()}
            disabled={syncProvider.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', syncProvider.isPending && 'animate-spin')} />
            {syncProvider.isPending ? 'Syncing...' : 'Sync Provider'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-500">
        All deposits, KYC reviews, card requests, refunds, and manual approvals must be reviewed according to provider rules, customer verification, transaction records, internal policy, and applicable compliance requirements.
      </div>

      <div className="grid auto-rows-fr grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard title="Total Users" value={users?.length || 0} icon={Users} />
        <StatCard title="Pending KYC" value={pendingKYC} icon={ShieldCheck} accentClass={pendingKYC > 0 ? 'text-yellow-500' : 'text-primary'} />
        <StatCard title="Pending Deposits" value={pendingDeposits} icon={DollarSign} accentClass={pendingDeposits > 0 ? 'text-yellow-500' : 'text-primary'} />
        <StatCard title="Company Wallet" value={`$${stableCompanyBalance.toFixed(2)}`} subtitle={`${Number(companyBalances?.usdc || 0).toFixed(2)} USDC / ${Number(companyBalances?.usdt || 0).toFixed(4)} USDT`} icon={WalletCards} />
        <StatCard title="Net Profit" value={`${netProfitEtb.toLocaleString()} ETB`} subtitle={`Avg ${averageProfitEtb.toFixed(0)} ETB / approved deposit`} icon={DollarSign} />
        <StatCard title="Total Cards" value={countableCards.length} subtitle={`${activeCards} active / ${frozenCards} frozen`} icon={CreditCard} />
        <StatCard title="Approved Deposits" value={approvedDepositCount} icon={DollarSign} />
        <StatCard title="Open Tickets" value={openTickets} icon={HeadphonesIcon} accentClass={openTickets > 0 ? 'text-accent' : 'text-primary'} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Global Search</h2>
          <p className="text-xs text-muted-foreground">Search by ID, name, phone number, email, reference, card, KYC, ticket, transaction, or audit detail.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search anything..." className="pl-9" />
        </div>
        {searchTerm.trim() && (
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            {!visibleSearchRows.length ? (
              <div className="p-4 text-sm text-muted-foreground">No matching records found.</div>
            ) : (
              <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
                {visibleSearchRows.map((item, index) => (
                  <button key={`${item.type}-${item.record?.id || item.record?.reference || index}`} type="button" onClick={() => setSelectedRecord(item)} className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-secondary/40">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{item.type}</span>
                        <p className="truncate text-sm font-semibold">{item.title || 'Untitled'}</p>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{item.subtitle || shortId(item.record?.id)}</p>
                    </div>
                    <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {pendingDeposits > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Deposits Awaiting Review</h3>
            <Link to="/superadmin/deposits" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {deposits?.filter(d => d.status === 'awaiting_review').slice(0, 5).map(d => (
              <Link key={d.id} to="/superadmin/deposits">
                <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
                  <div>
                    <p className="text-sm font-medium">{d.user_id}</p>
                    <p className="text-xs text-muted-foreground capitalize">{d.payment_method?.replace(/_/g, ' ')} • Ref: {d.transaction_reference}</p>
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

      {pendingKYC > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">KYC Submissions Pending</h3>
            <Link to="/superadmin/kyc" className="text-xs text-primary hover:underline">Review →</Link>
          </div>
          <div className="space-y-2">
            {kycSubs?.filter(k => k.status === 'pending').slice(0, 5).map(k => (
              <div key={k.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{k.legal_name || k.user_id}</p>
                  <p className="text-xs text-muted-foreground">{k.id_type?.replace(/_/g, ' ')} • {k.country}</p>
                </div>
                <span className="text-xs text-yellow-500 font-medium">Pending</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={Boolean(selectedRecord)} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedRecord?.type} Details</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-secondary/30 p-3">
                <p className="text-sm font-semibold">{selectedRecord.title}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">{selectedRecord.subtitle}</p>
              </div>
              {selectedDetails?.user && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {selectedDetails.user.avatar_url ? (
                      <img src={selectedDetails.user.avatar_url} alt={selectedDetails.user.full_name || selectedDetails.user.email} className="h-16 w-16 rounded-2xl object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-lg font-bold text-primary">
                        {String(selectedDetails.user.full_name || selectedDetails.user.email || '?').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-base font-semibold">{selectedDetails.user.full_name || selectedDetails.user.email}</p>
                      <p className="break-words text-xs text-muted-foreground">{selectedDetails.user.email} • {selectedDetails.user.phone || 'No phone'} • {selectedDetails.user.role || 'user'}</p>
                    </div>
                  </div>
                </div>
              )}
              <DetailGrid title={`${selectedRecord.type} record`} record={selectedRecord.record} />
              {selectedDetails?.user && selectedRecord.type !== 'User' && <DetailGrid title="Linked user account" record={selectedDetails.user} />}
              {selectedDetails?.userKyc?.map((kycRecord) => (
                <div key={kycRecord.id} className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3">
                  <DetailGrid title="KYC identity details" record={kycRecord} />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <FilePreview url={kycRecord.front_id_url} label="Front ID" />
                    <FilePreview url={kycRecord.back_id_url} label="Back ID" />
                    <FilePreview url={kycRecord.selfie_url} label="Selfie" />
                  </div>
                </div>
              ))}
              {selectedDetails?.user && (
                <>
                  <RelatedRows title="Cards" rows={selectedDetails.userCards} />
                  <RelatedRows title="Deposits" rows={selectedDetails.userDeposits} />
                  <RelatedRows title="Wallet transactions" rows={selectedDetails.userTransactions} />
                  <RelatedRows title="Support tickets" rows={selectedDetails.userTickets} />
                  <RelatedRows title="Audit logs" rows={selectedDetails.userAudits} />
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
