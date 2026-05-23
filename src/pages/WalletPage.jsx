import React from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser, useWallet, useWalletTransactions, useFeeSettings } from '@/hooks/useAppData';
import StatCard from '@/components/ui-custom/StatCard';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import EmptyState from '@/components/ui-custom/EmptyState';
import { Button } from '@/components/ui/button';
import { Wallet, PlusCircle, ArrowDownUp, DollarSign, Lock, Clock } from 'lucide-react';

export default function WalletPage() {
  const { data: user } = useCurrentUser();
  const { data: wallet } = useWallet(user?.email);
  const { data: transactions } = useWalletTransactions(user?.email);
  const { data: settings } = useFeeSettings();

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
    referral_reward: <DollarSign className="w-4 h-4 text-primary" />
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Balance</h1>
          <p className="text-sm text-muted-foreground">Your available platform balance and history</p>
        </div>
        <Link to="/add-money">
          <Button className="bg-primary text-primary-foreground">
            <PlusCircle className="w-4 h-4 mr-2" /> Add Money
          </Button>
        </Link>
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
    </div>
  );
}
