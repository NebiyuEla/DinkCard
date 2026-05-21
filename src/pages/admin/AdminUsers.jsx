import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, ShieldCheck, ShieldOff, Trash2, UserCog, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from '@/components/ui-custom/StatusBadge';

function getActionCopy(action, user) {
  if (!action || !user) return {};
  const copy = {
    suspend: {
      title: 'Suspend user',
      description: 'This immediately blocks sign-in and protected platform actions for this account.',
      confirm: 'Suspend User',
      variant: 'destructive',
      requiresReason: true
    },
    activate: {
      title: 'Restore user',
      description: 'This restores access for the selected account.',
      confirm: 'Restore User',
      variant: 'default',
      requiresReason: false
    },
    make_admin: {
      title: 'Make admin',
      description: 'This gives the user limited admin access. Use only for trusted staff.',
      confirm: 'Make Admin',
      variant: 'default',
      requiresReason: true
    },
    remove_admin: {
      title: 'Remove admin access',
      description: 'This returns the account to normal user permissions.',
      confirm: 'Remove Admin',
      variant: 'outline',
      requiresReason: true
    },
    delete: {
      title: 'Delete user',
      description: `This permanently removes ${user.email}, their wallet records, KYC records, deposits, support tickets, cards, and uploaded files from this platform.`,
      confirm: 'Delete User',
      variant: 'destructive',
      requiresReason: true
    }
  };
  return copy[action] || {};
}

function UserActions({ user, onAction }) {
  if (user.role === 'superadmin') {
    return <span className="text-xs text-muted-foreground">Owner protected</span>;
  }

  const isActive = (user.account_status || 'active') === 'active';
  const isAdmin = user.role === 'admin';

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant={isActive ? 'outline' : 'default'}
        onClick={() => onAction(user, isActive ? 'suspend' : 'activate')}
      >
        {isActive ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
        {isActive ? 'Suspend' : 'Restore'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onAction(user, isAdmin ? 'remove_admin' : 'make_admin')}
      >
        {isAdmin ? <UserMinus className="w-3.5 h-3.5" /> : <UserCog className="w-3.5 h-3.5" />}
        {isAdmin ? 'Demote' : 'Make Admin'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={() => onAction(user, 'delete')}
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </Button>
    </div>
  );
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.entities.User.list('-created_date', 100),
    refetchInterval: REFRESH.admin
  });

  const [pendingAction, setPendingAction] = useState(null);
  const [reason, setReason] = useState('');

  const actionCopy = getActionCopy(pendingAction?.action, pendingAction?.user);
  const reasonMissing = actionCopy.requiresReason && !reason.trim();

  const userAction = useMutation({
    mutationFn: async ({ user, action, reason: actionReason }) => {
      if (action === 'suspend') return apiClient.admin.users.suspend(user.id, actionReason);
      if (action === 'activate') return apiClient.admin.users.activate(user.id);
      if (action === 'make_admin') return apiClient.admin.users.setRole(user.id, 'admin', actionReason);
      if (action === 'remove_admin') return apiClient.admin.users.setRole(user.id, 'user', actionReason);
      if (action === 'delete') return apiClient.admin.users.delete(user.id, actionReason);
      throw new Error('Unsupported action');
    },
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      toast.success('User action completed');
      setPendingAction(null);
      setReason('');
    },
    onError: (error) => toast.error(error.message || 'User action failed')
  });

  const openAction = (user, action) => {
    setPendingAction({ user, action });
    setReason('');
  };

  const confirmAction = () => {
    if (!pendingAction) return;
    userAction.mutate({ ...pendingAction, reason: reason.trim() });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Users ({users?.length || 0})</h2>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Account</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Joined</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(users || []).map(user => (
                <tr key={user.id} className="hover:bg-secondary/20">
                  <td className="px-4 py-3 font-medium">{user.full_name || '-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3"><StatusBadge status={user.role || 'user'} /></td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <StatusBadge status={user.account_status || 'active'} />
                      {user.restricted_reason && <p className="max-w-[220px] truncate text-[11px] text-muted-foreground">{user.restricted_reason}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{user.created_date ? format(new Date(user.created_date), 'MMM d, yyyy') : ''}</td>
                  <td className="px-4 py-3"><UserActions user={user} onAction={openAction} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-border">
          {(users || []).map(user => (
            <div key={user.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{user.full_name || 'Unassigned name'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <StatusBadge status={user.account_status || 'active'} className="shrink-0" />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge status={user.role || 'user'} />
                <span>{user.created_date ? format(new Date(user.created_date), 'MMM d, yyyy') : ''}</span>
              </div>
              {user.restricted_reason && <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{user.restricted_reason}</p>}
              <UserActions user={user} onAction={openAction} />
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
                <p className="font-medium">{pendingAction.user.full_name || pendingAction.user.email}</p>
                <p className="text-xs text-muted-foreground">{pendingAction.user.email}</p>
              </div>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={actionCopy.requiresReason ? 'Required reason for audit log and support history...' : 'Optional internal note...'}
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
              disabled={reasonMissing || userAction.isPending}
            >
              {userAction.isPending ? 'Processing...' : actionCopy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
