import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useCurrentUser, useWallet, useWalletTransactions, useFeeSettings, useKYCStatus } from '@/hooks/useAppData';
import StatCard from '@/components/ui-custom/StatCard';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import EmptyState from '@/components/ui-custom/EmptyState';
import { Button } from '@/components/ui/button';
import { Wallet, PlusCircle, ArrowDownUp, DollarSign, Lock, Clock, Copy, QrCode, ReceiptText, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/api/client';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import KycRequiredNotice from '@/components/KycRequiredNotice';

function WalletSkeleton() {
  return (
    <div className="space-y-4 pb-4 lg:pb-0">
      <div className="space-y-3 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:space-y-0">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Skeleton className="h-10 w-full sm:w-32" />
          <Skeleton className="h-10 w-full sm:w-28" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-4">
        <Skeleton className="col-span-2 h-24 rounded-xl md:col-span-1" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export default function WalletPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: user } = useCurrentUser();
  const walletQuery = useWallet(user?.email);
  const transactionsQuery = useWalletTransactions(user?.email);
  const { data: settings } = useFeeSettings();
  const kycQuery = useKYCStatus(user?.email);
  const { data: wallet, isLoading: walletLoading } = walletQuery;
  const { data: transactions, isLoading: transactionsLoading } = transactionsQuery;
  const { data: kyc, isLoading: kycLoading } = kycQuery;
  const [cryptoOpen, setCryptoOpen] = useState(false);
  const [cryptoCurrency, setCryptoCurrency] = useState('USDC');
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [cryptoNetwork, setCryptoNetwork] = useState('');
  const [cryptoQr, setCryptoQr] = useState('');

  const balance = Number(wallet?.available_balance || 0);
  const locked = Number(wallet?.locked_balance || 0);
  const rate = settings?.usd_to_etb_rate || 135;
  const kycApproved = kyc?.status === 'approved';

  const typeIcons = {
    deposit: <PlusCircle className="w-4 h-4 text-primary" />,
    card_creation: <DollarSign className="w-4 h-4 text-accent" />,
    card_funding: <DollarSign className="w-4 h-4 text-yellow-500" />,
    refund: <ArrowDownUp className="w-4 h-4 text-accent" />,
    fee: <Lock className="w-4 h-4 text-muted-foreground" />,
    adjustment: <Clock className="w-4 h-4 text-muted-foreground" />,
    card_withdrawal: <ArrowDownUp className="w-4 h-4 text-primary" />,
    referral_reward: <DollarSign className="w-4 h-4 text-primary" />,
    balance_share_sent: <ArrowDownUp className="w-4 h-4 text-accent" />,
    balance_share_received: <ArrowDownUp className="w-4 h-4 text-primary" />,
    crypto_deposit: <QrCode className="w-4 h-4 text-primary" />
  };

  const typeLabels = {
    balance_share_sent: 'Legacy transfer',
    balance_share_received: 'Legacy transfer',
    crypto_deposit: 'Crypto deposit'
  };

  const cryptoNetworksQuery = useQuery({
    queryKey: ['crypto-networks', cryptoCurrency],
    queryFn: () => apiClient.payments.getCryptoNetworks(cryptoCurrency),
    enabled: cryptoOpen && kycApproved
  });

  const { data: deposits } = useQuery({
    queryKey: ['deposits', user?.email, 'wallet-view'],
    queryFn: () => apiClient.entities.Deposit.filter({ user_id: user?.email }, '-created_date'),
    enabled: !!user?.email,
    refetchInterval: REFRESH.notifications
  });

  const currentCryptoDeposit = deposits?.find((deposit) => ['usdc', 'crypto'].includes(deposit.payment_method) && ['pending_transfer', 'awaiting_review'].includes(deposit.status)) || null;
  const cryptoNetworks = cryptoNetworksQuery.data?.networks || [];

  useEffect(() => {
    if (searchParams.get('openCrypto') === '1') {
      setCryptoOpen(true);
      setSearchParams({}, { replace: true });
    } else if (searchParams.get('openSend') === '1') {
      toast.info('Dink Card service credit is not transferable between users.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (cryptoNetworks.length) {
      setCryptoNetwork((current) => cryptoNetworks.some((network) => network.value === current) ? current : cryptoNetworks[0].value);
    }
  }, [cryptoNetworks]);

  useEffect(() => {
    let ignore = false;
    const address = String(currentCryptoDeposit?.payment_address || '').trim();
    if (!address) {
      setCryptoQr('');
      return undefined;
    }
    QRCode.toDataURL(address, { margin: 1, width: 180 }).then((value) => {
      if (!ignore) setCryptoQr(value);
    }).catch(() => {
      if (!ignore) setCryptoQr('');
    });
    return () => { ignore = true; };
  }, [currentCryptoDeposit?.payment_address]);

  const createCryptoAddress = useMutation({
    mutationFn: () => apiClient.payments.createCryptoAddress({ amountUsd: Number(cryptoAmount), network: cryptoNetwork, currency: cryptoCurrency }),
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      toast.success(`${cryptoCurrency} address ready`);
    },
    onError: (error) => toast.error(error.message || 'Could not generate address')
  });

  const cancelCryptoDeposit = useMutation({
    mutationFn: (depositId) => apiClient.payments.cancelCryptoDeposit(depositId),
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      setCryptoQr('');
      toast.success('Crypto deposit cancelled');
    },
    onError: (error) => toast.error(error.message || 'Could not cancel this deposit')
  });

  const depositReceiptUrl = (tx) => {
    if (tx.source_type === 'crypto_deposit_request') return apiClient.payments.invoiceUrl(tx.reference);
    if (tx.type !== 'deposit') return null;
    const ref = String(tx.reference || '');
    if (ref.startsWith('DEP-')) return apiClient.payments.invoiceUrl(ref.slice(4));
    return apiClient.payments.invoiceUrl(ref);
  };

  const cryptoDepositHistory = (deposits || [])
    .filter((deposit) => ['crypto', 'usdc'].includes(String(deposit.payment_method || '').toLowerCase()))
    .map((deposit) => {
      const status = String(deposit.status || 'pending_transfer').toLowerCase();
      return {
        id: `crypto-${deposit.id}`,
        source_type: 'crypto_deposit_request',
        type: 'crypto_deposit',
        amount: Number(deposit.final_usd_credit || deposit.payment_amount || deposit.requested_usd_amount || 0),
        status,
        reference: deposit.transaction_reference,
        description: `${deposit.payment_currency || 'Crypto'} deposit${deposit.payment_network ? ` on ${deposit.payment_network}` : ''}`,
        created_at: deposit.created_at || deposit.created_date,
        created_date: deposit.created_date || deposit.created_at,
        balance_after: null
      };
    });

  const displayHistory = [...(transactions || []), ...cryptoDepositHistory].sort((left, right) => {
    const leftDate = new Date(left.created_at || left.created_date || 0).getTime();
    const rightDate = new Date(right.created_at || right.created_date || 0).getTime();
    return rightDate - leftDate;
  });

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value || ''));
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  const walletInitialLoading = walletLoading || transactionsLoading || kycLoading;
  const walletLoadError = [walletQuery, transactionsQuery, kycQuery].some((query) => query.isError && !query.data);

  if (walletInitialLoading) return <WalletSkeleton />;
  if (walletLoadError) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm">
        <p className="font-semibold">Could not load balance data.</p>
        <p className="mt-1 text-muted-foreground">Your previous data was not changed. Retry when the connection is stable.</p>
        <Button type="button" className="mt-4 bg-primary text-primary-foreground" onClick={() => invalidateOperationalData(queryClient)}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4 lg:pb-0">
      <div className="space-y-3 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Service Balance</h1>
          <p className="text-sm text-muted-foreground">Your available platform balance and history</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button variant="outline" className="h-10 justify-center px-2 text-xs sm:px-4 sm:text-sm" onClick={() => kycApproved ? setCryptoOpen(true) : toast.info('Complete your KYC verification before making deposits.')}>
            <QrCode className="mr-1.5 h-4 w-4 sm:mr-2" /> <span className="sm:hidden">Deposit</span><span className="hidden sm:inline">Crypto Deposit</span>
          </Button>
          <Link to="/add-money">
          <Button className="h-10 w-full justify-center bg-primary px-2 text-xs text-primary-foreground sm:px-4 sm:text-sm">
            <PlusCircle className="mr-1.5 h-4 w-4 sm:mr-2" /> <span className="sm:hidden">Add</span><span className="hidden sm:inline">Add Money</span>
          </Button>
          </Link>
        </div>
      </div>

      {!kycLoading && !kycApproved && <KycRequiredNotice status={kyc?.status} />}
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
        Account credit is service credit only for Dink Card services. It is not transferable, withdrawable, or usable for peer-to-peer payments.
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-4">
        <StatCard className="col-span-2 md:col-span-1" title="Available Service Balance" value={walletLoading ? '...' : `$${balance.toFixed(2)}`} subtitle={walletLoading ? 'Loading' : `Approx. ${(balance * rate).toLocaleString()} ETB`} icon={Wallet} />
        <StatCard title="Locked Balance" value={walletLoading ? '...' : `$${locked.toFixed(2)}`} subtitle="Pending operations" icon={Lock} />
        <StatCard title="History" value={transactionsLoading ? '...' : displayHistory.length} icon={ArrowDownUp} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">History</h2>
        {transactionsLoading ? (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Loading history...</div>
        ) : !displayHistory.length ? (
          <EmptyState icon={ArrowDownUp} title="No transactions" description="Your service balance transactions will appear here." className="bg-card border border-border rounded-xl" />
        ) : (
          <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
            {displayHistory.map(tx => (
              <div key={tx.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2.5 px-3 py-3 sm:flex sm:items-center sm:px-4">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  {typeIcons[tx.type] || <ArrowDownUp className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium capitalize leading-tight">{typeLabels[tx.type] || (tx.type || '').replace(/_/g, ' ')}</p>
                    <p className={`shrink-0 whitespace-nowrap text-right font-mono text-sm font-semibold ${Number(tx.amount || 0) >= 0 ? 'text-primary' : 'text-foreground'}`}>
                      {tx.source_type === 'crypto_deposit_request' && tx.status !== 'approved' ? '' : Number(tx.amount || 0) >= 0 ? '+' : ''}{Number(tx.amount || 0).toFixed(2)} USD
                    </p>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{tx.description || tx.reference}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    {tx.balance_after === null || tx.balance_after === undefined ? (
                      <p className="min-w-0 truncate text-[10px] text-muted-foreground font-mono">{tx.reference}</p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        Bal: ${Number(tx.balance_after || 0).toFixed(2)}
                      </p>
                    )}
                    <StatusBadge status={tx.status} className="text-[10px]" />
                  </div>
                </div>
                <div className="col-span-2 flex shrink-0 items-center justify-end gap-2 sm:col-span-1">
                  {depositReceiptUrl(tx) && (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(depositReceiptUrl(tx), '_blank')}>
                      <ReceiptText className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={cryptoOpen} onOpenChange={setCryptoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crypto Deposit</DialogTitle>
            <DialogDescription>Choose an asset, amount, and network to get your deposit address.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!currentCryptoDeposit ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Asset</Label>
                    <Select value={cryptoCurrency} onValueChange={setCryptoCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USDC">USDC</SelectItem>
                        <SelectItem value="USDT">USDT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      min="5"
                      step="0.01"
                      value={cryptoAmount}
                      onChange={(event) => setCryptoAmount(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && cryptoAmount && cryptoNetwork && !createCryptoAddress.isPending) {
                          event.preventDefault();
                          createCryptoAddress.mutate();
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Network</Label>
                    <Select value={cryptoNetwork} onValueChange={setCryptoNetwork}>
                      <SelectTrigger><SelectValue placeholder="Choose network" /></SelectTrigger>
                      <SelectContent>
                        {cryptoNetworks.map((network) => (
                          <SelectItem key={network.value} value={network.value}>{network.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:justify-end">
                  <Button variant="outline" onClick={() => setCryptoOpen(false)}>Close</Button>
                  <Button onClick={() => createCryptoAddress.mutate()} disabled={!cryptoAmount || !cryptoNetwork || createCryptoAddress.isPending}>
                    {createCryptoAddress.isPending ? 'Generating...' : 'Generate Address'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{currentCryptoDeposit.payment_currency || 'Crypto'} deposit</p>
                    <div className="mt-1">
                      <StatusBadge status={currentCryptoDeposit.provider_status || currentCryptoDeposit.status} className="text-[10px]" />
                    </div>
                  </div>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {currentCryptoDeposit.payment_network}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-card p-3">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-mono font-semibold">{Number(currentCryptoDeposit.payment_amount || 0).toFixed(2)} {currentCryptoDeposit.payment_currency || 'USDC'}</p>
                  </div>
                  <div className="rounded-xl bg-card p-3">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="text-sm font-semibold capitalize">{String(currentCryptoDeposit.status || '').replace(/_/g, ' ')}</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                  <div className="rounded-xl bg-card p-3">
                    <p className="text-xs text-muted-foreground">Address</p>
                    <div className="mt-1 flex items-start justify-between gap-2">
                      <p className="min-w-0 break-all font-mono text-xs">{currentCryptoDeposit.payment_address}</p>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyText(currentCryptoDeposit.payment_address, 'Address')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-center rounded-xl bg-card p-3">
                    {cryptoQr ? <img src={cryptoQr} alt="Deposit QR code" className="h-[150px] w-[150px] rounded-lg border border-border bg-white p-2" /> : <div className="text-xs text-muted-foreground">QR loading...</div>}
                  </div>
                </div>
                <div className="rounded-xl bg-card/70 p-3 text-xs text-muted-foreground">
                  If you have not sent the transfer yet, cancel this request first and then generate a new address.
                </div>
                <DialogFooter className="gap-2 sm:justify-between">
                  <Button
                    variant="destructive"
                    onClick={() => cancelCryptoDeposit.mutate(currentCryptoDeposit.id)}
                    disabled={cancelCryptoDeposit.isPending}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    {cancelCryptoDeposit.isPending ? 'Cancelling...' : 'Cancel Deposit'}
                  </Button>
                  <Button variant="outline" onClick={() => setCryptoOpen(false)}>Close</Button>
                </DialogFooter>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
