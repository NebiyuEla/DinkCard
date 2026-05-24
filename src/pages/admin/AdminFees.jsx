import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { calculateDepositFees, DEFAULT_SETTINGS, getEffectiveMinCardCreation, getEffectiveMinCardFunding } from '@/lib/feeCalculator';
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

  const pricingFields = [
    { key: 'usd_to_etb_rate', label: 'USD exchange rate', suffix: 'ETB' },
    { key: 'service_margin_percentage', label: 'Dink Card service margin', suffix: '%' },
    { key: 'minimum_service_fee_etb', label: 'Minimum service fee', suffix: 'ETB' },
    { key: 'safety_buffer_percentage', label: 'Safety buffer', suffix: '%' },
    { key: 'gateway_fee_percentage', label: 'Chapa collection fee', suffix: '%' },
    { key: 'chapa_settlement_fee_etb', label: 'Settlement/transfer fee', suffix: 'ETB' },
    { key: 'card_creation_fee_usd', label: 'Card creation cost', suffix: 'USD' },
    { key: 'bitnob_topup_fee_under_100_usd', label: 'Top-up cost under $100', suffix: 'USD' },
    { key: 'bitnob_topup_fee_percent_100_plus', label: 'Top-up cost $100+', suffix: '%' },
    { key: 'rounding_rule_etb', label: 'Round up to nearest', suffix: 'ETB' },
  ];

  const limitFields = [
    { key: 'min_deposit_usd', label: 'Min Deposit', suffix: 'USD' },
    { key: 'max_deposit_usd', label: 'Max Deposit', suffix: 'USD' },
    { key: 'daily_deposit_limit_usd', label: 'Daily Deposit Limit', suffix: 'USD' },
    { key: 'monthly_deposit_limit_usd', label: 'Monthly Deposit Limit', suffix: 'USD' },
    { key: 'min_card_creation_usd', label: 'Min Card Creation', suffix: 'USD' },
    { key: 'min_card_funding_usd', label: 'Min Card Top-up', suffix: 'USD' },
    { key: 'max_card_funding_usd', label: 'Max Card Funding', suffix: 'USD' },
    { key: 'max_cards_per_user', label: 'Max Cards Per User', suffix: '' },
    { key: 'kyc_level1_deposit_limit', label: 'KYC Level 1 Limit', suffix: 'USD' },
    { key: 'kyc_level2_deposit_limit', label: 'KYC Level 2 Limit', suffix: 'USD' },
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
        <p className="text-sm text-muted-foreground">Keep customer checkout simple while protecting Dink Card from provider, gateway, exchange-rate, and refund costs.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="font-semibold text-primary">Protected pricing mode</p>
          <p className="text-muted-foreground mt-1">
            The checkout shows one clean service & processing fee. Behind the scenes it uses Chapa gross-up, provider costs, service margin, safety buffer, and ETB rounding.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-background/80 p-2">
              <p className="text-muted-foreground">$50 preview</p>
              <p className="font-mono font-semibold">{preview.totalPayableEtb.toLocaleString()} ETB</p>
            </div>
            <div className="rounded-lg bg-background/80 p-2">
              <p className="text-muted-foreground">Visible fee</p>
              <p className="font-mono font-semibold">{preview.serviceAndProcessingFeeEtb.toLocaleString()} ETB</p>
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
              <p className="text-muted-foreground">Effective minimum card creation / top-up</p>
              <p className="font-mono font-semibold">${effectiveMinCreation.toFixed(2)} / ${effectiveMinFunding.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <Label className="text-xs text-muted-foreground">Customer fee display style</Label>
          <select
            value={form.customer_fee_display_style || 'hybrid'}
            onChange={(event) => setForm({ ...form, customer_fee_display_style: event.target.value })}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="hybrid">Hybrid: simple checkout with fee details button</option>
            <option value="simple">Simple: hide detailed breakdown</option>
            <option value="detailed">Detailed: show full breakdown by default</option>
          </select>
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
      </div>
    </div>
  );
}
