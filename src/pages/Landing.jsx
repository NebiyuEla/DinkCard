import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import LegalLinks from '@/components/LegalLinks';
import { footerDisclaimer, platformDisclaimer } from '@/lib/legal';
import {
  CreditCard, Shield, Zap, Globe, ArrowRight, ChevronDown,
  Smartphone, DollarSign, CheckCircle, Lock } from
'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } }
};

const steps = [
{ icon: Smartphone, title: 'Sign Up & Verify', desc: 'Create your account and complete KYC verification in minutes.' },
{ icon: DollarSign, title: 'Add Funds for Services', desc: 'Use supported local payment methods for card-related service requests.' },
{ icon: CreditCard, title: 'Request Virtual Card', desc: 'Request a USD virtual card for supported online payments after KYC approval.' },
{ icon: Globe, title: 'Pay Online', desc: 'Use supported virtual card services where merchants and providers allow acceptance.' }];


const useCases = [
'Telegram Premium', 'Netflix', 'Spotify', 'Canva Pro', 'Apple Subscriptions',
'Google Play', 'Meta Ads', 'Amazon', 'ChatGPT Plus', 'GitHub', 'Figma', 'Adobe'];


const faqs = [
{ q: 'What currencies are supported?', a: 'You pay supported local amounts and receive available platform balance for eligible card-related services. Virtual cards are denominated in USD where available.' },
{ q: 'How long does funding take?', a: 'Hosted checkout funding requests are verified server-side. Manual reviews, if needed, are typically handled within 1-24 hours during business hours.' },
{ q: 'Is my card data secure?', a: 'Card details are encrypted and only revealed after verification. We never store raw card numbers on our servers.' },
{ q: 'Which merchants accept these cards?', a: 'Acceptance depends on the merchant, region, card network, provider rules, transaction type, and compliance checks.' },
{ q: 'Can I get a refund?', a: 'Refund policies depend on the merchant and provider. Contact support for assistance with disputes.' }];


export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">DinkCard</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link to="/register">
              <Button size="sm" className="bg-primary text-primary-foreground">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="absolute top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-[120px]" />
        
        <motion.div
          className="max-w-4xl mx-auto text-center relative"
          initial="hidden" animate="visible" variants={stagger}>
          
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium mb-8">
            <Zap className="w-3.5 h-3.5" />
            Now available for Ethiopian users
          </motion.div>
          
          <motion.h1 variants={fadeUp} className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-tight mb-6">
            Virtual USD Cards{' '}
            <span className="text-primary">From Ethiopia</span>
          </motion.h1>
          
          <motion.p variants={fadeUp} className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Access and manage partner-powered virtual card services for supported online payments. Simple, transparent, and built for verified users.
          </motion.p>
          
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register">
              <Button size="lg" className="bg-primary text-primary-foreground px-8 h-12 text-base font-semibold">
                Create Account <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button size="lg" variant="outline" className="h-12 text-base px-8">
                How It Works <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </a>
          </motion.div>

          {/* Floating card preview */}
          <motion.div
            variants={fadeUp}
            className="mt-16 mx-auto w-full max-w-sm aspect-[1.586/1] rounded-2xl bg-gradient-to-br from-secondary to-card border border-border p-6 flex flex-col justify-between animate-float">
            
            <div className="flex justify-between items-start">
              <div className="text-left">
                <p className="text-xs text-muted-foreground">DinkCard</p>
                <p className="text-[10px] text-muted-foreground/50">Virtual Card</p>
              </div>
              <span className="text-lg font-bold tracking-widest text-primary">DINK</span>
            </div>
            <p className="font-mono text-lg tracking-[0.2em] text-foreground/70 text-left">
              •••• •••• •••• 4242
            </p>
            <div className="flex justify-between items-end">
              <div className="text-left">
                <p className="text-[10px] text-muted-foreground">CARDHOLDER</p>
                <p className="text-xs font-medium">YOUR NAME</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">EXPIRY</p>
                <p className="text-xs font-mono">12/28</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div className="text-center mb-14" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Request virtual card-related services in four simple steps after verification.</p>
          </motion.div>
          
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            
            {steps.map((step, i) =>
            <motion.div key={i} variants={fadeUp} className="bg-card border border-border rounded-xl p-6 relative group hover:border-primary/30 transition-all">
                <div className="absolute -top-3 -left-2 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </div>
                <step.icon className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Supported uses */}
      <section className="py-20 px-4 bg-card/50">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Use Supported Online Payments</h2>
            <p className="text-muted-foreground mb-10 max-w-xl mx-auto">Merchant acceptance is not guaranteed and depends on provider, network, region, and merchant rules.</p>
          </motion.div>
          <motion.div
            className="flex flex-wrap justify-center gap-3"
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            
            {useCases.map((name, i) =>
            <motion.span key={i} variants={fadeUp} className="px-4 py-2 rounded-full bg-secondary border border-border text-sm font-medium hover:border-primary/30 transition-all cursor-default">
                {name}
              </motion.span>
            )}
          </motion.div>
          <p className="text-xs text-muted-foreground mt-6">Virtual cards may be used only for supported online payments. Merchant acceptance is not guaranteed.</p>
        </div>
      </section>

      {/* Security */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div className="text-center mb-14" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Security First</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Your money and data are protected with industry-standard security.</p>
          </motion.div>
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            
            {[
            { icon: Lock, title: 'Encrypted Data', desc: 'Card details and personal data are encrypted at rest and in transit.' },
            { icon: Shield, title: 'KYC Verified', desc: 'All users complete identity verification for fraud prevention.' },
            { icon: CheckCircle, title: 'Transparent Fees', desc: 'Every fee is shown before you confirm. No hidden charges.' }].
            map((item, i) =>
            <motion.div key={i} variants={fadeUp} className="bg-card border border-border rounded-xl p-6 text-center">
                <item.icon className="w-10 h-10 text-primary mx-auto mb-4" />
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-card/50">
        <div className="max-w-3xl mx-auto">
          <motion.div className="text-center mb-14" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Frequently Asked Questions</h2>
          </motion.div>
          <motion.div className="space-y-4" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            {faqs.map((faq, i) =>
            <motion.details key={i} variants={fadeUp} className="group bg-card border border-border rounded-xl">
                <summary className="flex items-center justify-between px-6 py-4 cursor-pointer font-medium">
                  {faq.q}
                  <ChevronDown className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform" />
                </summary>
                <div className="px-6 pb-4 text-sm text-muted-foreground">{faq.a}</div>
              </motion.details>
            )}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Get Your Virtual Card?</h2>
            <p className="text-muted-foreground mb-8">{platformDisclaimer}</p>
            <Link to="/register">
              <Button size="lg" className="bg-primary text-primary-foreground px-10 h-12 text-base font-semibold">
                Get Started Now <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold">DinkCard</span>
          </div>
          <div className="space-y-3">
            <LegalLinks />
            <p className="text-xs text-muted-foreground text-center max-w-2xl">{footerDisclaimer}</p>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} DinkCard</p>
        </div>
      </footer>
    </div>);

}

