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
  const [showFeeDetails, setShowFeeDetails] = useState(false);

  const amount = Number(usdAmount || 0);
  const rate = settings?.usd_to_etb_rate || 190;
  const fees = useMemo(() => {
    if (!amount) return null;
    return calculateDepositFees(amount, rate, settings || {});
  }, [amount, rate, settings]);
  const displayStyle = fees?.feeDisplayStyle || settings?.customer_fee_display_style || 'hybrid';
  const shouldShowDetails = displayStyle === 'detailed' || (displayStyle === 'hybrid' && showFeeDetails);

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
          <h1 className="text-2xl font-bold">Add Funds</h1>
          <p className="text-sm text-muted-foreground">Pay in ETB for supported virtual card-related services.</p>
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
          <Label className="text-sm font-medium">Card amount in USD</Label>
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
            <div className="flex justify-between"><span className="text-muted-foreground">Card amount</span><span className="font-mono">${fees.cardAmountUsd.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Exchange rate used</span><span className="font-mono">1 USD = {fees.exchangeRate.toLocaleString()} ETB</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Service & processing fee</span><span className="font-mono">{fees.serviceAndProcessingFeeEtb.toLocaleString()} ETB</span></div>
            <div className="flex justify-between font-semibold pt-2 border-t border-border"><span>Total payable</span><span className="font-mono text-primary">{fees.totalPayableEtb.toLocaleString()} ETB</span></div>

            {displayStyle === 'hybrid' && (
              <button
                type="button"
                onClick={() => setShowFeeDetails((value) => !value)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {shouldShowDetails ? 'Hide fee details' : 'View fee details'}
              </button>
            )}

            {shouldShowDetails && (
              <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Card creation/top-up cost</span><span className="font-mono">{fees.providerCostEtb.toLocaleString()} ETB</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Payment processing fee</span><span className="font-mono">{fees.gatewayFeeEtb.toLocaleString()} ETB</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Dink Card service fee</span><span className="font-mono">{fees.dinkServiceFeeEtb.toLocaleString()} ETB</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Exchange-rate protection</span><span className="font-mono">{fees.safetyBufferEtb.toLocaleString()} ETB</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Rounding adjustment</span><span className="font-mono">{fees.roundingAdjustmentEtb.toLocaleString()} ETB</span></div>
                <p className="pt-2 text-muted-foreground">Some international websites or failed transactions may create extra card-related fees. We will notify you if this applies.</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              The total includes card processing, payment gateway cost, exchange-rate protection, and Dink Card service fee.
            </p>
            <div className="flex justify-between"><span className="text-muted-foreground">Expected service balance</span><span className="font-mono font-semibold text-primary">${fees.finalUsdCredit.toFixed(2)}</span></div>
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
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle className="w-4 h-4 text-primary" />
              Recent Deposit
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(apiClient.payments.invoiceUrl(latestDeposit.transaction_reference), '_blank')}
            >
              Download invoice
            </Button>
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono">{latestDeposit.transaction_reference}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize">{String(latestDeposit.status || '').replace(/_/g, ' ')}</span></div>
        </div>
      )}
    </div>
  );
}

