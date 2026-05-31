import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LegalLinks from '@/components/LegalLinks';
import { BRAND_NAME, footerDisclaimer, INFO_EMAIL, SECURITY_EMAIL, SUPPORT_EMAIL, policies } from '@/lib/legal';

const routeMap = {
  terms: 'terms',
  privacy: 'privacy',
  'privacy-policy': 'privacy',
  'refund-policy': 'refunds',
  'fee-disclosure': 'feeDisclosure',
  'kyc-compliance': 'kyc',
  'acceptable-use': 'acceptableUse',
  'risk-disclosure': 'risk',
  'contact-support': 'contact',
  'account-deletion': 'accountDeletion',
  complaints: 'complaints'
};

export default function LegalPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const slug = location.pathname.replace(/^\//, '') || 'terms';
  const policy = policies[routeMap[slug] || 'terms'];

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold">{BRAND_NAME}</span>
          </Link>
          <Button type="button" variant="outline" size="sm" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />Back
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">{policy.title}</h1>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            {policy.intro.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </div>

        <div className="space-y-5">
          {policy.sections.map(([title, body], index) => (
            <section key={title} className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold mb-2">{index + 1}. {title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <LegalLinks />
          <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <a href={`mailto:${INFO_EMAIL}`} className="hover:text-primary hover:underline">{INFO_EMAIL}</a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-primary hover:underline">{SUPPORT_EMAIL}</a>
            <a href={`mailto:${SECURITY_EMAIL}`} className="hover:text-primary hover:underline">{SECURITY_EMAIL}</a>
          </p>
          <p className="text-xs text-muted-foreground text-center">{footerDisclaimer}</p>
        </div>
      </footer>
    </div>
  );
}
