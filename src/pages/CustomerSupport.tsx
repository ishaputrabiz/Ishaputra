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
    whatsapp: (support.whatsapp || support.phone || '').replace(/\D/g, ''),
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
      message: 'Hello, I would like to inquire about your return and exchange policy for silver products.',
    },
    {
      id: 3,
      question: 'Do you offer custom designs?',
      message: 'Hello, I am interested in custom silver jewelry/furniture designs. Can you provide more information about the customization process?',
    },
    {
      id: 4,
      question: 'What are the payment options available?',
      message: 'Hello, I would like to know about the payment methods accepted for purchases.',
    },
    {
      id: 5,
      question: 'How can I verify the authenticity of silver?',
      message: 'Hello, I would like to understand how I can verify the authenticity and purity of your silver products.',
    },
    {
      id: 6,
      question: 'Do you provide international shipping?',
      message: 'Hello, I would like to inquire about international shipping options and delivery times.',
    },
    {
      id: 7,
      question: 'What is the warranty on silver products?',
      message: 'Hello, I would like to know about the warranty and after-sales service for your silver products.',
    },
    {
      id: 8,
      question: 'How do I care for my silver jewelry?',
      message: 'Hello, I would like to get information on how to properly care for and maintain my silver jewelry.',
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
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(212,175,55,0.06)_0%,rgba(255,255,255,1)_20%),linear-gradient(135deg,rgba(131,39,41,0.03)_0%,rgba(255,255,255,1)_55%)] dark:bg-[linear-gradient(180deg,rgba(19,17,15,0.98)_0%,rgba(14,14,15,0.98)_100%)]">
      <Header />
      
      <div className="max-w-2xl mx-auto px-3 py-4 pb-24 lg:px-4 lg:py-6 lg:pb-8">
        {/* Back Button - Mobile */}
        <button
          onClick={() => {
            if (selectedOption) { setSelectedOption(null); return; }
            navigate('/account');
          }}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/15 bg-white/80 dark:bg-zinc-900/80 px-3 py-2 text-gray-700 dark:text-zinc-300 shadow-sm backdrop-blur transition-colors hover:text-gray-900 dark:border-[#d4af37]/20 dark:bg-zinc-900/85 dark:text-zinc-100 dark:hover:text-white lg:mb-6"
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
              <div className="mb-5 rounded-[28px] border border-[#d4af37]/15 bg-white/85 dark:bg-zinc-900/85 px-5 py-6 text-center shadow-[0_30px_80px_-60px_rgba(0,0,0,0.45)] backdrop-blur dark:border-[#d4af37]/20 dark:bg-zinc-900/88 dark:shadow-[0_30px_80px_-60px_rgba(0,0,0,0.88)] lg:mb-8 lg:px-8">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span className="h-px w-8 bg-[#d4af37]/50" />
                  <span className="text-[10px] uppercase tracking-[0.32em] text-[#832729] font-medium">Support Lounge</span>
                  <span className="h-px w-8 bg-[#d4af37]/50" />
                </div>
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[linear-gradient(135deg,rgba(212,175,55,0.18)_0%,rgba(131,39,41,0.12)_100%)] text-[#832729]">
                  <HeadphonesIcon className="h-6 w-6" />
                </div>
                <h1 className="mb-1 text-lg font-bold text-gray-900 dark:text-zinc-100 lg:mb-2 lg:text-3xl">Customer Support</h1>
                <p className="mx-auto max-w-md text-xs text-gray-600 dark:text-zinc-400 dark:text-zinc-300 lg:text-sm">
                  Choose the fastest way to reach us for orders, custom requests, and after-sales help.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-gray-600 dark:text-zinc-400 dark:text-zinc-300">
                  <span className="rounded-full border border-[#d4af37]/20 bg-[#fffaf1] px-3 py-1 dark:bg-amber-950/20">{contactInfo.hours}</span>
                  <span className="rounded-full border border-[#d4af37]/20 bg-[#fffaf1] px-3 py-1 dark:bg-amber-950/20">{contactInfo.responseTime}</span>
                </div>
              </div>

              {/* Contact Options */}
              <div className="space-y-2 lg:space-y-3 mb-5 lg:mb-8">
                {/* Email Support */}
                <motion.button
                  onClick={() => setSelectedOption('email')}
                  whileTap={{ scale: 0.98 }}
                  className="w-full rounded-xl border border-[#d4af37]/12 bg-white/85 dark:bg-zinc-900/85 p-3 text-left shadow-[0_18px_40px_-34px_rgba(0,0,0,0.5)] transition-all active:bg-gray-50 dark:bg-zinc-900/50 hover:-translate-y-0.5 hover:border-[#d4af37]/35 dark:border-[#d4af37]/20 dark:bg-zinc-900/88 dark:active:bg-zinc-800 lg:rounded-2xl lg:p-5"
                >
                  <div className="flex items-center gap-3 lg:gap-4">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-6 h-6 lg:w-8 lg:h-8 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="mb-0.5 text-sm font-semibold text-gray-900 dark:text-zinc-100 lg:text-lg">Email Support</h3>
                      <p className="text-xs text-gray-600 dark:text-zinc-400 dark:text-zinc-300 lg:text-sm">
                        Send us your questions via email
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-zinc-500 lg:h-5 lg:w-5" />
                  </div>
                </motion.button>

                {/* Phone Support */}
                <motion.button
                  onClick={() => setSelectedOption('phone')}
                  whileTap={{ scale: 0.98 }}
                  className="w-full rounded-xl border border-[#d4af37]/12 bg-white/85 dark:bg-zinc-900/85 p-3 text-left shadow-[0_18px_40px_-34px_rgba(0,0,0,0.5)] transition-all active:bg-gray-50 dark:bg-zinc-900/50 hover:-translate-y-0.5 hover:border-[#d4af37]/35 dark:border-[#d4af37]/20 dark:bg-zinc-900/88 dark:active:bg-zinc-800 lg:rounded-2xl lg:p-5"
                >
                  <div className="flex items-center gap-3 lg:gap-4">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-6 h-6 lg:w-8 lg:h-8 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="mb-0.5 text-sm font-semibold text-gray-900 dark:text-zinc-100 lg:text-lg">Phone Support</h3>
                      <p className="text-xs text-gray-600 dark:text-zinc-400 dark:text-zinc-300 lg:text-sm">
                        Talk directly with our team
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-zinc-500 lg:h-5 lg:w-5" />
                  </div>
                </motion.button>

                {/* WhatsApp Support */}
                <motion.button
                  onClick={() => setSelectedOption('message')}
                  whileTap={{ scale: 0.98 }}
                  className="w-full rounded-xl border border-[#d4af37]/12 bg-white/85 dark:bg-zinc-900/85 p-3 text-left shadow-[0_18px_40px_-34px_rgba(0,0,0,0.5)] transition-all active:bg-gray-50 dark:bg-zinc-900/50 hover:-translate-y-0.5 hover:border-[#d4af37]/35 dark:border-[#d4af37]/20 dark:bg-zinc-900/88 dark:active:bg-zinc-800 lg:rounded-2xl lg:p-5"
                >
                  <div className="flex items-center gap-3 lg:gap-4">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center flex-shrink-0">
                      <MessageCircle className="w-6 h-6 lg:w-8 lg:h-8 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="mb-0.5 text-sm font-semibold text-gray-900 dark:text-zinc-100 lg:text-lg">WhatsApp Chat</h3>
                      <p className="text-xs text-gray-600 dark:text-zinc-400 dark:text-zinc-300 lg:text-sm">
                        Quick messaging support
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-zinc-500 lg:h-5 lg:w-5" />
                  </div>
                </motion.button>
              </div>

              {/* Additional Info */}
              <div className="space-y-2 lg:space-y-3">
                {/* Business Hours */}
                <div className="border border-[#d4af37]/12 bg-white/80 dark:bg-zinc-900/80 p-3 lg:p-5 rounded-xl lg:rounded-2xl shadow-[0_18px_40px_-34px_rgba(0,0,0,0.5)]">
                  <div className="flex items-start gap-3 lg:gap-4">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-5 h-5 lg:w-7 lg:h-7 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-sm lg:text-base font-semibold text-gray-900 dark:text-zinc-100 mb-1 lg:mb-2">Business Hours</h3>
                      <p className="text-xs lg:text-sm text-gray-600 dark:text-zinc-400 mb-0.5 lg:mb-1">{contactInfo.hours}</p>
                      <p className="text-xs lg:text-sm text-gray-600 dark:text-zinc-400">Response time: {contactInfo.responseTime}</p>
                    </div>
                  </div>
                </div>

                {/* Contact Summary */}
                <div className="border border-[#d4af37]/12 bg-white/80 dark:bg-zinc-900/80 p-3 lg:p-5 rounded-xl lg:rounded-2xl shadow-[0_18px_40px_-34px_rgba(0,0,0,0.5)]">
                  <div className="flex items-start gap-3 lg:gap-4">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 lg:w-7 lg:h-7 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-sm lg:text-base font-semibold text-gray-900 dark:text-zinc-100 mb-1 lg:mb-2">Reach Us Directly</h3>
                      <p className="text-xs lg:text-sm text-gray-600 dark:text-zinc-400">Phone: {contactInfo.phone}</p>
                      <p className="text-xs lg:text-sm text-gray-600 dark:text-zinc-400 break-all">Email: {contactInfo.email}</p>
                      <p className="text-xs lg:text-sm text-gray-600 dark:text-zinc-400">WhatsApp: +{contactInfo.whatsapp}</p>
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
                    <Mail className="w-6 h-6 lg:w-8 lg:h-8 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-base lg:text-xl font-bold text-gray-900 dark:text-zinc-100">Email Support</h2>
                    <p className="text-xs lg:text-sm text-gray-600 dark:text-zinc-400">Choose a question or write your own</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 lg:space-y-2 mb-4 lg:mb-6">
                <h3 className="font-semibold text-gray-900 dark:text-zinc-100 mb-2 lg:mb-3 text-xs lg:text-sm uppercase tracking-wide">Common Questions</h3>
                {faqQuestions.map((faq, index) => (
                  <motion.button
                    key={faq.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleEmailClick(faq.message)}
                    whileTap={{ scale: 0.98 }}
                    className="w-full text-left bg-gray-50 dark:bg-zinc-900/50 active:bg-gray-100 dark:bg-zinc-800 p-3 lg:p-4 rounded-lg lg:rounded-xl transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 lg:gap-3">
                      <span className="text-xs lg:text-sm font-medium text-gray-900 dark:text-zinc-100 flex-1">
                        {faq.question}
                      </span>
                      <Send className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-gray-400 dark:text-zinc-500 flex-shrink-0" />
                    </div>
                  </motion.button>
                ))}
              </div>

              <div className="bg-[linear-gradient(135deg,rgba(59,130,246,0.08)_0%,rgba(212,175,55,0.12)_100%)] border border-[#d4af37]/12 p-3 lg:p-4 rounded-lg lg:rounded-xl mb-4 lg:mb-6">
                <p className="text-xs lg:text-sm text-gray-700 dark:text-zinc-300">
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
                    <Phone className="w-6 h-6 lg:w-8 lg:h-8 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-base lg:text-xl font-bold text-gray-900 dark:text-zinc-100">Phone Support</h2>
                    <p className="text-xs lg:text-sm text-gray-600 dark:text-zinc-400">Speak with our team directly</p>
                  </div>
                </div>
              </div>

              {/* Call Now Button */}
              <motion.button
                onClick={handlePhoneCall}
                whileTap={{ scale: 0.98 }}
                className="w-full border border-[#d4af37]/20 bg-[linear-gradient(135deg,rgba(59,130,246,0.08)_0%,rgba(212,175,55,0.12)_100%)] active:bg-blue-50 text-blue-600 rounded-xl lg:rounded-2xl p-4 lg:p-6 mb-4 lg:mb-6 transition-colors shadow-[0_20px_45px_-35px_rgba(0,0,0,0.45)]"
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
                <h3 className="font-semibold text-gray-900 dark:text-zinc-100 mb-2 lg:mb-3 text-xs lg:text-sm uppercase tracking-wide">We Can Help With</h3>
              </div>

              <div className="space-y-1.5 lg:space-y-2 mb-4 lg:mb-6">
                {phoneOptions.map((option, index) => (
                  <motion.div
                    key={option.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-3 lg:p-4 rounded-lg lg:rounded-xl bg-gray-50 dark:bg-zinc-900/50"
                  >
                    <div className="flex items-start gap-2 lg:gap-3">
                      <div className="w-6 h-6 lg:w-8 lg:h-8 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-5 h-5 lg:w-6 lg:h-6 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-zinc-100 text-xs lg:text-sm mb-0.5 lg:mb-1">{option.title}</h4>
                        <p className="text-[11px] lg:text-xs text-gray-600 dark:text-zinc-400">{option.description}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="p-3 lg:p-4 bg-[linear-gradient(135deg,rgba(34,197,94,0.08)_0%,rgba(212,175,55,0.10)_100%)] border border-[#d4af37]/12 rounded-lg lg:rounded-xl">
                <div className="flex items-start gap-2 lg:gap-3">
                  <Clock className="w-4 h-4 lg:w-5 lg:h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs lg:text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-0.5 lg:mb-1">Available Hours</p>
                    <p className="text-xs lg:text-sm text-gray-700 dark:text-zinc-300">{contactInfo.hours}</p>
                    <p className="text-xs lg:text-sm text-gray-700 dark:text-zinc-300">Response time: {contactInfo.responseTime}</p>
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
                    <MessageCircle className="w-6 h-6 lg:w-8 lg:h-8 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-base lg:text-xl font-bold text-gray-900 dark:text-zinc-100">WhatsApp Chat</h2>
                    <p className="text-xs lg:text-sm text-gray-600 dark:text-zinc-400">Quick and convenient messaging</p>
                  </div>
                </div>
              </div>

              <div className="mb-2 lg:mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-zinc-100 mb-2 lg:mb-3 text-xs lg:text-sm uppercase tracking-wide">Message Templates</h3>
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
                    className="w-full text-left p-3 lg:p-4 rounded-lg lg:rounded-xl bg-gray-50 dark:bg-zinc-900/50 active:bg-gray-100 dark:bg-zinc-800 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 lg:gap-3">
                      <div className="flex-1">
                        <div className="text-xs lg:text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-0.5 lg:mb-1">
                          {msg.title}
                        </div>
                        <div className="text-[11px] lg:text-xs text-gray-600 dark:text-zinc-400">{msg.message}</div>
                      </div>
                      <MessageCircle className="w-4 h-4 lg:w-5 lg:h-5 text-gray-400 dark:text-zinc-500 flex-shrink-0" />
                    </div>
                  </motion.button>
                ))}
              </div>

              <div className="p-3 lg:p-4 bg-[linear-gradient(135deg,rgba(168,85,247,0.08)_0%,rgba(212,175,55,0.10)_100%)] border border-[#d4af37]/12 rounded-lg lg:rounded-xl">
                <p className="text-xs lg:text-sm text-gray-700 dark:text-zinc-300">
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
