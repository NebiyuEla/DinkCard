import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowDownUp, CheckCircle2, CreditCard, DollarSign, Eye, EyeOff, HeadphonesIcon, LockKeyhole, PlusCircle, QrCode, SendHorizontal, Settings2, ShieldCheck, TrendingUp, UserRound, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { useCards, useCurrentUser, useDeposits, useFeeSettings, useKYCStatus, useWallet, useWalletTransactions } from '@/hooks/useAppData';
import EmptyState from '@/components/ui-custom/EmptyState';
import StatCard from '@/components/ui-custom/StatCard';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import VirtualCardDisplay from '@/components/ui-custom/VirtualCardDisplay';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { invalidateOperationalData } from '@/lib/realtime';
import KycRequiredNotice from '@/components/KycRequiredNotice';

const QUICK_ACTION_STORAGE_KEY = 'dinkcard_quick_actions';
const DEFAULT_QUICK_ACTION_IDS = ['add-money', 'crypto-deposit', 'request-card', 'send-money', 'kyc', 'support'];
const quickActionCatalog = [
  { id: 'add-money', label: 'Add Money', path: '/add-money', icon: PlusCircle, color: 'text-primary', requiresKyc: true },
  { id: 'crypto-deposit', label: 'Crypto Deposit', path: '/wallet?openCrypto=1', icon: QrCode, color: 'text-primary', requiresKyc: true },
  { id: 'request-card', label: 'Request Card', path: '/cards/create', icon: CreditCard, color: 'text-accent', requiresKyc: true },
  { id: 'send-money', label: 'Send Money', path: '/wallet?openSend=1', icon: SendHorizontal, color: 'text-primary' },
  { id: 'fund-card', label: 'Fund Card', path: '/cards', icon: DollarSign, color: 'text-yellow-500' },
  { id: 'transactions', label: 'Transactions', path: '/transactions', icon: ArrowDownUp, color: 'text-muted-foreground' },
  { id: 'kyc', label: 'KYC', path: '/kyc', icon: ShieldCheck, color: 'text-primary' },
  { id: 'support', label: 'Support', path: '/support', icon: HeadphonesIcon, color: 'text-accent' },
  { id: 'account', label: 'Account', path: '/account', icon: UserRound, color: 'text-muted-foreground' }
];

