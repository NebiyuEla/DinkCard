import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import TermsContent, { TERMS_VERSION } from '@/components/TermsContent';

export default function TermsModal({ user }) {
  const [open, setOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!user) return;
    setOpen(user.terms_accepted_version !== TERMS_VERSION);
  }, [user]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await apiClient.auth.updateMe({ terms_accepted_version: TERMS_VERSION });
      setOpen(false);
    } catch (error) {
      toast.error(error.message || 'Could not save terms acceptance. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl" onPointerDownOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Terms & Conditions - Please Read
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-80 rounded-lg border border-border bg-secondary/30 p-4">
          <TermsContent />
        </ScrollArea>

        <Button
          className="w-full bg-primary text-primary-foreground"
          onClick={handleAccept}
          disabled={accepting}
        >
          {accepting ? 'Saving...' : (
            <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4" />I Agree to the Terms & Conditions</span>
          )}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center">
          You cannot use Dink Card without accepting the Terms & Conditions.
        </p>
      </DialogContent>
    </Dialog>
  );
}
