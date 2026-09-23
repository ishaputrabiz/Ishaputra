import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  HardDrive,
  RefreshCw,
  Upload,
  Eye,
  AlertTriangle,
  ShieldCheck,
  Info,
  Image as ImageIcon,
  Users,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  fetchStorageUsage,
  describeUploadError,
  formatBytes,
  MAX_IMAGE_BYTES,
  MAX_PRODUCT_IMAGES,
  type StorageUsage,
} from '@/services/mediaStorage';

const nf = new Intl.NumberFormat('en-IN');
const fmt = (n: number) => nf.format(Math.max(0, Math.floor(n)));
const pct = (p: number | null) => (p == null ? '—' : `${(p * 100).toFixed(p < 0.01 && p > 0 ? 2 : 1)}%`);

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** A typical upload: a ≤500 KB photo plus its ~50 KB preview. */
const DEFAULT_PHOTO_BYTES = MAX_IMAGE_BYTES * 0.9 + 50 * 1024;

const barColor = (p: number, warn: number, block: number) =>
  p >= block ? 'bg-red-500' : p >= warn ? 'bg-amber-500' : 'bg-emerald-500';

interface MeterProps {
  icon: typeof HardDrive;
  title: string;
  hint: string;
  used: string;
  limit: string;
  percent: number | null;
  usage: StorageUsage;
  missing?: string;
}

