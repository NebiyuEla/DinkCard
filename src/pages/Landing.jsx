import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  DollarSign,
  Globe2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UserCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import LegalLinks from '@/components/LegalLinks';
import BrandLogo from '@/components/BrandLogo';
import { footerDisclaimer, platformDisclaimer } from '@/lib/legal';

const steps = [
  { icon: UserCheck, title: 'Create & Verify', desc: 'Open your account and complete identity verification.' },
  { icon: DollarSign, title: 'Add Funds in ETB', desc: 'See the exchange rate and total before payment.' },
  { icon: CreditCard, title: 'Request Your Virtual Card', desc: 'Request a card after verification and funding.' },
  { icon: Globe2, title: 'Pay Online Securely', desc: 'Use supported card services for eligible online payments.' }
];

const useGroups = [
  { title: 'Subscriptions', items: ['Netflix', 'Spotify', 'Telegram Premium'] },
  { title: 'Digital Tools', items: ['Canva Pro', 'ChatGPT Plus', 'Google Play'] },
  { title: 'Business', items: ['Meta Ads', 'Amazon', 'App stores'] }
];

const security = [
  { icon: LockKeyhole, title: 'Protected Data', desc: 'Sensitive account and card data is handled with strict access controls.' },
  { icon: ShieldCheck, title: 'Verified Users', desc: 'KYC is required before deposits and card requests.' },
  { icon: DollarSign, title: 'Clear Pricing', desc: 'The checkout shows the rate, fee, and total before payment.' },
  { icon: CheckCircle2, title: 'Partner Based Processing', desc: 'Card services depend on approved infrastructure partners and compliance checks.' }
];

const faqs = [
  { q: 'Who is Dink Card for?', a: 'Dink Card is built for verified Ethiopian users who need access to supported virtual card-related services.' },
  { q: 'Is Dink Card a bank?', a: 'No. Dink Card is not a bank or financial institution. Card-related services are provided through approved third-party infrastructure partners.' },
  { q: 'Is card approval guaranteed?', a: 'No. Card approval, funding, processing, and availability depend on verification, provider rules, compliance checks, and technical availability.' },
  { q: 'Will the card work everywhere?', a: 'Merchant acceptance is not guaranteed. It depends on the merchant, region, provider rules, card network, and transaction type.' }
];

const reveal = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } }
};

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 24, mass: 0.4 });
  return <motion.div className="fixed left-0 top-0 z-[70] h-1 origin-left bg-primary" style={{ scaleX }} />;
}

