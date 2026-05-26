import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Sidebar from './Sidebar';
import { useCurrentUser, useNotifications } from '@/hooks/useAppData';
import TermsModal from '@/components/TermsModal';
import { announceNewNotifications, getNotificationPermission, markNotificationsAsSeen } from '@/lib/deviceNotifications';
import { invalidateOperationalData } from '@/lib/realtime';

export default function AppLayout() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: notifications } = useNotifications(user?.email);
  const unreadCount = notifications?.filter(n => !n.read)?.length || 0;

  useEffect(() => {
    document.documentElement.classList.toggle('liquid-motion', localStorage.getItem('dinkcard_motion') === 'on');
  }, []);

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
    if (getNotificationPermission() !== 'granted') {
      markNotificationsAsSeen(notifications.filter((item) => item.read));
      return;
    }
    announceNewNotifications(notifications);
  }, [notifications, user?.email]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar user={user} unreadCount={unreadCount} />
      <main className="min-h-screen transition-all duration-300 lg:ml-64">
        <div className="mx-auto w-full max-w-7xl px-4 pb-[calc(6.75rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] sm:px-5 lg:px-8 lg:pb-8 lg:pt-6">
          <Outlet />
        </div>
      </main>
      <TermsModal user={user} />
    </div>
  );
}
