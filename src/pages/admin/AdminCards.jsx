import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from '@/components/ui-custom/StatusBadge';

function getCardActionCopy(action, card) {
  if (!action || !card) return {};
  const copy = {
    suspend: {
      title: 'Suspend card',
      description: 'This freezes the card so it cannot be used until it is reactivated.',
      confirm: 'Suspend Card',
      variant: 'destructive',
      requiresReason: true
    },
    activate: {
      title: 'Reactivate card',
      description: 'This marks the card active again and syncs with the provider when a provider card ID exists.',
      confirm: 'Reactivate Card',
      variant: 'default',
      requiresReason: false
    },
    terminate: {
      title: 'Terminate card',
      description: `This closes ${card.card_nickname || card.id}. Terminated cards cannot be reactivated from this screen.`,
      confirm: 'Terminate Card',
      variant: 'destructive',
      requiresReason: true
    }
  };
  return copy[action] || {};
}

function CardActions({ card, onAction }) {
  if (card.status === 'terminated') {
    return <span className="text-xs text-muted-foreground">No actions</span>;
  }

  const isFrozen = card.status === 'frozen';

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant={isFrozen ? 'default' : 'outline'}
        onClick={() => onAction(card, isFrozen ? 'activate' : 'suspend')}
      >
        {isFrozen ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
        {isFrozen ? 'Reactivate' : 'Suspend'}
      </Button>
      <Button type="button" size="sm" variant="destructive" onClick={() => onAction(card, 'terminate')}>
        <Trash2 className="w-3.5 h-3.5" />
        Terminate
      </Button>
    </div>
  );
}

export default function AdminCards() {
  const queryClient = useQueryClient();
  const { data: cards } = useQuery({
    queryKey: ['admin-cards'],
    queryFn: () => apiClient.entities.VirtualCard.list('-created_date', 100),
    refetchInterval: REFRESH.admin
  });

  const [pendingAction, setPendingAction] = useState(null);
  const [reason, setReason] = useState('');

  const actionCopy = getCardActionCopy(pendingAction?.action, pendingAction?.card);
  const reasonMissing = actionCopy.requiresReason && !reason.trim();

  const cardAction = useMutation({
    mutationFn: async ({ card, action, reason: actionReason }) => {
      if (action === 'suspend') return apiClient.admin.cards.suspend(card.id, actionReason);
      if (action === 'activate') return apiClient.admin.cards.activate(card.id, actionReason);
      if (action === 'terminate') return apiClient.admin.cards.terminate(card.id, actionReason);
      throw new Error('Unsupported card action');
    },
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      toast.success('Card action completed');
      setPendingAction(null);
      setReason('');
    },
    onError: (error) => toast.error(error.message || 'Card action failed')
  });

  const openAction = (card, action) => {
    setPendingAction({ card, action });
    setReason('');
  };

  const confirmAction = () => {
    if (!pendingAction) return;
    cardAction.mutate({ ...pendingAction, reason: reason.trim() });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Cards ({cards?.length || 0})</h2>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nickname</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last 4</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Balance</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(cards || []).map((card) => (
                <tr key={card.id} className="hover:bg-secondary/20">
                  <td className="px-4 py-3 text-xs">{card.user_id}</td>
                  <td className="px-4 py-3 font-medium">{card.card_nickname}</td>
                  <td className="px-4 py-3 font-mono text-xs">**** {card.last_four || '----'}</td>
                  <td className="px-4 py-3 text-right font-mono">${(card.balance || 0).toFixed(2)}</td>
                  <td className="px-4 py-3"><StatusBadge status={card.status} className="text-[10px]" /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{card.created_date ? format(new Date(card.created_date), 'MMM d') : ''}</td>
                  <td className="px-4 py-3"><CardActions card={card} onAction={openAction} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-border">
          {(cards || []).map((card) => (
            <div key={card.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{card.card_nickname}</p>
                  <p className="text-xs text-muted-foreground truncate">{card.user_id}</p>
                </div>
                <StatusBadge status={card.status} className="text-[10px] shrink-0" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Last 4</span><p className="font-mono">**** {card.last_four || '----'}</p></div>
                <div><span className="text-muted-foreground">Balance</span><p className="font-mono">${(card.balance || 0).toFixed(2)}</p></div>
              </div>
              <CardActions card={card} onAction={openAction} />
            </div>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(pendingAction)} onOpenChange={(open) => !open && setPendingAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionCopy.variant === 'destructive' && <AlertTriangle className="w-5 h-5 text-destructive" />}
              {actionCopy.title}
            </DialogTitle>
            <DialogDescription>{actionCopy.description}</DialogDescription>
          </DialogHeader>
          {pendingAction && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-secondary/20 p-3 text-sm">
                <p className="font-medium">{pendingAction.card.card_nickname || pendingAction.card.id}</p>
                <p className="text-xs text-muted-foreground">{pendingAction.card.user_id}</p>
              </div>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={actionCopy.requiresReason ? 'Required reason for audit log and provider/support review...' : 'Optional internal note...'}
                rows={3}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingAction(null)}>Cancel</Button>
            <Button
              type="button"
              variant={actionCopy.variant || 'default'}
              onClick={confirmAction}
              disabled={reasonMissing || cardAction.isPending}
            >
              {cardAction.isPending ? 'Processing...' : actionCopy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
