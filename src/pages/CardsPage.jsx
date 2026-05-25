import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Copy, CreditCard, DollarSign, Eye, EyeOff, Play, Plus, Shield, Snowflake, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { apiClient } from '@/api/client';
import { useCurrentUser, useCards } from '@/hooks/useAppData';
import VirtualCardDisplay from '@/components/ui-custom/VirtualCardDisplay';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import EmptyState from '@/components/ui-custom/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidateOperationalData } from '@/lib/realtime';

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function detailValue(...values) {
  return values.find((value) => String(value || '').trim()) || '-';
}

function normalizeCardStatus(status) {
  const value = String(status || 'pending').toLowerCase();
  if (['active', 'approved', 'ready', 'live'].includes(value)) return 'active';
  if (['frozen', 'freeze', 'locked', 'suspended'].includes(value)) return 'frozen';
  if (['terminated', 'deleted', 'closed', 'cancelled', 'canceled'].includes(value)) return 'terminated';
  return value;
}

export default function CardsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const { data: cards } = useCards(user?.email);
  const [selectedCard, setSelectedCard] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [secureDetails, setSecureDetails] = useState(null);

  const refreshCards = () => {
    invalidateOperationalData(queryClient);
  };

  const updateStatus = useMutation({
    mutationFn: ({ cardId, status, pinCode }) => apiClient.cards.updateStatus(cardId, status, pinCode),
    onSuccess: () => {
      refreshCards();
      setConfirmDialog(null);
      setPin('');
    },
    onError: (error) => toast.error(error.message || 'Card update failed')
  });

  const terminateCard = useMutation({
    mutationFn: ({ cardId, pin: pinCode }) => apiClient.cards.terminate(cardId, pinCode),
    onSuccess: () => {
      refreshCards();
      setConfirmDialog(null);
      setPin('');
      toast.success('Card terminated');
    },
    onError: (error) => toast.error(error.message || 'Termination failed')
  });

  const revealCard = useMutation({
    mutationFn: () => apiClient.cards.reveal(selectedCard.id, pin),
    onSuccess: (details) => {
      setSecureDetails(details);
      setConfirmDialog(null);
      setPin('');
      toast.success('Card details revealed');
    },
    onError: (error) => toast.error(error.message || 'Could not reveal card details')
  });

  const setCardPin = useMutation({
    mutationFn: () => apiClient.cards.setPin(selectedCard.id, newPin),
    onSuccess: (updatedCard) => {
      refreshCards();
      setSelectedCard((current) => current ? { ...current, ...(updatedCard || {}), card_pin_enabled_at: updatedCard?.card_pin_enabled_at || new Date().toISOString() } : current);
      setConfirmDialog(null);
      setNewPin('');
      setConfirmPin('');
      toast.success('Card PIN saved');
    },
    onError: (error) => toast.error(error.message || 'Could not save card PIN')
  });

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const activeCards = useMemo(() => cards?.filter((card) => normalizeCardStatus(card.status) !== 'terminated') || [], [cards]);
  const selectedBillingAddress = parseJson(selectedCard?.billing_address);
  const shownAddress = secureDetails?.billing_address || selectedBillingAddress || {};
  const selectedStatus = normalizeCardStatus(selectedCard?.status);
  const fullExpiry = [
    detailValue(secureDetails?.expiry_month, selectedCard?.expiry_month),
    detailValue(secureDetails?.expiry_year, selectedCard?.expiry_year)
  ].join('/');
  const cardTransactions = useQuery({
    queryKey: ['card-transactions', selectedCard?.id],
    queryFn: () => apiClient.cards.transactions(selectedCard.id),
    enabled: Boolean(selectedCard?.id),
    retry: false
  });
  const cardTransactionRows = cardTransactions.data?.transactions || [];

  useEffect(() => {
    if (activeCards.length > 0 && (!selectedCard || !activeCards.some((card) => card.id === selectedCard.id))) {
      setSelectedCard(activeCards[0]);
    }
  }, [activeCards, selectedCard]);

  return (
    <div className="space-y-5 pb-36 lg:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Virtual Cards</h1>
          <p className="text-sm text-muted-foreground">Manage virtual cards for supported online payments.</p>
        </div>
        <Link to="/cards/create">
          <Button className="bg-primary text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" /> Request Card
          </Button>
        </Link>
      </div>

      {activeCards.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No virtual cards"
          description="Create your first virtual card to start paying online."
          actionLabel="Request Card"
          onAction={() => navigate('/cards/create')}
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-6">
          <div className="space-y-3">
            {activeCards.map((card) => (
              <div
                key={card.id}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedCard(card);
                  setSecureDetails(null);
                }}
              >
                <VirtualCardDisplay
                  card={{
                    ...card,
                    status: normalizeCardStatus(card.status),
                    card_number_encrypted: secureDetails?.card_number,
                    cvv_encrypted: secureDetails?.cvv,
                    expiry_month: secureDetails?.expiry_month || card.expiry_month,
                    expiry_year: secureDetails?.expiry_year || card.expiry_year
                  }}
                  compact
                />
              </div>
            ))}
          </div>

          {selectedCard && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="rounded-2xl border border-border bg-card/60 p-3 sm:p-5">
                <div className="flex justify-center">
                <VirtualCardDisplay
                  card={{
                    ...selectedCard,
                    status: selectedStatus,
                    card_number_encrypted: secureDetails?.card_number,
                    cvv_encrypted: secureDetails?.cvv,
                    expiry_month: secureDetails?.expiry_month || selectedCard.expiry_month,
                    expiry_year: secureDetails?.expiry_year || selectedCard.expiry_year
                  }}
                  showDetails={Boolean(secureDetails)}
                />
                </div>
                {secureDetails && (
                  <div className="mx-auto mt-3 grid max-w-[340px] grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-secondary/40 p-2">
                      <p className="text-muted-foreground">Address</p>
                      <p className="mt-1 break-words">{detailValue(secureDetails?.address, shownAddress.address, shownAddress.street, shownAddress.line1)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/40 p-2">
                      <p className="text-muted-foreground">ZIP / Postal</p>
                      <p className="mt-1 font-mono">{detailValue(secureDetails?.postal_code, shownAddress.postal_code, shownAddress.zip)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/40 p-2">
                      <p className="text-muted-foreground">City</p>
                      <p className="mt-1">{detailValue(secureDetails?.city, shownAddress.city)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/40 p-2">
                      <p className="text-muted-foreground">State / Country</p>
                      <p className="mt-1">{[detailValue(secureDetails?.state, shownAddress.state, shownAddress.region), detailValue(secureDetails?.country, shownAddress.country)].filter((part) => part !== '-').join(', ') || '-'}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {!selectedCard.card_pin_enabled_at && (
                  <Button variant="outline" className="col-span-2" onClick={() => setConfirmDialog('set-pin')}>
                    <Shield className="w-4 h-4 mr-2" /> Create 4-digit card PIN
                  </Button>
                )}
                {!secureDetails ? (
                  <Button variant="outline" className="col-span-2" onClick={() => setConfirmDialog(selectedCard.card_pin_enabled_at ? 'reveal' : 'set-pin')}>
                    <Eye className="w-4 h-4 mr-2" /> Reveal Details
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setSecureDetails(null)}>
                      <EyeOff className="w-4 h-4 mr-2" /> Hide
                    </Button>
                    <Button variant="outline" onClick={() => copyToClipboard(secureDetails.card_number, 'Card number')}>
                      <Copy className="w-4 h-4 mr-2" /> Copy Number
                    </Button>
                  </>
                )}

                <Link to={`/cards/fund?cardId=${selectedCard.id}`} className="col-span-2">
                  <Button className="w-full bg-primary text-primary-foreground">
                    <DollarSign className="w-4 h-4 mr-2" /> Fund Card
                  </Button>
                </Link>

                {selectedStatus === 'active' ? (
                  <Button variant="outline" className="col-span-2 mx-auto w-full max-w-xs" onClick={() => setConfirmDialog(selectedCard.card_pin_enabled_at ? 'freeze' : 'set-pin')}>
                    <Snowflake className="w-4 h-4 mr-2" /> Freeze
                  </Button>
                ) : selectedStatus === 'frozen' ? (
                  <Button variant="outline" className="col-span-2 mx-auto w-full max-w-xs" onClick={() => setConfirmDialog(selectedCard.card_pin_enabled_at ? 'unfreeze' : 'set-pin')}>
                    <Play className="w-4 h-4 mr-2" /> Unfreeze
                  </Button>
                ) : null}

              </div>

              <div className="bg-card border border-border rounded-xl p-4 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={selectedStatus} /></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span className="font-mono font-semibold text-primary">${Number(selectedCard.balance || 0).toFixed(2)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Dink Card usage fee</span><span className="text-right font-medium">$0.00</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Card number</span><span className="break-all text-right font-mono">{secureDetails?.card_number || selectedCard.masked_pan || `**** ${selectedCard.last_four || '----'}`}</span></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-secondary/40 p-3">
                    <p className="text-xs text-muted-foreground">CVV</p>
                    <p className="mt-1 font-mono font-semibold">{secureDetails?.cvv || '***'}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 p-3">
                    <p className="text-xs text-muted-foreground">Expiry</p>
                    <p className="mt-1 font-mono font-semibold">{fullExpiry.replace('-/', '**/').replace('/-', '/**')}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">Card Transactions</p>
                  {cardTransactions.isFetching && <span className="text-xs text-muted-foreground">Loading...</span>}
                </div>
                {!cardTransactionRows.length ? (
                  <p className="text-sm text-muted-foreground">No card transactions yet.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {cardTransactionRows.slice(0, 8).map((tx, index) => (
                      <div key={tx.id || tx.reference || index} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium capitalize">{String(tx.type || tx.description || 'Transaction').replace(/_/g, ' ')}</p>
                          <p className="truncate text-xs text-muted-foreground">{tx.status || tx.reference || ''}</p>
                        </div>
                        <p className="shrink-0 font-mono font-semibold">${Number(tx.amount || tx.display_amount || 0).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-10 rounded-xl border border-destructive/20 bg-destructive/5 p-4 lg:mb-0">
                <p className="text-sm font-semibold text-destructive">Danger Zone</p>
                <p className="mt-1 text-xs text-muted-foreground">Terminate only when you are done with this card. If you set a PIN, you will need it here too.</p>
                <Button variant="outline" className="mt-3 text-destructive hover:text-destructive" onClick={() => setConfirmDialog('terminate')}>
                  <Trash2 className="mr-2 h-4 w-4" /> Terminate Card
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      )}

      <Dialog open={confirmDialog === 'reveal'} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter card PIN</DialogTitle>
            <DialogDescription>Use your 4-digit card PIN before showing sensitive card details.</DialogDescription>
          </DialogHeader>
          <Input type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4-digit card PIN" maxLength={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button onClick={() => revealCard.mutate()} className="bg-primary text-primary-foreground" disabled={!pin || revealCard.isPending}>
              {revealCard.isPending ? 'Checking...' : 'Reveal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialog === 'set-pin'} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create card PIN</DialogTitle>
            <DialogDescription>This 4-digit PIN is used to reveal, lock, and unlock the card.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="password" inputMode="numeric" pattern="[0-9]*" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Enter 4-digit PIN" maxLength={4} />
            <Input type="password" inputMode="numeric" pattern="[0-9]*" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Confirm 4-digit PIN" maxLength={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button onClick={() => setCardPin.mutate()} className="bg-primary text-primary-foreground" disabled={!/^\d{4}$/.test(newPin) || newPin !== confirmPin || setCardPin.isPending}>
              {setCardPin.isPending ? 'Saving...' : 'Save PIN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialog === 'freeze' || confirmDialog === 'unfreeze'} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog === 'freeze' ? 'Lock card' : 'Unlock card'}</DialogTitle>
            <DialogDescription>Enter your 4-digit card PIN to continue.</DialogDescription>
          </DialogHeader>
          <Input type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4-digit card PIN" maxLength={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button
              onClick={() => updateStatus.mutate({ cardId: selectedCard.id, status: confirmDialog === 'freeze' ? 'frozen' : 'active', pinCode: pin })}
              className="bg-primary text-primary-foreground"
              disabled={!pin || updateStatus.isPending}
            >
              {updateStatus.isPending ? 'Updating...' : confirmDialog === 'freeze' ? 'Lock card' : 'Unlock card'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialog === 'terminate'} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Terminate Card
            </DialogTitle>
            <DialogDescription>This action is permanent. Any refundable remaining balance will be returned to your available service balance after the provider confirms termination.</DialogDescription>
          </DialogHeader>
          {selectedCard?.card_pin_enabled_at && (
            <Input type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4-digit card PIN" maxLength={4} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => terminateCard.mutate({ cardId: selectedCard.id, pin })} disabled={terminateCard.isPending || (selectedCard?.card_pin_enabled_at && pin.length !== 4)}>
              {terminateCard.isPending ? 'Terminating...' : 'Terminate Card'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

