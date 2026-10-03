import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Video, Calendar, Phone, User, ArrowRight, MessageCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Notice } from '@/components/ui/notice';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { createVideoCallRequest } from '@/services/videoCallRequestService';
import { getCustomerSupportSettings } from '@/services/siteSettingsService';
import { SmartImage } from "@/components/ui/smart-image";
import { fadeUp } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface VideoCallRequestModalProps {
  open: boolean;
  onClose: () => void;
  productId?: string;
  productTitle?: string;
  productImage?: string;
}

type Tab = 'instant' | 'scheduled' | 'whatsapp';

const TABS = [
  { id: 'instant' as Tab, label: 'Call now', icon: Phone },
  { id: 'scheduled' as Tab, label: 'Schedule', icon: Calendar },
  { id: 'whatsapp' as Tab, label: 'WhatsApp', icon: MessageCircle },
] as const;

/**
 * "Book a video consultation" from a product page. A centred dialog from
 * tablet width up and a bottom sheet on phones; both are Radix, so Escape
 * closes, focus is trapped and returns to the Consult button.
 */
const VideoCallRequestModal = ({
  open,
  onClose,
  productId,
  productTitle,
  productImage,
}: VideoCallRequestModalProps) => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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

  // Start each visit on the first tab with a fresh form, and fill in the
  // shopper's name and phone once their profile has loaded (it is often still
  // loading when this component first renders).
  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setTab('instant');
  }, [open]);

  useEffect(() => {
    if (!open || !userProfile) return;
    setName((current) => current || userProfile.username || userProfile.name || '');
    setPhone((current) => current || userProfile.phone || userProfile.whatsappNumber || '');
  }, [open, userProfile]);

  const handleWhatsApp = () => {
    const digits = adminWhatsapp.replace(/\D/g, '');
    if (!digits) {
      toast.error("WhatsApp isn't set up yet. Please use Call now instead.");
      return;
    }
    const productLine = productTitle ? `Product: *${productTitle}*` : '';
    // The site's own address, so the link is right on every domain (and in dev).
    const productLink = productId ? `\n${window.location.origin}/product/${productId}` : '';
    const customerLine = name.trim() ? `\nRequested by: ${name.trim()}` : '';
    const message = `Hi Ishaputra Botanicals, I'd like a WhatsApp video consultation.${productLine ? '\n' + productLine : ''}${productLink}${customerLine}`;
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please sign in to book a video call');
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
      toast.error("Couldn't send your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  // Opened from state (no Radix Trigger), so remember the button that opened
  // it and give focus back on close. Captured during render, before Radix
  // moves focus into the panel.
  const wasOpen = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  if (open && !wasOpen.current && typeof document !== 'undefined') {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpen.current = open;
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    returnFocusRef.current?.focus({ preventScroll: true });
  };

  const Title = isMobile ? SheetTitle : DialogTitle;
  const Description = isMobile ? SheetDescription : DialogDescription;

  const body = submitted ? (
    /* Success state */
    <motion.div {...fadeUp} className="space-y-4 py-4 text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10">
        <Video aria-hidden="true" className="size-7 text-primary" />
      </div>
      <Title className="px-0 text-center sm:px-0">Request received</Title>
      <Description className="mx-auto max-w-xs">
        We'll confirm your {tab === 'instant' ? 'video call' : 'appointment'} shortly.
      </Description>
      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={() => { handleClose(); navigate('/my-video-calls'); }}
          className="btn-copper w-full"
        >
          My video calls
          <ArrowRight aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="h-11 w-full rounded-control text-sm font-medium text-muted-foreground transition-[background-color,color,transform] duration-press ease-out hover:bg-muted hover:text-foreground active:scale-[0.97]"
        >
          Done
        </button>
      </div>
    </motion.div>
  ) : (
    <>
      {/* Header */}
      <div className="mb-5 pr-8">
        <div className="mb-1 flex items-center gap-2">
          <Video aria-hidden="true" className="size-5 shrink-0 text-primary" />
          <Title className="px-0 sm:px-0">Book a video consultation</Title>
        </div>
        <Description className={cn('truncate text-xs', !productTitle && 'sr-only')}>
          {productTitle ? `For ${productTitle}` : 'Talk to us about a product on a video call.'}
        </Description>
      </div>

      {/* Mode: segmented control */}
      <div role="group" aria-label="How would you like to talk?" className="mb-5 flex rounded-control bg-foreground/[0.05] p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[4px] text-sm font-medium transition-[background-color,color,box-shadow] duration-hover ease-out',
              tab === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'whatsapp' ? (
        /* ── WhatsApp video call panel ── */
        <div className="space-y-4">
          {productImage && (
            <div className="flex items-center gap-3 rounded-card border border-foreground/[0.08] bg-card/70 p-3">
              <SmartImage
                src={productImage}
                alt=""
                className="size-14 shrink-0 rounded-control object-cover" preset="thumb" />
              <p className="line-clamp-2 text-sm font-medium text-foreground">{productTitle}</p>
            </div>
          )}
          <div className="space-y-2 rounded-card border border-foreground/10 bg-card/70 p-4 text-foreground">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <MessageCircle aria-hidden="true" className="size-4 text-primary" />
              WhatsApp video call
            </p>
            <p className="text-sm text-muted-foreground [text-wrap:pretty]">
              Talk to our Ayurveda expert on a WhatsApp video call about this product.
            </p>
            {adminWhatsapp && (
              <p className="text-xs text-muted-foreground">
                Call number: <span className="font-semibold tabular-nums text-foreground">{adminWhatsapp}</span>
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="vc-name-wa" className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              <User aria-hidden="true" className="size-3" /> Your name (optional)
            </Label>
            <Input
              id="vc-name-wa"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
            />
          </div>
          <button
            type="button"
            onClick={handleWhatsApp}
            className="btn-line w-full text-foreground transition-[border-color,color,transform] duration-press ease-out hover:border-primary hover:text-primary active:scale-[0.97]"
          >
            <MessageCircle aria-hidden="true" className="size-4" />
            Open WhatsApp
          </button>
        </div>
      ) : (
        /* ── In-app / Scheduled panel ── */
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <div>
            <Label htmlFor="vc-name" className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              <User aria-hidden="true" className="size-3" /> Your name
            </Label>
            <Input
              id="vc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
              aria-required="true"
            />
          </div>
          <div>
            <Label htmlFor="vc-phone" className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Phone aria-hidden="true" className="size-3" /> Phone number
            </Label>
            <Input
              id="vc-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 XXXXX XXXXX"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              aria-required="true"
            />
          </div>

          {tab === 'scheduled' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="vc-date" className="mb-1.5 block text-xs text-muted-foreground">Date</Label>
                <Input
                  id="vc-date"
                  type="date"
                  value={scheduledDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="vc-time" className="mb-1.5 block text-xs text-muted-foreground">Time</Label>
                <Input
                  id="vc-time"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
            </div>
          )}

          {tab === 'instant' && (
            <Notice tone="neutral" icon={Clock} compact role="note">
              We'll call you back as soon as we can during business hours, 10am to 7pm.
            </Notice>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-copper w-full disabled:cursor-wait disabled:opacity-80"
          >
            {submitting ? (
              <><Spinner /> Sending</>
            ) : tab === 'instant' ? (
              'Call me now'
            ) : (
              'Book this time'
            )}
          </button>
        </form>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
        <SheetContent side="bottom" className="tx-sheet max-h-[92dvh] overflow-y-auto" onCloseAutoFocus={restoreFocus}>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DialogContent className="tx-sheet max-w-md" onCloseAutoFocus={restoreFocus}>
        <div>{body}</div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoCallRequestModal;
