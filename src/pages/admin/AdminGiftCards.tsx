// ============================================
// ADMIN GIFT CARD MANAGER
// Create, view, and manage user gift cards
// ============================================

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gift, Search, Plus, X, Loader2, CreditCard, Clock, 
  CheckCircle2, XCircle, Trash2, User, Mail, AlertCircle,
  IndianRupee, Calendar, RefreshCcw, Copy, Check, LayoutGrid, List
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, collectionGroup, orderBy, Timestamp
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface UserItem {
  uid: string;
  email: string;
  username: string;
}

interface GiftCard {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  code: string;
  amount: number;
  usedAmount: number;
  remainingAmount: number;
  isActive: boolean;
  expiryDate: string;
  createdAt: any;
  createdBy: string;
  description: string;
}

const generateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GIFT';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const AdminGiftCards: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  // Data
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [giftAmount, setGiftAmount] = useState('');
  const [giftDescription, setGiftDescription] = useState('');
  const [giftExpiry, setGiftExpiry] = useState('');
  const [giftCode, setGiftCode] = useState(generateCode());
  
  // Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'used'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Load users and gift cards
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reads every user ONCE, builds a uid -> {email,name} map for enrichment,
  // fills the create-form user list, then loads all gift cards. `loading` is
  // always cleared in `finally`, and a single network failure surfaces a toast
  // instead of leaving the page stuck on the spinner forever.
  const loadData = async () => {
    try {
      setLoading(true);
      const usersSnap = await getDocs(collection(db, 'users'));
      const map = new Map<string, { email: string; name: string }>();
      const userList: UserItem[] = [];
      usersSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const email = (data.email as string) || '';
        const name = (data.username as string) || (data.name as string) || '';
        map.set(d.id, { email, name });
        if (data.role === 'user') userList.push({ uid: d.id, email, username: name });
      });
      setUsers(userList);
      await loadAllGiftCards(usersSnap.docs, map);
    } catch (error) {
      console.error('Error loading gift card data:', error);
      toast({ title: 'Error', description: 'Failed to load coupons. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Loads every gift card across all users.
  //  • Fast path: a SINGLE collectionGroup('giftCards') query (needs the
  //    giftCards collection-group rule deployed).
  //  • Fallback: PARALLEL per-user subcollection reads — works with the existing
  //    rules and replaces the old sequential N+1 scan that effectively never
  //    finished (the cause of the perpetual loading spinner).
  const loadAllGiftCards = async (
    userDocs?: Array<{ id: string; data: () => Record<string, unknown> }>,
    userMap?: Map<string, { email: string; name: string }>,
  ) => {
    let docs = userDocs;
    let map = userMap;
    if (!docs || !map) {
      const usersSnap = await getDocs(collection(db, 'users'));
      docs = usersSnap.docs;
      map = new Map();
      usersSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        map!.set(d.id, {
          email: (data.email as string) || '',
          name: (data.username as string) || (data.name as string) || '',
        });
      });
    }

    const enrich = (userId: string, gcDoc: { id: string; data: () => Record<string, unknown> }): GiftCard => {
      const u = map!.get(userId);
      return {
        id: gcDoc.id,
        userId,
        userEmail: u?.email || '',
        userName: u?.name || '',
        ...gcDoc.data(),
      } as GiftCard;
    };

    const sortByCreated = (cards: GiftCard[]) =>
      cards.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    // Fast path — one collection-group query for every gift card at once.
    try {
      const cgSnap = await getDocs(collectionGroup(db, 'giftCards'));
      const cards = cgSnap.docs
        .filter((d) => d.ref.parent.parent) // only gift cards under a user document
        .map((d) => enrich(d.ref.parent.parent!.id, d));
      setGiftCards(sortByCreated(cards));
      return;
    } catch (cgErr) {
      console.warn('[giftCards] collection-group query unavailable, using per-user scan:', cgErr);
    }

    // Fallback — parallel per-user subcollection reads.
    const results = await Promise.all(
      docs.map(async (userDoc) => {
        try {
          const gcSnap = await getDocs(collection(db, 'users', userDoc.id, 'giftCards'));
          return gcSnap.docs.map((gc) => enrich(userDoc.id, gc));
        } catch {
          return [] as GiftCard[];
        }
      }),
    );
    setGiftCards(sortByCreated(results.flat()));
  };

  const handleCreateGiftCard = async () => {
    if (!selectedUser) {
      toast({ title: 'Error', description: 'Please select a user', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(giftAmount);
    if (!amount || amount <= 0) {
      toast({ title: 'Error', description: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }
    if (!giftExpiry) {
      toast({ title: 'Error', description: 'Please set an expiry date', variant: 'destructive' });
      return;
    }

    try {
      setFormLoading(true);
      
      const giftCardData = {
        code: giftCode,
        amount,
        usedAmount: 0,
        remainingAmount: amount,
        isActive: true,
        expiryDate: giftExpiry,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || 'admin',
        description: giftDescription || `Gift Card worth ₹${amount}`,
      };

      await addDoc(
        collection(db, 'users', selectedUser.uid, 'giftCards'),
        giftCardData
      );

      toast({ title: 'Success', description: `Gift card ${giftCode} created for ${selectedUser.email}` });
      
      // Reset form
      setShowForm(false);
      setSelectedUser(null);
      setUserSearch('');
      setGiftAmount('');
      setGiftDescription('');
      setGiftExpiry('');
      setGiftCode(generateCode());
      
      // Reload
      await loadAllGiftCards();
    } catch (error) {
      console.error('Error creating gift card:', error);
      toast({ title: 'Error', description: 'Failed to create gift card', variant: 'destructive' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (card: GiftCard) => {
    try {
      const cardRef = doc(db, 'users', card.userId, 'giftCards', card.id);
      await updateDoc(cardRef, { isActive: !card.isActive });
      toast({ title: 'Updated', description: `Gift card ${card.code} ${card.isActive ? 'deactivated' : 'activated'}` });
      await loadAllGiftCards();
    } catch (error) {
      console.error('Error toggling gift card:', error);
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };

  const handleDeleteCard = async (card: GiftCard) => {
    if (!confirm(`Delete gift card ${card.code}? This cannot be undone.`)) return;
    
    try {
      const cardRef = doc(db, 'users', card.userId, 'giftCards', card.id);
      await deleteDoc(cardRef);
      toast({ title: 'Deleted', description: `Gift card ${card.code} has been deleted` });
      await loadAllGiftCards();
    } catch (error) {
      console.error('Error deleting gift card:', error);
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Filter gift cards
  const filteredCards = giftCards.filter((card) => {
    const matchesSearch = 
      card.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.userEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.description?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    const expired = new Date(card.expiryDate) < new Date();
    const fullyUsed = card.remainingAmount <= 0;

    if (filterStatus === 'active') return card.isActive && !expired && !fullyUsed;
    if (filterStatus === 'expired') return expired;
    if (filterStatus === 'used') return fullyUsed;
    return true;
  });

  // Filtered user list for dropdown
  const filteredUsers = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.username?.toLowerCase().includes(userSearch.toLowerCase())
  );

  // Stats
  const totalActive = giftCards.filter(c => c.isActive && new Date(c.expiryDate) >= new Date() && c.remainingAmount > 0).length;
  const totalValue = giftCards.reduce((sum, c) => sum + c.amount, 0);
  const totalRemaining = giftCards.filter(c => c.isActive && new Date(c.expiryDate) >= new Date()).reduce((sum, c) => sum + c.remainingAmount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coupons</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage coupons for users</p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-pink-600 hover:bg-pink-700 text-white gap-2"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'New Coupon'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-pink-50 rounded-lg flex items-center justify-center text-pink-600">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Active Cards</p>
              <p className="text-xl font-bold text-gray-900">{totalActive}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
              <IndianRupee className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Issued</p>
              <p className="text-xl font-bold text-gray-900">₹{totalValue.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center text-green-600">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Remaining Balance</p>
              <p className="text-xl font-bold text-gray-900">₹{totalRemaining.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-xl border-2 border-pink-200 p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Gift className="w-5 h-5 text-pink-600" />
                Create Coupon
              </h3>

              {/* User Search */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Select User</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={selectedUser ? `${selectedUser.username || ''} (${selectedUser.email})` : userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value);
                      setSelectedUser(null);
                      setShowUserDropdown(true);
                    }}
                    onFocus={() => setShowUserDropdown(true)}
                    placeholder="Search by email or username..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none"
                  />
                  {selectedUser && (
                    <button
                      onClick={() => { setSelectedUser(null); setUserSearch(''); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                    </button>
                  )}
                </div>
                
                {showUserDropdown && !selectedUser && userSearch.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredUsers.length > 0 ? filteredUsers.slice(0, 10).map((u) => (
                      <button
                        key={u.uid}
                        onClick={() => {
                          setSelectedUser(u);
                          setUserSearch('');
                          setShowUserDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-pink-50 transition-colors flex items-center gap-2 border-b border-gray-50 last:border-0"
                      >
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{u.username || 'No name'}</p>
                          <p className="text-xs text-gray-500">{u.email}</p>
                        </div>
                      </button>
                    )) : (
                      <p className="px-4 py-3 text-sm text-gray-500">No users found</p>
                    )}
                  </div>
                )}
              </div>

              {/* Amount + Code */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (₹)</label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      value={giftAmount}
                      onChange={(e) => setGiftAmount(e.target.value)}
                      placeholder="1000"
                      min="1"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Gift Code</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={giftCode}
                      onChange={(e) => setGiftCode(e.target.value.toUpperCase())}
                      className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-pink-500 outline-none"
                    />
                    <button
                      onClick={() => setGiftCode(generateCode())}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      title="Generate new code"
                    >
                      <RefreshCcw className="w-4 h-4 text-gray-400 hover:text-pink-600 transition-colors" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Expiry + Description */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Expiry Date</label>
                  <input
                    type="date"
                    value={giftExpiry}
                    onChange={(e) => setGiftExpiry(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                  <input
                    type="text"
                    value={giftDescription}
                    onChange={(e) => setGiftDescription(e.target.value)}
                    placeholder="e.g. Birthday Gift"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 outline-none"
                  />
                </div>
              </div>

              <Button
                onClick={handleCreateGiftCard}
                disabled={formLoading || !selectedUser || !giftAmount || !giftExpiry}
                className="w-full bg-pink-600 hover:bg-pink-700 text-white py-3 h-12 rounded-xl gap-2"
              >
                {formLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                ) : (
                  <><Gift className="w-4 h-4" /> Create Coupon</>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search, Filter & View Toggle */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by code, user, or description..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 outline-none bg-white"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'expired' | 'used')}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-pink-500 outline-none"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="used">Used</option>
        </select>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            title="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Coupons Grid/List */}
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-3'}>
        {filteredCards.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center col-span-full">
            <div className="w-16 h-16 bg-gray-50 rounded-full mx-auto mb-4 flex items-center justify-center">
              <Gift className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-700">No coupons found</p>
            <p className="text-xs text-gray-400 mt-1">Create your first coupon using the button above</p>
          </div>
        ) : (
          filteredCards.map((card) => {
            const expired = new Date(card.expiryDate) < new Date();
            const fullyUsed = card.remainingAmount <= 0;
            const usagePercent = card.amount > 0 ? ((card.amount - card.remainingAmount) / card.amount) * 100 : 0;

            return (
              <div
                key={`${card.userId}-${card.id}`}
                className={`bg-white rounded-xl border p-5 transition-all ${
                  expired || fullyUsed || !card.isActive
                    ? 'border-gray-200 opacity-70'
                    : 'border-pink-200 hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between">
                  {/* Left: Card info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        expired ? 'bg-red-50 text-red-500' :
                        fullyUsed ? 'bg-gray-100 text-gray-400' :
                        !card.isActive ? 'bg-amber-50 text-amber-500' :
                        'bg-pink-50 text-pink-600'
                      }`}>
                        <Gift className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold font-mono tracking-wider text-gray-900">{card.code}</span>
                          <button onClick={() => copyCode(card.code)} className="p-0.5">
                            {copiedCode === card.code ? (
                              <Check className="w-3.5 h-3.5 text-green-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                            )}
                          </button>
                          {expired ? (
                            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">Expired</span>
                          ) : fullyUsed ? (
                            <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">Used Up</span>
                          ) : !card.isActive ? (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Inactive</span>
                          ) : (
                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Active</span>
                          )}
                        </div>
                        {card.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{card.description}</p>
                        )}
                      </div>
                    </div>

                    {/* User info */}
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 ml-[52px]">
                      <Mail className="w-3 h-3" />
                      <span>{card.userEmail || card.userId}</span>
                      {card.userName && <span className="text-gray-400">({card.userName})</span>}
                    </div>

                    {/* Amount & usage */}
                    <div className="ml-[52px]">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-lg font-bold text-gray-900">₹{card.remainingAmount.toLocaleString('en-IN')}</span>
                        <span className="text-xs text-gray-400">of ₹{card.amount.toLocaleString('en-IN')}</span>
                      </div>
                      {card.usedAmount > 0 && (
                        <div className="w-48">
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-pink-500 rounded-full" style={{ width: `${usagePercent}%` }} />
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">₹{card.usedAmount.toLocaleString('en-IN')} used</p>
                        </div>
                      )}
                    </div>

                    {/* Expiry */}
                    <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-2 ml-[52px]">
                      <Calendar className="w-3 h-3" />
                      <span>Expires {new Date(card.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-col gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(card)}
                      className={`text-xs h-8 ${card.isActive ? 'text-amber-600 border-amber-200 hover:bg-amber-50' : 'text-green-600 border-green-200 hover:bg-green-50'}`}
                    >
                      {card.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteCard(card)}
                      className="text-xs h-8 text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AdminGiftCards;
