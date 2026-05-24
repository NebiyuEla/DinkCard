import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Link } from 'react-router-dom';
import StatCard from '@/components/ui-custom/StatCard';
import { REFRESH } from '@/lib/realtime';
import { Users, ShieldCheck, DollarSign, CreditCard, HeadphonesIcon, WalletCards } from 'lucide-react';

function formatUsd(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function SAOverview() {
  const { data: users } = useQuery({ queryKey: ['sa-users'], queryFn: () => apiClient.entities.User.list('-created_date', 200), refetchInterval: REFRESH.admin });
  const { data: kycSubs } = useQuery({ queryKey: ['sa-kyc'], queryFn: () => apiClient.entities.KYCSubmission.list('-created_date', 200), refetchInterval: REFRESH.admin });
  const { data: deposits } = useQuery({ queryKey: ['sa-deposits'], queryFn: () => apiClient.entities.Deposit.list('-created_date', 200), refetchInterval: REFRESH.admin });
  const { data: cards } = useQuery({ queryKey: ['sa-cards'], queryFn: () => apiClient.entities.VirtualCard.list('-created_date', 200), refetchInterval: REFRESH.admin });
  const { data: tickets } = useQuery({ queryKey: ['sa-tickets'], queryFn: () => apiClient.entities.SupportTicket.list('-created_date', 200), refetchInterval: REFRESH.admin });
  const { data: companyBalances } = useQuery({ queryKey: ['bitnob-balances'], queryFn: apiClient.admin.balances, refetchInterval: REFRESH.fees, retry: false });

  const pendingKYC = kycSubs?.filter(k => k.status === 'pending')?.length || 0;
  const pendingDeposits = deposits?.filter(d => d.status === 'awaiting_review')?.length || 0;
  const openTickets = tickets?.filter(t => ['open', 'under_review'].includes(t.status))?.length || 0;
  const stableCompanyBalance = Number(companyBalances?.totalUsd || companyBalances?.stableUsd || 0);
  const netProfitEtb = (deposits || [])
    .filter((deposit) => deposit.status === 'approved')
    .reduce((sum, deposit) => sum + Math.max(0, Number(deposit.service_fee_etb || 0) - Number(deposit.gateway_fee_etb || 0)), 0);
  const approvedDepositCount = deposits?.filter((deposit) => deposit.status === 'approved')?.length || 0;
  const averageProfitEtb = approvedDepositCount ? netProfitEtb / approvedDepositCount : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">Platform-wide statistics</p>
      </div>

      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-500">
        All deposits, KYC reviews, card requests, refunds, and manual approvals must be reviewed according to provider rules, customer verification, transaction records, internal policy, and applicable compliance requirements.
      </div>

      <div className="grid auto-rows-fr grid-cols-2 items-stretch gap-3 md:grid-cols-3 xl:grid-cols-7">
        <StatCard title="Total Users" value={users?.length || 0} icon={Users} />
        <StatCard title="Pending KYC" value={pendingKYC} icon={ShieldCheck} accentClass={pendingKYC > 0 ? 'text-yellow-500' : 'text-primary'} />
        <StatCard title="Pending Deposits" value={pendingDeposits} icon={DollarSign} accentClass={pendingDeposits > 0 ? 'text-yellow-500' : 'text-primary'} />
        <StatCard title="Company Wallet" value={`$${stableCompanyBalance.toFixed(2)}`} subtitle={`${Number(companyBalances?.usdc || 0).toFixed(2)} USDC / ${Number(companyBalances?.usdt || 0).toFixed(4)} USDT`} icon={WalletCards} />
        <StatCard title="Net Profit" value={`${netProfitEtb.toLocaleString()} ETB`} subtitle={`Avg ${averageProfitEtb.toFixed(0)} ETB / approved deposit`} icon={DollarSign} />
        <StatCard title="Total Cards" value={cards?.length || 0} icon={CreditCard} />
        <StatCard title="Open Tickets" value={openTickets} icon={HeadphonesIcon} accentClass={openTickets > 0 ? 'text-accent' : 'text-primary'} />
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
    </div>
  );
}
