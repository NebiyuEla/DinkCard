import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import LegalLinks from '@/components/LegalLinks';
import BrandLogo from '@/components/BrandLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { footerDisclaimer, platformDisclaimer } from '@/lib/legal';
import { PUBLIC_NAV_LINKS } from '@/lib/seo';
import {
  ArrowRight,
  CheckCircle,
  ChevronDown,
  CreditCard,
  DollarSign,
  Globe,
  HeadphonesIcon,
  Lock,
  Shield,
  Smartphone,
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } }
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } }
};

const steps = [
  { icon: Smartphone, title: 'Sign Up & Verify', desc: 'Create your account and complete KYC before using card services.' },
  { icon: DollarSign, title: 'Add Funds', desc: 'Pay in ETB and see the full total before you confirm.' },
  { icon: CreditCard, title: 'Request Virtual Card', desc: 'Request and manage your virtual card after approval.' },
  { icon: Globe, title: 'Use Online', desc: 'Use supported virtual card services for eligible online payments.' }
];

const useCases = [
  'Netflix',
  'Spotify',
  'Canva Pro',
  'Telegram Premium',
  'ChatGPT Plus',
  'Google Play',
  'Meta Ads',
  'Amazon'
];

const faqs = [
  { q: 'Who can use Dink Card?', a: 'Verified users in Ethiopia can access supported virtual card-related services after KYC approval.' },
  { q: 'How do I pay?', a: 'You pay in ETB and the platform shows the total before you confirm payment.' },
  { q: 'Is merchant acceptance guaranteed?', a: 'No. Acceptance depends on the merchant, provider rules, card network, region, and transaction type.' },
  { q: 'Is my data protected?', a: 'Yes. Sensitive account and card data are protected with access controls and encrypted handling.' }
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="fixed top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4">
          <BrandLogo to="/" imageClassName="h-8 w-8 rounded-lg" />
          <nav className="hidden items-center justify-center gap-5 text-sm text-muted-foreground md:flex" aria-label="Main navigation">
            {PUBLIC_NAV_LINKS.filter((item) => ['Services', 'About', 'Contact'].includes(item.label)).map((item) => (
              <Link key={item.path} to={item.path} className="hover:text-primary">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center justify-end gap-3">
            <ThemeToggle compact />
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      <section className="px-4 pb-12 pt-24 sm:pb-14 sm:pt-28">
        <motion.div
          className="mx-auto flex max-w-5xl flex-col items-center gap-8 text-center"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <div className="mx-auto max-w-3xl">
            <motion.div variants={fadeUp} className="mb-5 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
              Simple online payment access
            </motion.div>
            <motion.h1 variants={fadeUp} className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Virtual card solution for secure online payments in Ethiopia
            </motion.h1>
            <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Create and manage supported virtual cards for online payments, subscriptions, and digital services through a clear verified flow.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/register">
                <Button size="lg" className="h-12 px-8 text-base">
                  Create Account <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button size="lg" variant="outline" className="h-12 px-8 text-base">
                  How It Works <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </motion.div>
          </div>

          <motion.div variants={fadeUp} className="mx-auto w-full max-w-sm">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="mb-1">
                    <BrandLogo to="/" imageClassName="h-7 w-7 rounded-lg" labelClassName="text-sm font-semibold" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Virtual USD card</p>
                </div>
                <span className="text-sm font-bold tracking-[0.24em] text-primary">DINK</span>
              </div>
              <div className="mt-10">
                <p className="font-mono text-lg tracking-[0.22em] text-foreground/75">**** **** **** 4242</p>
              </div>
              <div className="mt-10 flex items-end justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground">CARDHOLDER</p>
                  <p className="text-xs font-medium">YOUR NAME</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">EXPIRY</p>
                  <p className="text-xs font-mono">12/28</p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      <section id="how-it-works" className="border-t border-border px-4 py-12 sm:py-14">
        <div className="mx-auto max-w-6xl">
          <motion.div className="mb-8 text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl font-bold tracking-tight">How It Works</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">Start with verification, fund in ETB, and request your card through a simple guided flow.</p>
          </motion.div>
          <motion.div
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            {steps.map((step, index) => (
              <motion.div key={step.title} variants={fadeUp} className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Step {index + 1}
                </div>
                <h3 className="text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="px-4 py-12 sm:py-14">
        <div className="mx-auto max-w-6xl">
          <motion.div className="mb-8 text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl font-bold tracking-tight">Supported Online Uses</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">Merchant acceptance is not guaranteed and depends on provider, network, region, and merchant rules.</p>
          </motion.div>
          <motion.div
            className="flex flex-wrap justify-center gap-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            {useCases.map((name) => (
              <motion.span key={name} variants={fadeUp} className="rounded-full border border-border px-4 py-2 text-sm font-medium">
                {name}
              </motion.span>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="border-y border-border px-4 py-12 sm:py-14">
        <div className="mx-auto max-w-6xl">
          <motion.div className="mb-8 text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl font-bold tracking-tight">Security First</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">Clear checks, protected data, and transparent payment flow.</p>
          </motion.div>
          <motion.div
            className="grid gap-4 md:grid-cols-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            {[
              { icon: Lock, title: 'Protected Data', desc: 'Sensitive account and card information is handled securely.' },
              { icon: Shield, title: 'Verified Users', desc: 'KYC approval is required before card-related actions are allowed.' },
              { icon: CheckCircle, title: 'Clear Pricing', desc: 'Users see the total before payment with fewer surprises.' }
            ].map((item) => (
              <motion.div key={item.title} variants={fadeUp} className="rounded-2xl border border-border bg-card p-6 text-center">
                <item.icon className="mx-auto mb-4 h-9 w-9 text-primary" />
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="px-4 py-12 sm:py-14">
        <div className="mx-auto max-w-3xl">
          <motion.div className="mb-8 text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl font-bold tracking-tight">Frequently Asked Questions</h2>
          </motion.div>
          <motion.div className="space-y-4" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            {faqs.map((faq) => (
              <motion.details key={faq.q} variants={fadeUp} className="rounded-2xl border border-border bg-card">
                <summary className="flex cursor-pointer items-center justify-between px-5 py-4 font-medium">
                  {faq.q}
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-5 pb-4 text-sm leading-6 text-muted-foreground">{faq.a}</div>
              </motion.details>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="px-4 pb-14 pt-2 sm:pb-16">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl font-bold tracking-tight">Ready to Get Started?</h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{platformDisclaimer}</p>
            <Link to="/register">
              <Button size="lg" className="mt-8 h-12 px-10 text-base">
                Get Started Now <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="border-t border-border px-4 py-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-3xl border border-border bg-card p-6 text-center sm:p-8">
          <HeadphonesIcon className="h-9 w-9 text-primary" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Contact us</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Need help with an account, payment, verification, or card request? Use the contact page or email support directly.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm sm:flex-row">
            <Link to="/contact" className="font-semibold text-primary hover:underline">Open contact page</Link>
            <a href="mailto:support@dinkcard.et" className="font-semibold text-primary hover:underline">support@dinkcard.et</a>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-4 py-10">
        <div className="mx-auto grid max-w-6xl items-center gap-5 text-center md:grid-cols-[1fr_2fr_1fr]">
          <BrandLogo to="/" imageClassName="h-7 w-7 rounded-md" labelClassName="font-bold text-base" />
          <div className="space-y-3">
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground" aria-label="Footer navigation">
            {PUBLIC_NAV_LINKS.map((item) => (
              <Link key={item.path} to={item.path} className="hover:text-primary hover:underline">
                {item.label}
              </Link>
              ))}
            </nav>
            <LegalLinks />
            <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground">
              <a href="mailto:info@dinkcard.et" className="hover:text-primary hover:underline">info@dinkcard.et</a>
              <a href="mailto:support@dinkcard.et" className="hover:text-primary hover:underline">support@dinkcard.et</a>
              <a href="mailto:security@dinkcard.et" className="hover:text-primary hover:underline">security@dinkcard.et</a>
            </p>
            <p className="max-w-2xl text-center text-xs text-muted-foreground">{footerDisclaimer}</p>
          </div>
          <p className="text-xs text-muted-foreground md:text-right">(c) {new Date().getFullYear()} Dink Card</p>
        </div>
      </footer>
    </div>
  );
}
