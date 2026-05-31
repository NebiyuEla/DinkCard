import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, BadgeCheck, CreditCard, DollarSign, Eye, MoreHorizontal, ShieldCheck, ShieldOff, Trash2, UserCog, UserMinus } from 'lucide-react';
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
import FilePreview from '@/components/FilePreview';
import SecretInput from '@/components/SecretInput';

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
      title: 'Set admin role',
      description: 'This gives the user broader admin access. Use only for trusted staff.',
      confirm: 'Set Admin',
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
    reset_2fa: {
      title: 'Reset Google Authenticator',
      description: 'This disables two-factor authentication for this account so the user can set it up again.',
      confirm: 'Reset 2FA',
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

function UserActions({ user, onAction, onView }) {
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
        <DropdownMenuItem onClick={() => onView(user)}><Eye className="h-4 w-4" /> View details</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction(user, 'add_money')}><DollarSign className="h-4 w-4" /> Add money</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction(user, 'set_balance')}><DollarSign className="h-4 w-4" /> Set usable balance</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction(user, 'pass_kyc')}><BadgeCheck className="h-4 w-4" /> Pass KYC</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction(user, 'manual_card')}><CreditCard className="h-4 w-4" /> Create Bitnob card</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction(user, isAdmin ? 'remove_admin' : 'make_admin')}>
          {isAdmin ? <UserMinus className="h-4 w-4" /> : <UserCog className="h-4 w-4" />} {isAdmin ? 'Remove admin' : 'Make admin'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction(user, 'reset_2fa')}>
          <ShieldOff className="h-4 w-4" /> Reset 2FA
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

const roleRank = {
  user: 0,
  support: 1,
  support_response: 1,
  kyc_checker: 2,
  admin: 3,
  superadmin: 99
};

