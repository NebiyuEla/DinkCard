import React, { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useCurrentUser, useNotifications } from '@/hooks/useAppData';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, ShieldCheck, DollarSign, CreditCard,
  HeadphonesIcon, Settings, FileText, LogOut, BellRing, Volume2, VolumeX
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import TermsModal from '@/components/TermsModal';
import BrandLogo from '@/components/BrandLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { announceNewNotifications, getNotificationPermission, markNotificationsAsSeen, requestDeviceNotificationPermission } from '@/lib/deviceNotifications';

const SUPER_ADMIN_SOUND_KEY = 'dinkcard_superadmin_sounds';

function getAlertsButtonLabel(permission) {
  if (permission === 'granted') return 'Alerts Enabled';
  if (permission === 'denied') return 'Alerts Blocked';
  return 'Enable Alerts';
}

function playSuperAdminTone() {
  if (typeof window === 'undefined') return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.value = 680;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.26);
  setTimeout(() => context.close().catch(() => {}), 400);
}

const nav = [
  { label: 'Overview', path: '/superadmin/dashboard', icon: LayoutDashboard },
  { label: 'Users', path: '/superadmin/users', icon: Users },
  { label: 'KYC', path: '/superadmin/kyc', icon: ShieldCheck },
  { label: 'Deposits', path: '/superadmin/deposits', icon: DollarSign },
  { label: 'Cards', path: '/superadmin/cards', icon: CreditCard },
  { label: 'Tickets', path: '/superadmin/tickets', icon: HeadphonesIcon },
  { label: 'Broadcast', path: '/superadmin/broadcast', icon: BellRing },
  { label: 'Pricing Settings', path: '/superadmin/fees', icon: Settings },
  { label: 'Audit Logs', path: '/superadmin/audit', icon: FileText },
];

