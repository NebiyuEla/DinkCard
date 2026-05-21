import React, { useState } from 'react';
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

  const { data: messages } = useQuery({
    queryKey: ['ticketMessages', selected?.id],
    queryFn: () => apiClient.entities.SupportMessage.filter({ ticket_id: selected.id }, 'created_date'),
    enabled: !!selected,
    refetchInterval: selected ? REFRESH.admin : false
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
      toast.success('Reply sent');
    }
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Support Tickets</h2>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Subject</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(tickets || []).map(t => (
                <tr key={t.id} className="hover:bg-secondary/20">
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
          {(tickets || []).map(t => (
            <button key={t.id} type="button" onClick={() => { setSelected(t); setNewStatus(t.status); }} className="w-full p-4 text-left space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.user_id}</p>
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

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg flex flex-col max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selected?.subject}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-2 min-h-0">
            {/* Original message */}
            {selected && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-xl px-4 py-2.5 bg-secondary">
                  <p className="text-xs font-medium text-muted-foreground mb-1">User (original)</p>
                  <p className="text-sm">{selected.message}</p>
                </div>
              </div>
            )}
            {messages?.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_type === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${msg.sender_type === 'user' ? 'bg-secondary' : 'bg-primary/10'}`}>
                  <p className="text-xs font-medium text-muted-foreground capitalize mb-1">{msg.sender_type}</p>
                  <p className="text-sm">{msg.message}</p>
                </div>
              </div>
            ))}
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
            <div className="flex gap-2">
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
                className="bg-primary text-primary-foreground"
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
