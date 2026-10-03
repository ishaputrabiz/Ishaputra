// ============================================
// ADMIN GIFT CARD MANAGER
// Create, view, and manage user gift cards
// ============================================

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gift, Search, Plus, X, CreditCard, Clock, 
  CheckCircle2, XCircle, Trash2, User, Mail, AlertCircle,
  IndianRupee, Calendar, RefreshCcw, Copy, Check, LayoutGrid, List, CircleSlash, EyeOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { IconButton } from '@/components/ui/icon-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListSkeleton, StatCardsSkeleton } from '@/components/skeletons';
import { fadeUp } from '@/lib/motion';
import { formatDate, formatINR } from '@/lib/format';
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
  const confirmReturnRef = useRef<HTMLElement | null>(null);
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
  const [cardToDelete, setCardToDelete] = useState<GiftCard | null>(null);

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
      toast({ title: 'Could not load gift cards', description: 'Check your connection and try again.', variant: 'destructive' });
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
      toast({ title: 'Choose a customer', description: 'Search for the customer the gift card is for.', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(giftAmount);
    if (!amount || amount <= 0) {
      toast({ title: 'Enter an amount', description: 'The amount must be more than ₹0.', variant: 'destructive' });
      return;
    }
    if (!giftExpiry) {
      toast({ title: 'Set an expiry date', variant: 'destructive' });
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

      toast({ title: 'Gift card issued', description: `${giftCode} for ${selectedUser.email}` });
      
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
      toast({ title: 'Could not issue the gift card', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (card: GiftCard) => {
    try {
      const cardRef = doc(db, 'users', card.userId, 'giftCards', card.id);
      await updateDoc(cardRef, { isActive: !card.isActive });
      toast({ title: card.isActive ? 'Gift card deactivated' : 'Gift card activated', description: card.code });
      await loadAllGiftCards();
    } catch (error) {
      console.error('Error toggling gift card:', error);
      toast({ title: 'Could not update the gift card', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const handleDeleteCard = async (card: GiftCard) => {
    try {
      const cardRef = doc(db, 'users', card.userId, 'giftCards', card.id);
      await deleteDoc(cardRef);
      toast({ title: 'Gift card deleted', description: card.code });
      await loadAllGiftCards();
    } catch (error) {
      console.error('Error deleting gift card:', error);
      toast({ title: 'Could not delete the gift card', description: 'Please try again.', variant: 'destructive' });
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

  const header = (
    <AdminPageHeader
      title="Gift cards"
      description="Issue gift cards and track their balances."
      actions={
        <Button
          variant={showForm ? 'outline' : 'default'}
          onClick={() => setShowForm(!showForm)}
          aria-expanded={showForm}
          aria-controls="gift-card-form"
        >
          {showForm ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {showForm ? 'Cancel' : 'New gift card'}
        </Button>
      }
      className="pb-0"
    />
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {header}
        <StatCardsSkeleton count={3} className="grid-cols-1 md:grid-cols-3 lg:grid-cols-3" label="Loading gift cards" />
        <ListSkeleton rows={3} label="" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {header}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Stat icon={Gift} label="Active cards" value={String(totalActive)} />
        <Stat icon={IndianRupee} label="Total issued" value={formatINR(totalValue)} />
        <Stat icon={CreditCard} label="Remaining balance" value={formatINR(totalRemaining)} />
      </div>

      {/* Create form */}
      <AnimatePresence initial={false}>
        {showForm && (
          <motion.section
            id="gift-card-form"
            aria-labelledby="gift-card-form-title"
            {...fadeUp}
            className="space-y-5 rounded-card border border-border bg-card p-5 sm:p-6"
          >
            <h2 id="gift-card-form-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Gift aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
              Issue a gift card
            </h2>

            {/* User search */}
            <div className="relative">
              <Label htmlFor="gc-user" className="mb-1.5 block text-sm font-medium text-foreground/80">Customer</Label>
              <div className="relative">
                <User aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="gc-user"
                  type="text"
                  role="combobox"
                  aria-expanded={showUserDropdown && !selectedUser && userSearch.length > 0}
                  aria-controls="gc-user-list"
                  aria-autocomplete="list"
                  autoComplete="off"
                  value={selectedUser ? `${selectedUser.username || ''} (${selectedUser.email})` : userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setSelectedUser(null);
                    setShowUserDropdown(true);
                  }}
                  onFocus={() => setShowUserDropdown(true)}
                  onKeyDown={(e) => e.key === 'Escape' && setShowUserDropdown(false)}
                  placeholder="Search by email or name"
                  className="pl-10 pr-12"
                />
                {selectedUser && (
                  <IconButton
                    label="Clear customer"
                    size="sm"
                    onClick={() => { setSelectedUser(null); setUserSearch(''); }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    <X />
                  </IconButton>
                )}
              </div>

              {showUserDropdown && !selectedUser && userSearch.length > 0 && (
                <div id="gc-user-list" role="listbox" className="absolute z-popover mt-1 max-h-60 w-full overflow-y-auto rounded-card border border-border bg-popover text-popover-foreground shadow-lg">
                  {filteredUsers.length > 0 ? filteredUsers.slice(0, 10).map((u) => (
                    <button
                      key={u.uid}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => {
                        setSelectedUser(u);
                        setUserSearch('');
                        setShowUserDropdown(false);
                      }}
                      className="focus-inset flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left transition-colors duration-hover last:border-0 hover:bg-muted"
                    >
                      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                        {(u.username || u.email || '?').charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{u.username || 'No name'}</span>
                        <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                      </span>
                    </button>
                  )) : (
                    <p className="px-4 py-3 text-sm text-muted-foreground">No customers found</p>
                  )}
                </div>
              )}
            </div>

            {/* Amount + code */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="gc-amount" className="mb-1.5 block text-sm font-medium text-foreground/80">Amount (₹)</Label>
                <div className="relative">
                  <IndianRupee aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="gc-amount"
                    type="number"
                    inputMode="decimal"
                    value={giftAmount}
                    onChange={(e) => setGiftAmount(e.target.value)}
                    placeholder="1000"
                    min="1"
                    className="pl-10 tabular-nums"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="gc-code" className="mb-1.5 block text-sm font-medium text-foreground/80">Gift card code</Label>
                <div className="relative">
                  <CreditCard aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="gc-code"
                    type="text"
                    value={giftCode}
                    onChange={(e) => setGiftCode(e.target.value.toUpperCase())}
                    className="pl-10 pr-12 font-mono"
                  />
                  <IconButton
                    label="Generate a new code"
                    tooltip
                    size="sm"
                    onClick={() => setGiftCode(generateCode())}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    <RefreshCcw />
                  </IconButton>
                </div>
              </div>
            </div>

            {/* Expiry + description */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="gc-expiry" className="mb-1.5 block text-sm font-medium text-foreground/80">Expiry date</Label>
                <Input
                  id="gc-expiry"
                  type="date"
                  value={giftExpiry}
                  onChange={(e) => setGiftExpiry(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <Label htmlFor="gc-desc" className="mb-1.5 block text-sm font-medium text-foreground/80">Description<span className="ml-1 font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  id="gc-desc"
                  type="text"
                  value={giftDescription}
                  onChange={(e) => setGiftDescription(e.target.value)}
                  placeholder="e.g. Birthday gift"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleCreateGiftCard}
                disabled={formLoading || !selectedUser || !giftAmount || !giftExpiry}
                className="w-full sm:w-auto"
              >
                {formLoading ? <Spinner /> : <Gift aria-hidden="true" />}
                {formLoading ? 'Issuing' : 'Issue gift card'}
              </Button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Search, filter and view */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search gift cards"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by code, customer or description"
            className="pl-10"
          />
        </div>
        <div className="flex gap-3">
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as 'all' | 'active' | 'expired' | 'used')}>
            <SelectTrigger aria-label="Filter gift cards" className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="used">Used up</SelectItem>
            </SelectContent>
          </Select>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as 'grid' | 'list')}
            aria-label="Gift card view"
            className="h-11 shrink-0"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view" size="sm" className="w-9 px-0">
              <LayoutGrid aria-hidden="true" className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" size="sm" className="w-9 px-0">
              <List aria-hidden="true" className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Gift cards grid/list */}
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>
        {filteredCards.length === 0 ? (
          <div className="col-span-full rounded-card border border-border bg-card px-4 py-12">
            <EmptyState
              icon={Gift}
              title={giftCards.length === 0 ? 'No gift cards yet' : 'No gift cards match'}
              description={giftCards.length === 0 ? 'Issue one with New gift card.' : 'Try another search or filter.'}
              action={giftCards.length === 0 && !showForm ? { label: 'New gift card', onClick: () => setShowForm(true) } : undefined}
            />
          </div>
        ) : (
          filteredCards.map((card) => {
            const expired = new Date(card.expiryDate) < new Date();
            const fullyUsed = card.remainingAmount <= 0;
            const usagePercent = card.amount > 0 ? ((card.amount - card.remainingAmount) / card.amount) * 100 : 0;
            const muted = expired || fullyUsed || !card.isActive;

            return (
              <div
                key={`${card.userId}-${card.id}`}
                className="rounded-card border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: card info */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-muted ${muted ? 'text-muted-foreground' : 'text-foreground/70'}`}>
                        <Gift aria-hidden="true" className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-mono text-sm font-bold tracking-wider text-foreground">{card.code}</span>
                          <IconButton label={copiedCode === card.code ? 'Copied' : `Copy code ${card.code}`} size="sm" className="-my-2" onClick={() => copyCode(card.code)}>
                            {copiedCode === card.code ? <Check className="text-status-success-fg" /> : <Copy />}
                          </IconButton>
                          {expired ? (
                            <StatusBadge tone="danger" icon={XCircle} label="Expired" />
                          ) : fullyUsed ? (
                            <StatusBadge tone="neutral" icon={CircleSlash} label="Used up" />
                          ) : !card.isActive ? (
                            <StatusBadge tone="neutral" icon={EyeOff} label="Inactive" />
                          ) : (
                            <StatusBadge tone="success" icon={CheckCircle2} label="Active" />
                          )}
                        </div>
                        {card.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{card.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 sm:pl-[52px]">
                      {/* Customer */}
                      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{card.userEmail || card.userId}</span>
                        {card.userName && <span className="shrink-0">({card.userName})</span>}
                      </p>

                      {/* Amount and usage */}
                      <div>
                        <p className="flex items-baseline gap-2 tabular-nums">
                          <span className="text-lg font-semibold text-foreground">{formatINR(card.remainingAmount)}</span>
                          <span className="text-xs text-muted-foreground">of {formatINR(card.amount)}</span>
                        </p>
                        {card.usedAmount > 0 && (
                          <div className="mt-1 w-48 max-w-full">
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${usagePercent}%` }} />
                            </div>
                            <p className="mt-1 text-xs tabular-nums text-muted-foreground">{formatINR(card.usedAmount)} used</p>
                          </div>
                        )}
                      </div>

                      {/* Expiry */}
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar aria-hidden="true" className="h-3.5 w-3.5" />
                        <span>Expires {formatDate(new Date(card.expiryDate))}</span>
                      </p>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(card)}
                    >
                      {card.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <IconButton
                      label={`Delete gift card ${card.code}`}
                      tooltip="Delete"
                      size="sm"
                      className="text-muted-foreground hover:text-status-danger-fg"
                      onClick={(e) => { confirmReturnRef.current = e.currentTarget; setCardToDelete(card); }}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        returnFocusRef={confirmReturnRef}
        open={!!cardToDelete}
        onOpenChange={(open) => !open && setCardToDelete(null)}
        title={`Delete gift card ${cardToDelete?.code ?? ''}?`}
        description="The customer can no longer use its balance. This cannot be undone."
        confirmLabel="Delete gift card"
        tone="danger"
        onConfirm={() => (cardToDelete ? handleDeleteCard(cardToDelete) : undefined)}
      />
    </div>
  );
};

const Stat = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) => (
  <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-3 sm:flex-row sm:items-center sm:p-4">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-muted text-foreground/70">
      <Icon aria-hidden="true" className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-lg font-semibold tabular-nums text-foreground sm:text-xl">{value}</p>
    </div>
  </div>
);

export default AdminGiftCards;
