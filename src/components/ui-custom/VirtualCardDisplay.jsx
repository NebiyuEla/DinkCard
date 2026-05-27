import React from 'react';
import { CreditCard, Snowflake } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const statusStyles = {
  active: 'border-primary/30 glow-green',
  frozen: 'border-cyan-300/40 shadow-cyan-300/15',
  terminated: 'border-destructive/30 opacity-60',
  pending: 'border-muted-foreground/30'
};

function parseMeta(meta) {
  if (!meta) return {};
  if (typeof meta === 'object') return meta;
  try {
    return JSON.parse(meta);
  } catch {
    return {};
  }
}

export default function VirtualCardDisplay({ card, showDetails = false, compact = false }) {
  const meta = parseMeta(card.meta);
  const cardholderName = [
    card.first_name || meta.first_name,
    card.last_name || meta.last_name
  ].filter(Boolean).join(' ').trim()
    || card.cardholder_name
    || card.card_holder
    || card.preferred_name
    || card.name
    || meta.preferred_name
    || meta.name
    || meta.cardholder_name
    || 'Cardholder';
  const masked = card.masked_pan || card.maskedPan || `**** **** **** ${card.last_four || '----'}`;
  const balance = Number(card.balance || 0);
  const cardNumber = showDetails && card.card_number_encrypted ? card.card_number_encrypted : masked;
  const expiry = showDetails && (card.expiry_month || card.expiry_year)
    ? `${card.expiry_month || '**'}/${card.expiry_year || '**'}`
    : '**/**';
  const cvv = showDetails && card.cvv_encrypted ? card.cvv_encrypted : '***';
  const isFrozen = card.status === 'frozen';

  const copyField = async (value, label) => {
    if (!showDetails || !value || String(value).includes('*')) return;
    try {
      await navigator.clipboard.writeText(String(value));
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  if (compact) {
    return (
      <div className={cn(
        'group relative overflow-hidden border rounded-2xl p-4 cursor-pointer hover:border-primary/30 transition-all',
        'min-h-[92px]',
        isFrozen ? 'bg-gradient-to-br from-cyan-950/40 via-card to-slate-950' : 'bg-gradient-to-br from-secondary to-card',
        statusStyles[card.status]
      )}>
        {isFrozen && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.18),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.08)_0_1px,transparent_1px_10px)]" />
            <Snowflake className="pointer-events-none absolute -bottom-4 -right-3 h-16 w-16 rotate-12 animate-pulse text-cyan-200/10" />
          </>
        )}
        <div className="relative z-10 flex h-full items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="rounded-xl bg-primary/10 p-2">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{cardholderName}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {card.card_nickname || 'Virtual Card'} <span className="font-mono">**** {card.last_four || '----'}</span>
              </p>
            </div>
          </div>
          <div className="min-w-[104px] shrink-0 rounded-xl bg-background/25 px-2.5 py-1.5 text-right backdrop-blur-sm">
            <p className="whitespace-nowrap font-mono text-sm font-bold">${balance.toFixed(2)}</p>
            <div className="mt-0.5 flex items-center justify-end gap-1">
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
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        'relative w-full max-w-[340px] aspect-[1.586/1] rounded-2xl p-5 sm:p-6 flex flex-col justify-between overflow-hidden shadow-2xl shadow-primary/5',
        isFrozen
          ? 'bg-gradient-to-br from-cyan-950 via-slate-950 to-cyan-900/70 border backdrop-blur-xl'
          : 'bg-gradient-to-br from-[hsl(222,44%,13%)] via-[hsl(222,38%,9%)] to-[hsl(222,44%,5%)] border backdrop-blur-xl',
        statusStyles[card.status]
      )}
    >
      <div className="card-shimmer absolute inset-0 rounded-2xl" />
      <div className="pointer-events-none absolute -left-10 -top-16 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-4 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
      {isFrozen && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(186,230,253,0.22),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.14)_0_1px,transparent_1px_12px)]" />
          <div className="pointer-events-none absolute inset-0 backdrop-saturate-50" />
          <div className="pointer-events-none absolute right-5 top-12 flex items-center gap-1 rounded-full border border-cyan-200/25 bg-cyan-200/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100">
            <Snowflake className="h-3 w-3" /> Frozen
          </div>
        </>
      )}

      <div className="relative flex items-start justify-between">
        <div>
          <p className="max-w-[180px] truncate text-sm font-semibold text-foreground/90">{cardholderName}</p>
          <p className="max-w-[180px] truncate text-[11px] text-muted-foreground">{card.card_nickname || 'Virtual Card'}</p>
          <div className="mt-2">
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
              card.status === 'active' ? 'bg-primary/15 text-primary' :
                card.status === 'frozen' ? 'bg-accent/20 text-accent' :
                  card.status === 'terminated' ? 'bg-destructive/20 text-destructive' :
                    'bg-muted text-muted-foreground'
            )}>
              {card.status}
            </span>
          </div>
        </div>
        <span className="whitespace-nowrap text-base font-bold tracking-tight text-foreground/80 sm:text-lg">Dink Card</span>
      </div>

      <div className="relative">
        <button
          type="button"
          className={cn('max-w-full font-mono text-lg tracking-[0.2em] text-foreground/90', showDetails && 'cursor-copy rounded-md text-left transition-colors hover:text-primary')}
          onClick={() => copyField(card.card_number_encrypted, 'Card number')}
          title={showDetails ? 'Click to copy card number' : undefined}
        >
          {cardNumber}
        </button>
      </div>

      <div className="relative flex items-end justify-between">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase">Expiry</p>
          <button
            type="button"
            className={cn('font-mono text-sm text-foreground/80', showDetails && 'cursor-copy rounded-md transition-colors hover:text-primary')}
            onClick={() => copyField(expiry, 'Expiry')}
            title={showDetails ? 'Click to copy expiry' : undefined}
          >
            {expiry}
          </button>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase">CVV</p>
          <button
            type="button"
            className={cn('font-mono text-sm text-foreground/80', showDetails && 'cursor-copy rounded-md transition-colors hover:text-primary')}
            onClick={() => copyField(card.cvv_encrypted, 'CVV')}
            title={showDetails ? 'Click to copy CVV' : undefined}
          >
            {cvv}
          </button>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase">Balance</p>
          <p className="font-mono text-lg font-bold text-primary">
            ${balance.toFixed(2)}
          </p>
        </div>
      </div>

    </motion.div>
  );
}
