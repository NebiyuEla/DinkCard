import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useCurrentUser, useWallet, useWalletTransactions, useFeeSettings } from '@/hooks/useAppData';
import StatCard from '@/components/ui-custom/StatCard';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import EmptyState from '@/components/ui-custom/EmptyState';
import { Button } from '@/components/ui/button';
import { Wallet, PlusCircle, ArrowDownUp, DollarSign, Lock, Clock, SendHorizontal, Copy, QrCode } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/api/client';
import { invalidateOperationalData } from '@/lib/realtime';
import { toast } from 'sonner';
import QRCode from 'qrcode';

export default function WalletPage() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: wallet } = useWallet(user?.email);
  const { data: transactions } = useWalletTransactions(user?.email);
  const { data: settings } = useFeeSettings();
  const [shareOpen, setShareOpen] = useState(false);
  const [recipientInput, setRecipientInput] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [shareAmount, setShareAmount] = useState('');
  const [usdcOpen, setUsdcOpen] = useState(false);
  const [usdcAmount, setUsdcAmount] = useState('');
  const [usdcNetwork, setUsdcNetwork] = useState('');
  const [usdcQr, setUsdcQr] = useState('');

  const balance = wallet?.available_balance || 0;
  const locked = wallet?.locked_balance || 0;
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

  const usdcNetworksQuery = useQuery({
    queryKey: ['usdc-networks'],
    queryFn: () => apiClient.payments.getUsdcNetworks()
  });

  const { data: deposits } = useQuery({
    queryKey: ['deposits', user?.email, 'wallet-view'],
    queryFn: () => apiClient.entities.Deposit.filter({ user_id: user?.email }, '-created_date'),
    enabled: !!user?.email
  });

  const currentUsdcDeposit = deposits?.find((deposit) => deposit.payment_method === 'usdc' && ['pending_transfer', 'awaiting_review'].includes(deposit.status)) || null;
  const usdcNetworks = usdcNetworksQuery.data?.networks || [];

  useEffect(() => {
    if (!usdcNetwork && usdcNetworks.length) {
      setUsdcNetwork(usdcNetworks[0].value);
    }
  }, [usdcNetwork, usdcNetworks]);

  useEffect(() => {
    let ignore = false;
    const address = String(currentUsdcDeposit?.payment_address || '').trim();
    if (!address) {
      setUsdcQr('');
      return undefined;
    }
    QRCode.toDataURL(address, { margin: 1, width: 180 }).then((value) => {
      if (!ignore) setUsdcQr(value);
    }).catch(() => {
      if (!ignore) setUsdcQr('');
    });
    return () => { ignore = true; };
  }, [currentUsdcDeposit?.payment_address]);

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

  const createUsdcAddress = useMutation({
    mutationFn: () => apiClient.payments.createUsdcAddress({ amountUsd: Number(usdcAmount), network: usdcNetwork }),
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      toast.success('USDC address ready');
    },
    onError: (error) => toast.error(error.message || 'Could not generate address')
  });

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value || ''));
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Service Balance</h1>
          <p className="text-sm text-muted-foreground">Your available platform balance and history</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShareOpen(true)}>
            <SendHorizontal className="w-4 h-4 mr-2" /> Send Money
          </Button>
          <Button variant="outline" onClick={() => setUsdcOpen(true)}>
            <QrCode className="w-4 h-4 mr-2" /> USDC Deposit
          </Button>
          <Link to="/add-money">
          <Button className="bg-primary text-primary-foreground">
            <PlusCircle className="w-4 h-4 mr-2" /> Add Money
          </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Available Service Balance" value={`$${balance.toFixed(2)}`} subtitle={`Approx. ${(balance * rate).toLocaleString()} ETB`} icon={Wallet} />
        <StatCard title="Locked Balance" value={`$${locked.toFixed(2)}`} subtitle="Pending operations" icon={Lock} />
        <StatCard title="Total Transactions" value={transactions?.length || 0} icon={ArrowDownUp} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ledger History</h2>
        {!transactions?.length ? (
          <EmptyState icon={ArrowDownUp} title="No transactions" description="Your service balance transactions will appear here." className="bg-card border border-border rounded-xl" />
        ) : (
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            {transactions.map(tx => (
              <div key={tx.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  {typeIcons[tx.type] || <ArrowDownUp className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize truncate">{typeLabels[tx.type] || (tx.type || '').replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground truncate">{tx.description || tx.reference}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-mono font-semibold ${tx.amount >= 0 ? 'text-primary' : 'text-foreground'}`}>
                    {tx.amount >= 0 ? '+' : ''}{tx.amount?.toFixed(2)} USD
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Bal: ${tx.balance_after?.toFixed(2)}
                  </p>
                </div>
                <div className="shrink-0">
                  <StatusBadge status={tx.status} className="text-[10px]" />
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

      <Dialog open={usdcOpen} onOpenChange={setUsdcOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>USDC Deposit</DialogTitle>
            <DialogDescription>Add to your service balance with a compact USDC deposit address.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!currentUsdcDeposit ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Amount in USD</Label>
                    <Input type="number" min="5" step="0.01" value={usdcAmount} onChange={(event) => setUsdcAmount(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Network</Label>
                    <Select value={usdcNetwork} onValueChange={setUsdcNetwork}>
                      <SelectTrigger><SelectValue placeholder="Choose network" /></SelectTrigger>
                      <SelectContent>
                        {usdcNetworks.map((network) => (
                          <SelectItem key={network.value} value={network.value}>{network.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setUsdcOpen(false)}>Close</Button>
                  <Button onClick={() => createUsdcAddress.mutate()} disabled={!usdcAmount || !usdcNetwork || createUsdcAddress.isPending}>
                    {createUsdcAddress.isPending ? 'Generating...' : 'Generate Address'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">USDC deposit</p>
                    <p className="text-xs text-muted-foreground"><StatusBadge status={currentUsdcDeposit.status} className="text-[10px]" /></p>
                  </div>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {currentUsdcDeposit.payment_network}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-card p-3">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-mono font-semibold">{Number(currentUsdcDeposit.payment_amount || 0).toFixed(2)} USDC</p>
                  </div>
                  <div className="rounded-xl bg-card p-3">
                    <p className="text-xs text-muted-foreground">Reference</p>
                    <div className="mt-1 flex items-start justify-between gap-2">
                      <p className="min-w-0 break-all font-mono text-xs">{currentUsdcDeposit.transaction_reference}</p>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyText(currentUsdcDeposit.transaction_reference, 'Reference')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                  <div className="rounded-xl bg-card p-3">
                    <p className="text-xs text-muted-foreground">Address</p>
                    <div className="mt-1 flex items-start justify-between gap-2">
                      <p className="min-w-0 break-all font-mono text-xs">{currentUsdcDeposit.payment_address}</p>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyText(currentUsdcDeposit.payment_address, 'Address')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-center rounded-xl bg-card p-3">
                    {usdcQr ? <img src={usdcQr} alt="USDC deposit QR code" className="h-[150px] w-[150px] rounded-lg border border-border bg-white p-2" /> : <div className="text-xs text-muted-foreground">QR loading...</div>}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setUsdcOpen(false)}>Close</Button>
                </DialogFooter>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
