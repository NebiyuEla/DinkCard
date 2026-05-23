import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import FilePreview from '@/components/FilePreview';
import { Check, X, Eye, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function AdminDeposits() {
  const queryClient = useQueryClient();
  const { data: deposits } = useQuery({
    queryKey: ['admin-deposits'],
    queryFn: () => apiClient.entities.Deposit.list('-created_date', 100),
    refetchInterval: REFRESH.admin
  });

  const [selected, setSelected] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const approveDeposit = useMutation({
    mutationFn: async (deposit) => {
      const response = await fetch(`/api/admin/deposits/${deposit.id}/approve`, { method: 'POST', credentials: 'include' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Approval failed');
      }
      return response.json();
    },
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      toast.success('Funding approved and service balance credited');
      setSelected(null);
    }
  });

  const rejectDeposit = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/deposits/${selected.id}/reject`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Rejection failed');
      }
    },
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      toast.success('Deposit rejected');
      setSelected(null);
      setShowReject(false);
      setRejectReason('');
    }
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Deposit Management</h2>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Method</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">USD</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">ETB</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ref</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(deposits || []).map(d => (
                <tr key={d.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3 text-xs">{d.user_id}</td>
                  <td className="px-4 py-3 capitalize text-xs">{d.payment_method}</td>
                  <td className="px-4 py-3 text-xs">{d.source || 'dinkcard'}</td>
                  <td className="px-4 py-3 text-right font-mono">${d.requested_usd_amount?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">{d.total_payable_etb?.toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-xs">{d.transaction_reference}</td>
                  <td className="px-4 py-3"><StatusBadge status={d.status} className="text-[10px]" /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{d.created_date ? format(new Date(d.created_date), 'MMM d, h:mm a') : ''}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(d)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => window.open(apiClient.payments.invoiceUrl(d.transaction_reference), '_blank')}>
                        Invoice
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-border">
          {(deposits || []).map(d => (
            <button key={d.id} type="button" onClick={() => setSelected(d)} className="w-full p-4 text-left space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{d.user_id}</p>
                  <p className="text-xs text-muted-foreground capitalize">{d.payment_method} - {d.source || 'dinkcard'} - {d.created_date ? format(new Date(d.created_date), 'MMM d, h:mm a') : ''}</p>
                </div>
                <StatusBadge status={d.status} className="text-[10px] shrink-0" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">USD</span><p className="font-mono">${d.requested_usd_amount?.toFixed(2)}</p></div>
                <div><span className="text-muted-foreground">Payable</span><p className="font-mono">{d.total_payable_etb?.toLocaleString()} ETB</p></div>
              </div>
              <p className="text-[11px] text-muted-foreground font-mono truncate">{d.transaction_reference}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Deposit Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">User:</span> <span className="font-medium">{selected.user_id}</span></div>
                <div><span className="text-muted-foreground">Method:</span> <span className="capitalize">{selected.payment_method}</span></div>
                <div><span className="text-muted-foreground">Source:</span> <span>{selected.source || 'dinkcard'}</span></div>
                <div><span className="text-muted-foreground">Provider Status:</span> <span>{selected.provider_status || 'not verified'}</span></div>
                <div><span className="text-muted-foreground">USD Amount:</span> <span className="font-mono">${selected.requested_usd_amount?.toFixed(2)}</span></div>
                <div><span className="text-muted-foreground">ETB Payable:</span> <span className="font-mono">{selected.total_payable_etb?.toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Rate:</span> <span className="font-mono">{selected.exchange_rate}</span></div>
                <div><span className="text-muted-foreground">USD Credit:</span> <span className="font-mono text-primary">${selected.final_usd_credit?.toFixed(2)}</span></div>
                <div><span className="text-muted-foreground">Sender:</span> <span>{selected.sender_name}</span></div>
                <div><span className="text-muted-foreground">Phone:</span> <span>{selected.sender_phone}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Reference:</span> <span className="font-mono">{selected.transaction_reference}</span></div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => window.open(apiClient.payments.invoiceUrl(selected.transaction_reference), '_blank')}
              >
                Download invoice
              </Button>

              {selected.proof_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Payment Proof:</p>
                  <FilePreview url={selected.proof_url} label="Payment proof" className="max-w-sm" />
                </div>
              )}

              {selected.status === 'awaiting_review' && (
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => approveDeposit.mutate(selected)} disabled={approveDeposit.isPending} className="flex-1 bg-primary text-primary-foreground">
                    <Check className="w-4 h-4 mr-2" /> {approveDeposit.isPending ? 'Approving...' : 'Approve'}
                  </Button>
                  <Button variant="destructive" onClick={() => setShowReject(true)} className="flex-1">
                    <X className="w-4 h-4 mr-2" /> Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> Reject Deposit</DialogTitle>
            <DialogDescription>Provide a reason for rejection. The user will be notified.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection..." rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectDeposit.mutate()} disabled={!rejectReason || rejectDeposit.isPending}>
              {rejectDeposit.isPending ? 'Rejecting...' : 'Reject Deposit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

