import React from 'react';
import { cn } from '@/lib/utils';

export default function StatCard({ title, value, subtitle, icon: Icon, trend, accentClass = 'text-primary', className }) {
  return (
    <div className={cn('flex h-full min-h-[132px] flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/20', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className={cn('break-words font-mono text-2xl font-bold leading-tight', accentClass)}>{value}</p>
          {subtitle && <p className="text-xs leading-snug text-muted-foreground">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="shrink-0 rounded-lg bg-secondary p-2.5">
            <Icon className={cn('h-5 w-5', accentClass)} />
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
