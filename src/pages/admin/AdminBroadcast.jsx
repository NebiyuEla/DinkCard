import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Paperclip, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { REFRESH } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FileUploadControl from '@/components/FileUploadControl';
import FilePreview from '@/components/FilePreview';

export default function AdminBroadcast() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    audience: 'specific',
    target: '',
    title: '',
    caption: '',
    attachment_url: ''
  });
  const [uploading, setUploading] = useState(false);

  const { data: users } = useQuery({
    queryKey: ['admin-users-broadcast'],
    queryFn: () => apiClient.entities.User.list('-created_date', 500),
    refetchInterval: REFRESH.admin
  });

  const userOptions = useMemo(
    () => (users || []).filter((user) => user.role === 'user' && user.account_status !== 'deleted'),
    [users]
  );

  const sendBroadcast = useMutation({
    mutationFn: () => apiClient.admin.broadcast(form),
    onSuccess: async (result) => {
      toast.success(`Broadcast sent to ${result.sent || 0} user${Number(result.sent || 0) === 1 ? '' : 's'}.`);
      setForm({ audience: 'specific', target: '', title: '', caption: '', attachment_url: '' });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => toast.error(error.message || 'Broadcast failed.')
  });

  const uploadAttachment = async (file) => {
    setUploading(true);
    try {
      const result = await apiClient.integrations.Core.UploadFile({ file });
      setForm((current) => ({ ...current, attachment_url: result.file_url }));
      toast.success('Attachment uploaded.');
    } catch (error) {
      toast.error(error.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">Broadcast Message</h2>
        <p className="text-sm text-muted-foreground">Send a caption, file, audio, video, or document to one user or every user.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 rounded-2xl border border-border bg-background/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Send to</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.audience}
                onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value, target: '' }))}
              >
                <option value="specific">Specific user</option>
                <option value="all">All users</option>
              </select>
            </div>
            {form.audience === 'specific' && (
              <div className="space-y-1.5">
                <Label>User</Label>
                <Input
                  list="broadcast-users"
                  value={form.target}
                  onChange={(event) => setForm((current) => ({ ...current, target: event.target.value }))}
                  placeholder="email, username, or phone"
                />
                <datalist id="broadcast-users">
                  {userOptions.map((user) => (
                    <option key={user.id || user.email} value={user.email}>
                      {user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email}
                    </option>
                  ))}
                </datalist>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Important update" />
          </div>

          <div className="space-y-1.5">
            <Label>Caption</Label>
            <textarea
              className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.caption}
              onChange={(event) => setForm((current) => ({ ...current, caption: event.target.value }))}
              placeholder="Write the message users should see..."
            />
          </div>

          <div className="space-y-2">
            <Label>Attachment</Label>
            {form.attachment_url ? (
              <div className="space-y-2">
                <FilePreview url={form.attachment_url} label="Broadcast attachment" />
                <Button type="button" variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, attachment_url: '' }))}>
                  <X className="mr-2 h-4 w-4" />Remove attachment
                </Button>
              </div>
            ) : (
              <FileUploadControl
                disabled={uploading}
                onFile={uploadAttachment}
                className="flex min-h-28 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/20 p-4 text-center"
              >
                <Paperclip className="mb-2 h-6 w-6 text-primary" />
                <p className="text-sm font-medium">{uploading ? 'Uploading...' : 'Tap to upload'}</p>
                <p className="mt-1 text-xs text-muted-foreground">Images, audio, video, PDF, and documents.</p>
              </FileUploadControl>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => sendBroadcast.mutate()}
              disabled={sendBroadcast.isPending || !form.title.trim() || (!form.caption.trim() && !form.attachment_url) || (form.audience === 'specific' && !form.target.trim())}
              className="bg-primary text-primary-foreground"
            >
              <Send className="mr-2 h-4 w-4" />
              {sendBroadcast.isPending ? 'Sending...' : 'Send Broadcast'}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-secondary/20 p-4">
          <div className="mb-3 flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            <p className="font-semibold">Preview</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">{form.title || 'Broadcast title'}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{form.caption || 'Caption will appear here.'}</p>
            {form.attachment_url && <FilePreview url={form.attachment_url} label="Broadcast attachment" className="mt-3" />}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Users receive this in Notifications. If device alerts are enabled, it also appears as a device notification.
          </p>
        </div>
      </div>
    </div>
  );
}
