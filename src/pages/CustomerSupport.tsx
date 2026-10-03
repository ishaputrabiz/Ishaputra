import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  Phone,
  MessageCircle,
  ChevronRight,
  ArrowLeft,
  Clock,
  MapPin,
  Send,
  HeadphonesIcon,
  CheckCircle,
} from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import { subscribeCustomerSupportSettings, DEFAULT_SUPPORT, CustomerSupportSettings } from '@/services/siteSettingsService';
import { EASE_OUT, staggerDelay, tap } from '@/lib/motion';
import { usePageMeta } from '@/hooks/usePageMeta';

/** A swapped view: fades up 8px in, fades out faster. */
const viewMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.18, ease: EASE_OUT } },
};

/** List rows entering one after another, 40ms apart. */
const rowMotion = (index: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.24, ease: EASE_OUT, delay: staggerDelay(index) },
});

const OPTION_CARD =
  'w-full rounded-card border border-foreground/[0.08] bg-card/80 p-4 text-left shadow-panel transition-[transform,border-color,background-color] duration-hover ease-out hover:-translate-y-0.5 hover:border-primary/35 active:bg-foreground/[0.06] lg:p-5';
const ROW_BUTTON =
  'w-full rounded-card bg-foreground/[0.03] p-3.5 text-left transition-colors duration-hover hover:bg-foreground/[0.05] active:bg-foreground/[0.06] lg:p-4';
const TINT_BOX = 'rounded-card border border-primary/20 bg-primary/[0.06] p-3.5 lg:p-4';
const SECTION_LABEL = 'mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:mb-3';
const LINK = 'text-foreground underline-offset-4 transition-colors duration-hover hover:text-primary hover:underline';

