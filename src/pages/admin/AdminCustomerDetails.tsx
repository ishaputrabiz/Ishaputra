import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Calendar,
  ChevronLeft,
  ExternalLink,
  Mail,
  Package,
  Phone,
  ShoppingBag,
  TrendingUp,
  Users,
  Heart,
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getProduct } from '@/services/productService';
import { getUserWishlist } from '@/services/wishlistService';
import { normalizeOrderStatus, type Order } from '@/services/orderService';
import { UIProduct, adaptFirebaseToUI } from '@/lib/productAdapter';
import { SmartImage } from "@/components/ui/smart-image";
import { RewardsAdminPanel } from '@/components/admin/RewardsAdminPanel';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { IconButton } from '@/components/ui/icon-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { DetailSkeleton } from '@/components/skeletons';
import { EmptyState } from '@/components/EmptyState';
import { getOrderStatus, type OrderStatusContext } from '@/lib/orderStatus';
import { formatDate as fmtDate, formatINR, plural } from '@/lib/format';

interface CustomerOrder {
  id: string;
  orderNumber?: string;
  status: string;
  total: number;
  items: any[];
  createdAt: any;
  /** The fields the shared status map reads (COD, late return, return pickup). */
  statusContext: OrderStatusContext & { returnScheduledAt?: unknown };
}

interface CustomerDetails {
  uid: string;
  email: string;
  username: string;
  name?: string;
  phone?: string;
  role: string;
  createdAt: any;
  status?: string;
  orders: CustomerOrder[];
  wishlistItems: CustomerWishlistItem[];
  totalSpent: number;
}

interface CustomerWishlistItem extends UIProduct {
  addedAt?: any;
}

const formatDate = (timestamp: any) => (timestamp ? fmtDate(timestamp) || 'N/A' : 'N/A');

const formatPrice = (price: number) => formatINR(price);

/** The status chip, through the same map and rules as the orders list and the order page. */
const orderStatusDisplay = (order: CustomerOrder) => {
  const ctx = order.statusContext;
  const status =
    order.status === 'picked' && ctx.returnScheduledAt ? 'picked' : normalizeOrderStatus(order.status as Order['status']);
  return getOrderStatus(status, { ...ctx, needsManualReview: false });
};

const PANEL = 'panel bg-card p-5 text-card-foreground sm:p-6';
const HEADING_FONT = { fontFamily: 'var(--font-heading)', fontStretch: 'var(--font-heading-stretch)' } as const;