const Meter = ({ icon: Icon, title, hint, used, limit, percent, usage, missing }: MeterProps) => (
  <div className="bg-white dark:bg-gray-900 border border-[#F5EFE6] dark:border-gray-800 rounded-2xl p-5 shadow-sm">
    <div className="flex items-start gap-3 mb-4">
      <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/20 grid place-items-center text-amber-700 dark:text-amber-400 shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{hint}</p>
      </div>
    </div>
    {percent == null ? (
      <p className="text-sm text-gray-500 dark:text-gray-400">{missing}</p>
    ) : (
      <>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{used}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">of {limit} free</p>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor(percent, usage.thresholds.warn, usage.thresholds.block)}`}
            style={{ width: `${Math.min(100, Math.max(percent * 100, percent > 0 ? 1 : 0))}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 tabular-nums">{pct(percent)} used</p>
      </>
    )}
  </div>
);

const NumberField = ({
  id,
  label,
  value,
  onChange,
  min = 1,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) => (
  <div>
    <Label htmlFor={id} className="text-xs text-gray-500 dark:text-gray-400">
      {label}
    </Label>
    <Input
      id={id}
      type="number"
      min={min}
      value={value}
      onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
      className="mt-1.5 bg-white dark:bg-gray-950"
    />
  </div>
);

const Estimate = ({ icon: Icon, label, value, detail }: { icon: typeof HardDrive; label: string; value: string; detail: string }) => (
  <div className="bg-[#FBF8F3] dark:bg-gray-800/60 rounded-xl px-4 py-3">
    <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" /> {label}
    </p>
    <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{detail}</p>
  </div>
);

const AdminStorage = () => {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [publicUrlConfigured, setPublicUrlConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [photosPerProduct, setPhotosPerProduct] = useState(4);
  const [imagesPerPage, setImagesPerPage] = useState(20);
  const [pagesPerVisit, setPagesPerVisit] = useState(5);

  const load = useCallback(async (refresh: boolean) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await fetchStorageUsage(refresh);
      setUsage(result.usage);
      setPublicUrlConfigured(result.publicUrlConfigured);
      setError(null);
    } catch (err) {
      setError(describeUploadError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500 gap-2">
        <RefreshCw className="w-5 h-5 animate-spin" /> Loading storage usage…
      </div>
    );
  }

  const { limits, thresholds } = usage || {
    limits: { storageBytes: 10 * 1000 ** 3, classA: 1_000_000, classB: 10_000_000 },
    thresholds: { warn: 0.8, block: 0.95 },
  };

  // ── Estimates ────────────────────────────────────────────────────────────
  // Objects come in pairs (photo + preview), so photos ≈ objects / 2.
  const storedPhotos = usage ? Math.round(usage.objectCount / 2) : 0;
  const measured = usage && storedPhotos >= 10;
  const bytesPerPhoto = measured ? usage!.storageBytes / storedPhotos : DEFAULT_PHOTO_BYTES;
  const usableBytes = limits.storageBytes * thresholds.block;
  const photosTotal = usableBytes / bytesPerPhoto;
  const photosLeft = Math.max(0, (usableBytes - (usage?.storageBytes || 0)) / bytesPerPhoto);
  const uploadsPerMonth = (limits.classA * thresholds.block) / 2; // photo + preview = 2 writes
  const uploadsLeft = Math.max(0, (limits.classA * thresholds.block - (usage?.classA || 0)) / 2);
  const viewsPerMonth = (limits.classB * thresholds.block) / imagesPerPage;
  const visitorsPerMonth = viewsPerMonth / pagesPerVisit;

  const daysLeft = usage ? Math.max(0, Math.ceil((new Date(usage.periodEnd).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div className="max-w-5xl mx-auto py-6 px-1 sm:px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400 font-medium mb-2 flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5" /> Cloudflare R2 · Free plan
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Storage</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            How much of the free image storage is used this month, and how much room is left.
          </p>
        </div>
        <Button variant="outline" onClick={() => load(true)} disabled={refreshing} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>Could not load usage: {error}</p>
        </div>
      )}

      {!publicUrlConfigured && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            <strong>Uploads are not possible yet:</strong> the bucket&apos;s public link is not set. Turn on
            &quot;Public Development URL&quot; (or add a custom domain) for the <code>ssstorage</code> bucket in
            Cloudflare and put that link in <code>R2_PUBLIC_URL</code>.
          </p>
        </div>
      )}

      {usage && (
        <>
          {/* Status */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${
              usage.level === 'block'
                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
                : usage.level === 'warn'
                  ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
            }`}
          >
            {usage.level === 'ok' ? (
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <div>
              <p className="font-semibold">
                {usage.level === 'block'
                  ? 'Uploads are paused to stay on the free plan'
                  : usage.level === 'warn'
                    ? 'Getting close to the free limit'
                    : 'Everything is within the free plan'}
              </p>
              {usage.reasons.length > 0 && <p className="mt-0.5">{usage.reasons.join(' · ')}</p>}
              <p className="mt-0.5 opacity-80">
                Period {shortDate(usage.periodStart)} – {shortDate(usage.periodEnd)} · resets in {daysLeft} day
                {daysLeft === 1 ? '' : 's'}
              </p>
            </div>
          </motion.div>

          {/* Meters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Meter
              icon={HardDrive}
              title="Storage space"
              hint="Total size of all stored photos"
              used={formatBytes(usage.storageBytes)}
              limit="10 GB"
              percent={usage.percent.storage}
              usage={usage}
            />
            <Meter
              icon={Upload}
              title="Uploads (Class A)"
              hint="Each photo upload uses 2 (photo + preview)"
              used={fmt(usage.classA)}
              limit="10,00,000"
              percent={usage.percent.classA}
              usage={usage}
            />
            <Meter
              icon={Eye}
              title="Image views (Class B)"
              hint="Each time a visitor's browser loads a photo"
              used={usage.classB == null ? '' : fmt(usage.classB)}
              limit="1,00,00,000"
              percent={usage.percent.classB}
              usage={usage}
              missing="Not measured yet. Add the Cloudflare analytics token (see note below) to count views."
            />
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              {fmt(usage.objectCount)} {usage.objectCount === 1 ? 'file' : 'files'} stored · {usage.notes.join(' ')} Updated{' '}
              {new Date(usage.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.
            </span>
          </p>
        </>
      )}

      {/* Estimates */}
      <div className="bg-white dark:bg-gray-900 border border-[#F5EFE6] dark:border-gray-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">What the free plan can handle</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-5">
          Estimates, stopping at {Math.round(thresholds.block * 100)}% of each limit. Change the numbers to match
          your shop.
          {measured
            ? ` Photo size is measured from your ${fmt(storedPhotos)} stored photos (${formatBytes(bytesPerPhoto)} each with preview).`
            : ` Photo size assumes ${formatBytes(bytesPerPhoto)} each with preview, until more photos are uploaded.`}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <NumberField
            id="photos-per-product"
            label={`Photos per product (max ${MAX_PRODUCT_IMAGES})`}
            value={photosPerProduct}
            onChange={(v) => setPhotosPerProduct(Math.min(MAX_PRODUCT_IMAGES, v))}
          />
          <NumberField id="images-per-page" label="Photos shown per page visit" value={imagesPerPage} onChange={setImagesPerPage} />
          <NumberField id="pages-per-visit" label="Pages a visitor opens" value={pagesPerVisit} onChange={setPagesPerVisit} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Estimate
            icon={ImageIcon}
            label="Photos you can store"
            value={fmt(photosLeft)}
            detail={`more photos · about ${fmt(photosTotal)} in total`}
          />
          <Estimate
            icon={Package}
            label="Products"
            value={fmt(photosLeft / photosPerProduct)}
            detail={`more products at ${photosPerProduct} photo${photosPerProduct === 1 ? '' : 's'} · ${fmt(photosTotal / photosPerProduct)} in total`}
          />
          <Estimate
            icon={Upload}
            label="Uploads this month"
            value={fmt(uploadsLeft)}
            detail={`more photo uploads · ${fmt(uploadsPerMonth)} per month`}
          />
          <Estimate
            icon={Eye}
            label="Page visits per month"
            value={fmt(viewsPerMonth)}
            detail={`at ${imagesPerPage} photos per page`}
          />
          <Estimate
            icon={Users}
            label="Visitors per month"
            value={fmt(visitorsPerMonth)}
            detail={`about ${fmt(visitorsPerMonth / 30)} per day, ${pagesPerVisit} pages each`}
          />
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
          Storage is the limit that matters: it fills up and stays full, while uploads and views reset every month.
          Visitor numbers are a floor — with a custom domain, Cloudflare&apos;s cache serves repeat photo views
          without counting them.
        </p>
      </div>

      {/* How the protection works */}
      <div className="bg-white dark:bg-gray-900 border border-[#F5EFE6] dark:border-gray-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">How you stay on the free plan</h2>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300 list-disc pl-5">
          <li>
            Photos must be JPG, PNG or WebP and <strong>500 KB or smaller</strong>. Each product can have at most{' '}
            {MAX_PRODUCT_IMAGES} photos.
          </li>
          <li>
            At <strong>{Math.round(thresholds.warn * 100)}%</strong> of any limit, admins see a warning popup.
          </li>
          <li>
            At <strong>{Math.round(thresholds.block * 100)}%</strong>, new uploads stop automatically. The shop keeps
            working and existing photos keep showing.
          </li>
          <li>Deleting a product deletes its photos too (deleting is free) — that frees space.</li>
          <li>
            Image views come from visitors, so the app can&apos;t stop them. Set a budget alert in Cloudflare
            (R2 → Billing → Add Budget Alert) so you get an email if anything ever becomes billable.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default AdminStorage;
