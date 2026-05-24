import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
    mutationFn: (cardId) => apiClient.cards.terminate(cardId),
    onSuccess: () => {
      refreshCards();
      setConfirmDialog(null);
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
    onSuccess: () => {
      refreshCards();
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

  const activeCards = useMemo(() => cards?.filter((card) => card.status !== 'terminated') || [], [cards]);

  useEffect(() => {
    if (activeCards.length > 0 && (!selectedCard || !activeCards.some((card) => card.id === selectedCard.id))) {
      setSelectedCard(activeCards[0]);
    }
  }, [activeCards, selectedCard]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
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
              <div className="flex justify-center">
                <VirtualCardDisplay
                  card={{
                    ...selectedCard,
                    card_number_encrypted: secureDetails?.card_number,
                    cvv_encrypted: secureDetails?.cvv,
                    expiry_month: secureDetails?.expiry_month || selectedCard.expiry_month,
                    expiry_year: secureDetails?.expiry_year || selectedCard.expiry_year
                  }}
                  showDetails={Boolean(secureDetails)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
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

                {selectedCard.status === 'active' ? (
                  <Button variant="outline" onClick={() => setConfirmDialog(selectedCard.card_pin_enabled_at ? 'freeze' : 'set-pin')}>
                    <Snowflake className="w-4 h-4 mr-2" /> Freeze
                  </Button>
                ) : selectedCard.status === 'frozen' ? (
                  <Button variant="outline" onClick={() => setConfirmDialog(selectedCard.card_pin_enabled_at ? 'unfreeze' : 'set-pin')}>
                    <Play className="w-4 h-4 mr-2" /> Unfreeze
                  </Button>
                ) : null}

                <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmDialog('terminate')}>
                  <Trash2 className="w-4 h-4 mr-2" /> Terminate
                </Button>
              </div>

              <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={selectedCard.status} /></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span className="font-mono font-semibold text-primary">${(selectedCard.balance || 0).toFixed(2)}</span></div>
              </div>
            </motion.div>
          )}
        </div>
      )}

      <Dialog open={confirmDialog === 'reveal'} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter card PIN</DialogTitle>
            <DialogDescription>Use your 4-digit card PIN before fetching sensitive card details from Bitnob.</DialogDescription>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => terminateCard.mutate(selectedCard.id)} disabled={terminateCard.isPending}>
              {terminateCard.isPending ? 'Terminating...' : 'Terminate Card'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

