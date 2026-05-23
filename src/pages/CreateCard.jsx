import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrentUser, useWallet, useCards, useKYCStatus, useFeeSettings } from '@/hooks/useAppData';
import { calculateCardCreationFees } from '@/lib/feeCalculator';
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
  const minFunding = settings?.min_card_funding_usd || 1;
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
      toast.success('Virtual card request submitted.');
      navigate('/cards');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create card');
    }
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/cards"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Request Virtual Card</h1>
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

      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
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
          <p className="text-xs text-muted-foreground mt-1">Available service balance: ${balance.toFixed(2)} | Max funding: ${maxFunding.toFixed(2)}</p>
        </div>
      </div>

      {/* Card total */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-sm">Card Total</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Card creation cost</span><span className="font-mono">${fees.bitnobFee.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Initial Funding</span><span className="font-mono">${fees.fundingAmount.toFixed(2)}</span></div>
          <div className="flex justify-between font-semibold pt-2 border-t border-border">
            <span>Total Service Balance Deduction</span>
            <span className={`font-mono ${fees.totalDeduction > balance ? 'text-destructive' : 'text-primary'}`}>
              ${fees.totalDeduction.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Remaining Balance</span>
            <span className="font-mono">${Math.max(0, balance - fees.totalDeduction).toFixed(2)}</span>
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

