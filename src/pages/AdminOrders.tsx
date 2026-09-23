import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  Loader2, 
  Search, 
  Filter,
  ChevronDown,
  Trash2,
  RefreshCw,
  X,
  Truck,
  MapPin,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  UserPlus,
  Phone,
  User,
  RotateCcw as ReturnIcon,
  AlertCircle,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  subscribeToAllOrders, 
  Order, 
  updateOrderStatus,
  updateOrderTracking,
  TrackingUpdate,
  deleteOrder,
  assignOrderToDeliveryBoy,
  approveReturn,
  rejectReturn,
} from '@/services/orderService';
import { subscribeToDeliveryBoys, DeliveryBoy } from '@/services/deliveryBoyService';
import { toast } from 'sonner';
import { SmartImage } from "@/components/ui/smart-image";

const AdminOrders = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Order['status']>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [showTrackingDrawer, setShowTrackingDrawer] = useState(false);
  const [trackingUpdating, setTrackingUpdating] = useState(false);
  const [trackingForm, setTrackingForm] = useState({
    status: 'pending' as Order['status'],
    trackingUrl: '',
    note: '',
  });
  // Delivery Partner Assignment States
  const [deliveryBoys, setDeliveryBoys] = useState<DeliveryBoy[]>([]);
  const [showAssignDrawer, setShowAssignDrawer] = useState(false);
  const [selectedDeliveryBoyId, setSelectedDeliveryBoyId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  useEffect(() => {
    // Check if user is admin
    if (!user) {
      navigate('/');
      return;
    }

    // Subscribe to all orders in real-time
    const unsubscribe = subscribeToAllOrders(
      (fetchedOrders) => {
        setOrders(fetchedOrders);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching orders:', error);
        toast.error('Failed to load orders');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, navigate]);

  // Subscribe to delivery boys
  useEffect(() => {
    const unsubscribe = subscribeToDeliveryBoys(
      (boys) => {
        // Only show active delivery boys
        setDeliveryBoys(boys.filter(b => b.isActive));
      },
      (error) => {
        console.error('Error fetching delivery boys:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter orders based on search and status
  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.userEmail.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleStatusChange = async (orderId: string, newStatus: Order['status']) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      toast.success(`Order status updated to ${newStatus}`);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  };

  const openTrackingDrawer = (order: Order) => {
    setSelectedOrder(order);
    setTrackingForm({
      status: order.status,
      trackingUrl: order.trackingUrl || '',
      note: '',
    });
    setShowTrackingDrawer(true);
  };

  const handleTrackingUpdate = async () => {
    if (!selectedOrder) return;
    
    setTrackingUpdating(true);
    try {
      const trackingData: TrackingUpdate = {
        status: trackingForm.status,
        trackingUrl: trackingForm.trackingUrl || undefined,
        note: trackingForm.note || undefined,
      };
      
      await updateOrderTracking(selectedOrder.id, trackingData);
      
      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <div>
            <p className="font-semibold">Tracking Updated Successfully</p>
            <p className="text-sm text-gray-500">Order #{selectedOrder.orderId} - {trackingForm.status}</p>
          </div>
        </div>,
        { duration: 4000 }
      );
      
      setShowTrackingDrawer(false);
    } catch (error) {
      console.error('Error updating tracking:', error);
      toast.error('Failed to update tracking information');
    } finally {
      setTrackingUpdating(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('Are you sure you want to delete this order?')) return;

    try {
      await deleteOrder(orderId);
      toast.success('Order deleted successfully');
    } catch (error) {
      console.error('Error deleting order:', error);
      toast.error('Failed to delete order');
    }
  };

  // Open assign partner drawer
  const openAssignDrawer = (order: Order) => {
    setSelectedOrder(order);
    setSelectedDeliveryBoyId(order.delivery_boy_id || '');
    setShowAssignDrawer(true);
  };

  // Handle assign partner
  const handleAssignPartner = async () => {
    if (!selectedOrder || !selectedDeliveryBoyId) {
      toast.error('Please select a delivery partner');
      return;
    }

    const selectedPartner = deliveryBoys.find(b => b.id === selectedDeliveryBoyId);
    if (!selectedPartner) {
      toast.error('Invalid delivery partner selected');
      return;
    }

    setAssigning(true);
    try {
      await assignOrderToDeliveryBoy(
        selectedOrder.id,
        selectedDeliveryBoyId,
        selectedPartner.name
      );
      // NOTE: assignOrderToDeliveryBoy already sets status → 'outForDelivery'
      // and fires dispatchStatusNotifications internally. Do NOT call
      // updateOrderStatus here — it would send a second notification and
      // revert the status back to 'processing'.

      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <div>
            <p className="font-semibold">Partner Assigned Successfully</p>
            <p className="text-sm text-gray-500">Order #{selectedOrder.orderId} → {selectedPartner.name}</p>
          </div>
        </div>,
        { duration: 4000 }
      );
      
      setShowAssignDrawer(false);
    } catch (error) {
      console.error('Error assigning partner:', error);
      toast.error('Failed to assign delivery partner');
    } finally {
      setAssigning(false);
    }
  };

  const formatPrice = (price: number) => {
    return `₹${price.toFixed(2)}`;
  };

  const formatDate = (timestamp: Order['createdAt'] | Date | string | number | null | undefined) => {
    if (!timestamp) return 'N/A';
    const date = typeof timestamp === 'object' && 'toDate' in timestamp
      ? timestamp.toDate()
      : new Date(timestamp);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${day}\n${month}\n${year}`;
  };

  const getStatusBadgeClass = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'processing':
        return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'packed':
      case 'shipped':
      case 'assigned':
        return 'bg-orange-50 text-orange-700 border border-orange-200';
      case 'outForDelivery':
      case 'picked':
        return 'bg-purple-50 text-purple-700 border border-purple-200';
      case 'delivered':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'cancelled':
        return 'bg-red-50 text-red-700 border border-red-200';
      case 'returnRequested':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'returnScheduled':
        return 'bg-purple-50 text-purple-700 border border-purple-200';
      case 'returned':
        return 'bg-gray-50 text-gray-700 border border-gray-200';
      case 'refunded':
        return 'bg-green-50 text-green-700 border border-green-200';
      default:
        return 'bg-gray-50 text-gray-700 border border-gray-200';
    }
  };

  const getStatusIcon = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'processing':
        return <Package className="w-4 h-4" />;
      case 'packed':
      case 'shipped':
      case 'assigned':
        return <Truck className="w-4 h-4" />;
      case 'outForDelivery':
      case 'picked':
        return <MapPin className="w-4 h-4" />;
      case 'delivered':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4" />;
      case 'returnRequested':
        return <ReturnIcon className="w-4 h-4" />;
      case 'returnScheduled':
        return <ReturnIcon className="w-4 h-4" />;
      case 'returned':
        return <ReturnIcon className="w-4 h-4" />;
      case 'refunded':
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  const getStatusLabel = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'processing':
        return 'Processing';
      case 'packed':
      case 'shipped':
      case 'assigned':
        return 'Packed';
      case 'outForDelivery':
      case 'picked':
        return 'Out for Delivery';
      case 'delivered':
        return 'Delivered';
      case 'cancelled':
        return 'Cancelled';
      case 'returnRequested':
        return 'Return Requested';
      case 'returnScheduled':
        return 'Return Scheduled';
      case 'returned':
        return 'Returned';
      case 'refunded':
        return 'Refunded';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
                <span className="text-3xl font-bold text-gray-900">{orders.length}</span>
              </div>
              <p className="text-gray-500 text-sm mt-1">Real-time order management with live updates</p>
            </div>
            <div className="flex items-center gap-2 text-green-600">
              <RefreshCw className="w-4 h-4" />
              <span className="text-sm font-medium">Live</span>
            </div>
          </div>

          {/* Search and Filter Row */}
          <div className="flex gap-4 mt-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 border-gray-200"
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="h-10 pl-4 pr-10 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
              >
                <option value="all">All Orders</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="packed">Packed</option>
                <option value="outForDelivery">Out for Delivery</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
                <option value="returnRequested">Return Requested</option>
                <option value="returnScheduled">Return Scheduled</option>
                <option value="returned">Returned</option>
                <option value="refunded">Refunded</option>
              </select>
              <Filter className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <ChevronDown className="absolute right-8 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Order Management Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Order Management</h2>
            <p className="text-sm text-gray-500">
              Viewing {filteredOrders.length} of {orders.length} total orders
            </p>
          </div>
          <div className="flex border border-gray-200 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-16 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No orders found</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/admin/orders/${order.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/admin/orders/${order.id}`); }}
                className="group bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-amber-300 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/40"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-900">ORD-{order.orderId}</span>
                  <div className="flex items-center gap-1.5">
                    {/*
                      A paid order whose stock could not be decremented (see
                      createPaidOrder). The money is in, but the order needs a
                      human to reconcile stock before it is fulfilled.
                    */}
                    {order.needsManualReview && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-200">
                        NEEDS REVIEW
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-md ${getStatusBadgeClass(order.status)}`}>
                      {getStatusLabel(order.status)}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm text-gray-900">{order.userName}</span>
                  </div>
                  <div className="text-xs text-gray-500">{order.userEmail}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{order.items.length} items</span>
                    <span className="text-sm font-semibold text-gray-900">{formatPrice(order.total)}</span>
                  </div>
                  <div className="text-xs text-gray-500">{formatDate(order.createdAt)}</div>
                  {order.delivery_boy_name && (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-semibold text-[10px]">
                        {order.delivery_boy_name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-gray-700">{order.delivery_boy_name}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-[11px] uppercase tracking-wider text-gray-400 group-hover:text-amber-600 transition-colors">Open details →</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order.id); }}
                    className="p-1.5 text-red-500 hover:text-white hover:bg-red-500 rounded-md transition-colors"
                    title="Delete order"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Table View */
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <style>{`.overflow-x-auto::-webkit-scrollbar { display: none; }`}</style>
            <table className="min-w-full">
              <thead className="bg-white border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">
                    Order ID
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">
                    Customer
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">
                    Items
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">
                    Delivery Partner
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">
                    Total
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredOrders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => navigate(`/admin/orders/${order.id}`)}
                      className="border-b border-gray-100 hover:bg-amber-50/40 cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          ORD-{order.orderId}
                        </div>
                        {order.needsManualReview && (
                          <div className="mt-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                            NEEDS REVIEW
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{order.userName}</div>
                          <div className="text-sm text-gray-500">{order.userEmail}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-600">
                          {order.items.length} items
                        </div>
                      </td>
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={order.status}
                          onChange={(e) => handleStatusChange(order.id, e.target.value as Order['status'])}
                          className={`text-sm font-medium px-4 py-1.5 rounded-md ${getStatusBadgeClass(order.status)} cursor-pointer`}
                        >
                          <option value="pending">Pending</option>
                          <option value="processing">Processing</option>
                          <option value="packed">Packed</option>
                          <option value="outForDelivery">Out for Delivery</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="returnRequested">Return Requested</option>
                          <option value="returnScheduled">Return Scheduled</option>
                          <option value="returned">Returned</option>
                          <option value="refunded">Refunded</option>
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        {order.delivery_boy_name ? (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-semibold text-xs">
                              {order.delivery_boy_name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-gray-900">{order.delivery_boy_name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 italic">Not assigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-600 whitespace-pre-line">
                          {formatDate(order.createdAt)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-gray-900">{formatPrice(order.total)}</div>
                      </td>
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDeleteOrder(order.id)}
                            className="p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-md transition-colors"
                            title="Delete Order"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>

      {/* Premium Manage Tracking Slide-Over Drawer */}
      <AnimatePresence>
        {showTrackingDrawer && selectedOrder && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={() => setShowTrackingDrawer(false)}
            />
            
            {/* Slide-over Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-600 to-amber-500 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                      <Truck className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Manage Tracking</h2>
                      <p className="text-amber-100 text-sm">Order #{selectedOrder.orderId}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowTrackingDrawer(false)}
                    className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto h-[calc(100%-180px)]">
                {/* Customer Info Card */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Customer Information</h3>
                  <div className="space-y-2">
                    <p className="text-base font-semibold text-gray-900">{selectedOrder.userName}</p>
                    <p className="text-sm text-gray-600">{selectedOrder.userEmail}</p>
                    <p className="text-sm text-gray-600">
                      {selectedOrder.shippingAddress.address}, {selectedOrder.shippingAddress.city}
                    </p>
                  </div>
                </div>

                {/* Order Items Preview */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Order Items ({selectedOrder.items.length})</h3>
                  <div className="space-y-2">
                    {selectedOrder.items.slice(0, 2).map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-gray-50 rounded-lg p-2">
                        <SmartImage src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover" preset="thumb" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                          <p className="text-xs text-gray-500">Qty: {item.quantity} × ₹{item.price.toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                    {selectedOrder.items.length > 2 && (
                      <p className="text-xs text-gray-500 text-center">+{selectedOrder.items.length - 2} more items</p>
                    )}
                  </div>
                </div>

                {/* Return Request Information - Show when return is requested */}
                {(selectedOrder.status === 'returnRequested' || selectedOrder.returnReason) && (
                  <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <ReturnIcon className="w-5 h-5 text-amber-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-amber-800 mb-1">Return Request</h3>
                        <p className="text-sm text-amber-700 mb-2">
                          <span className="font-medium">Reason:</span> {selectedOrder.returnReason || 'Not specified'}
                        </p>
                        {selectedOrder.returnRequestedAt && (
                          <p className="text-xs text-amber-600">
                            Requested on: {new Date(selectedOrder.returnRequestedAt.seconds * 1000).toLocaleDateString('en-IN', { 
                              day: 'numeric', 
                              month: 'short', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        )}
                        {selectedOrder.status === 'returnRequested' && (
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  await approveReturn(selectedOrder.id);
                                  toast.success('Return approved. Now assign a pickup partner.');
                                  navigate(`/admin/orders/${selectedOrder.id}`);
                                } catch (err: unknown) {
                                  toast.error(getErrorMessage(err, 'Failed to approve return'));
                                }
                              }}
                              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                            >
                              Approve & Assign Pickup
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await rejectReturn(selectedOrder.id);
                                  toast.info('Return request rejected. Order reverted to delivered.');
                                } catch (err: unknown) {
                                  toast.error(getErrorMessage(err, 'Failed to reject return'));
                                }
                              }}
                              className="px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
                            >
                              Reject Return
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Cancellation Information - Show when order is cancelled */}
                {selectedOrder.status === 'cancelled' && selectedOrder.cancellationReason && (
                  <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <XCircle className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-red-800 mb-1">Order Cancelled</h3>
                        <p className="text-sm text-red-700 mb-2">
                          <span className="font-medium">Reason:</span> {selectedOrder.cancellationReason}
                        </p>
                        {selectedOrder.cancelledAt && (
                          <p className="text-xs text-red-600">
                            Cancelled on: {new Date(selectedOrder.cancelledAt.seconds * 1000).toLocaleDateString('en-IN', { 
                              day: 'numeric', 
                              month: 'short', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        )}
                        <p className="text-xs text-red-600 mt-1">
                          Cancelled by: {selectedOrder.cancelledBy === 'user' ? 'Customer' : 'Admin'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status Update Section */}
                <div className="space-y-5">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Update Tracking</h3>
                  
                  {/* Status Dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Order Status</label>
                    <div className="relative">
                      <select
                        value={trackingForm.status}
                        onChange={(e) => setTrackingForm({ ...trackingForm, status: e.target.value as Order['status'] })}
                        className="w-full px-4 py-3 pr-10 border border-gray-200 rounded-xl bg-white text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent appearance-none cursor-pointer"
                      >
                        <option value="pending">⏳ Pending</option>
                        <option value="processing">📦 Processing</option>
                        <option value="packed">🚚 Packed</option>
                        <option value="outForDelivery">📍 Out for Delivery</option>
                        <option value="delivered">✅ Delivered</option>
                        <option value="cancelled">❌ Cancelled</option>
                        <option value="returnRequested">🔄 Return Requested</option>
                        <option value="returnScheduled">📦 Return Scheduled</option>
                        <option value="returned">✔️ Returned</option>
                        <option value="refunded">💰 Refunded</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Tracking URL Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tracking URL (Optional)</label>
                    <Input
                      type="url"
                      value={trackingForm.trackingUrl}
                      onChange={(e) => setTrackingForm({ ...trackingForm, trackingUrl: e.target.value })}
                      placeholder="https://..."
                      className="h-12 border-gray-200 rounded-xl focus:ring-amber-500 focus:border-amber-500"
                    />
                  </div>

                  {/* Note Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status Note (Optional)</label>
                    <textarea
                      value={trackingForm.note}
                      onChange={(e) => setTrackingForm({ ...trackingForm, note: e.target.value })}
                      placeholder="Add a note for this status update..."
                      rows={2}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none text-sm"
                    />
                  </div>
                </div>

                {/* Current Tracking Info Preview */}
                {(selectedOrder.trackingId || selectedOrder.carrier) && (
                  <div className="mt-6 bg-blue-50 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-blue-700 mb-2">Current Tracking Info</h4>
                    {selectedOrder.trackingId && (
                      <p className="text-sm text-blue-600">ID: {selectedOrder.trackingId}</p>
                    )}
                    {selectedOrder.carrier && (
                      <p className="text-sm text-blue-600">Carrier: {selectedOrder.carrier}</p>
                    )}
                    {selectedOrder.trackingUrl && (
                      <a 
                        href={selectedOrder.trackingUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-1"
                      >
                        Track Package <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4">
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowTrackingDrawer(false)}
                    className="flex-1 h-12 border-gray-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleTrackingUpdate}
                    disabled={trackingUpdating}
                    className="flex-1 h-12 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white"
                  >
                    {trackingUpdating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Update Status
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Assign Partner Slide-Over Drawer */}
      <AnimatePresence>
        {showAssignDrawer && selectedOrder && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={() => setShowAssignDrawer(false)}
            />
            
            {/* Slide-over Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-600 to-purple-500 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                      <UserPlus className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Assign Delivery Partner</h2>
                      <p className="text-purple-100 text-sm">Order #{selectedOrder.orderId}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAssignDrawer(false)}
                    className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto h-[calc(100%-180px)]">
                {/* Order Info Card */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Order Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Customer</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedOrder.userName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Total Amount</span>
                      <span className="text-sm font-semibold text-amber-600">₹{selectedOrder.total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Items</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedOrder.items.length} items</span>
                    </div>
                  </div>
                </div>

                {/* Shipping Address */}
                <div className="bg-blue-50 rounded-xl p-4 mb-6">
                  <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Delivery Address
                  </h3>
                  <p className="text-sm text-blue-800 font-medium">{selectedOrder.shippingAddress.fullName}</p>
                  <p className="text-sm text-blue-700">{selectedOrder.shippingAddress.address}</p>
                  {selectedOrder.shippingAddress.locality && (
                    <p className="text-sm text-blue-700">{selectedOrder.shippingAddress.locality}</p>
                  )}
                  <p className="text-sm text-blue-700">
                    {selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.state} - {selectedOrder.shippingAddress.pincode}
                  </p>
                  <p className="text-sm text-blue-700 mt-2 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {selectedOrder.shippingAddress.mobile}
                  </p>
                </div>

                {/* Current Assignment */}
                {selectedOrder.delivery_boy_id && (
                  <div className="bg-emerald-50 rounded-xl p-4 mb-6 border border-emerald-200">
                    <h3 className="text-sm font-semibold text-emerald-700 uppercase tracking-wider mb-2">Currently Assigned</h3>
                    <p className="text-sm font-semibold text-emerald-800">{selectedOrder.delivery_boy_name}</p>
                  </div>
                )}

                {/* Delivery Partner Selection */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Select Delivery Partner
                  </h3>
                  
                  {deliveryBoys.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-xl">
                      <User className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500">No active delivery partners available</p>
                      <p className="text-sm text-gray-400 mt-1">Add partners in Delivery Boys section</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {deliveryBoys.map((partner) => (
                        <div
                          key={partner.id}
                          onClick={() => setSelectedDeliveryBoyId(partner.id)}
                          className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                            selectedDeliveryBoyId === partner.id
                              ? 'border-purple-500 bg-purple-50'
                              : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${
                              selectedDeliveryBoyId === partner.id ? 'bg-purple-500' : 'bg-gray-400'
                            }`}>
                              {partner.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900">{partner.name}</p>
                              <div className="flex items-center gap-3 text-sm text-gray-500">
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" /> {partner.phone}
                                </span>
                                <span className="capitalize">🏍️ {partner.vehicleType}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-400">Current Orders</p>
                              <p className="font-semibold text-gray-700">{partner.currentOrdersCount}</p>
                            </div>
                            {selectedDeliveryBoyId === partner.id && (
                              <CheckCircle2 className="w-6 h-6 text-purple-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4">
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowAssignDrawer(false)}
                    className="flex-1 h-12 border-gray-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAssignPartner}
                    disabled={assigning || !selectedDeliveryBoyId || deliveryBoys.length === 0}
                    className="flex-1 h-12 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white disabled:opacity-50"
                  >
                    {assigning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Assigning...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Confirm Assignment
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Order Details Modal (View Only) */}
      {showOrderDetails && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Order Details</h2>
                <button
                  onClick={() => setShowOrderDetails(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Order Info */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Order Information</h3>
                <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
                  <div>
                    <p className="text-sm text-gray-600">Order ID</p>
                    <p className="text-sm font-semibold text-gray-900">#{selectedOrder.orderId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <p className={`text-sm font-semibold capitalize ${getStatusBadgeClass(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Date</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {selectedOrder.createdAt?.toDate().toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Payment Method</p>
                    <p className="text-sm font-semibold text-gray-900 capitalize">{selectedOrder.paymentMethod}</p>
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Customer Information</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-900">{selectedOrder.userName}</p>
                  <p className="text-sm text-gray-600 mt-1">{selectedOrder.userEmail}</p>
                </div>
              </div>

              {/* Shipping Address */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Shipping Address</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-900">{selectedOrder.shippingAddress.fullName}</p>
                  <p className="text-sm text-gray-600 mt-1">{selectedOrder.shippingAddress.address}</p>
                  {selectedOrder.shippingAddress.locality && (
                    <p className="text-sm text-gray-600">{selectedOrder.shippingAddress.locality}</p>
                  )}
                  <p className="text-sm text-gray-600">
                    {selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.state} {selectedOrder.shippingAddress.pincode}
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    <span className="font-medium">Phone:</span> {selectedOrder.shippingAddress.mobile}
                  </p>
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Order Items</h3>
                <div className="space-y-3">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="flex gap-4 bg-gray-50 rounded-lg p-4">
                      <div className="w-20 h-20 bg-white rounded-lg flex-shrink-0 overflow-hidden">
                        <SmartImage src={item.image} alt={item.name} className="w-full h-full object-cover" preset="thumb" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-gray-900 mb-1">{item.name}</h4>
                        <p className="text-xs text-gray-600">Quantity: {item.quantity}</p>
                        <p className="text-xs text-gray-600">Price: {formatPrice(item.price)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          {formatPrice(item.price * item.quantity)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Summary */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Order Summary</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>{formatPrice(selectedOrder.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Delivery Charge:</span>
                    <span>{formatPrice(selectedOrder.deliveryCharge)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tax:</span>
                    <span>{formatPrice(selectedOrder.taxAmount)}</span>
                  </div>
                  {selectedOrder.discount > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>Discount:</span>
                      <span>- {formatPrice(selectedOrder.discount)}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-300 pt-2 mt-2">
                    <div className="flex justify-between text-base font-bold">
                      <span>Total:</span>
                      <span>{formatPrice(selectedOrder.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;
