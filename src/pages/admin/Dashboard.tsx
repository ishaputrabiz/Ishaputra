import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  PackageMinus,
  ShoppingCart,
  ShoppingBag,
  IndianRupee,
  Plus,
  Coins,
  Save,
  ImagePlus,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAllProducts, Product } from '@/services/productService';
import { getAllOrders, Order } from '@/services/orderService';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { toast } from 'sonner';
import { SmartImage } from "@/components/ui/smart-image";
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard } from '@/components/admin/StatCard';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spinner } from '@/components/ui/spinner';
import { ListSkeleton, StatCardsSkeleton } from '@/components/skeletons';
import { getProductStatus } from '@/lib/orderStatus';
import { formatINR, formatNumber } from '@/lib/format';
import { SILVER_PRICING_ENABLED } from '@/config/features';

interface StatItem {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  /** Tints the value when it needs attention (low stock above zero). */
  valueClassName?: string;
  link: string;
}


const Dashboard = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Silver rate state
  const [silverInput, setSilverInput] = useState<string>('');
  const [silverSaved, setSilverSaved] = useState<number | null>(null);
  const [silverSaving, setSilverSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [productsData, ordersData] = await Promise.all([
          getAllProducts(),
          getAllOrders()
        ]);
        setProducts(productsData);
        setOrders(ordersData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Subscribe to the live silver rate, only while silver pricing is switched on.
  useEffect(() => {
    if (!SILVER_PRICING_ENABLED) return;
    const unsub = onSnapshot(doc(db, 'siteSettings', 'silverRate'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (typeof d.manualPricePerGramInr === 'number' && d.manualPricePerGramInr > 0) {
          setSilverSaved(d.manualPricePerGramInr);
          setSilverInput(String(d.manualPricePerGramInr));
        }
      }
    });
    return unsub;
  }, []);

  const handleSilverSave = async () => {
    const val = parseFloat(silverInput);
    if (!val || val <= 0) { toast.error('Enter a valid price per gram'); return; }
    setSilverSaving(true);
    try {
      await setDoc(
        doc(db, 'siteSettings', 'silverRate'),
        { manualOverride: true, manualPricePerGramInr: val, updatedAt: new Date().toISOString() },
        { merge: true },
      );
      toast.success('Silver rate updated');
    } catch {
      toast.error('Failed to save silver rate');
    } finally {
      setSilverSaving(false);
    }
  };

  const silverChanged = silverSaved !== null && parseFloat(silverInput) !== silverSaved;

  const lowStockProducts = products.filter(p => (p.inventory?.stock || 0) < 5).length;
  const outOfStockProducts = products.filter(p => (p.inventory?.stock || 0) === 0).length;

  // Calculate order statistics
  const deliveredOrders = orders.filter(order => order.status === 'delivered');
  const totalRevenue = deliveredOrders.reduce((sum, order) => sum + order.total, 0);
  const pendingOrders = orders.filter(order => order.status === 'pending').length;

  const stats: StatItem[] = [
    {
      title: 'Total revenue',
      value: formatINR(totalRevenue),
      subtitle: 'From delivered orders',
      icon: IndianRupee,
      link: '/admin/orders',
    },
    {
      title: 'Total orders',
      value: formatNumber(orders.length),
      subtitle: `${pendingOrders} pending`,
      icon: ShoppingBag,
      link: '/admin/orders',
    },
    {
      title: 'Products',
      value: formatNumber(products.length),
      subtitle: `${outOfStockProducts} out of stock`,
      icon: Package,
      link: '/admin/products',
    },
    {
      title: 'Low stock items',
      value: formatNumber(lowStockProducts),
      subtitle: 'Needs attention',
      icon: PackageMinus,
      valueClassName: lowStockProducts > 0 ? 'text-status-warning-fg' : undefined,
      link: '/admin/products',
    },
  ];

  const recentProducts = products.slice(0, 5);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <AdminPageHeader
        title="Dashboard"
        description="Welcome back. Here is today at Ishaputra Botanicals."
        className="pb-1"
        actions={
          <Button asChild>
            <Link to="/admin/products/new">
              <Plus aria-hidden="true" />
              Add product
            </Link>
          </Button>
        }
      />

      {/* Silver rate quick card: silver pricing feature only */}
      {SILVER_PRICING_ENABLED && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-control bg-muted text-foreground/70">
                  <Coins aria-hidden="true" className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Silver rate (live)</p>
                  {silverSaved !== null && (
                    <p className="text-xs tabular-nums text-muted-foreground">
                      Current: <span className="font-semibold text-foreground">{formatINR(silverSaved)}/g</span>
                      <span className="ml-2">10g: {formatINR(silverSaved * 10)} · 1kg: {formatINR(silverSaved * 1000)}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    min={1}
                    aria-label="Silver price per gram"
                    value={silverInput}
                    onChange={(e) => setSilverInput(e.target.value)}
                    className="h-9 w-28 pl-6 text-sm"
                    placeholder="price/g"
                  />
                </div>
                <Button size="sm" disabled={!silverChanged || silverSaving} onClick={handleSilverSave} className="shrink-0">
                  {silverSaving ? <Spinner /> : <Save aria-hidden="true" />}
                  <span className="hidden sm:inline">{silverSaving ? 'Saving' : 'Save rate'}</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      {loading ? (
        <StatCardsSkeleton label="Loading stats" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {stats.map((stat) => (
            <li key={stat.title}>
              <StatCard
                to={stat.link}
                label={stat.title}
                value={stat.value}
                icon={stat.icon}
                subtitle={stat.subtitle}
                valueClassName={stat.valueClassName}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Recent products and quick actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex h-16 flex-row items-center justify-between gap-2 space-y-0 px-5 py-0 sm:px-6">
            <h2 className="text-base font-semibold text-foreground">Recent products</h2>
            <Button asChild variant="ghost" size="sm" className="-mr-2 text-primary hover:text-primary">
              <Link to="/admin/products">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-5 sm:px-6">
            {loading ? (
              <ListSkeleton rows={3} thumb label="Loading products" className="rounded-none border-0 bg-transparent shadow-none [background-image:none] [&>div]:px-0" />
            ) : recentProducts.length > 0 ? (
              <ul className="divide-y divide-foreground/[0.08]">
                {recentProducts.map((product) => {
                  const status = getProductStatus({ isActive: product.flags?.isActive });
                  return (
                    <li key={product.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <SmartImage
                        src={product.media?.thumbnail || '/placeholder.png'}
                        alt=""
                        className="size-10 shrink-0 rounded-control bg-muted object-cover"
                        preset="tile"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{product.category}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <p className="text-sm font-medium tabular-nums text-foreground">{formatINR(product.price)}</p>
                        <StatusBadge tone={status.tone} label={status.label} icon={status.icon} className="h-5 px-1.5 text-[11px]" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="py-8 text-center">
                <Package aria-hidden="true" className="mx-auto mb-4 size-12 text-muted-foreground/70" />
                <p className="text-foreground/80">No products yet</p>
                <Button asChild size="sm" className="mt-4">
                  <Link to="/admin/products/new">Add first product</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex h-16 flex-row items-center space-y-0 px-5 py-0 sm:px-6">
            <h2 className="text-base font-semibold text-foreground">Quick actions</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-5 sm:px-6">
            <Button asChild variant="outline" size="sm" className="h-10 w-full justify-start">
              <Link to="/admin/products/new">
                <Package aria-hidden="true" />
                Add new product
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-10 w-full justify-start">
              <Link to="/admin/orders">
                <ShoppingCart aria-hidden="true" />
                View orders
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-10 w-full justify-start">
              <Link to="/admin/media">
                <ImagePlus aria-hidden="true" />
                Upload media
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
