import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Sidebar from './Sidebar';
import { useCurrentUser, useNotifications } from '@/hooks/useAppData';
import TermsModal from '@/components/TermsModal';
import { announceNewNotifications, getNotificationPermission, markNotificationsAsSeen } from '@/lib/deviceNotifications';
import { invalidateOperationalData } from '@/lib/realtime';
import { cn } from '@/lib/utils';

const SIDEBAR_COLLAPSED_KEY = 'dinkcard_sidebar_collapsed';

export default function AppLayout() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { data: user } = useCurrentUser();
  const { data: notifications } = useNotifications(user?.email);
  const unreadCount = notifications?.filter(n => !n.read)?.length || 0;
  const seededNotificationsRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });

  useEffect(() => {
    if (!user?.email || !window.EventSource) return undefined;
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const events = new EventSource(`${baseUrl}/api/events`, { withCredentials: true });

    events.addEventListener('notification_count', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user.email] });
      invalidateOperationalData(queryClient);
    });

    events.onerror = () => {};

    return () => events.close();
  }, [queryClient, user?.email]);

  useEffect(() => {
    if (!user?.email || !notifications?.length) return;
    if (!seededNotificationsRef.current) {
      seededNotificationsRef.current = true;
      markNotificationsAsSeen(notifications);
      return;
    }
    if (getNotificationPermission() !== 'granted') {
      markNotificationsAsSeen(notifications);
      return;
    }
    announceNewNotifications(notifications);
  }, [notifications, user?.email]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar user={user} unreadCount={unreadCount} onCollapsedChange={setSidebarCollapsed} />
      <main className={cn('min-h-screen transition-[margin] duration-300', sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-64')}>
        <div className="mx-auto w-full max-w-7xl px-4 pb-[calc(6.75rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] sm:px-5 lg:px-8 lg:pb-8 lg:pt-6">
          <Outlet />
        </div>
      </main>
      <TermsModal user={user} />
    </div>
  );
}
