import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Order, cancelOrder, subscribeToOrder } from '@/services/orderService';
import Header from '@/components/Header';
import EmptyState from '@/components/EmptyState';
import { PanelSkeleton } from '@/components/skeletons';
import { getUserAddresses, Address } from '@/services/addressService';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Notice } from '@/components/ui/notice';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ArrowLeft, MapPin, PackageSearch } from 'lucide-react';

const CANCEL_REASONS = [
  'Changed my mind',
  'Ordered by mistake',
  'Found a better price',
  // 'Need to change delivery address', // Hidden for now - can be enabled in future
  'Other reason',
];

const CancelOrderPage = () => {
  const navigate = useNavigate();
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  // The order listener found nothing for this customer, or failed.
  const [loadState, setLoadState] = useState<'ok' | 'missing' | 'error'>('ok');
  const [reloadKey, setReloadKey] = useState(0);
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
    setLoadState('ok');

    // Listen to this one order only. Someone else's order is refused by the
    // rules or fails the owner check: both show the not-found state.
    const unsubscribe = subscribeToOrder(
      orderId,
      (foundOrder) => {
        if (!foundOrder || foundOrder.userId !== user.uid) {
          setOrder(null);
          setLoadState('missing');
          setLoading(false);
          return;
        }

        // Check if order can be cancelled (skip during our own cancel-in-progress to avoid race)
        if (
          !isCancellingRef.current &&
          foundOrder.status !== 'pending' &&
          foundOrder.status !== 'processing'
        ) {
          toast.error('This order can no longer be cancelled.');
          navigate(`/account/orders/${orderId}`);
          return;
        }

        setOrder(foundOrder);
        setLoadState('ok');
        setLoading(false);
      },
      (error) => {
        console.error('Error loading order:', error);
        setOrder(null);
        setLoadState((error as { code?: string })?.code === 'permission-denied' ? 'missing' : 'error');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [orderId, user, navigate, reloadKey]);

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
      toast.error('Choose a reason for cancelling.');
      return;
    }

    // Check if custom reason is required but not provided
    if (cancelReason === 'Other reason' && !customReason.trim()) {
      toast.error('Tell us your reason for cancelling.');
      return;
    }

    // Check if address is required but not selected
    if (cancelReason === 'Need to change delivery address' && !selectedNewAddress) {
      toast.error('Choose a new delivery address.');
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
      toast.success('Order cancelled.');
      navigate(`/account/orders/${orderId}`);
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      toast.error(error.message || 'Unable to cancel the order. Try again.');
      isCancellingRef.current = false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const shell = (content: React.ReactNode) => (
    <div className="min-h-dvh tx-paper pb-28">
      {/* Top Site Navigation */}
      <Header />
      <main id="main" tabIndex={-1} className="outline-none">
        {content}
      </main>
    </div>
  );

  if (loading) {
    return shell(
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <PanelSkeleton lines={1} label="Loading your order" />
        <PanelSkeleton lines={4} label="" />
      </div>
    );
  }

  if (!order) {
    const failed = loadState === 'error';
    return shell(
      <div className="mx-auto max-w-2xl px-4 py-6">
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

  const submitDisabled =
    !cancelReason ||
    isSubmitting ||
    (cancelReason === 'Other reason' && !customReason.trim()) ||
    (cancelReason === 'Need to change delivery address' && !selectedNewAddress);

  return shell(
    <>
      {/* Page Header */}
      <div className="tx-sheet sticky top-16 z-sticky border-b border-foreground/[0.08]">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-3 sm:px-4">
          <IconButton label="Back" onClick={() => navigate(`/account/orders/${orderId}`)}>
            <ArrowLeft />
          </IconButton>
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground lg:text-2xl">Cancel order</h1>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">ORD-{order.orderId}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* Cancellation Reason Section */}
        <section aria-labelledby="cancel-reason-heading" className="panel tx-sheet p-4 sm:p-6">
          <h2 id="cancel-reason-heading" className="font-heading text-[15px] font-semibold tracking-tight text-foreground">
            Reason for cancellation
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the reason that fits best.
          </p>

          <RadioGroup
            value={cancelReason}
            onValueChange={handleReasonClick}
            aria-labelledby="cancel-reason-heading"
            className="mt-3 gap-0"
          >
            {CANCEL_REASONS.map((reason, i) => {
              const id = `cancel-reason-${i}`;
              const selected = cancelReason === reason;
              return (
                <label
                  key={reason}
                  htmlFor={id}
                  className="flex min-h-[52px] cursor-pointer items-center justify-between gap-4 border-b border-foreground/[0.08] last:border-b-0"
                >
                  <span className={cn('text-sm transition-colors duration-hover', selected ? 'font-semibold text-foreground' : 'text-foreground/80')}>
                    {reason}
                  </span>
                  <RadioGroupItem id={id} value={reason} />
                </label>
              );
            })}
          </RadioGroup>

          {/* Custom Reason Input */}
          {cancelReason === 'Other reason' && (
            <div className="mt-4">
              <label htmlFor="cancel-other-reason" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Your reason
              </label>
              <Textarea
                id="cancel-other-reason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Tell us why you are cancelling"
                className="resize-none"
                rows={4}
              />
            </div>
          )}

          {/* Selected Address Display */}
          {cancelReason === 'Need to change delivery address' && selectedNewAddress && (
            <Notice tone="success" role="note" title="New delivery address selected" className="mt-4">
              <span className="text-muted-foreground">
                {selectedNewAddress.fullName}, {selectedNewAddress.address}, {selectedNewAddress.city}, {selectedNewAddress.pinCode}
              </span>
            </Notice>
          )}
        </section>
      </div>

      {/* Fixed Bottom Button */}
      <div className="tx-sheet fixed inset-x-0 bottom-0 z-sticky border-t border-foreground/[0.08] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-[40rem]">
          <button
            type="button"
            onClick={handleCancelOrder}
            disabled={submitDisabled}
            className={cn(
              'inline-flex h-12 w-full items-center justify-center gap-2 rounded-control text-sm font-semibold transition-[transform,background-color,color] duration-press ease-out',
              submitDisabled
                ? 'cursor-not-allowed bg-foreground/[0.06] text-muted-foreground'
                : 'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.97]',
            )}
          >
            {isSubmitting && <Spinner />}
            {isSubmitting ? 'Cancelling order' : 'Cancel order'}
          </button>
        </div>
      </div>

      {/* Address Selector Sheet */}
      <Sheet open={showAddressModal} onOpenChange={setShowAddressModal}>
        <SheetContent side="bottom" className="tx-sheet mx-auto flex max-h-[85dvh] max-w-xl flex-col gap-0 overflow-hidden p-0">
          <div className="border-b border-foreground/[0.08] p-4 pr-14">
            <SheetTitle>Choose a new delivery address</SheetTitle>
            <SheetDescription className="sr-only">Pick one of your saved addresses.</SheetDescription>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {addresses.length === 0 ? (
              <div className="py-8 text-center">
                <MapPin aria-hidden="true" className="mx-auto mb-3 size-10 text-muted-foreground" />
                <p className="text-sm text-foreground">No saved addresses yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Add an address from your profile.</p>
              </div>
            ) : (
              <RadioGroup
                value={selectedNewAddress?.id ?? ''}
                onValueChange={(id) => setSelectedNewAddress(addresses.find((a) => a.id === id) ?? null)}
                className="gap-3"
              >
                {addresses.map((address) => {
                  const selected = selectedNewAddress?.id === address.id;
                  return (
                    <label
                      key={address.id}
                      htmlFor={`address-${address.id}`}
                      className={cn(
                        'block cursor-pointer rounded-card border p-4 transition-[border-color,background-color] duration-hover ease-out',
                        selected ? 'border-primary bg-primary/[0.06]' : 'border-foreground/[0.1] bg-card hover:border-foreground/25',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <RadioGroupItem id={`address-${address.id}`} value={address.id} className="mt-0.5" />
                        <div className="flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{address.fullName}</span>
                            {address.isDefault && (
                              <span className="rounded-chip bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="mb-1 text-xs text-muted-foreground tabular-nums">{address.phoneNumber}</p>
                          <p className="text-xs leading-relaxed text-foreground/80">
                            {address.address}
                            {address.locality && `, ${address.locality}`}, {address.city}, {address.state} {address.pinCode}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex gap-3 border-t border-foreground/[0.08] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowAddressModal(false);
                setSelectedNewAddress(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={!selectedNewAddress}
              onClick={() => {
                if (selectedNewAddress) {
                  toast.success('Address selected. Returning to your order.');
                  navigate(`/account/orders/${orderId}`);
                }
              }}
            >
              Select address
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default CancelOrderPage;
