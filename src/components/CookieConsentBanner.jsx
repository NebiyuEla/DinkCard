import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const CONSENT_KEY = 'dinkcard_cookie_consent';

export default function CookieConsentBanner() {
  const [choice, setChoice] = useState(() => localStorage.getItem(CONSENT_KEY));

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored && stored !== choice) setChoice(stored);
  }, [choice]);

  if (choice) return null;

  const saveChoice = (value) => {
    localStorage.setItem(CONSENT_KEY, value);
    setChoice(value);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 rounded-2xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold">Cookies</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Dink Card uses essential cookies for sign-in, security, and session stability. You can also allow preference cookies for a smoother experience.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => saveChoice('declined')}>
            Disagree
          </Button>
          <Button type="button" className="bg-primary text-primary-foreground" onClick={() => saveChoice('accepted')}>
            Agree
          </Button>
        </div>
      </div>
    </div>
  );
}
