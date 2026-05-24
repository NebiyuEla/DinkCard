import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { ArrowRight, CreditCard, Globe2, Landmark, MoonStar, ShieldCheck, SunMedium, WalletCards, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LegalLinks from '@/components/LegalLinks';
import PoweredByDinkDev from '@/components/PoweredByDinkDev';
import { footerDisclaimer } from '@/lib/legal';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55 } }
};

const translations = {
  en: {
    badge: 'Built for Ethiopia',
    titleA: 'Virtual card access',
    titleB: 'designed for Ethiopia',
    subtitle: 'Pay in ETB, get clear pricing, and manage verified virtual card services with a smoother local experience.',
    cta: 'Create Account',
    secondary: 'Sign In',
    powered: '⚡ Powered by DinkDev',
    stepsTitle: 'How it flows',
    steps: [
      { title: 'Verify once', desc: 'Complete KYC and unlock secure funding and card requests.' },
      { title: 'Add funds in ETB', desc: 'See the real total before payment with transparent service pricing.' },
      { title: 'Request card', desc: 'Create and fund your virtual card for supported online payments.' }
    ],
    whyTitle: 'Made for local trust',
    why: [
      { title: 'ETB-first checkout', desc: 'Customers see a simple ETB total with the right exchange view.' },
      { title: 'Secure controls', desc: 'KYC, PIN-protected card actions, audit logs, and verified payment flows.' },
      { title: 'Fast support flow', desc: 'Clear alerts, smoother mobile experience, and cleaner card management.' }
    ],
    footerLead: 'Dink Card by DinkDevLabs'
  },
  am: {
    badge: 'ለኢትዮጵያ የተሰራ',
    titleA: 'የቨርቹዋል ካርድ አገልግሎት',
    titleB: 'ለኢትዮጵያ በተሻለ መንገድ',
    subtitle: 'በብር ይክፈሉ፣ ግልፅ ዋጋ ይመልከቱ፣ እና የተረጋገጠ የቨርቹዋል ካርድ አገልግሎት በቀላሉ ያስተዳድሩ።',
    cta: 'አካውንት ፍጠር',
    secondary: 'ግባ',
    powered: '⚡ Powered by DinkDev',
    stepsTitle: 'እንዴት ይሰራል',
    steps: [
      { title: 'አንድ ጊዜ ያረጋግጡ', desc: 'KYC ያጠናቅቁ እና የደህንነት የገንዘብ ጨመር እና የካርድ ጥያቄ ይክፈቱ።' },
      { title: 'በብር ገንዘብ ያክሉ', desc: 'ከመክፈልዎ በፊት ትክክለኛውን ጠቅላላ ይመልከቱ።' },
      { title: 'ካርድ ይጠይቁ', desc: 'ለተፈቀዱ የመስመር ላይ ክፍያዎች ካርድ ይፍጠሩ እና ይሙሉ።' }
    ],
    whyTitle: 'ለአካባቢ ታማኝነት የተሰራ',
    why: [
      { title: 'በብር የሚጀምር መክፈያ', desc: 'ተጠቃሚዎች ቀላል የብር ጠቅላላ እና ግልፅ የመቀየሪያ እይታ ያያሉ።' },
      { title: 'የደህንነት መቆጣጠሪያ', desc: 'KYC፣ PIN የተጠበቀ የካርድ እርምጃ፣ audit logs እና የተረጋገጠ የክፍያ ፍሰት።' },
      { title: 'ፈጣን ድጋፍ', desc: 'ግልፅ ማሳወቂያዎች፣ የተሻለ ሞባይል ተሞክሮ እና ንጹህ የካርድ አስተዳደር።' }
    ],
    footerLead: 'Dink Card በ DinkDevLabs'
  }
};

