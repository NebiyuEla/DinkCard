import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BadgeCheck, CreditCard, Eye, PauseCircle, Plus, RefreshCw, Search, Send, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from '@/components/ui-custom/StatusBadge';

const EMPTY_CUSTOMER = {
  customer_type: 'individual',
  first_name: '',
  last_name: '',
  date_of_birth: '',
  id_type: 'national_id',
  id_number: '',
  email: '',
  phone_number: '',
  dial_code: '+251',
  country: 'ETH',
  address: '',
  city: 'Addis Ababa',
  reason: ''
};

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function getName(customer) {
  return [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || customer?.email || 'Customer';
}

function Stat({ label, value, icon: Icon, tone = 'text-primary' }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <p className="mt-1 text-lg font-semibold leading-none">{value}</p>
    </div>
  );
}

export default function AdminCards() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCustomer, setShowCustomer] = useState(false);
  const [showCreateCard, setShowCreateCard] = useState(false);
  const [actionCard, setActionCard] = useState(null);
  const [action, setAction] = useState('');
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER);
  const [cardForm, setCardForm] = useState({ customerId: '', nickname: 'Virtual Card', name: '', amount: '5', reason: '' });
  const [actionForm, setActionForm] = useState({ amount: '', reason: '' });
  const [secureDetails, setSecureDetails] = useState(null);

  const customersQuery = useQuery({ queryKey: ['bitnob-customers'], queryFn: apiClient.admin.customers.list, refetchInterval: REFRESH.admin });
  const cardsQuery = useQuery({ queryKey: ['admin-cards'], queryFn: apiClient.admin.cards.list, refetchInterval: REFRESH.admin });
  const balancesQuery = useQuery({ queryKey: ['bitnob-balances'], queryFn: apiClient.admin.balances, refetchInterval: REFRESH.fees, retry: false });
  const txQuery = useQuery({ queryKey: ['bitnob-transactions'], queryFn: apiClient.admin.cards.allTransactions, refetchInterval: REFRESH.admin, retry: false });
  const auditQuery = useQuery({ queryKey: ['audit-logs'], queryFn: apiClient.admin.auditLogs, refetchInterval: REFRESH.admin });

  const customers = customersQuery.data || [];
  const cards = cardsQuery.data || [];
  const transactions = txQuery.data?.transactions || [];
  const auditLogs = auditQuery.data || [];

  const filteredCustomers = customers.filter((customer) => {
    const haystack = `${getName(customer)} ${customer.email || ''} ${customer.bitnob_customer_id || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const filteredCards = cards.filter((card) => {
    const haystack = `${card.card_nickname || ''} ${card.user_id || ''} ${card.masked_pan || ''} ${card.provider_card_id || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const stats = useMemo(() => {
    const active = cards.filter((card) => card.status === 'active').length;
    const frozen = cards.filter((card) => card.status === 'frozen').length;
    const totalBalance = cards.reduce((sum, card) => sum + Number(card.balance || 0), 0);
    return { active, frozen, totalBalance };
  }, [cards]);

  const createCustomer = useMutation({
    mutationFn: apiClient.admin.customers.create,
    onSuccess: () => {
      toast.success('Customer created');
      setShowCustomer(false);
      setCustomerForm(EMPTY_CUSTOMER);
      invalidateOperationalData(queryClient);
      queryClient.invalidateQueries({ queryKey: ['bitnob-customers'] });
    },
    onError: (error) => toast.error(error.message || 'Customer creation failed')
  });

  const createCard = useMutation({
    mutationFn: apiClient.admin.cards.create,
    onSuccess: () => {
      toast.success('Card creation requested');
      setShowCreateCard(false);
      setCardForm({ customerId: '', nickname: 'Virtual Card', name: '', amount: '5', reason: '' });
      invalidateOperationalData(queryClient);
    },
    onError: (error) => toast.error(error.message || 'Card creation failed')
  });

  const cardAction = useMutation({
    mutationFn: async () => {
      if (!actionCard) throw new Error('Select a card first.');
      if (action === 'fund') return apiClient.admin.cards.fund(actionCard.id, { amount: Number(actionForm.amount), reason: actionForm.reason });
      if (action === 'withdraw') return apiClient.admin.cards.withdraw(actionCard.id, { amount: Number(actionForm.amount), reason: actionForm.reason });
      if (action === 'freeze') return apiClient.admin.cards.freeze(actionCard.id, { reason: actionForm.reason });
      if (action === 'unfreeze') return apiClient.admin.cards.unfreeze(actionCard.id, { reason: actionForm.reason });
      if (action === 'secure') return apiClient.admin.cards.secure(actionCard.id);
      throw new Error('Unsupported card action');
    },
    onSuccess: (result) => {
      if (action === 'secure') {
        setSecureDetails(result);
        toast.success('Secure details loaded');
        return;
      }
      toast.success('Card action completed');
      setActionCard(null);
      setAction('');
      setActionForm({ amount: '', reason: '' });
      invalidateOperationalData(queryClient);
    },
    onError: (error) => toast.error(error.message || 'Card action failed')
  });

  const openCardAction = (card, nextAction) => {
    setActionCard(card);
    setAction(nextAction);
    setActionForm({ amount: '', reason: '' });
    setSecureDetails(null);
  };

  const lowBalance = Number(balancesQuery.data?.usdc || 0) < 7;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Bitnob Card Operations</h2>
          <p className="text-xs text-muted-foreground">Provider-backed customers, cards, funding, transactions, and audit logs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => balancesQuery.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowCustomer(true)}>
            <Plus className="h-3.5 w-3.5" /> Create Customer
          </Button>
          <Button size="sm" className="bg-primary text-primary-foreground" onClick={() => setShowCreateCard(true)}>
            <CreditCard className="h-3.5 w-3.5" /> Create Card
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Stat label="USDC Balance" value={money(balancesQuery.data?.usdc)} icon={WalletCards} tone={lowBalance ? 'text-red-500' : 'text-primary'} />
        <Stat label="Customers" value={customers.length} icon={BadgeCheck} />
        <Stat label="Active Cards" value={stats.active} icon={CreditCard} />
        <Stat label="Frozen" value={stats.frozen} icon={PauseCircle} tone="text-yellow-500" />
        <Stat label="Card Balance" value={money(stats.totalBalance)} icon={WalletCards} />
        <Stat label="Transactions" value={transactions.length} icon={Send} />
      </div>

      {lowBalance && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-700">
          Insufficient company wallet balance may block card creation. Sandbox balance is not preloaded. Use Bitnob sandbox deposit simulation or ask Bitnob to fund the sandbox wallet.
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers or cards..." className="pl-9 h-9" />
      </div>

      <Tabs defaultValue="overview" className="space-y-3">
        <TabsList className="h-auto flex-wrap justify-start">
          {['overview', 'customers', 'cards', 'funding', 'transactions', 'audit logs', 'settings'].map((tab) => (
            <TabsTrigger key={tab} value={tab.replace(' ', '-')} className="text-xs capitalize">{tab}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          <CompactCards cards={filteredCards.slice(0, 6)} onAction={openCardAction} />
        </TabsContent>

        <TabsContent value="customers">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40 text-muted-foreground">
                <tr><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Email</th><th className="px-3 py-2 text-left">Country</th><th className="px-3 py-2 text-left">Customer ID</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-3 py-2 font-medium">{getName(customer)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{customer.email}</td>
                    <td className="px-3 py-2">{customer.country}</td>
                    <td className="px-3 py-2 font-mono">{customer.bitnob_customer_id}</td>
                    <td className="px-3 py-2"><StatusBadge status={customer.status || 'active'} className="text-[10px]" /></td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => { setCardForm((current) => ({ ...current, customerId: customer.id, name: getName(customer) })); setShowCreateCard(true); }}>Create card</Button>
                    </td>
                  </tr>
                ))}
                {!filteredCustomers.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No customers yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="cards">
          <CompactCards cards={filteredCards} onAction={openCardAction} />
        </TabsContent>

        <TabsContent value="funding" className="grid gap-3 md:grid-cols-3">
          {['usdc', 'usdt', 'btc'].map((asset) => (
            <div key={asset} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">{asset}</p>
              <p className="mt-1 text-2xl font-semibold">{Number(balancesQuery.data?.[asset] || 0).toFixed(asset === 'btc' ? 8 : 2)}</p>
              <p className="mt-2 text-xs text-muted-foreground">Card creation and top-ups use company wallet balance. This is provider data, not a fake local value.</p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="transactions">
          <SimpleRows rows={transactions} empty="No card transactions returned by provider yet." />
        </TabsContent>

        <TabsContent value="audit-logs">
          <SimpleRows rows={auditLogs} empty="No audit logs yet." />
        </TabsContent>

        <TabsContent value="settings">
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Bitnob credentials, base URL, webhook URL, and sandbox/production mode are controlled by backend environment variables. Secrets are never exposed in the frontend.
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showCustomer} onOpenChange={setShowCustomer}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Create Bitnob Customer</DialogTitle><DialogDescription>Customer creation does not require company wallet balance.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              ['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ['date_of_birth', 'Date of birth'],
              ['id_type', 'ID type'], ['id_number', 'ID number'], ['dial_code', 'Dial code'], ['phone_number', 'Phone number'],
              ['country', 'Country'], ['city', 'City'], ['address', 'Address'], ['reason', 'Audit reason']
            ].map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <Input type={key === 'date_of_birth' ? 'date' : 'text'} value={customerForm[key]} onChange={(event) => setCustomerForm((current) => ({ ...current, [key]: event.target.value }))} />
              </div>
            ))}
          </div>
          <DialogFooter><Button onClick={() => createCustomer.mutate(customerForm)} disabled={createCustomer.isPending}>{createCustomer.isPending ? 'Creating...' : 'Create Customer'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateCard} onOpenChange={setShowCreateCard}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Virtual Card</DialogTitle><DialogDescription>Creates a real Bitnob virtual card. Company wallet balance is checked first.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Customer</Label><select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={cardForm.customerId} onChange={(event) => setCardForm((current) => ({ ...current, customerId: event.target.value }))}><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{getName(customer)} - {customer.email}</option>)}</select></div>
            <div><Label className="text-xs">Card name</Label><Input value={cardForm.name} onChange={(event) => setCardForm((current) => ({ ...current, name: event.target.value }))} placeholder="Card holder name" /></div>
            <div><Label className="text-xs">Nickname</Label><Input value={cardForm.nickname} onChange={(event) => setCardForm((current) => ({ ...current, nickname: event.target.value }))} /></div>
            <div><Label className="text-xs">Initial amount USD</Label><Input type="number" min="1" step="0.01" value={cardForm.amount} onChange={(event) => setCardForm((current) => ({ ...current, amount: event.target.value }))} /></div>
            <div><Label className="text-xs">Reason</Label><Textarea value={cardForm.reason} onChange={(event) => setCardForm((current) => ({ ...current, reason: event.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter><Button onClick={() => createCard.mutate(cardForm)} disabled={!cardForm.customerId || !cardForm.reason || createCard.isPending}>{createCard.isPending ? 'Creating...' : 'Create Card'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(actionCard)} onOpenChange={(open) => !open && setActionCard(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="capitalize">{action} card</DialogTitle><DialogDescription>{actionCard?.card_nickname} {actionCard?.masked_pan || ''}</DialogDescription></DialogHeader>
          {['fund', 'withdraw'].includes(action) && <div><Label className="text-xs">Amount USD</Label><Input type="number" min="1" step="0.01" value={actionForm.amount} onChange={(event) => setActionForm((current) => ({ ...current, amount: event.target.value }))} /></div>}
          {!secureDetails && <div className="mt-3"><Label className="text-xs">Reason</Label><Textarea value={actionForm.reason} onChange={(event) => setActionForm((current) => ({ ...current, reason: event.target.value }))} rows={2} /></div>}
          {secureDetails && <pre className="max-h-64 overflow-auto rounded bg-secondary p-3 text-xs">{JSON.stringify(secureDetails, null, 2)}</pre>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionCard(null)}>Close</Button>
            {!secureDetails && <Button onClick={() => cardAction.mutate()} disabled={cardAction.isPending || (!actionForm.reason && action !== 'secure')}>{cardAction.isPending ? 'Processing...' : 'Confirm'}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompactCards({ cards, onAction }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-secondary/40 text-muted-foreground">
          <tr><th className="px-3 py-2 text-left">Holder</th><th className="px-3 py-2 text-left">Card</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2 text-right">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-border">
          {cards.map((card) => (
            <tr key={card.id}>
              <td className="px-3 py-2"><p className="font-medium">{card.first_name ? `${card.first_name} ${card.last_name || ''}` : card.user_id}</p><p className="text-muted-foreground">{card.customer_email || card.bitnob_customer_id}</p></td>
              <td className="px-3 py-2 font-mono">{card.masked_pan || `**** ${card.last_four || '----'}`}</td>
              <td className="px-3 py-2"><StatusBadge status={card.status} className="text-[10px]" /></td>
              <td className="px-3 py-2 text-right font-mono">{money(card.balance)}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => onAction(card, 'fund')}>Fund</Button>
                  <Button size="sm" variant="outline" onClick={() => onAction(card, card.status === 'frozen' ? 'unfreeze' : 'freeze')}>{card.status === 'frozen' ? 'Unfreeze' : 'Freeze'}</Button>
                  <Button size="sm" variant="outline" onClick={() => onAction(card, 'secure')}><Eye className="h-3.5 w-3.5" /></Button>
                </div>
              </td>
            </tr>
          ))}
          {!cards.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No cards yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SimpleRows({ rows, empty }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      {!rows.length ? <div className="p-8 text-center text-sm text-muted-foreground">{empty}</div> : (
        <div className="divide-y divide-border">
          {rows.slice(0, 80).map((row, index) => (
            <div key={row.id || row.reference || row.created_date || index} className="grid grid-cols-1 gap-1 px-3 py-2 text-xs md:grid-cols-4">
              <p className="font-medium">{row.action || row.type || row.description || row.event || 'Record'}</p>
              <p className="text-muted-foreground">{row.user_id || row.customer_id || row.card_id || row.entity_id || ''}</p>
              <p className="text-muted-foreground">{row.status || row.provider || row.entity_type || ''}</p>
              <p className="text-right text-muted-foreground">{row.created_date ? format(new Date(row.created_date), 'MMM d, HH:mm') : row.created_at || ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
