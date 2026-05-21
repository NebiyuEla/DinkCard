import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrentUser, useWallet, useCards, useDeposits, useKYCStatus, useFeeSettings, useWalletTransactions } from '@/hooks/useAppData';
import StatCard from '@/components/ui-custom/StatCard';
import VirtualCardDisplay from '@/components/ui-custom/VirtualCardDisplay';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import EmptyState from '@/components/ui-custom/EmptyState';
import { Button } from '@/components/ui/button';
import { 
  Wallet, CreditCard, PlusCircle, ArrowDownUp, ShieldCheck, 
  HeadphonesIcon, DollarSign, TrendingUp, AlertCircle, ArrowUpRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

const quickActions = [
  { label: 'Add Money', path: '/add-money', icon: PlusCircle, color: 'text-primary' },
  { label: 'Request Card', path: '/cards/create', icon: CreditCard, color: 'text-accent' },
  { label: 'Fund Card', path: '/cards', icon: DollarSign, color: 'text-yellow-500' },
  { label: 'Transactions', path: '/transactions', icon: ArrowDownUp, color: 'text-muted-foreground' },
  { label: 'KYC', path: '/kyc', icon: ShieldCheck, color: 'text-primary' },
  { label: 'Support', path: '/support', icon: HeadphonesIcon, color: 'text-accent' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const { data: wallet } = useWallet(user?.email);
  const { data: cards } = useCards(user?.email);
  const { data: deposits } = useDeposits(user?.email);
  const { data: kyc } = useKYCStatus(user?.email);
  const { data: settings } = useFeeSettings();
  const { data: transactions } = useWalletTransactions(user?.email);

  const balance = wallet?.available_balance || 0;
  const etbEstimate = balance * (settings?.usd_to_etb_rate || 135);
  const activeCards = cards?.filter(c => c.status === 'active') || [];
  const frozenCards = cards?.filter(c => c.status === 'frozen') || [];
  const pendingDeposits = deposits?.filter(d => ['pending_payment', 'awaiting_review'].includes(d.status)) || [];
  const totalDeposited = deposits?.filter(d => d.status === 'approved').reduce((sum, d) => sum + (d.final_usd_credit || 0), 0) || 0;
  const totalCardDebits = transactions?.filter(t => t.type === 'card_funding' && t.status === 'completed').reduce((sum, t) => sum + Math.abs(t.amount || 0), 0) || 0;
  const cardRefunds = transactions?.filter(t => t.type === 'refund' && t.status === 'completed' && String(t.description || '').toLowerCase().includes('card')).reduce((sum, t) => sum + Math.abs(t.amount || 0), 0) || 0;
  const totalSpent = Math.max(0, totalCardDebits - cardRefunds);
  const recentTx = (transactions || []).slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Here's your account overview</p>
      </div>

      {/* KYC warning */}
      {(!kyc || kyc.status !== 'approved') && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-500">Complete your KYC verification</p>
            <p className="text-xs text-muted-foreground mt-0.5">You need to verify your identity before creating cards or making deposits.</p>
            <Link to="/kyc">
              <Button size="sm" variant="outline" className="mt-2 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10">
                Complete KYC <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Available Service Balance" value={`$${balance.toFixed(2)}`} subtitle={`≈ ${etbEstimate.toLocaleString()} ETB`} icon={Wallet} />
        <StatCard title="Total Deposited" value={`$${totalDeposited.toFixed(2)}`} icon={TrendingUp} />
        <StatCard title="Net Card Funding" value={`$${totalSpent.toFixed(2)}`} icon={DollarSign} />
        <StatCard title="Active Cards" value={activeCards.length} subtitle={frozenCards.length ? `${frozenCards.length} frozen` : undefined} icon={CreditCard} />
        <StatCard title="Pending" value={pendingDeposits.length} subtitle="deposits" icon={PlusCircle} />
        <StatCard title="KYC Level" value={kyc?.status === 'approved' ? `Level ${kyc.level || 1}` : 'Level 0'} icon={ShieldCheck} />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <Link key={action.path} to={action.path}>
              <div className="bg-card border border-border rounded-xl p-4 text-center hover:border-primary/30 transition-all group cursor-pointer">
                <action.icon className={`w-6 h-6 mx-auto mb-2 ${action.color} group-hover:scale-110 transition-transform`} />
                <p className="text-xs font-medium">{action.label}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Cards */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">My Cards</h2>
            <Link to="/cards" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {activeCards.length === 0 && frozenCards.length === 0 ? (
            <EmptyState 
              icon={CreditCard} 
              title="No cards yet" 
              description="Request your first virtual card for supported online payments."
              actionLabel="Request Card"
              onAction={() => navigate('/cards/create')}
              className="py-10 bg-card border border-border rounded-xl"
            />
          ) : (
            <div className="space-y-3">
              {[...activeCards, ...frozenCards].slice(0, 3).map(card => (
                <Link key={card.id} to={`/cards?id=${card.id}`}>
                  <VirtualCardDisplay card={card} compact />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Transactions</h2>
            <Link to="/transactions" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {recentTx.length === 0 ? (
            <EmptyState 
              icon={ArrowDownUp} 
              title="No transactions yet" 
              description="Your recent service balance activity will appear here."
              className="py-10 bg-card border border-border rounded-xl"
            />
          ) : (
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {recentTx.map(tx => (
                <div key={tx.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium capitalize">{(tx.type || '').replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">{tx.created_date ? format(new Date(tx.created_date), 'MMM d, h:mm a') : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-mono font-semibold ${tx.amount >= 0 ? 'text-primary' : 'text-foreground'}`}>
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
    </div>
  );
}