const AdminCustomerDetails = () => {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCustomer = async () => {
      if (!customerId) return;

      try {
        setLoading(true);
        const userSnap = await getDoc(doc(db, 'users', customerId));

        if (!userSnap.exists() || userSnap.data().role !== 'user') {
          setCustomer(null);
          return;
        }

        const userData = userSnap.data();
        // Orders live in the top-level 'orders' collection (read-only query).
        // allSettled: a failed wishlist read must not blank the whole page.
        const [ordersResult, wishlistResult] = await Promise.allSettled([
          getDocs(query(collection(db, 'orders'), where('userId', '==', customerId))),
          getUserWishlist(customerId),
        ]);
        if (ordersResult.status === 'rejected') {
          console.error('Error loading customer orders:', ordersResult.reason);
          toast.error('Failed to load this customer’s orders');
        }
        if (wishlistResult.status === 'rejected') {
          console.error('Error loading customer wishlist:', wishlistResult.reason);
        }
        const orderDocs = ordersResult.status === 'fulfilled' ? ordersResult.value.docs : [];
        const wishlistEntries = wishlistResult.status === 'fulfilled' ? wishlistResult.value : [];

        const orders = orderDocs
          .map((orderDoc) => {
            const data = orderDoc.data();
            return {
              id: orderDoc.id,
              orderNumber: data.orderId,
              status: data.status || 'pending',
              total: data.total || 0,
              items: data.items || [],
              createdAt: data.createdAt,
              statusContext: {
                paymentMethod: data.paymentMethod,
                deliveredAt: data.deliveredAt,
                returnRequestedAt: data.returnRequestedAt,
                returnStatus: data.returnStatus,
                returnReason: data.returnReason,
                returnScheduledAt: data.returnScheduledAt,
              },
            } as CustomerOrder;
          })
          .sort((first, second) => {
            const firstSeconds = first.createdAt?.seconds || 0;
            const secondSeconds = second.createdAt?.seconds || 0;
            return secondSeconds - firstSeconds;
          });

        const totalSpent = orders
          .filter((order) => order.status === 'delivered')
          .reduce((sum, order) => sum + order.total, 0);

        const wishlistProducts = (await Promise.all(
          wishlistEntries.map(async (entry) => {
            const product = await getProduct(entry.productId);
            if (!product) return null;

            return {
              ...adaptFirebaseToUI(product),
              addedAt: entry.addedAt,
            } as CustomerWishlistItem;
          }),
        )).filter(Boolean) as CustomerWishlistItem[];

        setCustomer({
          uid: userSnap.id,
          email: userData.email || '',
          username: userData.username || userData.name || 'Unknown',
          name: userData.name || userData.username || '',
          phone: userData.phone || '',
          role: userData.role,
          createdAt: userData.createdAt,
          status: userData.status || 'active',
          orders,
          wishlistItems: wishlistProducts,
          totalSpent,
        });
      } catch (error) {
        console.error('Error loading customer details:', error);
        toast.error('Failed to load customer details');
      } finally {
        setLoading(false);
      }
    };

    void loadCustomer();
  }, [customerId]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <DetailSkeleton label="Loading customer" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto w-full max-w-6xl rounded-card border border-foreground/[0.08] bg-card">
        <EmptyState
          icon={Users}
          as="h1"
          title="Customer not found"
          description="The requested customer record could not be loaded."
          action={{ label: 'Back to customers', to: '/admin/customers' }}
        />
      </div>
    );
  }

  const stats = [
    { label: 'Orders', value: String(customer.orders.length), icon: ShoppingBag },
    { label: 'Delivered revenue', value: formatPrice(customer.totalSpent), icon: TrendingUp },
    { label: 'Account status', value: (customer.status || 'active').replace(/^\w/, (c) => c.toUpperCase()), icon: Package },
    { label: 'Wishlist items', value: String(customer.wishlistItems.length), icon: Heart },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className={PANEL}>
        <div className="flex items-start gap-4">
          <div aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-foreground sm:size-16">
            {(customer.name || customer.username || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <AdminPageHeader
              eyebrow={
                <Link
                  to="/admin/customers"
                  className="-ml-1 inline-flex min-h-9 items-center gap-1 rounded-control px-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                  Back to customers
                </Link>
              }
              title={customer.name || customer.username}
              className="pb-0"
            />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Mail aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{customer.email}</span>
              </span>
              {customer.phone && (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Phone aria-hidden="true" className="size-3.5" />{customer.phone}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Calendar aria-hidden="true" className="size-3.5" />Joined {formatDate(customer.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {stats.map((s) => (
          <li key={s.label} className="flex items-center gap-3 rounded-card border border-foreground/[0.08] bg-card p-3 text-card-foreground shadow-sm sm:p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-muted text-foreground/70">
              <s.icon aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
              <p className="truncate text-xl font-semibold tabular-nums text-foreground sm:text-2xl" style={HEADING_FONT}>{s.value}</p>
            </div>
          </li>
        ))}
      </ul>

      {customerId && <RewardsAdminPanel customerId={customerId} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <section aria-labelledby="customer-orders-title" className={PANEL}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="customer-orders-title" className="text-base font-semibold text-foreground">Order history</h2>
            <span className="text-sm tabular-nums text-muted-foreground">{customer.orders.length} total</span>
          </div>

          {customer.orders.length === 0 ? (
            <p className="rounded-card border border-dashed border-foreground/15 bg-muted px-6 py-10 text-center text-sm text-muted-foreground">
              No orders available for this customer yet.
            </p>
          ) : (
            <ul className="divide-y divide-foreground/[0.08]">
              {customer.orders.map((order) => {
                const s = orderStatusDisplay(order);
                return (
                  <li key={order.id} className="relative flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/admin/orders/${order.id}`}
                          className="text-sm font-semibold tabular-nums text-foreground underline-offset-4 hover:text-primary hover:underline"
                        >
                          #{order.orderNumber || order.id.slice(0, 8).toUpperCase()}
                        </Link>
                        <StatusBadge tone={s.tone} label={s.label} icon={s.icon} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {plural(order.items.length, 'item')} · {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <span className="text-base font-semibold tabular-nums text-foreground">{formatPrice(order.total)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="customer-snapshot-title" className={PANEL}>
            <h2 id="customer-snapshot-title" className="text-base font-semibold text-foreground">Customer snapshot</h2>
            <dl className="mt-4 divide-y divide-foreground/[0.08] text-sm">
              <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                <dt className="shrink-0 whitespace-nowrap text-muted-foreground">Primary email</dt>
                <dd className="min-w-0 truncate font-medium text-foreground">{customer.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-muted-foreground">Primary phone</dt>
                <dd className="font-medium tabular-nums text-foreground">{customer.phone || 'Not provided'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5 last:pb-0">
                <dt className="text-muted-foreground">Member since</dt>
                <dd className="font-medium tabular-nums text-foreground">{formatDate(customer.createdAt)}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="customer-wishlist-title" className={PANEL}>
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-muted text-foreground/70">
                <Heart aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 id="customer-wishlist-title" className="text-base font-semibold text-foreground">Wishlist follow-up</h2>
                <p className="text-sm text-muted-foreground">Synced products this customer saved while signed in.</p>
              </div>
            </div>

            {customer.wishlistItems.length === 0 ? (
              <p className="mt-4 rounded-card border border-dashed border-foreground/15 bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
                No synced wishlist items yet. As this customer saves products while signed in, they will appear here for admin follow-up.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-foreground/[0.08]">
                {customer.wishlistItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <SmartImage src={item.image} alt="" className="size-14 shrink-0 rounded-control bg-muted object-cover" preset="thumb" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.category}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium tabular-nums text-foreground">{formatPrice(item.price)}</span>
                        <span>Saved {formatDate(item.addedAt)}</span>
                      </div>
                    </div>
                    <IconButton
                      label={`Open ${item.title}`}
                      size="sm"
                      tooltip
                      onClick={() => navigate(`/admin/products/${item.id}`)}
                    >
                      <ExternalLink />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminCustomerDetails;
