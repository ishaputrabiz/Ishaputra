import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package,
  Search,
  Trash2,
  User,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import {
  subscribeToAllOrders,
  Order,
  updateOrderStatus,
  updateOrderTracking,
  TrackingUpdate,
  deleteOrder,
  assignOrderToDeliveryBoy,
  isValidStatusTransition,
  normalizeOrderStatus,
} from '@/services/orderService';
import { subscribeToDeliveryBoys, DeliveryBoy } from '@/services/deliveryBoyService';
import { DELIVERY_PARTNERS_ENABLED } from '@/config/features';
import { toast } from 'sonner';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { IconButton } from '@/components/ui/icon-button';
import { StatusBadge, STATUS_TONE_CLASSES } from '@/components/ui/status-badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/skeletons';
import { EmptyState } from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import { getOrderStatus, orderLabel as formatOrderLabel, type OrderStatusContext } from '@/lib/orderStatus';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, formatINR, plural } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The statuses the order page offers, in workflow order. Labels come from the shared status map. */
const STATUS_CHOICES: Array<{ value: Order['status']; label: string }> = (
  [
    'pending',
    'processing',
    'packed',
    'outForDelivery',
    'delivered',
    'cancelled',
    'returnRequested',
    'returnScheduled',
    'picked',
    'returned',
    'refunded',
    'deliveryFailed',
  ] as Array<Order['status']>
).map((value) => ({ value, label: getOrderStatus(value).label }));

/** The status filter, in workflow order. */
const FILTER_CHOICES: Array<{ value: 'all' | Order['status']; label: string }> = [
  { value: 'all', label: 'All orders' },
  ...(
    [
      'pending',
      'processing',
      'packed',
      'outForDelivery',
      'deliveryFailed',
      'delivered',
      'cancelled',
      'returnRequested',
      'returnScheduled',
      'picked',
      'returned',
      'refunded',
    ] as Array<Order['status']>
  ).map((value) => ({ value, label: getOrderStatus(value).label })),
];

const VIEW_KEY = 'ishaputra-admin-orders-view';

const readViewMode = (): 'grid' | 'table' => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'grid';
  } catch {
    return 'grid';
  }
};

/**
 * An order's status as the order page reads it: legacy values become their
 * canonical status, and `picked` stays itself only during a return (the item
 * collected from the customer).
 */
const displayStatus = (order: Order): Order['status'] =>
  order.status === 'picked' && (order as Order & { returnScheduledAt?: unknown }).returnScheduledAt
    ? 'picked'
    : normalizeOrderStatus(order.status);

/**
 * Label, tone and icon for the list, through the shared map. 'Needs review'
 * gets its own chip, so the status chip always shows the workflow status.
 */
const statusDisplayFor = (order: Order) =>
  getOrderStatus(displayStatus(order), { ...(order as unknown as OrderStatusContext), needsManualReview: false });

/** The current status plus the ones the workflow allows next, as on the order page. */
const statusChoicesFor = (order: Order) => {
  const current = displayStatus(order);
  const choices = STATUS_CHOICES.filter(
    (c) => c.value === current || isValidStatusTransition(current, c.value),
  );
  return choices.some((c) => c.value === current) ? choices : [{ value: current, label: String(current) }, ...choices];
};

