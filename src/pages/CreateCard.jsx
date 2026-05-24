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

const DEFAULT_CARD_NICKNAME = 'Virtual Card';

export default function CreateCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: wallet } = useWallet(user?.email);
  const { data: cards } = useCards(user?.email);
  const { data: kyc } = useKYCStatus(user?.email);
  const { data: settings } = useFeeSettings();

  const [fundingAmount, setFundingAmount] = useState('5');
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
    <div className="w-full max-w-2xl mx-auto space-y-4 sm:space-y-6 pb-24 lg:pb-0 px-1 sm:px-0">
      <div className="flex items-center gap-3">
        <Link to="/cards"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Request Virtual Card</h1>
          <p className="text-sm text-muted-foreground">Request a USD virtual card for supported online payments.</p>
        </div>
      </div>

      {!kycApproved && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-500">KYC Required</p>
            <p className="text-xs text-muted-foreground">Complete KYC verification before creating cards.</p>
            <Link to="/kyc"><Button size="sm" variant="outline" className="mt-2">Complete KYC</Button></Link>
          </div>
        </div>
      )}

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
      </div>

      {/* Card total */}
      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-3 shadow-sm">
        <h3 className="font-semibold text-sm">Card Total</h3>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-secondary/35 p-3">
              <p className="text-xs text-muted-foreground">Card cost</p>
              <p className="font-mono font-semibold">${fees.bitnobFee.toFixed(2)}</p>
            </div>
            <div className="rounded-xl bg-secondary/35 p-3">
              <p className="text-xs text-muted-foreground">Initial funding</p>
              <p className="font-mono font-semibold">${fees.fundingAmount.toFixed(2)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">You will use</span>
              <span className={`font-mono text-lg font-bold text-right ${fees.totalDeduction > balance ? 'text-destructive' : 'text-primary'}`}>
                ${fees.totalDeduction.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-secondary/40 rounded-xl p-4 text-xs text-muted-foreground space-y-3">
        <p>Cards are processed through our infrastructure partner. Merchant acceptance is not guaranteed.</p>
        <label className="flex items-start gap-3 rounded-lg border border-border p-3">
          <Checkbox checked={acceptedNotice} onCheckedChange={(value) => setAcceptedNotice(Boolean(value))} className="mt-0.5" />
          <span>{checkoutAgreement}</span>
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