function BackgroundSystem() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#f7fbf8]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(21,128,108,0.13),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(94,234,212,0.13),transparent_28%),linear-gradient(180deg,#f8fcfa,#eef7f4_55%,#fbfdfb)]" />
      <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(135deg,#006b5f_0_1px,transparent_1px_14px),linear-gradient(45deg,#006b5f_0_1px,transparent_1px_18px)]" />
      <motion.div
        className="absolute left-[-10%] top-[18%] h-72 w-72 rounded-full bg-teal-300/25 blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, 22, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[10%] right-[-8%] h-80 w-80 rounded-full bg-emerald-200/35 blur-3xl"
        animate={{ x: [0, -26, 0], y: [0, -18, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

function Navbar() {
  const { scrollYProgress } = useScroll();
  const height = useTransform(scrollYProgress, [0, 0.08], [76, 62]);
  const shadow = useTransform(scrollYProgress, [0, 0.12], ['0 0 0 rgba(0,0,0,0)', '0 14px 40px rgba(3, 47, 39, 0.10)']);

  return (
    <motion.nav style={{ height, boxShadow: shadow }} className="fixed inset-x-0 top-0 z-50 border-b border-teal-950/10 bg-white/78 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
        <BrandLogo to="/" imageClassName="h-9 w-9 rounded-xl" labelClassName="text-slate-950" />
        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost" size="sm" className="text-slate-700 hover:text-slate-950">Sign In</Button>
          </Link>
          <Link to="/register">
            <Button size="sm" className="bg-[#00796b] text-white hover:bg-[#006256]">Get Started</Button>
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}

function InteractiveCard({ mode = 'hero', compact = false }) {
  const prefersReducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-80, 80], [9, -9]);
  const rotateY = useTransform(x, [-80, 80], [-10, 10]);
  const isSecure = mode === 'secure';
  const isBack = mode === 'back';

  return (
    <motion.div
      className="mx-auto w-full max-w-[390px]"
      onMouseMove={(event) => {
        if (prefersReducedMotion) return;
        const rect = event.currentTarget.getBoundingClientRect();
        x.set(event.clientX - rect.left - rect.width / 2);
        y.set(event.clientY - rect.top - rect.height / 2);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      style={prefersReducedMotion ? { perspective: 1200 } : { perspective: 1200, rotateX, rotateY }}
    >
      <motion.div
        className={`relative overflow-hidden rounded-[2rem] border border-white/50 bg-gradient-to-br from-[#09342f] via-[#06231f] to-[#020d0c] p-6 text-white shadow-2xl shadow-teal-950/20 ${compact ? 'min-h-[210px]' : 'min-h-[240px]'}`}
        animate={prefersReducedMotion ? undefined : { y: mode === 'final' ? [0, -8, 0] : 0 }}
        transition={{ duration: 4, repeat: mode === 'final' ? Infinity : 0, ease: 'easeInOut' }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(94,234,212,0.30),transparent_30%),radial-gradient(circle_at_88%_80%,rgba(16,185,129,0.22),transparent_32%)]" />
        <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(135deg,white_0_1px,transparent_1px_13px)]" />
        <motion.div
          className="absolute -right-10 -top-12 h-36 w-36 rounded-full border border-emerald-100/20 bg-white/5"
          animate={prefersReducedMotion ? undefined : { scale: isSecure ? 1.16 : 1, rotate: isBack ? 18 : 0 }}
          transition={{ duration: 0.65 }}
        />
        {isSecure && (
          <motion.div initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} className="absolute right-5 top-5 rounded-full border border-emerald-200/30 bg-emerald-100/10 p-2">
            <ShieldCheck className="h-5 w-5 text-emerald-100" />
          </motion.div>
        )}

        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-100">Dink Card</p>
            <p className="mt-1 text-xs text-white/55">Virtual card services</p>
          </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
            {isSecure ? 'Verified' : mode === 'funding' ? 'Funded' : 'Ready'}
          </span>
        </div>

        <div className="relative mt-12">
          <p className="font-mono text-xl tracking-[0.22em] text-white/90 sm:text-2xl">
            {isBack ? 'ETB -> USD' : '**** **** **** 7626'}
          </p>
        </div>

        <div className="relative mt-10 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Cardholder</p>
            <p className="mt-1 text-sm font-semibold">Verified User</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">{isBack ? 'Flow' : 'Expiry'}</p>
            <p className="mt-1 font-mono text-sm">{isBack ? 'Secure' : '12/28'}</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function HeroSection() {
  return (
    <section className="relative px-4 pb-16 pt-28 sm:pb-20 sm:pt-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_0.9fr]">
        <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.08 } } }} className="text-center lg:text-left">
          <motion.div variants={reveal} className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-700/15 bg-white/70 px-3 py-1 text-sm font-medium text-[#00796b] shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Built for Ethiopian digital access
          </motion.div>
          <motion.h1 variants={reveal} className="text-4xl font-bold leading-[1.02] tracking-[-0.04em] text-slate-950 sm:text-6xl lg:text-7xl">
            Online payments, made simpler from Ethiopia.
          </motion.h1>
          <motion.p variants={reveal} className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg lg:mx-0">
            Dink Card helps verified users add funds in ETB and access supported virtual card-related services with clear pricing and a clean flow.
          </motion.p>
          <motion.div variants={reveal} className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <Link to="/register">
              <Button size="lg" className="h-12 w-full bg-[#00796b] px-8 text-base text-white hover:bg-[#006256] sm:w-auto">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button size="lg" variant="outline" className="h-12 w-full border-teal-900/15 bg-white/70 px-8 text-base text-slate-800 hover:bg-white sm:w-auto">
                How It Works <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </motion.div>
          <motion.p variants={reveal} className="mt-5 text-xs leading-5 text-slate-500">
            Merchant acceptance is not guaranteed. Services are subject to provider rules, compliance checks, technical availability, and applicable regulations.
          </motion.p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.12 }} className="relative">
          <div className="absolute -inset-8 rounded-full bg-teal-300/20 blur-3xl" />
          <InteractiveCard />
        </motion.div>
      </div>
    </section>
  );
}

