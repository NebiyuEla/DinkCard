import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useCurrentUser } from '@/hooks/useAppData';
import { REFRESH, invalidateOperationalData } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import { Eye, Send } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function AdminTickets() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const { data: tickets } = useQuery({
    queryKey: ['admin-tickets'],
    queryFn: () => apiClient.entities.SupportTicket.list('-created_date', 100),
    refetchInterval: REFRESH.admin
  });

  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const messagesEndRef = useRef(null);
  const isContactRequest = selected?.category === 'contact_request';
  const filteredTickets = (tickets || []).filter((ticket) => activeTab === 'all' ? true : ticket.status === activeTab);

  const { data: messages } = useQuery({
    queryKey: ['ticketMessages', selected?.id],
    queryFn: () => apiClient.entities.SupportMessage.filter({ ticket_id: selected.id }, 'created_date'),
    enabled: !!selected,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: selected ? REFRESH.notifications : false,
    refetchIntervalInBackground: true
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      await apiClient.entities.SupportMessage.create({
        ticket_id: selected.id,
        sender_type: 'admin',
        sender_id: currentUser?.email,
        message: reply
      });
      if (newStatus && newStatus !== selected.status) {
        await apiClient.entities.SupportTicket.update(selected.id, { status: newStatus });
        setSelected(prev => ({ ...prev, status: newStatus }));
      }
    },
    onSuccess: () => {
      invalidateOperationalData(queryClient);
      setReply('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 40);
      toast.success('Reply sent');
    }
  });

  useEffect(() => {
    if (!selected) return;
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    });
  }, [selected, messages?.length]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Support Tickets</h2>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList className="flex h-auto w-max min-w-full justify-start gap-2 rounded-2xl bg-transparent p-0">
          {[
            ['all', 'All'],
            ['open', 'Open'],
            ['under_review', 'Under Review'],
            ['waiting_for_user', 'Waiting'],
            ['solved', 'Solved'],
            ['closed', 'Closed']
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="shrink-0 rounded-xl border border-border bg-card px-3 py-2 text-xs data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10 sm:text-sm">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        </div>
        <TabsContent value={activeTab} className="m-0">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ticket ID</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Subject</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTickets.map(t => (
                <tr key={t.id} className="hover:bg-secondary/20">
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{t.id}</td>
                  <td className="px-4 py-3 text-xs">{t.user_id}</td>
                  <td className="px-4 py-3 font-medium">{t.subject}</td>
                  <td className="px-4 py-3 capitalize text-xs">{(t.category || '').replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} className="text-[10px]" /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{t.created_date ? format(new Date(t.created_date), 'MMM d') : ''}</td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={() => { setSelected(t); setNewStatus(t.status); }}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-border">
          {filteredTickets.map(t => (
            <button key={t.id} type="button" onClick={() => { setSelected(t); setNewStatus(t.status); }} className="w-full p-4 text-left space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.user_id}</p>
                  <p className="text-[10px] font-mono text-muted-foreground/80">{t.id}</p>
                </div>
                <StatusBadge status={t.status} className="text-[10px] shrink-0" />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="capitalize">{(t.category || '').replace(/_/g, ' ')}</span>
                <span>{t.created_date ? format(new Date(t.created_date), 'MMM d') : ''}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col overflow-hidden p-4 sm:max-h-[82vh] sm:p-6">
          <DialogHeader>
            <DialogTitle className="break-words pr-6 text-base sm:text-lg">{selected?.subject}</DialogTitle>
            {selected?.id && <p className="font-mono text-[11px] text-muted-foreground">Ticket ID: {selected.id}</p>}
          </DialogHeader>
          {selected && (
            <div className="grid gap-2 rounded-xl border border-border bg-secondary/20 p-3 text-xs sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">User</p>
                <p className="font-medium">{selected.contact_name || selected.user_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Category</p>
                <p className="font-medium capitalize">{String(selected.category || '').replace(/_/g, ' ')}</p>
              </div>
              {isContactRequest && (
                <>
                  <div>
                    <p className="text-muted-foreground">Sender email</p>
                    <p className="font-medium break-all">{selected.contact_email || selected.user_id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Inbox</p>
                    <p className="font-medium break-all">{selected.contact_target_email || 'support@dinkcard.et'}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-muted-foreground">Phone</p>
                    <p className="font-medium">{selected.contact_phone || 'Not provided'}</p>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-2 pr-1">
            {/* Original message */}
            {selected && (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-xl bg-secondary px-3 py-2.5 sm:max-w-[80%] sm:px-4">
                  <p className="text-xs font-medium text-muted-foreground mb-1">User (original)</p>
                  <p className="break-words text-sm">{selected.message}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{selected.created_date ? format(new Date(selected.created_date), 'MMM d, h:mm a') : ''}</p>
                </div>
              </div>
            )}
            {messages?.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_type === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[88%] rounded-xl px-3 py-2.5 sm:max-w-[80%] sm:px-4 ${msg.sender_type === 'user' ? 'bg-secondary' : 'bg-primary/10'}`}>
                  <p className="text-xs font-medium text-muted-foreground capitalize mb-1">{msg.sender_type}</p>
                  <p className="break-words text-sm">{msg.message}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{msg.created_date ? format(new Date(msg.created_date), 'MMM d, h:mm a') : ''}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="space-y-2 pt-2 border-t border-border">
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="waiting_for_user">Waiting for User</SelectItem>
                <SelectItem value="solved">Solved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1"
                onKeyDown={e => e.key === 'Enter' && reply.trim() && sendReply.mutate()}
              />
              <Button
                onClick={() => sendReply.mutate()}
                disabled={!reply.trim() || sendReply.isPending}
                className="shrink-0 bg-primary text-primary-foreground"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
