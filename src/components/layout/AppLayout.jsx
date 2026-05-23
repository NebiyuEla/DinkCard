import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useCurrentUser, useNotifications } from '@/hooks/useAppData';
import TermsModal from '@/components/TermsModal';

export default function AppLayout() {
  const { data: user } = useCurrentUser();
  const { data: notifications } = useNotifications(user?.email);
  const unreadCount = notifications?.filter(n => !n.read)?.length || 0;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar user={user} unreadCount={unreadCount} />
      <main className="lg:ml-64 min-h-screen transition-all duration-300">
        <div className="p-4 pb-24 lg:pb-8 lg:pt-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
      <TermsModal user={user} />
    </div>
  );
}
