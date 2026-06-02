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

const MANUAL_APPROVAL_STATUSES = new Set(['awaiting_review', 'pending_transfer', 'pending_payment', 'processing']);
const CONFIRMED_CRYPTO_STATUSES = new Set(['deposit_success', 'confirmed', 'completed', 'success']);

export default function AdminDeposits() {
  const queryClient = useQueryClient();
  const { data: deposits } = useQuery({
    queryKey: ['admin-deposits'],
    queryFn: () => apiClient.entities.Deposit.list('-created_date', 100),
    refetchInterval: REFRESH.admin
  });
  const { data: providerTxData } = useQuery({
    queryKey: ['admin-provider-deposit-transactions'],
    queryFn: () => apiClient.admin.bitnob.transactions('credit'),
    refetchInterval: REFRESH.admin,
    retry: false
  });

  const [selected, setSelected] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const canManuallyApprove = (deposit) => {
    return Boolean(deposit && MANUAL_APPROVAL_STATUSES.has(deposit.status));
  };
  const providerTransactions = providerTxData?.transactions || [];
  const selectedProviderMatches = selected ? providerTransactions.filter((tx) => cryptoDepositLooksMatched(selected, tx)) : [];

  const approveDeposit = useMutation({
    mutationFn: (deposit) => apiClient.admin.deposits.approve(deposit.id),
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      toast.success('Funding approved and service balance credited');
      setSelected(null);
    }
  });

  const rejectDeposit = useMutation({
    mutationFn: () => apiClient.admin.deposits.reject(selected.id, { reason: rejectReason }),
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

      <ProviderTransactionsPanel rows={providerTransactions} />

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="hidden divide-y divide-border md:block">
          {(deposits || []).map(d => (
            <div key={d.id} className="grid grid-cols-[minmax(0,1.3fr)_0.8fr_0.8fr_0.9fr_1fr_auto] items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-secondary/20">
              <div className="min-w-0">
                <p className="break-words text-xs font-medium">{d.user_id}</p>
                <p className="text-[11px] text-muted-foreground">{d.created_date ? format(new Date(d.created_date), 'MMM d, h:mm a') : ''}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Method</p>
                <p className="text-xs capitalize">{d.payment_method}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">USD</p>
                <p className="font-mono">${d.requested_usd_amount?.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">ETB</p>
                <p className="font-mono text-xs">{d.total_payable_etb?.toLocaleString()}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Reference</p>
                <p className="break-all font-mono text-[11px]">{d.transaction_reference}</p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <StatusBadge status={d.status} className="text-[10px]" />
                <Button variant="ghost" size="sm" onClick={() => setSelected(d)}>
                  <Eye className="w-4 h-4" />
                </Button>
                {canManuallyApprove(d) && (
                  <Button size="sm" onClick={() => approveDeposit.mutate(d)} disabled={approveDeposit.isPending} className="bg-primary text-primary-foreground">
                    Approve
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="md:hidden divide-y divide-border">
          {(deposits || []).map(d => (
            <button key={d.id} type="button" onClick={() => setSelected(d)} className="w-full p-4 text-left space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{d.user_id}</p>
                  <p className="text-xs text-muted-foreground capitalize">{d.payment_method} - {d.source === 'dinkcard' || !d.source ? 'Dink Card' : d.source} - {d.created_date ? format(new Date(d.created_date), 'MMM d, h:mm a') : ''}</p>
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
                <div><span className="text-muted-foreground">Source:</span> <span>{selected.source === 'dinkcard' || !selected.source ? 'Dink Card' : selected.source}</span></div>
                <div><span className="text-muted-foreground">Provider Status:</span> <span>{selected.provider_status || 'not verified'}</span></div>
                <div><span className="text-muted-foreground">USD Amount:</span> <span className="font-mono">${selected.requested_usd_amount?.toFixed(2)}</span></div>
                <div><span className="text-muted-foreground">ETB Payable:</span> <span className="font-mono">{selected.total_payable_etb?.toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Rate:</span> <span className="font-mono">{selected.exchange_rate}</span></div>
                <div><span className="text-muted-foreground">USD Credit:</span> <span className="font-mono text-primary">${selected.final_usd_credit?.toFixed(2)}</span></div>
                <div><span className="text-muted-foreground">Sender:</span> <span>{selected.sender_name}</span></div>
                <div><span className="text-muted-foreground">Phone:</span> <span>{selected.sender_phone}</span></div>
                {selected.payment_currency && <div><span className="text-muted-foreground">Currency:</span> <span>{selected.payment_currency}</span></div>}
                {selected.payment_network && <div><span className="text-muted-foreground">Network:</span> <span>{selected.payment_network}</span></div>}
                {selected.payment_amount && <div><span className="text-muted-foreground">Payment Amount:</span> <span className="font-mono">{Number(selected.payment_amount).toFixed(2)} {selected.payment_currency || ''}</span></div>}
                {selected.tx_hash && <div><span className="text-muted-foreground">Tx Hash:</span> <span className="font-mono break-all">{selected.tx_hash}</span></div>}
                <div className="col-span-2"><span className="text-muted-foreground">Reference:</span> <span className="font-mono">{selected.transaction_reference}</span></div>
                {selected.payment_address && <div className="col-span-2"><span className="text-muted-foreground">Deposit Address:</span> <span className="font-mono break-all">{selected.payment_address}</span></div>}
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => window.open(apiClient.payments.invoiceUrl(selected.transaction_reference), '_blank')}
              >
                Download receipt
              </Button>

              {selected.proof_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Payment Proof:</p>
                  <FilePreview url={selected.proof_url} label="Payment proof" className="max-w-sm" />
                </div>
              )}

              {String(selected.payment_method || '').toLowerCase() === 'crypto' && !CONFIRMED_CRYPTO_STATUSES.has(String(selected.provider_status || '').toLowerCase()) && (
                <div className="space-y-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-muted-foreground">
                  <p>This crypto transfer is not provider-confirmed yet. The backend will check provider transactions before normal admin approval.</p>
                  <p className="font-medium text-foreground">{selectedProviderMatches.length ? `${selectedProviderMatches.length} possible provider match found below.` : 'No matching provider transaction is visible yet.'}</p>
                </div>
              )}

              {String(selected.payment_method || '').toLowerCase() === 'crypto' && (
                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                  <p className="mb-2 text-sm font-semibold">Possible provider matches</p>
                  <ProviderMiniRows rows={selectedProviderMatches} />
                </div>
              )}

              {canManuallyApprove(selected) && (
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => approveDeposit.mutate(selected)} disabled={approveDeposit.isPending} className="flex-1 bg-primary text-primary-foreground">
                    <Check className="w-4 h-4 mr-2" /> {approveDeposit.isPending ? 'Approving...' : 'Manual Approve'}
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

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function cryptoDepositLooksMatched(deposit, tx) {
  if (!deposit || !tx) return false;
  const amount = Number(deposit.payment_amount || deposit.final_usd_credit || deposit.requested_usd_amount || 0);
  const amountMatches = Number.isFinite(amount) && Math.abs(Number(tx.amount || 0) - amount) < 0.000001;
  const currency = String(deposit.payment_currency || '').toUpperCase();
  const txCurrency = String(tx.currency || '').toUpperCase();
  const currencyMatches = !currency || !txCurrency || currency === txCurrency || (currency === 'USDC' && txCurrency === 'USD');
  if (normalizeText(deposit.transaction_reference) && normalizeText(deposit.transaction_reference) === normalizeText(tx.reference)) return true;
  if (normalizeText(deposit.tx_hash) && normalizeText(deposit.tx_hash) === normalizeText(tx.txHash)) return true;
  if (normalizeText(deposit.payment_address) && normalizeText(deposit.payment_address) === normalizeText(tx.address) && currencyMatches && amountMatches) return true;
  return false;
}

function ProviderTransactionsPanel({ rows }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Provider Deposit Transactions</h3>
        <p className="text-xs text-muted-foreground">Use these provider records to verify crypto deposits before approval.</p>
      </div>
      <ProviderMiniRows rows={rows} />
    </div>
  );
}

function ProviderMiniRows({ rows }) {
  if (!rows?.length) return <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No provider transactions loaded.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="px-2 py-2 text-left">Date</th>
            <th className="px-2 py-2 text-left">Reference</th>
            <th className="px-2 py-2 text-left">Type</th>
            <th className="px-2 py-2 text-right">Amount</th>
            <th className="px-2 py-2 text-right">Fee</th>
            <th className="px-2 py-2 text-left">Status</th>
            <th className="px-2 py-2 text-left">Currency</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.slice(0, 30).map((tx, index) => (
            <tr key={tx.reference || tx.txHash || index}>
              <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{formatTxDate(tx.date)}</td>
              <td className="max-w-[240px] break-all px-2 py-2 font-mono">{tx.reference || tx.txHash || '-'}</td>
              <td className="px-2 py-2 capitalize">{String(tx.type || '-').replace(/_/g, ' ')}</td>
              <td className="px-2 py-2 text-right font-mono">${Number(tx.amount || 0).toFixed(2)}</td>
              <td className="px-2 py-2 text-right font-mono">${Number(tx.fee || 0).toFixed(2)}</td>
              <td className="px-2 py-2"><StatusBadge status={tx.status || 'unknown'} className="text-[10px]" /></td>
              <td className="px-2 py-2 font-semibold">{tx.currency || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatTxDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : format(date, 'MMM d, HH:mm');
}

