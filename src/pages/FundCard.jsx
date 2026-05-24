import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { useCards, useCurrentUser, useFeeSettings, useWallet } from '@/hooks/useAppData';
import { calculateCardFundingFees, getEffectiveMinCardFunding } from '@/lib/feeCalculator';
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
  const minFunding = getEffectiveMinCardFunding(settings || {});
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
    <div className="w-full max-w-2xl mx-auto space-y-4 sm:space-y-6 pb-24 lg:pb-0 px-1 sm:px-0">
      <div className="flex items-center gap-3">
        <Link to="/cards"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Fund Card</h1>
          <p className="text-sm text-muted-foreground">Use available service balance for card funding.</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-sm">
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
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-secondary/40 p-2">
              <p className="text-muted-foreground">Available</p>
              <p className="font-mono font-semibold">${balance.toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-secondary/40 p-2">
              <p className="text-muted-foreground">Max</p>
              <p className="font-mono font-semibold">${maxFunding.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {fundAmount > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-3 shadow-sm">
          <h3 className="font-semibold text-sm">Card Funding</h3>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-secondary/35 p-3">
                <p className="text-xs text-muted-foreground">Funding</p>
                <p className="font-mono font-semibold">${fees.amount.toFixed(2)}</p>
              </div>
              <div className="rounded-xl bg-secondary/35 p-3">
                <p className="text-xs text-muted-foreground">Top-up cost</p>
                <p className="font-mono font-semibold">${fees.fundingFee.toFixed(2)}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">You will use</span>
                <span className={`font-mono text-lg font-bold text-right ${fees.totalDeduction > balance ? 'text-destructive' : 'text-primary'}`}>${fees.totalDeduction.toFixed(2)}</span>
              </div>
            </div>
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
