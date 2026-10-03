import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
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
  Quote,
  Coins,
} from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { FormSkeleton } from '@/components/skeletons';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { fadeUp } from '@/lib/motion';
import { SILVER_PRICING_ENABLED } from '@/config/features';
import { formatINR } from '@/lib/format';
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

const ListInput = ({
  values,
  onChange,
  placeholder,
  itemLabel,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  /** What one row is, for screen readers: "Shop link", "Phone number". */
  itemLabel: string;
}) => (
  <div className="space-y-2">
    {values.map((v, idx) => (
      <div key={idx} className="flex gap-2">
        <Input
          aria-label={`${itemLabel} ${idx + 1}`}
          value={v}
          placeholder={placeholder}
          onChange={(e) => {
            const next = [...values];
            next[idx] = e.target.value;
            onChange(next);
          }}
        />
        <IconButton
          label={`Remove ${itemLabel.toLowerCase()} ${idx + 1}`}
          onClick={() => onChange(values.filter((_, i) => i !== idx))}
          className="text-muted-foreground hover:text-status-danger-fg"
        >
          <Trash2 />
        </IconButton>
      </div>
    ))}
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => onChange([...values, ''])}
    >
      <Plus aria-hidden="true" /> Add
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
        toast.error('Could not load site settings');
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
      toast.success('Silver rate saved. Customers see it now.');
    } catch (err) {
      console.error(err);
      toast.error('Could not save the silver rate');
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
      toast.error('Could not save the promo banner');
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
      toast.error('Could not save site settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl [&>*]:max-w-4xl space-y-6">
        <AdminPageHeader eyebrow="Footer and branding" title="Site settings" description="The footer content shown across the store." className="pb-0" />
        <div className="rounded-card border border-border bg-card p-4 sm:p-6">
          <FormSkeleton fields={6} label="Loading site settings" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-4xl space-y-6">
      <AdminPageHeader
        eyebrow="Footer and branding"
        title="Site settings"
        description="The footer content shown across the store."
        className="pb-0"
        actions={
        <Button onClick={handleSave} disabled={saving}>
              {saving ? <Spinner /> : <Save aria-hidden="true" />}
              {saving ? 'Saving' : 'Save changes'}
            </Button>
        }
      />

      {/* Brand */}
      <Card title="Brand voice" subtitle="The tagline shown under the logo." icon={Quote}>
        <Label htmlFor="ss-tagline" className="text-xs font-medium text-foreground/80">Tagline</Label>
        <Textarea
          id="ss-tagline"
          rows={3}
          value={settings.brandTagline}
          onChange={(e) => update('brandTagline', e.target.value)}
          className="mt-1.5"
        />
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Shop links" subtitle="Shown in the footer shop column.">
          <ListInput
            values={settings.shopLinks || []}
            onChange={(v) => update('shopLinks', v)}
            placeholder="e.g. Best sellers"
            itemLabel="Shop link"
          />
        </Card>
        <Card title="Category links" subtitle="Shown in the footer categories column.">
          <ListInput
            values={settings.categoryLinks || []}
            onChange={(v) => update('categoryLinks', v)}
            placeholder="e.g. Hair Care"
            itemLabel="Category link"
          />
        </Card>
      </div>

      {/* Address & contact */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Address" subtitle="One line per row." icon={MapPin}>
          <ListInput
            values={settings.addressLines || []}
            onChange={(v) => update('addressLines', v)}
            placeholder="e.g. Street and area"
            itemLabel="Address line"
          />
        </Card>
        <Card title="Phone numbers" subtitle="First number is shown in the footer." icon={Phone}>
          <ListInput
            values={settings.phones || []}
            onChange={(v) => update('phones', v)}
            placeholder="+91 98765 43210"
            itemLabel="Phone number"
          />
        </Card>
        <Card title="Email addresses" subtitle="First email is shown in the footer." icon={Mail}>
          <ListInput
            values={settings.emails || []}
            onChange={(v) => update('emails', v)}
            placeholder="contact@brand.com"
            itemLabel="Email address"
          />
        </Card>
        <Card title="Business hours" icon={Clock}>
          <Input
            value={settings.businessHours || ''}
            onChange={(e) => update('businessHours', e.target.value)}
            aria-label="Business hours"
            placeholder="Mon to Sat · 10am to 9pm"
          />
        </Card>
      </div>

      {/* Map */}
      <Card title="Google Maps embed" subtitle="Paste only the iframe src URL." icon={Globe}>
        <Input
          aria-label="Google Maps embed URL"
          value={settings.mapEmbedUrl || ''}
          onChange={(e) => update('mapEmbedUrl', e.target.value)}
          placeholder="https://www.google.com/maps/embed?pb=…"
        />
        {settings.mapEmbedUrl && (
          <div className="mt-4 overflow-hidden rounded-card border border-border">
            <iframe
              src={settings.mapEmbedUrl}
              width="100%"
              height="180"
              style={{ border: 0 }}
              loading="lazy"
              title="Map preview"
              className="map-embed"
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
                className="flex flex-col items-stretch gap-2 rounded-card border border-border bg-muted/40 p-3 md:flex-row md:items-center"
              >
                <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-control border border-border bg-card text-foreground/80">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <Select
                  value={s.platform}
                  onValueChange={(v) => updateSocial(idx, { platform: v as SocialPlatform })}
                >
                  <SelectTrigger aria-label={`Platform for link ${idx + 1}`} className="md:w-44">
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
                  aria-label={`${opt?.label || 'Social'} URL`}
                  className="flex-1"
                  value={s.url}
                  placeholder="https://..."
                  onChange={(e) => updateSocial(idx, { url: e.target.value })}
                />
                <div className="flex items-center gap-3">
                  <Switch
                    aria-label={`Show ${opt?.label || 'this link'} in the footer`}
                    checked={s.active}
                    onCheckedChange={(v) => updateSocial(idx, { active: v })}
                  />
                  <IconButton
                    label={`Remove ${opt?.label || 'social'} link`}
                    onClick={() =>
                      update(
                        'socialLinks',
                        (settings.socialLinks || []).filter((_, i) => i !== idx)
                      )
                    }
                    className="text-muted-foreground hover:text-status-danger-fg"
                  >
                    <Trash2 />
                  </IconButton>
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
          >
            <Plus aria-hidden="true" /> Add social link
          </Button>
        </div>
      </Card>

      {/* Copyright */}
      <Card title="Copyright suffix" subtitle="Shown after the year in the footer.">
        <Input
          aria-label="Copyright suffix"
          value={settings.copyrightSuffix || ''}
          onChange={(e) => update('copyrightSuffix', e.target.value)}
          placeholder="Ishaputra Botanicals"
        />
      </Card>

      {/* Footer save */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Spinner /> : <Save aria-hidden="true" />}
          {saving ? 'Saving' : 'Save changes'}
        </Button>
      </div>

      {/* ── Mobile Sidebar Promo Banner ── */}
      <div className="border-t border-border pt-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground">Mobile side menu</p>
            <h2 className="text-xl font-semibold text-foreground">
              Promo banner
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The promotional banner shown to guests in the mobile side menu.
            </p>
          </div>
          <Button variant="outline" onClick={handleSavePromo} disabled={savingPromo}>
            {savingPromo ? <Spinner /> : <Save aria-hidden="true" />}
            {savingPromo ? 'Saving' : 'Save promo'}
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
              <Label htmlFor="promo-headline" className="text-xs font-medium text-foreground/80">Headline</Label>
              <Input
                id="promo-headline"
                value={promo.headline}
                onChange={(e) => setPromo((p) => ({ ...p, headline: e.target.value }))}
                placeholder="e.g. Flat Rs. 500 off"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="promo-subline" className="text-xs font-medium text-foreground/80">Subline</Label>
              <Input
                id="promo-subline"
                value={promo.subline}
                onChange={(e) => setPromo((p) => ({ ...p, subline: e.target.value }))}
                placeholder="e.g. on your first order"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="promo-cta" className="text-xs font-medium text-foreground/80">Button label</Label>
              <Input
                id="promo-cta"
                value={promo.ctaLabel}
                onChange={(e) => setPromo((p) => ({ ...p, ctaLabel: e.target.value }))}
                placeholder="e.g. Sign in"
                className="mt-1.5"
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Silver rate (admin-managed): hidden while live metal pricing is switched off */}
      {SILVER_PRICING_ENABLED && (
      <div className="border-t border-border pt-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground">
              Silver rate (live to customers)
            </p>
            <h2 className="text-xl font-semibold text-foreground">
              Set price per gram
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              This price updates the customer widget instantly. The 10g and 1kg
              values are calculated automatically.
            </p>
          </div>
          <Button variant="outline" onClick={handleSaveSilver} disabled={savingSilver}>
            {savingSilver ? <Spinner /> : <Save aria-hidden="true" />}
            {savingSilver ? 'Saving' : 'Save rate'}
          </Button>
        </div>
        <Card title="Silver price per gram" subtitle="Updates in real time on the customer site." icon={Coins}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="ss-silver" className="text-xs font-medium text-foreground/80">Price per gram (₹)</Label>
              <Input
                id="ss-silver"
                type="number"
                min={1}
                step={0.01}
                value={silverPricePerGram}
                onChange={(e) => setSilverPricePerGram(Number(e.target.value))}
                placeholder="e.g. 95"
                className="mt-1.5 max-w-[200px] tabular-nums"
              />
              <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                10g → {formatINR(silverPricePerGram * 10)} · 1kg → {formatINR(silverPricePerGram * 1000)}
              </p>
            </div>
          </div>
        </Card>
      </div>
      )}
    </div>
  );
};

export default AdminSiteSettings;
