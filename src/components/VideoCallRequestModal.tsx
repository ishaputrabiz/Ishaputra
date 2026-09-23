import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Calendar, Phone, User, X, Loader2, ArrowRight, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { createVideoCallRequest } from '@/services/videoCallRequestService';
import { getCustomerSupportSettings } from '@/services/siteSettingsService';
import { SmartImage } from "@/components/ui/smart-image";

interface VideoCallRequestModalProps {
  open: boolean;
  onClose: () => void;
  productId?: string;
  productTitle?: string;
  productImage?: string;
}

type Tab = 'instant' | 'scheduled' | 'whatsapp';

const VideoCallRequestModal = ({
  open,
  onClose,
  productId,
  productTitle,
  productImage,
}: VideoCallRequestModalProps) => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('instant');
  const [name, setName] = useState(userProfile?.username || userProfile?.name || '');
  const [phone, setPhone] = useState(userProfile?.phone || userProfile?.whatsappNumber || '');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [adminWhatsapp, setAdminWhatsapp] = useState('');

  useEffect(() => {
    if (open) {
      getCustomerSupportSettings().then((s) => setAdminWhatsapp(s.whatsapp || ''));
    }
  }, [open]);

  const handleWhatsApp = () => {
    const digits = adminWhatsapp.replace(/\D/g, '');
    if (!digits) {
      toast.error('Admin WhatsApp number not configured');
      return;
    }
    const productLine = productTitle ? `Product: *${productTitle}*` : '';
    // The site's own address, so the link is right on every domain (and in dev).
    const productLink = productId ? `\n${window.location.origin}/product/${productId}` : '';
    const customerLine = name.trim() ? `\nRequested by: ${name.trim()}` : '';
    const message = `Hi Sreerasthu Silvers! I'd like a WhatsApp video call demo.${productLine ? '\n' + productLine : ''}${productLink}${customerLine}`;
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please login to book a video call');
      return;
    }
    if (!name.trim() || !phone.trim()) {
      toast.error('Please enter your name and phone number');
      return;
    }
    if (tab === 'scheduled' && (!scheduledDate || !scheduledTime)) {
      toast.error('Please pick a date and time');
      return;
    }

    setSubmitting(true);
    try {
      let scheduledAt = null;
      if (tab === 'scheduled' && scheduledDate && scheduledTime) {
        scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`) as unknown as import('firebase/firestore').Timestamp;
      }

      await createVideoCallRequest({
        customerUid: user.uid,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: user.email || undefined,
        productId,
        productTitle,
        productImage,
        mode: tab,
        scheduledAt: scheduledAt as any,
      });

      setSubmitted(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to book. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSubmitted(false);
    setTab('instant');
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={handleClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-3xl shadow-2xl p-6 max-w-lg mx-auto"
          >
            {/* Handle */}
            <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-5" />

            {/* Close */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition"
            >
              <X className="w-4 h-4" />
            </button>

            {submitted ? (
              /* Success state */
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center mx-auto">
                  <Video className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-semibold">Request Received!</h3>
                <p className="text-sm text-muted-foreground">
                  Our team will confirm your{' '}
                  {tab === 'instant' ? 'video call' : 'scheduled appointment'} shortly.
                </p>
                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    onClick={() => { handleClose(); navigate('/my-video-calls'); }}
                    className="bg-amber-600 hover:bg-amber-700 text-white w-full gap-2"
                  >
                    <Video className="w-4 h-4" />
                    Track My Video Calls
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" onClick={handleClose} className="w-full text-muted-foreground text-sm">
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Video className="w-5 h-5 text-amber-600" />
                    <h3 className="text-lg font-semibold">Book a Demo Video Call</h3>
                  </div>
                  {productTitle && (
                    <p className="text-xs text-muted-foreground truncate">For: {productTitle}</p>
                  )}
                </div>

                {/* Tabs */}
                <div className="flex rounded-full bg-muted p-1 mb-5">
                  {([
                    { id: 'instant' as Tab, label: 'Call Now', icon: Phone },
                    { id: 'scheduled' as Tab, label: 'Schedule', icon: Calendar },
                    { id: 'whatsapp' as Tab, label: 'WhatsApp', icon: MessageCircle },
                  ] as const).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-full transition-all ${
                        tab === id
                          ? 'bg-background shadow text-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                {tab === 'whatsapp' ? (
                  /* ── WhatsApp video call panel ── */
                  <div className="space-y-4">
                    {productImage && (
                      <div className="flex items-center gap-3 bg-muted/40 rounded-xl p-3">
                        <SmartImage
                          src={productImage}
                          alt={productTitle}
                          className="w-14 h-14 rounded-lg object-cover shrink-0" preset="thumb" />
                        <p className="text-sm font-medium line-clamp-2">{productTitle}</p>
                      </div>
                    )}
                    <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-semibold text-green-800 dark:text-green-300">WhatsApp Video Call</span>
                      </div>
                      <p className="text-xs text-green-700 dark:text-green-400">
                        Our expert will connect with you directly on WhatsApp for a high-quality video demo.
                      </p>
                      {adminWhatsapp && (
                        <p className="text-xs font-medium text-green-800 dark:text-green-300">
                          Call number: <span className="font-bold">{adminWhatsapp}</span>
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                        <User className="w-3 h-3" /> Your Name (optional)
                      </Label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Full name"
                        className="bg-muted/40"
                      />
                    </div>
                    <Button
                      onClick={handleWhatsApp}
                      className="w-full bg-green-600 hover:bg-green-700 text-white rounded-full gap-2"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Connect on WhatsApp
                    </Button>
                  </div>
                ) : (
                  /* ── In-app / Scheduled panel ── */
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                        <User className="w-3 h-3" /> Your Name
                      </Label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Full name"
                        className="bg-muted/40"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                        <Phone className="w-3 h-3" /> Phone Number
                      </Label>
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 XXXXX XXXXX"
                        type="tel"
                        className="bg-muted/40"
                      />
                    </div>

                    {tab === 'scheduled' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">Date</Label>
                          <Input
                            type="date"
                            value={scheduledDate}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={(e) => setScheduledDate(e.target.value)}
                            className="bg-muted/40"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">Time</Label>
                          <Input
                            type="time"
                            value={scheduledTime}
                            onChange={(e) => setScheduledTime(e.target.value)}
                            className="bg-muted/40"
                          />
                        </div>
                      </div>
                    )}

                    {tab === 'instant' && (
                      <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 rounded-lg px-3 py-2">
                        Our jewellery expert will call you as soon as possible during business hours (10am–7pm).
                      </p>
                    )}

                    <Button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-full"
                    >
                      {submitting ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                      ) : tab === 'instant' ? (
                        'Request Immediate Call'
                      ) : (
                        'Book Appointment'
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default VideoCallRequestModal;
