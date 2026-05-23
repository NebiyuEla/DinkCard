import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { REFRESH } from '@/lib/realtime';
import { useCurrentUser } from '@/hooks/useAppData';
import StatCard from '@/components/ui-custom/StatCard';
import { 
  LayoutDashboard, Users, ShieldCheck, DollarSign, CreditCard, 
  HeadphonesIcon, Settings, ArrowLeft, FileText, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

const adminNav = [
  { label: 'Overview', path: '/admin', icon: LayoutDashboard },
  { label: 'Users', path: '/admin/users', icon: Users, ownerOnly: true },
  { label: 'KYC', path: '/admin/kyc', icon: ShieldCheck },
  { label: 'Deposits', path: '/admin/deposits', icon: DollarSign },
  { label: 'Cards', path: '/admin/cards', icon: CreditCard },
  { label: 'Tickets', path: '/admin/tickets', icon: HeadphonesIcon },
  { label: 'Fees & Rates', path: '/admin/fees', icon: Settings, ownerOnly: true },
  { label: 'Audit Logs', path: '/admin/audit', icon: FileText, ownerOnly: true },
];

export default function AdminDashboard() {
  const location = useLocation();
  const { data: currentUser } = useCurrentUser();
  const visibleNav = adminNav.filter((item) => !item.ownerOnly || currentUser?.role === 'superadmin');

  const { data: users } = useQuery({ queryKey: ['admin-users'], queryFn: () => apiClient.entities.User.list('-created_date', 100), refetchInterval: REFRESH.admin });
  const { data: kycSubs } = useQuery({ queryKey: ['admin-kyc'], queryFn: () => apiClient.entities.KYCSubmission.list('-created_date', 100), refetchInterval: REFRESH.admin });
  const { data: deposits } = useQuery({ queryKey: ['admin-deposits'], queryFn: () => apiClient.entities.Deposit.list('-created_date', 100), refetchInterval: REFRESH.admin });
  const { data: cards } = useQuery({ queryKey: ['admin-cards'], queryFn: () => apiClient.entities.VirtualCard.list('-created_date', 100), refetchInterval: REFRESH.admin });
  const { data: tickets } = useQuery({ queryKey: ['admin-tickets'], queryFn: () => apiClient.entities.SupportTicket.list('-created_date', 100), refetchInterval: REFRESH.admin });
  const { data: walletSummary } = useQuery({ queryKey: ['admin-wallet-summary'], queryFn: apiClient.admin.walletSummary, refetchInterval: REFRESH.admin });

  const pendingKYC = kycSubs?.filter(k => k.status === 'pending')?.length || 0;
  const pendingDeposits = deposits?.filter(d => d.status === 'awaiting_review')?.length || 0;
  const openTickets = tickets?.filter(t => ['open', 'under_review'].includes(t.status))?.length || 0;
  const totalUsableBalance = Number(walletSummary?.totalUsableBalance || 0);

  const isOverview = location.pathname === '/admin';

  return (
    <div className="space-y-6">
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

      {/* Admin nav tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2">
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

      {isOverview ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-500">
            All deposits, KYC reviews, card requests, refunds, and manual approvals must be reviewed according to provider rules, customer verification, transaction records, internal policy, and applicable compliance requirements.
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard title="Total Users" value={users?.length || 0} icon={Users} />
            <StatCard title="Pending KYC" value={pendingKYC} icon={ShieldCheck} accentClass={pendingKYC > 0 ? 'text-yellow-500' : 'text-primary'} />
            <StatCard title="Pending Deposits" value={pendingDeposits} icon={DollarSign} accentClass={pendingDeposits > 0 ? 'text-yellow-500' : 'text-primary'} />
            <StatCard title="Usable Balance" value={`$${totalUsableBalance.toFixed(0)}`} icon={Activity} />
            <StatCard title="Total Cards" value={cards?.length || 0} icon={CreditCard} />
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
                        <p className="text-sm font-mono font-semibold">${d.requested_usd_amount?.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{d.total_payable_etb?.toLocaleString()} ETB</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
