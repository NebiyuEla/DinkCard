import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { DEFAULT_SETTINGS } from '@/lib/feeCalculator';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

export default function AdminFees() {
  const queryClient = useQueryClient();

  const { data: existingSettings } = useQuery({
    queryKey: ['feeSettings'],
    queryFn: async () => {
      const list = await apiClient.entities.FeeSettings.filter({ key: 'default' });
      return list[0] || null;
    },
    refetchInterval: REFRESH.fees
  });

  const [form, setForm] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    if (existingSettings) {
      setForm(prev => ({ ...prev, ...existingSettings }));
    }
  }, [existingSettings]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const data = { ...form, key: 'default' };
      if (existingSettings?.id) {
        return await apiClient.entities.FeeSettings.update(existingSettings.id, data);
      }
      return await apiClient.entities.FeeSettings.create(data);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['feeSettings'], saved);
      queryClient.refetchQueries({ queryKey: ['feeSettings'], type: 'active' });
      invalidateOperationalData(queryClient);
      toast.success('Settings saved');
    }
  });

  const fields = [
    { key: 'usd_to_etb_rate', label: 'USD to ETB Rate', suffix: 'ETB' },
    { key: 'gateway_fee_percentage', label: 'Chapa Gateway Fee', suffix: '%' },
    { key: 'card_creation_fee_usd', label: 'Bitnob Card Fee', suffix: 'USD' },
    { key: 'min_deposit_usd', label: 'Min Deposit', suffix: 'USD' },
    { key: 'max_deposit_usd', label: 'Max Deposit', suffix: 'USD' },
    { key: 'daily_deposit_limit_usd', label: 'Daily Deposit Limit', suffix: 'USD' },
    { key: 'monthly_deposit_limit_usd', label: 'Monthly Deposit Limit', suffix: 'USD' },
    { key: 'min_card_funding_usd', label: 'Min Card Funding', suffix: 'USD' },
    { key: 'max_card_funding_usd', label: 'Max Card Funding', suffix: 'USD' },
    { key: 'max_cards_per_user', label: 'Max Cards Per User', suffix: '' },
    { key: 'kyc_level1_deposit_limit', label: 'KYC Level 1 Limit', suffix: 'USD' },
    { key: 'kyc_level2_deposit_limit', label: 'KYC Level 2 Limit', suffix: 'USD' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">Fees & Rate Settings</h2>

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="font-semibold text-primary">Minimum-profit fee mode</p>
          <p className="text-muted-foreground mt-1">Customers pay the checkout gateway fee when adding funds and the provider card fee when requesting cards. Platform deposit and card funding fees stay at 0 unless you intentionally add markup.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fields.map(field => (
            <div key={field.key}>
              <Label className="text-xs text-muted-foreground">{field.label}</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  value={form[field.key] ?? ''}
                  onChange={e => setForm({ ...form, [field.key]: parseFloat(e.target.value) || 0 })}
                  className="font-mono"
                  step="0.01"
                />
                {field.suffix && <span className="text-xs text-muted-foreground whitespace-nowrap">{field.suffix}</span>}
              </div>
            </div>
          ))}
        </div>

        <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending} className="mt-6 bg-primary text-primary-foreground">
          <Save className="w-4 h-4 mr-2" /> {saveSettings.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
