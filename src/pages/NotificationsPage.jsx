import React from 'react';
import { useCurrentUser, useNotifications } from '@/hooks/useAppData';
import { apiClient } from '@/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/ui-custom/EmptyState';
import { Bell, CheckCheck, CreditCard, DollarSign, ShieldCheck, HeadphonesIcon, AlertTriangle, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const typeIcons = {
  deposit: DollarSign,
  kyc: ShieldCheck,
  card: CreditCard,
  support: HeadphonesIcon,
  security: AlertTriangle,
  system: Settings,
  referral: DollarSign,
};

export default function NotificationsPage() {
  const { data: user } = useCurrentUser();
  const { data: notifications } = useNotifications(user?.email);
  const queryClient = useQueryClient();

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
            <CheckCheck className="w-4 h-4 mr-2" /> {markAllRead.isPending ? 'Marking...' : 'Mark All Read'}
          </Button>
        )}
      </div>

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
                  <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
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
