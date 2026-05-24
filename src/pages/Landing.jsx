import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import LegalLinks from '@/components/LegalLinks';
import { footerDisclaimer, platformDisclaimer } from '@/lib/legal';
import {
  ArrowRight,
  CheckCircle,
  ChevronDown,
  CreditCard,
  DollarSign,
  Globe,
  Lock,
  Shield,
  Smartphone,
  Zap
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
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <CreditCard className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight">Dink Card</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      <section className="px-4 pb-16 pt-28">
        <motion.div
          className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <div>
            <motion.div variants={fadeUp} className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
              <Zap className="h-3.5 w-3.5" />
              Built for Ethiopian users
            </motion.div>
            <motion.h1 variants={fadeUp} className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Simple virtual card access from Ethiopia
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Pay in ETB, complete verification, and manage supported virtual card services with a clean and reliable flow.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
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
                  <p className="text-sm font-semibold">Dink Card</p>
                  <p className="mt-1 text-xs text-muted-foreground">Virtual USD card</p>
                </div>
                <span className="text-sm font-bold tracking-[0.24em] text-primary">DINK</span>
              </div>
              <div className="mt-10">
                <p className="font-mono text-lg tracking-[0.22em] text-foreground/75">•••• •••• •••• 4242</p>
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

      <section id="how-it-works" className="border-t border-border px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <motion.div className="mb-10 text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
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

      <section className="px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <motion.div className="mb-10 text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
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

      <section className="border-y border-border px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <motion.div className="mb-10 text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
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

      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <motion.div className="mb-10 text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
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

      <section className="px-4 pb-16 pt-4">
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

      <footer className="border-t border-border px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <CreditCard className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold">Dink Card</span>
          </div>
          <div className="space-y-3">
            <LegalLinks />
            <p className="max-w-2xl text-center text-xs text-muted-foreground">{footerDisclaimer}</p>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Dink Card</p>
        </div>
      </footer>
    </div>
  );
}
