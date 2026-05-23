import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, BadgeCheck, CreditCard, DollarSign, MoreHorizontal, ShieldCheck, ShieldOff, Trash2, UserCog, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
    add_money: {
      title: 'Add money',
      description: 'This manually credits the user available service balance. Use only after internal verification.',
      confirm: 'Add Money',
      variant: 'default',
      requiresReason: true
    },
    set_balance: {
      title: 'Set usable balance',
      description: 'This sets the user available service balance to an exact USD amount. Owner-only action.',
      confirm: 'Set Balance',
      variant: 'default',
      requiresReason: true
    },
    pass_kyc: {
      title: 'Pass KYC',
      description: 'This manually marks the user KYC as approved.',
      confirm: 'Pass KYC',
      variant: 'default',
      requiresReason: true
    },
    manual_card: {
      title: 'Create Bitnob card',
      description: 'This requests a real provider-backed virtual card for the selected user and deducts their service balance.',
      confirm: 'Create Bitnob Card',
      variant: 'default',
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-9 min-w-[104px] justify-between">
          Actions <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onAction(user, 'add_money')}><DollarSign className="h-4 w-4" /> Add money</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction(user, 'set_balance')}><DollarSign className="h-4 w-4" /> Set usable balance</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction(user, 'pass_kyc')}><BadgeCheck className="h-4 w-4" /> Pass KYC</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction(user, 'manual_card')}><CreditCard className="h-4 w-4" /> Create Bitnob card</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction(user, isAdmin ? 'remove_admin' : 'make_admin')}>
          {isAdmin ? <UserMinus className="h-4 w-4" /> : <UserCog className="h-4 w-4" />} {isAdmin ? 'Remove admin' : 'Make admin'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction(user, isActive ? 'suspend' : 'activate')}>
          {isActive ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />} {isActive ? 'Suspend user' : 'Restore user'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction(user, 'delete')}>
          <Trash2 className="h-4 w-4" /> Delete user
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.entities.User.list('-created_date', 100),
    refetchInterval: REFRESH.admin
  });
  const { data: wallets } = useQuery({
    queryKey: ['admin-wallet-summary'],
    queryFn: apiClient.admin.walletSummary,
    refetchInterval: REFRESH.admin
  });
  const walletByUser = new Map((wallets?.wallets || []).map((wallet) => [wallet.user_id, wallet]));

  const [pendingAction, setPendingAction] = useState(null);
  const [reason, setReason] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualCard, setManualCard] = useState({ nickname: 'Virtual Card', balance: '', lastFour: '' });

  const actionCopy = getActionCopy(pendingAction?.action, pendingAction?.user);
  const reasonMissing = actionCopy.requiresReason && !reason.trim();
  const amountMissing = ['add_money', 'set_balance'].includes(pendingAction?.action) && (
    !Number.isFinite(Number(manualAmount)) ||
    (pendingAction?.action === 'add_money' ? Number(manualAmount) <= 0 : Number(manualAmount) < 0)
  );
  const cardBalanceInvalid = pendingAction?.action === 'manual_card' && (!Number.isFinite(Number(manualCard.balance || 0)) || Number(manualCard.balance || 0) < 0);

  const userAction = useMutation({
    mutationFn: async ({ user, action, reason: actionReason }) => {
      if (action === 'suspend') return apiClient.admin.users.suspend(user.id, actionReason);
      if (action === 'activate') return apiClient.admin.users.activate(user.id);
      if (action === 'make_admin') return apiClient.admin.users.setRole(user.id, 'admin', actionReason);
      if (action === 'remove_admin') return apiClient.admin.users.setRole(user.id, 'user', actionReason);
      if (action === 'add_money') return apiClient.admin.users.addMoney(user.id, { amount: Number(manualAmount), reason: actionReason });
      if (action === 'set_balance') return apiClient.admin.users.setBalance(user.id, { amount: Number(manualAmount), reason: actionReason });
      if (action === 'pass_kyc') return apiClient.admin.users.passKyc(user.id, { reason: actionReason });
      if (action === 'manual_card') {
        return apiClient.admin.users.createManualCard(user.id, {
          nickname: manualCard.nickname || 'Virtual Card',
          fundingAmount: Number(manualCard.balance || 0),
          lastFour: manualCard.lastFour,
          reason: actionReason
        });
      }
      if (action === 'delete') return apiClient.admin.users.delete(user.id, actionReason);
      throw new Error('Unsupported action');
    },
    onSuccess: (result) => {
      invalidateOperationalData(queryClient);
      if (result?.bitnob_warning) {
        toast.warning(`User action completed, but Bitnob was not created: ${result.bitnob_warning}`);
      } else if (result?.bitnob_customer?.bitnob_customer_id) {
        toast.success('User action completed and Bitnob customer is connected');
      } else {
        toast.success('User action completed');
      }
      setPendingAction(null);
      setReason('');
      setManualAmount('');
      setManualCard({ nickname: 'Virtual Card', balance: '', lastFour: '' });
    },
    onError: (error) => toast.error(error.message || 'User action failed')
  });

  const openAction = (user, action) => {
    setPendingAction({ user, action });
    setReason('');
    setManualAmount('');
    setManualCard({ nickname: 'Virtual Card', balance: '', lastFour: '' });
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Usable $</th>
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
                  <td className="px-4 py-3 font-mono text-primary">${Number(walletByUser.get(user.email)?.available_balance || 0).toFixed(2)}</td>
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
                <span className="font-mono text-primary">${Number(walletByUser.get(user.email)?.available_balance || 0).toFixed(2)}</span>
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
              {['add_money', 'set_balance'].includes(pendingAction.action) && (
                <div className="space-y-1.5">
                  <Label className="text-sm">{pendingAction.action === 'set_balance' ? 'New usable balance in USD' : 'Amount in USD'}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualAmount}
                    onChange={(event) => setManualAmount(event.target.value)}
                    placeholder="25.00"
                  />
                </div>
              )}
              {pendingAction.action === 'manual_card' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5 sm:col-span-3">
                    <Label className="text-sm">Card nickname</Label>
                    <Input
                      value={manualCard.nickname}
                      onChange={(event) => setManualCard((current) => ({ ...current, nickname: event.target.value }))}
                      placeholder="Virtual Card"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-sm">Funding amount</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualCard.balance}
                      onChange={(event) => setManualCard((current) => ({ ...current, balance: event.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Last 4</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      value={manualCard.lastFour}
                      onChange={(event) => setManualCard((current) => ({ ...current, lastFour: event.target.value.replace(/\D/g, '').slice(0, 4) }))}
                      placeholder="4242"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingAction(null)}>Cancel</Button>
            <Button
              type="button"
              variant={actionCopy.variant || 'default'}
              onClick={confirmAction}
              disabled={reasonMissing || amountMissing || cardBalanceInvalid || userAction.isPending}
            >
              {userAction.isPending ? 'Processing...' : actionCopy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