function displayRole(role) {
  return role === 'support_response' ? 'support' : role || 'user';
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
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
  const { data: kycSubmissions } = useQuery({
    queryKey: ['admin-kyc'],
    queryFn: () => apiClient.entities.KYCSubmission.list('-updated_date', 200),
    refetchInterval: REFRESH.admin
  });
  const walletByUser = new Map((wallets?.wallets || []).map((wallet) => [wallet.user_id, wallet]));
  const latestKycByUser = new Map();
  for (const submission of (kycSubmissions || [])) {
    if (!latestKycByUser.has(submission.user_id)) latestKycByUser.set(submission.user_id, submission);
  }

  const [pendingAction, setPendingAction] = useState(null);
  const [detailUser, setDetailUser] = useState(null);
  const [reason, setReason] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualCard, setManualCard] = useState({ nickname: 'Virtual Card', balance: '', lastFour: '' });
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [staffForm, setStaffForm] = useState({ fullName: '', email: '', username: '', password: '', role: 'support' });
  const allVisibleUsers = (users || [])
    .filter((user) => user.role !== 'superadmin')
    .sort((a, b) => {
      const rank = (roleRank[a.role] ?? 0) - (roleRank[b.role] ?? 0);
      if (rank !== 0) return rank;
      return new Date(b.created_date || b.created_at || 0) - new Date(a.created_date || a.created_at || 0);
    });
  const tabs = [
    { id: 'all', label: 'Total', count: allVisibleUsers.length },
    { id: 'active', label: 'Active', count: allVisibleUsers.filter((user) => (user.account_status || 'active') === 'active' && !['support', 'support_response', 'kyc_checker', 'admin'].includes(user.role)).length },
    { id: 'suspended', label: 'Suspended', count: allVisibleUsers.filter((user) => (user.account_status || 'active') !== 'active').length },
    { id: 'admin', label: 'Admin', count: allVisibleUsers.filter((user) => ['support', 'support_response', 'kyc_checker', 'admin'].includes(user.role)).length }
  ];
  const visibleUsers = allVisibleUsers.filter((user) => {
    if (activeTab === 'active') return (user.account_status || 'active') === 'active' && !['support', 'support_response', 'kyc_checker', 'admin'].includes(user.role);
    if (activeTab === 'suspended') return (user.account_status || 'active') !== 'active';
    if (activeTab === 'admin') return ['support', 'support_response', 'kyc_checker', 'admin'].includes(user.role);
    return true;
  });

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
      if (action === 'reset_2fa') return apiClient.admin.users.resetTwoFactor(user.id, actionReason);
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

  const createStaff = useMutation({
    mutationFn: () => apiClient.admin.users.createStaff(staffForm),
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      toast.success('Staff account created.');
      setStaffDialogOpen(false);
      setStaffForm({ fullName: '', email: '', username: '', password: '', role: 'support' });
    },
    onError: (error) => toast.error(error.message || 'Could not create staff account.')
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Users ({visibleUsers.length})</h2>
          <p className="text-xs text-muted-foreground">Latest registrations appear first inside each role group. Staff roles stay grouped after users.</p>
        </div>
        <Button type="button" onClick={() => setStaffDialogOpen(true)}>
          <UserCog className="mr-2 h-4 w-4" />Add admin or support
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all ${activeTab === tab.id ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
          >
            {tab.label} <span className="ml-1 font-mono">{tab.count}</span>
          </button>
        ))}
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User ID</th>
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
              {visibleUsers.map(user => (
                <tr key={user.id} className="hover:bg-secondary/20">
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{user.id}</td>
                  <td className="px-4 py-3 font-medium">{user.full_name || '-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3"><StatusBadge status={displayRole(user.role)} /></td>
                  <td className="px-4 py-3 font-mono text-primary">${Number(walletByUser.get(user.email)?.available_balance || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <StatusBadge status={user.account_status || 'active'} />
                      {user.restricted_reason && <p className="max-w-[220px] truncate text-[11px] text-muted-foreground">{user.restricted_reason}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{user.created_date ? format(new Date(user.created_date), 'MMM d, yyyy') : ''}</td>
                  <td className="px-4 py-3"><UserActions user={user} onAction={openAction} onView={setDetailUser} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-border">
          {visibleUsers.map(user => (
            <div key={user.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{user.full_name || 'Unassigned name'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  <p className="text-[10px] font-mono text-muted-foreground/80">{user.id}</p>
                </div>
                <StatusBadge status={user.account_status || 'active'} className="shrink-0" />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge status={displayRole(user.role)} />
                <span className="font-mono text-primary">${Number(walletByUser.get(user.email)?.available_balance || 0).toFixed(2)}</span>
                <span>{user.created_date ? format(new Date(user.created_date), 'MMM d, yyyy') : ''}</span>
              </div>
              {user.restricted_reason && <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{user.restricted_reason}</p>}
              <UserActions user={user} onAction={openAction} onView={setDetailUser} />
            </div>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(detailUser)} onOpenChange={(open) => !open && setDetailUser(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>User details</DialogTitle>
            <DialogDescription>Review the account, KYC profile, and uploaded documents for this user.</DialogDescription>
          </DialogHeader>
          {detailUser && (() => {
            const kyc = latestKycByUser.get(detailUser.email);
            return (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-secondary/30 p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Account</p>
                    <p className="mt-2 font-semibold">{detailUser.full_name || '-'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{detailUser.email}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{detailUser.id}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/30 p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Role</p>
                    <p className="mt-2 font-semibold capitalize">{String(displayRole(detailUser.role)).replace(/_/g, ' ')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{detailUser.username ? `@${detailUser.username}` : 'No username yet'}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/30 p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Usable balance</p>
                    <p className="mt-2 font-semibold text-primary">${Number(walletByUser.get(detailUser.email)?.available_balance || 0).toFixed(2)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{detailUser.phone || 'No phone saved'}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold">KYC profile</h3>
                    <StatusBadge status={kyc?.status || 'not_started'} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div><span className="text-muted-foreground">First name:</span> {kyc?.first_name || detailUser.first_name || '-'}</div>
                    <div><span className="text-muted-foreground">Last name:</span> {kyc?.last_name || detailUser.last_name || '-'}</div>
                    <div><span className="text-muted-foreground">Date of birth:</span> {kyc?.date_of_birth || '-'}</div>
                    <div><span className="text-muted-foreground">ID type:</span> <span className="capitalize">{String(kyc?.id_type || '-').replace(/_/g, ' ')}</span></div>
                    <div><span className="text-muted-foreground">ID number:</span> <span className="font-mono">{kyc?.id_number || '-'}</span></div>
                    <div><span className="text-muted-foreground">Country:</span> {kyc?.country || 'Ethiopia'}</div>
                    <div className="md:col-span-2"><span className="text-muted-foreground">Address:</span> {[kyc?.street_address || kyc?.address, kyc?.city, kyc?.state, kyc?.postal_code].filter(Boolean).join(', ') || '-'}</div>
                    {kyc?.rejection_reason && <div className="md:col-span-2 rounded-xl border border-orange-500/20 bg-orange-500/10 p-3 text-sm text-orange-600">{kyc.rejection_reason}</div>}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div><Label className="mb-2 block text-xs uppercase tracking-[0.14em] text-muted-foreground">Front ID</Label><div className="rounded-xl border border-border p-3"><FilePreview url={kyc?.front_id_url} label="Front ID" /></div></div>
                    <div><Label className="mb-2 block text-xs uppercase tracking-[0.14em] text-muted-foreground">Selfie</Label><div className="rounded-xl border border-border p-3"><FilePreview url={kyc?.selfie_url} label="Selfie" /></div></div>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

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

      <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create staff account</DialogTitle>
            <DialogDescription>Create a dedicated login for support, KYC review, admin, or full superadmin access.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={staffForm.fullName} onChange={(event) => setStaffForm((current) => ({ ...current, fullName: event.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={staffForm.email} onChange={(event) => setStaffForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input value={staffForm.username} onChange={(event) => setStaffForm((current) => ({ ...current, username: event.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Password</Label>
                <SecretInput value={staffForm.password} onChange={(event) => setStaffForm((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <select
                  value={staffForm.role}
                  onChange={(event) => setStaffForm((current) => ({ ...current, role: event.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="support">Support</option>
                  <option value="kyc_checker">KYC Checker</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Full Super Admin</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStaffDialogOpen(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={() => createStaff.mutate()}
              disabled={!staffForm.fullName || !staffForm.email || !staffForm.username || !staffForm.password || createStaff.isPending}
            >
              {createStaff.isPending ? 'Creating...' : 'Create account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