const BALANCE_VISIBILITY_KEY = 'dinkcard_show_balances';

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['active', 'approved', 'ready', 'live'].includes(value)) return 'active';
  if (['frozen', 'freeze', 'locked', 'suspended'].includes(value)) return 'frozen';
  return value;
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [paymentBanner, setPaymentBanner] = useState(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [showBalances, setShowBalances] = useState(() => localStorage.getItem(BALANCE_VISIBILITY_KEY) !== '0');
  const [quickActionIds, setQuickActionIds] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(QUICK_ACTION_STORAGE_KEY) || 'null');
      if (Array.isArray(stored) && stored.length) return stored;
    } catch {}
    return DEFAULT_QUICK_ACTION_IDS;
  });
  const { data: user } = useCurrentUser();
  const { data: wallet, isLoading: walletLoading } = useWallet(user?.email);
  const { data: cards, isLoading: cardsLoading } = useCards(user?.email);
  const { data: deposits } = useDeposits(user?.email);
  const { data: kyc, isLoading: kycLoading } = useKYCStatus(user?.email);
  const { data: settings } = useFeeSettings();
  const { data: transactions, isLoading: transactionsLoading } = useWalletTransactions(user?.email);

  const balance = Number(wallet?.available_balance || 0);
  const etbEstimate = balance * (settings?.usd_to_etb_rate || 135);
  const activeCards = cards?.filter((card) => normalizeStatus(card.status) === 'active') || [];
  const frozenCards = cards?.filter((card) => normalizeStatus(card.status) === 'frozen') || [];
  const pendingDeposits = deposits?.filter((deposit) => ['pending_payment', 'pending_transfer', 'awaiting_review'].includes(deposit.status)) || [];
  const totalDeposited = deposits?.filter((deposit) => deposit.status === 'approved').reduce((sum, deposit) => sum + Number(deposit.final_usd_credit || 0), 0) || 0;
  const totalCardDebits = transactions?.filter((tx) => ['card_creation', 'card_funding'].includes(tx.type) && tx.status === 'completed').reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0) || 0;
  const cardRefunds = transactions?.filter((tx) => tx.type === 'refund' && tx.status === 'completed' && String(tx.description || '').toLowerCase().includes('card')).reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0) || 0;
  const totalSpent = Math.max(0, totalCardDebits - cardRefunds);
  const recentTx = (transactions || []).slice(0, 5);
  const kycApproved = kyc?.status === 'approved';
  const hasUsableFunds = balance >= Math.max(3, Number(settings?.min_card_creation_usd || 3));
  const hasFundingHistory = totalDeposited > 0 || (transactions || []).some((tx) => {
    const type = String(tx.type || '').toLowerCase();
    return Number(tx.amount || 0) > 0 && [
      'deposit',
      'manual_credit',
      'admin_credit',
      'balance_set',
      'balance_adjustment',
      'balance_share_received'
    ].includes(type);
  });
  const hasFundStep = hasUsableFunds || hasFundingHistory;
  const hasAnyCard = (cards || []).some((card) => !['terminated', 'deleted', 'closed', 'cancelled', 'canceled'].includes(String(card.status || '').toLowerCase()));
  const twoFactorEnabled = Boolean(user?.two_factor_enabled);
  const currentStepIndex = [true, kycApproved, hasFundStep, hasAnyCard, twoFactorEnabled].filter(Boolean).length;
  const onboardingProgress = Math.round((currentStepIndex / 5) * 100);
  const nextStepPath = !kycApproved ? '/kyc' : !hasFundStep ? '/add-money' : !hasAnyCard ? (hasUsableFunds ? '/cards/create' : '/add-money') : !twoFactorEnabled ? '/account' : '/cards';
  const nextStepLabel = !kycApproved ? 'Complete KYC' : !hasFundStep ? 'Add Funds' : !hasAnyCard ? (hasUsableFunds ? 'Request Card' : 'Add Funds') : !twoFactorEnabled ? 'Enable 2FA' : 'Manage Cards';
  const moneyText = (value) => showBalances ? `$${Number(value || 0).toFixed(2)}` : '$••••';
  const etbText = showBalances ? `~ ${etbEstimate.toLocaleString()} ETB` : 'Hidden';
  const quickActions = quickActionIds
    .map((id) => quickActionCatalog.find((action) => action.id === id))
    .filter(Boolean);

  const actionPath = (action) => {
    if (action.requiresKyc && !kycApproved) return '/kyc';
    if (action.id === 'request-card' && !hasUsableFunds) return '/add-money';
    return action.path;
  };

  const requestCardPath = !kycApproved ? '/kyc' : !hasUsableFunds ? '/add-money' : '/cards/create';
  const requestCardLabel = !kycApproved ? 'Complete KYC' : !hasUsableFunds ? 'Add Funds' : 'Request Card';

  const toggleQuickAction = (id) => {
    setQuickActionIds((current) => {
      const selected = new Set(current);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return quickActionCatalog.filter((action) => selected.has(action.id)).map((action) => action.id);
    });
  };

  useEffect(() => {
    localStorage.setItem(QUICK_ACTION_STORAGE_KEY, JSON.stringify(quickActionIds));
  }, [quickActionIds]);

  useEffect(() => {
    localStorage.setItem(BALANCE_VISIBILITY_KEY, showBalances ? '1' : '0');
  }, [showBalances]);

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
    <div className="space-y-4 pb-4 sm:space-y-6 lg:pb-0">
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
              Download Chapa receipt
            </Button>
          </div>
        </div>
      )}

      {!kycLoading && !kycApproved && <KycRequiredNotice status={kyc?.status} />}

      {currentStepIndex < 5 && (
      <div className="overflow-hidden rounded-3xl border border-primary/15 bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div
              className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full"
              style={{ background: `conic-gradient(hsl(var(--primary)) ${onboardingProgress * 3.6}deg, hsl(var(--secondary)) 0deg)` }}
            >
              <div className="grid h-16 w-16 place-items-center rounded-full bg-background text-center">
                <span className="font-mono text-lg font-bold text-primary">{onboardingProgress}%</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Your Dink Card setup</p>
              <p className="mt-1 text-sm text-muted-foreground">{currentStepIndex === 5 ? 'Everything is ready. Keep your account secure and funded.' : `Next step: ${nextStepLabel}`}</p>
              <Link to={nextStepPath}>
                <Button size="sm" className="mt-3 bg-primary text-primary-foreground">{nextStepLabel}</Button>
              </Link>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-5 lg:min-w-[560px]">
            {[
              { label: 'Account', done: true },
              { label: 'KYC', done: kycApproved },
              { label: 'Add fund', done: hasFundStep },
              { label: 'Card', done: hasAnyCard },
              { label: '2FA', done: twoFactorEnabled }
            ].map((step, index) => (
              <div key={step.label} className={`rounded-2xl border px-3 py-2 transition-all ${step.done ? 'border-primary/25 bg-primary/10 text-primary' : 'border-border bg-secondary/20 text-muted-foreground'}`}>
                <div className="flex items-center gap-2">
                  {step.done ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <LockKeyhole className="h-4 w-4 shrink-0" />}
                  <span className="truncate text-xs font-semibold">{index + 1}. {step.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 md:hidden">
        <div className="col-span-2 rounded-2xl border border-border bg-card p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Balance</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="min-w-0 truncate font-mono text-[clamp(1.35rem,7vw,1.8rem)] font-bold text-primary">{walletLoading ? '...' : moneyText(balance)}</p>
            <div className="flex shrink-0 items-center gap-2">
              <p className="text-right text-[11px] text-muted-foreground">{walletLoading ? 'Loading' : etbText}</p>
              <button type="button" className="rounded-lg border border-border p-1.5 text-muted-foreground" onClick={() => setShowBalances((current) => !current)} aria-label={showBalances ? 'Hide balance' : 'Show balance'}>
                {showBalances ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Cards</p>
          <p className="mt-2 font-mono text-xl font-bold text-primary">{cardsLoading ? '...' : activeCards.length}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{frozenCards.length ? `${frozenCards.length} frozen` : 'active'}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">KYC</p>
          <p className="mt-2 text-xl font-bold text-primary">{kyc?.status === 'approved' ? `L${kyc.level || 1}` : 'L0'}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{kyc?.status === 'approved' ? 'verified' : 'pending'}</p>
        </div>
      </div>

      <div className="hidden auto-rows-fr grid-cols-2 items-stretch gap-4 md:grid md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Available Service Balance" value={walletLoading ? '...' : moneyText(balance)} subtitle={walletLoading ? 'Loading' : etbText} icon={Wallet} />
        <div className="hidden h-full md:block"><StatCard title="Total Deposited" value={moneyText(totalDeposited)} icon={TrendingUp} /></div>
        <div className="hidden h-full md:block"><StatCard title="Card Service Spend" value={moneyText(totalSpent)} icon={DollarSign} /></div>
        <StatCard title="Active Cards" value={activeCards.length} subtitle={frozenCards.length ? `${frozenCards.length} frozen` : undefined} icon={CreditCard} />
        <div className="hidden h-full md:block"><StatCard title="Pending" value={pendingDeposits.length} subtitle="deposits" icon={PlusCircle} /></div>
        <StatCard title="KYC Level" value={kyc?.status === 'approved' ? `Level ${kyc.level || 1}` : 'Level 0'} icon={ShieldCheck} />
      </div>
      <div className="hidden justify-end md:flex">
        <Button type="button" variant="outline" size="sm" onClick={() => setShowBalances((current) => !current)}>
          {showBalances ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
          {showBalances ? 'Hide balance' : 'Show balance'}
        </Button>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</h2>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setCustomizeOpen((current) => !current)}>
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />Customize
          </Button>
        </div>
        {customizeOpen && (
          <div className="mb-3 rounded-2xl border border-border bg-card p-3">
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {quickActionCatalog.map((action) => (
                <label key={action.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-secondary/20 px-3 py-2 text-sm">
                  <Checkbox checked={quickActionIds.includes(action.id)} onCheckedChange={() => toggleQuickAction(action.id)} />
                  <span>{action.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5 md:hidden">
          {quickActions.map((action) => (
            <Link key={action.id} to={actionPath(action)}>
              <div className="flex min-h-[64px] items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5 transition-all hover:border-primary/30">
                <div className="rounded-xl bg-secondary/40 p-2">
                  <action.icon className={`h-5 w-5 ${action.color}`} />
                </div>
                <p className="text-sm font-semibold leading-tight">{action.label}</p>
              </div>
            </Link>
          ))}
        </div>
        <div className="hidden gap-3 md:grid md:grid-cols-7">
          {quickActions.map((action) => (
            <Link key={action.id} to={actionPath(action)}>
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
              actionLabel={requestCardLabel}
              onAction={() => navigate(requestCardPath)}
              className="rounded-xl border border-border bg-card py-10"
            />
          ) : (
            <div className="flex flex-col gap-4 sm:gap-5">
              {[...activeCards, ...frozenCards].slice(0, 3).map((card) => (
                <Link key={card.id} to={`/cards?id=${card.id}`} className="block">
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
          {transactionsLoading ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Loading history...</div>
          ) : recentTx.length === 0 ? (
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
                      {showBalances ? `${Number(tx.amount || 0) >= 0 ? '+' : ''}${Number(tx.amount || 0).toFixed(2)} USD` : '•••• USD'}
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
