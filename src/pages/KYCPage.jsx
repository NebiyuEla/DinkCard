import React, { useEffect, useState } from 'react';
import { useCurrentUser, useKYCStatus } from '@/hooks/useAppData';
import { apiClient } from '@/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import FilePreview from '@/components/FilePreview';
import FileUploadControl from '@/components/FileUploadControl';
import { ShieldCheck, Upload, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const FIX_LABELS = {
  personal_info: 'Personal information',
  first_name: 'First name',
  last_name: 'Last name',
  date_of_birth: 'Date of birth',
  phone: 'Phone number',
  address: 'Address or city',
  street_address: 'Street address',
  state: 'State / region',
  postal_code: 'Postal code',
  id_type: 'ID type',
  id_number: 'ID number',
  front_id: 'Front ID upload',
  back_id: 'Back ID upload',
  selfie: 'Selfie upload'
};

const ETHIOPIAN_STATES = [
  'Addis Ababa',
  'Oromia',
  'Amhara',
  'Tigray',
  'Sidama',
  'SNNPR',
  'Somali',
  'Afar',
  'Benishangul-Gumuz',
  'Gambella',
  'Harari',
  'Dire Dawa',
  'Central Ethiopia',
  'South Ethiopia',
  'South West Ethiopia Peoples'
];

function parseFixFields(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeEtPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00251')) digits = digits.slice(5);
  if (digits.startsWith('251')) digits = digits.slice(3);
  digits = digits.replace(/^0+/, '');
  return digits.slice(0, 9);
}

export default function KYCPage() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: kyc, isLoading } = useKYCStatus(user?.email);

  const [form, setForm] = useState({
    first_name: '', last_name: '', legal_name: '', date_of_birth: '', gender: '', phone: '', email: '',
    street_address: '', address: '', city: 'Addis Ababa', state: 'Addis Ababa', postal_code: '1000', country: 'Ethiopia', id_type: '', id_number: ''
  });
  const [frontIdUrl, setFrontIdUrl] = useState('');
  const [backIdUrl, setBackIdUrl] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [uploading, setUploading] = useState({});
  const [resubmitting, setResubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!user || kyc?.id || resubmitting) return;
    setForm(prev => ({
      ...prev,
      first_name: prev.first_name || user.full_name?.split(' ')[0] || '',
      last_name: prev.last_name || user.full_name?.split(' ').slice(1).join(' ') || '',
      legal_name: prev.legal_name || user.full_name || '',
      email: prev.email || user.email || '',
      phone: prev.phone || normalizeEtPhone(user.phone || '') || ''
    }));
  }, [user, kyc?.id, resubmitting]);

  const handleUpload = async (file, setter, key) => {
    setUploading(prev => ({ ...prev, [key]: true }));
    try {
      const result = await apiClient.integrations.Core.UploadFile({ file });
      setter(result.file_url);
      toast.success('Uploaded');
    } catch (error) {
      toast.error(error.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }));
    }
  };

  const startResubmission = () => {
    const fields = parseFixFields(kyc?.resubmission_fields);
    const completeRedo = kyc?.resubmission_scope === 'complete';
    setForm(completeRedo ? {
      first_name: '',
      last_name: '',
      legal_name: '',
      date_of_birth: '',
      gender: '',
      phone: '',
      email: '',
      street_address: '',
      address: '',
      city: 'Addis Ababa',
      state: 'Addis Ababa',
      postal_code: '1000',
      country: 'Ethiopia',
      id_type: '',
      id_number: ''
    } : {
      first_name: kyc?.first_name || '',
      last_name: kyc?.last_name || '',
      legal_name: kyc?.legal_name || '',
      date_of_birth: kyc?.date_of_birth || '',
      gender: kyc?.gender || '',
      phone: kyc?.phone || '',
      email: kyc?.email || user?.email || '',
      street_address: kyc?.street_address || '',
      address: kyc?.address || '',
      city: kyc?.city || 'Addis Ababa',
      state: kyc?.state || 'Addis Ababa',
      postal_code: kyc?.postal_code || '1000',
      country: kyc?.country || 'Ethiopia',
      id_type: kyc?.id_type || '',
      id_number: kyc?.id_number || ''
    });
    setFrontIdUrl(!completeRedo && !fields.includes('front_id') ? (kyc?.front_id_url || '') : '');
    setBackIdUrl(!completeRedo && !fields.includes('back_id') ? (kyc?.back_id_url || '') : '');
    setSelfieUrl(!completeRedo && !fields.includes('selfie') ? (kyc?.selfie_url || '') : '');
    setResubmitting(true);
  };

  const submitKYC = useMutation({
    mutationFn: async () => {
      setSubmitError('');
      const data = {
        user_id: user.email,
        ...form,
        legal_name: `${String(form.first_name || '').trim()} ${String(form.last_name || '').trim()}`.trim(),
        phone: normalizeEtPhone(form.phone),
        front_id_url: frontIdUrl,
        back_id_url: backIdUrl,
        selfie_url: selfieUrl,
        level: 2,
        status: 'pending'
      };
      if (kyc?.id) {
        return await apiClient.entities.KYCSubmission.update(kyc.id, data);
      }
      return await apiClient.entities.KYCSubmission.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kyc'] });
      setResubmitting(false);
      setSubmitError('');
      toast.success('KYC submitted for review!');
    },
    onError: (error) => {
      setSubmitError(error.message || 'KYC submission failed');
      toast.error(error.message || 'KYC submission failed');
    }
  });

  const requiredMissing = [
    !form.first_name && 'First name',
    !form.last_name && 'Last name',
    !form.date_of_birth && 'Date of birth',
    !form.phone && 'Phone',
    !form.street_address && 'Street address',
    !form.state && 'State / region',
    !form.postal_code && 'Postal code',
    !form.id_type && 'ID type',
    !form.id_number && 'ID number',
    !frontIdUrl && 'Front of ID',
    (needsBackId && !backIdUrl) && 'Back of ID',
    !selfieUrl && 'Selfie'
  ].filter(Boolean);
  const canSubmitKYC = requiredMissing.length === 0 && !submitKYC.isPending && !Object.values(uploading).some(Boolean);
  const needsBackId = form.id_type === 'national_id';

  if (isLoading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  // Show status if already submitted
  if (kyc && ['pending', 'approved'].includes(kyc.status)) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">KYC Verification</h1>
          <p className="text-sm text-muted-foreground">Your identity verification status</p>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-border rounded-xl p-8 text-center">
          {kyc.status === 'approved' ? (
            <>
              <CheckCircle className="w-16 h-16 text-primary mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Verified</h2>
              <p className="text-sm text-muted-foreground mb-3">Your identity has been verified. You have full access.</p>
              <StatusBadge status="approved" />
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8 text-yellow-500" />
              </div>
              <h2 className="text-xl font-bold mb-2">Under Review</h2>
              <p className="text-sm text-muted-foreground mb-3">Your KYC submission is being reviewed. This usually takes 1-24 hours.</p>
              <StatusBadge status="pending" />
            </>
          )}
        </motion.div>
      </div>
    );
  }

  // Show rejection
  if (kyc && ['rejected', 'resubmit_required'].includes(kyc.status) && !resubmitting) {
    const fixFields = parseFixFields(kyc.resubmission_fields);
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">KYC Verification</h1>
        </div>
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <h3 className="font-semibold text-destructive">Submission {kyc.status === 'rejected' ? 'Rejected' : 'Needs Resubmission'}</h3>
          </div>
          {kyc.rejection_reason && <p className="text-sm text-muted-foreground">{kyc.rejection_reason}</p>}
          <div className="rounded-lg border border-border bg-background/60 p-3 text-sm">
            {kyc.resubmission_scope === 'complete' ? (
              <p className="font-medium">Admin requested a complete KYC redo.</p>
            ) : (
              <>
                <p className="font-medium mb-2">Fix these specific items:</p>
                <div className="flex flex-wrap gap-2">
                  {fixFields.map(field => (
                    <span key={field} className="rounded-full bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 text-xs text-orange-600">
                      {FIX_LABELS[field] || field.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button onClick={startResubmission} className="bg-primary text-primary-foreground">
            {kyc.resubmission_scope === 'complete' ? 'Redo Full KYC' : 'Fix KYC'} <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  // KYC Form
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">KYC Verification</h1>
        <p className="text-sm text-muted-foreground">
          {resubmitting ? 'Update the requested KYC details and submit again.' : 'Complete your identity verification to unlock all features'}
        </p>
      </div>

      <div className="bg-secondary/40 border border-border rounded-xl p-4 text-xs text-muted-foreground">
        Users must provide accurate identity, contact, and payment information. False, misleading, forged, edited, third-party, or unauthorized information may result in account restriction, transaction cancellation, service denial, refund delay, permanent ban, or reporting where required.
      </div>

      {resubmitting && kyc?.rejection_reason && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 text-sm">
          <p className="font-semibold text-orange-600">Admin response</p>
          <p className="text-muted-foreground mt-1">{kyc.rejection_reason}</p>
        </div>
      )}

      {submitError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-sm text-destructive">
          {submitError}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <h3 className="font-semibold">Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label className="text-sm">First Name</Label><Input value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value, legal_name: `${e.target.value} ${form.last_name}`.trim()})} className="mt-1.5" /></div>
          <div><Label className="text-sm">Last Name</Label><Input value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value, legal_name: `${form.first_name} ${e.target.value}`.trim()})} className="mt-1.5" /></div>
          <div><Label className="text-sm">Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={e => setForm({...form, date_of_birth: e.target.value})} className="mt-1.5" /></div>
          <div>
            <Label className="text-sm">Gender</Label>
            <Select value={form.gender} onValueChange={v => setForm({...form, gender: v})}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Phone</Label>
            <div className="mt-1.5 flex overflow-hidden rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
              <span className="flex items-center border-r border-input px-3 text-sm text-muted-foreground">+251</span>
              <Input value={form.phone} onChange={e => setForm({...form, phone: normalizeEtPhone(e.target.value)})} placeholder="9XXXXXXXX" className="border-0 focus-visible:ring-0" />
            </div>
          </div>
          <div><Label className="text-sm">Email</Label><Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="mt-1.5" /></div>
          <div className="md:col-span-2"><Label className="text-sm">Street Address</Label><Input value={form.street_address} onChange={e => setForm({...form, street_address: e.target.value, address: e.target.value})} className="mt-1.5" /></div>
          <div><Label className="text-sm">City</Label><Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="mt-1.5" /></div>
          <div>
            <Label className="text-sm">State / Region</Label>
            <Select value={form.state} onValueChange={v => setForm({...form, state: v})}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select state" /></SelectTrigger>
              <SelectContent>
                {ETHIOPIAN_STATES.map((state) => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-sm">Postal Code</Label><Input value={form.postal_code} onChange={e => setForm({...form, postal_code: e.target.value})} className="mt-1.5" /></div>
          <div><Label className="text-sm">Country</Label><Input value={form.country} disabled className="mt-1.5" /></div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <h3 className="font-semibold">ID Document</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm">ID Type</Label>
            <Select value={form.id_type} onValueChange={v => setForm({...form, id_type: v})}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="national_id">National ID</SelectItem>
                <SelectItem value="passport">Passport</SelectItem>
                <SelectItem value="drivers_license">Driver's License</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-sm">{form.id_type === 'passport' ? 'Passport Number' : 'National ID Number'}</Label><Input value={form.id_number} onChange={e => setForm({...form, id_number: e.target.value.trim()})} className="mt-1.5" /></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Front of ID', url: frontIdUrl, setter: setFrontIdUrl, key: 'front' },
            ...(needsBackId ? [{ label: 'Back of ID', url: backIdUrl, setter: setBackIdUrl, key: 'back' }] : []),
            { label: 'Selfie', url: selfieUrl, setter: setSelfieUrl, key: 'selfie' },
          ].map(item => (
            <div key={item.key}>
              <Label className="text-sm">{item.label}</Label>
              <div className="mt-1.5 border-2 border-dashed border-border rounded-xl p-4 text-center min-h-[132px] flex items-center justify-center">
                {item.url ? (
                  <div className="space-y-1">
                    <CheckCircle className="w-6 h-6 text-primary mx-auto" />
                    <p className="text-xs text-primary">Uploaded</p>
                    <FilePreview url={item.url} label={item.label} className="mt-2" />
                    <button type="button" className="text-xs text-muted-foreground hover:text-primary" onClick={() => item.setter('')}>
                      Replace
                    </button>
                  </div>
                ) : (
                  <FileUploadControl
                    className="min-h-[92px] w-full rounded-lg flex flex-col items-center justify-center"
                    disabled={uploading[item.key]}
                    onFile={(file) => handleUpload(file, item.setter, item.key)}
                  >
                    <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">{uploading[item.key] ? 'Uploading...' : 'Tap to upload'}</p>
                  </FileUploadControl>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Button 
        className="w-full bg-primary text-primary-foreground h-12 text-base font-semibold"
        disabled={!canSubmitKYC}
        onClick={() => submitKYC.mutate()}
      >
        {submitKYC.isPending ? 'Submitting...' : requiredMissing.length ? `Complete: ${requiredMissing[0]}` : 'Submit KYC'}
      </Button>
    </div>
  );
}
