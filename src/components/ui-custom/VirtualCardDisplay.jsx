import React from 'react';
import { CreditCard, Snowflake } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const statusStyles = {
  active: 'border-primary/30 glow-green',
  frozen: 'border-accent/30 glow-blue',
  terminated: 'border-destructive/30 opacity-60',
  pending: 'border-muted-foreground/30'
};

export default function VirtualCardDisplay({ card, showDetails = false, compact = false }) {
  const masked = `**** **** **** ${card.last_four || '----'}`;

  if (compact) {
    return (
      <div className={cn(
        'bg-gradient-to-br from-secondary to-card border rounded-xl p-4 cursor-pointer hover:border-primary/30 transition-all',
        'min-h-[86px]',
        statusStyles[card.status]
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-primary" />
            <div>
              <p className="font-medium text-sm">{card.card_nickname}</p>
              <p className="text-xs text-muted-foreground font-mono">**** {card.last_four || '----'}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold font-mono text-sm">${(card.balance || 0).toFixed(2)}</p>
            <div className="flex items-center gap-1 mt-0.5">
              {card.status === 'frozen' && <Snowflake className="w-3 h-3 text-accent" />}
              <span className={cn(
                'text-xs capitalize',
                card.status === 'active' ? 'text-primary' :
                  card.status === 'frozen' ? 'text-accent' :
                    'text-muted-foreground'
              )}>
                {card.status}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'relative w-full max-w-sm aspect-[1.586/1] rounded-2xl p-6 flex flex-col justify-between overflow-hidden',
        'bg-gradient-to-br from-[hsl(222,44%,12%)] to-[hsl(222,44%,6%)] border',
        statusStyles[card.status]
      )}
    >
      <div className="card-shimmer absolute inset-0 rounded-2xl" />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{card.card_nickname}</p>
          <p className="text-[10px] text-muted-foreground/60 uppercase mt-0.5">Virtual Card</p>
        </div>
        <span className="text-lg font-bold tracking-widest text-foreground/80">DINK</span>
      </div>

      <div className="relative">
        <p className="font-mono text-lg tracking-[0.2em] text-foreground/90">
          {showDetails && card.card_number_encrypted ? card.card_number_encrypted : masked}
        </p>
      </div>

      <div className="relative flex items-end justify-between">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase">Expiry</p>
          <p className="font-mono text-sm text-foreground/80">
            {showDetails ? `${card.expiry_month}/${card.expiry_year}` : '**/**'}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase">CVV</p>
          <p className="font-mono text-sm text-foreground/80">
            {showDetails && card.cvv_encrypted ? card.cvv_encrypted : '***'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase">Balance</p>
          <p className="font-mono text-lg font-bold text-primary">
            ${(card.balance || 0).toFixed(2)}
          </p>
        </div>
      </div>

      {card.status !== 'active' && (
        <div className="absolute top-3 right-3">
          <span className={cn(
            'text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full',
            card.status === 'frozen' ? 'bg-accent/20 text-accent' :
              card.status === 'terminated' ? 'bg-destructive/20 text-destructive' :
                'bg-muted text-muted-foreground'
          )}>
            {card.status}
          </span>
        </div>
      )}
    </motion.div>
  );
}
