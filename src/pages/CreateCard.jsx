import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrentUser, useWallet, useCards, useKYCStatus, useFeeSettings } from '@/hooks/useAppData';
import { calculateCardCreationFees, getEffectiveMinCardCreation } from '@/lib/feeCalculator';
import { apiClient } from '@/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import LegalLinks from '@/components/LegalLinks';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { checkoutAgreement } from '@/lib/legal';
import { invalidateOperationalData } from '@/lib/realtime';
import KycRequiredNotice from '@/components/KycRequiredNotice';

const DEFAULT_CARD_NICKNAME = 'Virtual Card';

export default function CreateCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: wallet } = useWallet(user?.email);
  const { data: cards } = useCards(user?.email);
  const { data: kyc, isLoading: kycLoading } = useKYCStatus(user?.email);
  const { data: settings } = useFeeSettings();

  const [fundingAmount, setFundingAmount] = useState('3');
  const [acceptedNotice, setAcceptedNotice] = useState(false);

  const balance = wallet?.available_balance || 0;
  const maxCards = Math.min(settings?.max_cards_per_user || 3, 3);
  const activeCardCount = cards?.filter(c => c.status !== 'terminated').length || 0;
  const kycApproved = kyc?.status === 'approved';
  const amount = parseFloat(fundingAmount) || 0;
  const fees = calculateCardCreationFees(amount, settings || {});
  const bitnobFee = settings?.card_creation_fee_usd ?? 1;
  const minFunding = getEffectiveMinCardCreation(settings || {});
  const maxFundingByBalance = Math.max(0, balance - bitnobFee);
  const maxFunding = Math.max(0, Math.min(maxFundingByBalance, settings?.max_card_funding_usd || 500));

  const canCreate = kycApproved && 
    amount >= minFunding && 
    amount <= maxFunding &&
    fees.totalDeduction <= balance && 
    activeCardCount < maxCards &&
    acceptedNotice;

  const createCard = useMutation({
    mutationFn: () => apiClient.cards.create({ nickname: DEFAULT_CARD_NICKNAME, cardType: 'credit_card', fundingAmount: amount }),
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      toast.success('Virtual card created. Open the card and set your 4-digit PIN.');
      navigate('/cards');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create card');
    }
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-4 sm:space-y-6 lg:pb-0">
      <div className="flex items-center gap-3">
        <Link to="/cards"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Request Virtual Card</h1>
          <p className="text-sm text-muted-foreground">Request a USD virtual card for supported online payments.</p>
        </div>
      </div>

      {!kycLoading && !kycApproved && <KycRequiredNotice status={kyc?.status} />}

      {activeCardCount >= maxCards && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">You've reached the maximum of {maxCards} active card requests.</p>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-sm">
        <div>
          <Label className="text-sm font-medium">Initial Funding Amount (USD)</Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              type="number"
              value={fundingAmount}
              onChange={e => setFundingAmount(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && canCreate && !createCard.isPending) {
                  e.preventDefault();
                  createCard.mutate();
                }
              }}
              className="font-mono"
              min={minFunding}
              max={maxFunding}
            />
            <Button type="button" variant="outline" onClick={() => setFundingAmount(maxFunding.toFixed(2))} disabled={maxFunding <= 0}>
              Max
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Minimum starting card amount: ${minFunding.toFixed(2)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-secondary/40 p-2">
              <p className="text-muted-foreground">Available</p>
              <p className="font-mono font-semibold">${balance.toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-secondary/40 p-2">
              <p className="text-muted-foreground">Max funding</p>
              <p className="font-mono font-semibold">${maxFunding.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-secondary/25 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Simple deduction</p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-background/80 px-3 py-2">
              <p className="text-muted-foreground">Card balance</p>
              <p className="font-mono font-semibold">${amount.toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-background/80 px-3 py-2">
              <p className="text-muted-foreground">Card fee</p>
              <p className="font-mono font-semibold">${bitnobFee.toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-background/80 px-3 py-2">
              <p className="text-muted-foreground">Total deducted</p>
              <p className="font-mono font-semibold text-primary">${fees.totalDeduction.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-secondary/40 rounded-xl p-4 text-xs text-muted-foreground space-y-3">
        <label className="flex items-start gap-3 rounded-xl border-2 border-primary/25 bg-card p-3 text-sm text-foreground">
          <Checkbox checked={acceptedNotice} onCheckedChange={(value) => setAcceptedNotice(Boolean(value))} className="mt-0.5 h-6 w-6 border-primary bg-background" />
          <span className="leading-5">{checkoutAgreement}</span>
        </label>
        <LegalLinks />
      </div>

      <Button 
        className="w-full bg-primary text-primary-foreground h-12 text-base font-semibold" 
        disabled={!canCreate || createCard.isPending}
        onClick={() => createCard.mutate()}
      >
        {createCard.isPending ? 'Submitting Request...' : 'Request Virtual Card'}
      </Button>
    </div>
  );
}

