import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Users as UsersIcon, Mail, ShoppingBag, TrendingUp, X, LayoutGrid, List, Trash2,
  RotateCcw, Phone, Clock, UserX,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  collection, getDocs, query, where, doc, updateDoc,
  deleteDoc, serverTimestamp, deleteField,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { getAllOrders, type Order } from '@/services/orderService';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Checkbox } from '@/components/ui/checkbox';
import { IconButton } from '@/components/ui/icon-button';
import { Notice } from '@/components/ui/notice';
import { StatusBadge } from '@/components/ui/status-badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ListSkeleton, StatCardsSkeleton } from '@/components/skeletons';
import { EmptyState } from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import { formatDate as fmtDate, formatINR, formatNumber, plural } from '@/lib/format';
import { cn } from '@/lib/utils';

interface CustomerOrder {
  id: string;
  orderNumber?: string;
  status: string;
  total: number;
  items: any[];
  createdAt: any;
}

interface Customer {
  uid: string;
  email: string;
  username: string;
  name?: string;
  phone?: string;
  role: string;
  createdAt: any;
  orders: CustomerOrder[];
  totalSpent: number;
  status?: string;
  trashedAt?: any;
}

const formatDate = (timestamp: any) => (timestamp ? fmtDate(timestamp) || 'N/A' : 'N/A');

const formatPrice = (price: number) => formatINR(price);

const getDaysRemaining = (trashedAt: any): number => {
  if (!trashedAt) return 30;
  const date = trashedAt.toDate ? trashedAt.toDate() : new Date(trashedAt.seconds * 1000);
  const daysIn = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, 30 - daysIn);
};

const displayName = (c: Customer) => c.name || c.username;
const initial = (c: Customer) => (c.name || c.username || 'U').charAt(0).toUpperCase();

const HEADING_FONT = { fontFamily: 'var(--font-heading)', fontStretch: 'var(--font-heading-stretch)' } as const;

