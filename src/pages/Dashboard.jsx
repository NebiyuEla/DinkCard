import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useCurrentUser, useWallet, useCards, useDeposits, useKYCStatus, useFeeSettings, useWalletTransactions } from '@/hooks/useAppData';
import StatCard from '@/components/ui-custom/StatCard';
import VirtualCardDisplay from '@/components/ui-custom/VirtualCardDisplay';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import EmptyState from '@/components/ui-custom/EmptyState';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Wallet, CreditCard, PlusCircle, ArrowDownUp, ShieldCheck,
  HeadphonesIcon, DollarSign, TrendingUp, AlertCircle, ArrowUpRight, Copy
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { invalidateOperationalData } from '@/lib/realtime';
import { toast } from 'sonner';

const quickActions = [
  { label: 'Add Money', path: '/add-money', icon: PlusCircle, color: 'text-primary' },
  { label: 'Request Card', path: '/cards/create', icon: CreditCard, color: 'text-accent' },
  { label: 'Fund Card', path: '/cards', icon: DollarSign, color: 'text-yellow-500', desktopOnly: true },
  { label: 'Transactions', path: '/transactions', icon: ArrowDownUp, color: 'text-muted-foreground', desktopOnly: true },
  { label: 'KYC', path: '/kyc', icon: ShieldCheck, color: 'text-primary' },
  { label: 'Support', path: '/support', icon: HeadphonesIcon, color: 'text-accent' },
];

