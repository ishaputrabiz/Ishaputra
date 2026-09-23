import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Order, cancelOrder, subscribeToUserOrders } from '@/services/orderService';
import Header from '@/components/Header';
import { getUserAddresses, Address } from '@/services/addressService';
import { toast } from 'sonner';
import { ArrowLeft, Ban, Loader2, ChevronRight, X, MapPin, Check } from 'lucide-react';

const CancelOrderPage = () => {
  const navigate = useNavigate();
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelReason, setCancelReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedNewAddress, setSelectedNewAddress] = useState<Address | null>(null);
  // Suppress the listener-driven "cannot be cancelled" toast while WE are performing the cancel.
  const isCancellingRef = useRef(false);

  useEffect(() => {
    if (!orderId || !user) {
      navigate('/account/orders');
      return;
    }

    setLoading(true);

    const unsubscribe = subscribeToUserOrders(
      user.uid,
      (fetchedOrders) => {
        const foundOrder = fetchedOrders.find(o => o.id === orderId);
        if (!foundOrder) {
          toast.error('Order not found');
          navigate('/account/orders');
          return;
        }

        // Check if order can be cancelled (skip during our own cancel-in-progress to avoid race)
        if (
          !isCancellingRef.current &&
          foundOrder.status !== 'pending' &&
          foundOrder.status !== 'processing'
        ) {
          toast.error('This order cannot be cancelled');
          navigate(`/account/orders/${orderId}`);
          return;
        }

        setOrder(foundOrder);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading order:', error);
        toast.error('Failed to load order');
        navigate('/account/orders');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [orderId, user, navigate]);

  // Fetch user addresses
  useEffect(() => {
    if (!user) return;

    const loadAddresses = async () => {
      try {
        const userAddresses = await getUserAddresses(user.uid);
        setAddresses(userAddresses);
      } catch (error) {
        console.error('Error loading addresses:', error);
      }
    };

    loadAddresses();
  }, [user]);

  const handleReasonClick = (reason: string) => {
    if (reason === 'Need to change delivery address') {
      setShowAddressModal(true);
    }
    setCancelReason(reason);
  };

  const handleCancelOrder = async () => {
    if (!cancelReason || !order || !user) {
      toast.error('Please select a cancellation reason');
      return;
    }

    // Check if custom reason is required but not provided
    if (cancelReason === 'Other reason' && !customReason.trim()) {
      toast.error('Please provide a reason for cancellation');
      return;
    }

    // Check if address is required but not selected
    if (cancelReason === 'Need to change delivery address' && !selectedNewAddress) {
      toast.error('Please select a new delivery address');
      return;
    }

    let finalReason = cancelReason;
    if (cancelReason === 'Other reason') {
      finalReason = customReason;
    } else if (cancelReason === 'Need to change delivery address' && selectedNewAddress) {
      finalReason = `${cancelReason} - New address: ${selectedNewAddress.address}, ${selectedNewAddress.city}, ${selectedNewAddress.pinCode}`;
    }

    setIsSubmitting(true);
    isCancellingRef.current = true;
    try {
      await cancelOrder(order.id, user.uid, finalReason);
      toast.success('Order cancelled successfully');
      navigate(`/account/orders/${orderId}`);
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      toast.error(error.message || 'Failed to cancel order');
      isCancellingRef.current = false;
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-zinc-500" />
      </div>
    );
  }

  if (!order) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 pb-20" style={{ fontFamily: "'Poppins', sans-serif" }}>
      {/* Top Site Navigation */}
      <Header />
      
      {/* Page Header */}
      <div className="bg-white dark:bg-zinc-900 sticky top-16 z-40 border-b border-gray-100 dark:border-zinc-800">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate(`/account/orders/${orderId}`)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-700 dark:text-zinc-300" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
              <Ban className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-zinc-100">Cancel Order</h1>
              <p className="text-xs text-gray-500 dark:text-zinc-500">Order #{order.orderId}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        {/* Cancellation Reason Section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-2">
            Reason for Cancellation
          </h2>
          <p className="text-sm text-gray-600 dark:text-zinc-400 mb-4">
            Please select a reason for cancelling this order:
          </p>

          <div className="space-y-2">
            {[
              'Changed my mind',
              'Ordered by mistake',
              'Found a better price',
              // 'Need to change delivery address', // Hidden for now - can be enabled in future
              'Other reason'
            ].map((reason) => (
              <button
                key={reason}
                onClick={() => handleReasonClick(reason)}
                className="w-full flex items-center justify-between py-3 transition-all"
              >
                <span className={`text-sm font-medium transition-colors ${
                  cancelReason === reason ? 'text-red-600' : 'text-gray-700'
                }`}>
                  {reason}
                </span>
                <ChevronRight className={`w-5 h-5 transition-colors ${
                  cancelReason === reason ? 'text-red-600' : 'text-gray-400'
                }`} />
              </button>
            ))}
          </div>

          {/* Custom Reason Input */}
          {cancelReason === 'Other reason' && (
            <div className="mt-4">
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Please specify your reason..."
                className="w-full px-4 py-3 border border-gray-300 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none text-sm"
                rows={4}
              />
            </div>
          )}

          {/* Selected Address Display */}
          {cancelReason === 'Need to change delivery address' && selectedNewAddress && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-900 mb-1">
                    New delivery address selected
                  </p>
                  <p className="text-xs text-green-700">
                    {selectedNewAddress.fullName} - {selectedNewAddress.address}, {selectedNewAddress.city}, {selectedNewAddress.pinCode}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 p-4">
        <button
          onClick={handleCancelOrder}
          disabled={
            !cancelReason || 
            isSubmitting || 
            (cancelReason === 'Other reason' && !customReason.trim()) ||
            (cancelReason === 'Need to change delivery address' && !selectedNewAddress)
          }
          className={`w-full py-3.5 rounded-full font-semibold text-sm transition-all border-2 ${
            !cancelReason || 
            isSubmitting || 
            (cancelReason === 'Other reason' && !customReason.trim()) ||
            (cancelReason === 'Need to change delivery address' && !selectedNewAddress)
              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              : 'bg-transparent text-red-600 border-red-600 hover:bg-red-50 active:scale-95'
          }`}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cancelling Order...
            </span>
          ) : (
            'Cancel Order'
          )}
        </button>
      </div>

      {/* Address Selector Modal */}
      <AnimatePresence>
        {showAddressModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddressModal(false)}
              className="fixed inset-0 bg-black/50 z-[60]"
            />
            
            {/* Address List Modal */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[70] bg-white dark:bg-zinc-900 rounded-t-3xl max-h-[85vh] overflow-hidden"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              <div className="p-4 border-b border-gray-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-zinc-100">
                    Select New Delivery Address
                  </h3>
                  <button
                    onClick={() => setShowAddressModal(false)}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600 dark:text-zinc-400" />
                  </button>
                </div>
              </div>
              
              <div className="overflow-y-auto max-h-[calc(85vh-150px)] p-4">
                {addresses.length === 0 ? (
                  <div className="py-8 text-center">
                    <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-zinc-500">No saved addresses found</p>
                    <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                      Please add an address from your profile
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {addresses.map((address) => (
                      <label
                        key={address.id}
                        className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          selectedNewAddress?.id === address.id
                            ? 'border-red-500 bg-red-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Radio Button */}
                          <input
                            type="radio"
                            name="selectedAddress"
                            checked={selectedNewAddress?.id === address.id}
                            onChange={() => setSelectedNewAddress(address)}
                            className="mt-1 w-4 h-4 text-red-600 border-gray-300 dark:border-zinc-700 focus:ring-red-500"
                          />
                          
                          {/* Address Details */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-gray-900 dark:text-zinc-100 uppercase text-sm">
                                {address.fullName}
                              </span>
                              {address.isDefault && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded uppercase">
                                  Default
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 dark:text-zinc-400 mb-1">{address.phoneNumber}</p>
                            <p className="text-xs text-gray-700 dark:text-zinc-300 leading-relaxed">
                              {address.address}
                              {address.locality && `, ${address.locality}`}, {address.city}, {address.state} - {address.pinCode}
                            </p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Footer Buttons */}
              <div className="p-4 border-t border-gray-200 dark:border-zinc-800 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddressModal(false);
                    setSelectedNewAddress(null);
                  }}
                  className="flex-1 h-11 text-sm font-semibold border-2 border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedNewAddress) {
                      toast.success('Address selected. Returning to order details.');
                      navigate(`/account/orders/${orderId}`);
                    }
                  }}
                  disabled={!selectedNewAddress}
                  className="flex-1 h-11 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Select Address
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CancelOrderPage;
