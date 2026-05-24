import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useCurrentUser } from '@/hooks/useAppData';
import { REFRESH } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, ShieldCheck, DollarSign, CreditCard,
  HeadphonesIcon, Settings, FileText, LogOut, ShieldAlert
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import TermsModal from '@/components/TermsModal';

const nav = [
  { label: 'Overview', path: '/superadmin/dashboard', icon: LayoutDashboard },
  { label: 'Users', path: '/superadmin/users', icon: Users },
  { label: 'KYC', path: '/superadmin/kyc', icon: ShieldCheck },
  { label: 'Deposits', path: '/superadmin/deposits', icon: DollarSign },
  { label: 'Cards', path: '/superadmin/cards', icon: CreditCard },
  { label: 'Tickets', path: '/superadmin/tickets', icon: HeadphonesIcon },
  { label: 'Pricing Settings', path: '/superadmin/fees', icon: Settings },
  { label: 'Audit Logs', path: '/superadmin/audit', icon: FileText },
];

export default function SuperAdminLayout() {
  const location = useLocation();
  const { data: user } = useCurrentUser();

  const { data: kycSubs } = useQuery({ queryKey: ['sa-kyc'], queryFn: () => apiClient.entities.KYCSubmission.list('-created_date', 100), refetchInterval: REFRESH.admin });
  const { data: deposits } = useQuery({ queryKey: ['sa-deposits'], queryFn: () => apiClient.entities.Deposit.list('-created_date', 100), refetchInterval: REFRESH.admin });
  const { data: tickets } = useQuery({ queryKey: ['sa-tickets'], queryFn: () => apiClient.entities.SupportTicket.list('-created_date', 100), refetchInterval: REFRESH.admin });

  const pendingKYC = kycSubs?.filter(k => k.status === 'pending')?.length || 0;
  const pendingDeposits = deposits?.filter(d => d.status === 'awaiting_review')?.length || 0;
  const openTickets = tickets?.filter(t => ['open', 'under_review'].includes(t.status))?.length || 0;

  const badges = {
    '/superadmin/kyc': pendingKYC,
    '/superadmin/deposits': pendingDeposits,
    '/superadmin/tickets': openTickets,
  };

  const handleLogout = () => {
    apiClient.auth.logout('/superadmin');
  };

  return (
    <div className="min-h-screen bg-background md:flex">
      <header className="md:hidden sticky top-0 z-30 border-b border-border bg-card">
        <div className="h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">Dink Card Admin</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>Sign Out</Button>
        </div>
        <nav className="grid grid-cols-3 gap-2 px-3 pb-3">
          {nav.map(item => {
            const badge = badges[item.path] || 0;
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className="min-w-0">
                <div className={cn(
                  'flex min-h-[44px] items-center gap-2 rounded-xl px-2.5 py-2 text-[11px] font-medium transition-all',
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}>
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label.replace('Pricing Settings', 'Pricing').replace('Audit Logs', 'Audit')}</span>
                  {badge > 0 && <span className="rounded-full bg-yellow-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>}
                </div>
              </Link>
            );
          })}
        </nav>
      </header>
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-border bg-card flex-col">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldAlert className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">Dink Card</p>
            <p className="text-[10px] text-muted-foreground">Super Admin</p>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {nav.map(item => {
            const badge = badges[item.path] || 0;
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}>
                <div className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}>
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="w-5 h-5 rounded-full bg-yellow-500 text-[10px] font-bold text-white flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-destructive" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl p-4 md:p-6">
          <Outlet />
        </div>
      </main>
      <TermsModal user={user} />
    </div>
  );
}

