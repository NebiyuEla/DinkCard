import React from 'react';
import { cn } from '@/lib/utils';

export default function StatCard({ title, value, subtitle, icon: Icon, trend, accentClass = 'text-primary', className }) {
  return (
    <div className={cn('flex h-full min-h-[92px] flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-3 transition-all hover:border-primary/20 sm:min-h-[118px] sm:p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-medium uppercase leading-snug tracking-[0.12em] text-muted-foreground sm:text-[11px]">{title}</p>
          <p className={cn('max-w-full truncate whitespace-nowrap font-mono text-[clamp(1rem,5vw,1.25rem)] font-bold leading-tight sm:text-xl', accentClass)}>{value}</p>
          {subtitle && <p className="line-clamp-2 break-words text-[11px] leading-snug text-muted-foreground">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="shrink-0 rounded-lg bg-secondary p-2 sm:p-2.5">
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
