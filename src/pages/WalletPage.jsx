import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useCurrentUser, useWallet, useWalletTransactions, useFeeSettings } from '@/hooks/useAppData';
import StatCard from '@/components/ui-custom/StatCard';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import EmptyState from '@/components/ui-custom/EmptyState';
import { Button } from '@/components/ui/button';
import { Wallet, PlusCircle, ArrowDownUp, DollarSign, Lock, Clock, SendHorizontal, Copy, QrCode, ReceiptText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/api/client';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { toast } from 'sonner';
import QRCode from 'qrcode';

export default function WalletPage() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: wallet, isLoading: walletLoading } = useWallet(user?.email);
  const { data: transactions, isLoading: transactionsLoading } = useWalletTransactions(user?.email);
  const { data: settings } = useFeeSettings();
  const [shareOpen, setShareOpen] = useState(false);
  const [recipientInput, setRecipientInput] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [shareAmount, setShareAmount] = useState('');
  const [cryptoOpen, setCryptoOpen] = useState(false);
  const [cryptoCurrency, setCryptoCurrency] = useState('USDC');
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [cryptoNetwork, setCryptoNetwork] = useState('');
  const [cryptoQr, setCryptoQr] = useState('');

  const balance = Number(wallet?.available_balance || 0);
  const locked = Number(wallet?.locked_balance || 0);
  const rate = settings?.usd_to_etb_rate || 135;

  const typeIcons = {
    deposit: <PlusCircle className="w-4 h-4 text-primary" />,
    card_creation: <DollarSign className="w-4 h-4 text-accent" />,
    card_funding: <DollarSign className="w-4 h-4 text-yellow-500" />,
    refund: <ArrowDownUp className="w-4 h-4 text-accent" />,
    fee: <Lock className="w-4 h-4 text-muted-foreground" />,
    adjustment: <Clock className="w-4 h-4 text-muted-foreground" />,
    card_withdrawal: <ArrowDownUp className="w-4 h-4 text-primary" />,
    referral_reward: <DollarSign className="w-4 h-4 text-primary" />,
    balance_share_sent: <SendHorizontal className="w-4 h-4 text-accent" />,
    balance_share_received: <SendHorizontal className="w-4 h-4 text-primary" />
  };

  const typeLabels = {
    balance_share_sent: 'Money sent',
    balance_share_received: 'Money received'
  };

  const cryptoNetworksQuery = useQuery({
    queryKey: ['crypto-networks', cryptoCurrency],
    queryFn: () => apiClient.payments.getCryptoNetworks(cryptoCurrency)
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

  const lookupRecipient = useMutation({
    mutationFn: () => apiClient.wallet.lookupShareRecipient(recipientInput),
    onSuccess: (payload) => {
      setRecipient(payload);
      toast.success('Receiver found');
    },
    onError: (error) => {
      setRecipient(null);
      toast.error(error.message || 'Receiver not found');
    }
  });

  const shareBalance = useMutation({
    mutationFn: () => apiClient.wallet.shareBalance({ identifier: recipientInput, amount: Number(shareAmount) }),
    onSuccess: (payload) => {
      invalidateOperationalData(queryClient);
      toast.success(`$${Number(payload.amount || 0).toFixed(2)} sent successfully`);
      setShareOpen(false);
      setRecipientInput('');
      setRecipient(null);
      setShareAmount('');
    },
    onError: (error) => toast.error(error.message || 'Could not send money')
  });

  const createCryptoAddress = useMutation({
    mutationFn: () => apiClient.payments.createCryptoAddress({ amountUsd: Number(cryptoAmount), network: cryptoNetwork, currency: cryptoCurrency }),
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      toast.success(`${cryptoCurrency} address ready`);
    },
    onError: (error) => toast.error(error.message || 'Could not generate address')
  });

  const depositReceiptUrl = (tx) => {
    if (tx.type !== 'deposit') return null;
    const ref = String(tx.reference || '');
    if (ref.startsWith('DEP-')) return apiClient.payments.invoiceUrl(ref.slice(4));
    return apiClient.payments.invoiceUrl(ref);
  };

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value || ''));
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  return (
    <div className="space-y-4 pb-4 lg:pb-0">
      <div className="space-y-3 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Service Balance</h1>
          <p className="text-sm text-muted-foreground">Your available platform balance and history</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <Button variant="outline" className="h-10 justify-center px-2 text-xs sm:px-4 sm:text-sm" onClick={() => setShareOpen(true)}>
            <SendHorizontal className="mr-1.5 h-4 w-4 sm:mr-2" /> <span className="sm:hidden">Send</span><span className="hidden sm:inline">Send Money</span>
          </Button>
          <Button variant="outline" className="h-10 justify-center px-2 text-xs sm:px-4 sm:text-sm" onClick={() => setCryptoOpen(true)}>
            <QrCode className="mr-1.5 h-4 w-4 sm:mr-2" /> <span className="sm:hidden">Deposit</span><span className="hidden sm:inline">Crypto Deposit</span>
          </Button>
          <Link to="/add-money">
          <Button className="h-10 w-full justify-center bg-primary px-2 text-xs text-primary-foreground sm:px-4 sm:text-sm">
            <PlusCircle className="mr-1.5 h-4 w-4 sm:mr-2" /> <span className="sm:hidden">Add</span><span className="hidden sm:inline">Add Money</span>
          </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-4">
        <StatCard className="col-span-2 md:col-span-1" title="Available Service Balance" value={walletLoading ? '...' : `$${balance.toFixed(2)}`} subtitle={walletLoading ? 'Loading' : `Approx. ${(balance * rate).toLocaleString()} ETB`} icon={Wallet} />
        <StatCard title="Locked Balance" value={walletLoading ? '...' : `$${locked.toFixed(2)}`} subtitle="Pending operations" icon={Lock} />
        <StatCard title="History" value={transactionsLoading ? '...' : (transactions?.length || 0)} icon={ArrowDownUp} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">History</h2>
        {transactionsLoading ? (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Loading history...</div>
        ) : !transactions?.length ? (
          <EmptyState icon={ArrowDownUp} title="No transactions" description="Your service balance transactions will appear here." className="bg-card border border-border rounded-xl" />
        ) : (
          <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
            {transactions.map(tx => (
              <div key={tx.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2.5 px-3 py-3 sm:flex sm:items-center sm:px-4">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  {typeIcons[tx.type] || <ArrowDownUp className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium capitalize leading-tight">{typeLabels[tx.type] || (tx.type || '').replace(/_/g, ' ')}</p>
                    <p className={`shrink-0 whitespace-nowrap text-right font-mono text-sm font-semibold ${Number(tx.amount || 0) >= 0 ? 'text-primary' : 'text-foreground'}`}>
                      {Number(tx.amount || 0) >= 0 ? '+' : ''}{Number(tx.amount || 0).toFixed(2)} USD
                    </p>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{tx.description || tx.reference}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Bal: ${Number(tx.balance_after || 0).toFixed(2)}
                    </p>
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

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Money</DialogTitle>
            <DialogDescription>Send money with no fee using the receiver&apos;s email, phone number, or username.</DialogDescription>
          </DialogHeader>

          {!recipient ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Receiver</Label>
                <Input value={recipientInput} onChange={(event) => setRecipientInput(event.target.value)} placeholder="email, phone, or username" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShareOpen(false)}>Cancel</Button>
                <Button onClick={() => lookupRecipient.mutate()} disabled={!recipientInput.trim() || lookupRecipient.isPending}>
                  {lookupRecipient.isPending ? 'Checking...' : 'Next'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-secondary/20 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Receiver</p>
                <p className="mt-2 font-semibold">{recipient.full_name || recipient.email}</p>
                <p className="text-xs text-muted-foreground">{recipient.username ? `@${recipient.username}` : recipient.email}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Amount in USD</Label>
                <Input type="number" min="0.01" step="0.01" value={shareAmount} onChange={(event) => setShareAmount(event.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">No fee is charged for this transfer.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setRecipient(null); setShareAmount(''); }}>Back</Button>
                <Button onClick={() => shareBalance.mutate()} disabled={!Number(shareAmount) || Number(shareAmount) > balance || shareBalance.isPending}>
                  {shareBalance.isPending ? 'Sending...' : 'Send Money'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                        <SelectItem value="BTC">BTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Amount</Label>
                    <Input type="number" min="5" step="0.01" value={cryptoAmount} onChange={(event) => setCryptoAmount(event.target.value)} />
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
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCryptoOpen(false)}>Close</Button>
                  <Button onClick={() => createCryptoAddress.mutate()} disabled={!cryptoAmount || !cryptoNetwork || createCryptoAddress.isPending}>
                    {createCryptoAddress.isPending ? 'Generating...' : 'Generate Address'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{currentCryptoDeposit.payment_currency || 'Crypto'} deposit</p>
                    <p className="text-xs text-muted-foreground"><StatusBadge status={currentCryptoDeposit.provider_status || currentCryptoDeposit.status} className="text-[10px]" /></p>
                  </div>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {currentCryptoDeposit.payment_network}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-1">
                  <div className="rounded-xl bg-card p-3">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-mono font-semibold">{Number(currentCryptoDeposit.payment_amount || 0).toFixed(2)} {currentCryptoDeposit.payment_currency || 'USDC'}</p>
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
                <DialogFooter>
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