const CustomerSupport = () => {
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<'email' | 'phone' | 'message' | null>(null);
  const [support, setSupport] = useState<CustomerSupportSettings>(DEFAULT_SUPPORT);

  useEffect(() => subscribeCustomerSupportSettings(setSupport), []);

  usePageMeta({
    title: 'Customer support',
    description: 'Reach us about an order, a product or your routine by email, phone or WhatsApp.',
  });

  // Contact details (admin-managed; whatsapp normalised by stripping non-digits)
  const contactInfo = {
    email: support.email,
    phone: support.phone,
    // Only a number set as WhatsApp: falling back to the phone would open chats
    // with whoever owns it (the phone is placeholder data until launch).
    whatsapp: (support.whatsapp || '').replace(/\D/g, ''),
    hours: support.hours,
    responseTime: support.responseTime,
  };

  // FAQ questions for email
  const faqQuestions = [
    {
      id: 1,
      question: 'How do I track my order?',
      message: 'Hello, I would like to know how to track my order. Could you please provide me with the tracking details?',
    },
    {
      id: 2,
      question: 'What is your return policy?',
      message: 'Hello, I would like to know more about your return and refund policy.',
    },
    {
      id: 3,
      question: 'Which product is right for me?',
      message: 'Hello, I would like help choosing the right Ishaputra products for my needs. Could you suggest a routine?',
    },
    {
      id: 4,
      question: 'What are the payment options available?',
      message: 'Hello, I would like to know about the payment methods accepted for purchases.',
    },
    {
      id: 5,
      question: 'What ingredients are in your products?',
      message: 'Hello, I would like to know the full ingredient list of a product before I buy.',
    },
    {
      id: 6,
      question: 'Do you provide international shipping?',
      message: 'Hello, I would like to inquire about international shipping options and delivery times.',
    },
    {
      id: 7,
      question: 'How long before I see results?',
      message: 'Hello, I would like to know how long it usually takes to see results and how to use the products for the best effect.',
    },
    {
      id: 8,
      question: 'Can I combine products in one routine?',
      message: 'Hello, I would like to know which Ishaputra products can be used together in a daily routine.',
    },
  ];

  // WhatsApp quick messages
  const whatsappMessages = [
    {
      id: 1,
      title: 'Order status',
      message: 'Hello, I would like to check the status of my order.',
    },
    {
      id: 2,
      title: 'Product question',
      message: 'Hello, I have a question about one of your products.',
    },
    {
      id: 3,
      title: 'Which product suits me',
      message: 'Hello, could you help me choose the right Ishaputra products for my needs?',
    },
    {
      id: 4,
      title: 'Return or refund',
      message: 'Hello, I would like help with a return or a refund.',
    },
    {
      id: 5,
      title: 'Bulk or gifting enquiry',
      message: 'Hello, I would like to ask about bulk or gifting orders.',
    },
  ];

  // Phone inquiry options
  const phoneOptions = [
    {
      id: 1,
      title: 'Product questions',
      description: 'Ingredients, usage and which product suits you',
    },
    {
      id: 2,
      title: 'Order support',
      description: 'Track your order or delivery status',
    },
    {
      id: 3,
      title: 'Website and account',
      description: 'Help with signing in, checkout or your account',
    },
    {
      id: 4,
      title: 'Returns and refunds',
      description: 'Start a return or ask about a refund',
    },
  ];

  // Opens the visitor's own email app (works without Gmail).
  const handleEmailClick = (message: string, subject = 'Customer support enquiry') => {
    window.location.href = `mailto:${contactInfo.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  };

  const handleWhatsAppClick = (message: string) => {
    const whatsappLink = `https://wa.me/${contactInfo.whatsapp}?text=${encodeURIComponent(message)}`;
    window.open(whatsappLink, '_blank', 'noopener,noreferrer');
  };

  const handlePhoneCall = () => {
    window.location.href = `tel:${contactInfo.phone}`;
  };

  const telHref = `tel:${(contactInfo.phone || '').replace(/\s+/g, '')}`;

  return (
    <div className="min-h-screen tx-paper">
      <Header />

      <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-4 py-4 pb-24 outline-none lg:py-6 lg:pb-8">
        <button
          type="button"
          onClick={() => {
            if (selectedOption) { setSelectedOption(null); return; }
            navigate('/account');
          }}
          className="-ml-2 mb-3 inline-flex h-10 items-center gap-1.5 rounded-control px-2 text-sm font-medium text-foreground/80 transition-[color,background-color,transform] duration-hover ease-out hover:bg-muted hover:text-foreground active:scale-[0.97] lg:mb-5"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back
        </button>

        <AnimatePresence mode="wait" initial={false}>
          {!selectedOption ? (
            <motion.div key="options" {...viewMotion}>
              {/* Header */}
              <div className="panel tx-sheet tx-contour mb-5 overflow-hidden px-5 py-7 text-center lg:mb-8 lg:px-8">
                <p className="eyebrow-no eyebrow-center mb-4"><span>We&rsquo;re here to help</span></p>
                <div className="tx-slate mx-auto mb-3 grid h-12 w-12 place-items-center rounded-card text-highlight-soft">
                  <HeadphonesIcon aria-hidden="true" className="size-6" />
                </div>
                <h1 className="mb-1.5 font-heading text-2xl font-semibold tracking-tight text-foreground [text-wrap:balance] lg:mb-2 lg:text-4xl">
                  Customer support
                </h1>
                <p className="mx-auto max-w-md text-sm text-muted-foreground [text-wrap:pretty]">
                  Reach us about an order, a product or your routine.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                  {contactInfo.hours && (
                    <span className="rounded-chip border border-foreground/10 bg-muted px-2.5 py-1">{contactInfo.hours}</span>
                  )}
                  {contactInfo.responseTime && (
                    <span className="rounded-chip border border-foreground/10 bg-muted px-2.5 py-1">
                      Replies: {contactInfo.responseTime.toLowerCase()}
                    </span>
                  )}
                </div>
              </div>

              {/* Contact options */}
              <div className="mb-5 space-y-2.5 lg:mb-8 lg:space-y-3">
                {contactInfo.email && (
                  <motion.button type="button" onClick={() => setSelectedOption('email')} whileTap={tap} className={OPTION_CARD}>
                    <div className="flex items-center gap-3 lg:gap-4">
                      <div className="grid size-10 shrink-0 place-items-center rounded-card bg-primary/[0.08] text-primary lg:size-12">
                        <Mail aria-hidden="true" className="size-5 lg:size-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold text-foreground lg:text-base">Email support</h2>
                        <p className="text-xs text-muted-foreground lg:text-sm">Pick a question to start an email</p>
                      </div>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground lg:size-5" />
                    </div>
                  </motion.button>
                )}

                {contactInfo.phone && (
                  <motion.button type="button" onClick={() => setSelectedOption('phone')} whileTap={tap} className={OPTION_CARD}>
                    <div className="flex items-center gap-3 lg:gap-4">
                      <div className="grid size-10 shrink-0 place-items-center rounded-card bg-primary/[0.08] text-primary lg:size-12">
                        <Phone aria-hidden="true" className="size-5 lg:size-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold text-foreground lg:text-base">Phone support</h2>
                        <p className="text-xs text-muted-foreground lg:text-sm">Talk directly with our team</p>
                      </div>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground lg:size-5" />
                    </div>
                  </motion.button>
                )}

                {contactInfo.whatsapp && (
                  <motion.button type="button" onClick={() => setSelectedOption('message')} whileTap={tap} className={OPTION_CARD}>
                    <div className="flex items-center gap-3 lg:gap-4">
                      <div className="grid size-10 shrink-0 place-items-center rounded-card bg-primary/[0.08] text-primary lg:size-12">
                        <MessageCircle aria-hidden="true" className="size-5 lg:size-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold text-foreground lg:text-base">WhatsApp chat</h2>
                        <p className="text-xs text-muted-foreground lg:text-sm">Quick answers by message</p>
                      </div>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground lg:size-5" />
                    </div>
                  </motion.button>
                )}
              </div>

              {/* Hours and direct contact, one panel with a divider */}
              <div className="panel tx-sheet divide-y divide-foreground/[0.08]">
                <div className="flex items-start gap-3 p-4 lg:gap-4 lg:p-5">
                  <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h2 className="mb-1 text-sm font-semibold text-foreground lg:text-base">Business hours</h2>
                    {contactInfo.hours && <p className="text-sm text-muted-foreground">{contactInfo.hours}</p>}
                    {contactInfo.responseTime && (
                      <p className="text-sm text-muted-foreground">Response time: {contactInfo.responseTime.toLowerCase()}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 lg:gap-4 lg:p-5">
                  <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <h2 className="mb-1 text-sm font-semibold text-foreground lg:text-base">Reach us directly</h2>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                      {contactInfo.phone && (
                        <>
                          <dt className="text-muted-foreground">Phone</dt>
                          <dd><a href={telHref} className={`${LINK} tabular-nums`}>{contactInfo.phone}</a></dd>
                        </>
                      )}
                      {contactInfo.email && (
                        <>
                          <dt className="text-muted-foreground">Email</dt>
                          <dd className="min-w-0 [overflow-wrap:anywhere]"><a href={`mailto:${contactInfo.email}`} className={LINK}>{contactInfo.email}</a></dd>
                        </>
                      )}
                      {contactInfo.whatsapp && (
                        <>
                          <dt className="text-muted-foreground">WhatsApp</dt>
                          <dd>
                            <a
                              href={`https://wa.me/${contactInfo.whatsapp}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`${LINK} tabular-nums`}
                            >
                              +{contactInfo.whatsapp}
                            </a>
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : selectedOption === 'email' ? (
            <motion.div key="email" {...viewMotion}>
              <div className="mb-5 flex items-center gap-3 lg:mb-6">
                <div className="grid size-10 shrink-0 place-items-center rounded-card bg-primary/[0.08] text-primary lg:size-12">
                  <Mail aria-hidden="true" className="size-5 lg:size-6" />
                </div>
                <div>
                  <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground lg:text-2xl">Email support</h1>
                  <p className="text-sm text-muted-foreground">Pick a question to start an email.</p>
                </div>
              </div>

              <div className="mb-5 lg:mb-6">
                <h2 className={SECTION_LABEL}>Common questions</h2>
                <ul className="space-y-2">
                  {faqQuestions.map((faq, index) => (
                    <motion.li key={faq.id} {...rowMotion(index)}>
                      <motion.button
                        type="button"
                        onClick={() => handleEmailClick(faq.message, faq.question)}
                        whileTap={tap}
                        className={ROW_BUTTON}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="flex-1 text-sm font-medium text-foreground">{faq.question}</span>
                          <Send aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                        </span>
                      </motion.button>
                    </motion.li>
                  ))}
                </ul>
              </div>

              {contactInfo.responseTime && (
                <div className={TINT_BOX}>
                  <p className="text-sm text-foreground/80">
                    <span className="font-semibold text-foreground">Tip:</span> We usually reply {contactInfo.responseTime.toLowerCase()} on business days.
                  </p>
                </div>
              )}
            </motion.div>
          ) : selectedOption === 'phone' ? (
            <motion.div key="phone" {...viewMotion}>
              <div className="mb-5 flex items-center gap-3 lg:mb-6">
                <div className="grid size-10 shrink-0 place-items-center rounded-card bg-primary/[0.08] text-primary lg:size-12">
                  <Phone aria-hidden="true" className="size-5 lg:size-6" />
                </div>
                <div>
                  <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground lg:text-2xl">Phone support</h1>
                  <p className="text-sm text-muted-foreground">Speak with our team directly.</p>
                </div>
              </div>

              {contactInfo.phone && (
                <div className="mb-6">
                  <button type="button" onClick={handlePhoneCall} className="btn-copper h-14 w-full">
                    <Phone aria-hidden="true" className="size-4" />
                    Call now
                  </button>
                  <p className="mt-2 text-center text-sm tabular-nums text-muted-foreground">{contactInfo.phone}</p>
                </div>
              )}

              <h2 className={SECTION_LABEL}>We can help with</h2>
              <ul className="mb-5 space-y-2 lg:mb-6">
                {phoneOptions.map((option, index) => (
                  <motion.li key={option.id} {...rowMotion(index)} className="flex items-start gap-3 rounded-card bg-foreground/[0.03] p-3.5 lg:p-4">
                    <CheckCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{option.title}</h3>
                      <p className="text-xs text-muted-foreground lg:text-sm">{option.description}</p>
                    </div>
                  </motion.li>
                ))}
              </ul>

              <div className={`${TINT_BOX} flex items-start gap-3`}>
                <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary lg:size-5" />
                <div className="text-sm">
                  <p className="mb-0.5 font-semibold text-foreground">Available hours</p>
                  {contactInfo.hours && <p className="text-foreground/80">{contactInfo.hours}</p>}
                  {contactInfo.responseTime && (
                    <p className="text-foreground/80">Response time: {contactInfo.responseTime.toLowerCase()}</p>
                  )}
                </div>
              </div>
            </motion.div>
          ) : selectedOption === 'message' ? (
            <motion.div key="message" {...viewMotion}>
              <div className="mb-5 flex items-center gap-3 lg:mb-6">
                <div className="grid size-10 shrink-0 place-items-center rounded-card bg-primary/[0.08] text-primary lg:size-12">
                  <MessageCircle aria-hidden="true" className="size-5 lg:size-6" />
                </div>
                <div>
                  <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground lg:text-2xl">WhatsApp chat</h1>
                  <p className="text-sm text-muted-foreground">Pick a message to start the chat.</p>
                </div>
              </div>

              <h2 className={SECTION_LABEL}>Message templates</h2>
              <ul className="mb-5 space-y-2 lg:mb-6">
                {whatsappMessages.map((msg, index) => (
                  <motion.li key={msg.id} {...rowMotion(index)}>
                    <motion.button
                      type="button"
                      onClick={() => handleWhatsAppClick(msg.message)}
                      whileTap={tap}
                      className={ROW_BUTTON}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex-1">
                          <span className="mb-0.5 block text-sm font-semibold text-foreground">{msg.title}</span>
                          <span className="block text-xs text-muted-foreground">{msg.message}</span>
                        </span>
                        <MessageCircle aria-hidden="true" className="size-4 shrink-0 text-muted-foreground lg:size-5" />
                      </span>
                    </motion.button>
                  </motion.li>
                ))}
              </ul>

              <div className={TINT_BOX}>
                <p className="text-sm text-foreground/80">
                  <span className="font-semibold text-foreground">Note:</span> We answer WhatsApp messages during business hours.
                </p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default CustomerSupport;