export default function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [paymentBanner, setPaymentBanner] = useState(null);
  const [securityDialog, setSecurityDialog] = useState({ open: false, mode: 'enable' });
  const [securityPassword, setSecurityPassword] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [setupPayload, setSetupPayload] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [securityError, setSecurityError] = useState('');
  const { data: user } = useCurrentUser();
  const { data: wallet } = useWallet(user?.email);
  const { data: cards } = useCards(user?.email);
  const { data: deposits } = useDeposits(user?.email);
  const { data: kyc, isLoading: kycLoading } = useKYCStatus(user?.email);
  const { data: settings } = useFeeSettings();
  const { data: transactions } = useWalletTransactions(user?.email);

  const balance = wallet?.available_balance || 0;
  const etbEstimate = balance * (settings?.usd_to_etb_rate || 135);
  const activeCards = cards?.filter(c => c.status === 'active') || [];
  const frozenCards = cards?.filter(c => c.status === 'frozen') || [];
  const pendingDeposits = deposits?.filter(d => ['pending_payment', 'awaiting_review'].includes(d.status)) || [];
  const totalDeposited = deposits?.filter(d => d.status === 'approved').reduce((sum, d) => sum + (d.final_usd_credit || 0), 0) || 0;
  const totalCardDebits = transactions?.filter(t => ['card_creation', 'card_funding'].includes(t.type) && t.status === 'completed').reduce((sum, t) => sum + Math.abs(t.amount || 0), 0) || 0;
  const cardRefunds = transactions?.filter(t => t.type === 'refund' && t.status === 'completed' && String(t.description || '').toLowerCase().includes('card')).reduce((sum, t) => sum + Math.abs(t.amount || 0), 0) || 0;
  const totalSpent = Math.max(0, totalCardDebits - cardRefunds);
  const recentTx = (transactions || []).slice(0, 5);
  const mobileQuickActions = quickActions.filter((action) => !action.desktopOnly);
  const twoFactorEnabled = Boolean(user?.two_factor_enabled);

  const resetSecurityState = (nextMode = 'enable') => {
    setSecurityDialog({ open: false, mode: nextMode });
    setSecurityPassword('');
    setSecurityCode('');
    setSetupPayload(null);
    setRecoveryCodes([]);
    setSecurityError('');
  };

  const refreshUser = async () => {
    await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
  };

  const setupTwoFactor = useMutation({
    mutationFn: () => apiClient.auth.setupTwoFactor({ password: securityPassword }),
    onSuccess: (result) => {
      setSetupPayload(result);
      setSecurityError('');
      toast.success('Authenticator setup started.');
    },
    onError: (error) => {
      setSecurityError(error.message || 'Could not start 2FA setup.');
    }
  });

  const enableTwoFactor = useMutation({
    mutationFn: () => apiClient.auth.enableTwoFactor({ password: securityPassword, code: securityCode }),
    onSuccess: async (result) => {
      setRecoveryCodes(result.recoveryCodes || []);
      setSetupPayload(null);
      setSecurityCode('');
      setSecurityError('');
      await refreshUser();
      toast.success('Two-factor authentication enabled.');
    },
    onError: (error) => {
      setSecurityError(error.message || 'Could not enable 2FA.');
    }
  });

  const disableTwoFactor = useMutation({
    mutationFn: () => apiClient.auth.disableTwoFactor({ password: securityPassword, code: securityCode }),
    onSuccess: async () => {
      await refreshUser();
      resetSecurityState('enable');
      toast.success('Two-factor authentication disabled.');
    },
    onError: (error) => {
      setSecurityError(error.message || 'Could not disable 2FA.');
    }
  });

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
    <div className="space-y-6 pb-24 sm:space-y-8 lg:pb-0">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">
          Welcome back{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Here's your account overview</p>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(apiClient.payments.invoiceUrl(paymentBanner.txRef), '_blank')}
            >
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
        <div className="hidden gap-3 md:grid md:grid-cols-6">
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
                    <p className="text-sm font-medium capitalize">{(tx.type || '').replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">{tx.created_date ? format(new Date(tx.created_date), 'MMM d, h:mm a') : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-mono text-sm font-semibold ${tx.amount >= 0 ? 'text-primary' : 'text-foreground'}`}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount?.toFixed(2)} USD
                    </p>
                    <StatusBadge status={tx.status} className="text-[10px]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Account Security</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Protect sign-in with a real authenticator app code.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Status: <span className={twoFactorEnabled ? 'text-primary' : 'text-muted-foreground'}>{twoFactorEnabled ? '2FA enabled' : '2FA not enabled'}</span>
              {twoFactorEnabled && user?.remainingRecoveryCodes ? ` • ${user.remainingRecoveryCodes} recovery codes left` : ''}
            </p>
          </div>
          <Button
            type="button"
            variant={twoFactorEnabled ? 'outline' : 'default'}
            className={twoFactorEnabled ? '' : 'bg-primary text-primary-foreground'}
            onClick={() => {
              setSecurityDialog({ open: true, mode: twoFactorEnabled ? 'disable' : 'enable' });
              setSecurityError('');
              setSetupPayload(null);
              setRecoveryCodes([]);
              setSecurityCode('');
            }}
          >
            {twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
          </Button>
        </div>
      </div>

      <Dialog open={securityDialog.open} onOpenChange={(open) => {
        if (!open) resetSecurityState(twoFactorEnabled ? 'disable' : 'enable');
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{securityDialog.mode === 'disable' ? 'Disable two-factor authentication' : 'Enable two-factor authentication'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Password</Label>
              <Input type="password" value={securityPassword} onChange={(event) => setSecurityPassword(event.target.value)} className="mt-1.5" />
            </div>

            {securityDialog.mode === 'enable' && !setupPayload && (
              <div className="rounded-xl border border-border bg-secondary/30 p-3 text-sm text-muted-foreground">
                Confirm your password to generate your authenticator secret.
              </div>
            )}

            {securityDialog.mode === 'enable' && setupPayload && !recoveryCodes.length && (
              <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div>
                  <p className="text-sm font-semibold">Step 1: Add this account to your authenticator app</p>
                  <p className="mt-1 text-xs text-muted-foreground">Use Google Authenticator, Microsoft Authenticator, Authy, or another TOTP app.</p>
                </div>
                <div className="rounded-lg bg-background/90 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Setup key</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <code className="break-all text-sm font-semibold">{setupPayload.secret}</code>
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                      navigator.clipboard.writeText(setupPayload.secretRaw);
                      toast.success('Setup key copied.');
                    }}>
                      <Copy className="mr-2 h-4 w-4" />Copy
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Authenticator Code</Label>
                  <Input value={securityCode} onChange={(event) => setSecurityCode(event.target.value)} placeholder="123456" className="mt-1.5 tracking-[0.2em]" autoComplete="one-time-code" />
                </div>
              </div>
            )}

            {securityDialog.mode === 'disable' && (
              <div>
                <Label>Authenticator or recovery code</Label>
                <Input value={securityCode} onChange={(event) => setSecurityCode(event.target.value)} placeholder="123456 or ABCDE-12345" className="mt-1.5" autoComplete="one-time-code" />
              </div>
            )}

            {recoveryCodes.length > 0 && (
              <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div>
                  <p className="text-sm font-semibold">Recovery codes</p>
                  <p className="mt-1 text-xs text-muted-foreground">Store these in a safe place. Each code works once.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {recoveryCodes.map((code) => (
                    <div key={code} className="rounded-lg bg-background/90 px-3 py-2 text-center font-mono text-sm">{code}</div>
                  ))}
                </div>
              </div>
            )}

            {securityError && <p className="text-sm text-destructive">{securityError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => resetSecurityState(twoFactorEnabled ? 'disable' : 'enable')}>
              {recoveryCodes.length ? 'Close' : 'Cancel'}
            </Button>
            {!recoveryCodes.length && securityDialog.mode === 'enable' && !setupPayload && (
              <Button type="button" className="bg-primary text-primary-foreground" disabled={!securityPassword || setupTwoFactor.isPending} onClick={() => setupTwoFactor.mutate()}>
                {setupTwoFactor.isPending ? 'Preparing...' : 'Generate setup key'}
              </Button>
            )}
            {!recoveryCodes.length && securityDialog.mode === 'enable' && setupPayload && (
              <Button type="button" className="bg-primary text-primary-foreground" disabled={!securityPassword || !securityCode || enableTwoFactor.isPending} onClick={() => enableTwoFactor.mutate()}>
                {enableTwoFactor.isPending ? 'Enabling...' : 'Enable 2FA'}
              </Button>
            )}
            {securityDialog.mode === 'disable' && (
              <Button type="button" variant="destructive" disabled={!securityPassword || !securityCode || disableTwoFactor.isPending} onClick={() => disableTwoFactor.mutate()}>
                {disableTwoFactor.isPending ? 'Disabling...' : 'Disable 2FA'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
