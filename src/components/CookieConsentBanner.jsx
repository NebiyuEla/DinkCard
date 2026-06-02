import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

const CONSENT_KEY = 'dinkcard_cookie_consent';
const CONSENT_MAX_AGE = 60 * 60 * 24 * 180;
const defaultConsent = {
  essential: true,
  preferences: true,
  analytics: false,
  marketing: false
};

function readConsentCookie() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${CONSENT_KEY}=`));
  if (!match) return null;
  const raw = match.slice(CONSENT_KEY.length + 1);
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

function persistConsent(value) {
  const payload = { ...defaultConsent, ...value, essential: true };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  if (typeof document !== 'undefined') {
    document.cookie = `${CONSENT_KEY}=${encoded}; path=/; max-age=${CONSENT_MAX_AGE}; SameSite=Lax`;
  }
  localStorage.setItem(CONSENT_KEY, JSON.stringify(payload));
  return payload;
}

export default function CookieConsentBanner() {
  const [showDetails, setShowDetails] = useState(false);
  const [saved, setSaved] = useState(() => {
    const cookieConsent = readConsentCookie();
    if (cookieConsent) return JSON.stringify(cookieConsent);
    return localStorage.getItem(CONSENT_KEY);
  });
  const [consent, setConsent] = useState(() => {
    try {
      return readConsentCookie() || JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null') || defaultConsent;
    } catch {
      return defaultConsent;
    }
  });

  useEffect(() => {
    const cookieConsent = readConsentCookie();
    if (cookieConsent) {
      const serialized = JSON.stringify(cookieConsent);
      if (serialized !== saved) setSaved(serialized);
      localStorage.setItem(CONSENT_KEY, serialized);
      return;
    }
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored) {
      try {
        const restored = persistConsent(JSON.parse(stored));
        setSaved(JSON.stringify(restored));
      } catch {}
    }
  }, [saved]);

  if (saved) return null;

  const saveConsent = (value) => {
    const payload = persistConsent(value);
    setSaved(JSON.stringify(payload));
  };

  const acceptAll = () => saveConsent({ essential: true, preferences: true, analytics: true, marketing: true });

  if (!showDetails) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4">
        <div className="pointer-events-auto mx-auto w-full max-w-md rounded-2xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur sm:max-w-4xl sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Cookies</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
                We use essential cookies for sign-in and security. Optional cookies help remember settings and improve support.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowDetails(true)}>
                Choices
              </Button>
              <Button type="button" size="sm" className="bg-primary text-primary-foreground" onClick={acceptAll}>
                Accept all
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4">
      <div className="pointer-events-auto mx-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col gap-3 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur sm:max-h-[min(76dvh,520px)] sm:gap-4 sm:p-4">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold">Cookie choices</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep essential cookies on for login and security, then choose what else Dink Card can remember on this device.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { key: 'essential', label: 'Essential', desc: 'Required for login, security, and core platform flow.', locked: true },
            { key: 'preferences', label: 'Preferences', desc: 'Keeps helpful UI choices like saved settings.', locked: false },
            { key: 'analytics', label: 'Analytics', desc: 'Helps us understand product performance and issues.', locked: false },
            { key: 'marketing', label: 'Support updates', desc: 'Allows optional outreach and contact flow improvements.', locked: false }
          ].map((item) => (
            <label key={item.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card/70 p-3">
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
        <div className="sticky bottom-0 -mx-3 -mb-3 grid grid-cols-1 gap-2 border-t border-border bg-background/95 p-3 sm:static sm:m-0 sm:flex sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="button" variant="ghost" onClick={() => setShowDetails(false)}>
            Back
          </Button>
          <Button type="button" variant="outline" onClick={() => saveConsent(consent)}>
            Save choices
          </Button>
          <Button type="button" className="bg-primary text-primary-foreground" onClick={acceptAll}>
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
