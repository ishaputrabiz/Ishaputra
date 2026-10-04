import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToOrder, Order, requestReturn, cancelReturn } from '@/services/orderService';
import Header from '@/components/Header';
import MobileHeader from '@/components/MobileHeader';
import MobileSearchBar from '@/components/MobileSearchBar';
import CategoryIconNav from '@/components/CategoryIconNav';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import { DetailSkeleton } from '@/components/skeletons';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { STATUS_TONE_CLASSES } from '@/components/ui/status-badge';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { db } from '@/config/firebase';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { hasUserReviewedProduct } from '@/services/reviewService';
import { createOrderMessage, OrderMessage, subscribeToCustomerOrderMessages } from '@/services/orderMessagingService';
import { notifyOrder } from '@/services/pushNotificationService';
import {
  ArrowLeft,
  Truck,
  ExternalLink,
  Clock,
  Check,
  MapPin,
  Home,
  ChevronRight,
  ChevronDown,
  Ban,
  Mail,
  Download,
  RotateCcw as ReturnIcon,
  Share2,
  MessageCircle,
  Star,
  Coins,
  Phone,
  PenLine,
  SearchX,
  Shuffle,
  Undo2,
  PackageOpen,
  PackageX,
  PackageSearch,
  HeartCrack,
  TriangleAlert,
  CircleCheck,
  type LucideIcon,
} from 'lucide-react';
import { SmartImage } from "@/components/ui/smart-image";
import { BRAND } from "@/config/brand";
import { SITE_HOST } from "@/lib/siteUrl";
import { isWithinReturnWindow } from "@/lib/returnWindow";
import { getOrderStatus } from "@/lib/orderStatus";
import { formatDate as formatDay, formatDateTime, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Return reasons. `reason` is the value saved on the order (admin reads it),
 * so it never changes; `label` is only what the customer sees.
 */
const RETURN_REASONS: Array<{ reason: string; label: string; icon: LucideIcon }> = [
  { reason: 'Quality not as expected', label: 'Quality not as expected', icon: SearchX },
  { reason: 'Received wrong item', label: 'Received the wrong item', icon: Shuffle },
  { reason: "Don't want anymore", label: "Don't want it anymore", icon: Undo2 },
  { reason: 'Missing in package', label: 'Item missing from the package', icon: PackageOpen },
  { reason: 'Damaged/Broken item', label: 'Arrived damaged or broken', icon: PackageX },
  { reason: 'Size/Fit issue', label: 'Not right for my skin or hair', icon: HeartCrack },
];

/** Warm the PDF and image libraries when the pointer or focus reaches a button that needs them. */
const warmInvoice = () => { void import('@/services/invoiceService'); };
const warmReceipt = () => { void import('html2canvas'); };

/** Colours for the shared receipt image (drawn off screen, so plain hex). */
const RECEIPT = {
  text: '#1B1A18',
  muted: '#6B645C',
  rule: '#E7E0D4',
  panel: '#F6F2EB',
  accent: '#A4532C',
  discount: '#4E6B3C',
  paper: '#FFFDF9',
};

/**
 * Loyalty points and wallet cashback that paid part of an order, as price rows
 * in rupees. order.total is what was charged after them, so listing them makes
 * the summary add up. Orders saved before pointsValue existed used 1 point = ₹1.
 */
const rewardsPaidRows = (order: Order): Array<[string, number]> => {
  const points = Math.max(0, Number(order.pointsUsed) || 0);
  const pointsValue = typeof order.pointsValue === 'number' ? order.pointsValue : points;
  const cashback = Number(order.cashbackUsed) || 0;
  const rows: Array<[string, number]> = [];
  if (pointsValue > 0) rows.push([`Points (${points.toLocaleString('en-IN')})`, pointsValue]);
  if (cashback > 0) rows.push(['Wallet cashback', cashback]);
  return rows;
};

// Order Status Stepper Component
const OrderStatusStepper = ({ status, isReturnPickedState = false }: { status: string; isReturnPickedState?: boolean }) => {
  // Check if this is a return flow
  const isReturnFlow = ['returnRequested', 'returnScheduled', 'returned'].includes(status) || isReturnPickedState;

  // Normal order steps (canonical workflow)
  const orderSteps = [
    { key: 'pending', label: 'Order\nplaced' },
    { key: 'processing', label: 'Processing' },
    { key: 'packed', label: 'Packed' },
    { key: 'outForDelivery', label: 'Out for\ndelivery' },
    { key: 'delivered', label: 'Delivered' },
  ];

  // Return flow steps (4 steps including the interim 'picked' state)
  const returnSteps = [
    { key: 'returnRequested', label: 'Return\nrequested' },
    { key: 'returnScheduled', label: 'Return\nscheduled' },
    { key: 'picked', label: 'Return\npickup' },
    { key: 'returned', label: 'Returned' },
  ];

  const steps = isReturnFlow ? returnSteps : orderSteps;

  const getStepIndex = (currentStatus: string) => {
    if (isReturnFlow) {
      // In return context, 'picked' is a valid step, do not normalize it away
      const index = steps.findIndex(s => s.key === currentStatus);
      return index >= 0 ? index : 0;
    }
    // Normalise legacy statuses to canonical ones for the normal stepper.
    // A failed delivery got as far as out for delivery.
    const normalised =
      currentStatus === 'shipped' || currentStatus === 'assigned'
        ? 'packed'
        : currentStatus === 'picked' || currentStatus === 'deliveryFailed'
          ? 'outForDelivery'
          : currentStatus;
    const index = steps.findIndex(s => s.key === normalised);
    return index >= 0 ? index : 0;
  };

  const currentIndex = getStepIndex(status);
  const isCancelled = status === 'cancelled';
  const isAttempted = status === 'deliveryFailed';
  const progress = isCancelled ? 0 : currentIndex / (steps.length - 1);
  // The track runs from the centre of the first node to the centre of the last.
  const inset = `${50 / steps.length}%`;

  // Return flow uses the returns tone; everything else copper.
  const doneNode = isReturnFlow
    ? 'border-status-returns-fg bg-status-returns-fg text-status-returns-bg'
    : 'border-primary bg-primary text-primary-foreground';
  const doneLine = isReturnFlow ? 'bg-status-returns-fg' : 'bg-primary';

  return (
    <ol aria-label="Order progress" className="relative flex items-start justify-between">
      {/* Track */}
      <li
        aria-hidden="true"
        className={cn(
          'absolute top-4 -translate-y-1/2',
          isCancelled ? 'border-t-2 border-dashed border-status-danger-line' : 'h-0.5 bg-foreground/10',
        )}
        style={{ left: inset, right: inset }}
      >
        {!isCancelled && (
          <span
            className={cn('absolute inset-0 origin-left transition-transform duration-500 ease-in-out', doneLine)}
            style={{ transform: `scaleX(${progress})` }}
          />
        )}
      </li>

      {steps.map((step, index) => {
        const attempted = isAttempted && index === currentIndex;
        const isCompleted = !isCancelled && !attempted && index <= currentIndex;
        const isCurrent = !isCancelled && index === currentIndex;
        const label = attempted ? 'Attempted' : step.label;
        const state = isCancelled ? '' : attempted ? ', delivery attempted' : isCurrent ? ', current step' : isCompleted ? ', done' : '';

        return (
          <li
            key={step.key}
            aria-current={isCurrent ? 'step' : undefined}
            className="relative z-10 flex flex-col items-center"
            style={{ width: `${100 / steps.length}%` }}
          >
            {/* Step Circle */}
            <div
              aria-hidden="true"
              className={cn(
                'flex size-8 items-center justify-center rounded-full border-2 transition-[background-color,border-color,color] duration-hover ease-out',
                isCancelled
                  ? 'border-dashed border-status-danger-line bg-card'
                  : attempted
                    ? 'border-transparent bg-status-danger-bg text-status-danger-fg ring-2 ring-status-danger-line'
                    : isCompleted
                      ? doneNode
                      : 'border-foreground/15 bg-card',
              )}
            >
              {attempted ? (
                <TriangleAlert className="size-4" />
              ) : isCompleted ? (
                <Check className="size-4 [stroke-width:2.5]" />
              ) : !isCancelled ? (
                <span className="size-2 rounded-full bg-foreground/20" />
              ) : null}
            </div>

            {/* Step Label */}
            <p
              className={cn(
                'mt-2 whitespace-pre-line text-center text-[11px] leading-tight',
                attempted
                  ? 'font-semibold text-status-danger-fg'
                  : isCompleted
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground',
              )}
            >
              {label}
              <span className="sr-only">{state}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
};

const OrderDetailsPage = () => {
  const navigate = useNavigate();
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<OrderMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [sendingChatMessage, setSendingChatMessage] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const conversationSectionRef = useRef<HTMLDivElement>(null);
  const conversationInputRef = useRef<HTMLTextAreaElement>(null);
  // The sheets open from state, not a Radix trigger, so they hand focus back here on close.
  const shareTriggerRef = useRef<HTMLButtonElement>(null);
  const returnTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelReturnBtnRef = useRef<HTMLButtonElement>(null);

  // Return modal states
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [customReturnReason, setCustomReturnReason] = useState('');
  const [returnStep, setReturnStep] = useState<'reason' | 'details'>('reason');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cancel Return state
  const [cancellingReturn, setCancellingReturn] = useState(false);
  const [confirmCancelReturn, setConfirmCancelReturn] = useState(false);
  // The single order listener could not find (or was refused) this order, or failed.
  const [loadState, setLoadState] = useState<'ok' | 'missing' | 'error'>('ok');
  const [reloadKey, setReloadKey] = useState(0);

  const handleCancelReturn = async () => {
    if (!order) return;
    setCancellingReturn(true);
    try {
      await cancelReturn(order.id);
      toast.success('Return request cancelled.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to cancel return');
    } finally {
      setCancellingReturn(false);
    }
  };

  // Delivery rating states
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [hasRated, setHasRated] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);

  // Product review state (links to the proper reviews collection)
  const [hasReviewedProduct, setHasReviewedProduct] = useState(false);
  const [checkingReview, setCheckingReview] = useState(false);

  // Conversation collapsible
  const [conversationOpen, setConversationOpen] = useState(false);

  // Subscribe to user orders and find the specific order
  useEffect(() => {
    if (!user || !orderId) {
      if (window.innerWidth >= 1024) {
        navigate('/account');
      } else {
        navigate('/account/orders');
      }
      return;
    }

    setLoading(true);
    setLoadState('ok');

    // Listen to this one order document only (not every order the customer has).
    // Someone else's order is refused by the rules or fails the owner check:
    // both show the not-found state.
    const unsubscribe = subscribeToOrder(
      orderId,
      (foundOrder) => {
        if (foundOrder && foundOrder.userId === user.uid) {
          setOrder(foundOrder);
          setLoadState('ok');
        } else {
          setOrder(null);
          setLoadState('missing');
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching order:', error);
        setOrder(null);
        setLoadState((error as { code?: string })?.code === 'permission-denied' ? 'missing' : 'error');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, orderId, navigate, reloadKey]);

  // Messages are read only once the order is known to be this customer's,
  // so a wrong link does not ask for a conversation the rules will refuse.
  const hasOrder = !!order;
  useEffect(() => {
    if (!user || !orderId || !hasOrder) return;

    const unsubscribe = subscribeToCustomerOrderMessages(
      orderId,
      (messages) => setConversationMessages(messages),
      (error) => {
        console.error('Error fetching order conversation:', error);
      }
    );

    return () => unsubscribe();
  }, [user, orderId, hasOrder]);

  // Check if user has already rated this delivery
  useEffect(() => {
    if (!order || order.status !== 'delivered' || !user || !order.deliveryBoyId) return;
    getDocs(query(collection(db, 'deliveryRatings'), where('orderId', '==', order.id), where('userId', '==', user.uid)))
      .then(snap => { if (!snap.empty) setHasRated(true); })
      .catch(() => {});
  }, [order, user]);

  // Check if user has already submitted a review for this product
  useEffect(() => {
    if (!order || order.status !== 'delivered' || !user) return;
    const productId = order.items[0]?.productId;
    if (!productId) return;
    setCheckingReview(true);
    hasUserReviewedProduct(user.uid, productId)
      .then(reviewed => setHasReviewedProduct(reviewed))
      .catch(() => {})
      .finally(() => setCheckingReview(false));
  }, [order, user]);

  const submitDeliveryRating = async () => {
    if (!order?.deliveryBoyId || !user || deliveryRating === 0) {
      toast.error('Please select a star rating');
      return;
    }
    setSubmittingRating(true);
    try {
      await addDoc(collection(db, 'deliveryRatings'), {
        deliveryBoyId: order.deliveryBoyId,
        orderId: order.id,
        userId: user.uid,
        rating: deliveryRating,
        comment: ratingComment.trim(),
        createdAt: serverTimestamp(),
      });
      setHasRated(true);
      toast.success('Thanks for rating your delivery.');
    } catch {
      toast.error('Failed to submit rating. Please try again.');
    } finally {
      setSubmittingRating(false);
    }
  };

  // Dates: '3 Oct 2026, 8:01 pm'
  const formatDate = (date: unknown) => formatDateTime(date) || 'Not available';

  // Status wording comes from the shared map (src/lib/orderStatus.ts).
  const getStatusLabel = (status: string) => getOrderStatus(status, order ?? undefined).label;

  // One line about the points this order earned. The server credits them on
  // delivery, freezes them while a return is open and voids them if the order
  // ends (cancelled / returned / refunded).
  const getPointsEarnedNote = (o: Order): string | null => {
    const n = Math.floor(Number(o.pointsEarned) || 0);
    if (n <= 0 || !o.pointsEarnedState) return null;
    const pts = `${n.toLocaleString('en-IN')} ${n === 1 ? 'point' : 'points'}`;
    if (o.pointsEarnedState === 'held') return `${pts} on hold while your return is open`;
    if (o.pointsEarnedState === 'void') {
      const why = ['cancelled', 'returned', 'refunded'].includes(o.status) ? ` because the order was ${o.status}` : '';
      return `${pts} ${n === 1 ? 'was' : 'were'} not credited${why}`;
    }
    const unlockAt = typeof o.pointsUnlockAt?.toDate === 'function' ? o.pointsUnlockAt.toDate() : null;
    if (unlockAt && unlockAt.getTime() > Date.now()) return `You earned ${pts} · usable from ${formatDay(unlockAt)}`;
    return `${pts} added to your wallet`;
  };

  // Check if order can be returned (within 7 days of delivery)
  const canReturnOrder = (order: Order) => {
    if (order.status !== 'delivered') return false;
    if ((order as any).returnCancelled) return false;
    // The security rules refuse a return without a delivery time, so the
    // button never offers one they would reject.
    return isWithinReturnWindow(order.deliveredAt);
  };

  // Handle return request
  const handleRequestReturn = async () => {
    if (!order || !user || !returnReason) {
      toast.error('Please select a return reason');
      return;
    }

    if (returnReason === 'Other reason' && !customReturnReason.trim()) {
      toast.error('Please provide your reason for return');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalReason = returnReason === 'Other reason' ? customReturnReason : returnReason;
      await requestReturn(order.id, user.uid, finalReason);
      toast.success('Return request submitted successfully. Our team will review it shortly.');
      setShowReturnModal(false);
      setReturnReason('');
      setCustomReturnReason('');
    } catch (error: any) {
      console.error('Error requesting return:', error);
      toast.error(error.message || 'Failed to request return');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format payment method
  const formatPaymentMethod = (method: string) => {
    if (method === 'cod') return 'Cash On Delivery';
    if (method === 'online') return 'Online Payment';
    if (method === 'card') return 'Card Payment';
    return method.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const focusOrderChat = () => {
    setConversationOpen(true);
    conversationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => conversationInputRef.current?.focus(), 320);
  };

  const sendOrderChatMessage = async () => {
    if (!order || !user || !chatDraft.trim()) return;

    setSendingChatMessage(true);
    try {
      await createOrderMessage(order.id, {
        authorType: 'customer',
        authorId: user.uid,
        authorName: order.shippingAddress.fullName || user.displayName || 'Customer',
        channel: 'chat',
        visibility: 'customer',
        message: chatDraft.trim(),
      });

      // Notify the admin team (and delivery partner if assigned) so the
      // message doesn't sit unread in Firestore. Fire-and-forget.
      const preview = chatDraft.trim().slice(0, 140);
      const customerLabel = order.shippingAddress.fullName || user.displayName || 'Customer';
      void notifyOrder({
        orderId: order.id,
        audience: 'admins',
        title: `New message from ${customerLabel}`,
        body: preview,
        url: `/admin/orders/${order.id}`,
        data: { type: 'order-chat' },
      });
      const deliveryAssignee = (order as any).delivery_partner_id || (order as any).delivery_boy_id;
      if (deliveryAssignee) {
        void notifyOrder({
          orderId: order.id,
          audience: 'delivery',
          title: `Message from ${customerLabel}`,
          body: preview,
          url: `/delivery/orders/${order.id}`,
          data: { type: 'order-chat' },
        });
      }

      setChatDraft('');
      toast.success('Message sent. Our team will reply in this order conversation.');
    } catch (error) {
      console.error('Error sending order chat message:', error);
      toast.error('Failed to send your message. Please try again.');
    } finally {
      setSendingChatMessage(false);
    }
  };

  // Generate receipt image
  const generateReceiptImage = async (order: Order): Promise<Blob | null> => {
    if (!receiptRef.current) {
      console.error('Receipt ref is null');
      return null;
    }
    
    try {
      const parentContainer = receiptRef.current.parentElement;
      if (parentContainer) {
        parentContainer.style.opacity = '1';
        parentContainer.style.zIndex = '99999';
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Loaded on demand: html2canvas is large and only needed here.
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: RECEIPT.paper,
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        width: 380,
        height: receiptRef.current.scrollHeight,
      });
      
      if (parentContainer) {
        parentContainer.style.opacity = '0';
        parentContainer.style.zIndex = '-9999';
      }
      
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/png', 1.0);
      });
    } catch (error) {
      console.error('Error generating receipt image:', error);
      const parentContainer = receiptRef.current?.parentElement;
      if (parentContainer) {
        parentContainer.style.opacity = '0';
        parentContainer.style.zIndex = '-9999';
      }
      return null;
    }
  };

  // Share receipt as image
  const shareReceiptImage = async (platform: 'whatsapp' | 'email' | 'download' | 'native') => {
    if (!order) return;
    
    setIsGeneratingImage(true);
    
    try {
      const imageBlob = await generateReceiptImage(order);
      
      if (!imageBlob) {
        toast.error('Unable to create the receipt image. Try again.');
        setIsGeneratingImage(false);
        return;
      }
      
      const file = new File([imageBlob], `order-receipt-${order.orderId}.png`, { type: 'image/png' });
      
      const downloadImage = () => {
        const url = URL.createObjectURL(imageBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `order-receipt-${order.orderId}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      };
      
      const canShareFiles = navigator.canShare && navigator.canShare({ files: [file] });
      
      if (platform === 'native' && canShareFiles) {
        await navigator.share({
          title: `Order receipt ORD-${order.orderId}`,
          files: [file],
        });
      } else if (platform === 'download') {
        downloadImage();
        toast.success('Receipt saved to your downloads.');
      } else if (canShareFiles) {
        await navigator.share({
          title: `Order receipt ORD-${order.orderId}`,
          files: [file],
        });
      } else {
        downloadImage();
        
        setTimeout(() => {
          if (platform === 'whatsapp') {
            window.open('https://web.whatsapp.com/', '_blank', 'noopener,noreferrer');
            toast.success('Receipt downloaded. Open WhatsApp and attach it from your Downloads folder.');
          } else if (platform === 'email') {
            window.open(`mailto:?subject=Order receipt ORD-${order.orderId}`, '_blank', 'noopener,noreferrer');
            toast.success('Receipt downloaded. Attach it to the email from your Downloads folder.');
          } else {
            toast.success('Receipt downloaded. You can share it anywhere.');
          }
        }, 500);
      }
      
      setShowShareMenu(false);
    } catch (error) {
      console.error('Error sharing receipt:', error);
      if ((error as Error).name !== 'AbortError') {
        toast.error('Unable to share the receipt. Use Save to download it instead.');
      }
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Download Invoice as PDF, delegated to invoiceService for a clean,
  // consistent layout that consumes the saved order pricing snapshot.
  // jspdf is loaded only when the customer asks for the invoice.
  const downloadInvoice = async () => {
    if (!order) return;
    setIsDownloadingInvoice(true);
    try {
      const { generateInvoicePDF } = await import('@/services/invoiceService');
      await generateInvoicePDF(order);
    } catch (error) {
      console.error('Error generating invoice PDF:', error);
      toast.error('Unable to create the invoice. Try again.');
    } finally {
      setIsDownloadingInvoice(false);
    }
  };

  // Page chrome (headers, footer, bottom nav) around any state of the page.
  const renderShell = (content: React.ReactNode) => (
    <div className="min-h-dvh tx-paper">
      {/* Desktop Header + Nav */}
      <div className="hidden lg:block">
        <Header />
        <CategoryIconNav />
      </div>
      {/* Mobile Header */}
      <div className="lg:hidden">
        <MobileHeader />
        <MobileSearchBar />
      </div>
      <main id="main" tabIndex={-1} className="outline-none">
        {content}
      </main>
      <Footer />
      {/* Mobile bottom navigation: keeps the side menu reachable on phones */}
      <div className="lg:hidden">
        <MobileBottomNav />
      </div>
    </div>
  );

  const goBack = () => {
    if (window.innerWidth >= 1024) { navigate('/account'); return; }
    navigate('/account/orders');
  };

  if (loading) {
    return renderShell(
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-4">
        <DetailSkeleton label="Loading your order" />
      </div>
    );
  }

  if (!order) {
    const failed = loadState === 'error';
    return renderShell(
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-4">
        <div className="panel tx-sheet">
          <EmptyState
            as="h1"
            icon={PackageSearch}
            title={failed ? 'Unable to load this order' : "We can't find this order"}
            description={failed ? 'Check your connection and try again.' : 'It may belong to another account.'}
            action={
              failed
                ? { label: 'Try again', onClick: () => setReloadKey((k) => k + 1) }
                : { label: 'Back to my orders', to: '/account/orders' }
            }
            secondaryAction={failed ? { label: 'Back to my orders', to: '/account/orders' } : undefined}
          />
        </div>
      </div>
    );
  }

  // Price details: points and cashback are listed so the lines add up to
  // order.total (paid after them). GST inside GST-inclusive prices is already
  // in the selling price, so it is not counted again as a fee.
  const rewardsRows = rewardsPaidRows(order);
  const totalFees = (order.deliveryCharge || 0) + (order.gstInclusive ? 0 : order.taxAmount || 0);
  const pointsEarnedNote = getPointsEarnedNote(order);

  const isReturnPickup = order.status === 'picked' && !!(order as any).returnScheduledAt;
  const statusDisplay = isReturnPickup
    ? { label: 'Return pickup', tone: 'returns' as const, icon: Truck }
    : getOrderStatus(order.status, order);
  const StatusIcon = statusDisplay.icon;

  const reasonInvalid = !returnReason || (returnReason === 'Other reason' && !customReturnReason.trim());

  const closeReturnSheet = () => {
    setShowReturnModal(false);
    setReturnReason('');
    setCustomReturnReason('');
    setReturnStep('reason');
  };

  const sectionHeading = 'font-heading text-[15px] font-semibold tracking-tight text-foreground';
  const eyebrow = 'text-[11px] font-bold uppercase tracking-[0.18em]';
  const rowButton =
    'focus-inset flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm font-medium text-foreground transition-[background-color] duration-hover ease-out hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60';

  const productSummary = (
    <div>
      <div className="flex gap-3">
        <div className="tile-img size-16 shrink-0 overflow-hidden">
          <SmartImage src={order.items[0]?.image} alt="" className="h-full w-full object-cover" preset="thumb" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold text-foreground">{order.items[0]?.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">Quantity: {order.items[0]?.quantity}</p>
          <p className="mt-1 text-base font-semibold text-foreground tabular-nums">{formatINR(order.items[0]?.price)}</p>
        </div>
      </div>
      {order.items.length > 1 && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          +{order.items.length - 1} more {order.items.length - 1 === 1 ? 'item' : 'items'} will be included in this return
        </p>
      )}
    </div>
  );

  // Partner box inside the OTP notices.
  const partnerBox = (label: string) =>
    order.delivery_partner_name || order.delivery_boy_name ? (
      <div className="mt-3 flex items-center justify-between gap-3 rounded-card bg-foreground/[0.04] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-semibold text-foreground">
            {order.delivery_partner_name || order.delivery_boy_name}
          </p>
        </div>
        {order.delivery_partner_phone && (
          <a href={`tel:${order.delivery_partner_phone}`} className="btn-line h-10 shrink-0 px-4 text-foreground">
            <Phone aria-hidden="true" className="size-4" /> Call
          </a>
        )}
      </div>
    ) : null;

  return renderShell(
    <>
      {/* Page Header */}
      <div className="mx-auto max-w-4xl px-4 pt-4">
        <div className="panel tx-sheet flex items-center gap-2 px-3 py-3 sm:px-4">
          <IconButton label="Back" onClick={goBack}>
            <ArrowLeft />
          </IconButton>
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground lg:text-2xl">Order details</h1>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">ORD-{order.orderId}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl space-y-3 px-4 pb-24 pt-4">
        {/* Tracking ID Banner (only when the carrier has given one) */}
        {order.trackingId && (
          <Notice tone="info" icon={Truck} role="note">
            Tracking ID <span className="font-semibold text-primary tabular-nums">{order.trackingId}</span>
          </Notice>
        )}

        {/* Product Card */}
        <div className="panel tx-sheet p-4">
          <div className="flex gap-4">
            <div className="tile-img size-16 shrink-0 overflow-hidden">
              <SmartImage
                src={order.items[0]?.image}
                alt=""
                className="h-full w-full object-cover" preset="thumb" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-foreground">
                {order.items.length > 1
                  ? `${order.items[0]?.name} +${order.items.length - 1} more`
                  : order.items[0]?.name
                }
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">Order total</p>
              <p className="text-base font-semibold text-foreground tabular-nums">{formatINR(order.total)}</p>
            </div>
          </div>
        </div>

        {/* Order Status Timeline (hidden for returned / refunded orders) */}
        {order.status !== 'returned' && order.status !== 'refunded' && (
          <div className="panel tx-sheet px-3 py-5 sm:px-4">
            <OrderStatusStepper status={order.status} isReturnPickedState={isReturnPickup} />
          </div>
        )}

        {/* Refund receipt (visible to customer once admin uploads it) */}
        {order.status === 'refunded' && order.refundReceiptUrl && (
          <Notice
            tone="success"
            role="note"
            title="Refund processed"
            action={
              <a
                href={order.refundReceiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-line h-10 px-4 text-foreground"
              >
                View receipt
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            }
          >
            <span className="text-muted-foreground">Your refund receipt is ready.</span>
          </Notice>
        )}

        {/* Current Status Card */}
        <div className="panel tx-sheet p-4">
          <div className="flex gap-3">
            <div
              aria-hidden="true"
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full border',
                STATUS_TONE_CLASSES[statusDisplay.tone],
              )}
            >
              <StatusIcon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className={sectionHeading}>{statusDisplay.label}</h2>
              {order.carrier && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin aria-hidden="true" className="size-3.5" />
                  {order.carrier}
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                {order.status === 'pending' && 'Your order has been placed.'}
                {order.status === 'processing' && 'We are preparing your package.'}
                {(order.status === 'packed' || order.status === 'assigned') && 'Packed and ready to dispatch.'}
                {order.status === 'shipped' && 'Shipped and on its way to you.'}
                {order.status === 'outForDelivery' && 'On its way to you.'}
                {order.status === 'picked' && !isReturnPickup && 'On its way to you.'}
                {isReturnPickup && 'The pickup partner has collected the item. Return in progress.'}
                {order.status === 'delivered' && 'Your package has been delivered.'}
                {order.status === 'cancelled' && 'This order has been cancelled.'}
                {order.status === 'returnRequested' && 'Return request submitted. Waiting for approval.'}
                {order.status === 'returnScheduled' && "Return approved. We'll schedule a pickup."}
                {order.status === 'returned' && 'The item has been picked up and returned.'}
                {order.status === 'refunded' && 'Your refund has been processed.'}
              </p>
              <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                <Clock aria-hidden="true" className="size-3.5" />
                {formatDate((order.status === 'delivered' && order.deliveredAt) || order.updatedAt || order.createdAt)}
              </p>
            </div>
          </div>
        </div>

        {/* OTP Delivery Verification - Shown when out for delivery */}
        {order.status === 'outForDelivery' && order.delivery_otp && (
          <Notice tone="info" role="note">
            <p className={cn(eyebrow, 'text-status-info-fg')}>Delivery OTP</p>
            <p className="mt-1 text-sm text-muted-foreground">Share this OTP with your delivery partner at the door.</p>
            <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.4em] text-foreground tabular-nums">{order.delivery_otp}</p>
            {partnerBox('Delivery partner')}
          </Notice>
        )}

        {/* Return Pickup OTP: shown to customer when return is scheduled */}
        {order.status === 'returnScheduled' && (order as any).return_otp && (
          <Notice tone="returns" role="note">
            <p className={cn(eyebrow, 'text-status-returns-fg')}>Return pickup OTP</p>
            <p className="mt-1 text-sm text-muted-foreground">Show this OTP to the pickup partner when they come to collect your item.</p>
            <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.4em] text-foreground tabular-nums">{(order as any).return_otp}</p>
            {partnerBox('Pickup partner')}
          </Notice>
        )}

        {/* Delivery Window: shown when out for delivery and window is set */}
        {(order.status === 'outForDelivery' || order.status === 'shipped' || order.status === 'assigned' || order.status === 'picked') &&
          (order as any).delivery_window_date && (
          <Notice tone="info" icon={Clock} role="note">
            <p className={cn(eyebrow, 'text-status-info-fg')}>Expected delivery window</p>
            <p className="mt-1.5 text-base font-semibold text-foreground tabular-nums">
              {(() => {
                const d = new Date((order as any).delivery_window_date + 'T00:00:00');
                const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                const fmt = (t: string) => { const [h, m] = t.split(':').map(Number); const p = h >= 12 ? 'pm' : 'am'; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${p}`; };
                return `${dateStr}, between ${fmt((order as any).delivery_window_from)} and ${fmt((order as any).delivery_window_to)}`;
              })()}
            </p>
            {(order as any).delivery_window_note && (
              <p className="mt-1 text-sm text-muted-foreground">{(order as any).delivery_window_note}</p>
            )}
          </Notice>
        )}

        {/* Delivery Failed notice */}
        {order.status === 'deliveryFailed' && (
          <Notice tone="danger" role="status">
            <p className="font-semibold text-foreground">We couldn't reach you for delivery.</p>
            <p className="mt-1 text-sm text-muted-foreground">Your item is coming back to our store. Our team will contact you to reschedule the delivery.</p>
          </Notice>
        )}

        {/* What happens next, before the order ships (once it is on its way,
            the status card and the delivery window already say so) */}
        {order.status === 'pending' && (
          <Notice tone="info" compact role="note" icon={Clock}>
            We'll confirm your order shortly and let you know when it ships.
          </Notice>
        )}
        {(order.status === 'processing' || order.status === 'packed') && (
          <Notice tone="info" compact role="note" icon={Clock}>
            We'll let you know when it ships.
          </Notice>
        )}

        {/* Action Buttons */}
        <div className="panel tx-sheet flex flex-wrap gap-3 p-4">
          {/* Cancel Button - Only for pending/processing orders */}
          {(order.status === 'pending' || order.status === 'processing') && (
            <Button
              variant="destructive"
              onClick={() => navigate(`/account/orders/${orderId}/cancel`)}
              className="h-11 min-w-[9rem] flex-1 px-4 text-sm font-medium normal-case tracking-normal"
            >
              <Ban aria-hidden="true" />
              Cancel order
            </Button>
          )}

          {/* Cancel Return: only for returnRequested orders, one-time, asks first */}
          {order.status === 'returnRequested' && !(order as any).returnCancelled && (
            <Button
              ref={cancelReturnBtnRef}
              variant="destructive"
              onClick={() => setConfirmCancelReturn(true)}
              disabled={cancellingReturn}
              className="h-11 min-w-[9rem] flex-1 px-4 text-sm font-medium normal-case tracking-normal"
            >
              {cancellingReturn ? <Spinner /> : <Ban aria-hidden="true" />}
              Cancel return
            </Button>
          )}

          {/* Return Button - Only for delivered orders within 7 days */}
          {canReturnOrder(order) && (
            <Button
              ref={returnTriggerRef}
              variant="outline"
              onClick={() => setShowReturnModal(true)}
              className="h-11 min-w-[9rem] flex-1 px-4 text-sm font-medium normal-case tracking-normal"
            >
              <ReturnIcon aria-hidden="true" />
              Return items
            </Button>
          )}

          {/* Chat Button - Always show */}
          <Button
            variant="outline"
            onClick={focusOrderChat}
            className="h-11 min-w-[9rem] flex-1 px-4 text-sm font-medium normal-case tracking-normal text-primary"
          >
            <MessageCircle aria-hidden="true" />
            Open order chat
          </Button>
        </div>

        <div ref={conversationSectionRef} className="panel tx-sheet scroll-mt-[var(--sticky-top)] p-4">
          <h2 className={sectionHeading}>
            <button
              type="button"
              onClick={() => setConversationOpen(!conversationOpen)}
              aria-expanded={conversationOpen}
              aria-controls="order-conversation"
              className="flex min-h-[44px] w-full items-start justify-between gap-3 text-left"
            >
              <span>
                <span className="inline-flex items-center">
                  Order conversation
                  {conversationMessages.length > 0 && (
                    <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-sans text-[11px] font-bold text-primary-foreground tabular-nums">
                      {conversationMessages.length}
                    </span>
                  )}
                </span>
                {!conversationOpen && (
                  <span className="mt-0.5 block font-sans text-xs font-normal text-muted-foreground">
                    {conversationMessages.length === 0 ? 'Start a conversation about this order' : `${conversationMessages.length} message${conversationMessages.length > 1 ? 's' : ''}`}
                  </span>
                )}
              </span>
              <ChevronDown aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform duration-dropdown ease-out', conversationOpen && 'rotate-180')} />
            </button>
          </h2>

          {conversationOpen && (
            <div id="order-conversation">
              <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                <p className="max-w-prose flex-1 text-sm text-muted-foreground">Ask about delivery timing, a product, or anything else about this order. Replies from our team stay with this order.</p>
                <Button variant="outline" size="sm" onClick={() => navigate('/customer-support')} className="shrink-0">
                  More support
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {conversationMessages.length === 0 ? (
                  <div className="rounded-card border border-dashed border-foreground/[0.14] bg-foreground/[0.03] px-4 py-6 text-center text-sm text-muted-foreground">
                    No messages yet. Write below and our team will reply here.
                  </div>
                ) : (
                  conversationMessages.map((message) => {
                    const isCustomerMessage = message.authorType === 'customer';

                    return (
                      <div key={message.id} className={`flex ${isCustomerMessage ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={cn(
                            'max-w-[88%] rounded-card px-4 py-3',
                            isCustomerMessage
                              ? 'bg-primary text-primary-foreground'
                              : 'border border-foreground/[0.08] bg-muted text-foreground',
                          )}
                        >
                          <div className={cn('flex flex-wrap items-center gap-2 text-[11px]', isCustomerMessage ? 'text-primary-foreground/85' : 'text-muted-foreground')}>
                            <span className="font-semibold">{message.authorName || (isCustomerMessage ? 'You' : 'Support team')}</span>
                            <span className="tabular-nums">{formatDate(message.createdAt)}</span>
                            {message.channel !== 'chat' && (
                              <span className={cn('rounded-chip px-1.5 py-0.5', isCustomerMessage ? 'bg-primary-foreground/15' : 'bg-card text-primary')}>
                                {message.channel}
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">
                            {message.message}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-4 rounded-card border border-foreground/[0.08] bg-foreground/[0.03] p-3">
                <label htmlFor="order-chat-message" className="sr-only">Your message about this order</label>
                <Textarea
                  id="order-chat-message"
                  ref={conversationInputRef}
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  className="min-h-[118px] resize-none bg-card"
                  placeholder="Ask about delivery timing, a product, or anything else about this order."
                />
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">This chat stays with order <span className="tabular-nums">ORD-{order.orderId}</span> so our team sees the full context.</p>
                  <Button
                    onClick={sendOrderChatMessage}
                    disabled={sendingChatMessage || !chatDraft.trim()}
                    className="shrink-0"
                  >
                    {sendingChatMessage ? <Spinner /> : <MessageCircle aria-hidden="true" />}
                    {sendingChatMessage ? 'Sending' : 'Send message'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Track Package Button */}
        {order.trackingUrl && (
          <div className="panel tx-sheet p-4">
            <a
              href={order.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-copper h-12 w-full"
            >
              <Truck aria-hidden="true" className="size-4" />
              Track package
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          </div>
        )}

        {/* Delivery Details Section */}
        <section aria-labelledby="delivery-details-heading" className="panel tx-sheet overflow-hidden">
          <h2 id="delivery-details-heading" className={cn(sectionHeading, 'border-b border-foreground/[0.08] px-4 py-3')}>Delivery details</h2>

          {/* Delivery Address */}
          <div className="flex items-center gap-3 border-b border-foreground/[0.08] px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06]">
              <Home aria-hidden="true" className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Delivery address</p>
              <p className="mt-0.5 text-sm text-foreground">
                {order.shippingAddress.address}, {order.shippingAddress.city}
              </p>
            </div>
          </div>

          {/* Customer Info */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary">
              <span className="text-sm font-semibold text-primary-foreground">
                {order.shippingAddress.fullName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{order.shippingAddress.fullName}</p>
              {order.shippingAddress.mobile && (
                <p className="text-xs text-muted-foreground tabular-nums">{order.shippingAddress.mobile}</p>
              )}
            </div>
          </div>
        </section>

        {/* Rate Delivery Boy - Only for delivered orders with a delivery boy assigned */}
        {order.status === 'delivered' && order.deliveryBoyId && (
          <section aria-labelledby="rate-delivery-heading" className="panel tx-sheet overflow-hidden">
            <h2 id="rate-delivery-heading" className={cn(sectionHeading, 'border-b border-foreground/[0.08] px-4 py-3')}>Rate your delivery</h2>
            <div className="p-4">
              {hasRated ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="flex items-center gap-1" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star key={n} className={cn('size-6', n <= deliveryRating ? 'fill-highlight-soft text-highlight-soft' : 'fill-transparent text-foreground/25')} />
                    ))}
                  </div>
                  <p className="text-sm font-medium text-foreground">Rating saved.</p>
                  <p className="text-xs text-muted-foreground">Thanks for your feedback.</p>
                </div>
              ) : (
                <>
                  <p id="rate-delivery-question" className="mb-2 text-sm text-muted-foreground">How was your delivery experience?</p>
                  <div role="radiogroup" aria-labelledby="rate-delivery-question" className="-ml-1.5 mb-3 flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={deliveryRating === n}
                        aria-label={`${n} out of 5`}
                        onClick={() => setDeliveryRating(n)}
                        className="grid size-11 place-items-center rounded-full transition-transform duration-press ease-out active:scale-[0.97]"
                      >
                        <Star aria-hidden="true" className={cn('size-7 transition-[fill,color] duration-hover ease-out', n <= deliveryRating ? 'fill-highlight-soft text-highlight-soft' : 'fill-transparent text-foreground/30')} />
                      </button>
                    ))}
                  </div>
                  <label htmlFor="rate-delivery-comment" className="sr-only">Comment (optional)</label>
                  <Textarea
                    id="rate-delivery-comment"
                    value={ratingComment}
                    onChange={e => setRatingComment(e.target.value)}
                    placeholder="Leave a comment (optional)"
                    rows={2}
                    className="mb-3 min-h-0 resize-none"
                  />
                  <Button
                    onClick={submitDeliveryRating}
                    disabled={submittingRating || deliveryRating === 0}
                    className="w-full"
                  >
                    {submittingRating && <Spinner />}
                    Submit rating
                  </Button>
                </>
              )}
            </div>
          </section>
        )}

        {/* Write a Review - for all delivered orders */}
        {order.status === 'delivered' && (
          <section aria-labelledby="rate-product-heading" className="panel tx-sheet overflow-hidden">
            <h2 id="rate-product-heading" className={cn(sectionHeading, 'border-b border-foreground/[0.08] px-4 py-3')}>Rate the product</h2>
            <div className="p-4">
              {checkingReview ? (
                <div aria-busy="true" className="flex items-center gap-3 py-2">
                  <span className="sr-only">Loading</span>
                  <span className="size-10 shrink-0 rounded-[8px] bg-foreground/[0.06]" />
                  <span className="h-3.5 w-2/3 rounded-[6px] bg-foreground/[0.06]" />
                </div>
              ) : hasReviewedProduct ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <CircleCheck aria-hidden="true" className="size-8 text-status-success-fg" />
                  <p className="text-sm font-medium text-foreground">Review saved.</p>
                  <p className="text-xs text-muted-foreground">Thanks for sharing your experience.</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center gap-3">
                    {order.items[0]?.image && (
                      <div className="tile-img size-10 shrink-0 overflow-hidden">
                        <SmartImage src={order.items[0].image} alt="" className="h-full w-full object-cover" preset="thumb" />
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground">Share your experience with {order.items[0]?.name || 'this product'}</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/write-review?productId=${encodeURIComponent(order.items[0]?.productId ?? '')}`, {
                      state: {
                        productId: order.items[0]?.productId,
                        productName: order.items[0]?.name,
                        productImage: order.items[0]?.image,
                      }
                    })}
                    className="w-full"
                  >
                    <Star aria-hidden="true" />
                    Write a review
                  </Button>
                </>
              )}
            </div>
          </section>
        )}

        {/* Price Details Section */}
        <section aria-labelledby="price-details-heading" className="panel tx-sheet overflow-hidden">
          <h2 id="price-details-heading" className={cn(sectionHeading, 'border-b border-foreground/[0.08] px-4 py-3')}>Price details</h2>

          <dl className="space-y-3 px-4 py-3 text-sm tabular-nums">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Selling price</dt>
              <dd className="text-foreground">{formatINR(order.subtotal)}</dd>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between gap-4 text-status-success-fg">
                <dt>Discount</dt>
                <dd>-{formatINR(order.discount)}</dd>
              </div>
            )}
            {rewardsRows.map(([label, amount]) => (
              <div key={label} className="flex justify-between gap-4 text-status-success-fg">
                <dt>{label}</dt>
                <dd>-{formatINR(amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Total fees</dt>
              <dd className="text-foreground">{formatINR(totalFees)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-foreground/[0.08] pt-3 text-base font-semibold text-foreground">
              <dt>Total amount</dt>
              <dd>{formatINR(order.total)}</dd>
            </div>
          </dl>
          {pointsEarnedNote && (
            <p className="flex items-start gap-2 px-4 pb-3 text-xs text-muted-foreground">
              <Coins className="mt-px size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>{pointsEarnedNote}</span>
            </p>
          )}
        </section>

        {/* Share order details + invoice */}
        <div className="panel tx-sheet divide-y divide-foreground/[0.08] overflow-hidden">
          <button
            ref={shareTriggerRef}
            type="button"
            onClick={() => setShowShareMenu(true)}
            onPointerEnter={warmReceipt}
            onFocus={warmReceipt}
            className={rowButton}
          >
            <span className="flex items-center gap-3">
              <Share2 aria-hidden="true" className="size-5 text-muted-foreground" />
              <span>Share order details</span>
            </span>
            <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={() => downloadInvoice()}
            onPointerEnter={warmInvoice}
            onFocus={warmInvoice}
            disabled={isDownloadingInvoice}
            className={rowButton}
          >
            <span className="flex items-center gap-3">
              <Download aria-hidden="true" className="size-5 text-muted-foreground" />
              <span className="text-left">
                <span className="block">Download invoice</span>
                <span className="block text-xs font-normal text-muted-foreground tabular-nums">Order ORD-{order.orderId}</span>
              </span>
            </span>
            {isDownloadingInvoice ? (
              <Spinner label="Creating your invoice" className="text-muted-foreground" />
            ) : (
              <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
            )}
          </button>
        </div>

      </div>

      {/* Hidden Receipt Component for Image Generation (fixed colours: it becomes a picture) */}
      {order && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            zIndex: -9999,
            opacity: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          <div
            ref={receiptRef}
            style={{
              width: '380px',
              padding: '24px',
              backgroundColor: RECEIPT.paper,
              color: RECEIPT.text,
              fontFamily: "var(--font-body)",
            }}
          >
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: `2px solid ${RECEIPT.accent}`, paddingBottom: '16px' }}>
              <p style={{ fontSize: '22px', fontWeight: 'bold', color: RECEIPT.accent, margin: 0, fontFamily: 'var(--font-heading)' }}>ISHAPUTRA BOTANICALS</p>
              <p style={{ fontSize: '11px', color: RECEIPT.muted, margin: '4px 0 0 0' }}>{BRAND.tagline}</p>
            </div>

            {/* Receipt Title */}
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <p style={{ fontSize: '14px', fontWeight: '600', letterSpacing: '0.18em', color: RECEIPT.text, margin: 0 }}>ORDER RECEIPT</p>
            </div>

            {/* Order Info */}
            <div style={{ backgroundColor: RECEIPT.panel, padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: RECEIPT.muted }}>Order ID</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: RECEIPT.text }}>ORD-{order.orderId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: RECEIPT.muted }}>Date</span>
                <span style={{ fontSize: '12px', color: RECEIPT.text }}>{formatDate(order.createdAt)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: RECEIPT.muted }}>Status</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: RECEIPT.accent }}>{getStatusLabel(order.status)}</span>
              </div>
            </div>

            {/* Items */}
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: RECEIPT.text, margin: '0 0 10px', borderBottom: `1px solid ${RECEIPT.rule}`, paddingBottom: '6px' }}>Items ordered</p>
              {order.items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', paddingBottom: '10px', borderBottom: idx < order.items.length - 1 ? `1px dashed ${RECEIPT.rule}` : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '12px', fontWeight: '500', color: RECEIPT.text, margin: 0 }}>{item.name}</p>
                    <p style={{ fontSize: '11px', color: RECEIPT.muted, margin: '2px 0 0 0' }}>Qty {item.quantity} × {formatINR(item.price)}</p>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: RECEIPT.text }}>{formatINR(item.quantity * item.price)}</span>
                </div>
              ))}
            </div>

            {/* Price Details */}
            <div style={{ backgroundColor: RECEIPT.panel, padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: RECEIPT.text, margin: '0 0 10px' }}>Price details</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: RECEIPT.muted }}>Selling price</span>
                <span style={{ fontSize: '12px', color: RECEIPT.text }}>{formatINR(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: RECEIPT.discount }}>Discount</span>
                  <span style={{ fontSize: '12px', color: RECEIPT.discount }}>-{formatINR(order.discount)}</span>
                </div>
              )}
              {rewardsRows.map(([label, amount]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: RECEIPT.discount }}>{label}</span>
                  <span style={{ fontSize: '12px', color: RECEIPT.discount }}>-{formatINR(amount)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', color: RECEIPT.muted }}>Total fees</span>
                <span style={{ fontSize: '12px', color: RECEIPT.text }}>{formatINR(totalFees)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: `2px solid ${RECEIPT.accent}` }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: RECEIPT.accent }}>Total amount</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: RECEIPT.text }}>{formatINR(order.total)}</span>
              </div>
            </div>

            {/* Payment & Delivery */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: RECEIPT.muted }}>Payment</span>
                <span style={{ fontSize: '12px', fontWeight: '500', color: RECEIPT.text }}>{formatPaymentMethod(order.paymentMethod)}</span>
              </div>
              <div style={{ marginTop: '10px' }}>
                <p style={{ fontSize: '12px', color: RECEIPT.muted, margin: '0 0 4px 0' }}>Delivery address</p>
                <p style={{ fontSize: '12px', color: RECEIPT.text, margin: 0, lineHeight: '1.4' }}>
                  {order.shippingAddress.fullName}<br />
                  {order.shippingAddress.address}<br />
                  {order.shippingAddress.city}, {order.shippingAddress.state}<br />
                  PIN {order.shippingAddress.pincode}<br />
                  Mobile {order.shippingAddress.mobile}
                </p>
              </div>
            </div>

            {/* Tracking Info */}
            {(order.trackingId || order.carrier) && (
              <div style={{ backgroundColor: RECEIPT.panel, padding: '10px', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: RECEIPT.accent, margin: '0 0 6px' }}>Tracking information</p>
                {order.trackingId && <p style={{ fontSize: '11px', color: RECEIPT.muted, margin: '0 0 4px 0' }}>ID {order.trackingId}</p>}
                {order.carrier && <p style={{ fontSize: '11px', color: RECEIPT.muted, margin: 0 }}>Carrier {order.carrier}</p>}
              </div>
            )}

            {/* Footer */}
            <div style={{ textAlign: 'center', borderTop: `1px solid ${RECEIPT.rule}`, paddingTop: '16px' }}>
              <p style={{ fontSize: '12px', fontWeight: '500', color: RECEIPT.text, margin: '0 0 4px 0' }}>Thank you for shopping with Ishaputra.</p>
              <p style={{ fontSize: '11px', color: RECEIPT.muted, margin: '0 0 8px 0' }}>For support: {BRAND.phones[0] || BRAND.email}</p>
              <p style={{ fontSize: '10px', color: RECEIPT.muted, margin: 0 }}>{SITE_HOST}</p>
            </div>
          </div>
        </div>
      )}

      {/* Share sheet */}
      <Sheet open={showShareMenu} onOpenChange={setShowShareMenu}>
        <SheetContent
          side="bottom"
          className="tx-sheet mx-auto max-w-xl border-foreground/[0.08] px-5 pt-6 sm:px-6"
          onCloseAutoFocus={(e) => { e.preventDefault(); shareTriggerRef.current?.focus(); }}
        >
          <div className="mb-5 pr-10">
            <SheetTitle>Share order details</SheetTitle>
            <SheetDescription className="mt-1">Send a picture of your receipt.</SheetDescription>
          </div>

          {/* Generating Image Indicator */}
          {isGeneratingImage && (
            <div role="status" className="mb-4 flex items-center justify-center gap-3 py-2 text-sm text-muted-foreground">
              <Spinner className="text-primary" />
              Creating your receipt image
            </div>
          )}

          {/* Share Options Grid */}
          <div className="grid grid-cols-4 gap-x-2 gap-y-4">
            {([
              { label: 'WhatsApp', icon: MessageCircle, platform: 'whatsapp' },
              { label: 'Gmail', icon: Mail, platform: 'email' },
              { label: 'Instagram', icon: Share2, platform: 'native' },
              { label: 'Save', icon: Download, platform: 'download' },
              { label: 'Messenger', icon: MessageCircle, platform: 'native' },
              { label: 'SMS', icon: MessageCircle, platform: 'native' },
              { label: 'Telegram', icon: Share2, platform: 'native' },
              { label: 'More', icon: Share2, platform: 'native' },
            ] as const).map(({ label, icon: Icon, platform }) => (
              <button
                key={label}
                type="button"
                onClick={() => shareReceiptImage(platform)}
                disabled={isGeneratingImage}
                className="group flex flex-col items-center gap-2 rounded-card py-1 transition-transform duration-press ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="tx-slate grid size-14 place-items-center rounded-card transition-[box-shadow] duration-hover ease-out group-hover:shadow-[var(--shadow-card-hover)]">
                  <Icon aria-hidden="true" className="size-6 text-highlight-soft" />
                </span>
                <span className="text-xs text-foreground">{label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Return request sheet */}
      <Sheet open={showReturnModal} onOpenChange={(open) => { if (!open) closeReturnSheet(); }}>
        <SheetContent
          side="right"
          hideClose
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
          onCloseAutoFocus={(e) => { e.preventDefault(); returnTriggerRef.current?.focus(); }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-foreground/[0.08] px-3 py-3">
            {returnStep === 'details' ? (
              <IconButton label="Back" onClick={() => setReturnStep('reason')}>
                <ArrowLeft />
              </IconButton>
            ) : (
              <IconButton label="Close" onClick={closeReturnSheet}>
                <ArrowLeft />
              </IconButton>
            )}
            <SheetTitle>Request a return</SheetTitle>
            <SheetDescription className="sr-only">
              {returnStep === 'reason' ? 'Step 1 of 2: choose a reason.' : 'Step 2 of 2: check the pickup details and send the request.'}
            </SheetDescription>
          </div>

          {/* Return Reasons Grid - Step 1 */}
          {returnStep === 'reason' && (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-5">
                {productSummary}

                <h3 id="return-reason-heading" className={cn(sectionHeading, 'mb-3 mt-6')}>Reason for return</h3>

                <div role="group" aria-labelledby="return-reason-heading" className="grid grid-cols-2 gap-3">
                  {RETURN_REASONS.map((item) => {
                    const selected = returnReason === item.reason;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.reason}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setReturnReason(item.reason);
                          setCustomReturnReason('');
                        }}
                        className={cn(
                          'relative flex flex-col items-center gap-3 rounded-card border p-4 text-center transition-[border-color,background-color,box-shadow,transform] duration-press ease-out active:scale-[0.97]',
                          selected
                            ? 'border-primary bg-primary/[0.06] ring-1 ring-primary'
                            : 'border-foreground/[0.1] bg-card hover:border-foreground/25',
                        )}
                      >
                        {selected && (
                          <span aria-hidden="true" className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3 [stroke-width:2.5]" />
                          </span>
                        )}
                        <span aria-hidden="true" className="tx-slate grid size-11 place-items-center rounded-[8px]">
                          <Icon className="size-5 text-highlight-soft" />
                        </span>
                        <span className={cn('text-xs leading-snug', selected ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Other Reason Option */}
                <button
                  type="button"
                  aria-pressed={returnReason === 'Other reason'}
                  onClick={() => setReturnReason('Other reason')}
                  className={cn(
                    'relative mt-3 flex w-full items-center gap-3 rounded-card border p-3 text-left transition-[border-color,background-color,box-shadow,transform] duration-press ease-out active:scale-[0.97]',
                    returnReason === 'Other reason'
                      ? 'border-primary bg-primary/[0.06] ring-1 ring-primary'
                      : 'border-foreground/[0.1] bg-card hover:border-foreground/25',
                  )}
                >
                  <span aria-hidden="true" className="tx-slate grid size-11 shrink-0 place-items-center rounded-[8px]">
                    <PenLine className="size-5 text-highlight-soft" />
                  </span>
                  <span className={cn('flex-1 text-sm', returnReason === 'Other reason' ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                    Other reason
                  </span>
                  {returnReason === 'Other reason' && (
                    <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3 [stroke-width:2.5]" />
                    </span>
                  )}
                </button>

                {/* Custom Reason Input - Shows when "Other reason" is selected */}
                {returnReason === 'Other reason' && (
                  <div className="mt-3">
                    <label htmlFor="return-other-reason" className="sr-only">Your reason for the return</label>
                    <Textarea
                      id="return-other-reason"
                      value={customReturnReason}
                      onChange={(e) => setCustomReturnReason(e.target.value)}
                      placeholder="Tell us why you are returning it"
                      rows={4}
                      maxLength={200}
                      aria-describedby="return-other-count"
                      className="resize-none"
                      autoFocus
                    />
                    <p id="return-other-count" className="ml-1 mt-1 text-xs text-muted-foreground tabular-nums">
                      {customReturnReason.length}/200 characters
                    </p>
                  </div>
                )}
              </div>

              {/* Bottom Button - Step 1 */}
              <div className="border-t border-foreground/[0.08] bg-card px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => setReturnStep('details')}
                  disabled={reasonInvalid}
                  className={
                    reasonInvalid
                      ? 'h-12 w-full cursor-not-allowed rounded-control bg-foreground/[0.06] text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground'
                      : 'btn-copper h-12 w-full justify-center'
                  }
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Return Details - Step 2 */}
          {returnStep === 'details' && (
            <>
              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto">
                <div className="space-y-6 px-4 py-5">
                  {productSummary}

                  <div className="h-px bg-foreground/[0.08]" />

                  {/* Replacement Info */}
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-foreground">Return type</h3>
                    <div className="rounded-card border border-primary/25 bg-primary/[0.05] p-4">
                      <p className="text-sm font-semibold text-foreground">Product replacement</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Your product will be replaced with the same item after quality check
                      </p>
                    </div>
                  </div>

                  <div className="h-px bg-foreground/[0.08]" />

                  {/* Pick up and delivery */}
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-foreground">Pickup and delivery</h3>
                    <div className="rounded-card bg-foreground/[0.04] p-4">
                      <p className="text-sm font-medium text-foreground">
                        {order.shippingAddress?.fullName || 'Not available'}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                        <Phone aria-hidden="true" className="size-3.5" />
                        {order.shippingAddress?.mobile || 'Not available'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {order.shippingAddress?.address}, {order.shippingAddress?.locality && `${order.shippingAddress.locality}, `}{order.shippingAddress?.city}, {order.shippingAddress?.state} {order.shippingAddress?.pincode}
                      </p>
                      {order.shippingAddress?.landmark && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Landmark: {order.shippingAddress.landmark}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Button - Step 2 */}
              <div className="border-t border-foreground/[0.08] bg-card px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={handleRequestReturn}
                  disabled={isSubmitting}
                  className={
                    isSubmitting
                      ? 'inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-control bg-foreground/[0.06] text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground'
                      : 'btn-copper h-12 w-full justify-center'
                  }
                >
                  {isSubmitting && <Spinner />}
                  {isSubmitting ? 'Sending request' : 'Request return'}
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Cancel return confirmation */}
      <ConfirmDialog
        open={confirmCancelReturn}
        onOpenChange={setConfirmCancelReturn}
        title="Cancel this return?"
        description="You won't be able to request a return for this order again."
        confirmLabel="Cancel return"
        cancelLabel="Keep return"
        tone="danger"
        onConfirm={handleCancelReturn}
        returnFocusRef={cancelReturnBtnRef}
      />
    </>
  );
};

export default OrderDetailsPage;
