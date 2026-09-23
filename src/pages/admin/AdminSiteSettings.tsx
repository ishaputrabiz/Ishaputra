import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  Save,
  Facebook,
  Instagram,
  Youtube,
  Twitter,
  Linkedin,
  MessageCircle,
  PinIcon,
  Send,
  Camera,
  AtSign,
  MapPin,
  Phone,
  Mail,
  Clock,
  Globe,
  Sparkles,
  Coins,
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
import {
  getFooterSettings,
  saveFooterSettings,
  DEFAULT_FOOTER,
  type FooterSettings,
  type SocialLink,
  type SocialPlatform,
  subscribeSidebarPromo,
  saveSidebarPromo,
  DEFAULT_SIDEBAR_PROMO,
  type SidebarPromoSettings,
} from '@/services/siteSettingsService';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

const PLATFORM_OPTIONS: { value: SocialPlatform; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'facebook', label: 'Facebook', Icon: Facebook },
  { value: 'instagram', label: 'Instagram', Icon: Instagram },
  { value: 'youtube', label: 'YouTube', Icon: Youtube },
  { value: 'twitter', label: 'X / Twitter', Icon: Twitter },
  { value: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
  { value: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
  { value: 'pinterest', label: 'Pinterest', Icon: PinIcon },
  { value: 'telegram', label: 'Telegram', Icon: Send },
  { value: 'snapchat', label: 'Snapchat', Icon: Camera },
  { value: 'threads', label: 'Threads', Icon: AtSign },
];

const Card = ({
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

const ListInput = ({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) => (
  <div className="space-y-2">
    {values.map((v, idx) => (
      <div key={idx} className="flex gap-2">
        <Input
          value={v}
          placeholder={placeholder}
          onChange={(e) => {
            const next = [...values];
            next[idx] = e.target.value;
            onChange(next);
          }}
          className="bg-white dark:bg-gray-950"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange(values.filter((_, i) => i !== idx))}
          className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    ))}
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => onChange([...values, ''])}
      className="text-amber-700 border-amber-200 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950"
    >
      <Plus className="w-3.5 h-3.5 mr-1" /> Add
    </Button>
  </div>
);

const AdminSiteSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<FooterSettings>(DEFAULT_FOOTER);
  const [promo, setPromo] = useState<SidebarPromoSettings>(DEFAULT_SIDEBAR_PROMO);
  const [savingPromo, setSavingPromo] = useState(false);

  // Silver rate (admin-managed; sole source of truth for the customer widget)
  const [silverPricePerGram, setSilverPricePerGram] = useState<number>(95);
  const [savingSilver, setSavingSilver] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getFooterSettings();
        setSettings(s);
        // Load admin-set silver rate from Firestore
        const srSnap = await getDoc(doc(db, 'siteSettings', 'silverRate'));
        if (srSnap.exists()) {
          const d = srSnap.data() || {};
          if (typeof d.manualPricePerGramInr === 'number' && d.manualPricePerGramInr > 0) {
            setSilverPricePerGram(d.manualPricePerGramInr);
          }
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
    // Subscribe to promo settings live
    const unsub = subscribeSidebarPromo(setPromo);
    return unsub;
  }, []);

  const handleSaveSilver = async () => {
    if (!silverPricePerGram || silverPricePerGram <= 0) {
      toast.error('Enter a valid price per gram');
      return;
    }
    setSavingSilver(true);
    try {
      await setDoc(doc(db, 'siteSettings', 'silverRate'), {
        manualOverride: true,
        manualPricePerGramInr: silverPricePerGram,
      }, { merge: true });
      toast.success('Silver rate updated — customers see it instantly');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save silver rate');
    } finally {
      setSavingSilver(false);
    }
  };

  const update = <K extends keyof FooterSettings>(key: K, value: FooterSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const handleSavePromo = async () => {
    setSavingPromo(true);
    try {
      await saveSidebarPromo(promo);
      toast.success('Promo banner saved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save promo banner');
    } finally {
      setSavingPromo(false);
    }
  };

  const updateSocial = (idx: number, patch: Partial<SocialLink>) => {
    const next = [...(settings.socialLinks || [])];
    next[idx] = { ...next[idx], ...patch };
    update('socialLinks', next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Clean empty strings
      const cleaned: FooterSettings = {
        ...settings,
        addressLines: (settings.addressLines || []).map((l) => l.trim()).filter(Boolean),
        phones: (settings.phones || []).map((l) => l.trim()).filter(Boolean),
        emails: (settings.emails || []).map((l) => l.trim()).filter(Boolean),
        shopLinks: (settings.shopLinks || []).map((l) => l.trim()).filter(Boolean),
        categoryLinks: (settings.categoryLinks || []).map((l) => l.trim()).filter(Boolean),
        socialLinks: (settings.socialLinks || []).filter((s) => s.url?.trim()),
      };
      await saveFooterSettings(cleaned);
      setSettings(cleaned);
      toast.success('Site settings saved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-700 dark:text-amber-400 font-medium mb-2 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> Footer & Branding
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white">
            Site Settings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage the footer content shown across the storefront.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" /> Save changes
            </>
          )}
        </Button>
      </div>

      {/* Brand */}
      <Card title="Brand voice" subtitle="The tagline shown under the logo." icon={Sparkles}>
        <Label className="text-xs text-gray-500">Tagline</Label>
        <Textarea
          rows={3}
          value={settings.brandTagline}
          onChange={(e) => update('brandTagline', e.target.value)}
          className="mt-1.5 bg-white dark:bg-gray-950"
        />
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Shop links" subtitle="Shown in the footer shop column.">
          <ListInput
            values={settings.shopLinks || []}
            onChange={(v) => update('shopLinks', v)}
            placeholder="e.g. Rings"
          />
        </Card>
        <Card title="Category links" subtitle="Shown in the footer categories column.">
          <ListInput
            values={settings.categoryLinks || []}
            onChange={(v) => update('categoryLinks', v)}
            placeholder="e.g. Jewellery"
          />
        </Card>
      </div>

      {/* Address & contact */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Address" subtitle="One line per row." icon={MapPin}>
          <ListInput
            values={settings.addressLines || []}
            onChange={(v) => update('addressLines', v)}
            placeholder="e.g. Ramasomayajulu street"
          />
        </Card>
        <Card title="Phone numbers" subtitle="First number is shown in the footer." icon={Phone}>
          <ListInput
            values={settings.phones || []}
            onChange={(v) => update('phones', v)}
            placeholder="+91 6304960489"
          />
        </Card>
        <Card title="Email addresses" subtitle="First email is shown in the footer." icon={Mail}>
          <ListInput
            values={settings.emails || []}
            onChange={(v) => update('emails', v)}
            placeholder="contact@brand.com"
          />
        </Card>
        <Card title="Business hours" icon={Clock}>
          <Input
            value={settings.businessHours || ''}
            onChange={(e) => update('businessHours', e.target.value)}
            placeholder="Mon – Sat · 10am – 9pm"
            className="bg-white dark:bg-gray-950"
          />
        </Card>
      </div>

      {/* Map */}
      <Card title="Google Maps embed" subtitle="Paste the iframe `src` URL only." icon={Globe}>
        <Input
          value={settings.mapEmbedUrl || ''}
          onChange={(e) => update('mapEmbedUrl', e.target.value)}
          placeholder="https://www.google.com/maps/embed?pb=…"
          className="bg-white dark:bg-gray-950"
        />
        {settings.mapEmbedUrl && (
          <div className="mt-4 rounded-xl overflow-hidden border border-[#F5EFE6] dark:border-gray-800">
            <iframe
              src={settings.mapEmbedUrl}
              width="100%"
              height="180"
              style={{ border: 0 }}
              loading="lazy"
              title="Map preview"
            />
          </div>
        )}
      </Card>

      {/* Socials */}
      <Card
        title="Social links"
        subtitle="Toggle off to hide a platform without deleting it."
        icon={Instagram}
      >
        <div className="space-y-3">
          {(settings.socialLinks || []).map((s, idx) => {
            const opt = PLATFORM_OPTIONS.find((p) => p.value === s.platform);
            const Icon = opt?.Icon || AtSign;
            return (
              <div
                key={idx}
                className="flex flex-col md:flex-row gap-2 items-stretch md:items-center p-3 rounded-xl border border-[#F5EFE6] dark:border-gray-800 bg-[#FFFBF5]/50 dark:bg-gray-950/40"
              >
                <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-900 grid place-items-center border border-[#F5EFE6] dark:border-gray-800 text-gray-700 dark:text-gray-300 flex-shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <Select
                  value={s.platform}
                  onValueChange={(v) => updateSocial(idx, { platform: v as SocialPlatform })}
                >
                  <SelectTrigger className="md:w-44 bg-white dark:bg-gray-950">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1 bg-white dark:bg-gray-950"
                  value={s.url}
                  placeholder="https://..."
                  onChange={(e) => updateSocial(idx, { url: e.target.value })}
                />
                <div className="flex items-center gap-3">
                  <Switch
                    checked={s.active}
                    onCheckedChange={(v) => updateSocial(idx, { active: v })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      update(
                        'socialLinks',
                        (settings.socialLinks || []).filter((_, i) => i !== idx)
                      )
                    }
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              update('socialLinks', [
                ...(settings.socialLinks || []),
                { platform: 'instagram', url: '', active: true },
              ])
            }
            className="text-amber-700 border-amber-200 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add social link
          </Button>
        </div>
      </Card>

      {/* Copyright */}
      <Card title="Copyright suffix" subtitle="Shown after the year in the footer.">
        <Input
          value={settings.copyrightSuffix || ''}
          onChange={(e) => update('copyrightSuffix', e.target.value)}
          placeholder="Sreerasthu Silvers"
          className="bg-white dark:bg-gray-950"
        />
      </Card>

      {/* Footer save */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" /> Save changes
            </>
          )}
        </Button>
      </div>

      {/* ── Mobile Sidebar Promo Banner ── */}
      <div className="border-t border-[#F5EFE6] dark:border-gray-800 pt-8">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-amber-700 dark:text-amber-400 font-medium mb-2 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" /> Mobile Sidebar
            </p>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Promo Banner
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              The promotional banner shown to guests in the mobile side menu.
            </p>
          </div>
          <Button
            onClick={handleSavePromo}
            disabled={savingPromo}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {savingPromo ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" /> Save promo
              </>
            )}
          </Button>
        </div>
        <Card title="Promo banner text" subtitle="Shown to guests above the login button in the sidebar.">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                id="promo-active"
                checked={promo.active}
                onCheckedChange={(v) => setPromo((p) => ({ ...p, active: v }))}
              />
              <Label htmlFor="promo-active" className="text-sm cursor-pointer">
                Show promo banner
              </Label>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Headline</Label>
              <Input
                value={promo.headline}
                onChange={(e) => setPromo((p) => ({ ...p, headline: e.target.value }))}
                placeholder="e.g. Flat Rs. 500 off"
                className="mt-1.5 bg-white dark:bg-gray-950"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Subline</Label>
              <Input
                value={promo.subline}
                onChange={(e) => setPromo((p) => ({ ...p, subline: e.target.value }))}
                placeholder="e.g. on your first order"
                className="mt-1.5 bg-white dark:bg-gray-950"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">CTA Button Label</Label>
              <Input
                value={promo.ctaLabel}
                onChange={(e) => setPromo((p) => ({ ...p, ctaLabel: e.target.value }))}
                placeholder="e.g. LOGIN / SIGN UP"
                className="mt-1.5 bg-white dark:bg-gray-950"
              />
            </div>
          </div>
        </Card>
      </div>

      {/* ── Silver Rate (Admin-managed) ── */}
      <div className="border-t border-[#F5EFE6] dark:border-gray-800 pt-8">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400 font-medium mb-2 flex items-center gap-2">
              <Coins className="w-3.5 h-3.5" /> Silver Rate (Live to Customer)
            </p>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Set price per gram
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              This price updates the customer widget instantly. The 10g and 1kg
              values are calculated automatically.
            </p>
          </div>
          <Button
            onClick={handleSaveSilver}
            disabled={savingSilver}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {savingSilver ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> Save rate</>
            )}
          </Button>
        </div>
        <Card title="Silver price per gram" subtitle="Updates in real time on the customer site." icon={Coins}>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-gray-500">Price per gram (₹)</Label>
              <Input
                type="number"
                min={1}
                step={0.01}
                value={silverPricePerGram}
                onChange={(e) => setSilverPricePerGram(Number(e.target.value))}
                placeholder="e.g. 95"
                className="mt-1.5 bg-white dark:bg-gray-950 max-w-[200px]"
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                10g → ₹{(silverPricePerGram * 10).toFixed(2)} · 1kg → ₹{(silverPricePerGram * 1000).toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminSiteSettings;
