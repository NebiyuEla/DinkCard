import React, { useState } from 'react';
import { useCurrentUser, useWalletTransactions } from '@/hooks/useAppData';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import EmptyState from '@/components/ui-custom/EmptyState';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDownUp, PlusCircle, DollarSign, ArrowUpRight, Lock, Clock, CreditCard, Gift } from 'lucide-react';
import { format } from 'date-fns';

const typeFilters = [
  { value: 'all', label: 'All Transactions' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'card_creation', label: 'Card Requests' },
  { value: 'card_funding', label: 'Card Funding' },
  { value: 'card_withdrawal', label: 'Card Withdrawals' },
  { value: 'refund', label: 'Refunds' },
  { value: 'fee', label: 'Fees' },
  { value: 'adjustment', label: 'Adjustments' },
  { value: 'referral_reward', label: 'Referral Rewards' },
];

const typeIcons = {
  deposit: <PlusCircle className="w-4 h-4 text-primary" />,
  card_creation: <CreditCard className="w-4 h-4 text-accent" />,
  card_funding: <DollarSign className="w-4 h-4 text-yellow-500" />,
  card_withdrawal: <ArrowUpRight className="w-4 h-4 text-accent" />,
  refund: <ArrowDownUp className="w-4 h-4 text-accent" />,
  fee: <Lock className="w-4 h-4 text-muted-foreground" />,
  adjustment: <Clock className="w-4 h-4 text-muted-foreground" />,
  referral_reward: <Gift className="w-4 h-4 text-primary" />,
};

export default function Transactions() {
  const { data: user } = useCurrentUser();
  const { data: transactions } = useWalletTransactions(user?.email);
  const [filter, setFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = (transactions || []).filter(tx => {
    if (filter !== 'all' && tx.type !== filter) return false;
    if (statusFilter !== 'all' && tx.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-sm text-muted-foreground">Complete history of your service balance activity</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {typeFilters.map(f => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ArrowDownUp} title="No transactions found" description="Transactions matching your filters will appear here." />
      ) : (
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {filtered.map(tx => (
            <div key={tx.id} className="px-4 py-3 flex items-center gap-3 hover:bg-secondary/30 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                {typeIcons[tx.type] || <ArrowDownUp className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium capitalize">{(tx.type || '').replace(/_/g, ' ')}</p>
                <p className="text-xs text-muted-foreground truncate">{tx.description || tx.reference}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-mono font-semibold ${tx.amount >= 0 ? 'text-primary' : 'text-foreground'}`}>
                  {tx.amount >= 0 ? '+' : ''}{tx.amount?.toFixed(2)} USD
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {tx.created_date ? format(new Date(tx.created_date), 'MMM d, h:mm a') : ''}
                </p>
              </div>
              <StatusBadge status={tx.status} className="shrink-0 text-[10px]" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
