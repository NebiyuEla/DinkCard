import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import FilePreview from '@/components/FilePreview';
import { Check, X, Eye, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const KYC_FIX_OPTIONS = [
  { value: 'personal_info', label: 'Personal information' },
  { value: 'date_of_birth', label: 'Date of birth' },
  { value: 'phone', label: 'Phone number' },
  { value: 'address', label: 'Address or city' },
  { value: 'id_type', label: 'ID type' },
  { value: 'id_number', label: 'ID number' },
  { value: 'front_id', label: 'Front ID upload' },
  { value: 'back_id', label: 'Back ID upload' },
  { value: 'selfie', label: 'Selfie upload' }
];

const APPROVABLE_KYC_STATUSES = new Set(['pending', 'manual_review', 'resubmit_required']);

export default function AdminKYC() {
  const queryClient = useQueryClient();
  const { data: submissions } = useQuery({
    queryKey: ['admin-kyc'],
    queryFn: () => apiClient.entities.KYCSubmission.list('-created_date', 100),
    refetchInterval: REFRESH.admin
  });

  const [selected, setSelected] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [resubmissionScope, setResubmissionScope] = useState('specific');
  const [resubmissionFields, setResubmissionFields] = useState([]);
  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [showReject, setShowReject] = useState(false);

  const approveKYC = useMutation({
    mutationFn: (kyc) => apiClient.admin.kyc.approve(kyc.id),
    onSuccess: (updatedKyc) => {
      queryClient.setQueryData(['admin-kyc'], (current = []) => current.map((item) => item.id === updatedKyc.id ? updatedKyc : item));
      queryClient.setQueryData(['sa-kyc'], (current = []) => current.map((item) => item.id === updatedKyc.id ? updatedKyc : item));
      invalidateOperationalData(queryClient);
      toast.success(updatedKyc.bitnob_customer?.bitnob_customer_id ? 'KYC approved and Bitnob customer created' : 'KYC approved');
      setSelected(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Approval failed');
    }
  });

  const rejectKYC = useMutation({
    mutationFn: async () => {
      if (!correctionTarget?.id) throw new Error('Select a KYC submission first.');
      return apiClient.admin.kyc.requestFix(correctionTarget.id, { reason: rejectReason, resubmissionScope, resubmissionFields });
    },
    onSuccess: (updatedKyc) => {
      queryClient.setQueryData(['admin-kyc'], (current = []) => current.map((item) => item.id === updatedKyc.id ? updatedKyc : item));
      queryClient.setQueryData(['sa-kyc'], (current = []) => current.map((item) => item.id === updatedKyc.id ? updatedKyc : item));
      invalidateOperationalData(queryClient);
      toast.success('KYC correction request sent');
      setSelected(null);
      setCorrectionTarget(null);
      setShowReject(false);
      setRejectReason('');
      setResubmissionScope('specific');
      setResubmissionFields([]);
    },
    onError: (error) => {
      toast.error(error.message || 'Correction request failed');
    }
  });

  const removeApproval = useMutation({
    mutationFn: (kyc) => apiClient.admin.kyc.unapprove(kyc.id, { reason: 'Approval removed by admin.' }),
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      toast.success('KYC approval removed');
      setSelected(null);
    },
    onError: (error) => toast.error(error.message || 'Could not update KYC status')
  });

  const toggleField = (field, checked) => {
    setResubmissionFields(prev => checked ? [...new Set([...prev, field])] : prev.filter(item => item !== field));
  };

  const openCorrectionDialog = () => {
    setCorrectionTarget(selected);
    setSelected(null);
    setRejectReason('');
    setResubmissionScope('specific');
    setResubmissionFields([]);
    setShowReject(true);
  };

  const closeCorrectionDialog = (open) => {
    setShowReject(open);
    if (!open) {
      setCorrectionTarget(null);
      setRejectReason('');
      setResubmissionScope('specific');
      setResubmissionFields([]);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">KYC Submissions</h2>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">ID Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(submissions || []).map(k => (
                <tr key={k.id} className="hover:bg-secondary/20">
                  <td className="px-4 py-3 text-xs">{k.user_id}</td>
                  <td className="px-4 py-3">{k.legal_name}</td>
                  <td className="px-4 py-3 capitalize text-xs">{(k.id_type || '').replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3"><StatusBadge status={k.status} className="text-[10px]" /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{k.created_date ? format(new Date(k.created_date), 'MMM d') : ''}</td>
                  <td className="px-4 py-3"><Button variant="ghost" size="sm" onClick={() => setSelected(k)}><Eye className="w-4 h-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-border">
          {(submissions || []).map(k => (
            <button key={k.id} type="button" onClick={() => setSelected(k)} className="w-full p-4 text-left space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{k.legal_name || k.user_id}</p>
                  <p className="text-xs text-muted-foreground truncate">{k.user_id}</p>
                </div>
                <StatusBadge status={k.status} className="text-[10px] shrink-0" />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="capitalize">{(k.id_type || '').replace(/_/g, ' ')}</span>
                <span>{k.created_date ? format(new Date(k.created_date), 'MMM d') : ''}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>KYC Details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Name:</span> {selected.legal_name}</div>
                <div><span className="text-muted-foreground">First / Last:</span> {[selected.first_name, selected.last_name].filter(Boolean).join(' ') || '-'}</div>
                <div><span className="text-muted-foreground">DOB:</span> {selected.date_of_birth}</div>
                <div><span className="text-muted-foreground">Phone:</span> {selected.phone}</div>
                <div><span className="text-muted-foreground">Email:</span> {selected.email}</div>
                <div><span className="text-muted-foreground">City:</span> {selected.city}</div>
                <div><span className="text-muted-foreground">State:</span> {selected.state || '-'}</div>
                <div><span className="text-muted-foreground">Postal Code:</span> {selected.postal_code || '-'}</div>
                <div><span className="text-muted-foreground">Country:</span> {selected.country || 'Ethiopia'}</div>
                <div><span className="text-muted-foreground">ID Type:</span> <span className="capitalize">{(selected.id_type || '').replace(/_/g, ' ')}</span></div>
                <div><span className="text-muted-foreground">ID Number:</span> <span className="font-mono">{selected.id_number || '-'}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Street Address:</span> {selected.street_address || selected.address || '-'}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FilePreview url={selected.front_id_url} label="Front ID" />
                {selected.id_type !== 'passport' && <FilePreview url={selected.back_id_url} label="Back ID" />}
                <FilePreview url={selected.selfie_url} label="Selfie" />
              </div>
              {APPROVABLE_KYC_STATUSES.has(selected.status) && (
                <div className="flex gap-2">
                  <Button onClick={() => approveKYC.mutate(selected)} disabled={approveKYC.isPending} className="flex-1 bg-primary text-primary-foreground">
                    <Check className="w-4 h-4 mr-2" /> {approveKYC.isPending ? 'Approving...' : 'Manual Approve'}
                  </Button>
                  <Button variant="destructive" onClick={openCorrectionDialog} disabled={approveKYC.isPending || rejectKYC.isPending} className="flex-1">
                    <X className="w-4 h-4 mr-2" /> Request Fix
                  </Button>
                </div>
              )}
              {selected.status === 'approved' && (
                <Button variant="outline" onClick={() => removeApproval.mutate(selected)} disabled={removeApproval.isPending} className="w-full">
                  <Undo2 className="mr-2 h-4 w-4" /> {removeApproval.isPending ? 'Removing...' : 'Remove Approval'}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showReject} onOpenChange={closeCorrectionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request KYC Correction</DialogTitle>
            <DialogDescription>Tell the user exactly what is wrong and whether they should fix specific parts or redo everything.</DialogDescription>
          </DialogHeader>
          {correctionTarget && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
              <p className="font-medium">{correctionTarget.legal_name || correctionTarget.user_id}</p>
              <p className="text-xs text-muted-foreground">{correctionTarget.user_id}</p>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Correction type</Label>
              <Select value={resubmissionScope} onValueChange={setResubmissionScope}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="specific">Specific fixes only</SelectItem>
                  <SelectItem value="complete">Redo complete KYC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {resubmissionScope === 'specific' && (
              <div className="space-y-2">
                <Label className="text-sm">What should they fix?</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-border p-3">
                  {KYC_FIX_OPTIONS.map(option => (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={resubmissionFields.includes(option.value)}
                        onCheckedChange={(checked) => toggleField(option.value, Boolean(checked))}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label className="text-sm">Message to user</Label>
              <Textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={4}
                placeholder="Example: Your selfie is blurry and the ID front image is cropped. Please upload a clear selfie and full front side of your ID."
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => closeCorrectionDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectKYC.mutate()}
              disabled={!correctionTarget || !rejectReason.trim() || (resubmissionScope === 'specific' && resubmissionFields.length === 0) || rejectKYC.isPending}
            >
              {rejectKYC.isPending ? 'Sending...' : 'Send Fix Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