export default function SuperAdminLayout() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { data: user } = useCurrentUser();
  const { data: notifications } = useNotifications(user?.email);
  const [permission, setPermission] = useState(() => getNotificationPermission());
  const [soundMuted, setSoundMuted] = useState(() => localStorage.getItem(SUPER_ADMIN_SOUND_KEY) === 'muted');
  const previousNotificationIdsRef = useRef(null);
  const seededNotificationsRef = useRef(false);

  const { data: kycSubs } = useQuery({ queryKey: ['sa-kyc'], queryFn: () => apiClient.entities.KYCSubmission.list('-created_date', 100), refetchInterval: REFRESH.admin });
  const { data: deposits } = useQuery({ queryKey: ['sa-deposits'], queryFn: () => apiClient.entities.Deposit.list('-created_date', 100), refetchInterval: REFRESH.admin });
  const { data: tickets } = useQuery({ queryKey: ['sa-tickets'], queryFn: () => apiClient.entities.SupportTicket.list('-created_date', 100), refetchInterval: REFRESH.admin });

  const pendingKYC = kycSubs?.filter(k => k.status === 'pending')?.length || 0;
  const pendingDeposits = deposits?.filter(d => d.status === 'awaiting_review')?.length || 0;
  const openTickets = tickets?.filter(t => ['open', 'under_review'].includes(t.status))?.length || 0;
  const alertsLabel = getAlertsButtonLabel(permission);

  const badges = {
    '/superadmin/kyc': pendingKYC,
    '/superadmin/deposits': pendingDeposits,
    '/superadmin/tickets': openTickets,
  };

  const handleLogout = () => {
    apiClient.auth.logout('/superadmin');
  };

  const requestAlerts = async () => {
    if (permission === 'granted') return;
    setPermission(await requestDeviceNotificationPermission());
  };

  useEffect(() => {
    localStorage.setItem(SUPER_ADMIN_SOUND_KEY, soundMuted ? 'muted' : 'enabled');
  }, [soundMuted]);

  useEffect(() => {
    if (!user?.email || !window.EventSource) return undefined;
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const events = new EventSource(`${baseUrl}/api/events`, { withCredentials: true });

    events.addEventListener('notification_count', () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', user.email] });
      invalidateOperationalData(queryClient);
    });

    events.onerror = () => {};

    return () => events.close();
  }, [queryClient, user?.email]);

  useEffect(() => {
    if (!user?.email || !notifications?.length) return;
    const unreadIds = new Set(notifications.filter((item) => !item.read && item.id).map((item) => item.id));
    const previousIds = previousNotificationIdsRef.current;
    previousNotificationIdsRef.current = unreadIds;

    if (!seededNotificationsRef.current) {
      seededNotificationsRef.current = true;
      markNotificationsAsSeen(notifications);
      return;
    }

    if (permission === 'granted') announceNewNotifications(notifications);
    else markNotificationsAsSeen(notifications);

    if (!previousIds || soundMuted) return;
    if ([...unreadIds].some((id) => !previousIds.has(id))) playSuperAdminTone();
  }, [notifications, permission, soundMuted, user?.email]);

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur md:hidden">
        <div className="h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandLogo to="/superadmin/dashboard" imageClassName="h-7 w-7 rounded-lg" labelClassName="font-bold text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            {permission !== 'unsupported' && (
              <Button
                variant="outline"
                size="sm"
                className="px-2"
                onClick={requestAlerts}
                aria-label="Enable admin device alerts"
                title={alertsLabel}
              >
                <BellRing className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              onClick={() => setSoundMuted((current) => !current)}
              aria-label={soundMuted ? 'Turn admin sounds on' : 'Turn admin sounds off'}
            >
              {soundMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>Sign Out</Button>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-3 pb-3">
          {nav.map(item => {
            const badge = badges[item.path] || 0;
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className="shrink-0">
                <div className={cn(
                  'flex min-h-[40px] min-w-[104px] items-center justify-center gap-2 rounded-xl px-2.5 py-2 text-[11px] font-medium transition-all',
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}>
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label.replace('Pricing Settings', 'Pricing').replace('Audit Logs', 'Audit')}</span>
                  {badge > 0 && <span className="rounded-full bg-yellow-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>}
                </div>
              </Link>
            );
          })}
        </nav>
      </header>
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-dvh w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-card md:flex">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-border">
          <BrandLogo to="/superadmin/dashboard" imageClassName="h-8 w-8 rounded-lg" showLabel={false} />
          <div>
            <p className="font-bold text-sm leading-tight">Dink Card</p>
            <p className="text-[10px] text-muted-foreground">Super Admin</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-hidden px-3 py-3">
          {nav.map(item => {
            const badge = badges[item.path] || 0;
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}>
                <div className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}>
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="w-5 h-5 rounded-full bg-yellow-500 text-[10px] font-bold text-white flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-border p-2">
          <ThemeToggle className="mb-1.5 w-full justify-start" />
          {permission !== 'unsupported' && (
            <Button
              variant="outline"
              size="sm"
              className="mb-1.5 h-8 w-full justify-start text-xs"
              onClick={requestAlerts}
            >
              <BellRing className="mr-2 h-4 w-4" />
              {alertsLabel}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mb-1.5 h-8 w-full justify-start text-xs text-muted-foreground"
            onClick={() => setSoundMuted((current) => !current)}
          >
            {soundMuted ? <VolumeX className="mr-2 h-4 w-4" /> : <Volume2 className="mr-2 h-4 w-4" />}
            {soundMuted ? 'Sounds Off' : 'Sounds On'}
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-full justify-start text-xs text-muted-foreground hover:text-destructive" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 overflow-x-hidden md:ml-56">
        <div className="mx-auto w-full max-w-6xl space-y-4 px-3 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 md:p-6">
          {permission !== 'granted' && permission !== 'unsupported' && (
            <div className="rounded-2xl border border-primary/20 bg-primary/8 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Enable admin alerts</p>
                  <p className="text-xs text-muted-foreground">
                    Keep browser alerts on so tickets, deposits, KYC updates, and provider changes appear immediately.
                  </p>
                </div>
                <Button className="w-full sm:w-auto" onClick={requestAlerts}>
                  <BellRing className="mr-2 h-4 w-4" />
                  {alertsLabel}
                </Button>
              </div>
            </div>
          )}
          <Outlet />
        </div>
      </main>
      <TermsModal user={user} />
    </div>
  );
}

