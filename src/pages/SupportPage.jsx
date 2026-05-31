import React, { useEffect, useRef, useState } from 'react';
import { useCurrentUser, useSupportTickets } from '@/hooks/useAppData';
import { apiClient } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import StatusBadge from '@/components/ui-custom/StatusBadge';
import EmptyState from '@/components/ui-custom/EmptyState';
import FilePreview from '@/components/FilePreview';
import FileUploadControl from '@/components/FileUploadControl';
import { HeadphonesIcon, Paperclip, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const CATEGORIES = [
  { value: 'deposit_issue', label: 'Deposit Issue' },
  { value: 'card_creation_failed', label: 'Card Creation Failed' },
  { value: 'card_funding_failed', label: 'Card Funding Failed' },
  { value: 'card_declined', label: 'Card Declined Online' },
  { value: 'refund_request', label: 'Refund Request' },
  { value: 'kyc_issue', label: 'KYC Issue' },
  { value: 'account_issue', label: 'Account Issue' },
  { value: 'other', label: 'Other' },
];

export default function SupportPage() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: tickets } = useSupportTickets(user?.email);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [newTicket, setNewTicket] = useState({ category: '', subject: '', message: '' });
  const [newTicketAttachment, setNewTicketAttachment] = useState('');
  const [replyAttachment, setReplyAttachment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [reply, setReply] = useState('');
  const messagesListRef = useRef(null);
  const messagesEndRef = useRef(null);

  const { data: messages } = useQuery({
    queryKey: ['ticketMessages', selectedTicket?.id],
    queryFn: async () => {
      if (!selectedTicket) return [];
      return await apiClient.entities.SupportMessage.filter({ ticket_id: selectedTicket.id }, 'created_date');
    },
    enabled: !!selectedTicket
  });

  const createTicket = useMutation({
    mutationFn: async () => {
      const ticket = await apiClient.entities.SupportTicket.create({
        user_id: user.email,
        ...newTicket,
        screenshot_url: newTicketAttachment,
        status: 'open',
        priority: 'medium'
      });
      await apiClient.entities.SupportMessage.create({
        ticket_id: ticket.id,
        sender_type: 'user',
        sender_id: user.email,
        message: newTicket.message,
        attachment_url: newTicketAttachment
      });
      return ticket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supportTickets'] });
      setShowCreate(false);
      setNewTicket({ category: '', subject: '', message: '' });
      setNewTicketAttachment('');
      toast.success('Ticket created!');
    }
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      return await apiClient.entities.SupportMessage.create({
        ticket_id: selectedTicket.id,
        sender_type: 'user',
        sender_id: user.email,
        message: reply,
        attachment_url: replyAttachment
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketMessages'] });
      setReply('');
      setReplyAttachment('');
      setTimeout(() => scrollToLatest('smooth'), 50);
    }
  });

  const scrollToLatest = (behavior = 'auto') => {
    const list = messagesListRef.current;
    if (list) {
      list.scrollTo({ top: list.scrollHeight, behavior });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  };

  useEffect(() => {
    if (!selectedTicket?.id) return undefined;
    const frame = requestAnimationFrame(() => scrollToLatest('auto'));
    const timer = setTimeout(() => scrollToLatest('auto'), 120);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [selectedTicket?.id, messages?.length]);

  const uploadAttachment = async (file, setter) => {
    setUploading(true);
    try {
      const result = await apiClient.integrations.Core.UploadFile({ file });
      setter(result.file_url);
      toast.success('Uploaded');
    } catch (error) {
      toast.error(error.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Support</h1>
          <p className="text-sm text-muted-foreground">Get help with your account or use <a href="https://t.me/DinkSupportBot" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">@DinkSupportBot</a>.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-primary text-primary-foreground">
          <Plus className="w-4 h-4 mr-2" /> New Ticket
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Ticket list */}
        <div>
          {!tickets?.length ? (
            <EmptyState icon={HeadphonesIcon} title="No tickets" description="Create a support ticket if you need help." className="bg-card border border-border rounded-xl" />
          ) : (
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {(tickets || []).map(ticket => (
                <div 
                  key={ticket.id} 
                  onClick={() => setSelectedTicket(ticket)} 
                  className={`px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors ${selectedTicket?.id === ticket.id ? 'bg-secondary/30' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium truncate">{ticket.subject}</p>
                    <StatusBadge status={ticket.status} className="text-[10px]" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground capitalize">{(ticket.category || '').replace(/_/g, ' ')}</span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">{ticket.created_date ? format(new Date(ticket.created_date), 'MMM d') : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ticket detail / messages */}
        {selectedTicket && (
          <div className="bg-card border border-border rounded-xl flex flex-col max-h-[600px]">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{selectedTicket.subject}</h3>
                <StatusBadge status={selectedTicket.status} />
              </div>
              <p className="text-xs text-muted-foreground capitalize mt-1">{(selectedTicket.category || '').replace(/_/g, ' ')}</p>
            </div>
            
            <div ref={messagesListRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages?.map(msg => (
                <div key={msg.id} className={`flex ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                    msg.sender_type === 'user' ? 'bg-primary/10 text-foreground' : 'bg-secondary'
                  }`}>
                    <p className="text-xs font-medium text-muted-foreground mb-1 capitalize">{msg.sender_type}</p>
                    <p className="text-sm">{msg.message}</p>
                    <FilePreview url={msg.attachment_url} label="Support attachment" className="mt-2" />
                    <p className="text-[10px] text-muted-foreground mt-1">{msg.created_date ? format(new Date(msg.created_date), 'h:mm a') : ''}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {!['solved', 'closed'].includes(selectedTicket.status) && (
              <div className="p-3 border-t border-border space-y-2">
                <FilePreview url={replyAttachment} label="Reply attachment" />
                <div className="flex gap-2">
                  <Input
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey && reply.trim() && !sendReply.isPending) {
                        e.preventDefault();
                        sendReply.mutate();
                      }
                    }}
                  />
                  <FileUploadControl
                    disabled={uploading}
                    onFile={(file) => uploadAttachment(file, setReplyAttachment)}
                    className="h-9 w-9 rounded-md border border-input flex items-center justify-center hover:bg-accent"
                  >
                    <Paperclip className="w-4 h-4" />
                  </FileUploadControl>
                  <Button size="icon" onClick={() => reply.trim() && sendReply.mutate()} disabled={!reply.trim() || sendReply.isPending} className="bg-primary text-primary-foreground">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create ticket dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Support Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Category</Label>
              <Select value={newTicket.category} onValueChange={v => setNewTicket({...newTicket, category: v})}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Subject</Label>
              <Input value={newTicket.subject} onChange={e => setNewTicket({...newTicket, subject: e.target.value})} className="mt-1.5" />
            </div>
            <div>
              <Label className="text-sm">Message</Label>
              <Textarea value={newTicket.message} onChange={e => setNewTicket({...newTicket, message: e.target.value})} className="mt-1.5" rows={4} />
            </div>
            <div>
              <Label className="text-sm">Attachment</Label>
              <FilePreview url={newTicketAttachment} label="Support attachment" className="mt-2" />
              <FileUploadControl
                disabled={uploading}
                onFile={(file) => uploadAttachment(file, setNewTicketAttachment)}
                className="mt-2 inline-flex h-9 items-center justify-center rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"
              >
                <Paperclip className="w-4 h-4 mr-2" />{uploading ? 'Uploading...' : 'Tap to upload'}
              </FileUploadControl>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createTicket.mutate()} disabled={!newTicket.category || !newTicket.subject || !newTicket.message || createTicket.isPending} className="bg-primary text-primary-foreground">
              {createTicket.isPending ? 'Creating...' : 'Create Ticket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
