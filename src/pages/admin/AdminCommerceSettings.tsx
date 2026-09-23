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
  Percent,
  IndianRupee,
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
  <motion.div
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
    className="bg-white dark:bg-gray-900 border border-[#F5EFE6] dark:border-gray-800 rounded-2xl p-6 shadow-sm"
  >
    <div className="flex items-center gap-3 mb-5">
      {Icon && (
        <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/20 grid place-items-center text-amber-700 dark:text-amber-400">
          <Icon className="w-4 h-4" />
        </div>
      )}
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
    {children}
  </motion.div>
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
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
      </div>
    );
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
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Coupon
          </Button>
        </div>

        {settings.coupons.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
            No coupons yet. Click "Add Coupon" to create one.
          </p>
        ) : (
          <div className="space-y-4">
            {settings.coupons.map((c) => (
              <div
                key={c.id}
                className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-gray-50 dark:bg-gray-950"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={c.active}
                      onCheckedChange={(v) => updateCoupon(c.id, { active: v })}
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {c.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCoupon(c.id)}
                    className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
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
            className="bg-amber-600 hover:bg-amber-700 text-white"
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
        toast.error('Could not load delivery / GST settings', { description: describeError(e) });
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
      toast.success('Delivery & GST saved');
    } catch (e) {
      console.error(e);
      toast.error('Could not save delivery / GST settings', { description: describeError(e) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section
        title="Delivery Charges"
        subtitle="One universal charge for the whole catalogue, priced by destination state"
        icon={Truck}
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 p-3">
            <Switch
              checked={delivery.enabled}
              onCheckedChange={(v) => updateDelivery('enabled', v)}
            />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Charge delivery on all products
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Off means free delivery everywhere. A product with its own delivery
                charges (Products → edit → Delivery) always uses those instead.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Ships From (state)</Label>
              <Input
                value={delivery.homeState}
                onChange={(e) => updateDelivery('homeState', e.target.value)}
                placeholder="Andhra Pradesh"
                disabled={!delivery.enabled}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Orders to this state pay the within-state charge.
              </p>
            </div>
            <div>
              <Label className="text-xs">Within {delivery.homeState || 'home state'} (₹)</Label>
              <Input
                type="number"
                min={0}
                value={delivery.withinStateCharge}
                onChange={(e) => updateDelivery('withinStateCharge', Number(e.target.value) || 0)}
                disabled={!delivery.enabled}
              />
            </div>
            <div>
              <Label className="text-xs">Outside {delivery.homeState || 'home state'} (₹)</Label>
              <Input
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
              <Label className="text-xs">Free Delivery Above (₹)</Label>
              <Input
                type="number"
                min={0}
                value={delivery.freeDeliveryAbove}
                onChange={(e) => updateDelivery('freeDeliveryAbove', Number(e.target.value) || 0)}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Set 0 to disable. Applies to every product, including per-product charges.
              </p>
            </div>
            <div>
              <Label className="text-xs">Estimated Delivery Time</Label>
              <Input
                value={delivery.estimatedDays ?? ''}
                onChange={(e) => updateDelivery('estimatedDays', e.target.value)}
                placeholder="3-5 business days"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Per-state rates
                </h4>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Everything ships from {delivery.homeState || 'your home state'}, so a far
                  state costs more than a neighbouring one. A state listed here is charged
                  exactly this amount and ignores the outside-state rate — including for
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
                className="border-amber-200 text-amber-700 hover:bg-amber-50 shrink-0"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add State
              </Button>
            </div>

            {(delivery.stateRates || []).length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                No state overrides — everywhere outside {delivery.homeState || 'the home state'}{' '}
                pays ₹{delivery.outsideStateCharge}.
              </p>
            ) : (
              <div className="space-y-2">
                {(delivery.stateRates || []).map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-gray-200 dark:border-gray-800 rounded-lg p-3 bg-gray-50 dark:bg-gray-950"
                  >
                    <div className="md:col-span-7">
                      <Label className="text-xs">State</Label>
                      <Input
                        value={r.state}
                        onChange={(e) => updateStateRate(r.id, { state: e.target.value })}
                        placeholder="Delhi"
                        disabled={!delivery.enabled}
                      />
                    </div>
                    <div className="md:col-span-4">
                      <Label className="text-xs">Charge (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={r.charge}
                        onChange={(e) => updateStateRate(r.id, { charge: Number(e.target.value) || 0 })}
                        disabled={!delivery.enabled}
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeStateRate(r.id)}
                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
              checked={gst.enabled}
              onCheckedChange={(v) => updateGst('enabled', v)}
            />
            <span className="text-sm">GST enabled</span>
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1">
              <Percent className="w-3 h-3" /> Rate (%)
            </Label>
            <Input
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
              checked={gst.inclusive}
              onCheckedChange={(v) => updateGst('inclusive', v)}
              disabled={!gst.enabled}
            />
            <span className="text-sm">Inclusive (price already contains GST)</span>
          </div>
          <div className="md:col-span-2 -mt-1">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Inclusive: checkout shows how much of the price is GST and adds nothing to
              the total. Exclusive: GST is calculated on the subtotal and added on top.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={gst.displayInline}
              onCheckedChange={(v) => updateGst('displayInline', v)}
              disabled={!gst.enabled}
            />
            <span className="text-sm">Show GST line at checkout</span>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">HSN Code (optional)</Label>
            <Input
              value={gst.hsnCode ?? ''}
              onChange={(e) => updateGst('hsnCode', e.target.value)}
              disabled={!gst.enabled}
            />
          </div>
        </div>
      </Section>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Delivery & GST
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
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Contact" subtitle="Channels customers see on the support page" icon={HeadphonesIcon}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs flex items-center gap-1">
              <Phone className="w-3 h-3" /> Phone
            </Label>
            <Input value={s.phone} onChange={(e) => update('phone', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1">
              <Mail className="w-3 h-3" /> Email
            </Label>
            <Input value={s.email} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1">
              <MessageCircle className="w-3 h-3" /> WhatsApp
            </Label>
            <Input value={s.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1">
              <Clock className="w-3 h-3" /> Hours
            </Label>
            <Input value={s.hours} onChange={(e) => update('hours', e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Response Time</Label>
            <Input
              value={s.responseTime}
              onChange={(e) => update('responseTime', e.target.value)}
              placeholder="Within 24 hours"
            />
          </div>
        </div>
      </Section>

      <Section title="FAQs" subtitle="Frequently Asked Questions for the support page" icon={HelpCircle}>
        <div className="flex justify-end mb-4">
          <Button
            type="button"
            onClick={addFaq}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add FAQ
          </Button>
        </div>
        {s.faqs.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
            No FAQs yet. Click "Add FAQ" to create one.
          </p>
        ) : (
          <div className="space-y-3">
            {s.faqs.map((f) => (
              <div
                key={f.id}
                className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 bg-gray-50 dark:bg-gray-950 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <Input
                    value={f.question}
                    onChange={(e) => updateFaq(f.id, { question: e.target.value })}
                    placeholder="Question"
                    className="font-medium"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFaq(f.id)}
                    className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <Textarea
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
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Support
        </Button>
      </div>
    </div>
  );
};

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────
const AdminCommerceSettings = () => {
  return (
    <div className="admin-panel max-w-5xl mx-auto p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
          Commerce Settings
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage coupons, delivery, GST, and customer support — applied site-wide at checkout.
        </p>
      </div>

      <Tabs defaultValue="delivery" className="w-full">
        <TabsList className="bg-white dark:bg-gray-900 border border-[#F5EFE6] dark:border-gray-800 p-1 rounded-xl mb-6">
          <TabsTrigger value="delivery" className="gap-1.5">
            <Truck className="w-4 h-4" /> Delivery & GST
          </TabsTrigger>
          <TabsTrigger value="support" className="gap-1.5">
            <HeadphonesIcon className="w-4 h-4" /> Support
          </TabsTrigger>
        </TabsList>

        <TabsContent value="delivery">
          <DeliveryGstTab />
        </TabsContent>
        <TabsContent value="support">
          <SupportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminCommerceSettings;
