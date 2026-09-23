import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getProduct } from '@/services/productService';
import { getUserWishlist } from '@/services/wishlistService';
import { UIProduct, adaptFirebaseToUI } from '@/lib/productAdapter';
import { SmartImage } from "@/components/ui/smart-image";

interface CustomerOrder {
  id: string;
  orderNumber?: string;
  status: string;
  total: number;
  items: any[];
  createdAt: any;
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

const statusColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  processing: 'bg-orange-50 text-orange-700 border border-orange-200',
  shipped: 'bg-blue-50 text-blue-700 border border-blue-200',
  outForDelivery: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  delivered: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border border-red-200',
  returnRequested: 'bg-amber-50 text-amber-700 border border-amber-200',
  returned: 'bg-gray-50 text-gray-700 border border-gray-200',
};

const formatDate = (timestamp: any) => {
  if (!timestamp) return 'N/A';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatPrice = (price: number) =>
  `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

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
        const [ordersSnap, wishlistEntries] = await Promise.all([
          getDocs(collection(db, 'users', customerId, 'orders')),
          getUserWishlist(customerId),
        ]);
        const orders = ordersSnap.docs
          .map((orderDoc) => ({
            id: orderDoc.id,
            orderNumber: orderDoc.data().orderNumber,
            status: orderDoc.data().status || 'pending',
            total: orderDoc.data().total || 0,
            items: orderDoc.data().items || [],
            createdAt: orderDoc.data().createdAt,
          }))
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <Users className="mx-auto h-12 w-12 text-gray-300" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Customer not found</h1>
          <p className="mt-1 text-sm text-gray-500">The requested customer record could not be loaded.</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/admin/customers')}>Back to Customers</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-amber-200/40 bg-gradient-to-br from-amber-50 via-white to-orange-50/30 p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-2xl font-bold text-amber-700">
            {(customer.name || customer.username || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <button onClick={() => navigate('/admin/customers')} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800">
              <ChevronLeft className="h-4 w-4" />
              Back to Customers
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name || customer.username}</h1>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-500">
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{customer.email}</span>
              {customer.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{customer.phone}</span>}
              <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Joined {formatDate(customer.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600"><ShoppingBag className="h-5 w-5" /></div>
            <div>
              <p className="text-sm text-gray-500">Orders</p>
              <p className="text-2xl font-bold text-gray-900">{customer.orders.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600"><TrendingUp className="h-5 w-5" /></div>
            <div>
              <p className="text-sm text-gray-500">Delivered Revenue</p>
              <p className="text-2xl font-bold text-gray-900">{formatPrice(customer.totalSpent)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-50 p-3 text-amber-600"><Package className="h-5 w-5" /></div>
            <div>
              <p className="text-sm text-gray-500">Account Status</p>
              <p className="text-2xl font-bold capitalize text-gray-900">{customer.status || 'active'}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-rose-50 p-3 text-rose-600"><Heart className="h-5 w-5" /></div>
            <div>
              <p className="text-sm text-gray-500">Wishlist Items</p>
              <p className="text-2xl font-bold text-gray-900">{customer.wishlistItems.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Order History</h2>
            <span className="text-sm text-gray-500">{customer.orders.length} total</span>
          </div>

          {customer.orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
              No orders available for this customer yet.
            </div>
          ) : (
            <div className="space-y-3">
              {customer.orders.map((order) => (
                <div key={order.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-amber-700">#{order.orderNumber || order.id.slice(0, 8).toUpperCase()}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[order.status] || 'bg-gray-100 text-gray-600'}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1).replace(/([A-Z])/g, ' $1')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{order.items.length} item{order.items.length !== 1 ? 's' : ''} • {formatDate(order.createdAt)}</p>
                  </div>
                  <span className="text-base font-semibold text-gray-900">{formatPrice(order.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Customer Snapshot</h2>
            <div className="mt-4 space-y-3 text-sm text-gray-600">
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <span>Primary Email</span>
                <span className="font-medium text-gray-900">{customer.email}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <span>Primary Phone</span>
                <span className="font-medium text-gray-900">{customer.phone || 'Not provided'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <span>Member Since</span>
                <span className="font-medium text-gray-900">{formatDate(customer.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-rose-50 p-3 text-rose-600"><Heart className="h-5 w-5" /></div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Wishlist Follow-up</h2>
                <p className="text-sm text-gray-500">Synced products this customer saved while signed in.</p>
              </div>
            </div>

            {customer.wishlistItems.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                No synced wishlist items yet. As this customer saves products while signed in, they will appear here for admin follow-up.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {customer.wishlistItems.map((item) => (
                  <div key={item.id} className="flex gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                    <SmartImage src={item.image} alt={item.title} className="h-16 w-16 rounded-xl object-cover" preset="thumb" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-1 text-xs text-gray-500">{item.category}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-900">{formatPrice(item.price)}</span>
                        <span>Saved {formatDate(item.addedAt)}</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/admin/products/${item.id}`)}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Open
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCustomerDetails;