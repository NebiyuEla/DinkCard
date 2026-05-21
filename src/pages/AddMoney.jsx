import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, DollarSign, ExternalLink, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/api/client';
import { useCurrentUser, useDeposits, useFeeSettings, useKYCStatus } from '@/hooks/useAppData';
import { calculateDepositFees } from '@/lib/feeCalculator';
import { checkoutAgreement } from '@/lib/legal';
import { invalidateOperationalData } from '@/lib/realtime';
import LegalLinks from '@/components/LegalLinks';
import { toast } from 'sonner';

export default function AddMoney() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: settings } = useFeeSettings();
  const { data: kyc } = useKYCStatus(user?.email);
  const { data: deposits } = useDeposits(user?.email);
  const [usdAmount, setUsdAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(user?.phone || '');
  const [statusMessage, setStatusMessage] = useState('');
  const [acceptedNotice, setAcceptedNotice] = useState(false);

  const amount = Number(usdAmount || 0);
  const rate = settings?.usd_to_etb_rate || 135;
  const fees = useMemo(() => {
    if (!amount) return null;
    return calculateDepositFees(amount, rate, settings || {});
  }, [amount, rate, settings]);

  useEffect(() => {
    const txRef = new URLSearchParams(window.location.search).get('tx_ref');
    if (!txRef) return;
    apiClient.payments.getChapaStatus(txRef)
      .then((deposit) => {
        invalidateOperationalData(queryClient);
        if (deposit.status === 'approved') {
          setStatusMessage('Your payment was confirmed and your available service balance has been credited.');
          toast.success('Funding completed successfully.');
        } else {
          setStatusMessage('Your payment is still being verified. Refresh in a few seconds if needed.');
        }
      })
      .catch((error) => {
        setStatusMessage(error.message || 'We could not verify the payment yet.');
      });
  }, [queryClient]);

  const startCheckout = useMutation({
    mutationFn: () => apiClient.payments.initializeChapa({ amountUsd: amount, phoneNumber }),
    onSuccess: (result) => {
      window.location.href = result.checkoutUrl;
    },
    onError: (error) => {
      toast.error(error.message || 'Unable to start payment');
    }
  });

  const latestDeposit = deposits?.[0];
  const kycApproved = kyc?.status === 'approved';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Add Money</h1>
          <p className="text-sm text-muted-foreground">Add funds for supported card-related service requests.</p>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm text-primary">
          {statusMessage}
        </div>
      )}

      {!kycApproved && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm text-yellow-600">
          Complete and get your KYC approved before adding funds.
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <div>
          <Label className="text-sm font-medium">Amount in USD</Label>
          <div className="relative mt-1.5">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="number"
              value={usdAmount}
              onChange={(e) => setUsdAmount(e.target.value)}
              min={settings?.min_deposit_usd || 5}
              max={settings?.max_deposit_usd || 1000}
              className="pl-9 h-12 font-mono"
            />
          </div>
        </div>
        <div>
          <Label className="text-sm font-medium">Phone Number</Label>
          <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+251..." className="mt-1.5" />
        </div>
        {fees && (
          <div className="space-y-3 border-t border-border pt-4 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">USD Amount</span><span className="font-mono">${fees.usdAmount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Exchange Rate</span><span className="font-mono">{rate.toLocaleString()} ETB</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Gateway Fee ({fees.gatewayFeePercentage}%)</span><span className="font-mono">{fees.gatewayFeeEtb.toLocaleString()} ETB</span></div>
            <div className="flex justify-between font-semibold pt-2 border-t border-border"><span>Total to Pay</span><span className="font-mono text-primary">{fees.totalPayableEtb.toLocaleString()} ETB</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Expected Service Balance</span><span className="font-mono font-semibold text-primary">${fees.finalUsdCredit.toFixed(2)}</span></div>
          </div>
        )}
        <div className="bg-secondary/40 rounded-lg p-3 text-xs text-muted-foreground flex gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>Funds added to your account are used for supported card-related service requests. All funding requests may be reviewed according to platform rules, partner provider requirements, and applicable compliance standards.</span>
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-xs text-muted-foreground">
          <Checkbox checked={acceptedNotice} onCheckedChange={(value) => setAcceptedNotice(Boolean(value))} className="mt-0.5" />
          <span>{checkoutAgreement}</span>
        </label>
        <LegalLinks />
        <Button
          className="w-full bg-primary text-primary-foreground h-12"
          disabled={!kycApproved || !fees || !phoneNumber || !acceptedNotice || startCheckout.isPending}
          onClick={() => startCheckout.mutate()}
        >
          {startCheckout.isPending ? 'Opening checkout...' : 'Continue to Secure Checkout'}
          {!startCheckout.isPending && <ExternalLink className="w-4 h-4 ml-2" />}
        </Button>
      </div>

      {latestDeposit && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-2 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle className="w-4 h-4 text-primary" />
            Recent Deposit
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono">{latestDeposit.transaction_reference}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize">{String(latestDeposit.status || '').replace(/_/g, ' ')}</span></div>
        </div>
      )}
    </div>
  );
}

