import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CreditCard, HeadphonesIcon, LockKeyhole, MapPin, ShieldCheck, Smartphone, WalletCards } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import LegalLinks from '@/components/LegalLinks';
import ThemeToggle from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { contactEmailLine, footerDisclaimer, INFO_EMAIL, SECURITY_EMAIL, SUPPORT_EMAIL } from '@/lib/legal';
import { PUBLIC_NAV_LINKS } from '@/lib/seo';

const pageContent = {
  '/services': {
    eyebrow: 'Dink Card Services',
    title: 'Virtual card services built for everyday online payments',
    description: 'Dink Card helps Ethiopian users access supported virtual card services for subscriptions, digital tools, app stores, ads, shopping, and secure online payments.',
    cards: [
      { icon: CreditCard, title: 'Virtual Cards', text: 'Request and manage supported virtual cards after identity verification and funding.' },
      { icon: WalletCards, title: 'Service Balance', text: 'Add funds in ETB and track your available service balance in one simple dashboard.' },
      { icon: ShieldCheck, title: 'Verified Flow', text: 'KYC, payment verification, and card request checks help keep the platform safer.' }
    ]
  },
  '/about': {
    eyebrow: 'About Dink Card',
    title: 'A digital payment access platform made for Ethiopia',
    description: 'Dink Card is designed to make online payment access clearer for Ethiopian users through a guided account, funding, verification, and virtual card management experience.',
    cards: [
      { icon: MapPin, title: 'Built for Ethiopia', text: 'The platform focuses on ETB pricing, local user needs, and simple digital service access.' },
      { icon: LockKeyhole, title: 'Trust-Focused', text: 'We use verification, account protection, and secure backend handling for sensitive actions.' },
      { icon: Smartphone, title: 'Mobile Friendly', text: 'Dink Card is made to work smoothly from mobile browsers and installed web apps.' }
    ]
  },
  '/contact': {
    eyebrow: 'Contact Support',
    title: 'Need help with your Dink Card account?',
    description: 'Contact the Dink Card support team for help with account access, payments, virtual card requests, KYC, and digital service questions.',
    cards: [
      { icon: HeadphonesIcon, title: 'Account Support', text: 'Get help with login, password reset, profile, and account status questions.' },
      { icon: WalletCards, title: 'Payment Help', text: 'Ask about funding, receipts, pending payment status, and transaction support.' },
      { icon: CreditCard, title: 'Official Emails', text: `${INFO_EMAIL} for general questions, ${SUPPORT_EMAIL} for help, ${SECURITY_EMAIL} for urgent safety reports.` }
    ]
  }
};

export default function MarketingPage() {
  const location = useLocation();
  const content = pageContent[location.pathname] || pageContent['/services'];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <BrandLogo to="/" imageClassName="h-8 w-8 rounded-lg" />
          <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex" aria-label="Main navigation">
            {PUBLIC_NAV_LINKS.filter((item) => ['Services', 'About', 'Contact'].includes(item.label)).map((item) => (
              <Link key={item.path} to={item.path} className="hover:text-primary">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <Link to="/login"><Button variant="ghost" size="sm">Sign In</Button></Link>
            <Link to="/register"><Button size="sm">Get Started</Button></Link>
          </div>
        </div>
      </header>

      <main>
        <section className="px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">{content.eyebrow}</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{content.title}</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{content.description}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/register">
                <Button size="lg" className="h-12 px-8">
                  Create Account <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" className="h-12 px-8">Sign In</Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="border-y border-border px-4 py-12">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
            {content.cards.map((item) => (
              <article key={item.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold">{item.title}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 text-center">
          <BrandLogo to="/" imageClassName="h-7 w-7 rounded-md" labelClassName="font-bold text-base" />
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground" aria-label="Footer navigation">
            {PUBLIC_NAV_LINKS.map((item) => (
              <Link key={item.path} to={item.path} className="hover:text-primary hover:underline">
                {item.label}
              </Link>
            ))}
          </nav>
          <LegalLinks />
          <p className="text-xs text-muted-foreground">{contactEmailLine}</p>
          <p className="max-w-2xl text-xs text-muted-foreground">{footerDisclaimer}</p>
        </div>
      </footer>
    </div>
  );
}
