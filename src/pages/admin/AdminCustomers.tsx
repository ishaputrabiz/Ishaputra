import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Users as UsersIcon, Mail, Calendar, Package,
  ShoppingBag, TrendingUp, X, LayoutGrid, List, Trash2,
  RotateCcw, AlertTriangle, Phone,
  ChevronRight, Clock, UserX,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  collection, getDocs, query, where, doc, updateDoc,
  deleteDoc, serverTimestamp, deleteField,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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

const getDaysRemaining = (trashedAt: any): number => {
  if (!trashedAt) return 30;
  const date = trashedAt.toDate ? trashedAt.toDate() : new Date(trashedAt.seconds * 1000);
  const daysIn = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, 30 - daysIn);
};

const AdminCustomers: React.FC = () => {
  const navigate = useNavigate();
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
      const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'user')));
      const usersData: Customer[] = usersSnap.docs.map((d) => ({
        uid: d.id,
        email: d.data().email || '',
        username: d.data().username || d.data().name || 'Unknown',
        name: d.data().name || d.data().username || '',
        phone: d.data().phone || '',
        role: d.data().role,
        createdAt: d.data().createdAt,
        status: d.data().status || 'active',
        trashedAt: d.data().trashedAt || null,
        orders: [],
        totalSpent: 0,
      }));
      const withOrders = await Promise.all(
        usersData.map(async (customer) => {
          try {
            const ordersSnap = await getDocs(collection(db, 'users', customer.uid, 'orders'));
            const orders: CustomerOrder[] = ordersSnap.docs.map((oDoc) => ({
              id: oDoc.id,
              orderNumber: oDoc.data().orderNumber,
              status: oDoc.data().status || 'pending',
              total: oDoc.data().total || 0,
              items: oDoc.data().items || [],
              createdAt: oDoc.data().createdAt,
            }));
            const totalSpent = orders.filter(o => o.status === 'delivered').reduce((s, o) => s + o.total, 0);
            return { ...customer, orders, totalSpent };
          } catch { return customer; }
        })
      );
      withOrders.sort((a, b) => b.orders.length - a.orders.length);
      setCustomers(withOrders);
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

  const CheckIcon = ({ checked }: { checked: boolean }) => (
    <span className={`inline-flex w-5 h-5 rounded border-2 items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>
      {checked && <span className="text-white text-xs font-bold leading-none">✓</span>}
    </span>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <p className="text-gray-600 mt-1">Manage registered customers and their data</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
            <UsersIcon className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Customers</p>
            <p className="text-2xl font-bold text-gray-900">{active.length}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
            <ShoppingBag className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Orders</p>
            <p className="text-2xl font-bold text-gray-900">{active.reduce((s, c) => s + c.orders.length, 0)}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Revenue</p>
            <p className="text-2xl font-bold text-gray-900">{formatPrice(totalRevenue)}</p>
          </div>
        </div>
      </div>

      {/* Tabs + Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1 flex-shrink-0">
          <button
            onClick={() => { setActiveTab('customers'); setSelectedIds(new Set()); }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'customers' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <UsersIcon className="h-4 w-4 inline mr-1.5" />
            Customers
            <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">{active.length}</span>
          </button>
          <button
            onClick={() => { setActiveTab('trash'); setSelectedIds(new Set()); }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'trash' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Trash2 className="h-4 w-4 inline mr-1.5" />
            Trash
            {trashed.length > 0 && (
              <span className="ml-1.5 text-xs bg-red-100 text-red-600 rounded-full px-1.5 py-0.5">{trashed.length}</span>
            )}
          </button>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search by name, email or phone..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)} className="pl-10 bg-white border-gray-200" />
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1 flex-shrink-0">
          <button onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-amber-800">{selectedIds.size} selected</span>
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="ghost" size="sm" onClick={toggleSelectAll}
                className="text-amber-700 hover:bg-amber-100 text-xs">
                {selectedIds.size === list.length ? 'Deselect All' : 'Select All'}
              </Button>
              {isTrash ? (
                <>
                  <Button size="sm" onClick={batchRestore} disabled={submitting}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />Restore All
                  </Button>
                  <Button size="sm" onClick={() => setDeleteConfirm({ type: 'batch-permanent' })}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs">
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Delete All
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => setDeleteConfirm({ type: 'batch-soft' })}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs">
                  <Trash2 className="h-3.5 w-3.5 mr-1" />Move to Trash
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="text-gray-500">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trash notice */}
      {isTrash && trashed.length > 0 && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>Customers in trash are permanently deleted after 30 days. Restore to prevent data loss.</span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500">Loading customers...</p>
        </div>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          {isTrash ? <UserX className="h-14 w-14 text-gray-200 mx-auto mb-4" /> : <UsersIcon className="h-14 w-14 text-gray-200 mx-auto mb-4" />}
          <p className="text-gray-500">{isTrash ? 'Trash is empty' : 'No customers found'}</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {list.map(customer => {
            const sel = selectedIds.has(customer.uid);
            const daysLeft = isTrash ? getDaysRemaining(customer.trashedAt) : 30;
            return (
              <motion.div key={customer.uid} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                className={`bg-white border rounded-xl overflow-hidden transition-all group relative ${sel ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-200 hover:border-amber-300 hover:shadow-sm'}`}>
                <button className="absolute top-3 left-3 z-10" onClick={e => { e.stopPropagation(); toggleSelect(customer.uid); }}>
                  <CheckIcon checked={sel} />
                </button>
                <div className="p-5 pt-4 cursor-pointer" onClick={() => navigate(`/admin/customers/${customer.uid}`)}>
                  <div className="flex flex-col items-center text-center mt-4">
                    <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-3">
                      <span className="text-amber-700 font-bold text-xl">{(customer.name || customer.username || 'U').charAt(0).toUpperCase()}</span>
                    </div>
                    <p className="font-semibold text-gray-900 truncate w-full">{customer.name || customer.username}</p>
                    <p className="text-xs text-gray-500 truncate w-full mt-0.5">{customer.email}</p>
                    {customer.phone && <p className="text-xs text-gray-400 mt-0.5">{customer.phone}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-4 text-center">
                    <div className="bg-gray-50 rounded-lg py-2">
                      <p className="text-sm font-bold text-gray-900">{customer.orders.length}</p>
                      <p className="text-xs text-gray-500">Orders</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg py-2">
                      <p className="text-sm font-bold text-gray-900 truncate">{formatPrice(customer.totalSpent)}</p>
                      <p className="text-xs text-gray-500">Spent</p>
                    </div>
                  </div>
                  {isTrash && (
                    <div className={`mt-3 flex items-center justify-center gap-1 text-xs rounded-lg py-1.5 ${daysLeft <= 7 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                      <Clock className="h-3 w-3" />{daysLeft > 0 ? `${daysLeft} days left` : 'Expires today'}
                    </div>
                  )}
                </div>
                <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-end gap-2">
                  {isTrash ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); restore(customer); }} disabled={submitting}
                        className="text-emerald-600 hover:bg-emerald-50 text-xs"><RotateCcw className="h-3.5 w-3.5 mr-1" />Restore</Button>
                      <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setDeleteConfirm({ type: 'permanent', customer }); }}
                        className="text-red-600 hover:bg-red-50 text-xs"><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setDeleteConfirm({ type: 'soft', customer }); }}
                      className="text-red-500 hover:bg-red-50 text-xs"><Trash2 className="h-3.5 w-3.5 mr-1" />Trash</Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200">
            <button onClick={toggleSelectAll}><CheckIcon checked={selectedIds.size === list.length && list.length > 0} /></button>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</span>
            <div className="hidden sm:flex items-center gap-6 ml-auto mr-16 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span>Orders</span><span>Spent</span><span>{isTrash ? 'Days Left' : 'Joined'}</span>
            </div>
          </div>
          {list.map(customer => {
            const sel = selectedIds.has(customer.uid);
            const daysLeft = isTrash ? getDaysRemaining(customer.trashedAt) : 30;
            return (
              <div key={customer.uid}
                className={`flex items-center gap-4 px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors group ${sel ? 'bg-amber-50/50' : ''}`}>
                <button onClick={() => toggleSelect(customer.uid)} className="flex-shrink-0"><CheckIcon checked={sel} /></button>
                <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/admin/customers/${customer.uid}`)}>
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-amber-700 font-semibold text-sm">{(customer.name || customer.username || 'U').charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{customer.name || customer.username}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-gray-500"><Mail className="h-3 w-3" />{customer.email}</span>
                      {customer.phone && <span className="flex items-center gap-1 text-xs text-gray-400"><Phone className="h-3 w-3" />{customer.phone}</span>}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
                  <div className="text-center"><p className="text-sm font-semibold text-gray-900">{customer.orders.length}</p><p className="text-xs text-gray-500">Orders</p></div>
                  <div className="text-center"><p className="text-sm font-semibold text-gray-900">{formatPrice(customer.totalSpent)}</p><p className="text-xs text-gray-500">Spent</p></div>
                  {isTrash ? (
                    <div className={`text-xs font-medium px-2 py-1 rounded-lg ${daysLeft <= 7 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                      <Clock className="h-3 w-3 inline mr-1" />{daysLeft > 0 ? `${daysLeft}d` : 'Today'}
                    </div>
                  ) : (
                    <div className="text-center"><p className="text-xs text-gray-500">Joined</p><p className="text-xs font-medium text-gray-700">{formatDate(customer.createdAt)}</p></div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isTrash ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => restore(customer)} disabled={submitting} className="text-emerald-600 hover:bg-emerald-50"><RotateCcw className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm({ type: 'permanent', customer })} className="text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm({ type: 'soft', customer })} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Customer Profile Drawer */}
      <AnimatePresence>
        {selectedProfile && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelectedProfile(null)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
                <h2 className="text-lg font-semibold text-gray-900">Customer Profile</h2>
                <button onClick={() => setSelectedProfile(null)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                    <span className="text-amber-700 font-bold text-2xl">{(selectedProfile.name || selectedProfile.username || 'U').charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-xl font-semibold text-gray-900">{selectedProfile.name || selectedProfile.username}</p>
                    <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-1"><Mail className="h-3.5 w-3.5" />{selectedProfile.email}</p>
                    {selectedProfile.phone && <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5"><Phone className="h-3.5 w-3.5" />{selectedProfile.phone}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <Package className="h-4 w-4 text-blue-600 mx-auto mb-1" />
                    <p className="text-sm font-bold text-blue-900">{selectedProfile.orders.length}</p>
                    <p className="text-xs text-blue-600">Orders</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <TrendingUp className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
                    <p className="text-sm font-bold text-emerald-900">{formatPrice(selectedProfile.totalSpent)}</p>
                    <p className="text-xs text-emerald-600">Spent</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <Calendar className="h-4 w-4 text-amber-600 mx-auto mb-1" />
                    <p className="text-xs font-bold text-amber-900">{formatDate(selectedProfile.createdAt)}</p>
                    <p className="text-xs text-amber-600">Joined</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Order History ({selectedProfile.orders.length})</h3>
                  {selectedProfile.orders.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No orders yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedProfile.orders.map(order => (
                        <div key={order.id} className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                            <Package className="h-4 w-4 text-gray-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-amber-700">#{order.orderNumber || order.id.slice(0, 8).toUpperCase()}</span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[order.status] || 'bg-gray-100 text-gray-600'}`}>
                                {order.status.charAt(0).toUpperCase() + order.status.slice(1).replace(/([A-Z])/g, ' $1')}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{order.items.length} item{order.items.length !== 1 ? 's' : ''} · {formatDate(order.createdAt)}</p>
                          </div>
                          <span className="text-sm font-semibold text-gray-900 flex-shrink-0">{formatPrice(order.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {selectedProfile.status !== 'trashed' && (
                <div className="border-t border-gray-200 px-6 py-4 flex-shrink-0">
                  <Button variant="outline" className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    onClick={() => setDeleteConfirm({ type: 'soft', customer: selectedProfile })}>
                    <Trash2 className="h-4 w-4 mr-2" />Move to Trash
                  </Button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirm Dialog */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={open => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm?.type === 'permanent' || deleteConfirm?.type === 'batch-permanent' ? 'Permanently Delete?' : 'Move to Trash?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === 'permanent' && deleteConfirm.customer && (
                <>Permanently delete <strong>{deleteConfirm.customer.name || deleteConfirm.customer.username}</strong>? This cannot be undone.</>
              )}
              {deleteConfirm?.type === 'soft' && deleteConfirm.customer && (
                <>Move <strong>{deleteConfirm.customer.name || deleteConfirm.customer.username}</strong> to trash? Restorable within 30 days.</>
              )}
              {deleteConfirm?.type === 'batch-permanent' && (
                <>Permanently delete <strong>{selectedIds.size} customers</strong>? This cannot be undone.</>
              )}
              {deleteConfirm?.type === 'batch-soft' && (
                <>Move <strong>{selectedIds.size} customers</strong> to trash? Restorable within 30 days.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              className={deleteConfirm?.type === 'permanent' || deleteConfirm?.type === 'batch-permanent' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}
              onClick={() => {
                if (deleteConfirm?.type === 'soft' && deleteConfirm.customer) softDelete(deleteConfirm.customer);
                else if (deleteConfirm?.type === 'permanent' && deleteConfirm.customer) permDelete(deleteConfirm.customer);
                else if (deleteConfirm?.type === 'batch-soft') batchSoftDelete();
                else if (deleteConfirm?.type === 'batch-permanent') batchPermDelete();
              }}>
              {submitting ? 'Processing...' : (deleteConfirm?.type === 'permanent' || deleteConfirm?.type === 'batch-permanent' ? 'Delete Permanently' : 'Move to Trash')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminCustomers;
