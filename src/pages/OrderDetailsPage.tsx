import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToUserOrders, Order, requestReturn, cancelReturn } from '@/services/orderService';
import Header from '@/components/Header';
import MobileHeader from '@/components/MobileHeader';
import MobileSearchBar from '@/components/MobileSearchBar';
import CategoryIconNav from '@/components/CategoryIconNav';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import { generateInvoicePDF } from '@/services/invoiceService';
import { db } from '@/config/firebase';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { hasUserReviewedProduct } from '@/services/reviewService';
import { createOrderMessage, OrderMessage, subscribeToCustomerOrderMessages } from '@/services/orderMessagingService';
import { notifyOrder } from '@/services/pushNotificationService';
import {
  Loader2,
  Package,
  ArrowLeft,
  Truck,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  MapPin,
  Home,
  ChevronRight,
  ChevronDown,
  Ban,
  Mail,
  X,
  Download,
  RotateCcw as ReturnIcon,
  Share2,
  MessageCircle,
  Star,
  Coins,
} from 'lucide-react';
import { SmartImage } from "@/components/ui/smart-image";
import { BRAND } from "@/config/brand";
import { SITE_HOST } from "@/lib/siteUrl";

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
    { key: 'pending', label: 'Order\nPlaced' },
    { key: 'processing', label: 'Processing' },
    { key: 'packed', label: 'Packed' },
    { key: 'outForDelivery', label: 'Out for\nDelivery' },
    { key: 'delivered', label: 'Delivered' },
  ];

  // Return flow steps (4 steps including the interim 'picked' state)
  const returnSteps = [
    { key: 'returnRequested', label: 'Return\nRequested' },
    { key: 'returnScheduled', label: 'Return\nScheduled' },
    { key: 'picked', label: 'Return\nPickup' },
    { key: 'returned', label: 'Returned' },
  ];

  const steps = isReturnFlow ? returnSteps : orderSteps;

  const getStepIndex = (currentStatus: string) => {
    if (isReturnFlow) {
      // In return context, 'picked' is a valid step — do not normalize it away
      const index = steps.findIndex(s => s.key === currentStatus);
      return index >= 0 ? index : 0;
    }
    // Normalise legacy statuses to canonical ones for the normal stepper.
    const normalised =
      currentStatus === 'shipped' || currentStatus === 'assigned'
        ? 'packed'
        : currentStatus === 'picked'
          ? 'outForDelivery'
          : currentStatus;
    const index = steps.findIndex(s => s.key === normalised);
    return index >= 0 ? index : 0;
  };

  const currentIndex = getStepIndex(status);
  const isCancelled = status === 'cancelled';

  // For return flow, use emerald color scheme
  const activeColor = isReturnFlow ? 'bg-emerald-500' : 'bg-primary';
  const activeBorder = isReturnFlow ? 'border-emerald-500' : 'border-primary';
  const activeText = isReturnFlow ? 'text-emerald-600' : 'text-primary';
  const activeDot = isReturnFlow ? 'bg-emerald-500' : 'bg-primary';

  return (
    <div className="flex items-start justify-between relative" style={{ fontFamily: "var(--font-body)" }}>
      {/* Progress Line Background */}
      <div className="absolute top-4 left-6 right-6 h-0.5 bg-foreground/10 z-0" />
      
      {/* Progress Line Active */}
      <div 
        className={`absolute top-4 left-6 h-0.5 z-0 transition-all duration-500 ${isCancelled ? 'bg-red-500' : activeColor}`}
        style={{ 
          width: isCancelled ? '0%' : `calc(${(currentIndex / (steps.length - 1)) * 100}% - 12px)`,
        }}
      />
      
      {steps.map((step, index) => {
        const isCompleted = !isCancelled && index <= currentIndex;
        const isCurrent = !isCancelled && index === currentIndex;
        
        return (
          <div key={step.key} className="flex flex-col items-center relative z-10" style={{ width: `${100 / steps.length}%`, fontFamily: "var(--font-body)" }}>
            {/* Step Circle */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
              isCancelled 
                ? 'bg-foreground/[0.06] border-foreground/15'
                : isCompleted 
                  ? `${activeColor} ${activeBorder}` 
                  : 'bg-card border-foreground/15'
            }`}>
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-white" />
              ) : (
                <div className={`w-2 h-2 rounded-full ${isCurrent ? activeDot : 'bg-gray-300'}`} />
              )}
            </div>
            
            {/* Step Label */}
            <p className={`text-[10px] text-center mt-2 leading-tight whitespace-pre-line ${
              isCompleted ? `${activeText} font-medium` : 'text-muted-foreground/70'
            }`}>
              {step.label}
            </p>
          </div>
        );
      })}
    </div>
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

  // Return modal states
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [customReturnReason, setCustomReturnReason] = useState('');
  const [returnStep, setReturnStep] = useState<'reason' | 'details'>('reason');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cancel Return state
  const [cancellingReturn, setCancellingReturn] = useState(false);

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
    
    const unsubscribe = subscribeToUserOrders(
      user.uid,
      (fetchedOrders) => {
        const foundOrder = fetchedOrders.find(o => o.id === orderId);
        if (foundOrder) {
          setOrder(foundOrder);
        } else {
          toast.error('Order not found');
          if (window.innerWidth >= 1024) {
            navigate('/account');
          } else {
            navigate('/account/orders');
          }
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching order:', error);
        toast.error('Failed to load order details');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, orderId, navigate]);

  useEffect(() => {
    if (!user || !orderId) return;

    const unsubscribe = subscribeToCustomerOrderMessages(
      orderId,
      (messages) => setConversationMessages(messages),
      (error) => {
        console.error('Error fetching order conversation:', error);
      }
    );

    return () => unsubscribe();
  }, [user, orderId]);

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
      toast.success('Thank you for your rating!');
    } catch {
      toast.error('Failed to submit rating. Please try again.');
    } finally {
      setSubmittingRating(false);
    }
  };

  // Format date
  const formatDate = (date: Date | { seconds: number; nanoseconds: number } | undefined) => {
    if (!date) return 'N/A';
    
    let jsDate: Date;
    if (date instanceof Date) {
      jsDate = date;
    } else if (typeof date === 'object' && 'seconds' in date) {
      jsDate = new Date(date.seconds * 1000);
    } else {
      return 'Invalid Date';
    }

    return jsDate.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Get status label
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'processing': return 'Processing';
      case 'packed': return 'Packed';
      case 'shipped': return 'Packed';
      case 'assigned': return 'Packed';
      case 'picked': return 'Out for Delivery';
      case 'outForDelivery': return 'Out for Delivery';
      case 'delivered': return 'Delivered';
      case 'cancelled': return 'Cancelled';
      case 'returnRequested': return 'Return Requested';
      case 'returnScheduled': return 'Return Scheduled';
      case 'returned': return 'Returned';
      case 'refunded': return 'Refunded';
      case 'deliveryFailed': return 'Delivery Attempted';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

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
    if (unlockAt && unlockAt.getTime() > Date.now()) return `You earned ${pts} · usable from ${formatDate(unlockAt)}`;
    return `${pts} added to your wallet`;
  };

  // Check if order can be returned (within 7 days of delivery)
  const canReturnOrder = (order: Order) => {
    if (order.status !== 'delivered') return false;
    if ((order as any).returnCancelled) return false;
    
    if (!order.deliveredAt) {
      return true;
    }

    try {
      let deliveredDate: Date;
      
      if (order.deliveredAt instanceof Date) {
        deliveredDate = order.deliveredAt;
      } else if (typeof order.deliveredAt === 'object' && 'toDate' in order.deliveredAt) {
        deliveredDate = (order.deliveredAt as any).toDate();
      } else if (typeof order.deliveredAt === 'object' && 'seconds' in order.deliveredAt) {
        deliveredDate = new Date((order.deliveredAt as any).seconds * 1000);
      } else if (typeof order.deliveredAt === 'string') {
        deliveredDate = new Date(order.deliveredAt);
      } else {
        return true;
      }
      
      const hoursSinceDelivery = (new Date().getTime() - deliveredDate.getTime()) / (1000 * 60 * 60);
      return hoursSinceDelivery <= 168; // 7 days = 168 hours
    } catch (error) {
      console.error('Error checking return eligibility:', error);
      return true;
    }
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
      
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: true,
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
        alert('Failed to generate receipt image. Please try again.');
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
          title: `Order Receipt - ORD-${order.orderId}`,
          files: [file],
        });
      } else if (platform === 'download') {
        downloadImage();
        alert('Receipt image saved to your downloads!');
      } else if (canShareFiles) {
        await navigator.share({
          title: `Order Receipt - ORD-${order.orderId}`,
          files: [file],
        });
      } else {
        downloadImage();
        
        setTimeout(() => {
          if (platform === 'whatsapp') {
            window.open('https://web.whatsapp.com/', '_blank');
            alert('Receipt downloaded! Open WhatsApp and attach the image from your Downloads folder.');
          } else if (platform === 'email') {
            window.open(`mailto:?subject=Order Receipt - ORD-${order.orderId}`, '_blank');
            alert('Receipt downloaded! Attach the image from your Downloads folder to the email.');
          } else {
            alert('Receipt image downloaded! You can now share it on any platform.');
          }
        }, 500);
      }
      
      setShowShareMenu(false);
    } catch (error) {
      console.error('Error sharing receipt:', error);
      if ((error as Error).name !== 'AbortError') {
        alert('Failed to share receipt. Please try the "Save" option to download the image.');
      }
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Download Invoice as PDF — delegated to invoiceService for a clean,
  // consistent layout that consumes the saved order pricing snapshot.
  const downloadInvoice = async () => {
    if (!order) return;
    setIsDownloadingInvoice(true);
    try {
      await generateInvoicePDF(order);
    } catch (error) {
      console.error('Error generating invoice PDF:', error);
      toast.error('Failed to generate invoice. Please try again.');
    } finally {
      setIsDownloadingInvoice(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen tx-paper flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return null;
  }

  // Price details: points and cashback are listed so the lines add up to
  // order.total (paid after them). GST inside GST-inclusive prices is already
  // in the selling price, so it is not counted again as a fee.
  const rewardsRows = rewardsPaidRows(order);
  const totalFees = (order.deliveryCharge || 0) + (order.gstInclusive ? 0 : order.taxAmount || 0);
  const pointsEarnedNote = getPointsEarnedNote(order);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,hsl(var(--highlight)/0.05)_0%,rgba(255,255,255,1)_20%),linear-gradient(135deg,hsl(var(--primary)/0.03)_0%,rgba(255,255,255,1)_55%)] dark:bg-[linear-gradient(180deg,rgba(19,17,15,0.98)_0%,rgba(14,14,15,0.98)_100%)]" style={{ fontFamily: "var(--font-body)" }}>
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
      
      {/* Page Header */}
      <div className="mx-auto max-w-4xl px-4 pt-4">
        <div className="flex items-center gap-3 rounded-[28px] border border-highlight/15 bg-white/88 px-4 py-4 shadow-[0_30px_80px_-60px_rgba(0,0,0,0.5)] backdrop-blur dark:border-highlight/20 dark:shadow-[0_30px_80px_-60px_rgba(0,0,0,0.9)]">
          <button
            onClick={() => {
              if (window.innerWidth >= 1024) { navigate('/account'); return; }
              navigate('/account/orders');
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-foreground/[0.06]"
          >
            <ArrowLeft className="w-5 h-5 text-foreground/80" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-px w-6 bg-highlight/50" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-primary font-medium">Order</span>
            </div>
            <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-body)" }}>Order Details</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">ORD-{order.orderId}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl space-y-3 px-4 pb-24 pt-4">
        {/* Tracking ID Banner */}
        <div className="rounded-[24px] border border-highlight/12 bg-[linear-gradient(135deg,rgba(59,130,246,0.08)_0%,hsl(var(--highlight)/0.10)_100%)] px-4 py-3 shadow-[0_20px_45px_-38px_rgba(0,0,0,0.45)] dark:border-highlight/18 dark:bg-[linear-gradient(135deg,rgba(37,99,235,0.14)_0%,rgba(146,64,14,0.12)_100%)]">
          <p className="text-sm text-primary dark:text-blue-200">
            Order can be tracked by <span className="font-semibold">ORD-{order.orderId}</span>
            {order.trackingId && (
              <span className="mt-1 block text-xs">Tracking ID: {order.trackingId}</span>
            )}
          </p>
        </div>

        {/* Product Card */}
        <div className="rounded-[24px] border border-highlight/12 bg-white/92 px-4 py-4 shadow-[0_22px_55px_-40px_rgba(0,0,0,0.45)] backdrop-blur dark:border-highlight/18 dark:shadow-[0_22px_55px_-40px_rgba(0,0,0,0.88)]">
          <div className="flex gap-4">
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-[10px] border border-highlight/10 bg-foreground/[0.03] dark:bg-zinc-800/70">
              <SmartImage 
                src={order.items[0]?.image} 
                alt={order.items[0]?.name} 
                className="w-full h-full object-cover" preset="thumb" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                {order.items.length > 1 
                  ? `${order.items[0]?.name} +${order.items.length - 1} more`
                  : order.items[0]?.name
                }
              </h3>
              <p className="mt-1 text-base font-bold text-foreground">₹{order.total.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Order Status Timeline (hidden for returned / refunded orders) */}
        {order.status !== 'returned' && order.status !== 'refunded' && (
          <div className="rounded-[24px] border border-highlight/12 bg-white/92 px-4 py-5 shadow-[0_22px_55px_-40px_rgba(0,0,0,0.45)] backdrop-blur dark:border-highlight/18 dark:shadow-[0_22px_55px_-40px_rgba(0,0,0,0.88)]">
            <OrderStatusStepper status={order.status} isReturnPickedState={order.status === 'picked' && !!(order as any).returnScheduledAt} />
          </div>
        )}

        {/* Refund receipt (visible to customer once admin uploads it) */}
        {order.status === 'refunded' && order.refundReceiptUrl && (
          <div className="rounded-[24px] border border-emerald-300/40 bg-emerald-50/70 px-4 py-4 shadow-[0_22px_55px_-40px_rgba(0,0,0,0.45)] backdrop-blur dark:border-emerald-700/40 dark:bg-emerald-900/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  Refund processed
                </p>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                  Your refund receipt is available below.
                </p>
              </div>
              <a
                href={order.refundReceiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-full text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm"
              >
                View Receipt
              </a>
            </div>
          </div>
        )}

        {/* Current Status Card */}
        <div className="rounded-[24px] border border-highlight/12 bg-white/92 px-4 py-4 shadow-[0_22px_55px_-40px_rgba(0,0,0,0.45)] backdrop-blur dark:border-highlight/18 dark:shadow-[0_22px_55px_-40px_rgba(0,0,0,0.88)]">
          <div className="flex gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              order.status === 'delivered' ? 'bg-emerald-100' :
              order.status === 'cancelled' ? 'bg-red-100' :
              order.status === 'returnRequested' ? 'bg-highlight/15' :
              order.status === 'returnScheduled' ? 'bg-emerald-100' :
              (order.status === 'picked' && !!(order as any).returnScheduledAt) ? 'bg-highlight/15' :
              order.status === 'returned' ? 'bg-foreground/[0.06]' :
              order.status === 'refunded' ? 'bg-green-100' :
              'bg-blue-100'
            }`}>
              {order.status === 'delivered' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : order.status === 'cancelled' ? (
                <XCircle className="w-5 h-5 text-red-600" />
              ) : order.status === 'returnRequested' ? (
                <ReturnIcon className="w-5 h-5 text-highlight" />
              ) : order.status === 'returnScheduled' ? (
                <ReturnIcon className="w-5 h-5 text-emerald-600" />
              ) : (order.status === 'picked' && !!(order as any).returnScheduledAt) ? (
                <Truck className="w-5 h-5 text-highlight" />
              ) : order.status === 'returned' ? (
                <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
              ) : order.status === 'refunded' ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <Package className="w-5 h-5 text-primary" />
              )}
            </div>
            <div className="flex-1">
              <h4 className="text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                {order.status === 'picked' && !!(order as any).returnScheduledAt ? 'Return Pickup' : getStatusLabel(order.status)}
              </h4>
              {order.carrier && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3" />
                  {order.carrier}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                {order.status === 'pending' && 'Your order has been placed successfully'}
                {order.status === 'processing' && 'Package is being prepared for shipment'}
                {(order.status === 'packed' || order.status === 'shipped' || order.status === 'assigned') && 'Your order is packed and ready for dispatch'}
                {order.status === 'outForDelivery' && 'Your order is on the way!'}
                {order.status === 'picked' && !(order as any).returnScheduledAt && 'Your order is on the way!'}
                {order.status === 'picked' && !!(order as any).returnScheduledAt && 'Pickup partner has collected the item. Return in progress.'}
                {order.status === 'delivered' && 'Package has been delivered'}
                {order.status === 'cancelled' && 'Order has been cancelled'}
                {order.status === 'returnRequested' && 'Return request submitted. Waiting for approval.'}
                {order.status === 'returnScheduled' && 'Return approved! Pickup will be scheduled soon.'}
                {order.status === 'returned' && 'Item has been picked up and returned successfully.'}
                {order.status === 'refunded' && 'Your refund has been processed successfully.'}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70">
                <Clock className="w-3 h-3" />
                {formatDate(order.updatedAt || order.createdAt)}
              </p>
            </div>
          </div>
        </div>

        {/* OTP Delivery Verification - Shown when out for delivery */}
        {order.status === 'outForDelivery' && order.delivery_otp && (
          <div className="rounded-[24px] border-2 border-highlight/45 bg-gradient-to-br from-highlight/10 to-primary/10 px-5 py-4 shadow-[0_22px_55px_-40px_rgba(0,0,0,0.45)] dark:border-highlight/40 dark:from-highlight/10 dark:to-primary/10">
            <p className="text-xs font-semibold uppercase tracking-widest text-highlight dark:text-highlight">Delivery OTP</p>
            <p className="mt-1 text-xs text-highlight dark:text-charcoal-foreground">Share this OTP with your delivery partner at the door</p>
            <p className="mt-2 font-mono text-3xl font-extrabold tracking-[0.5em] text-highlight dark:text-highlight">{order.delivery_otp}</p>
            {(order.delivery_partner_name || order.delivery_boy_name) && (
              <div className="mt-3 flex items-center justify-between rounded-[10px] bg-white/70 px-3 py-2">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Delivery Partner</p>
                  <p className="text-sm font-semibold text-foreground">
                    {order.delivery_partner_name || order.delivery_boy_name}
                  </p>
                </div>
                {order.delivery_partner_phone && (
                  <a
                    href={`tel:${order.delivery_partner_phone}`}
                    className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white"
                  >
                    <Truck className="h-3 w-3" /> Call
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Return Pickup OTP — shown to customer when return is scheduled */}
        {order.status === 'returnScheduled' && (order as any).return_otp && (
          <div className="rounded-[24px] border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-green-50 px-5 py-4 shadow-[0_22px_55px_-40px_rgba(0,0,0,0.45)] dark:border-emerald-500/40 dark:from-emerald-500/10 dark:to-green-500/10">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Return Pickup OTP</p>
            <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">Show this OTP to the pickup partner when they arrive to collect your item</p>
            <p className="mt-2 font-mono text-3xl font-extrabold tracking-[0.5em] text-emerald-700 dark:text-emerald-300">{(order as any).return_otp}</p>
            {(order.delivery_partner_name || order.delivery_boy_name) && (
              <div className="mt-3 flex items-center justify-between rounded-[10px] bg-white/70 px-3 py-2">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Pickup Partner</p>
                  <p className="text-sm font-semibold text-foreground">
                    {order.delivery_partner_name || order.delivery_boy_name}
                  </p>
                </div>
                {order.delivery_partner_phone && (
                  <a
                    href={`tel:${order.delivery_partner_phone}`}
                    className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white"
                  >
                    <Truck className="h-3 w-3" /> Call
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Delivery Window — shown when out for delivery and window is set */}
        {(order.status === 'outForDelivery' || order.status === 'shipped' || order.status === 'assigned' || order.status === 'picked') &&
          (order as any).delivery_window_date && (
          <div className="rounded-[24px] border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 px-5 py-4 shadow-[0_20px_45px_-38px_rgba(0,0,0,0.30)] dark:border-purple-500/30 dark:from-purple-500/10 dark:to-indigo-500/10">
            <p className="text-xs font-semibold uppercase tracking-widest text-purple-700 dark:text-purple-300">Expected Delivery Window</p>
            <p className="mt-2 text-base font-semibold text-purple-900 dark:text-purple-100">
              {(() => {
                const d = new Date((order as any).delivery_window_date + 'T00:00:00');
                const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                const fmt = (t: string) => { const [h, m] = t.split(':').map(Number); const p = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${p}`; };
                return `${dateStr}, between ${fmt((order as any).delivery_window_from)} – ${fmt((order as any).delivery_window_to)}`;
              })()}
            </p>
            {(order as any).delivery_window_note && (
              <p className="mt-1 text-xs text-purple-700 dark:text-purple-300">{(order as any).delivery_window_note}</p>
            )}
          </div>
        )}

        {/* Delivery Failed notice */}
        {order.status === 'deliveryFailed' && (
          <div className="rounded-[24px] border border-red-200 bg-gradient-to-br from-red-50 to-primary/10 px-5 py-4 shadow-[0_20px_45px_-38px_rgba(0,0,0,0.30)] dark:border-red-500/30 dark:from-red-500/10 dark:to-primary/10">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-700 dark:text-red-300">Delivery Attempted</p>
            <p className="mt-2 text-sm font-medium text-red-900 dark:text-red-100">We couldn't reach you for delivery.</p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">Your item is being returned to our store. Our team will contact you to reschedule the delivery.</p>
          </div>
        )}

        {/* Delivery Message */}
        {order.status !== 'delivered' && order.status !== 'cancelled' && 
         order.status !== 'returnRequested' && order.status !== 'returnScheduled' && 
         order.status !== 'returned' && order.status !== 'refunded' && order.status !== 'deliveryFailed' && (
          <div className="rounded-[24px] border border-highlight/12 bg-[linear-gradient(135deg,hsl(var(--highlight-soft)/0.12)_0%,hsl(var(--highlight)/0.08)_100%)] px-4 py-3 shadow-[0_20px_45px_-38px_rgba(0,0,0,0.45)]">
            <p className="text-sm text-highlight">
              {(order.status === 'shipped' || order.status === 'outForDelivery' || order.status === 'picked')
                ? "Yayy! your item is on the way. It will reach you soon."
                : "Your order is being processed. We'll notify you once it's shipped."
              }
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 rounded-[24px] border border-highlight/12 bg-white/92 px-4 py-4 shadow-[0_22px_55px_-40px_rgba(0,0,0,0.45)] backdrop-blur dark:border-highlight/18 dark:shadow-[0_22px_55px_-40px_rgba(0,0,0,0.88)]">
          {/* Cancel Button - Only for pending/processing orders */}
          {(order.status === 'pending' || order.status === 'processing') && (
            <button
              onClick={() => navigate(`/account/orders/${orderId}/cancel`)}
              className="flex-1 py-2.5 px-4 bg-red-50 border border-red-200 rounded-lg text-sm font-medium text-red-700 flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
            >
              <Ban className="w-4 h-4" />
              Cancel Order
            </button>
          )}

          {/* Cancel Return — only for returnRequested orders, one-time */}
          {order.status === 'returnRequested' && !(order as any).returnCancelled && (
            <button
              onClick={handleCancelReturn}
              disabled={cancellingReturn}
              className="flex-1 py-2.5 px-4 bg-highlight/10 border border-highlight/30 rounded-lg text-sm font-medium text-highlight flex items-center justify-center gap-2 hover:bg-highlight/15 transition-colors disabled:opacity-50"
            >
              {cancellingReturn ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
              Cancel Return
            </button>
          )}

          {/* Return Button - Only for delivered orders within 7 days */}
          {canReturnOrder(order) && (
            <button
              onClick={() => setShowReturnModal(true)}
              className="flex-1 py-2.5 px-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-medium text-emerald-700 flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors"
            >
              <ReturnIcon className="w-4 h-4" />
              Return Items
            </button>
          )}

          {/* Chat Button - Always show */}
          <button 
            onClick={focusOrderChat}
            className="flex-1 py-2.5 px-4 bg-primary/5 border border-primary/25 rounded-lg text-sm font-medium text-primary flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Open order chat
          </button>
        </div>

        <div ref={conversationSectionRef} className="rounded-[24px] border border-highlight/12 bg-white/92 p-4 shadow-[0_22px_55px_-40px_rgba(0,0,0,0.45)] backdrop-blur dark:border-highlight/18 dark:shadow-[0_22px_55px_-40px_rgba(0,0,0,0.88)]">
          <button
            onClick={() => setConversationOpen(!conversationOpen)}
            className="flex w-full items-start justify-between gap-3 text-left"
          >
            <div>
              <h3 className="text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                Order conversation
                {conversationMessages.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                    {conversationMessages.length}
                  </span>
                )}
              </h3>
              {!conversationOpen && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {conversationMessages.length === 0 ? 'Tap to start a conversation' : `${conversationMessages.length} message${conversationMessages.length > 1 ? 's' : ''}`}
                </p>
              )}
            </div>
            <ChevronDown className={`mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/70 transition-transform duration-200 ${conversationOpen ? 'rotate-180' : ''}`} />
          </button>

          {conversationOpen && (
            <>
              <p className="mt-2 text-xs text-muted-foreground">Ask about delivery timing, product issues, or any order-specific request. Replies from the admin team stay attached to this order.</p>

              <div className="mt-4 flex items-center justify-end">
                <button
                  onClick={() => navigate('/customer-support')}
                  className="shrink-0 rounded-full border border-highlight/15 bg-cream px-3 py-1.5 text-xs font-medium text-primary hover:bg-cream dark:bg-highlight/5 dark:text-charcoal-foreground dark:hover:bg-highlight/6"
                >
                  More support
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {conversationMessages.length === 0 ? (
                  <div className="rounded-[20px] border border-dashed border-highlight/18 bg-cream px-4 py-6 text-center text-sm text-muted-foreground">
                    No order messages yet. Start the conversation below and the admin team will reply here.
                  </div>
                ) : (
                  conversationMessages.map((message) => {
                    const isCustomerMessage = message.authorType === 'customer';

                    return (
                      <div key={message.id} className={`flex ${isCustomerMessage ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[88%] rounded-[22px] px-4 py-3 shadow-sm ${
                            isCustomerMessage
                              ? 'bg-primary text-white'
                              : 'border border-highlight/12 bg-cream text-foreground dark:bg-highlight/5'
                          }`}
                        >
                          <div className={`flex flex-wrap items-center gap-2 text-[11px] ${isCustomerMessage ? 'text-white/75' : 'text-muted-foreground'}`}>
                            <span className="font-semibold">{message.authorName || (isCustomerMessage ? 'You' : 'Support team')}</span>
                            <span>{formatDate(message.createdAt as any)}</span>
                            {message.channel !== 'chat' && (
                              <span className={`rounded-full px-2 py-0.5 ${isCustomerMessage ? 'bg-white/10 text-white/80' : 'bg-card text-primary'}`}>
                                {message.channel}
                              </span>
                            )}
                          </div>
                          <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${isCustomerMessage ? 'text-white' : 'text-foreground/80'}`}>
                            {message.message}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-4 rounded-[22px] border border-highlight/12 bg-cream p-3">
                <Textarea
                  ref={conversationInputRef}
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  className="min-h-[118px] resize-none border-0 bg-white/80 focus-visible:ring-1 focus-visible:ring-highlight"
                  placeholder="Write your order-related message here. Mention delivery timing, product questions, or any issue with this order."
                />
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">This chat stays attached to order ORD-{order.orderId} so the admin team sees the full context.</p>
                  <button
                    onClick={sendOrderChatMessage}
                    disabled={sendingChatMessage || !chatDraft.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sendingChatMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                    {sendingChatMessage ? 'Sending...' : 'Send reply'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Track Package Button */}
        {order.trackingUrl && (
          <div className="rounded-[24px] border border-highlight/12 bg-white/92 px-4 py-3 shadow-[0_22px_55px_-40px_rgba(0,0,0,0.45)] backdrop-blur dark:border-highlight/18 dark:shadow-[0_22px_55px_-40px_rgba(0,0,0,0.88)]">
            <a
              href={order.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-white text-sm font-semibold rounded-[10px]"
            >
              <Truck className="w-4 h-4" />
              Track Package
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

        {/* Delivery Details Section */}
        <div className="overflow-hidden rounded-[24px] border border-highlight/12 bg-white/92 shadow-[0_22px_55px_-40px_rgba(0,0,0,0.45)] backdrop-blur dark:border-highlight/18 dark:shadow-[0_22px_55px_-40px_rgba(0,0,0,0.88)]">
          <h3 className="border-b border-highlight/10 px-4 py-3 text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-body)" }}>Delivery details</h3>
          
          {/* Delivery Address */}
          <div className="px-4 py-3 flex items-center gap-3 border-b border-highlight/10">
            <div className="w-10 h-10 bg-foreground/[0.06] rounded-full flex items-center justify-center flex-shrink-0">
              <Home className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary">Delivery Address</p>
              <p className="text-xs text-muted-foreground truncate">
                {order.shippingAddress.address}, {order.shippingAddress.city}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground/70 flex-shrink-0" />
          </div>

          {/* Customer Info */}
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-semibold">
                {order.shippingAddress.fullName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{order.shippingAddress.fullName}</p>
              <p className="text-xs text-muted-foreground">ORD-{order.orderId}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground/70 flex-shrink-0" />
          </div>
        </div>

        {/* Rate Delivery Boy - Only for delivered orders with a delivery boy assigned */}
        {order.status === 'delivered' && order.deliveryBoyId && (
          <div className="bg-white/92 rounded-[24px] border border-highlight/12 shadow-[0_22px_55px_-40px_rgba(0,0,0,0.45)] backdrop-blur overflow-hidden">
            <h3 className="px-4 py-3 text-base font-semibold text-foreground border-b border-highlight/10" style={{ fontFamily: "var(--font-body)" }}>Rate your delivery</h3>
            <div className="px-4 py-4">
              {hasRated ? (
                <div className="flex flex-col items-center py-4 gap-2">
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(n => (
                      <Star key={n} className={`h-6 w-6 ${n <= deliveryRating ? 'text-highlight-soft fill-current' : 'text-gray-200 fill-current'}`} />
                    ))}
                  </div>
                  <p className="text-sm font-medium text-foreground/80">Rating submitted!</p>
                  <p className="text-xs text-muted-foreground/70">Thank you for your feedback</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-3">How was your delivery experience?</p>
                  <div className="flex items-center gap-2 mb-3">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onClick={() => setDeliveryRating(n)}>
                        <Star className={`h-8 w-8 transition-colors ${n <= deliveryRating ? 'text-highlight-soft fill-current' : 'text-gray-200 fill-current hover:text-highlight-soft'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={ratingComment}
                    onChange={e => setRatingComment(e.target.value)}
                    placeholder="Leave a comment (optional)"
                    rows={2}
                    className="w-full text-sm border border-foreground/[0.08] rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 mb-3"
                  />
                  <button
                    onClick={submitDeliveryRating}
                    disabled={submittingRating || deliveryRating === 0}
                    className="w-full py-2.5 bg-primary text-white text-sm font-semibold rounded-[10px] hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submittingRating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Submit Rating
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Write a Review - for all delivered orders */}
        {order.status === 'delivered' && (
          <div className="bg-white/92 rounded-[24px] border border-highlight/12 shadow-[0_22px_55px_-40px_rgba(0,0,0,0.45)] backdrop-blur overflow-hidden">
            <h3 className="px-4 py-3 text-base font-semibold text-foreground border-b border-highlight/10" style={{ fontFamily: "var(--font-body)" }}>Rate the product</h3>
            <div className="px-4 py-4">
              {checkingReview ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-highlight" />
                </div>
              ) : hasReviewedProduct ? (
                <div className="flex flex-col items-center py-4 gap-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  <p className="text-sm font-medium text-foreground/80">Review submitted!</p>
                  <p className="text-xs text-muted-foreground/70">Thank you for sharing your experience</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center gap-3">
                    {order.items[0]?.image && (
                      <SmartImage src={order.items[0].image} alt={order.items[0].name} className="h-10 w-10 rounded-lg object-cover" preset="thumb" />
                    )}
                    <p className="text-sm text-muted-foreground">Share your experience with {order.items[0]?.name || 'this product'}</p>
                  </div>
                  <button
                    onClick={() => navigate('/write-review', {
                      state: {
                        productId: order.items[0]?.productId,
                        productName: order.items[0]?.name,
                        productImage: order.items[0]?.image,
                      }
                    })}
                    className="w-full py-2.5 bg-primary text-white text-sm font-semibold rounded-[10px] hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
                  >
                    <Star className="h-4 w-4" />
                    Write a Review
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Price Details Section */}        <div className="bg-card mt-2 border-t border-b border-foreground/[0.06]">
          <h3 className="px-4 py-3 text-base font-semibold text-foreground border-b border-foreground/[0.06]" style={{ fontFamily: "var(--font-body)" }}>Price details</h3>
          
          <div className="px-4 py-3 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Selling price</span>
              <span className="text-foreground">₹{order.subtotal.toLocaleString()}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-green-700 dark:text-green-500">Discount</span>
                <span className="text-green-700 dark:text-green-500">-₹{order.discount.toLocaleString()}</span>
              </div>
            )}
            {rewardsRows.map(([label, amount]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-green-700 dark:text-green-500">{label}</span>
                <span className="text-green-700 dark:text-green-500">-₹{amount.toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total fees</span>
              <span className="text-foreground">₹{totalFees.toLocaleString()}</span>
            </div>
            <div className="pt-3 border-t border-foreground/[0.08] flex justify-between">
              <span className="text-base font-semibold text-primary">Total amount</span>
              <span className="text-base font-bold text-foreground">₹{order.total.toLocaleString()}</span>
            </div>
            {pointsEarnedNote && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Coins className="mt-px h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden="true" />
                <span>{pointsEarnedNote}</span>
              </p>
            )}
          </div>
        </div>

        {/* Share Order Details */}
        <div className="bg-card mt-2 px-4 py-3 border-t border-foreground/[0.06]">
          <button 
            onClick={() => setShowShareMenu(true)}
            className="w-full flex items-center justify-between text-sm text-foreground/80 font-medium py-2"
          >
            <div className="flex items-center gap-3">
              <Share2 className="w-5 h-5 text-muted-foreground" />
              <span>Share Order Details</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/70" />
          </button>
        </div>

        {/* Download Invoice */}
        <div className="bg-card px-4 py-3 border-b border-foreground/[0.06]">
          <button 
            onClick={() => downloadInvoice()}
            disabled={isDownloadingInvoice}
            className="w-full flex items-center justify-between text-sm text-foreground/80 font-medium py-2 disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-muted-foreground" />
              <div className="text-left">
                <span className="block">Download Invoice</span>
                <span className="text-xs text-muted-foreground/70">Order ID: {order.orderId}</span>
              </div>
            </div>
            {isDownloadingInvoice ? (
              <Loader2 className="w-4 h-4 text-muted-foreground/70 animate-spin" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground/70" />
            )}
          </button>
        </div>

      </div>

      {/* Hidden Receipt Component for Image Generation */}
      {order && (
        <div style={{ 
          position: 'fixed', 
          left: 0, 
          top: 0, 
          zIndex: -9999,
          opacity: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}>
          <div
            ref={receiptRef}
            style={{
              width: '380px',
              padding: '24px',
              backgroundColor: '#ffffff',
              fontFamily: "var(--font-body)",
            }}
          >
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #A4532C', paddingBottom: '16px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#A4532C', margin: 0 }}>ISHAPUTRA BOTANICALS</h1>
              <p style={{ fontSize: '11px', color: '#6b7280', margin: '4px 0 0 0' }}>{BRAND.tagline}</p>
            </div>

            {/* Receipt Title */}
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', margin: 0 }}>ORDER RECEIPT</h2>
            </div>

            {/* Order Info */}
            <div style={{ backgroundColor: '#fff7ed', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Order ID:</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937' }}>ORD-{order.orderId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Date:</span>
                <span style={{ fontSize: '12px', color: '#1f2937' }}>{formatDate(order.createdAt)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Status:</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#f97316' }}>{getStatusLabel(order.status)}</span>
              </div>
            </div>

            {/* Items */}
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937', marginBottom: '10px', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>Items Ordered</h3>
              {order.items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', paddingBottom: '10px', borderBottom: idx < order.items.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '12px', fontWeight: '500', color: '#1f2937', margin: 0 }}>{item.name}</p>
                    <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0 0' }}>Qty: {item.quantity} × ₹{item.price.toLocaleString('en-IN')}</p>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937' }}>₹{(item.quantity * item.price).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>

            {/* Price Details */}
            <div style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937', marginBottom: '10px' }}>Price Details</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Selling Price</span>
                <span style={{ fontSize: '12px', color: '#1f2937' }}>₹{order.subtotal.toLocaleString('en-IN')}</span>
              </div>
              {order.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#16a34a' }}>Discount</span>
                  <span style={{ fontSize: '12px', color: '#16a34a' }}>-₹{order.discount.toLocaleString('en-IN')}</span>
                </div>
              )}
              {rewardsRows.map(([label, amount]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#16a34a' }}>{label}</span>
                  <span style={{ fontSize: '12px', color: '#16a34a' }}>-₹{amount.toLocaleString('en-IN')}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Total Fees</span>
                <span style={{ fontSize: '12px', color: '#1f2937' }}>₹{totalFees.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '2px solid #f97316' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#f97316' }}>Total Amount</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#1f2937' }}>₹{order.total.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Payment & Delivery */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Payment:</span>
                <span style={{ fontSize: '12px', fontWeight: '500', color: '#1f2937' }}>{formatPaymentMethod(order.paymentMethod)}</span>
              </div>
              <div style={{ marginTop: '10px' }}>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px 0' }}>Delivery Address:</p>
                <p style={{ fontSize: '12px', color: '#1f2937', margin: 0, lineHeight: '1.4' }}>
                  {order.shippingAddress.fullName}<br />
                  {order.shippingAddress.address}<br />
                  {order.shippingAddress.city}, {order.shippingAddress.state}<br />
                  PIN: {order.shippingAddress.pincode}<br />
                  Mobile: {order.shippingAddress.mobile}
                </p>
              </div>
            </div>

            {/* Tracking Info */}
            {(order.trackingId || order.carrier) && (
              <div style={{ backgroundColor: '#eff6ff', padding: '10px', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#1d4ed8', marginBottom: '6px' }}>Tracking Information</p>
                {order.trackingId && <p style={{ fontSize: '11px', color: '#4b5563', margin: '0 0 4px 0' }}>ID: {order.trackingId}</p>}
                {order.carrier && <p style={{ fontSize: '11px', color: '#4b5563', margin: 0 }}>Carrier: {order.carrier}</p>}
              </div>
            )}

            {/* Footer */}
            <div style={{ textAlign: 'center', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              <p style={{ fontSize: '12px', fontWeight: '500', color: '#1f2937', margin: '0 0 4px 0' }}>Thank you for shopping with us! 🎉</p>
              <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 8px 0' }}>For support: {BRAND.phones[0] || BRAND.email}</p>
              <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>{SITE_HOST}</p>
            </div>
          </div>
        </div>
      )}

      {/* Share Menu Modal */}
      <AnimatePresence>
        {showShareMenu && order && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[60] flex items-end"
            onClick={() => setShowShareMenu(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="bg-card w-full rounded-t-[var(--radius-panel)] p-6 pb-8"
              style={{ fontFamily: "var(--font-body)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-foreground">Share Order Details</h3>
                <button
                  onClick={() => setShowShareMenu(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-foreground/[0.06]"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Generating Image Indicator */}
              {isGeneratingImage && (
                <div className="flex items-center justify-center py-4 mb-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mr-3"></div>
                  <span className="text-sm text-muted-foreground">Generating receipt image...</span>
                </div>
              )}

              {/* Share Options Grid */}
              <div className="grid grid-cols-4 gap-4">
                {/* WhatsApp */}
                <button
                  onClick={() => shareReceiptImage('whatsapp')}
                  disabled={isGeneratingImage}
                  className="flex flex-col items-center gap-2 disabled:opacity-50"
                >
                  <div className="w-14 h-14 bg-green-100 rounded-[var(--radius-card)] flex items-center justify-center">
                    <MessageCircle className="w-7 h-7 text-green-600" />
                  </div>
                  <span className="text-xs text-foreground/80">WhatsApp</span>
                </button>

                {/* Gmail */}
                <button
                  onClick={() => shareReceiptImage('email')}
                  disabled={isGeneratingImage}
                  className="flex flex-col items-center gap-2 disabled:opacity-50"
                >
                  <div className="w-14 h-14 bg-red-100 rounded-[var(--radius-card)] flex items-center justify-center">
                    <Mail className="w-7 h-7 text-red-600" />
                  </div>
                  <span className="text-xs text-foreground/80">Gmail</span>
                </button>

                {/* Instagram */}
                <button
                  onClick={() => shareReceiptImage('native')}
                  disabled={isGeneratingImage}
                  className="flex flex-col items-center gap-2 disabled:opacity-50"
                >
                  <div className="w-14 h-14 bg-pink-100 rounded-[var(--radius-card)] flex items-center justify-center">
                    <Share2 className="w-7 h-7 text-pink-600" />
                  </div>
                  <span className="text-xs text-foreground/80">Instagram</span>
                </button>

                {/* Download Image */}
                <button
                  onClick={() => shareReceiptImage('download')}
                  disabled={isGeneratingImage}
                  className="flex flex-col items-center gap-2 disabled:opacity-50"
                >
                  <div className="w-14 h-14 bg-foreground/[0.06] rounded-[var(--radius-card)] flex items-center justify-center">
                    <Download className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <span className="text-xs text-foreground/80">Save</span>
                </button>

                {/* Facebook Messenger */}
                <button
                  onClick={() => shareReceiptImage('native')}
                  disabled={isGeneratingImage}
                  className="flex flex-col items-center gap-2 disabled:opacity-50"
                >
                  <div className="w-14 h-14 bg-blue-100 rounded-[var(--radius-card)] flex items-center justify-center">
                    <MessageCircle className="w-7 h-7 text-primary" />
                  </div>
                  <span className="text-xs text-foreground/80">Messenger</span>
                </button>

                {/* SMS */}
                <button
                  onClick={() => shareReceiptImage('native')}
                  disabled={isGeneratingImage}
                  className="flex flex-col items-center gap-2 disabled:opacity-50"
                >
                  <div className="w-14 h-14 bg-green-100 rounded-[var(--radius-card)] flex items-center justify-center">
                    <MessageCircle className="w-7 h-7 text-green-700" />
                  </div>
                  <span className="text-xs text-foreground/80">SMS</span>
                </button>

                {/* Telegram */}
                <button
                  onClick={() => shareReceiptImage('native')}
                  disabled={isGeneratingImage}
                  className="flex flex-col items-center gap-2 disabled:opacity-50"
                >
                  <div className="w-14 h-14 bg-sky-100 rounded-[var(--radius-card)] flex items-center justify-center">
                    <Share2 className="w-7 h-7 text-sky-600" />
                  </div>
                  <span className="text-xs text-foreground/80">Telegram</span>
                </button>

                {/* More (Native Share) */}
                <button
                  onClick={() => shareReceiptImage('native')}
                  disabled={isGeneratingImage}
                  className="flex flex-col items-center gap-2 disabled:opacity-50"
                >
                  <div className="w-14 h-14 bg-foreground/[0.06] rounded-[var(--radius-card)] flex items-center justify-center">
                    <Share2 className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <span className="text-xs text-foreground/80">More</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Return Request Modal - Full Page */}
      <AnimatePresence>
        {showReturnModal && order && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 bg-card z-[99999] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-foreground/[0.06]">
              <button
                onClick={() => {
                  if (returnStep === 'details') {
                    setReturnStep('reason');
                  } else {
                    setShowReturnModal(false);
                    setReturnReason('');
                    setCustomReturnReason('');
                    setReturnStep('reason');
                  }
                }}
                className="w-8 h-8 flex items-center justify-center"
              >
                <ArrowLeft className="w-5 h-5 text-foreground/80" />
              </button>
              <h3 className="text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-body)" }}>Request Return</h3>
            </div>

            {/* Return Reasons Grid - Step 1 */}
            {returnStep === 'reason' && (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-4">
              
              {/* Product Info */}
              <div className="mb-4">
                <div className="flex gap-3">
                  <div className="w-16 h-16 bg-foreground/[0.06] rounded-lg overflow-hidden flex-shrink-0">
                    <SmartImage 
                      src={order.items[0]?.image} 
                      alt={order.items[0]?.name}
                      className="w-full h-full object-cover" preset="thumb" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-foreground line-clamp-2" style={{ fontFamily: "var(--font-body)" }}>
                      {order.items[0]?.name}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
                      Quantity: {order.items[0]?.quantity}
                    </p>
                    <p className="text-base font-bold text-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
                      ₹{order.items[0]?.price?.toLocaleString()}
                    </p>
                  </div>
                </div>
                {order.items.length > 1 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center" style={{ fontFamily: "var(--font-body)" }}>
                    +{order.items.length - 1} more items will be included in this return
                  </p>
                )}
              </div>

              <h4 className="text-base font-semibold text-foreground mb-4" style={{ fontFamily: "var(--font-body)" }}>Reason for return</h4>
              
              <div className="grid grid-cols-2 gap-3">
                {[
                  { 
                    reason: 'Quality not as expected', 
                    image: 'https://i.ibb.co/4R89tnfN/IMG-20260303-223842.webp',
                    description: 'Quality of the product not as expected'
                  },
                  { 
                    reason: 'Received wrong item', 
                    image: 'https://i.ibb.co/n8gYFKdG/IMG-20260303-223851.webp',
                    description: 'Received wrong item'
                  },
                  { 
                    reason: "Don't want anymore", 
                    image: 'https://i.ibb.co/Gv310qKb/IMG-20260303-223900.webp',
                    description: "Don't want the product anymore"
                  },
                  { 
                    reason: 'Missing in package', 
                    image: 'https://i.ibb.co/BSzmq7H/IMG-20260303-223908.webp',
                    description: 'Product is missing in the package'
                  },
                  { 
                    reason: 'Damaged/Broken item', 
                    image: 'https://i.ibb.co/XxBg8Bcy/IMG-20260303-223921.webp',
                    description: 'Received a broken/damaged item'
                  },
                  { 
                    reason: "Size/Fit issue", 
                    image: 'https://i.ibb.co/yndkCNM1/IMG-20260303-223832.webp',
                    description: "Don't like the size/fit of the product"
                  },
                ].map((item) => (
                  <button
                    key={item.reason}
                    onClick={() => {
                      setReturnReason(item.reason);
                      setCustomReturnReason('');
                    }}
                    className={`flex flex-col items-center p-4 rounded-[10px] border-2 transition-all ${
                      returnReason === item.reason
                        ? 'border-gray-900 bg-foreground/[0.03]'
                        : 'border-foreground/[0.08] bg-card hover:border-foreground/25'
                    }`}
                  >
                    <SmartImage src={item.image} alt={item.description} className="w-16 h-16 mb-2 object-contain dark:brightness-75 dark:opacity-80" preset="thumb" />
                    <span className={`text-xs text-center leading-tight ${
                      returnReason === item.reason ? 'text-foreground font-medium' : 'text-muted-foreground'
                    }`} style={{ fontFamily: "var(--font-body)" }}>
                      {item.description}
                    </span>
                  </button>
                ))}
              </div>

              {/* Other Reason Option */}
              <button
                onClick={() => setReturnReason('Other reason')}
                className={`w-full mt-3 p-4 rounded-[10px] border-2 transition-all flex items-center gap-3 ${
                  returnReason === 'Other reason'
                    ? 'border-gray-900 bg-foreground/[0.03]'
                    : 'border-foreground/[0.08] bg-card hover:border-foreground/25'
                }`}
              >
                <span className="text-2xl">✏️</span>
                <span className={`text-sm ${
                  returnReason === 'Other reason' ? 'text-foreground font-medium' : 'text-muted-foreground'
                }`} style={{ fontFamily: "var(--font-body)" }}>
                  Other reason
                </span>
              </button>

              {/* Custom Reason Input - Shows when "Other reason" is selected */}
              {returnReason === 'Other reason' && (
                <div className="mt-3">
                  <textarea
                    value={customReturnReason}
                    onChange={(e) => setCustomReturnReason(e.target.value)}
                    placeholder="Please describe your reason for return..."
                    rows={4}
                    maxLength={200}
                    className="w-full px-4 py-3 border-2 border-foreground/15 rounded-[10px] focus:outline-none focus:border-gray-900 bg-foreground/[0.03] text-foreground placeholder-gray-500 resize-none"
                    style={{ fontFamily: "var(--font-body)" }}
                    autoFocus
                  />
                  <p className="text-xs text-foreground/80 mt-1 ml-1" style={{ fontFamily: "var(--font-body)" }}>
                    {customReturnReason.length}/200 characters
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Button - Step 1 */}
            <div className="px-4 py-4 border-t border-foreground/[0.06] bg-card">
              <button
                onClick={() => setReturnStep('details')}
                disabled={!returnReason || (returnReason === 'Other reason' && !customReturnReason.trim())}
                className={`w-full py-4 rounded-full font-semibold text-base transition-all ${
                  !returnReason || (returnReason === 'Other reason' && !customReturnReason.trim())
                    ? 'bg-foreground/[0.06] text-muted-foreground/70 cursor-not-allowed'
                    : 'bg-gray-900 dark:bg-zinc-100 text-white hover:bg-gray-800 dark:bg-zinc-100'
                }`}
                style={{ fontFamily: "var(--font-body)" }}
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
                  <div className="px-4 py-6 space-y-6">
                    {/* Product Info */}
                    <div>
                      <div className="flex gap-3">
                        <div className="w-16 h-16 bg-foreground/[0.06] rounded-lg overflow-hidden flex-shrink-0">
                          <SmartImage 
                            src={order.items[0]?.image} 
                            alt={order.items[0]?.name}
                            className="w-full h-full object-cover" preset="thumb" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-foreground line-clamp-2" style={{ fontFamily: "var(--font-body)" }}>
                            {order.items[0]?.name}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
                            Quantity: {order.items[0]?.quantity}
                          </p>
                          <p className="text-base font-bold text-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
                            ₹{order.items[0]?.price?.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      {order.items.length > 1 && (
                        <p className="text-xs text-muted-foreground mt-2 text-center" style={{ fontFamily: "var(--font-body)" }}>
                          +{order.items.length - 1} more items will be included in this return
                        </p>
                      )}
                    </div>

                    <div className="h-px bg-foreground/10" />

                    {/* Replacement Info */}
                    <div>
                      <h4 className="text-base font-medium text-foreground mb-3" style={{ fontFamily: "var(--font-body)" }}>
                        Return Type
                      </h4>
                      <div className="p-4 bg-primary/5 rounded-lg border-2 border-primary/25">
                        <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                          Product Replacement
                        </p>
                        <p className="text-xs text-muted-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
                          Your product will be replaced with the same item after quality check
                        </p>
                      </div>
                    </div>

                    <div className="h-px bg-foreground/10" />

                    {/* Pick up and delivery */}
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-3" style={{ fontFamily: "var(--font-body)" }}>
                        Pick up and delivery
                      </h4>
                      <div className="p-4 bg-foreground/[0.03] rounded-lg">
                        <p className="text-sm font-medium text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                          {order.shippingAddress?.fullName || 'N/A'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
                          📱 {order.shippingAddress?.mobile || 'N/A'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
                          {order.shippingAddress?.address}, { order.shippingAddress?.locality && `${order.shippingAddress.locality}, `}{order.shippingAddress?.city}, {order.shippingAddress?.state} - {order.shippingAddress?.pincode}
                        </p>
                        {order.shippingAddress?.landmark && (
                          <p className="text-xs text-muted-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
                            Landmark: {order.shippingAddress.landmark}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Button - Step 2 */}
                <div className="px-4 py-4 border-t border-foreground/[0.06] bg-card">
                  <button
                    onClick={handleRequestReturn}
                    disabled={isSubmitting}
                    className={`w-full py-4 rounded-full font-semibold text-base transition-all ${
                      isSubmitting
                        ? 'bg-foreground/[0.06] text-muted-foreground/70 cursor-not-allowed'
                        : 'bg-gray-900 dark:bg-zinc-100 text-white hover:bg-gray-800 dark:bg-zinc-100'
                    }`}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Return Request'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <Footer />
      {/* Mobile bottom navigation — ensures the side menu is reachable on phones */}
      <div className="lg:hidden">
        <MobileBottomNav />
      </div>
    </div>
  );
};

export default OrderDetailsPage;
