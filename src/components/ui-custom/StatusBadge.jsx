import React from 'react';
import { cn } from '@/lib/utils';

const statusColors = {
  active: 'bg-primary/10 text-primary border-primary/20',
  approved: 'bg-primary/10 text-primary border-primary/20',
  completed: 'bg-primary/10 text-primary border-primary/20',
  card_created: 'bg-primary/10 text-primary border-primary/20',
  card_funded: 'bg-primary/10 text-primary border-primary/20',
  solved: 'bg-primary/10 text-primary border-primary/20',
  pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  pending_payment: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  payment_received: 'bg-primary/10 text-primary border-primary/20',
  processing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  awaiting_review: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  under_review: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  waiting_for_user: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  frozen: 'bg-accent/10 text-accent border-accent/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  failed: 'bg-destructive/10 text-destructive border-destructive/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
  canceled: 'bg-muted text-muted-foreground border-border',
  suspended: 'bg-destructive/10 text-destructive border-destructive/20',
  restricted: 'bg-destructive/10 text-destructive border-destructive/20',
  terminated: 'bg-destructive/10 text-destructive border-destructive/20',
  closed: 'bg-muted text-muted-foreground border-border',
  expired: 'bg-muted text-muted-foreground border-border',
  refunded: 'bg-accent/10 text-accent border-accent/20',
  refund_requested: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  open: 'bg-accent/10 text-accent border-accent/20',
  not_submitted: 'bg-muted text-muted-foreground border-border',
  resubmit_required: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
};

export default function StatusBadge({ status, className }) {
  const label = (status || 'unknown').replace(/_/g, ' ');
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border",
      statusColors[status] || 'bg-muted text-muted-foreground border-border',
      className
    )}>
      {label}
    </span>
  );
}
