import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  Save,
  Tag,
  Truck,
  Receipt,
  HeadphonesIcon,
  HelpCircle,
  Phone,
  Mail,
  MessageCircle,
  Clock,
  IndianRupee,
  Coins,
  AlertCircle,
  RefreshCw,
  Ticket,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { IconButton } from '@/components/ui/icon-button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { FormSkeleton } from '@/components/skeletons';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { ScratchWinSettingsTab } from '@/components/admin/ScratchWinSettingsTab';
import { fadeUp } from '@/lib/motion';
import {
  getCouponsSettings,
  saveCouponsSettings,
  getDeliverySettings,
  saveDeliverySettings,
  getGstSettings,
  saveGstSettings,
  getCustomerSupportSettings,
  saveCustomerSupportSettings,
  DEFAULT_COUPONS,
  DEFAULT_DELIVERY,
  DEFAULT_GST,
  DEFAULT_SUPPORT,
  type Coupon,
  type CouponsSettings,
  type DeliverySettings,
  type StateDeliveryRate,
  type GstSettings,
  type CustomerSupportSettings,
  type FaqEntry,
} from '@/services/siteSettingsService';

import { describeError } from '@/lib/errorMessage';
import { getRewardSettings, saveRewardSettings } from '@/services/rewardsService';
import { normaliseRewardSettings, type RewardSettings } from '@/lib/rewards';

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const Section = ({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) => (
  <motion.section
    {...fadeUp}
    className="rounded-card border border-border bg-card p-4 shadow-sm sm:p-6"
  >
    <div className="mb-5 flex items-center gap-3">
      {Icon && (
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-muted text-foreground/70">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      )}
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
    {children}
  </motion.section>
);

/** Loading state for one tab: the panel it will become. */
const TabSkeleton = ({ label }: { label: string }) => (
  <div className="rounded-card border border-border bg-card p-4 sm:p-6">
    <FormSkeleton fields={5} label={label} />
  </div>
);

// ─── COUPONS TAB ─────────────────────────────────────────────────────────────
const CouponsTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CouponsSettings>(DEFAULT_COUPONS);

  useEffect(() => {
    (async () => {
      try {
        setSettings(await getCouponsSettings());
      } catch (e) {
        toast.error('Could not load coupons', { description: describeError(e) });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateCoupon = (id: string, patch: Partial<Coupon>) =>
    setSettings((prev) => ({
      ...prev,
      coupons: prev.coupons.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));

  const addCoupon = () => {
    const fresh: Coupon = {
      id: newId(),
      code: 'NEW10',
      description: '',
      discountType: 'percentage',
      discountValue: 10,
      active: true,
    };
    setSettings((p) => ({ ...p, coupons: [fresh, ...p.coupons] }));
  };

  const removeCoupon = (id: string) =>
    setSettings((p) => ({ ...p, coupons: p.coupons.filter((c) => c.id !== id) }));

  const handleSave = async () => {
    // basic validation
    const codes = settings.coupons.map((c) => c.code.trim().toUpperCase());
    if (codes.some((c) => !c)) {
      toast.error('Every coupon must have a code');
      return;
    }
    if (new Set(codes).size !== codes.length) {
      toast.error('Coupon codes must be unique');
      return;
    }
    setSaving(true);
    try {
      const cleaned: CouponsSettings = {
        coupons: settings.coupons.map((c) => ({
          ...c,
          code: c.code.trim().toUpperCase(),
        })),
      };
      await saveCouponsSettings(cleaned);
      setSettings(cleaned);
      toast.success('Coupons saved');
    } catch (e) {
      console.error(e);
      toast.error('Could not save coupons', { description: describeError(e) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <TabSkeleton label="Loading settings" />;
  }

  return (
    <div className="space-y-6">
      <Section
        title="Coupons"
        subtitle="Create discount codes customers can apply at checkout"
        icon={Tag}
      >
        <div className="flex justify-end mb-4">
          <Button
            type="button"
            onClick={addCoupon}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Coupon
          </Button>
        </div>

        {settings.coupons.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No coupons yet. Click "Add Coupon" to create one.
          </p>
        ) : (
          <div className="space-y-4">
            {settings.coupons.map((c) => (
              <div
                key={c.id}
                className="border border-border rounded-card p-4 bg-muted/50"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={c.active}
                      onCheckedChange={(v) => updateCoupon(c.id, { active: v })}
                    />
                    <span className="text-xs text-foreground/80">
                      {c.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCoupon(c.id)}
                    className="text-status-danger-fg hover:bg-status-danger-bg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Code</Label>
                    <Input
                      value={c.code}
                      onChange={(e) =>
                        updateCoupon(c.id, { code: e.target.value.toUpperCase() })
                      }
                      placeholder="WELCOME10"
                      className="uppercase font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={c.description ?? ''}
                      onChange={(e) => updateCoupon(c.id, { description: e.target.value })}
                      placeholder="10% off your first order"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Discount Type</Label>
                    <Select
                      value={c.discountType}
                      onValueChange={(v) =>
                        updateCoupon(c.id, { discountType: v as Coupon['discountType'] })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                        <SelectItem value="fixed">Fixed amount (₹)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">
                      Value {c.discountType === 'percentage' ? '(%)' : '(₹)'}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={c.discountValue}
                      onChange={(e) =>
                        updateCoupon(c.id, { discountValue: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Min Order Value (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={c.minOrderValue ?? ''}
                      onChange={(e) =>
                        updateCoupon(c.id, {
                          minOrderValue: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="0"
                    />
                  </div>
                  {c.discountType === 'percentage' && (
                    <div>
                      <Label className="text-xs">Max Discount Cap (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={c.maxDiscount ?? ''}
                        onChange={(e) =>
                          updateCoupon(c.id, {
                            maxDiscount: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        placeholder="No cap"
                      />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Valid From</Label>
                    <Input
                      type="date"
                      value={c.validFrom ?? ''}
                      onChange={(e) =>
                        updateCoupon(c.id, { validFrom: e.target.value || undefined })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Valid To</Label>
                    <Input
                      type="date"
                      value={c.validTo ?? ''}
                      onChange={(e) =>
                        updateCoupon(c.id, { validTo: e.target.value || undefined })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Coupons
          </Button>
        </div>
      </Section>
    </div>
  );
};

// ─── DELIVERY & GST TAB ──────────────────────────────────────────────────────
const DeliveryGstTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [delivery, setDelivery] = useState<DeliverySettings>(DEFAULT_DELIVERY);
  const [gst, setGst] = useState<GstSettings>(DEFAULT_GST);

  useEffect(() => {
    (async () => {
      try {
        const [d, g] = await Promise.all([getDeliverySettings(), getGstSettings()]);
        setDelivery(d);
        setGst(g);
      } catch (e) {
        toast.error('Could not load delivery and GST settings', { description: describeError(e) });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateDelivery = <K extends keyof DeliverySettings>(k: K, v: DeliverySettings[K]) =>
    setDelivery((p) => ({ ...p, [k]: v }));
  const updateGst = <K extends keyof GstSettings>(k: K, v: GstSettings[K]) =>
    setGst((p) => ({ ...p, [k]: v }));

  const updateStateRate = (id: string, patch: Partial<StateDeliveryRate>) =>
    setDelivery((p) => ({
      ...p,
      stateRates: (p.stateRates || []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));

  const addStateRate = () =>
    setDelivery((p) => ({
      ...p,
      stateRates: [...(p.stateRates || []), { id: newId(), state: '', charge: 0 }],
    }));

  const removeStateRate = (id: string) =>
    setDelivery((p) => ({ ...p, stateRates: (p.stateRates || []).filter((r) => r.id !== id) }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([saveDeliverySettings(delivery), saveGstSettings(gst)]);
      toast.success('Delivery and GST saved');
    } catch (e) {
      console.error(e);
      toast.error('Could not save delivery and GST settings', { description: describeError(e) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <TabSkeleton label="Loading settings" />;
  }

  return (
    <div className="space-y-6">
      <Section
        title="Delivery charges"
        subtitle="One universal charge for the whole catalogue, priced by destination state"
        icon={Truck}
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-card border border-border bg-muted/40 p-4">
            <Switch
              id="cs-delivery-on"
              aria-describedby="cs-delivery-on-hint"
              checked={delivery.enabled}
              onCheckedChange={(v) => updateDelivery('enabled', v)}
            />
            <div>
              <Label htmlFor="cs-delivery-on" className="text-sm font-medium text-foreground">
                Charge delivery on all products
              </Label>
              <p id="cs-delivery-on-hint" className="mt-0.5 text-xs text-muted-foreground">
                Off means free delivery everywhere. A product with its own delivery
                charges (Products → edit → Delivery) always uses those instead.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="cs-home-state" className="text-xs">Ships from (state)</Label>
              <Input
                id="cs-home-state"
                aria-describedby="cs-home-state-hint"
                value={delivery.homeState}
                onChange={(e) => updateDelivery('homeState', e.target.value)}
                placeholder="e.g. Telangana"
                disabled={!delivery.enabled}
                className="mt-1.5"
              />
              <p id="cs-home-state-hint" className="mt-1.5 text-xs text-muted-foreground">
                Orders to this state pay the within-state charge.
              </p>
            </div>
            <div>
              <Label htmlFor="cs-within" className="text-xs">Within {delivery.homeState || 'home state'} (₹)</Label>
              <Input
                id="cs-within"
                className="mt-1.5 tabular-nums"
                inputMode="decimal"
                type="number"
                min={0}
                value={delivery.withinStateCharge}
                onChange={(e) => updateDelivery('withinStateCharge', Number(e.target.value) || 0)}
                disabled={!delivery.enabled}
              />
            </div>
            <div>
              <Label htmlFor="cs-outside" className="text-xs">Outside {delivery.homeState || 'home state'} (₹)</Label>
              <Input
                id="cs-outside"
                className="mt-1.5 tabular-nums"
                inputMode="decimal"
                type="number"
                min={0}
                value={delivery.outsideStateCharge}
                onChange={(e) => updateDelivery('outsideStateCharge', Number(e.target.value) || 0)}
                disabled={!delivery.enabled}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cs-free-above" className="text-xs">Free delivery above (₹)</Label>
              <Input
                id="cs-free-above"
                aria-describedby="cs-free-above-hint"
                className="mt-1.5 tabular-nums"
                inputMode="decimal"
                type="number"
                min={0}
                value={delivery.freeDeliveryAbove}
                onChange={(e) => updateDelivery('freeDeliveryAbove', Number(e.target.value) || 0)}
              />
              <p id="cs-free-above-hint" className="mt-1.5 text-xs text-muted-foreground">
                Set 0 to disable. Applies to every product, including per-product charges.
              </p>
            </div>
            <div>
              <Label htmlFor="cs-eta" className="text-xs">Estimated delivery time</Label>
              <Input
                id="cs-eta"
                className="mt-1.5"
                value={delivery.estimatedDays ?? ''}
                onChange={(e) => updateDelivery('estimatedDays', e.target.value)}
                placeholder="3-5 business days"
              />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground/80">
                  Per-state rates
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Everything ships from {delivery.homeState || 'your home state'}, so a far
                  state costs more than a neighbouring one. A state listed here is charged
                  exactly this amount and ignores the outside-state rate, including for
                  products with their own delivery charges. Match the state name to what
                  customers pick in their address (e.g. "Delhi", "Kerala").
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addStateRate}
                disabled={!delivery.enabled}
                className="shrink-0"
              >
                <Plus aria-hidden="true" /> Add state
              </Button>
            </div>

            {(delivery.stateRates || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No state overrides. Everywhere outside {delivery.homeState || 'the home state'}{' '}
                pays ₹{delivery.outsideStateCharge}.
              </p>
            ) : (
              <div className="space-y-2">
                {(delivery.stateRates || []).map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-card border border-border bg-muted/40 p-3 md:grid-cols-12"
                  >
                    <div className="col-span-2 md:col-span-7">
                      <Label htmlFor={`cs-rate-state-${r.id}`} className="text-xs">State</Label>
                      <Input
                        id={`cs-rate-state-${r.id}`}
                        className="mt-1.5"
                        value={r.state}
                        onChange={(e) => updateStateRate(r.id, { state: e.target.value })}
                        placeholder="Delhi"
                        disabled={!delivery.enabled}
                      />
                    </div>
                    <div className="md:col-span-4">
                      <Label htmlFor={`cs-rate-charge-${r.id}`} className="text-xs">Charge (₹)</Label>
                      <Input
                        id={`cs-rate-charge-${r.id}`}
                        className="mt-1.5 tabular-nums"
                        inputMode="decimal"
                        type="number"
                        min={0}
                        value={r.charge}
                        onChange={(e) => updateStateRate(r.id, { charge: Number(e.target.value) || 0 })}
                        disabled={!delivery.enabled}
                      />
                    </div>
                    <div className="flex justify-end md:col-span-1">
                      <IconButton
                        label={r.state ? `Remove ${r.state}` : 'Remove this state'}
                        onClick={() => removeStateRate(r.id)}
                        className="text-muted-foreground hover:text-status-danger-fg"
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section title="GST" subtitle="Configure tax rate and how it appears at checkout" icon={Receipt}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <Switch
              id="cs-gst-on"
              checked={gst.enabled}
              onCheckedChange={(v) => updateGst('enabled', v)}
            />
            <Label htmlFor="cs-gst-on" className="text-sm font-normal text-foreground">GST enabled</Label>
          </div>
          <div>
            <Label htmlFor="cs-gst-rate" className="text-xs">
              GST rate (%)
            </Label>
            <Input
              id="cs-gst-rate"
              className="mt-1.5 tabular-nums"
              inputMode="decimal"
              placeholder="e.g. 12"
              type="number"
              min={0}
              step={0.01}
              value={gst.rate}
              onChange={(e) => updateGst('rate', Number(e.target.value) || 0)}
              disabled={!gst.enabled}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="cs-gst-inclusive"
              aria-describedby="cs-gst-inclusive-hint"
              checked={gst.inclusive}
              onCheckedChange={(v) => updateGst('inclusive', v)}
              disabled={!gst.enabled}
            />
            <Label htmlFor="cs-gst-inclusive" className="text-sm font-normal text-foreground">Inclusive (price already contains GST)</Label>
          </div>
          <div className="md:col-span-2 -mt-1">
            <p id="cs-gst-inclusive-hint" className="text-xs text-muted-foreground">
              Inclusive: checkout shows how much of the price is GST and adds nothing to
              the total. Exclusive: GST is calculated on the subtotal and added on top.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="cs-gst-inline"
              checked={gst.displayInline}
              onCheckedChange={(v) => updateGst('displayInline', v)}
              disabled={!gst.enabled}
            />
            <Label htmlFor="cs-gst-inline" className="text-sm font-normal text-foreground">Show GST line at checkout</Label>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="cs-hsn" className="text-xs">HSN code <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              id="cs-hsn"
              className="mt-1.5"
              value={gst.hsnCode ?? ''}
              onChange={(e) => updateGst('hsnCode', e.target.value)}
              disabled={!gst.enabled}
            />
          </div>
        </div>
      </Section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Spinner /> : <Save aria-hidden="true" />}
          Save delivery
        </Button>
      </div>
    </div>
  );
};

// ─── CUSTOMER SUPPORT TAB ────────────────────────────────────────────────────
const SupportTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<CustomerSupportSettings>(DEFAULT_SUPPORT);

  useEffect(() => {
    (async () => {
      try {
        setS(await getCustomerSupportSettings());
      } catch (e) {
        toast.error('Could not load support settings', { description: describeError(e) });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = <K extends keyof CustomerSupportSettings>(
    k: K,
    v: CustomerSupportSettings[K]
  ) => setS((p) => ({ ...p, [k]: v }));

  const updateFaq = (id: string, patch: Partial<FaqEntry>) =>
    setS((p) => ({ ...p, faqs: p.faqs.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));

  const addFaq = () =>
    setS((p) => ({
      ...p,
      faqs: [...p.faqs, { id: newId(), question: '', answer: '' }],
    }));

  const removeFaq = (id: string) =>
    setS((p) => ({ ...p, faqs: p.faqs.filter((f) => f.id !== id) }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveCustomerSupportSettings(s);
      toast.success('Support settings saved');
    } catch (e) {
      console.error(e);
      toast.error('Could not save support settings', { description: describeError(e) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <TabSkeleton label="Loading settings" />;
  }

  return (
    <div className="space-y-6">
      <Section title="Contact" subtitle="Channels customers see on the support page" icon={HeadphonesIcon}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cs-phone" className="flex items-center gap-1 text-xs">
              <Phone aria-hidden="true" className="h-3 w-3" /> Phone
            </Label>
            <Input id="cs-phone" className="mt-1.5" value={s.phone} onChange={(e) => update('phone', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cs-email" className="flex items-center gap-1 text-xs">
              <Mail aria-hidden="true" className="h-3 w-3" /> Email
            </Label>
            <Input id="cs-email" className="mt-1.5" value={s.email} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cs-whatsapp" className="flex items-center gap-1 text-xs">
              <MessageCircle aria-hidden="true" className="h-3 w-3" /> WhatsApp
            </Label>
            <Input id="cs-whatsapp" className="mt-1.5" value={s.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cs-hours" className="flex items-center gap-1 text-xs">
              <Clock aria-hidden="true" className="h-3 w-3" /> Hours
            </Label>
            <Input id="cs-hours" className="mt-1.5" value={s.hours} onChange={(e) => update('hours', e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="cs-response" className="text-xs">Response time</Label>
            <Input
              id="cs-response"
              className="mt-1.5"
              value={s.responseTime}
              onChange={(e) => update('responseTime', e.target.value)}
              placeholder="Within 24 hours"
            />
          </div>
        </div>
      </Section>

      <Section title="FAQs" subtitle="Questions and answers on the support page" icon={HelpCircle}>
        <div className="mb-4 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={addFaq}>
            <Plus aria-hidden="true" /> Add FAQ
          </Button>
        </div>
        {s.faqs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No FAQs yet. Add one with Add FAQ.
          </p>
        ) : (
          <div className="space-y-3">
            {s.faqs.map((f, i) => (
              <div
                key={f.id}
                className="space-y-2 rounded-card border border-border bg-muted/40 p-3"
              >
                <div className="flex items-start gap-2">
                  <Input
                    aria-label={`Question ${i + 1}`}
                    value={f.question}
                    onChange={(e) => updateFaq(f.id, { question: e.target.value })}
                    placeholder="Question"
                    className="font-medium"
                  />
                  <IconButton
                    label={`Remove question ${i + 1}`}
                    onClick={() => removeFaq(f.id)}
                    className="text-muted-foreground hover:text-status-danger-fg"
                  >
                    <Trash2 />
                  </IconButton>
                </div>
                <Textarea
                  aria-label={`Answer ${i + 1}`}
                  value={f.answer}
                  onChange={(e) => updateFaq(f.id, { answer: e.target.value })}
                  placeholder="Answer"
                  rows={2}
                />
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Spinner /> : <Save aria-hidden="true" />}
          Save support
        </Button>
      </div>
    </div>
  );
};

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────
// ─── REWARDS TAB ─────────────────────────────────────────────────────────────
// Loyalty points + wallet cashback rules (src/lib/rewards.ts). Read by the
// storefront and by api/create-order.ts + api/notify-order.ts.
const RewardsTab = () => {
  // Set only by a successful read. A failed one never falls back to the
  // defaults: saving those would overwrite the shop's real settings.
  const [s, setS] = useState<RewardSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    setLoadError(null);
    getRewardSettings()
      .then((loaded) => {
        if (live) setS(loaded);
      })
      .catch((err) => {
        console.error(err);
        if (live) setLoadError(describeError(err));
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  if (!s && !loadError) {
    return (
      <TabSkeleton label="Loading reward settings" />
    );
  }

  if (!s) {
    return (
      <Section
        title="Loyalty points and cashback"
        subtitle="Placeholder values until the client confirms its loyalty rules."
        icon={Coins}
      >
        <Notice
          tone="danger"
          title="Could not load the reward settings"
          className="mb-5"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw aria-hidden="true" /> Retry
            </Button>
          }
        >
          <p>{loadError}</p>
          <p className="mt-1">Saving stays off until they load, so the current settings cannot be overwritten.</p>
        </Notice>
        <Button disabled>
          <Save aria-hidden="true" />
          Save rewards
        </Button>
      </Section>
    );
  }

  const field = (
    key: 'pointsPer100' | 'pointValue' | 'unlockDays' | 'maxPointsPercent',
    label: string,
    hint: string,
    step = 1,
  ) => (
    <div>
      <Label htmlFor={`rw-${key}`} className="text-sm">{label}</Label>
      <Input
        id={`rw-${key}`}
        aria-describedby={`rw-${key}-hint`}
        inputMode="decimal"
        type="number"
        step={step}
        min={0}
        value={s[key]}
        onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })}
        className="mt-1.5 tabular-nums"
      />
      <p id={`rw-${key}-hint`} className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  const save = async () => {
    setSaving(true);
    try {
      // What is written: out-of-range values are clamped, so show those afterwards.
      const clean = normaliseRewardSettings(s);
      await saveRewardSettings(clean);
      const adjusted = (Object.keys(clean) as (keyof RewardSettings)[]).some((k) => clean[k] !== s[k]);
      // Keep anything typed while the save was running.
      setS((current) => (current === s ? clean : current));
      toast.success(
        'Reward settings saved',
        adjusted ? { description: 'Values outside the allowed range were adjusted to fit.' } : undefined,
      );
    } catch (err) {
      console.error(err);
      toast.error('Could not save reward settings', { description: describeError(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      title="Loyalty points and cashback"
      subtitle="Placeholder values until the client confirms its loyalty rules."
      icon={Coins}
    >
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <Label htmlFor="rw-enabled" className="text-sm font-medium text-foreground">Rewards on</Label>
          <p id="rw-enabled-hint" className="text-xs text-muted-foreground">
            Off hides the checkout toggles and stops new points. Balances are kept.
          </p>
        </div>
        <Switch id="rw-enabled" aria-describedby="rw-enabled-hint" checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {field('pointsPer100', 'Points per ₹100 spent', 'On products paid for, once the order is delivered.')}
        {field('pointValue', 'Value of 1 point (₹)', 'What a point is worth at checkout.', 0.5)}
        {field('unlockDays', 'Days until points unlock', 'Never sooner than the 7-day return window.')}
        {field('maxPointsPercent', 'Max % of products payable with points', 'Wallet cashback has no cap.')}
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || !s}>
          {saving ? <Spinner /> : <Save aria-hidden="true" />}
          Save rewards
        </Button>
      </div>
    </Section>
  );
};

const AdminCommerceSettings = () => {
  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-4xl">
      <AdminPageHeader
        title="Commerce settings"
        description="Delivery, GST, customer support, rewards and Scratch & Win. Rewards are applied site-wide."
      />

      <Tabs defaultValue="delivery" className="w-full">
        <TabsList className="mb-6 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="delivery" className="gap-1.5">
            <Truck aria-hidden="true" className="h-4 w-4" /> Delivery and GST
          </TabsTrigger>
          <TabsTrigger value="support" className="gap-1.5">
            <HeadphonesIcon aria-hidden="true" className="h-4 w-4" /> Support
          </TabsTrigger>
          <TabsTrigger value="rewards" className="gap-1.5">
            <Coins aria-hidden="true" className="h-4 w-4" /> Rewards
          </TabsTrigger>
          <TabsTrigger value="scratch" className="gap-1.5">
            <Ticket aria-hidden="true" className="h-4 w-4" /> Scratch &amp; Win
          </TabsTrigger>
        </TabsList>

        <TabsContent value="delivery">
          <DeliveryGstTab />
        </TabsContent>
        <TabsContent value="support">
          <SupportTab />
        </TabsContent>
        <TabsContent value="rewards">
          <RewardsTab />
        </TabsContent>
        <TabsContent value="scratch">
          <ScratchWinSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminCommerceSettings;