const AdminOrders = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Order['status']>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
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
  const [viewMode, setViewModeState] = useState<'grid' | 'table'>(readViewMode);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  // Confirmations: delete an order, change a status from the table.
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ order: Order; status: Order['status'] } | null>(null);
  // The control that opened a confirmation, so focus goes back to it on close.
  const confirmOpenerRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const setViewMode = (mode: 'grid' | 'table') => {
    setViewModeState(mode);
    try {
      window.localStorage.setItem(VIEW_KEY, mode);
    } catch {
      // Storage blocked (private mode): the choice lasts for this visit only.
    }
  };

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
  // The list prints ORD-48273723, so a search for 'ORD-4827' or '#4827' finds it too.
  const query = searchQuery.trim().toLowerCase();
  const idQuery = query.replace(/^#/, '').replace(/^ord-?/, '');
  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      order.orderId.toLowerCase().includes(idQuery) ||
      order.userName.toLowerCase().includes(query) ||
      order.userEmail.toLowerCase().includes(query);

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // The same checks as the order page: forward through the workflow only, so a
  // cancelled order cannot be reopened and delivered from this list.
  const handleStatusChange = async (order: Order, newStatus: Order['status']) => {
    const current = displayStatus(order);
    if (newStatus === current) return;
    if (!isValidStatusTransition(current, newStatus)) {
      toast.error('Status can only move forward in the workflow.');
      return;
    }
    if (DELIVERY_PARTNERS_ENABLED && newStatus === 'outForDelivery' && !order.delivery_boy_id && !order.delivery_partner_id) {
      toast.error('Assign a delivery partner first: open the order to do it.');
      return;
    }
    if (DELIVERY_PARTNERS_ENABLED && newStatus === 'returnScheduled') {
      toast.error('Open the order and assign a pickup partner to schedule the return.');
      return;
    }
    setSavingStatusId(order.id);
    try {
      await updateOrderStatus(order.id, newStatus);
      const label = STATUS_CHOICES.find((c) => c.value === newStatus)?.label || newStatus;
      toast.success(`Order status updated to ${label}`);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    } finally {
      setSavingStatusId(null);
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

      toast.success('Tracking updated', {
        description: `Order #${selectedOrder.orderId}: ${trackingForm.status}`,
        duration: 4000,
      });

      setShowTrackingDrawer(false);
    } catch (error) {
      console.error('Error updating tracking:', error);
      toast.error('Failed to update tracking information');
    } finally {
      setTrackingUpdating(false);
    }
  };

  // Runs after the ConfirmDialog (the browser confirm() is gone).
  const handleDeleteOrder = async (orderId: string) => {
    try {
      await deleteOrder(orderId);
      toast.success('Order deleted');
      // The deleted row's button is gone, so focus lands on the search field instead of the page body.
      confirmOpenerRef.current = searchInputRef.current;
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
      // NOTE: assignOrderToDeliveryBoy already sets status to 'outForDelivery'
      // and fires dispatchStatusNotifications internally. Do NOT call
      // updateOrderStatus here: it would send a second notification and
      // revert the status back to 'processing'.

      toast.success('Partner assigned', {
        description: `Order #${selectedOrder.orderId} to ${selectedPartner.name}`,
        duration: 4000,
      });

      setShowAssignDrawer(false);
    } catch (error) {
      console.error('Error assigning partner:', error);
      toast.error('Failed to assign delivery partner');
    } finally {
      setAssigning(false);
    }
  };

  // The tracking and assign drawers and the view-only modal were never opened
  // from this page (orders open on their own page), so their markup is gone.
  // The handlers above stay for whoever wires them up again.

  /* ── Table scroller: a right-edge fade while more columns sit off screen ── */
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const updateScrollCue = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);
  useEffect(() => {
    if (viewMode !== 'table') return;
    updateScrollCue();
    window.addEventListener('resize', updateScrollCue);
    return () => window.removeEventListener('resize', updateScrollCue);
  }, [viewMode, updateScrollCue, filteredOrders.length, loading]);

  const header = (
    <AdminPageHeader
      title="Orders"
      description="Real-time order management with live updates."
      actions={<StatusBadge tone="success" label="Live" dot pulse />}
    >
      {!loading && (
        <span
          className="text-2xl font-semibold tabular-nums text-muted-foreground"
          style={{ fontFamily: 'var(--font-heading)', fontStretch: 'var(--font-heading-stretch)' }}
        >
          {orders.length}
        </span>
      )}
    </AdminPageHeader>
  );

  const orderLabel = (order: Order) => formatOrderLabel(order.orderId);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col" style={{ fontFamily: "var(--font-body)" }}>
      {header}

      {/* Search and filter row */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            ref={searchInputRef}
            aria-label="Search orders"
            placeholder="Search by order, name or email"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger aria-label="Filter by status" className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_CHOICES.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Order management header */}
      <div className="mb-4 mt-8 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Order management</h2>
          <p className="text-sm tabular-nums text-muted-foreground">
            {loading ? 'Loading orders' : `Viewing ${filteredOrders.length} of ${plural(orders.length, 'order')}`}
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => v && setViewMode(v as 'grid' | 'table')}
          aria-label="Order view"
          className="shrink-0"
        >
          <ToggleGroupItem value="grid" aria-label="Grid view" size="sm" className="size-9 px-0">
            <LayoutGrid aria-hidden="true" className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="List view" size="sm" className="size-9 px-0">
            <List aria-hidden="true" className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {loading ? (
        viewMode === 'grid' ? (
          <div aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <span className="sr-only" role="status">Loading orders</span>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex h-[212px] flex-col gap-3 rounded-card border border-foreground/[0.08] bg-card p-5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-6 w-20 rounded-chip" />
                </div>
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-auto h-3 w-24" />
              </div>
            ))}
          </div>
        ) : (
          <TableSkeleton rows={8} cols={DELIVERY_PARTNERS_ENABLED ? 8 : 7} label="Loading orders" />
        )
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-card">
          <EmptyState
            icon={Package}
            title="No orders found"
            description={orders.length === 0 ? 'New orders appear here as they come in.' : 'Try another search or status.'}
            as="h3"
          />
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid view */
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredOrders.map((order) => {
            const status = statusDisplayFor(order);
            return (
              <li
                key={order.id}
                className="group relative flex flex-col rounded-card border border-foreground/[0.08] bg-card p-5 text-card-foreground shadow-sm transition-[box-shadow,border-color] duration-hover ease-out hover:border-primary/40 hover:shadow-panel has-[a[data-card-link]:focus-visible]:outline has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-ring"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <Link
                    to={`/admin/orders/${order.id}`}
                    data-card-link
                    className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground outline-none after:absolute after:inset-0 after:rounded-card after:content-['']"
                  >
                    {orderLabel(order)}
                  </Link>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {/*
                      A paid order whose stock could not be decremented (see
                      createPaidOrder). The money is in, but the order needs a
                      human to reconcile stock before it is fulfilled.
                    */}
                    {order.needsManualReview && (
                      <StatusBadge
                        tone="danger"
                        label="Needs review"
                        icon={getOrderStatus(order.status, { needsManualReview: true }).icon}
                        title={order.manualReviewReason || undefined}
                      />
                    )}
                    <StatusBadge tone={status.tone} label={status.label} icon={status.icon} />
                  </div>
                </div>
                <div className="mb-4 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <User aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm text-foreground">{order.userName}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{order.userEmail}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{plural(order.items.length, 'item')}</span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">{formatINR(order.total)}</span>
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">{formatDate(order.createdAt)}</div>
                  {order.delivery_boy_name && (
                    <div className="flex items-center gap-2">
                      <div aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                        {order.delivery_boy_name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-foreground/80">{order.delivery_boy_name}</span>
                    </div>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-foreground/[0.08] pt-3">
                  <span aria-hidden="true" className="text-xs font-medium text-muted-foreground transition-colors duration-hover group-hover:text-primary">
                    Open details
                  </span>
                  <IconButton
                    label={`Delete order ${orderLabel(order)}`}
                    size="sm"
                    onClick={(e) => {
                      confirmOpenerRef.current = e.currentTarget;
                      setDeleteTarget(order);
                    }}
                    className="z-raised text-muted-foreground hover:bg-status-danger-bg hover:text-status-danger-fg"
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        /* Table view */
        <div className="relative overflow-hidden rounded-card border border-foreground/[0.08] bg-card">
          <div ref={scrollerRef} onScroll={updateScrollCue} className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/[0.08]">
                  {['Order ID', 'Customer', 'Items', 'Status', ...(DELIVERY_PARTNERS_ENABLED ? ['Delivery partner'] : []), 'Date', 'Total', 'Actions'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className={cn(
                        'sticky top-0 z-raised whitespace-nowrap bg-card px-4 py-3 text-left text-xs font-medium text-muted-foreground',
                        h === 'Total' && 'text-right',
                      )}
                    >
                      {h === 'Actions' ? <span className="sr-only">Actions</span> : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const status = statusDisplayFor(order);
                  const choices = statusChoicesFor(order);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => navigate(`/admin/orders/${order.id}`)}
                      className="h-14 cursor-pointer border-b border-foreground/[0.06] transition-colors duration-hover last:border-b-0 hover:bg-muted/60"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          to={`/admin/orders/${order.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium tabular-nums text-foreground underline-offset-4 hover:text-primary hover:underline"
                        >
                          {orderLabel(order)}
                        </Link>
                        {order.needsManualReview && (
                          <div className="mt-1">
                            <StatusBadge
                              tone="danger"
                              label="Needs review"
                              icon={getOrderStatus(order.status, { needsManualReview: true }).icon}
                              title={order.manualReviewReason || undefined}
                              className="h-5 px-1.5 text-[11px]"
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[16rem]">
                          <div className="truncate font-medium text-foreground">{order.userName}</div>
                          <div className="truncate text-muted-foreground">{order.userEmail}</div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-foreground/80">
                        {plural(order.items.length, 'item')}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {/* Only the current status and the valid next ones; a
                             finished order (cancelled, refunded) has nowhere to go.
                             A change asks for confirmation first. */}
                        <select
                          value={displayStatus(order)}
                          onChange={(e) => {
                            const next = e.target.value as Order['status'];
                            if (next === displayStatus(order)) return;
                            confirmOpenerRef.current = e.currentTarget;
                            setStatusTarget({ order, status: next });
                          }}
                          disabled={savingStatusId === order.id || choices.length < 2}
                          aria-label={`Status of order ${orderLabel(order)}`}
                          className={cn(
                            'h-8 cursor-pointer rounded-control border px-2 text-xs font-semibold transition-opacity disabled:cursor-default',
                            STATUS_TONE_CLASSES[status.tone],
                            savingStatusId === order.id && 'opacity-60',
                          )}
                        >
                          {choices.map((choice) => (
                            <option key={choice.value} value={choice.value}>
                              {choice.value === displayStatus(order) ? status.label : choice.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      {DELIVERY_PARTNERS_ENABLED && (
                        <td className="whitespace-nowrap px-4 py-3">
                          {order.delivery_boy_name ? (
                            <div className="flex items-center gap-2">
                              <div aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                                {order.delivery_boy_name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-foreground">{order.delivery_boy_name}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Not assigned</span>
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-foreground/80">
                        {formatDate(order.createdAt) || 'N/A'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                        {formatINR(order.total)}
                      </td>
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <IconButton
                          label={`Delete order ${orderLabel(order)}`}
                          size="sm"
                          onClick={(e) => {
                      confirmOpenerRef.current = e.currentTarget;
                      setDeleteTarget(order);
                    }}
                          className="text-muted-foreground hover:bg-status-danger-bg hover:text-status-danger-fg"
                        >
                          <Trash2 />
                        </IconButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canScrollRight && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent"
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete order ${orderLabel(deleteTarget)}?` : 'Delete order?'}
        description="The order is removed for you and the customer. This cannot be undone."
        confirmLabel="Delete order"
        tone="danger"
        onConfirm={() => (deleteTarget ? handleDeleteOrder(deleteTarget.id) : undefined)}
        returnFocusRef={confirmOpenerRef}
      />

      <ConfirmDialog
        open={!!statusTarget}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={
          statusTarget
            ? `Mark ${orderLabel(statusTarget.order)} as ${(STATUS_CHOICES.find((c) => c.value === statusTarget.status)?.label || statusTarget.status).toLowerCase()}?`
            : 'Change status?'
        }
        description="Status only moves forward in the workflow, so this cannot be undone from here."
        confirmLabel="Change status"
        onConfirm={() => (statusTarget ? handleStatusChange(statusTarget.order, statusTarget.status) : undefined)}
        returnFocusRef={confirmOpenerRef}
      />
    </div>
  );
};

export default AdminOrders;