export default function Landing() {
  const [lang, setLang] = useState('en');
  const { theme, setTheme } = useTheme();
  const copy = useMemo(() => translations[lang], [lang]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-bold tracking-tight">Dink Card</p>
              <PoweredByDinkDev compact className="text-[11px]" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang((current) => current === 'en' ? 'am' : 'en')}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold"
            >
              {lang === 'en' ? 'AM' : 'EN'}
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="rounded-full border border-border bg-card p-2"
            >
              {theme === 'light' ? <MoonStar className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
            </button>
            <Link to="/login"><Button variant="ghost" size="sm">{copy.secondary}</Button></Link>
            <Link to="/register"><Button size="sm" className="bg-primary text-primary-foreground">{copy.cta}</Button></Link>
          </div>
        </div>
      </div>

      <section className="relative overflow-hidden px-4 pb-20 pt-28 sm:pb-28 sm:pt-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(42,157,143,0.16),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(227,153,35,0.16),transparent_28%),linear-gradient(135deg,rgba(204,36,29,0.08),transparent_40%)]" />
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(90deg, transparent 0, transparent 24px, currentColor 24px, currentColor 25px)', backgroundSize: '25px 25px' }} />

        <motion.div initial="hidden" animate="visible" className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div variants={fadeUp} className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
              <Zap className="h-4 w-4" />
              {copy.badge}
            </div>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
                {copy.titleA} <span className="text-primary">{copy.titleB}</span>
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{copy.subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/register">
                <Button size="lg" className="h-12 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground transition-transform hover:scale-[1.02]">
                  {copy.cta} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" className="h-12 rounded-full px-8 text-base">{copy.secondary}</Button>
              </Link>
            </div>
            <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
                <Landmark className="h-5 w-5 text-primary" />
                <p className="mt-3 whitespace-nowrap text-xl font-bold">ETB Pricing</p>
                <p className="mt-1 text-sm text-muted-foreground">Clear local checkout before you pay.</p>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <p className="mt-3 whitespace-nowrap text-xl font-bold">Verified Access</p>
                <p className="mt-1 text-sm text-muted-foreground">KYC-first controls and safer card actions.</p>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
                <Globe2 className="h-5 w-5 text-primary" />
                <p className="mt-3 whitespace-nowrap text-xl font-bold">Online Ready</p>
                <p className="mt-1 text-sm text-muted-foreground">Built for supported global digital payments.</p>
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="relative">
            <div className="absolute -left-6 top-10 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
            <div className="absolute -right-6 bottom-10 h-24 w-24 rounded-full bg-accent/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-[32px] border border-border bg-card p-5 shadow-2xl shadow-black/10">
              <div className="rounded-[28px] bg-gradient-to-br from-[#0d1b2a] via-[#102a43] to-[#16324f] p-5 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white/80">Dink Card</p>
                    <p className="mt-1 text-xs text-white/50">{copy.powered}</p>
                  </div>
                  <WalletCards className="h-6 w-6 text-emerald-300" />
                </div>
                <div className="mt-10 space-y-4">
                  <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                    <span className="text-sm text-white/70">Available balance</span>
                    <span className="whitespace-nowrap font-mono text-lg font-bold">$25.00</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                    <span className="text-sm text-white/70">Card status</span>
                    <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">ACTIVE</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-[#f6bd60] px-4 py-4 text-[#3d2a09]">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em]">Add money</p>
                      <p className="mt-2 text-lg font-black">ETB</p>
                    </div>
                    <div className="rounded-2xl bg-[#2a9d8f] px-4 py-4 text-white">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em]">Request card</p>
                      <p className="mt-2 text-lg font-black">USD</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      <section className="px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{copy.stepsTitle}</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">Simple, local, and secure</h2>
            </div>
            <PoweredByDinkDev compact className="hidden sm:inline-flex" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {copy.steps.map((step, index) => (
              <motion.div key={step.title} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="rounded-3xl border border-border bg-card p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">0{index + 1}</p>
                <h3 className="mt-4 whitespace-nowrap text-2xl font-black">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-6xl rounded-[36px] border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{copy.whyTitle}</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight">Dink Card by DinkDevLabs</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
                Dink Card helps verified Ethiopian users access partner-powered virtual card services with cleaner pricing, safer flows, and a mobile-first experience.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {copy.why.map((item) => (
                <motion.div key={item.title} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="rounded-3xl border border-border bg-background/70 p-5">
                  <h3 className="whitespace-nowrap text-lg font-black">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-bold">{copy.footerLead}</p>
            <PoweredByDinkDev compact className="mt-2" />
          </div>
          <div className="space-y-3">
            <LegalLinks />
            <p className="max-w-2xl text-xs text-muted-foreground">{footerDisclaimer}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
