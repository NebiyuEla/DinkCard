import React, { useState } from 'react';
import { useCurrentUser, useNotifications } from '@/hooks/useAppData';
import { apiClient } from '@/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/ui-custom/EmptyState';
import { Bell, CheckCheck, CreditCard, DollarSign, ShieldCheck, HeadphonesIcon, AlertTriangle, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getNotificationPermission, requestDeviceNotificationPermission } from '@/lib/deviceNotifications';
import FilePreview from '@/components/FilePreview';

const typeIcons = {
  deposit: DollarSign,
  kyc: ShieldCheck,
  card: CreditCard,
  support: HeadphonesIcon,
  security: AlertTriangle,
  system: Settings,
  referral: DollarSign,
  broadcast: Bell,
  wallet: DollarSign
};

export default function NotificationsPage() {
  const { data: user } = useCurrentUser();
  const { data: notifications } = useNotifications(user?.email);
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState(() => getNotificationPermission());

  const markRead = useMutation({
    mutationFn: (id) => apiClient.notifications.markRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notifications', user?.email] });
      const previous = queryClient.getQueryData(['notifications', user?.email]);
      queryClient.setQueryData(['notifications', user?.email], (current = []) => current.map((item) => item.id === id ? { ...item, read: 1 } : item));
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(['notifications', user?.email], context.previous);
      toast.error(error.message || 'Could not mark notification read');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications', user?.email] })
  });

  const markAllRead = useMutation({
    mutationFn: apiClient.notifications.markAllRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications', user?.email] });
      const previous = queryClient.getQueryData(['notifications', user?.email]);
      queryClient.setQueryData(['notifications', user?.email], (current = []) => current.map((item) => ({ ...item, read: 1 })));
      return { previous };
    },
    onSuccess: (result) => toast.success(result.updated ? 'All notifications marked read' : 'No unread notifications'),
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['notifications', user?.email], context.previous);
      toast.error(error.message || 'Could not mark all read');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications', user?.email] })
  });

  const unreadCount = notifications?.filter(n => !n.read)?.length || 0;
  const alertsLabel =
    permission === 'granted'
      ? 'Alerts Enabled'
      : permission === 'denied'
        ? 'Alerts Blocked'
        : 'Enable Alerts';

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:w-auto sm:items-center">
          {permission !== 'unsupported' && (
            <Button
              variant="outline"
              size="sm"
              className="w-full whitespace-normal text-center leading-tight sm:w-auto sm:whitespace-nowrap"
              onClick={async () => {
                if (permission === 'granted') {
                  toast.success('Device alerts are already enabled.');
                  return;
                }
                const result = await requestDeviceNotificationPermission();
                setPermission(result);
                if (result === 'granted') toast.success('Device alerts enabled.');
                else toast.error(result === 'denied' ? 'Alerts are blocked in this browser. Allow notifications in browser settings.' : 'Device alerts were not enabled.');
              }}
            >
              {alertsLabel}
            </Button>
          )}
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" className="w-full whitespace-normal text-center leading-tight sm:w-auto sm:whitespace-nowrap" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
              <CheckCheck className="w-4 h-4 mr-2" /> {markAllRead.isPending ? 'Marking...' : 'Mark All Read'}
            </Button>
          )}
        </div>
      </div>

      {permission === 'granted' && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          Device alerts are on. Dink Card will show important account, deposit, card, and KYC updates on this device.
        </div>
      )}
      {permission === 'denied' && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          Browser notifications are blocked. Allow notifications for Dink Card in your browser settings, then tap <span className="font-medium">Alerts Blocked</span> again.
        </div>
      )}

      {!notifications?.length ? (
        <EmptyState icon={Bell} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {notifications.map(notif => {
            const IconComp = typeIcons[notif.type] || Bell;
            return (
              <div 
                key={notif.id} 
                className={cn("px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer hover:bg-secondary/30", !notif.read && "bg-primary/5")}
                onClick={() => !notif.read && markRead.mutate(notif.id)}
              >
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", !notif.read ? "bg-primary/10" : "bg-secondary")}>
                  <IconComp className={cn("w-4 h-4", !notif.read ? "text-primary" : "text-muted-foreground")} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium", !notif.read && "text-foreground")}>{notif.title}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{notif.message}</p>
                  {notif.link?.startsWith('/uploads/') && (
                    <FilePreview url={notif.link} label="Notification attachment" className="mt-2 max-w-md" />
                  )}
                  {notif.link && !notif.link.startsWith('/uploads/') && (
                    <a href={notif.link} className="mt-2 inline-flex text-xs font-medium text-primary hover:underline" onClick={(event) => event.stopPropagation()}>
                      Open
                    </a>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{notif.created_date ? format(new Date(notif.created_date), 'MMM d, h:mm a') : ''}</p>
                </div>
                {!notif.read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