function StickyCardJourney() {
  const sectionRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start center', 'end end'] });
  const cardY = useTransform(scrollYProgress, [0, 1], [0, 44]);
  const rotate = useTransform(scrollYProgress, [0, 0.35, 0.7, 1], [-4, 3, -2, 0]);
  const mode = useTransform(scrollYProgress, (value) => {
    if (value > 0.72) return 'secure';
    if (value > 0.42) return 'funding';
    if (value > 0.2) return 'back';
    return 'hero';
  });
  const [cardMode, setCardMode] = useState('hero');

  React.useEffect(() => {
    return mode.on('change', setCardMode);
  }, [mode]);

  return (
    <section ref={sectionRef} id="how-it-works" className="relative px-4 py-14 sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_420px]">
        <div className="space-y-20">
          <SectionIntro eyebrow="Simple flow" title="Four calm steps from account to online payment." text="The process stays guided and readable: verify, add funds, request, then use for supported online payments." />
          <div className="space-y-5">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-80px' }}
                variants={reveal}
                className="group rounded-3xl border border-teal-950/10 bg-white/75 p-5 shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:border-teal-700/25 hover:shadow-xl hover:shadow-teal-950/5 sm:p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#00796b]/10 text-[#00796b] transition-transform group-hover:scale-105">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Step {index + 1}</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{step.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="hidden lg:block">
          <motion.div style={prefersReducedMotion ? undefined : { y: cardY, rotate }} className="sticky top-28">
            <InteractiveCard mode={cardMode} compact />
            <div className="mx-auto mt-5 max-w-sm rounded-2xl border border-teal-950/10 bg-white/70 p-4 text-sm leading-6 text-slate-600 shadow-sm backdrop-blur">
              The card follows the journey: funding, verification, and secure usage stay connected in one simple flow.
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function SectionIntro({ eyebrow, title, text }) {
  return (
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={reveal}>
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#00796b]">{eyebrow}</p>
      <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-[-0.03em] text-slate-950 sm:text-5xl">{title}</h2>
      <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{text}</p>
    </motion.div>
  );
}

function SupportedUses() {
  return (
    <section className="px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <SectionIntro eyebrow="Supported uses" title="Organized for everyday digital services." text="Use Dink Card for eligible online payments where card acceptance is supported by the merchant and provider rules." />
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={{ visible: { transition: { staggerChildren: 0.08 } } }} className="mt-8 grid gap-4 md:grid-cols-3">
          {useGroups.map((group) => (
            <motion.div key={group.title} variants={reveal} className="rounded-3xl border border-teal-950/10 bg-white/75 p-5 shadow-sm backdrop-blur">
              <h3 className="text-sm font-semibold text-slate-950">{group.title}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <span key={item} className="rounded-full border border-teal-950/10 bg-[#f1faf7] px-3 py-1.5 text-xs font-medium text-slate-700">
                    {item}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
        <p className="mt-5 rounded-2xl border border-amber-600/15 bg-amber-50/70 p-4 text-sm leading-6 text-amber-800">
          Merchant acceptance is not guaranteed and depends on provider, network, region, merchant rules, compliance checks, and transaction type.
        </p>
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section className="px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl rounded-[2rem] border border-teal-950/10 bg-[#06231f] p-6 text-white shadow-2xl shadow-teal-950/10 sm:p-8 lg:p-10">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">Trust layer</p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em] sm:text-5xl">Security without the noise.</h2>
            <p className="mt-4 text-sm leading-7 text-white/65">
              The product experience stays simple, while the platform keeps verification, protected data handling, and clear pricing at the center.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {security.map((item) => (
              <motion.div key={item.title} whileHover={{ y: -4 }} className="rounded-3xl border border-white/10 bg-white/[0.055] p-5">
                <item.icon className="h-6 w-6 text-emerald-200" />
                <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
                <p className="mt-2 text-xs leading-6 text-white/60">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const [open, setOpen] = useState(0);

  return (
    <section className="px-4 py-14 sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.75fr_1fr]">
        <SectionIntro eyebrow="Questions" title="Clear answers before you start." text="Short, honest answers about eligibility, approval, acceptance, and Dink Card's role." />
        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div key={faq.q} className="overflow-hidden rounded-3xl border border-teal-950/10 bg-white/75 shadow-sm backdrop-blur">
              <button type="button" onClick={() => setOpen(open === index ? -1 : index)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-slate-950">
                {faq.q}
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open === index ? 'rotate-180' : ''}`} />
              </button>
              <motion.div initial={false} animate={{ height: open === index ? 'auto' : 0, opacity: open === index ? 1 : 0 }} className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-6 text-slate-600">{faq.a}</p>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="px-4 pb-16 pt-8 sm:pb-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 rounded-[2.5rem] border border-teal-950/10 bg-white/80 p-6 shadow-2xl shadow-teal-950/10 backdrop-blur sm:p-10 lg:grid-cols-[1fr_380px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#00796b]">Final step</p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-slate-950 sm:text-5xl">Ready to unlock smarter online payments?</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">{platformDisclaimer}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link to="/register">
              <Button size="lg" className="h-12 w-full bg-[#00796b] px-8 text-white hover:bg-[#006256] sm:w-auto">
                Create Account <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/fee-disclosure">
              <Button size="lg" variant="outline" className="h-12 w-full border-teal-950/15 bg-white px-8 text-slate-800 hover:bg-slate-50 sm:w-auto">
                View Fees
              </Button>
            </Link>
          </div>
        </div>
        <InteractiveCard mode="final" compact />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-teal-950/10 bg-white/70 px-4 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
        <BrandLogo to="/" imageClassName="h-8 w-8 rounded-lg" labelClassName="text-base text-slate-950" />
        <div className="space-y-3">
          <LegalLinks />
          <p className="max-w-2xl text-center text-xs leading-5 text-slate-500">{footerDisclaimer}</p>
        </div>
        <p className="text-xs text-slate-500">(c) {new Date().getFullYear()} Dink Card</p>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden text-slate-950">
      <ScrollProgress />
      <BackgroundSystem />
      <Navbar />
      <HeroSection />
      <StickyCardJourney />
      <SupportedUses />
      <SecuritySection />
      <FAQSection />
      <FinalCTA />
      <Footer />
    </div>
  );
}
