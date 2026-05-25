import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowDownUp, ArrowUpRight, CreditCard, DollarSign, HeadphonesIcon, PlusCircle, ShieldCheck, TrendingUp, UserRound, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { useCards, useCurrentUser, useDeposits, useFeeSettings, useKYCStatus, useWallet, useWalletTransactions } from '@/hooks/useAppData';
import EmptyState from '@/components/ui-custom/EmptyState';
import StatCard from '@/components/ui-custom/StatCard';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import VirtualCardDisplay from '@/components/ui-custom/VirtualCardDisplay';
import { Button } from '@/components/ui/button';
import { invalidateOperationalData } from '@/lib/realtime';

const quickActions = [
  { label: 'Add Money', path: '/add-money', icon: PlusCircle, color: 'text-primary' },
  { label: 'Request Card', path: '/cards/create', icon: CreditCard, color: 'text-accent' },
  { label: 'Fund Card', path: '/cards', icon: DollarSign, color: 'text-yellow-500', desktopOnly: true },
  { label: 'Transactions', path: '/transactions', icon: ArrowDownUp, color: 'text-muted-foreground', desktopOnly: true },
  { label: 'KYC', path: '/kyc', icon: ShieldCheck, color: 'text-primary' },
  { label: 'Support', path: '/support', icon: HeadphonesIcon, color: 'text-accent' },
  { label: 'Account', path: '/account', icon: UserRound, color: 'text-muted-foreground' }
];

