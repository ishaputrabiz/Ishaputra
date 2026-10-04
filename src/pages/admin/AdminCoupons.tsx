import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Edit2, Trash2, Eye, EyeOff, X, Ticket, Percent, IndianRupee,
  Calendar, Tag, Users as UsersIcon, Search, Copy, Check, Megaphone, CircleCheck,
  Clock, CircleSlash, EyeOff as EyeOffIcon, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { IconButton } from '@/components/ui/icon-button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard } from '@/components/admin/StatCard';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { fadeUp, staggerDelay } from '@/lib/motion';
import { formatINR } from '@/lib/format';
import { toast } from 'sonner';
import { Timestamp } from 'firebase/firestore';
import { subscribeToCategories, type Category } from '@/services/categoryService';
import {
  Coupon,
  CouponType,
  subscribeCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from '@/services/couponService';

interface DraftCoupon {
  id?: string;
  code: string;
  description: string;
  type: CouponType;
  value: number;
  minOrderValue: number;
  maxDiscount: number;
  maxUses: number;
  perUserLimit: number;
  validFrom: string;
  validTo: string;
  active: boolean;
  firstOrderOnly: boolean;
  applicableCategories: string[];
  applicableSubcategories: string[];
  showInBanner: boolean;
}

const empty = (): DraftCoupon => ({
  code: '',
  description: '',
  type: 'percent',
  value: 10,
  minOrderValue: 0,
  maxDiscount: 0,
  maxUses: 0,
  perUserLimit: 0,
  validFrom: '',
  validTo: '',
  active: true,
  firstOrderOnly: false,
  applicableCategories: [],
  applicableSubcategories: [],
  showInBanner: false,
});

const fmtDate = (t?: Timestamp | null) => {
  if (!t) return 'open';
  return t.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const toInputDate = (t?: Timestamp | null) => {
  if (!t) return '';
  const d = t.toDate();
  const m = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${m(d.getMonth() + 1)}-${m(d.getDate())}`;
};

/**
 * Turn a `<input type="date">` value into a Timestamp at the shop's own
 * midnight, not UTC's.
 *
 * `new Date('2026-09-30')` is parsed as UTC midnight, which in IST is 05:30 on
 * the 30th. So a coupon the owner set to run "until 30 September" actually died
 * at half past five that morning, and one starting "on the 21st" did not work
 * for the first five and a half hours of the day it was meant to launch.
 *
 * `bound` picks which edge of the day is meant: a start date begins at 00:00
 * local, an end date runs through 23:59:59.999 local, so both dates the admin
 * typed are days the customer can actually use the code.
 */
const fromInputDate = (s: string, bound: 'start' | 'end'): Timestamp | null => {
  if (!s) return null;
  const [year, month, day] = s.split('-').map(Number);
  if (!year || !month || !day) return null;
  const d =
    bound === 'start'
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
  if (isNaN(d.getTime())) return null;
  return Timestamp.fromDate(d);
};

/**
 * What a customer would experience if they typed this code right now.
 *
 * The badge used to read straight off `c.active`, which is only the admin's
 * show/hide switch. A coupon dated to start tomorrow therefore displayed
 * "Active" while checkout answered "Coupon is not yet active", and a coupon
 * that had used up its `maxUses` also still read "Active". Both look like the
 * site is broken rather than like the coupon doing what it was configured to.
 */
type CouponState = 'expired' | 'scheduled' | 'usedUp' | 'hidden' | 'live';

const couponState = (c: Coupon, now = new Date()): CouponState => {
  if (c.validTo && c.validTo.toDate() < now) return 'expired';
  if (!c.active) return 'hidden';
  if (c.validFrom && c.validFrom.toDate() > now) return 'scheduled';
  if (c.maxUses > 0 && c.usedCount >= c.maxUses) return 'usedUp';
  return 'live';
};

const STATE_LABEL: Record<CouponState, string> = {
  expired: 'Expired',
  scheduled: 'Starts later',
  usedUp: 'Fully used',
  hidden: 'Hidden',
  live: 'Live now',
};

const STATE_TONE: Record<CouponState, { tone: StatusTone; icon: LucideIcon }> = {
  expired: { tone: 'neutral', icon: CircleSlash },
  scheduled: { tone: 'info', icon: Clock },
  usedUp: { tone: 'warning', icon: CircleSlash },
  hidden: { tone: 'neutral', icon: EyeOffIcon },
  live: { tone: 'success', icon: CircleCheck },
};

const AdminCoupons = () => {
  const [items, setItems] = useState<Coupon[]>([]);
  const confirmReturnRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<DraftCoupon>(empty());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');
  const [copied, setCopied] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const unsub = subscribeCoupons((data) => {
      setItems(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => subscribeToCategories(setCategories), []);

  /** Subcategories of the categories this coupon is limited to. */
  const subcategoryChoices = useMemo(() => {
    const picked = draft.applicableCategories.map((c) => c.trim().toLowerCase());
    if (picked.length === 0) return [];
    const names = new Set<string>();
    for (const cat of categories) {
      if (!picked.includes(cat.name.trim().toLowerCase())) continue;
      for (const sub of cat.subcategories || []) names.add(sub.name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [categories, draft.applicableCategories]);

  const toggleCategory = (name: string) => {
    setDraft((prev) => {
      const has = prev.applicableCategories.includes(name);
      const next = has
        ? prev.applicableCategories.filter((c) => c !== name)
        : [...prev.applicableCategories, name];
      // Dropping a category must drop the subcategories that belonged to it,
      // or the coupon keeps a narrowing nobody can see any more.
      const stillValid = new Set<string>();
      for (const cat of categories) {
        if (!next.map((c) => c.toLowerCase()).includes(cat.name.toLowerCase())) continue;
        for (const sub of cat.subcategories || []) stillValid.add(sub.name);
      }
      return {
        ...prev,
        applicableCategories: next,
        applicableSubcategories: prev.applicableSubcategories.filter((sn) => stillValid.has(sn)),
      };
    });
  };

  const toggleSubcategory = (name: string) => {
    setDraft((prev) => ({
      ...prev,
      applicableSubcategories: prev.applicableSubcategories.includes(name)
        ? prev.applicableSubcategories.filter((c) => c !== name)
        : [...prev.applicableSubcategories, name],
    }));
  };

  const list = useMemo(() => {
    const now = new Date();
    return items.filter((c) => {
      if (search && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
      const expired = c.validTo && c.validTo.toDate() < now;
      if (filter === 'active' && (!c.active || expired)) return false;
      if (filter === 'inactive' && c.active) return false;
      if (filter === 'expired' && !expired) return false;
      return true;
    });
  }, [items, search, filter]);

  const stats = useMemo(() => {
    const now = new Date();
    return {
      total: items.length,
      // Only coupons a customer could redeem this minute - a scheduled or
      // fully-used code is not one the shop can point people at today.
      active: items.filter((c) => couponState(c, now) === 'live').length,
      uses: items.reduce((sum, c) => sum + (c.usedCount || 0), 0),
    };
  }, [items]);

  const openNew = () => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setDraft(empty());
    setShowForm(true);
  };
  const openEdit = (c: Coupon) => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setDraft({
      id: c.id,
      code: c.code,
      description: c.description || '',
      type: c.type,
      value: c.value,
      minOrderValue: c.minOrderValue || 0,
      maxDiscount: c.maxDiscount || 0,
      maxUses: c.maxUses || 0,
      perUserLimit: c.perUserLimit || 0,
      validFrom: toInputDate(c.validFrom),
      validTo: toInputDate(c.validTo),
      active: c.active,
      firstOrderOnly: c.firstOrderOnly || false,
      applicableCategories: c.applicableCategories || [],
      applicableSubcategories: c.applicableSubcategories || [],
      showInBanner: c.showInBanner === true,
    });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = draft.code.toUpperCase().trim();
    if (!code) return toast.error('Coupon code is required');
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return toast.error('Code must be 3 to 20 characters: A-Z, 0-9, - or _');
    if (draft.value <= 0) return toast.error('Value must be more than 0');
    if (draft.type === 'percent' && draft.value > 100) return toast.error('Percent cannot be more than 100');

    try {
      setSaving(true);
      const payload = {
        code,
        description: draft.description.trim(),
        type: draft.type,
        value: Number(draft.value),
        minOrderValue: Number(draft.minOrderValue) || 0,
        maxDiscount: Number(draft.maxDiscount) || 0,
        maxUses: Number(draft.maxUses) || 0,
        perUserLimit: Number(draft.perUserLimit) || 0,
        validFrom: fromInputDate(draft.validFrom, 'start'),
        validTo: fromInputDate(draft.validTo, 'end'),
        active: draft.active,
        firstOrderOnly: draft.firstOrderOnly,
        applicableCategories: draft.applicableCategories,
        // Subcategories only narrow a category selection; without one they
        // would silently widen the offer to products the shop did not pick.
        applicableSubcategories: draft.applicableCategories.length
          ? draft.applicableSubcategories
          : [],
        showInBanner: draft.showInBanner,
      };
      if (draft.id) {
        await updateCoupon(draft.id, payload);
        toast.success('Coupon updated');
      } else {
        await createCoupon(payload);
        toast.success('Coupon created');
      }
      setShowForm(false);
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id?: string) => {
    if (!id) return;
    try { await deleteCoupon(id); toast.success('Coupon deleted'); }
    catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  };

  const toggle = async (c: Coupon) => {
    if (!c.id) return;
    try { await updateCoupon(c.id, { active: !c.active }); }
    catch (e: any) { toast.error(e?.message || 'Update failed'); }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* ignore */ }
  };

  const deleting = items.find((c) => c.id === deleteId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AdminPageHeader
        eyebrow="Marketing"
        title="Coupons"
        description="Create promotional codes with a minimum order value, expiry and usage limits."
        actions={
          <Button onClick={openNew}>
            <Plus aria-hidden="true" /> New coupon
          </Button>
        }
        className="pb-0"
      />

      {/* Stats */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
        <li><StatCard icon={Ticket} label="Total coupons" value={stats.total} /></li>
        <li><StatCard icon={Check} label="Live now" value={stats.active} /></li>
        <li className="col-span-2 sm:col-span-1"><StatCard icon={UsersIcon} label="Redemptions" value={stats.uses} /></li>
      </ul>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search coupon codes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search coupon code"
            className="pl-9"
          />
        </div>
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as typeof filter)}
          aria-label="Filter coupons"
          className="self-start"
        >
          {(['all', 'active', 'inactive', 'expired'] as const).map((f) => (
            <ToggleGroupItem key={f} value={f} size="sm" className="capitalize">
              {f}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {loading ? (
        <div aria-busy="true" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <span className="sr-only">Loading coupons</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-4 rounded-card border border-border bg-card p-5">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-card px-4 py-12">
          <EmptyState
            icon={Ticket}
            title={items.length === 0 ? 'No coupons yet' : 'No coupons match'}
            description={items.length === 0 ? 'Create your first code with New coupon.' : 'Try another code or filter.'}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {list.map((c, i) => {
            const state = couponState(c);
            const usagePct = c.maxUses > 0 ? Math.min(100, Math.round((c.usedCount / c.maxUses) * 100)) : 0;
            return (
              <motion.div
                key={c.id}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}
                className="relative overflow-hidden rounded-card border border-border bg-card shadow-sm"
              >
                {/* Ticket left strip */}
                <div aria-hidden="true" className={`absolute bottom-0 left-0 top-0 w-1 ${state === 'live' ? 'bg-primary' : 'bg-border'}`} />
                <div className="p-5 pl-6">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => copyCode(c.code)}
                        className="group inline-flex items-center gap-2 rounded-control font-mono text-lg font-bold text-foreground transition-colors duration-hover hover:text-primary"
                        aria-label={`Copy code ${c.code}`}
                      >
                        {c.code}
                        {copied === c.code
                          ? <Check aria-hidden="true" className="h-4 w-4 text-status-success-fg" />
                          : <Copy aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />}
                      </button>
                      <span className="sr-only" aria-live="polite">{copied === c.code ? 'Copied' : ''}</span>
                      {c.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge tone={STATE_TONE[state].tone} icon={STATE_TONE[state].icon} label={STATE_LABEL[state]} />
                      {c.showInBanner && (
                        // Switched on is not the same as showing: say which, so
                        // the owner is not left wondering why the ribbon is empty.
                        <StatusBadge
                          tone={state === 'live' ? 'info' : 'neutral'}
                          icon={Megaphone}
                          label={state === 'live' ? 'In banner' : 'Banner waiting'}
                          title={state === 'live' ? 'Shown in the offer banner' : 'Will show in the banner once it is live'}
                        />
                      )}
                    </div>
                  </div>

                  <p className="mb-4 flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tabular-nums text-foreground">
                      {c.type === 'percent' ? `${c.value}%` : formatINR(c.value)}
                    </span>
                    <span className="text-xs text-muted-foreground">off</span>
                  </p>

                  <div className="space-y-2 border-t border-dashed border-border pt-3 text-xs text-foreground/80">
                    <Row label="Min order" value={formatINR(c.minOrderValue || 0)} />
                    {c.type === 'percent' && c.maxDiscount > 0 && (
                      <Row label="Max discount" value={formatINR(c.maxDiscount)} />
                    )}
                    {/* Only shown when set, so an unrestricted coupon stays uncluttered. */}
                    {c.applicableCategories && c.applicableCategories.length > 0 && (
                      <Row
                        label="Applies to"
                        value={
                          c.applicableSubcategories && c.applicableSubcategories.length > 0
                            ? `${c.applicableCategories.join(', ')} · ${c.applicableSubcategories.join(', ')}`
                            : c.applicableCategories.join(', ')
                        }
                      />
                    )}
                    <Row
                      label="Validity"
                      value={
                        !c.validFrom && !c.validTo
                          ? 'No end date'
                          : !c.validFrom
                            ? `Until ${fmtDate(c.validTo)}`
                            : !c.validTo
                              ? `From ${fmtDate(c.validFrom)}`
                              : `${fmtDate(c.validFrom)} to ${fmtDate(c.validTo)}`
                      }
                    />
                    <Row
                      label="Used"
                      value={c.maxUses > 0 ? `${c.usedCount} of ${c.maxUses}` : `${c.usedCount} (unlimited)`}
                    />
                    {c.maxUses > 0 && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Uses" aria-valuenow={usagePct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full bg-primary" style={{ width: `${usagePct}%` }} />
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-1 border-t border-border pt-3">
                    <IconButton label={c.active ? `Hide ${c.code}` : `Show ${c.code}`} tooltip={c.active ? 'Hide' : 'Show'} size="sm" onClick={() => toggle(c)}>
                      {c.active ? <Eye /> : <EyeOff />}
                    </IconButton>
                    <IconButton label={`Edit ${c.code}`} tooltip="Edit" size="sm" onClick={() => openEdit(c)}>
                      <Edit2 />
                    </IconButton>
                    <IconButton label={`Delete ${c.code}`} tooltip="Delete" size="sm" className="hover:text-status-danger-fg" onClick={(e) => { confirmReturnRef.current = e.currentTarget; if (c.id) setDeleteId(c.id); }}>
                      <Trash2 />
                    </IconButton>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        returnFocusRef={confirmReturnRef}
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={`Delete coupon ${deleting?.code ?? ''}?`}
        description="Customers can no longer use this code. This cannot be undone."
        confirmLabel="Delete coupon"
        tone="danger"
        onConfirm={() => onDelete(deleteId ?? undefined)}
      />

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent
          className="max-h-[90vh] max-w-2xl overflow-y-auto"
          onCloseAutoFocus={(e) => {
            if (returnFocusRef.current?.isConnected) {
              e.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Edit coupon' : 'New coupon'}</DialogTitle>
            <DialogDescription>Codes are 3 to 20 characters: letters, numbers, - and _.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Code" htmlFor="cf-code" required>
                <Input id="cf-code" className="font-mono uppercase" value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                  placeholder="WELCOME10" required />
              </Field>
              <Field label="Type" htmlFor="cf-type">
                <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as CouponType })}>
                  <SelectTrigger id="cf-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage off</SelectItem>
                    <SelectItem value="flat">Flat amount off</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Description" htmlFor="cf-desc">
              <Input id="cf-desc" value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="e.g. New customer welcome offer" />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={draft.type === 'percent' ? 'Discount %' : 'Discount ₹'} htmlFor="cf-value">
                <Input id="cf-value" type="number" inputMode="decimal" min={1} className="tabular-nums" value={draft.value}
                  onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })} />
              </Field>
              <Field label="Min order value (₹)" htmlFor="cf-min">
                <Input id="cf-min" type="number" inputMode="decimal" min={0} className="tabular-nums" value={draft.minOrderValue}
                  onChange={(e) => setDraft({ ...draft, minOrderValue: Number(e.target.value) })} />
              </Field>
              {draft.type === 'percent' && (
                <Field label="Max discount (₹, 0 = none)" htmlFor="cf-max">
                  <Input id="cf-max" type="number" inputMode="decimal" min={0} className="tabular-nums" value={draft.maxDiscount}
                    onChange={(e) => setDraft({ ...draft, maxDiscount: Number(e.target.value) })} />
                </Field>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Total uses (0 = unlimited)" htmlFor="cf-uses">
                <Input id="cf-uses" type="number" inputMode="numeric" min={0} className="tabular-nums" value={draft.maxUses}
                  onChange={(e) => setDraft({ ...draft, maxUses: Number(e.target.value) })} />
              </Field>
              <Field label="Per-customer limit (0 = unlimited)" htmlFor="cf-peruser">
                <Input id="cf-peruser" type="number" inputMode="numeric" min={0} className="tabular-nums" value={draft.perUserLimit}
                  onChange={(e) => setDraft({ ...draft, perUserLimit: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Valid from" htmlFor="cf-from">
                <Input id="cf-from" type="date" value={draft.validFrom}
                  onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })} />
              </Field>
              <Field label="Valid to" htmlFor="cf-to">
                <Input id="cf-to" type="date" value={draft.validTo}
                  onChange={(e) => setDraft({ ...draft, validTo: e.target.value })} />
              </Field>
            </div>
            {/*
              Which products the code applies to. Nothing selected means the
              whole shop, which is what every existing coupon expects, so the
              default stays "all".
            */}
            <fieldset aria-label="Limit to categories" className="rounded-card border border-border p-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">Limit to categories</span>
                <span className="text-xs text-muted-foreground">
                  {draft.applicableCategories.length === 0
                    ? 'All categories'
                    : `${draft.applicableCategories.length} selected`}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.length === 0 && (
                  <span className="text-xs text-muted-foreground">Loading categories</span>
                )}
                {categories.map((cat) => {
                  const on = draft.applicableCategories.includes(cat.name);
                  return (
                    <ChipToggle key={cat.id || cat.name} on={on} onClick={() => toggleCategory(cat.name)}>
                      {cat.name}
                    </ChipToggle>
                  );
                })}
              </div>

              {draft.applicableCategories.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">
                      Narrow to subcategories <span className="font-normal text-muted-foreground">(optional)</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {draft.applicableSubcategories.length === 0
                        ? 'Whole category'
                        : `${draft.applicableSubcategories.length} selected`}
                    </span>
                  </div>
                  {subcategoryChoices.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      These categories have no subcategories.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {subcategoryChoices.map((name) => (
                        <ChipToggle key={name} on={draft.applicableSubcategories.includes(name)} onClick={() => toggleSubcategory(name)}>
                          {name}
                        </ChipToggle>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </fieldset>

            {/*
              Advertising is opt-in per coupon: a private code for one
              customer should never appear in the site-wide ribbon.
            */}
            <div className="flex items-start justify-between gap-4 rounded-card border border-border bg-muted/40 p-4">
              <div>
                <Label htmlFor="cf-banner" className="text-sm font-medium text-foreground">Show in offer banner</Label>
                <p id="cf-banner-hint" className="mt-0.5 text-xs text-muted-foreground">
                  Advertise this code in the strip at the top of every page and under product prices.
                  It only appears while the coupon is active, within its dates and not used up.
                </p>
              </div>
              <Switch
                id="cf-banner"
                aria-describedby="cf-banner-hint"
                checked={draft.showInBanner}
                onCheckedChange={(checked) => setDraft({ ...draft, showInBanner: checked })}
              />
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <Checkbox id="cf-active" checked={draft.active}
                  onCheckedChange={(checked) => setDraft({ ...draft, active: checked === true })} />
                <Label htmlFor="cf-active" className="text-sm font-normal text-foreground">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="cf-first" checked={draft.firstOrderOnly}
                  onCheckedChange={(checked) => setDraft({ ...draft, firstOrderOnly: checked === true })} />
                <Label htmlFor="cf-first" className="text-sm font-normal text-foreground">First-order customers only</Label>
              </div>
            </div>

            <DialogFooter className="gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Spinner />}
                {draft.id ? 'Save changes' : 'Create coupon'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium tabular-nums text-foreground">{value}</span>
  </div>
);

const Field = ({ label, htmlFor, required, children }: { label: string; htmlFor: string; required?: boolean; children: React.ReactNode }) => (
  <div>
    <Label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-foreground/80">
      {label}
      {required && <span aria-hidden="true" className="ml-0.5 text-status-danger-fg">*</span>}
    </Label>
    {children}
  </div>
);

/** A filter chip that toggles on and off (category and subcategory pickers). */
const ChipToggle = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={`inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-xs font-medium transition-[background-color,border-color,color,transform] duration-press ease-out active:scale-[0.97] ${
      on
        ? 'border-primary bg-primary/10 text-foreground'
        : 'border-border bg-card text-foreground/80 hover:border-foreground/30'
    }`}
  >
    {on && <Check aria-hidden="true" className="h-3.5 w-3.5 text-primary" />}
    {children}
  </button>
);

export default AdminCoupons;
