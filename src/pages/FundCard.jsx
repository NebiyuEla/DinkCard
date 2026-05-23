import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { useCards, useCurrentUser, useFeeSettings, useWallet } from '@/hooks/useAppData';
import { calculateCardFundingFees } from '@/lib/feeCalculator';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LegalLinks from '@/components/LegalLinks';
import { checkoutAgreement } from '@/lib/legal';
import { invalidateOperationalData } from '@/lib/realtime';

export default function FundCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { cardId } = useParams();
  const { data: user } = useCurrentUser();
  const { data: wallet } = useWallet(user?.email);
  const { data: cards } = useCards(user?.email);
  const { data: settings } = useFeeSettings();

  const preselectedId = cardId || new URLSearchParams(window.location.search).get('cardId') || '';
  const [selectedCardId, setSelectedCardId] = useState(preselectedId);
  const [amount, setAmount] = useState('');
  const [acceptedNotice, setAcceptedNotice] = useState(false);

  const balance = wallet?.available_balance || 0;
  const fundableCards = cards?.filter((card) => ['active', 'frozen'].includes(card.status)) || [];
  const selectedCard = fundableCards.find((card) => card.id === selectedCardId);
  const fundAmount = parseFloat(amount) || 0;
  const fees = useMemo(() => calculateCardFundingFees(fundAmount, settings || {}), [fundAmount, settings]);
  const minFunding = settings?.min_card_funding_usd || 1;
  const maxFunding = useMemo(() => {
    const configuredMax = settings?.max_card_funding_usd || 500;
    let low = 0;
    let high = Math.min(configuredMax, balance);
    for (let index = 0; index < 24; index += 1) {
      const mid = (low + high) / 2;
      if (calculateCardFundingFees(mid, settings || {}).totalDeduction <= balance) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return Math.floor(low * 100) / 100;
  }, [balance, settings]);
  const canFund = selectedCard && fundAmount >= minFunding && fundAmount <= maxFunding && fees.totalDeduction <= balance && acceptedNotice;

  const fundCard = useMutation({
    mutationFn: async () => apiClient.cards.fund(selectedCard.id, fundAmount),
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      toast.success('Funding request sent. The card balance updates after provider confirmation.');
      navigate('/cards');
    },
    onError: (error) => toast.error(error.message || 'Funding failed')
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/cards"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Fund Card</h1>
          <p className="text-sm text-muted-foreground">Use available service balance for card funding.</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <div>
          <Label className="text-sm font-medium">Select Card</Label>
          <Select value={selectedCardId} onValueChange={setSelectedCardId}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose a card" /></SelectTrigger>
            <SelectContent>
              {fundableCards.map((card) => (
                <SelectItem key={card.id} value={card.id}>
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    <span>{card.card_nickname}</span>
                    <span className="text-muted-foreground font-mono text-xs">**** {card.last_four || '----'}</span>
                    <span className="text-muted-foreground font-mono text-xs">${(card.balance || 0).toFixed(2)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCard && (
          <div className="bg-secondary/50 rounded-lg p-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Current card balance</span>
            <span className="font-mono font-semibold">${(selectedCard.balance || 0).toFixed(2)}</span>
          </div>
        )}

        <div>
          <Label className="text-sm font-medium">Amount (USD)</Label>
          <div className="mt-1.5 flex gap-2">
            <div className="relative flex-1">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="pl-9 font-mono" min={minFunding} max={maxFunding} />
            </div>
            <Button type="button" variant="outline" onClick={() => setAmount(maxFunding.toFixed(2))} disabled={maxFunding <= 0}>
              Max
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Available service balance: ${balance.toFixed(2)} | Max: ${maxFunding.toFixed(2)}</p>
        </div>
      </div>

      {fundAmount > 0 && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-3">
          <h3 className="font-semibold text-sm">Card Funding</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Funding Amount</span><span className="font-mono">${fees.amount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Card top-up cost</span><span className="font-mono">${fees.fundingFee.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold pt-2 border-t border-border">
              <span>Total Deduction</span>
              <span className={`font-mono ${fees.totalDeduction > balance ? 'text-destructive' : 'text-primary'}`}>${fees.totalDeduction.toFixed(2)}</span>
            </div>
            {selectedCard && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Estimated Card Balance</span>
                <span className="font-mono">${((selectedCard.balance || 0) + fundAmount).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-secondary/40 rounded-xl p-4 text-xs text-muted-foreground space-y-3">
        <p>All payments and card requests are subject to verification, provider approval, service availability, and compliance review.</p>
        <label className="flex items-start gap-3 rounded-lg border border-border p-3">
          <Checkbox checked={acceptedNotice} onCheckedChange={(value) => setAcceptedNotice(Boolean(value))} className="mt-0.5" />
          <span>{checkoutAgreement}</span>
        </label>
        <LegalLinks />
      </div>

      <Button
        className="w-full bg-primary text-primary-foreground h-12 text-base font-semibold"
        disabled={!canFund || fundCard.isPending}
        onClick={() => fundCard.mutate()}
      >
        {fundCard.isPending ? 'Funding...' : 'Fund Card'}
      </Button>
    </div>
  );
}
