import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { Button } from '@/components/ui/button';

export default function AdminAuditLogs() {
  const queryClient = useQueryClient();
  const { data: logs } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => apiClient.entities.AuditLog.list('-created_date', 200),
    refetchInterval: REFRESH.admin
  });

  const deleteLog = useMutation({
    mutationFn: (id) => apiClient.admin.deleteAuditLog(id),
    onSuccess: () => {
      toast.success('Audit log deleted');
      invalidateOperationalData(queryClient);
    },
    onError: (error) => toast.error(error.message || 'Could not delete audit log')
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Audit Logs ({logs?.length || 0})</h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Admin</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Entity</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">User Affected</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reason</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(logs || []).map((log) => (
                <tr key={log.id} className="hover:bg-secondary/20">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {log.created_date ? format(new Date(log.created_date), 'MMM d, h:mm a') : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs">{log.admin_id}</td>
                  <td className="px-4 py-3 text-xs font-mono">{(log.action || '').replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {log.entity_type && <span className="capitalize">{log.entity_type.replace(/_/g, ' ')}</span>}
                    {log.entity_id && <span className="ml-1 text-muted-foreground/50">#{log.entity_id.slice(-6)}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">{log.user_id || '-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{log.reason || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => deleteLog.mutate(log.id)} disabled={deleteLog.isPending}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {(!logs || logs.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">No audit logs yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-border md:hidden">
          {(logs || []).map((log) => (
            <div key={log.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-mono">{(log.action || '').replace(/_/g, ' ')}</p>
                <div className="flex items-center gap-2">
                  <p className="whitespace-nowrap text-xs text-muted-foreground">{log.created_date ? format(new Date(log.created_date), 'MMM d, h:mm a') : '-'}</p>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteLog.mutate(log.id)} disabled={deleteLog.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="truncate text-xs text-muted-foreground">{log.admin_id}</p>
              <p className="truncate text-xs text-muted-foreground">{log.user_id || 'No user affected'}</p>
              {log.reason && <p className="text-xs text-muted-foreground">{log.reason}</p>}
            </div>
          ))}
          {(!logs || logs.length === 0) && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">No audit logs yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
