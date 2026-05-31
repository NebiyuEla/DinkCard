import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

const CONSENT_KEY = 'dinkcard_cookie_consent';
const defaultConsent = {
  essential: true,
  preferences: true,
  analytics: false,
  marketing: false
};

export default function CookieConsentBanner() {
  const [saved, setSaved] = useState(() => localStorage.getItem(CONSENT_KEY));
  const [consent, setConsent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null') || defaultConsent;
    } catch {
      return defaultConsent;
    }
  });

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored && stored !== saved) setSaved(stored);
  }, [saved]);

  if (saved) return null;

  const saveConsent = (value) => {
    const payload = { ...defaultConsent, ...value, essential: true };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(payload));
    setSaved(JSON.stringify(payload));
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 rounded-2xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold">Cookies</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Dink Card uses essential cookies for sign-in, security, and session stability. You can choose which optional cookies to allow for preferences, insights, and support improvements.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { key: 'essential', label: 'Essential', desc: 'Required for login, security, and core platform flow.', locked: true },
            { key: 'preferences', label: 'Preferences', desc: 'Keeps helpful UI choices like saved settings.', locked: false },
            { key: 'analytics', label: 'Analytics', desc: 'Helps us understand product performance and issues.', locked: false },
            { key: 'marketing', label: 'Support updates', desc: 'Allows optional outreach and contact flow improvements.', locked: false }
          ].map((item) => (
            <label key={item.key} className="flex min-h-[104px] cursor-pointer items-start gap-3 rounded-xl border border-border bg-card/70 p-3">
              <Checkbox
                checked={Boolean(consent[item.key])}
                disabled={item.locked}
                onCheckedChange={(checked) => setConsent((current) => ({ ...current, [item.key]: Boolean(checked) }))}
              />
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => saveConsent(consent)}>
            Save choices
          </Button>
          <Button type="button" className="bg-primary text-primary-foreground" onClick={() => saveConsent({ essential: true, preferences: true, analytics: true, marketing: true })}>
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
