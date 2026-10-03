import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  Clock,
  Mail,
  MapPin,
  Package,
  Phone,
  Star,
  Truck,
  UserCheck,
} from 'lucide-react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { DeliveryBoy, getDeliveryBoyById } from '@/services/deliveryBoyService';
import { getDeliveryBoyOrders, Order } from '@/services/orderService';
import { SmartImage } from "@/components/ui/smart-image";

interface DeliveryRating {
  id: string;
  rating: number;
  comment?: string;
  createdAt?: { seconds?: number };
  customerName?: string;
}

const formatDate = (value: any) => {
  if (!value) return 'N/A';
  const date = value.toDate ? value.toDate() : new Date((value.seconds || 0) * 1000);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatPrice = (price: number) => `₹${price.toLocaleString('en-IN')}`;

const AdminDeliveryBoyDetails = () => {
  const navigate = useNavigate();
  const { deliveryBoyId } = useParams();
  const [deliveryBoy, setDeliveryBoy] = useState<DeliveryBoy | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ratings, setRatings] = useState<DeliveryRating[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      if (!deliveryBoyId) return;

      try {
        setLoading(true);
        const [boy, assignedOrders, ratingsSnap] = await Promise.all([
          getDeliveryBoyById(deliveryBoyId),
          getDeliveryBoyOrders(deliveryBoyId),
          getDocs(query(collection(db, 'deliveryRatings'), where('deliveryBoyId', '==', deliveryBoyId), orderBy('createdAt', 'desc'))),
        ]);

        setDeliveryBoy(boy);
        setOrders(assignedOrders);
        setRatings(ratingsSnap.docs.map((ratingDoc) => ({ id: ratingDoc.id, ...ratingDoc.data() })) as DeliveryRating[]);
      } catch (error) {
        console.error('Error loading delivery boy profile:', error);
        toast.error('Failed to load delivery partner details');
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, [deliveryBoyId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!deliveryBoy) {
    return (
      <div className="space-y-4 rounded-panel border border-border bg-card p-8 text-center">
        <Truck className="mx-auto h-12 w-12 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Delivery partner not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">The requested delivery partner record could not be loaded.</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/admin/delivery-boys')}>Back to Delivery Boys</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-panel border border-border bg-card p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          {deliveryBoy.profileImage ? (
            <SmartImage src={deliveryBoy.profileImage} alt={deliveryBoy.name} className="h-16 w-16 rounded-full object-cover shadow-sm" preset="thumb" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-bold text-primary">
              {deliveryBoy.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <button onClick={() => navigate('/admin/delivery-boys')} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary">
              <ChevronLeft className="h-4 w-4" />
              Back to Delivery Boys
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{deliveryBoy.name}</h1>
              <Badge className={deliveryBoy.isActive ? 'bg-status-success-bg text-status-success-fg hover:bg-status-success-bg' : 'bg-muted text-foreground/80 hover:bg-muted'}>
                {deliveryBoy.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{deliveryBoy.email}</span>
              <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{deliveryBoy.phone}</span>
              <span className="inline-flex items-center gap-1.5 capitalize"><Truck className="h-3.5 w-3.5" />{deliveryBoy.vehicleType}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-panel border border-border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Assigned Orders</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{orders.length}</p>
        </div>
        <div className="rounded-panel border border-border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Active Orders</p>
          <p className="mt-1 text-2xl font-bold text-primary">{orders.filter((order) => order.status !== 'delivered' && order.status !== 'cancelled').length}</p>
        </div>
        <div className="rounded-panel border border-border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Completed Deliveries</p>
          <p className="mt-1 text-2xl font-bold text-status-success-fg">{deliveryBoy.totalDeliveries}</p>
        </div>
        <div className="rounded-panel border border-border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Average Rating</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{deliveryBoy.rating.toFixed(1)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <div className="rounded-panel border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Assigned Orders</h2>
            <span className="text-sm text-muted-foreground">{orders.length} total</span>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-panel border border-dashed border-border bg-muted/50 px-6 py-10 text-center text-sm text-muted-foreground">
              No orders have been assigned to this delivery partner yet.
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div key={order.id} className="flex flex-col gap-3 rounded-panel border border-border bg-muted/50 px-4 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-primary">ORD-{order.orderId}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{order.userName} • {formatDate(order.createdAt)} • {order.items.length} item{order.items.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-foreground/80 border border-border">{order.status}</span>
                    <span className="text-sm font-semibold text-foreground">{formatPrice(order.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-panel border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Profile Details</h2>
            <div className="mt-4 space-y-3 text-sm text-foreground/80">
              <div className="flex items-center justify-between rounded-card bg-muted/50 px-4 py-3">
                <span>Email</span>
                <span className="font-medium text-foreground">{deliveryBoy.email}</span>
              </div>
              <div className="flex items-center justify-between rounded-card bg-muted/50 px-4 py-3">
                <span>Phone</span>
                <span className="font-medium text-foreground">{deliveryBoy.phone}</span>
              </div>
              <div className="flex items-start justify-between gap-4 rounded-card bg-muted/50 px-4 py-3">
                <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Address</span>
                <span className="text-right font-medium text-foreground">{deliveryBoy.address || 'Not provided'}</span>
              </div>
              <div className="flex items-center justify-between rounded-card bg-muted/50 px-4 py-3">
                <span>Updated</span>
                <span className="font-medium text-foreground">{formatDate(deliveryBoy.updatedAt)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-panel border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-card bg-primary/10 p-3 text-primary"><Star className="h-5 w-5" /></div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Customer Ratings</h2>
                <p className="text-sm text-muted-foreground">Most recent delivery feedback.</p>
              </div>
            </div>
            {ratings.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No delivery ratings have been recorded yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {ratings.slice(0, 6).map((rating) => (
                  <div key={rating.id} className="rounded-card border border-border bg-muted/50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Star className="h-4 w-4 fill-primary text-primary" />
                        {rating.rating.toFixed(1)}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(rating.createdAt)}</span>
                    </div>
                    {rating.comment && <p className="mt-2 text-sm text-foreground/80">{rating.comment}</p>}
                    {rating.customerName && <p className="mt-2 text-xs text-muted-foreground">From {rating.customerName}</p>}
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

export default AdminDeliveryBoyDetails;