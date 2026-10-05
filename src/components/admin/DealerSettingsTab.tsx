import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { BadgeCheck, Clock, Handshake, IndianRupee, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { FormSkeleton } from '@/components/skeletons';
import { StatCard } from '@/components/admin/StatCard';
import { describeError } from '@/lib/errorMessage';
import { dealerUnitPrice, normaliseDealerPricing, normaliseDealerSettings } from '@/lib/dealer';
import { formatINR, formatNumber } from '@/lib/format';
import { fadeUp } from '@/lib/motion';
import {
  loadDealerAdminSettings,
  saveDealerAdminSettings,
  subscribeDealerApplications,
} from '@/services/dealerService';

/** What the form edits: the public switch and minimum, and the private store-wide discount. */
export interface DealerFormValues {
  enabled: boolean;
  discountPercent: number;
  minOrder: number;
}

/** The "₹800 item" in the live example under the fields. */
const EXAMPLE_PRICE = 800;

/** Phone tap target: the 24px switch gets a 44px hit area. */
const SWITCH_HIT = "relative after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']";

const PANEL = 'rounded-card border border-border bg-card p-4 shadow-sm sm:p-6';

function Panel({ status, children }: { status?: ReactNode; children: ReactNode }) {
  return (
    <motion.section {...fadeUp} aria-labelledby="dealer-settings-title" className={PANEL}>
      <div className="mb-5 flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-muted text-foreground/70">
          <Handshake className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="dealer-settings-title" className="text-base font-semibold text-foreground">Dealer membership</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Placeholder values until the client confirms its dealer terms.</p>
        </div>
        {status}
      </div>
      {children}
    </motion.section>
  );
}

export interface DealerSettingsTabViewProps {
  /** The form values. null until the settings have been read: never the defaults, so a failed read cannot be saved over. */
  form: DealerFormValues | null;
  /** Why the read failed (shown with Retry); null when it has not failed. */
  loadError: string | null;
  onRetry: () => void;
  onChange: (patch: Partial<DealerFormValues>) => void;
  /** The switch as last saved. The status chip follows it, not the unsaved switch. */
  liveEnabled: boolean;
  saving: boolean;
  onSave: () => void;
  /** Dealer counts; null while loading or when the list could not be read. */
  counts: { approved: number; pending: number } | null;
  countsError: boolean;
}

/** Admin > Commerce settings > Dealers: props only, no Firestore (the container below loads and saves). */
export function DealerSettingsTabView({
  form,
  loadError,
  onRetry,
  onChange,
  liveEnabled,
  saving,
  onSave,
  counts,
  countsError,
}: DealerSettingsTabViewProps) {
  // Clamped like the save, so the example and the notice show what will be charged.
  const pricing = useMemo(() => normaliseDealerPricing({ discountPercent: form?.discountPercent }), [form?.discountPercent]);

  if (!form && !loadError) {
    return (
      <div className={PANEL}>
        <FormSkeleton fields={3} label="Loading dealer settings" />
      </div>
    );
  }

  if (!form) {
    return (
      <Panel>
        <Notice
          tone="danger"
          title="Could not load the dealer settings"
          className="mb-5"
          action={
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw aria-hidden="true" /> Retry
            </Button>
          }
        >
          <p>{loadError}</p>
          <p className="mt-1">Saving stays off until they load, so the current settings cannot be overwritten.</p>
        </Notice>
        <Button disabled>
          <Save aria-hidden="true" />
          Save dealer settings
        </Button>
      </Panel>
    );
  }

  const minOrder = normaliseDealerSettings({ minOrder: form.minOrder }).minOrder;
  const examplePrice = dealerUnitPrice('x', EXAMPLE_PRICE, pricing);
  const statSubtitle = (text: string) => (counts ? text : countsError ? 'Could not load the list' : 'Loading');

  return (
    <Panel status={liveEnabled ? <StatusBadge tone="success" label="Live" dot pulse /> : <StatusBadge tone="neutral" label="Off" dot />}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="dl-on" className="text-sm font-medium text-foreground">Dealer programme</Label>
          <p id="dl-on-hint" className="text-xs text-muted-foreground">
            Off hides the dealer page and stops dealer prices. Approved dealers keep their status.
          </p>
        </div>
        <Switch
          id="dl-on"
          aria-describedby="dl-on-hint"
          checked={form.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
          className={SWITCH_HIT}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="dl-percent" className="text-sm">Dealer discount (%)</Label>
          <Input
            id="dl-percent"
            type="number"
            inputMode="decimal"
            min={0}
            max={90}
            value={form.discountPercent}
            onChange={(e) => onChange({ discountPercent: Number(e.target.value) })}
            aria-describedby="dl-percent-hint"
            className="mt-1.5 tabular-nums"
          />
          <p id="dl-percent-hint" className="mt-1.5 text-xs text-muted-foreground">
            Off the regular price, on every product. A product&apos;s own dealer price replaces it.
          </p>
        </div>
        <div>
          <Label htmlFor="dl-min" className="text-sm">Dealer prices from (₹, at regular prices)</Label>
          <Input
            id="dl-min"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={form.minOrder}
            onChange={(e) => onChange({ minOrder: Number(e.target.value) })}
            aria-describedby="dl-min-hint"
            className="mt-1.5 tabular-nums"
          />
          <p id="dl-min-hint" className="mt-1.5 text-xs text-muted-foreground">
            Below this the cart charges regular prices and shows how much more to add.
          </p>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <li className="col-span-2 sm:col-span-1">
          <StatCard
            label={`A ${formatINR(EXAMPLE_PRICE)} item costs dealers`}
            icon={IndianRupee}
            value={formatINR(examplePrice)}
            subtitle={`${pricing.discountPercent}% off, unless the product has its own`}
          />
        </li>
        <li>
          <StatCard
            label="Approved dealers"
            icon={BadgeCheck}
            tone="success"
            value={counts ? formatNumber(counts.approved) : '–'}
            subtitle={statSubtitle('Open the dealer list')}
            to="/admin/dealers?tab=approved"
          />
        </li>
        <li>
          <StatCard
            label="Applications waiting"
            icon={Clock}
            tone="warning"
            value={counts ? formatNumber(counts.pending) : '–'}
            subtitle={statSubtitle('Review them')}
            to="/admin/dealers?tab=pending"
          />
        </li>
      </ul>

      <Notice tone="info" title="How dealer prices work" className="mt-6" role="note">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            Approved dealers see dealer prices once their cart is worth {formatINR(minOrder)} or more at regular prices. Only
            approved dealers and admins ever see them.
          </li>
          <li>A dealer price set on a product replaces the {pricing.discountPercent}% for that product.</li>
          <li>A dealer-priced order takes no coupon and cannot use points or wallet cashback.</li>
          <li>It earns no points and gets no Scratch &amp; Win card. Delivery and GST are charged as usual.</li>
          <li>The invoice prints the dealer&apos;s business name and GSTIN in the buyer block.</li>
        </ul>
      </Notice>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" asChild>
          <Link to="/admin/dealers">
            <Handshake aria-hidden="true" /> Review applications
          </Link>
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Spinner /> : <Save aria-hidden="true" />}
          Save dealer settings
        </Button>
      </div>
    </Panel>
  );
}

/** Admin > Commerce settings > Dealers: loads and saves the programme switch, minimum and discount. */
export function DealerSettingsTab() {
  // Set only by a successful read. A failed one never falls back to the
  // defaults: saving those would overwrite the shop's real settings.
  const [form, setForm] = useState<DealerFormValues | null>(null);
  /** The switch as last read or saved: saveDealerAdminSettings stamps enabledAt only when it turns on. */
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState<{ approved: number; pending: number } | null>(null);
  const [countsError, setCountsError] = useState(false);

  useEffect(() => {
    let live = true;
    setLoadError(null);
    loadDealerAdminSettings()
      .then(({ settings, pricing }) => {
        if (!live) return;
        setLiveEnabled(settings.enabled);
        setForm({ enabled: settings.enabled, discountPercent: pricing.discountPercent, minOrder: settings.minOrder });
      })
      .catch((err) => {
        console.error(err);
        if (live) setLoadError(describeError(err));
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  useEffect(
    () =>
      subscribeDealerApplications(
        (rows) => {
          setCounts({
            approved: rows.filter((r) => r.status === 'approved').length,
            pending: rows.filter((r) => r.status === 'pending').length,
          });
          setCountsError(false);
        },
        (err) => {
          console.error(err);
          setCounts(null);
          setCountsError(true);
        },
      ),
    [],
  );

  const save = async () => {
    if (!form) return;
    const before = form;
    setSaving(true);
    try {
      // What is written: out-of-range values are clamped, so show those afterwards.
      const clean = normaliseDealerSettings({ enabled: before.enabled, minOrder: before.minOrder });
      const discountPercent = normaliseDealerPricing({ discountPercent: before.discountPercent }).discountPercent;
      await saveDealerAdminSettings(clean, discountPercent, liveEnabled);
      const adjusted = clean.minOrder !== before.minOrder || discountPercent !== before.discountPercent;
      setLiveEnabled(clean.enabled);
      // Keep anything typed while the save was running.
      setForm((current) =>
        current === before ? { enabled: clean.enabled, discountPercent, minOrder: clean.minOrder } : current,
      );
      toast.success(
        'Dealer settings saved',
        adjusted ? { description: 'Values outside the allowed range were adjusted to fit.' } : undefined,
      );
    } catch (err) {
      console.error(err);
      toast.error('Could not save dealer settings', { description: describeError(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DealerSettingsTabView
      form={form}
      loadError={loadError}
      onRetry={() => setAttempt((n) => n + 1)}
      onChange={(patch) => setForm((f) => (f ? { ...f, ...patch } : f))}
      liveEnabled={liveEnabled}
      saving={saving}
      onSave={save}
      counts={counts}
      countsError={countsError}
    />
  );
}

export default DealerSettingsTab;
