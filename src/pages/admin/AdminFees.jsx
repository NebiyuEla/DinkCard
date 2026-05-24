import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { calculateDepositFees, DEFAULT_SETTINGS, getEffectiveMinCardCreation, getEffectiveMinCardFunding } from '@/lib/feeCalculator';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save, Trash2 } from 'lucide-react';

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
  const [clearScope, setClearScope] = useState('notifications');
  const preview = calculateDepositFees(50, form.usd_to_etb_rate || DEFAULT_SETTINGS.usd_to_etb_rate, form);
  const effectiveMinCreation = getEffectiveMinCardCreation(form);
  const effectiveMinFunding = getEffectiveMinCardFunding(form);

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
      toast.success('Pricing settings saved');
    },
    onError: (error) => toast.error(error.message || 'Failed to save pricing settings')
  });

  const clearData = useMutation({
    mutationFn: () => apiClient.admin.system.clearData({ scope: clearScope }),
    onSuccess: (result) => {
      invalidateOperationalData(queryClient);
      toast.success(`${String(result.scope).replace(/_/g, ' ')} data cleared`);
    },
    onError: (error) => toast.error(error.message || 'Failed to clear data')
  });

  const pricingFields = [
    { key: 'usd_to_etb_rate', label: 'USD exchange rate', suffix: 'ETB' },
    { key: 'minimum_service_fee_etb', label: 'Fixed charge', suffix: 'ETB' },
    { key: 'service_margin_percentage', label: 'Charge percentage', suffix: '%' },
    { key: 'gateway_fee_percentage', label: 'Gateway fee', suffix: '%' },
    { key: 'chapa_settlement_fee_etb', label: 'Settlement/transfer fee', suffix: 'ETB' },
    { key: 'rounding_rule_etb', label: 'Round up to nearest', suffix: 'ETB' },
  ];

  const limitFields = [
    { key: 'min_deposit_usd', label: 'Min Deposit', suffix: 'USD' },
    { key: 'max_deposit_usd', label: 'Max Deposit', suffix: 'USD' },
    { key: 'daily_deposit_limit_usd', label: 'Daily Deposit Limit', suffix: 'USD' },
    { key: 'monthly_deposit_limit_usd', label: 'Monthly Deposit Limit', suffix: 'USD' }
  ];

  const updateNumber = (key, value) => {
    setForm({ ...form, [key]: parseFloat(value) || 0 });
  };

  const renderField = (field) => (
    <div key={field.key}>
      <Label className="text-xs text-muted-foreground">{field.label}</Label>
      <div className="flex items-center gap-2 mt-1">
        <Input
          type="number"
          value={form[field.key] ?? ''}
          onChange={e => updateNumber(field.key, e.target.value)}
          className="font-mono"
          step="0.01"
        />
        {field.suffix && <span className="text-xs text-muted-foreground whitespace-nowrap">{field.suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">Pricing Settings</h2>
        <p className="text-sm text-muted-foreground">Simple ETB pricing for Dink Card deposits.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="font-semibold text-primary">Checkout preview</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-background/80 p-2">
              <p className="text-muted-foreground">$50 preview</p>
              <p className="font-mono font-semibold">{preview.totalPayableEtb.toLocaleString()} ETB</p>
            </div>
            <div className="rounded-lg bg-background/80 p-2">
              <p className="text-muted-foreground">Visible fee</p>
              <p className="font-mono font-semibold">{preview.dinkServiceFeeEtb.toLocaleString()} ETB</p>
            </div>
            <div className="rounded-lg bg-background/80 p-2">
              <p className="text-muted-foreground">Chapa covered</p>
              <p className="font-mono font-semibold">{preview.gatewayFeeEtb.toLocaleString()} ETB</p>
            </div>
            <div className="rounded-lg bg-background/80 p-2">
              <p className="text-muted-foreground">Rate</p>
              <p className="font-mono font-semibold">{preview.exchangeRate.toLocaleString()} ETB</p>
            </div>
            <div className="rounded-lg bg-background/80 p-2">
              <p className="text-muted-foreground">Effective rate</p>
              <p className="font-mono font-semibold">{preview.effectivePayableRate.toFixed(2)} ETB</p>
            </div>
            <div className="rounded-lg bg-background/80 p-2 col-span-2 sm:col-span-4">
              <p className="text-muted-foreground">Locked provider rules</p>
              <p className="font-mono font-semibold">Max cards per user: 3 • Min create: ${effectiveMinCreation.toFixed(2)} • Min top-up: ${effectiveMinFunding.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <h3 className="mb-3 text-sm font-semibold">Pricing Formula</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pricingFields.map(renderField)}
        </div>

        <h3 className="mb-3 mt-8 text-sm font-semibold">Limits</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {limitFields.map(renderField)}
        </div>

        <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending} className="mt-6 bg-primary text-primary-foreground">
          <Save className="w-4 h-4 mr-2" /> {saveSettings.isPending ? 'Saving...' : 'Save Settings'}
        </Button>

        <div className="mt-8 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <h3 className="text-sm font-semibold text-destructive">Data Tools</h3>
          <p className="mt-1 text-xs text-muted-foreground">Clear specific operational data or wipe all non-user operational records.</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <select
              value={clearScope}
              onChange={(event) => setClearScope(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
            >
              <option value="notifications">Notifications</option>
              <option value="deposits">Deposits</option>
              <option value="cards">Cards</option>
              <option value="customers">Customers</option>
              <option value="kyc">KYC</option>
              <option value="support">Support</option>
              <option value="transactions">Transactions & balances</option>
              <option value="audit">Audit logs</option>
              <option value="webhooks">Webhook history</option>
              <option value="all">All operational data</option>
            </select>
            <Button
              type="button"
              variant="destructive"
              disabled={clearData.isPending}
              onClick={() => {
                if (window.confirm(`Clear ${clearScope.replace(/_/g, ' ')} data?`)) {
                  clearData.mutate();
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />{clearData.isPending ? 'Clearing...' : 'Clear Data'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
