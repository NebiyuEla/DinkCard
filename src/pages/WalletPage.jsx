import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useCurrentUser, useWallet, useWalletTransactions, useFeeSettings } from '@/hooks/useAppData';
import StatCard from '@/components/ui-custom/StatCard';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import EmptyState from '@/components/ui-custom/EmptyState';
import { Button } from '@/components/ui/button';
import { Wallet, PlusCircle, ArrowDownUp, DollarSign, Lock, Clock, SendHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/api/client';
import { invalidateOperationalData } from '@/lib/realtime';
import { toast } from 'sonner';

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
    onError: (error) => toast.error(error.message || 'Could not share balance')
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Service Balance</h1>
          <p className="text-sm text-muted-foreground">Your available platform balance and history</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShareOpen(true)}>
            <SendHorizontal className="w-4 h-4 mr-2" /> Share Balance
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
                  <p className="text-sm font-medium capitalize truncate">{(tx.type || '').replace(/_/g, ' ')}</p>
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
            <DialogTitle>Share Balance</DialogTitle>
            <DialogDescription>Send balance with no fee using the receiver&apos;s email, phone number, or username.</DialogDescription>
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
              <p className="text-xs text-muted-foreground">No fee is charged for this balance share.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setRecipient(null); setShareAmount(''); }}>Back</Button>
                <Button onClick={() => shareBalance.mutate()} disabled={!Number(shareAmount) || Number(shareAmount) > balance || shareBalance.isPending}>
                  {shareBalance.isPending ? 'Sending...' : 'Send Balance'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
