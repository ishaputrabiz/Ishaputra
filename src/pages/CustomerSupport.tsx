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
  HelpCircle,
} from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import { subscribeCustomerSupportSettings, DEFAULT_SUPPORT, CustomerSupportSettings } from '@/services/siteSettingsService';

const CustomerSupport = () => {
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<'email' | 'phone' | 'message' | null>(null);
  const [support, setSupport] = useState<CustomerSupportSettings>(DEFAULT_SUPPORT);

  useEffect(() => subscribeCustomerSupportSettings(setSupport), []);

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
      message: 'Hello, I would like to inquire about your return and exchange policy.',
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
      title: 'General Inquiry',
      message: 'Hello, I have a question about your products and services.',
    },
    {
      id: 2,
      title: 'Order Status',
      message: 'Hello, I would like to check the status of my order.',
    },
    {
      id: 3,
      title: 'Product Information',
      message: 'Hello, I need more information about a specific product.',
    },
    {
      id: 4,
      title: 'Custom Order',
      message: 'Hello, I am interested in placing a custom order.',
    },
    {
      id: 5,
      title: 'Pricing Query',
      message: 'Hello, I would like to inquire about pricing for bulk orders.',
    },
    {
      id: 6,
      title: 'Visit Store',
      message: 'Hello, I would like to visit your store. Could you provide the address and timing?',
    },
  ];

  // Phone inquiry options
  const phoneOptions = [
    {
      id: 1,
      title: 'Sales Inquiry',
      description: 'For product information and purchases',
    },
    {
      id: 2,
      title: 'Order Support',
      description: 'Track your order or delivery status',
    },
    {
      id: 3,
      title: 'Technical Support',
      description: 'Help with website or account issues',
    },
    {
      id: 4,
      title: 'Returns & Exchange',
      description: 'Initiate returns or exchanges',
    },
  ];

  const handleEmailClick = (message: string) => {
    const subject = 'Customer Support Inquiry';
    const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${contactInfo.email}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.open(gmailLink, '_blank');
  };

  const handleWhatsAppClick = (message: string) => {
    const whatsappLink = `https://wa.me/${contactInfo.whatsapp}?text=${encodeURIComponent(message)}`;
    window.open(whatsappLink, '_blank');
  };

  const handlePhoneCall = () => {
    window.location.href = `tel:${contactInfo.phone}`;
  };

  return (
    <div className="min-h-screen tx-paper">
      <Header />
      
      <div className="max-w-2xl mx-auto px-3 py-4 pb-24 lg:px-4 lg:py-6 lg:pb-8">
        {/* Back Button - Mobile */}
        <button
          onClick={() => {
            if (selectedOption) { setSelectedOption(null); return; }
            navigate('/account');
          }}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-card/80 px-3 py-2 text-foreground/80 backdrop-blur transition-colors hover:text-primary lg:mb-6"
        >
          <ArrowLeft className="h-4 w-4 lg:h-5 lg:w-5" />
          <span className="text-xs lg:text-sm font-medium">Back</span>
        </button>

        <AnimatePresence mode="wait">
          {!selectedOption ? (
            <motion.div
              key="options"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Header */}
              <div className="mb-5 panel tx-sheet tx-contour overflow-hidden px-5 py-7 text-center lg:mb-8 lg:px-8">
                <p className="eyebrow-no eyebrow-center mb-4"><span>We're here to help</span></p>
                <div className="tx-slate mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[10px] text-highlight-soft">
                  <HeadphonesIcon className="h-6 w-6" />
                </div>
                <h1 className="mb-1 text-2xl font-semibold text-foreground lg:mb-2 lg:text-4xl" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>Customer support</h1>
                <p className="mx-auto max-w-md text-xs text-muted-foreground lg:text-sm">
                  Choose the fastest way to reach us for orders, custom requests, and after-sales help.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded-full border border-highlight/20 bg-cream px-3 py-1 dark:bg-highlight/5">{contactInfo.hours}</span>
                  <span className="rounded-full border border-highlight/20 bg-cream px-3 py-1 dark:bg-highlight/5">{contactInfo.responseTime}</span>
                </div>
              </div>

              {/* Contact Options */}
              <div className="space-y-2 lg:space-y-3 mb-5 lg:mb-8">
                {/* Email Support */}
                <motion.button
                  onClick={() => setSelectedOption('email')}
                  whileTap={{ scale: 0.98 }}
                  className="w-full rounded-[10px] border border-foreground/[0.08] bg-card/80 p-3 text-left shadow-[var(--shadow-panel)] transition-all active:bg-foreground/[0.04] hover:-translate-y-0.5 hover:border-primary/35 lg:rounded-2xl lg:p-5"
                >
                  <div className="flex items-center gap-3 lg:gap-4">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-6 h-6 lg:w-8 lg:h-8 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="mb-0.5 text-sm font-semibold text-foreground lg:text-lg">Email Support</h3>
                      <p className="text-xs text-muted-foreground lg:text-sm">
                        Send us your questions via email
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/70 lg:h-5 lg:w-5" />
                  </div>
                </motion.button>

                {/* Phone Support */}
                <motion.button
                  onClick={() => setSelectedOption('phone')}
                  whileTap={{ scale: 0.98 }}
                  className="w-full rounded-[10px] border border-foreground/[0.08] bg-card/80 p-3 text-left shadow-[var(--shadow-panel)] transition-all active:bg-foreground/[0.04] hover:-translate-y-0.5 hover:border-primary/35 lg:rounded-2xl lg:p-5"
                >
                  <div className="flex items-center gap-3 lg:gap-4">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-6 h-6 lg:w-8 lg:h-8 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="mb-0.5 text-sm font-semibold text-foreground lg:text-lg">Phone Support</h3>
                      <p className="text-xs text-muted-foreground lg:text-sm">
                        Talk directly with our team
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/70 lg:h-5 lg:w-5" />
                  </div>
                </motion.button>

                {/* WhatsApp Support */}
                {contactInfo.whatsapp && (
                <motion.button
                  onClick={() => setSelectedOption('message')}
                  whileTap={{ scale: 0.98 }}
                  className="w-full rounded-[10px] border border-foreground/[0.08] bg-card/80 p-3 text-left shadow-[var(--shadow-panel)] transition-all active:bg-foreground/[0.04] hover:-translate-y-0.5 hover:border-primary/35 lg:rounded-2xl lg:p-5"
                >
                  <div className="flex items-center gap-3 lg:gap-4">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center flex-shrink-0">
                      <MessageCircle className="w-6 h-6 lg:w-8 lg:h-8 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="mb-0.5 text-sm font-semibold text-foreground lg:text-lg">WhatsApp Chat</h3>
                      <p className="text-xs text-muted-foreground lg:text-sm">
                        Quick messaging support
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/70 lg:h-5 lg:w-5" />
                  </div>
                </motion.button>
                )}
              </div>

              {/* Additional Info */}
              <div className="space-y-2 lg:space-y-3">
                {/* Business Hours */}
                <div className="border border-foreground/[0.08] bg-card/80 p-3 lg:p-5 rounded-[10px] lg:rounded-2xl shadow-[var(--shadow-panel)]">
                  <div className="flex items-start gap-3 lg:gap-4">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-5 h-5 lg:w-7 lg:h-7 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm lg:text-base font-semibold text-foreground mb-1 lg:mb-2">Business Hours</h3>
                      <p className="text-xs lg:text-sm text-muted-foreground mb-0.5 lg:mb-1">{contactInfo.hours}</p>
                      <p className="text-xs lg:text-sm text-muted-foreground">Response time: {contactInfo.responseTime}</p>
                    </div>
                  </div>
                </div>

                {/* Contact Summary */}
                <div className="border border-foreground/[0.08] bg-card/80 p-3 lg:p-5 rounded-[10px] lg:rounded-2xl shadow-[var(--shadow-panel)]">
                  <div className="flex items-start gap-3 lg:gap-4">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 lg:w-7 lg:h-7 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm lg:text-base font-semibold text-foreground mb-1 lg:mb-2">Reach Us Directly</h3>
                      <p className="text-xs lg:text-sm text-muted-foreground">Phone: {contactInfo.phone}</p>
                      <p className="text-xs lg:text-sm text-muted-foreground break-all">Email: {contactInfo.email}</p>
                      {contactInfo.whatsapp && (
                        <p className="text-xs lg:text-sm text-muted-foreground">WhatsApp: +{contactInfo.whatsapp}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : selectedOption === 'email' ? (
            <motion.div
              key="email"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="mb-4 lg:mb-6">
                <div className="flex items-center gap-2.5 lg:gap-3 mb-3 lg:mb-4">
                  <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center">
                    <Mail className="w-6 h-6 lg:w-8 lg:h-8 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-base lg:text-xl font-bold text-foreground">Email Support</h2>
                    <p className="text-xs lg:text-sm text-muted-foreground">Choose a question or write your own</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 lg:space-y-2 mb-4 lg:mb-6">
                <h3 className="font-semibold text-foreground mb-2 lg:mb-3 text-xs lg:text-sm uppercase tracking-wide">Common Questions</h3>
                {faqQuestions.map((faq, index) => (
                  <motion.button
                    key={faq.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleEmailClick(faq.message)}
                    whileTap={{ scale: 0.98 }}
                    className="w-full text-left bg-foreground/[0.03] active:bg-gray-100 p-3 lg:p-4 rounded-lg lg:rounded-xl transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 lg:gap-3">
                      <span className="text-xs lg:text-sm font-medium text-foreground flex-1">
                        {faq.question}
                      </span>
                      <Send className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-muted-foreground/70 flex-shrink-0" />
                    </div>
                  </motion.button>
                ))}
              </div>

              <div className="bg-[linear-gradient(135deg,rgba(59,130,246,0.08)_0%,hsl(var(--highlight)/0.12)_100%)] border border-highlight/12 p-3 lg:p-4 rounded-lg lg:rounded-xl mb-4 lg:mb-6">
                <p className="text-xs lg:text-sm text-foreground/80">
                  <span className="font-semibold">Tip:</span> We typically respond {contactInfo.responseTime.toLowerCase()} during business days.
                </p>
              </div>
            </motion.div>
          ) : selectedOption === 'phone' ? (
            <motion.div
              key="phone"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="mb-4 lg:mb-6">
                <div className="flex items-center gap-2.5 lg:gap-3 mb-3 lg:mb-4">
                  <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center">
                    <Phone className="w-6 h-6 lg:w-8 lg:h-8 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-base lg:text-xl font-bold text-foreground">Phone Support</h2>
                    <p className="text-xs lg:text-sm text-muted-foreground">Speak with our team directly</p>
                  </div>
                </div>
              </div>

              {/* Call Now Button */}
              <motion.button
                onClick={handlePhoneCall}
                whileTap={{ scale: 0.98 }}
                className="w-full border border-highlight/20 bg-[linear-gradient(135deg,rgba(59,130,246,0.08)_0%,hsl(var(--highlight)/0.12)_100%)] active:bg-blue-50 text-primary rounded-[10px] lg:rounded-2xl p-4 lg:p-6 mb-4 lg:mb-6 transition-colors shadow-[0_20px_45px_-35px_rgba(0,0,0,0.45)]"
              >
                <div className="flex items-center justify-center gap-2 lg:gap-3">
                  <Phone className="w-5 h-5 lg:w-6 lg:h-6" />
                  <div className="text-center">
                    <div className="text-base lg:text-xl font-bold">Call Now</div>
                    <div className="text-xs lg:text-sm">{contactInfo.phone}</div>
                  </div>
                </div>
              </motion.button>

              <div className="mb-2 lg:mb-3">
                <h3 className="font-semibold text-foreground mb-2 lg:mb-3 text-xs lg:text-sm uppercase tracking-wide">We Can Help With</h3>
              </div>

              <div className="space-y-1.5 lg:space-y-2 mb-4 lg:mb-6">
                {phoneOptions.map((option, index) => (
                  <motion.div
                    key={option.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-3 lg:p-4 rounded-lg lg:rounded-xl bg-foreground/[0.03]"
                  >
                    <div className="flex items-start gap-2 lg:gap-3">
                      <div className="w-6 h-6 lg:w-8 lg:h-8 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-5 h-5 lg:w-6 lg:h-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground text-xs lg:text-sm mb-0.5 lg:mb-1">{option.title}</h4>
                        <p className="text-[11px] lg:text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="p-3 lg:p-4 bg-[linear-gradient(135deg,rgba(34,197,94,0.08)_0%,hsl(var(--highlight)/0.10)_100%)] border border-highlight/12 rounded-lg lg:rounded-xl">
                <div className="flex items-start gap-2 lg:gap-3">
                  <Clock className="w-4 h-4 lg:w-5 lg:h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs lg:text-sm font-semibold text-foreground mb-0.5 lg:mb-1">Available Hours</p>
                    <p className="text-xs lg:text-sm text-foreground/80">{contactInfo.hours}</p>
                    <p className="text-xs lg:text-sm text-foreground/80">Response time: {contactInfo.responseTime}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : selectedOption === 'message' ? (
            <motion.div
              key="message"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="mb-4 lg:mb-6">
                <div className="flex items-center gap-2.5 lg:gap-3 mb-3 lg:mb-4">
                  <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 lg:w-8 lg:h-8 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-base lg:text-xl font-bold text-foreground">WhatsApp Chat</h2>
                    <p className="text-xs lg:text-sm text-muted-foreground">Quick and convenient messaging</p>
                  </div>
                </div>
              </div>

              <div className="mb-2 lg:mb-3">
                <h3 className="font-semibold text-foreground mb-2 lg:mb-3 text-xs lg:text-sm uppercase tracking-wide">Message Templates</h3>
              </div>

              <div className="space-y-1.5 lg:space-y-2 mb-4 lg:mb-6">
                {whatsappMessages.map((msg, index) => (
                  <motion.button
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleWhatsAppClick(msg.message)}
                    whileTap={{ scale: 0.98 }}
                    className="w-full text-left p-3 lg:p-4 rounded-lg lg:rounded-xl bg-foreground/[0.03] active:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 lg:gap-3">
                      <div className="flex-1">
                        <div className="text-xs lg:text-sm font-semibold text-foreground mb-0.5 lg:mb-1">
                          {msg.title}
                        </div>
                        <div className="text-[11px] lg:text-xs text-muted-foreground">{msg.message}</div>
                      </div>
                      <MessageCircle className="w-4 h-4 lg:w-5 lg:h-5 text-muted-foreground/70 flex-shrink-0" />
                    </div>
                  </motion.button>
                ))}
              </div>

              <div className="p-3 lg:p-4 bg-[linear-gradient(135deg,rgba(168,85,247,0.08)_0%,hsl(var(--highlight)/0.10)_100%)] border border-highlight/12 rounded-lg lg:rounded-xl">
                <p className="text-xs lg:text-sm text-foreground/80">
                  <span className="font-semibold">Note:</span> Our team is available during business hours to assist you promptly on WhatsApp.
                </p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default CustomerSupport;
