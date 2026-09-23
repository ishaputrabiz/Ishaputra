import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToUserOrders, Order } from '@/services/orderService';
import Header from '@/components/Header';
import MobileHeader from '@/components/MobileHeader';
import MobileSearchBar from '@/components/MobileSearchBar';
import MobileBottomNav from '@/components/MobileBottomNav';
import CategoryIconNav from '@/components/CategoryIconNav';
import Footer from '@/components/Footer';
import {
  Loader2,
  Package,
  ArrowLeft,
  Truck,
  Clock,
  CheckCircle2,
  XCircle,
  MapPin,
  RotateCcw as ReturnIcon,
} from 'lucide-react';
import { SmartImage } from "@/components/ui/smart-image";

const MobileOrders = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile } = useAuth();
  const [selectedOrderTab, setSelectedOrderTab] = useState('current');
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Subscribe to user orders
  useEffect(() => {
    if (!user) return;

    console.log('Setting up order subscription for user:', user.uid);
    setOrdersLoading(true);
    
    const unsubscribe = subscribeToUserOrders(
      user.uid,
      (fetchedOrders) => {
        console.log('📦 [MobileOrders] Real-time update received!');
        console.log('📦 [MobileOrders] Number of orders:', fetchedOrders.length);
        console.log('📦 [MobileOrders] Order details:', fetchedOrders.map(o => ({
          id: o.id,
          status: o.status,
          trackingId: o.trackingId,
          lastUpdated: o.lastUpdated
        })));
        setOrders(fetchedOrders);
        setOrdersLoading(false);
      },
      (error) => {
        console.error('Error fetching orders:', error);
        setOrdersLoading(false);
      }
    );

    return () => {
      console.log('Cleaning up order subscription');
      unsubscribe();
    };
  }, [user]);

  // Filter orders based on tab
  const filteredOrders = selectedOrderTab === 'current'
    ? orders.filter(order => ['pending', 'processing', 'packed', 'shipped', 'assigned', 'outForDelivery', 'picked'].includes(order.status))
    : orders;

  // Format price
  const formatPrice = (price: number) => {
    return `₹${price.toLocaleString('en-IN')}`;
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

  // Get status badge class - sophisticated palette
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20';
      case 'processing': return 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20';
      case 'packed':
      case 'shipped':
      case 'assigned': return 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20';
      case 'outForDelivery':
      case 'picked': return 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20';
      case 'delivered': return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20';
      case 'cancelled': return 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20';
      case 'returnRequested': return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20';
      case 'returnScheduled': return 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20';
      case 'returned': return 'bg-gray-50 dark:bg-gray-500/10 text-gray-700 dark:text-gray-400 dark:text-zinc-500 border border-gray-200 dark:border-gray-500/20';
      case 'refunded': return 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20';
      default: return 'bg-gray-50 dark:bg-gray-500/10 text-gray-700 dark:text-gray-400 dark:text-zinc-500 border border-gray-200 dark:border-gray-500/20';
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-3.5 h-3.5" />;
      case 'processing': return <Package className="w-3.5 h-3.5" />;
      case 'packed':
      case 'shipped':
      case 'assigned': return <Truck className="w-3.5 h-3.5" />;
      case 'outForDelivery':
      case 'picked': return <MapPin className="w-3.5 h-3.5" />;
      case 'delivered': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'cancelled': return <XCircle className="w-3.5 h-3.5" />;
      case 'returnRequested': return <ReturnIcon className="w-3.5 h-3.5" />;
      case 'returnScheduled': return <ReturnIcon className="w-3.5 h-3.5" />;
      case 'returned': return <ReturnIcon className="w-3.5 h-3.5" />;
      case 'refunded': return <CheckCircle2 className="w-3.5 h-3.5" />;
      default: return <Package className="w-3.5 h-3.5" />;
    }
  };

  // Get status label
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'processing': return 'Processing';
      case 'packed':
      case 'shipped':
      case 'assigned': return 'Packed';
      case 'outForDelivery':
      case 'picked': return 'Out for Delivery';
      case 'delivered': return 'Delivered';
      case 'cancelled': return 'Cancelled';
      case 'returnRequested': return 'Return Requested';
      case 'returnScheduled': return 'Return Scheduled';
      case 'returned': return 'Returned';
      case 'refunded': return 'Refunded';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

    return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(212,175,55,0.05)_0%,rgba(255,255,255,1)_20%),linear-gradient(135deg,rgba(131,39,41,0.03)_0%,rgba(255,255,255,1)_55%)] pb-20 dark:bg-[linear-gradient(180deg,rgba(19,17,15,0.98)_0%,rgba(14,14,15,0.98)_100%)]" style={{ fontFamily: "'Poppins', sans-serif" }}>
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
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <div className="rounded-[28px] border border-[#d4af37]/15 bg-white/88 px-4 py-4 shadow-[0_30px_80px_-60px_rgba(0,0,0,0.5)] backdrop-blur dark:border-[#d4af37]/20 dark:bg-zinc-900/88 dark:shadow-[0_30px_80px_-60px_rgba(0,0,0,0.88)]" style={{ fontFamily: "'Poppins', sans-serif" }}>
          <div className="flex items-center">
            <button
              onClick={() => navigate('/account')}
              className="-ml-2 rounded-full p-2 transition-colors hover:bg-gray-100 dark:bg-zinc-800 dark:hover:bg-zinc-800"
            >
              <ArrowLeft className="w-6 h-6 text-gray-800 dark:text-zinc-200 dark:text-zinc-100" />
            </button>
            <div className="ml-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="h-px w-6 bg-[#d4af37]/50" />
                <span className="text-[10px] uppercase tracking-[0.3em] text-[#832729] font-medium">Orders</span>
              </div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>My Orders</h1>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-500 dark:text-zinc-400">{orders.length} total orders · {orders.filter((o) => ['pending', 'processing', 'packed', 'shipped', 'assigned', 'outForDelivery', 'picked'].includes(o.status)).length} active</p>
            </div>
          </div>
        </div>
      </div>

      {/* Order Tabs */}
      <div className="mx-auto max-w-3xl px-4 pt-4" style={{ fontFamily: "'Poppins', sans-serif" }}>
        <div className="flex gap-2 rounded-2xl border border-[#d4af37]/12 bg-white/85 dark:bg-zinc-900/85 p-1 shadow-[0_20px_45px_-36px_rgba(0,0,0,0.45)] dark:border-[#d4af37]/18 dark:bg-zinc-900/82 dark:shadow-[0_20px_45px_-36px_rgba(0,0,0,0.88)]">
          <button
            onClick={() => setSelectedOrderTab('current')}
            className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors ${
              selectedOrderTab === 'current'
                ? 'bg-[#fff6e6] text-[#832729] shadow-sm dark:bg-amber-950/30 dark:text-amber-200'
                : 'text-gray-600 dark:text-zinc-400'
            }`}
          >
            Current
          </button>
          <button
            onClick={() => setSelectedOrderTab('all')}
            className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors ${
              selectedOrderTab === 'all'
                ? 'bg-[#fff6e6] text-[#832729] shadow-sm dark:bg-amber-950/30 dark:text-amber-200'
                : 'text-gray-600 dark:text-zinc-400'
            }`}
          >
            All orders
          </button>
        </div>
      </div>

      {/* Orders List */}
      <div className="mx-auto max-w-3xl p-4 space-y-4" style={{ fontFamily: "'Poppins', sans-serif" }}>
        {ordersLoading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-[28px] border border-[#d4af37]/12 bg-white/88 px-5 py-12 text-center shadow-[0_30px_80px_-60px_rgba(0,0,0,0.45)] dark:border-[#d4af37]/18 dark:bg-zinc-900/88 dark:shadow-[0_30px_80px_-60px_rgba(0,0,0,0.88)]">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-[linear-gradient(135deg,rgba(212,175,55,0.18)_0%,rgba(131,39,41,0.08)_100%)]">
              <Package className="w-8 h-8 text-[#832729]" />
            </div>
            <h3 className="mb-1 text-base font-semibold text-gray-800 dark:text-zinc-200 dark:text-zinc-100">No orders yet!</h3>
            <p className="mb-6 text-sm text-gray-500 dark:text-zinc-500 dark:text-zinc-400">
              {selectedOrderTab === 'current' ? 'Your bag is waiting — explore our silver collection!' : 'Discover stunning silver jewellery crafted just for you'}
            </p>
            <button
              onClick={() => navigate('/category/jewellery')}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-gray-900 dark:bg-zinc-100 text-white text-sm font-medium rounded-full hover:bg-gray-800 dark:bg-zinc-100 transition-colors"
            >
              ✨ Start Shopping
            </button>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div 
              key={order.id} 
              className="cursor-pointer rounded-[24px] border border-[#d4af37]/12 bg-white/92 p-3 backdrop-blur transition-all hover:shadow-[0_22px_55px_-40px_rgba(0,0,0,0.45)] dark:border-[#d4af37]/18 dark:bg-zinc-900/92 dark:shadow-[0_22px_55px_-40px_rgba(0,0,0,0.85)]"
              onClick={() => {
                navigate(`/account/orders/${order.id}`);
              }}
            >
              {/* Order Items Display */}
              <div className="space-y-3">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-[#d4af37]/10 bg-gray-50 dark:bg-zinc-900 dark:bg-zinc-800/70">
                      <SmartImage src={item.image} alt={item.name} className="w-full h-full object-cover" preset="thumb" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="mb-1 text-sm font-semibold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>{item.name}</h4>
                      <p className="text-xs text-gray-600 dark:text-zinc-400 dark:text-zinc-300">Price: {formatPrice(item.price)}</p>
                      <p className="text-xs text-gray-600 dark:text-zinc-400 dark:text-zinc-300">Quantity: {item.quantity}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${getStatusBadgeClass(order.status)}`}>
                          {getStatusIcon(order.status)}
                          {getStatusLabel(order.status)}
                        </span>
                      </div>
                      <span className="mt-1 block text-xs text-gray-500 dark:text-zinc-500 dark:text-zinc-400">{formatDate(order.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* OTP Display for Out for Delivery Orders */}
              {order.status === 'outForDelivery' && order.delivery_otp && (
                <div className="mt-3 pt-3 border-t border-[#d4af37]/12">
                  <p className="text-xs font-semibold text-gray-900 dark:text-zinc-100">Delivery OTP</p>
                  <p className="mt-0.5 text-xs text-gray-600 dark:text-zinc-400 dark:text-zinc-300">Share this OTP with your delivery partner</p>
                  <p className="mt-1 text-sm font-bold text-gray-900 dark:text-zinc-100">{order.delivery_otp}</p>
                </div>
              )}

              {/* Refund receipt link */}
              {order.status === 'refunded' && order.refundReceiptUrl && (
                <div className="mt-3 pt-3 border-t border-[#d4af37]/12">
                  <a
                    href={order.refundReceiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                  >
                    View Receipt
                  </a>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-[#d4af37]/12 pt-3 text-xs text-gray-500 dark:text-zinc-500 dark:text-zinc-400">
                <span>Order #{order.id.slice(-6).toUpperCase()}</span>
                <span className="inline-flex items-center gap-1 font-medium text-[#832729]">
                  View details <ArrowLeft className="w-3 h-3 rotate-180" />
                </span>
              </div>
            </div>
          ))
        )}
      </div>
      <Footer />
      <MobileBottomNav />
    </div>
  );
};

// Order Status Stepper Component
const OrderStatusStepper = ({ status }: { status: string }) => {
  // Check if this is a return flow
  const isReturnFlow = ['returnRequested', 'returnScheduled', 'returned'].includes(status);
  
  // Normal order steps
  const orderSteps = [
    { key: 'pending', label: 'Order\nPlaced' },
    { key: 'processing', label: 'Processing' },
    { key: 'packed', label: 'Packed' },
    { key: 'outForDelivery', label: 'Out for\nDelivery' },
    { key: 'delivered', label: 'Delivered' },
  ];

  // Return flow steps
  const returnSteps = [
    { key: 'returnRequested', label: 'Return\nRequested' },
    { key: 'returnScheduled', label: 'Return\nScheduled' },
    { key: 'returned', label: 'Picked Up' },
  ];

  const steps = isReturnFlow ? returnSteps : orderSteps;

  const getStepIndex = (currentStatus: string) => {
    const index = steps.findIndex(s => s.key === currentStatus);
    return index >= 0 ? index : 0;
  };

  const currentIndex = getStepIndex(status);
  const isCancelled = status === 'cancelled';

  // For return flow, use emerald color scheme
  const activeColor = isReturnFlow ? 'bg-emerald-500' : 'bg-blue-500';
  const activeBorder = isReturnFlow ? 'border-emerald-500' : 'border-blue-500';
  const activeText = isReturnFlow ? 'text-emerald-600' : 'text-blue-600';
  const activeDot = isReturnFlow ? 'bg-emerald-500' : 'bg-blue-500';

  return (
    <div className="flex items-start justify-between relative" style={{ fontFamily: "'Poppins', sans-serif" }}>
      {/* Progress Line Background */}
      <div className="absolute top-4 left-6 right-6 h-0.5 bg-gray-200 dark:bg-zinc-800 dark:bg-zinc-700 z-0" />
      
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
          <div key={step.key} className="flex flex-col items-center relative z-10" style={{ width: `${100 / steps.length}%`, fontFamily: "'Poppins', sans-serif" }}>
            {/* Step Circle */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
              isCancelled 
                ? 'bg-gray-100 dark:bg-zinc-800 border-gray-300 dark:border-zinc-700'
                : isCompleted 
                  ? `${activeColor} ${activeBorder}` 
                  : 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700'
            }`}>
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-white" />
              ) : (
                <div className={`w-2 h-2 rounded-full ${isCurrent ? activeDot : 'bg-gray-300'}`} />
              )}
            </div>
            
            {/* Step Label */}
            <p className={`text-[10px] text-center mt-2 leading-tight whitespace-pre-line ${
              isCompleted ? `${activeText} font-medium` : 'text-gray-400 dark:text-zinc-500'
            }`}>
              {step.label}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default MobileOrders;
