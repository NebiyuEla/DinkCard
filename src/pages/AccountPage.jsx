import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { useCurrentUser, useKYCStatus } from '@/hooks/useAppData';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getSeededAvatarDataUrl } from '@/lib/avatarSeed';
import { ArrowLeft, KeyRound, LogOut, ShieldCheck, Sparkles, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';

function buildProfileTheme(seed) {
  let hash = 0;
  for (const char of String(seed || 'dink-card')) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const hue = hash % 360;
  return {
    bg: `linear-gradient(135deg, hsl(${hue} 70% 20%), hsl(${(hue + 42) % 360} 80% 36%))`,
    glow: `hsla(${(hue + 42) % 360}, 90%, 60%, 0.22)`
  };
}

function maskIdNumber(value) {
  const clean = String(value || '');
  if (!clean) return 'Not submitted';
  if (clean.length <= 4) return clean;
  return `${'*'.repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}`;
}

export default function AccountPage() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: kyc } = useKYCStatus(user?.email);
  const [form, setForm] = useState({ first_name: '', last_name: '', username: '', phone: '' });
  const [securityDialog, setSecurityDialog] = useState({ open: false, mode: 'enable' });
  const [securityPassword, setSecurityPassword] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [setupPayload, setSetupPayload] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [securityError, setSecurityError] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [motionEnabled, setMotionEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('dinkcard_motion') === 'on';
  });

  useEffect(() => {
    if (!user) return;
    setForm({
      first_name: user.first_name || user.full_name?.split(' ')[0] || '',
      last_name: user.last_name || user.full_name?.split(' ').slice(1).join(' ') || '',
      username: user.username || '',
      phone: user.phone || ''
    });
  }, [user]);

  useEffect(() => {
    if (!setupPayload?.otpauthUrl) {
      setQrCodeDataUrl('');
      return;
    }
    QRCode.toDataURL(setupPayload.otpauthUrl, {
      margin: 1,
      width: 220,
      color: {
        dark: '#d8fff0',
        light: '#0b1220'
      }
    })
      .then(setQrCodeDataUrl)
      .catch(() => setQrCodeDataUrl(''));
  }, [setupPayload]);

  useEffect(() => {
    document.documentElement.classList.toggle('liquid-motion', motionEnabled);
    localStorage.setItem('dinkcard_motion', motionEnabled ? 'on' : 'off');
  }, [motionEnabled]);

  const initials = useMemo(() => {
    const parts = String(`${form.first_name} ${form.last_name}`.trim() || user?.full_name || user?.email || 'DC')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DC';
  }, [form.first_name, form.last_name, user?.full_name, user?.email]);

  const profileTheme = useMemo(() => buildProfileTheme(user?.email || form.username || `${form.first_name}${form.last_name}`), [user?.email, form.username, form.first_name, form.last_name]);
  const avatarUrl = useMemo(
    () => getSeededAvatarDataUrl(user?.id || user?.email || form.username || `${form.first_name}${form.last_name}`, kyc?.gender),
    [user?.id, user?.email, form.username, form.first_name, form.last_name, kyc?.gender]
  );
  const twoFactorEnabled = Boolean(user?.two_factor_enabled);
  const kycLocked = kyc?.status === 'approved';

  const refreshUser = async () => {
    await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
  };

  const resetSecurityState = (nextMode = 'enable') => {
    setSecurityDialog({ open: false, mode: nextMode });
    setSecurityPassword('');
    setSecurityCode('');
    setSetupPayload(null);
    setRecoveryCodes([]);
    setSecurityError('');
  };

  const updateProfile = useMutation({
    mutationFn: () => apiClient.auth.updateMe(form),
    onSuccess: async () => {
      await refreshUser();
      toast.success('Account updated.');
    },
    onError: (error) => toast.error(error.message || 'Could not update account.')
  });

  const setupTwoFactor = useMutation({
    mutationFn: () => apiClient.auth.setupTwoFactor({ password: securityPassword }),
    onSuccess: (result) => {
      setSetupPayload(result);
      setSecurityError('');
      toast.success('Authenticator setup started.');
    },
    onError: (error) => setSecurityError(error.message || 'Could not start 2FA setup.')
  });

  const enableTwoFactor = useMutation({
    mutationFn: () => apiClient.auth.enableTwoFactor({ password: securityPassword, code: securityCode }),
    onSuccess: async (result) => {
      setRecoveryCodes(result.recoveryCodes || []);
      setSetupPayload(null);
      setSecurityCode('');
      setSecurityError('');
      await refreshUser();
      toast.success('Two-factor authentication enabled.');
    },
    onError: (error) => setSecurityError(error.message || 'Could not enable 2FA.')
  });

  const disableTwoFactor = useMutation({
    mutationFn: () => apiClient.auth.disableTwoFactor({ password: securityPassword, code: securityCode }),
    onSuccess: async () => {
      await refreshUser();
      resetSecurityState('enable');
      toast.success('Two-factor authentication disabled.');
    },
    onError: (error) => setSecurityError(error.message || 'Could not disable 2FA.')
  });

  const deleteAccount = useMutation({
    mutationFn: () => apiClient.auth.deleteAccount({ password: deletePassword }),
    onSuccess: async () => {
      toast.success('Account deleted.');
      await apiClient.auth.logout('/');
    },
    onError: (error) => setDeleteError(error.message || 'Could not delete account.')
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-24 lg:pb-0">
      <div className="flex items-center gap-3">
        <Link to="/dashboard">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Account & Security</h1>
          <p className="text-sm text-muted-foreground">Manage your profile, login safety, and account controls.</p>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
        <div className="self-start rounded-3xl border border-border bg-card p-5">
          <div
            className="relative overflow-hidden rounded-[28px] p-5 text-white"
            style={{ backgroundImage: profileTheme.bg, boxShadow: `0 18px 40px ${profileTheme.glow}` }}
          >
            <div className="flex items-start justify-between gap-3">
              <Avatar className="animate-avatar-drift h-16 w-16 rounded-2xl border border-white/20 bg-white/12 backdrop-blur">
                <AvatarImage src={avatarUrl} alt="Profile avatar" className="rounded-2xl object-cover" />
                <AvatarFallback className="rounded-2xl bg-transparent text-lg font-bold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                {twoFactorEnabled ? '2FA Active' : '2FA Off'}
              </div>
            </div>
            <div className="mt-6">
              <p className="text-lg font-semibold">{`${form.first_name} ${form.last_name}`.trim() || user?.full_name || 'Dink Card User'}</p>
              <p className="mt-1 text-sm text-white/80">@{form.username || user?.username || 'set-username'}</p>
              <p className="mt-3 text-xs text-white/70">{user?.email}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Button type="button" variant="outline" onClick={() => apiClient.auth.logout('/')}>
              <LogOut className="mr-2 h-4 w-4" />Sign out
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setDeleteDialogOpen(true);
                setDeletePassword('');
                setDeleteError('');
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />Delete account
            </Button>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Profile</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={form.first_name} disabled={kycLocked} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={form.last_name} disabled={kycLocked} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '') }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} disabled={kycLocked} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
              </div>
            </div>
            {kycLocked && <p className="mt-3 text-xs text-muted-foreground">Your identity details are locked after approved KYC. You can still change password and security settings.</p>}
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
                {updateProfile.isPending ? 'Saving...' : 'Save profile'}
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">KYC & Identity</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-secondary/30 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Status</p>
                <p className="mt-2 font-semibold capitalize">{String(kyc?.status || 'not_started').replace(/_/g, ' ')}</p>
              </div>
              <div className="rounded-2xl border border-border bg-secondary/30 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">ID Type</p>
                <p className="mt-2 font-semibold capitalize">{String(kyc?.id_type || 'not submitted').replace(/_/g, ' ')}</p>
              </div>
              <div className="rounded-2xl border border-border bg-secondary/30 p-4 md:col-span-2">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Address</p>
                <p className="mt-2 text-sm font-medium">
                  {[kyc?.street_address || kyc?.address, kyc?.city, kyc?.state, kyc?.postal_code, kyc?.country].filter(Boolean).join(', ') || 'Not submitted yet'}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-secondary/30 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Date of birth</p>
                <p className="mt-2 font-semibold">{kyc?.date_of_birth || 'Not submitted'}</p>
              </div>
              <div className="rounded-2xl border border-border bg-secondary/30 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">ID Number</p>
                <p className="mt-2 font-mono text-sm font-semibold">{maskIdNumber(kyc?.id_number)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">Two-factor authentication</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Protect your sign-in with a real authenticator app code and recovery codes.
                </p>
              </div>
              <Button
                type="button"
                variant={twoFactorEnabled ? 'outline' : 'default'}
                className={twoFactorEnabled ? '' : 'bg-primary text-primary-foreground'}
                onClick={() => {
                  setSecurityDialog({ open: true, mode: twoFactorEnabled ? 'disable' : 'enable' });
                  setSecurityError('');
                  setSetupPayload(null);
                  setRecoveryCodes([]);
                  setSecurityCode('');
                }}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                {twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-secondary/30 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Status</p>
                <p className="mt-2 font-semibold">{twoFactorEnabled ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div className="rounded-2xl border border-border bg-secondary/30 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Recovery codes</p>
                <p className="mt-2 font-semibold">{user?.remainingRecoveryCodes || 0} left</p>
              </div>
              <div className="rounded-2xl border border-border bg-secondary/30 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Portal access</p>
                <p className="mt-2 font-semibold capitalize">{user?.role || 'user'}</p>
              </div>
            </div>
            <div className="mt-4 text-right">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="outline" onClick={() => setMotionEnabled((current) => !current)}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {motionEnabled ? 'Animations on' : 'Enable animations'}
                </Button>
                <Link to="/forgot-password" className="text-sm text-primary hover:underline">Request password reset</Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={securityDialog.open} onOpenChange={(open) => !open && resetSecurityState(twoFactorEnabled ? 'disable' : 'enable')}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{securityDialog.mode === 'disable' ? 'Disable 2FA' : 'Set up 2FA'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Password confirmation</Label>
              <Input type="password" value={securityPassword} onChange={(event) => setSecurityPassword(event.target.value)} />
            </div>

            {!setupPayload && !recoveryCodes.length && securityDialog.mode !== 'disable' && (
              <Button type="button" onClick={() => setupTwoFactor.mutate()} disabled={!securityPassword || setupTwoFactor.isPending}>
                {setupTwoFactor.isPending ? 'Preparing...' : 'Generate authenticator setup'}
              </Button>
            )}

            {setupPayload && (
              <div className="space-y-4 rounded-2xl border border-border bg-secondary/20 p-4">
                <div className="flex flex-col items-center gap-3 text-center">
                  {qrCodeDataUrl ? (
                    <img src={qrCodeDataUrl} alt="2FA QR code" className="h-52 w-52 rounded-2xl border border-border bg-[#0b1220] p-3" />
                  ) : (
                    <div className="flex h-52 w-52 items-center justify-center rounded-2xl border border-border bg-[#0b1220] text-sm text-muted-foreground">
                      Generating QR...
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Scan with Google Authenticator, Microsoft Authenticator, or Authy.</p>
                </div>
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Manual setup key</p>
                  <p className="mt-1 break-all font-mono text-sm">{setupPayload.secret}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>6-digit code</Label>
                  <Input inputMode="numeric" value={securityCode} onChange={(event) => setSecurityCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
                </div>
              </div>
            )}

            {securityDialog.mode === 'disable' && (
              <div className="space-y-1.5">
                <Label>6-digit code</Label>
                <Input inputMode="numeric" value={securityCode} onChange={(event) => setSecurityCode(event.target.value.replace(/\D/g, '').slice(0, 10))} />
              </div>
            )}

            {recoveryCodes.length > 0 && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <p className="font-semibold">Recovery codes</p>
                <p className="mt-1 text-xs text-muted-foreground">Store these somewhere safe. Each code works once.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {recoveryCodes.map((code) => (
                    <div key={code} className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm">
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {securityError && <p className="text-sm text-destructive">{securityError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => resetSecurityState(twoFactorEnabled ? 'disable' : 'enable')}>Close</Button>
            {setupPayload && (
              <Button type="button" onClick={() => enableTwoFactor.mutate()} disabled={!securityPassword || securityCode.length < 6 || enableTwoFactor.isPending}>
                {enableTwoFactor.isPending ? 'Enabling...' : 'Enable 2FA'}
              </Button>
            )}
            {securityDialog.mode === 'disable' && (
              <Button type="button" variant="destructive" onClick={() => disableTwoFactor.mutate()} disabled={!securityPassword || securityCode.length < 6 || disableTwoFactor.isPending}>
                {disableTwoFactor.isPending ? 'Disabling...' : 'Disable 2FA'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This removes your account, KYC, deposits, cards, support tickets, and notifications from this platform.
            </p>
            <div className="space-y-1.5">
              <Label>Confirm password</Label>
              <Input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
            </div>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => deleteAccount.mutate()} disabled={!deletePassword || deleteAccount.isPending}>
              {deleteAccount.isPending ? 'Deleting...' : 'Delete account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
