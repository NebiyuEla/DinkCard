import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BadgeCheck, CreditCard, Eye, PauseCircle, Plus, RefreshCw, Search, Send, Trash2, WalletCards } from 'lucide-react';
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

function normalizeEtPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00251')) digits = digits.slice(5);
  if (digits.startsWith('251')) digits = digits.slice(3);
  digits = digits.replace(/^0+/, '');
  return digits.slice(0, 9);
}

function Stat({ label, value, icon: Icon, tone = 'text-primary' }) {
  return (
    <div className="flex h-full min-h-[86px] flex-col justify-between rounded-lg border border-border bg-card px-3 py-2">
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
  const [deleteCustomer, setDeleteCustomer] = useState(null);
  const [action, setAction] = useState('');
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER);
  const [cardForm, setCardForm] = useState({ customerId: '', nickname: 'Virtual Card', name: '', amount: '5', reason: '' });
  const [actionForm, setActionForm] = useState({ amount: '', reason: '' });
  const [deleteReason, setDeleteReason] = useState('');
  const [secureDetails, setSecureDetails] = useState(null);

  const customersQuery = useQuery({ queryKey: ['bitnob-customers'], queryFn: apiClient.admin.customers.list, refetchInterval: REFRESH.admin });
  const cardsQuery = useQuery({ queryKey: ['admin-cards'], queryFn: apiClient.admin.cards.list, refetchInterval: REFRESH.admin });
  const balancesQuery = useQuery({ queryKey: ['bitnob-balances'], queryFn: apiClient.admin.balances, refetchInterval: REFRESH.fees, retry: false });
  const providerStatusQuery = useQuery({ queryKey: ['provider-status'], queryFn: apiClient.admin.providerStatus, refetchInterval: REFRESH.fees, retry: false });
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
    mutationFn: (payload) => apiClient.admin.customers.create({
      ...payload,
      dial_code: '+251',
      phone_number: normalizeEtPhone(payload.phone_number)
    }),
    onSuccess: () => {
      toast.success('Customer created');
      setShowCustomer(false);
      setCustomerForm(EMPTY_CUSTOMER);
      invalidateOperationalData(queryClient);
      queryClient.invalidateQueries({ queryKey: ['bitnob-customers'] });
    },
    onError: (error) => toast.error(error.message || 'Customer creation failed')
  });

  const syncCustomers = useMutation({
    mutationFn: apiClient.admin.customers.syncBitnob,
    onSuccess: (result) => {
      toast.success(`Synced ${result.imported || 0} Bitnob customers`);
      queryClient.invalidateQueries({ queryKey: ['bitnob-customers'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (error) => toast.error(error.message || 'Bitnob sync failed')
  });

  const testConnection = useMutation({
    mutationFn: apiClient.admin.bitnob.whoami,
    onSuccess: (result) => toast.success(result.message || 'Connected to Bitnob successfully'),
    onError: (error) => toast.error(error.message || 'Bitnob authentication failed')
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: () => {
      if (!deleteCustomer) throw new Error('Select a customer first.');
      return apiClient.admin.customers.delete(deleteCustomer.id, { reason: deleteReason });
    },
    onSuccess: () => {
      toast.success('Customer deleted from Bitnob and Dink Card');
      setDeleteCustomer(null);
      setDeleteReason('');
      queryClient.invalidateQueries({ queryKey: ['bitnob-customers'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (error) => toast.error(error.message || 'Customer deletion failed')
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

  const companyStableBalance = Number(balancesQuery.data?.totalUsd || balancesQuery.data?.stableUsd || 0);
  const lowBalance = companyStableBalance < 7;
  const environment = providerStatusQuery.data?.environment || balancesQuery.data?.environment || 'sandbox';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">Bitnob Card Operations</h2>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${environment === 'live' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-yellow-500/15 text-yellow-700'}`}>{environment}</span>
          </div>
          <p className="text-xs text-muted-foreground">Provider-backed customers, cards, funding, transactions, and audit logs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => balancesQuery.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={() => syncCustomers.mutate()} disabled={syncCustomers.isPending}>
            <RefreshCw className="h-3.5 w-3.5" /> {syncCustomers.isPending ? 'Syncing...' : 'Sync Bitnob'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowCustomer(true)}>
            <Plus className="h-3.5 w-3.5" /> Create Customer
          </Button>
          <Button size="sm" className="bg-primary text-primary-foreground" onClick={() => setShowCreateCard(true)}>
            <CreditCard className="h-3.5 w-3.5" /> Create Card
          </Button>
        </div>
      </div>

      <div className="grid auto-rows-fr grid-cols-2 items-stretch gap-2 lg:grid-cols-6">
        <Stat label="Company Wallet" value={money(companyStableBalance)} icon={WalletCards} tone={lowBalance ? 'text-red-500' : 'text-primary'} />
        <Stat label="Customers" value={customers.length} icon={BadgeCheck} />
        <Stat label="Active Cards" value={stats.active} icon={CreditCard} />
        <Stat label="Frozen" value={stats.frozen} icon={PauseCircle} tone="text-yellow-500" />
        <Stat label="Card Balance" value={money(stats.totalBalance)} icon={WalletCards} />
        <Stat label="Environment" value={environment} icon={Send} tone={environment === 'live' ? 'text-emerald-500' : 'text-yellow-500'} />
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
                <tr><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Email</th><th className="px-3 py-2 text-left">Country</th><th className="px-3 py-2 text-left">Customer ID</th><th className="px-3 py-2 text-left">Env</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-3 py-2 font-medium">{getName(customer)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{customer.email}</td>
                    <td className="px-3 py-2"><div>{customer.country}</div><div className="text-[10px] text-muted-foreground">{customer.phone_number || customer.phone || 'No phone'}</div></td>
                    <td className="px-3 py-2 font-mono">{customer.bitnob_customer_id}</td>
                    <td className="px-3 py-2"><span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase">{customer.environment || environment}</span></td>
                    <td className="px-3 py-2"><StatusBadge status={customer.status || 'active'} className="text-[10px]" /></td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => { setCardForm((current) => ({ ...current, customerId: customer.id, name: getName(customer) })); setShowCreateCard(true); }}>Card</Button>
                        <Button size="sm" variant="destructive" onClick={() => { setDeleteCustomer(customer); setDeleteReason(''); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredCustomers.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No customers yet. Create one or sync from Bitnob.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="cards">
          <CompactCards cards={filteredCards} onAction={openCardAction} />
        </TabsContent>

        <TabsContent value="funding" className="grid auto-rows-fr gap-3 md:grid-cols-3">
          {['usdc', 'usdt', 'btc'].map((asset) => (
            <div key={asset} className="flex h-full min-h-[140px] flex-col justify-between rounded-lg border border-border bg-card p-4">
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
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Provider Settings</p>
                <p className="text-xs text-muted-foreground">Bitnob mode and keys are controlled by backend environment variables. Secrets are never exposed.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => testConnection.mutate()} disabled={testConnection.isPending}>{testConnection.isPending ? 'Testing...' : 'Test Bitnob Connection'}</Button>
            </div>
            <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
              <InfoRow label="Environment" value={providerStatusQuery.data?.environment || environment} />
              <InfoRow label="Base URL" value={providerStatusQuery.data?.baseUrl || 'Not loaded'} />
              <InfoRow label="Client ID" value={providerStatusQuery.data?.clientId || 'Hidden'} />
              <InfoRow label="Webhook URL" value={providerStatusQuery.data?.webhookUrl || 'Not configured'} />
            </div>
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
                <Input
                  type={key === 'date_of_birth' ? 'date' : 'text'}
                  value={key === 'dial_code' ? '+251' : customerForm[key]}
                  disabled={key === 'dial_code'}
                  placeholder={key === 'phone_number' ? '9...' : undefined}
                  onChange={(event) => setCustomerForm((current) => ({
                    ...current,
                    [key]: key === 'phone_number' ? normalizeEtPhone(event.target.value) : event.target.value,
                    dial_code: '+251'
                  }))}
                />
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

      <Dialog open={Boolean(deleteCustomer)} onOpenChange={(open) => !open && setDeleteCustomer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Bitnob Customer</DialogTitle>
            <DialogDescription>This deletes the customer from Bitnob and removes the linked Dink Card customer record. Active cards must be handled first.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-secondary/20 p-3 text-sm">
              <p className="font-medium">{getName(deleteCustomer)}</p>
              <p className="text-xs text-muted-foreground">{deleteCustomer?.email}</p>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{deleteCustomer?.bitnob_customer_id}</p>
            </div>
            <div>
              <Label className="text-xs">Deletion reason</Label>
              <Textarea value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} rows={3} placeholder="Required for audit log..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCustomer(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteCustomerMutation.mutate()} disabled={!deleteReason.trim() || deleteCustomerMutation.isPending}>
              {deleteCustomerMutation.isPending ? 'Deleting...' : 'Delete Customer'}
            </Button>
          </DialogFooter>
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
          <tr><th className="px-3 py-2 text-left">Holder</th><th className="px-3 py-2 text-left">Card</th><th className="px-3 py-2 text-left">Env</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2 text-right">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-border">
          {cards.map((card) => (
            <tr key={card.id}>
              <td className="px-3 py-2"><p className="font-medium">{card.first_name ? `${card.first_name} ${card.last_name || ''}` : card.user_id}</p><p className="text-muted-foreground">{card.customer_email || card.bitnob_customer_id}</p></td>
              <td className="px-3 py-2 font-mono">{card.masked_pan || `**** ${card.last_four || '----'}`}</td>
              <td className="px-3 py-2"><span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase">{card.environment || 'sandbox'}</span></td>
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
          {!cards.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No cards yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="rounded-md border border-border bg-secondary/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-foreground">{value || 'Not configured'}</p>
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
