import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, DollarSign, ExternalLink } from 'lucide-react';
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: settings } = useFeeSettings();
  const { data: kyc } = useKYCStatus(user?.email);
  const { data: deposits } = useDeposits(user?.email);
  const [amountMode, setAmountMode] = useState('usd');
  const [enteredAmount, setEnteredAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(user?.phone || '');
  const [statusMessage, setStatusMessage] = useState('');
  const [acceptedNotice, setAcceptedNotice] = useState(false);
  const [showFeeDetails, setShowFeeDetails] = useState(false);

  const rate = settings?.usd_to_etb_rate || 190;
  const amount = useMemo(() => {
    const numeric = Number(enteredAmount || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return amountMode === 'etb' ? numeric / rate : numeric;
  }, [amountMode, enteredAmount, rate]);
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

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/dashboard');
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 sm:space-y-6 pb-24 lg:pb-0 px-1 sm:px-0">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" onClick={goBack}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Add Funds</h1>
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

      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-sm">
        <div>
          <Label className="text-sm font-medium">Card amount</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <Button type="button" variant={amountMode === 'usd' ? 'default' : 'outline'} className={amountMode === 'usd' ? 'bg-primary text-primary-foreground' : ''} onClick={() => setAmountMode('usd')}>
              Enter USD
            </Button>
            <Button type="button" variant={amountMode === 'etb' ? 'default' : 'outline'} className={amountMode === 'etb' ? 'bg-primary text-primary-foreground' : ''} onClick={() => setAmountMode('etb')}>
              Enter ETB
            </Button>
          </div>
          <div className="relative mt-1.5">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="number"
              value={enteredAmount}
              onChange={(e) => setEnteredAmount(e.target.value)}
              min={amountMode === 'etb' ? (settings?.min_deposit_usd || 5) * rate : (settings?.min_deposit_usd || 5)}
              max={amountMode === 'etb' ? (settings?.max_deposit_usd || 1000) * rate : (settings?.max_deposit_usd || 1000)}
              className="pl-9 h-12 font-mono"
              placeholder={amountMode === 'etb' ? 'Enter ETB amount' : 'Enter USD amount'}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {amountMode === 'etb'
              ? `Estimated card amount: $${amount.toFixed(2)} at 1 USD = ${rate.toFixed(2)} ETB`
              : `Equivalent conversion amount: ${(amount * rate).toFixed(2)} ETB`}
          </p>
        </div>
        <div>
          <Label className="text-sm font-medium">Phone Number</Label>
          <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+251..." className="mt-1.5" />
        </div>
        {fees && (
          <div className="space-y-3 border-t border-border pt-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-secondary/35 p-3">
                <p className="text-xs text-muted-foreground">Card amount</p>
                <p className="font-mono font-semibold">${fees.cardAmountUsd.toFixed(2)}</p>
              </div>
              <div className="rounded-xl bg-secondary/35 p-3">
                <p className="text-xs text-muted-foreground">Exchange rate</p>
                <p className="font-mono font-semibold">1 USD = {fees.exchangeRate.toLocaleString()} ETB</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/35 p-3">
              <span className="text-muted-foreground">Conversion amount</span>
              <span className="font-mono font-semibold text-right">{fees.etbAmount.toLocaleString()} ETB</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/35 p-3">
              <span className="text-muted-foreground">Fees & charges</span>
              <span className="font-mono font-semibold text-right">{fees.dinkServiceFeeEtb.toLocaleString()} ETB</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/35 p-3">
              <span className="text-muted-foreground">Gateway fee (%)</span>
              <span className="font-mono font-semibold text-right">{fees.gatewayFeePercentage.toFixed(2)}%</span>
            </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">Total payable</span>
                <span className="font-mono text-lg font-bold text-primary text-right">{fees.totalPayableEtb.toLocaleString()} ETB</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">You will get ${fees.finalUsdCredit.toFixed(2)} available service balance.</p>
            </div>

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
                <div className="flex justify-between"><span className="text-muted-foreground">Fixed charge</span><span className="font-mono">{(settings?.minimum_service_fee_etb ?? 100).toLocaleString()} ETB</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Charge percentage</span><span className="font-mono">{(settings?.service_margin_percentage ?? 15).toFixed(2)}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Payment processing fee</span><span className="font-mono">{fees.gatewayFeeEtb.toLocaleString()} ETB</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Dink Card service fee</span><span className="font-mono">{fees.dinkServiceFeeEtb.toLocaleString()} ETB</span></div>
                <p className="pt-2 text-muted-foreground">Some international websites or failed transactions may create extra card-related fees. We will notify you if this applies.</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              The total includes card processing, payment gateway cost, exchange-rate protection, and Dink Card service fee.
            </p>
          </div>
        )}
        <label className="flex items-start gap-3 rounded-xl border-2 border-primary/25 bg-card p-3 text-sm text-foreground">
          <Checkbox checked={acceptedNotice} onCheckedChange={(value) => setAcceptedNotice(Boolean(value))} className="mt-0.5 h-6 w-6 border-primary bg-background" />
          <span className="leading-5">{checkoutAgreement}</span>
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
        <div className="bg-card border border-border rounded-xl p-4 sm:p-6 space-y-3 text-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <span className="text-muted-foreground">Reference</span>
            <span className="break-all font-mono text-right sm:max-w-[70%]">{latestDeposit.transaction_reference}</span>
          </div>
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Status</span><span className="capitalize text-right">{String(latestDeposit.status || '').replace(/_/g, ' ')}</span></div>
        </div>
      )}
    </div>
  );
}