export default function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [paymentBanner, setPaymentBanner] = useState(null);
  const { data: user } = useCurrentUser();
  const { data: wallet } = useWallet(user?.email);
  const { data: cards } = useCards(user?.email);
  const { data: deposits } = useDeposits(user?.email);
  const { data: kyc, isLoading: kycLoading } = useKYCStatus(user?.email);
  const { data: settings } = useFeeSettings();
  const { data: transactions } = useWalletTransactions(user?.email);

  const balance = Number(wallet?.available_balance || 0);
  const etbEstimate = balance * (settings?.usd_to_etb_rate || 135);
  const activeCards = cards?.filter((card) => card.status === 'active') || [];
  const frozenCards = cards?.filter((card) => card.status === 'frozen') || [];
  const pendingDeposits = deposits?.filter((deposit) => ['pending_payment', 'pending_transfer', 'awaiting_review'].includes(deposit.status)) || [];
  const totalDeposited = deposits?.filter((deposit) => deposit.status === 'approved').reduce((sum, deposit) => sum + Number(deposit.final_usd_credit || 0), 0) || 0;
  const totalCardDebits = transactions?.filter((tx) => ['card_creation', 'card_funding'].includes(tx.type) && tx.status === 'completed').reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0) || 0;
  const cardRefunds = transactions?.filter((tx) => tx.type === 'refund' && tx.status === 'completed' && String(tx.description || '').toLowerCase().includes('card')).reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0) || 0;
  const totalSpent = Math.max(0, totalCardDebits - cardRefunds);
  const recentTx = (transactions || []).slice(0, 5);
  const mobileQuickActions = quickActions.filter((action) => !action.desktopOnly);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const txRef = params.get('tx_ref');
    if (!txRef || params.get('payment') !== 'chapa') return;

    apiClient.payments.getChapaStatus(txRef)
      .then((deposit) => {
        invalidateOperationalData(queryClient);
        if (deposit.status === 'approved') {
          setPaymentBanner({ tone: 'success', message: 'Payment successful. Your available service balance has been credited.', txRef });
          toast.success('Payment successful');
        } else if (['cancelled', 'canceled', 'failed'].includes(deposit.status)) {
          setPaymentBanner({ tone: 'muted', message: 'Payment was cancelled. No balance was added.', txRef });
          toast.info('Payment cancelled');
        } else {
          setPaymentBanner({ tone: 'pending', message: 'Payment is still pending. It will cancel automatically after 5 minutes if not completed.', txRef });
        }
      })
      .catch((error) => {
        setPaymentBanner({ tone: 'error', message: error.message || 'Payment could not be verified yet.', txRef });
      })
      .finally(() => {
        window.history.replaceState({}, '', '/dashboard');
      });
  }, [queryClient]);

  return (
    <div className="space-y-5 pb-20 sm:space-y-6 lg:pb-0">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Welcome back{user?.first_name || user?.full_name ? `, ${user?.first_name || user.full_name.split(' ')[0]}` : ''}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s your account overview</p>
      </div>

      {paymentBanner && (
        <div className={`rounded-xl border p-4 text-sm ${
          paymentBanner.tone === 'success'
            ? 'border-primary/20 bg-primary/10 text-primary'
            : paymentBanner.tone === 'error'
              ? 'border-destructive/20 bg-destructive/10 text-destructive'
              : 'border-border bg-card text-muted-foreground'
        }`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{paymentBanner.message}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => window.open(apiClient.payments.invoiceUrl(paymentBanner.txRef), '_blank')}>
              Download invoice
            </Button>
          </div>
        </div>
      )}

      {!kycLoading && (!kyc || kyc.status !== 'approved') && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
          <div>
            <p className="text-sm font-medium text-yellow-500">Complete your KYC verification</p>
            <p className="mt-0.5 text-xs text-muted-foreground">You need to verify your identity before creating cards or making deposits.</p>
            <Link to="/kyc">
              <Button size="sm" variant="outline" className="mt-2 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10">
                Complete KYC <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-3 gap-3 md:hidden">
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Balance</p>
          <p className="mt-2 font-mono text-xl font-bold text-primary">${balance.toFixed(2)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">~ {etbEstimate.toLocaleString()} ETB</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Cards</p>
          <p className="mt-2 font-mono text-xl font-bold text-primary">{activeCards.length}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{frozenCards.length ? `${frozenCards.length} frozen` : 'active'}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">KYC</p>
          <p className="mt-2 text-xl font-bold text-primary">{kyc?.status === 'approved' ? `L${kyc.level || 1}` : 'L0'}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{kyc?.status === 'approved' ? 'verified' : 'pending'}</p>
        </div>
      </div>

      <div className="hidden auto-rows-fr grid-cols-2 items-stretch gap-4 md:grid md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Available Service Balance" value={`$${balance.toFixed(2)}`} subtitle={`~ ${etbEstimate.toLocaleString()} ETB`} icon={Wallet} />
        <div className="hidden h-full md:block"><StatCard title="Total Deposited" value={`$${totalDeposited.toFixed(2)}`} icon={TrendingUp} /></div>
        <div className="hidden h-full md:block"><StatCard title="Card Service Spend" value={`$${totalSpent.toFixed(2)}`} icon={DollarSign} /></div>
        <StatCard title="Active Cards" value={activeCards.length} subtitle={frozenCards.length ? `${frozenCards.length} frozen` : undefined} icon={CreditCard} />
        <div className="hidden h-full md:block"><StatCard title="Pending" value={pendingDeposits.length} subtitle="deposits" icon={PlusCircle} /></div>
        <StatCard title="KYC Level" value={kyc?.status === 'approved' ? `Level ${kyc.level || 1}` : 'Level 0'} icon={ShieldCheck} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 md:hidden">
          {mobileQuickActions.map((action) => (
            <Link key={action.path} to={action.path}>
              <div className="flex min-h-[84px] items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/30">
                <div className="rounded-xl bg-secondary/40 p-2.5">
                  <action.icon className={`h-5 w-5 ${action.color}`} />
                </div>
                <p className="text-sm font-semibold">{action.label}</p>
              </div>
            </Link>
          ))}
        </div>
        <div className="hidden gap-3 md:grid md:grid-cols-7">
          {quickActions.map((action) => (
            <Link key={action.path} to={action.path} className={action.desktopOnly ? 'hidden md:block' : ''}>
              <div className="group flex h-full min-h-[96px] flex-col items-center justify-center rounded-xl border border-border bg-card p-4 text-center transition-all hover:border-primary/30">
                <action.icon className={`mx-auto mb-2 h-6 w-6 ${action.color} transition-transform group-hover:scale-110`} />
                <p className="text-xs font-medium">{action.label}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">My Cards</h2>
            <Link to="/cards" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {activeCards.length === 0 && frozenCards.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No cards yet"
              description="Request your first virtual card for supported online payments."
              actionLabel="Request Card"
              onAction={() => navigate('/cards/create')}
              className="rounded-xl border border-border bg-card py-10"
            />
          ) : (
            <div className="space-y-3">
              {[...activeCards, ...frozenCards].slice(0, 3).map((card) => (
                <Link key={card.id} to={`/cards?id=${card.id}`}>
                  <VirtualCardDisplay card={card} compact />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Transactions</h2>
            <Link to="/transactions" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {recentTx.length === 0 ? (
            <EmptyState
              icon={ArrowDownUp}
              title="No transactions yet"
              description="Your recent service balance activity will appear here."
              className="rounded-xl border border-border bg-card py-10"
            />
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {recentTx.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">{String(tx.type || '').replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">{tx.created_date ? format(new Date(tx.created_date), 'MMM d, h:mm a') : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-mono text-sm font-semibold ${tx.amount >= 0 ? 'text-primary' : 'text-foreground'}`}>
                      {Number(tx.amount || 0) >= 0 ? '+' : ''}{Number(tx.amount || 0).toFixed(2)} USD
                    </p>
                    <StatusBadge status={tx.status} className="text-[10px]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hidden rounded-2xl border border-border bg-card p-4 sm:p-5 md:block">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Account & Security</p>
            <p className="mt-1 text-sm text-muted-foreground">Manage profile, two-factor authentication, sign out, and account deletion in one place.</p>
          </div>
          <Link to="/account">
            <Button type="button" className="bg-primary text-primary-foreground">Open account</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