const AdminCustomers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState<'customers' | 'trash'>('customers');
  const [selectedProfile, setSelectedProfile] = useState<Customer | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'soft' | 'permanent' | 'batch-soft' | 'batch-permanent';
    customer?: Customer;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      // Orders live in the top-level 'orders' collection (users/<uid>/orders is
      // never written), so read them once, as the dashboard does, and group by
      // customer. A failed order read leaves the customers listed with 0 orders.
      const [usersSnap, allOrders] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('role', '==', 'user'))),
        getAllOrders().catch((error) => {
          console.error('Error fetching orders for customers:', error);
          return [] as Order[];
        }),
      ]);
      const ordersByUser = new Map<string, CustomerOrder[]>();
      for (const o of allOrders) {
        if (!o.userId) continue;
        const entry: CustomerOrder = {
          id: o.id,
          orderNumber: o.orderId,
          status: o.status || 'pending',
          total: o.total || 0,
          items: o.items || [],
          createdAt: o.createdAt,
        };
        const existing = ordersByUser.get(o.userId);
        if (existing) existing.push(entry);
        else ordersByUser.set(o.userId, [entry]);
      }
      const usersData: Customer[] = usersSnap.docs.map((d) => {
        const orders = ordersByUser.get(d.id) || [];
        // Same rule as before: spend counts delivered orders only.
        const totalSpent = orders.filter(o => o.status === 'delivered').reduce((s, o) => s + o.total, 0);
        return {
          uid: d.id,
          email: d.data().email || '',
          username: d.data().username || d.data().name || 'Unknown',
          name: d.data().name || d.data().username || '',
          phone: d.data().phone || '',
          role: d.data().role,
          createdAt: d.data().createdAt,
          status: d.data().status || 'active',
          trashedAt: d.data().trashedAt || null,
          orders,
          totalSpent,
        };
      });
      usersData.sort((a, b) => b.orders.length - a.orders.length);
      setCustomers(usersData);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('Failed to load customers');
    } finally { setLoading(false); }
  };

  const active = customers.filter(c => c.status !== 'trashed');
  const trashed = customers.filter(c => c.status === 'trashed');
  const list = (activeTab === 'customers' ? active : trashed).filter(c => {
    const q = searchQuery.toLowerCase();
    return c.username?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) ||
      c.name?.toLowerCase().includes(q) || c.phone?.includes(q);
  });

  const toggleSelect = (uid: string) => setSelectedIds(prev => {
    const n = new Set(prev);
    n.has(uid) ? n.delete(uid) : n.add(uid);
    return n;
  });
  const toggleSelectAll = () => setSelectedIds(
    selectedIds.size === list.length ? new Set() : new Set(list.map(c => c.uid))
  );

  const softDelete = async (c: Customer) => {
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', c.uid), { status: 'trashed', trashedAt: serverTimestamp() });
      setCustomers(prev => prev.map(x =>
        x.uid === c.uid ? { ...x, status: 'trashed', trashedAt: { seconds: Date.now() / 1000 } } : x
      ));
      toast.success(`${c.name || c.username} moved to trash`);
      setDeleteConfirm(null);
      if (selectedProfile?.uid === c.uid) setSelectedProfile(null);
    } catch { toast.error('Failed to move to trash'); }
    finally { setSubmitting(false); }
  };

  const restore = async (c: Customer) => {
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', c.uid), { status: deleteField(), trashedAt: deleteField() });
      setCustomers(prev => prev.map(x => x.uid === c.uid ? { ...x, status: 'active', trashedAt: null } : x));
      toast.success(`${c.name || c.username} restored`);
    } catch { toast.error('Failed to restore'); }
    finally { setSubmitting(false); }
  };

  const permDelete = async (c: Customer) => {
    setSubmitting(true);
    try {
      await deleteDoc(doc(db, 'users', c.uid));
      setCustomers(prev => prev.filter(x => x.uid !== c.uid));
      toast.success(`${c.name || c.username} permanently deleted`);
      setDeleteConfirm(null);
      if (selectedProfile?.uid === c.uid) setSelectedProfile(null);
    } catch { toast.error('Failed to delete'); }
    finally { setSubmitting(false); }
  };

  const batchSoftDelete = async () => {
    setSubmitting(true);
    try {
      await Promise.all([...selectedIds].map(uid =>
        updateDoc(doc(db, 'users', uid), { status: 'trashed', trashedAt: serverTimestamp() })
      ));
      setCustomers(prev => prev.map(c =>
        selectedIds.has(c.uid) ? { ...c, status: 'trashed', trashedAt: { seconds: Date.now() / 1000 } } : c
      ));
      toast.success(`${selectedIds.size} moved to trash`);
      setSelectedIds(new Set());
      setDeleteConfirm(null);
    } catch { toast.error('Batch delete failed'); }
    finally { setSubmitting(false); }
  };

  const batchRestore = async () => {
    setSubmitting(true);
    try {
      await Promise.all([...selectedIds].map(uid =>
        updateDoc(doc(db, 'users', uid), { status: deleteField(), trashedAt: deleteField() })
      ));
      setCustomers(prev => prev.map(c =>
        selectedIds.has(c.uid) ? { ...c, status: 'active', trashedAt: null } : c
      ));
      toast.success(`${selectedIds.size} restored`);
      setSelectedIds(new Set());
    } catch { toast.error('Batch restore failed'); }
    finally { setSubmitting(false); }
  };

  const batchPermDelete = async () => {
    setSubmitting(true);
    try {
      await Promise.all([...selectedIds].map(uid => deleteDoc(doc(db, 'users', uid))));
      setCustomers(prev => prev.filter(c => !selectedIds.has(c.uid)));
      toast.success(`${selectedIds.size} permanently deleted`);
      setSelectedIds(new Set());
      setDeleteConfirm(null);
    } catch { toast.error('Batch delete failed'); }
    finally { setSubmitting(false); }
  };

  const isTrash = activeTab === 'trash';
  const totalRevenue = active.reduce((s, c) => s + c.totalSpent, 0);
  const isPermanent = deleteConfirm?.type === 'permanent' || deleteConfirm?.type === 'batch-permanent';

  const stats = [
    { label: 'Total customers', value: formatNumber(active.length), icon: UsersIcon },
    { label: 'Total orders', value: formatNumber(active.reduce((s, c) => s + c.orders.length, 0)), icon: ShoppingBag },
    { label: 'Total revenue', value: formatPrice(totalRevenue), icon: TrendingUp },
  ];

  const trashLeft = (daysLeft: number, short = false) => (
    <StatusBadge
      tone={daysLeft <= 7 ? 'danger' : 'warning'}
      icon={Clock}
      label={daysLeft > 0 ? (short ? `${daysLeft}d left` : `${plural(daysLeft, 'day')} left`) : 'Expires today'}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <AdminPageHeader
        title="Customers"
        description="Manage registered customers and their data."
        className="pb-0"
      />

      {/* Stats */}
      {loading ? (
        <StatCardsSkeleton count={3} label="" className="lg:grid-cols-3" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
          {stats.map((s, i) => (
            <li
              key={s.label}
              className={cn(
                'flex items-center gap-3 rounded-card border border-foreground/[0.08] bg-card p-3 text-card-foreground shadow-sm sm:gap-4 sm:p-4',
                i === 2 && 'col-span-2 sm:col-span-1',
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-muted text-foreground/70">
                <s.icon aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                <p className="truncate text-2xl font-semibold tabular-nums text-foreground" style={HEADING_FONT}>{s.value}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Tabs + controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <ToggleGroup
          type="single"
          value={activeTab}
          onValueChange={(v) => {
            if (!v) return;
            setActiveTab(v as 'customers' | 'trash');
            setSelectedIds(new Set());
          }}
          aria-label="Show"
          className="shrink-0 self-start"
        >
          <ToggleGroupItem value="customers" size="sm" className="gap-1.5 px-3">
            <UsersIcon aria-hidden="true" className="size-4" />
            Customers
            <span className="rounded-chip bg-muted px-1.5 text-xs tabular-nums text-foreground/80">{active.length}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="trash" size="sm" className="gap-1.5 px-3">
            <Trash2 aria-hidden="true" className="size-4" />
            Trash
            {trashed.length > 0 && (
              <span className="rounded-chip bg-status-danger-bg px-1.5 text-xs tabular-nums text-status-danger-fg">{trashed.length}</span>
            )}
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="relative flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search customers"
            placeholder="Search by name, email or phone"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => v && setViewMode(v as 'grid' | 'list')}
          aria-label="Customer view"
          className="shrink-0 self-end sm:self-auto"
        >
          <ToggleGroupItem value="grid" aria-label="Grid view" size="sm" className="size-9 px-0">
            <LayoutGrid aria-hidden="true" className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view" size="sm" className="size-9 px-0">
            <List aria-hidden="true" className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="flex flex-wrap items-center gap-3 rounded-card border border-primary/25 bg-primary/10 px-4 py-3"
          >
            <span role="status" className="text-sm font-medium tabular-nums text-foreground">{selectedIds.size} selected</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
                {selectedIds.size === list.length ? 'Deselect all' : 'Select all'}
              </Button>
              {isTrash ? (
                <>
                  <Button variant="outline" size="sm" onClick={batchRestore} disabled={submitting}>
                    <RotateCcw aria-hidden="true" />Restore all
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm({ type: 'batch-permanent' })}>
                    <Trash2 aria-hidden="true" />Delete all
                  </Button>
                </>
              ) : (
                <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm({ type: 'batch-soft' })}>
                  <Trash2 aria-hidden="true" />Move to trash
                </Button>
              )}
              <IconButton label="Clear selection" size="sm" onClick={() => setSelectedIds(new Set())}>
                <X />
              </IconButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trash notice */}
      {isTrash && trashed.length > 0 && (
        <Notice tone="warning">
          Customers in trash are permanently deleted after 30 days. Restore to prevent data loss.
        </Notice>
      )}

      {/* Content */}
      {loading ? (
        <ListSkeleton rows={4} thumb label="Loading customers" />
      ) : list.length === 0 ? (
        <div className="rounded-card border border-foreground/[0.08] bg-card">
          <EmptyState
            icon={isTrash ? UserX : UsersIcon}
            title={isTrash ? 'Trash is empty' : 'No customers found'}
            description={isTrash ? 'Customers you move to trash appear here for 30 days.' : searchQuery ? 'Try another name, email or phone.' : undefined}
            as="h2"
          />
        </div>
      ) : viewMode === 'grid' ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map(customer => {
            const sel = selectedIds.has(customer.uid);
            const daysLeft = isTrash ? getDaysRemaining(customer.trashedAt) : 30;
            return (
              <li
                key={customer.uid}
                className={cn(
                  'group relative flex flex-col overflow-hidden rounded-card border bg-card text-card-foreground shadow-sm transition-[box-shadow,border-color] duration-hover ease-out',
                  'has-[a[data-card-link]:focus-visible]:outline has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-ring',
                  sel ? 'border-primary/60 ring-2 ring-primary/20' : 'border-foreground/[0.08] hover:border-primary/40 hover:shadow-panel',
                )}
              >
                <div className="absolute left-2 top-2 z-raised flex size-11 items-center justify-center">
                  <Checkbox
                    checked={sel}
                    onCheckedChange={() => toggleSelect(customer.uid)}
                    aria-label={`Select ${displayName(customer)}`}
                  />
                </div>
                <div className="p-5 pt-4">
                  <div className="mt-4 flex flex-col items-center text-center">
                    <div aria-hidden="true" className="mb-3 flex size-14 items-center justify-center rounded-full bg-muted">
                      <span className="text-xl font-semibold text-foreground">{initial(customer)}</span>
                    </div>
                    <Link
                      to={`/admin/customers/${customer.uid}`}
                      data-card-link
                      className="w-full truncate font-semibold text-foreground outline-none after:absolute after:inset-0 after:content-['']"
                    >
                      {displayName(customer)}
                    </Link>
                    <p className="mt-0.5 w-full truncate text-xs text-muted-foreground">{customer.email}</p>
                    {customer.phone && <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{customer.phone}</p>}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-control bg-muted py-2">
                      <p className="text-sm font-semibold tabular-nums text-foreground">{customer.orders.length}</p>
                      <p className="text-xs text-muted-foreground">Orders</p>
                    </div>
                    <div className="rounded-control bg-muted py-2">
                      <p className="truncate text-sm font-semibold tabular-nums text-foreground">{formatPrice(customer.totalSpent)}</p>
                      <p className="text-xs text-muted-foreground">Spent</p>
                    </div>
                  </div>
                  {isTrash && <div className="mt-3 flex justify-center">{trashLeft(daysLeft)}</div>}
                </div>
                <div className="mt-auto flex items-center justify-end gap-2 border-t border-foreground/[0.08] px-3 py-2">
                  {isTrash ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => restore(customer)} disabled={submitting} className="relative z-raised">
                        <RotateCcw aria-hidden="true" />Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirm({ type: 'permanent', customer })}
                        className="relative z-raised text-status-danger-fg hover:bg-status-danger-bg hover:text-status-danger-fg"
                      >
                        <Trash2 aria-hidden="true" />Delete
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm({ type: 'soft', customer })}
                      className="relative z-raised text-muted-foreground hover:bg-status-danger-bg hover:text-status-danger-fg"
                    >
                      <Trash2 aria-hidden="true" />Trash
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-card border border-foreground/[0.08] bg-card text-card-foreground">
          <div className="flex items-center gap-4 border-b border-foreground/[0.08] bg-muted/50 px-5 py-2">
            <div className="flex size-6 items-center justify-center">
              <Checkbox
                checked={selectedIds.size === list.length && list.length > 0}
                onCheckedChange={toggleSelectAll}
                aria-label="Select all customers"
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground">Customer</span>
            <div aria-hidden="true" className="ml-auto mr-[5.5rem] hidden items-center gap-6 text-xs font-medium text-muted-foreground sm:flex">
              <span className="w-14 text-center">Orders</span>
              <span className="w-20 text-center">Spent</span>
              <span className="w-24 text-center">{isTrash ? 'Days left' : 'Joined'}</span>
            </div>
          </div>
          <ul>
            {list.map(customer => {
              const sel = selectedIds.has(customer.uid);
              const daysLeft = isTrash ? getDaysRemaining(customer.trashedAt) : 30;
              return (
                <li
                  key={customer.uid}
                  className={cn(
                    'relative flex items-center gap-4 border-b border-foreground/[0.06] px-5 py-3 transition-colors duration-hover last:border-0 hover:bg-muted/60',
                    sel && 'bg-primary/[0.06]',
                  )}
                >
                  <div className="relative z-raised flex size-6 shrink-0 items-center justify-center">
                    <Checkbox
                      checked={sel}
                      onCheckedChange={() => toggleSelect(customer.uid)}
                      aria-label={`Select ${displayName(customer)}`}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <span className="text-sm font-semibold text-foreground">{initial(customer)}</span>
                    </div>
                    <div className="min-w-0">
                      <Link
                        to={`/admin/customers/${customer.uid}`}
                        className="block truncate font-medium text-foreground focus-inset after:absolute after:inset-0 after:content-[''] hover:text-primary"
                      >
                        {displayName(customer)}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-3">
                        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                          <Mail aria-hidden="true" className="size-3 shrink-0" /><span className="truncate">{customer.email}</span>
                        </span>
                        {customer.phone && (
                          <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                            <Phone aria-hidden="true" className="size-3" />{customer.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="hidden shrink-0 items-center gap-6 sm:flex">
                    <div className="w-14 text-center">
                      <p className="text-sm font-semibold tabular-nums text-foreground">{customer.orders.length}</p>
                      <p className="sr-only">Orders</p>
                    </div>
                    <div className="w-20 text-center">
                      <p className="text-sm font-semibold tabular-nums text-foreground">{formatPrice(customer.totalSpent)}</p>
                      <p className="sr-only">Spent</p>
                    </div>
                    <div className="flex w-24 justify-center">
                      {isTrash ? (
                        trashLeft(daysLeft, true)
                      ) : (
                        <p className="text-xs tabular-nums text-foreground/80">
                          <span className="sr-only">Joined </span>{formatDate(customer.createdAt)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="relative z-raised flex shrink-0 items-center gap-1">
                    {isTrash ? (
                      <>
                        <IconButton label={`Restore ${displayName(customer)}`} size="sm" onClick={() => restore(customer)} disabled={submitting}>
                          <RotateCcw />
                        </IconButton>
                        <IconButton
                          label={`Delete ${displayName(customer)} permanently`}
                          size="sm"
                          onClick={() => setDeleteConfirm({ type: 'permanent', customer })}
                          className="text-status-danger-fg hover:bg-status-danger-bg hover:text-status-danger-fg"
                        >
                          <Trash2 />
                        </IconButton>
                      </>
                    ) : (
                      <IconButton
                        label={`Move ${displayName(customer)} to trash`}
                        size="sm"
                        onClick={() => setDeleteConfirm({ type: 'soft', customer })}
                        className="text-muted-foreground hover:bg-status-danger-bg hover:text-status-danger-fg"
                      >
                        <Trash2 />
                      </IconButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Confirm dialog (the profile drawer was never opened from this page, so it is gone) */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={open => { if (!open) setDeleteConfirm(null); }}
        title={
          deleteConfirm?.type === 'permanent' && deleteConfirm.customer
            ? `Permanently delete ${displayName(deleteConfirm.customer)}?`
            : deleteConfirm?.type === 'soft' && deleteConfirm.customer
              ? `Move ${displayName(deleteConfirm.customer)} to trash?`
              : deleteConfirm?.type === 'batch-permanent'
                ? `Permanently delete ${plural(selectedIds.size, 'customer')}?`
                : `Move ${plural(selectedIds.size, 'customer')} to trash?`
        }
        description={isPermanent ? 'This cannot be undone.' : 'You can restore them from Trash within 30 days.'}
        confirmLabel={isPermanent ? 'Delete permanently' : 'Move to trash'}
        tone={isPermanent ? 'danger' : 'default'}
        onConfirm={() => {
          if (deleteConfirm?.type === 'soft' && deleteConfirm.customer) return softDelete(deleteConfirm.customer);
          if (deleteConfirm?.type === 'permanent' && deleteConfirm.customer) return permDelete(deleteConfirm.customer);
          if (deleteConfirm?.type === 'batch-soft') return batchSoftDelete();
          if (deleteConfirm?.type === 'batch-permanent') return batchPermDelete();
          return undefined;
        }}
      />
    </div>
  );
};

export default AdminCustomers;
