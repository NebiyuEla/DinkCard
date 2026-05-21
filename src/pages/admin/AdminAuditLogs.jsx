import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { REFRESH } from '@/lib/realtime';
import { format } from 'date-fns';

export default function AdminAuditLogs() {
  const { data: logs } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => apiClient.entities.AuditLog.list('-created_date', 200),
    refetchInterval: REFRESH.admin
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Audit Logs ({logs?.length || 0})</h2>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Admin</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Entity</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User Affected</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(logs || []).map(log => (
                <tr key={log.id} className="hover:bg-secondary/20">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {log.created_date ? format(new Date(log.created_date), 'MMM d, h:mm a') : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">{log.admin_id}</td>
                  <td className="px-4 py-3 text-xs font-mono">{(log.action || '').replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {log.entity_type && <span className="capitalize">{log.entity_type.replace(/_/g, ' ')}</span>}
                    {log.entity_id && <span className="text-muted-foreground/50 ml-1">#{log.entity_id.slice(-6)}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">{log.user_id || '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{log.reason || '—'}</td>
                </tr>
              ))}
              {(!logs || logs.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">No audit logs yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-border">
          {(logs || []).map(log => (
            <div key={log.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-mono">{(log.action || '').replace(/_/g, ' ')}</p>
                <p className="text-xs text-muted-foreground whitespace-nowrap">{log.created_date ? format(new Date(log.created_date), 'MMM d, h:mm a') : '-'}</p>
              </div>
              <p className="text-xs text-muted-foreground truncate">{log.admin_id}</p>
              <p className="text-xs text-muted-foreground truncate">{log.user_id || 'No user affected'}</p>
              {log.reason && <p className="text-xs text-muted-foreground">{log.reason}</p>}
            </div>
          ))}
          {(!logs || logs.length === 0) && (
            <div className="px-4 py-12 text-center text-muted-foreground text-sm">No audit logs yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
