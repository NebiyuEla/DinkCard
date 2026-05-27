import React from 'react';
import { cn } from '@/lib/utils';

export default function StatCard({ title, value, subtitle, icon: Icon, trend, accentClass = 'text-primary', className }) {
  return (
    <div className={cn('flex h-full min-h-[84px] flex-col justify-between rounded-xl border border-border bg-card p-3 transition-all hover:border-primary/20 sm:min-h-[112px] sm:p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-[9px] font-semibold uppercase leading-tight tracking-[0.08em] text-muted-foreground sm:text-[11px]">{title}</p>
          <p className={cn('max-w-full break-words font-mono text-[clamp(0.95rem,4.5vw,1.2rem)] font-bold leading-tight sm:text-xl', accentClass)}>{value}</p>
          {subtitle && <p className="break-words text-[10px] leading-snug text-muted-foreground sm:text-[11px]">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="shrink-0 rounded-lg bg-secondary p-1.5 sm:p-2.5">
            <Icon className={cn('h-4 w-4 sm:h-5 sm:w-5', accentClass)} />
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          <span className={trend > 0 ? 'text-primary' : 'text-destructive'}>
            {trend > 0 ? '+' : '-'} {Math.abs(trend)}%
          </span>
          <span className="text-muted-foreground">vs last month</span>
        </div>
      )}
    </div>
  );
}
