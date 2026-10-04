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
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCardsSkeleton } from '@/components/skeletons';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { fadeUp } from '@/lib/motion';
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
const pct = (p: number | null) => (p == null ? 'Not measured' : `${(p * 100).toFixed(p < 0.01 && p > 0 ? 2 : 1)}%`);

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** A typical upload: a ≤500 KB photo plus its ~50 KB preview. */
const DEFAULT_PHOTO_BYTES = MAX_IMAGE_BYTES * 0.9 + 50 * 1024;

const barColor = (p: number, warn: number, block: number) =>
  p >= block ? 'bg-destructive' : p >= warn ? 'bg-primary' : 'bg-status-success-fg';

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
  <div className="rounded-card border border-border bg-card p-5 shadow-sm">
    <div className="mb-4 flex items-start gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-muted text-foreground/70">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
    </div>
    {percent == null ? (
      <p className="text-sm text-muted-foreground">{missing}</p>
    ) : (
      <>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p className="text-xl font-semibold tabular-nums text-foreground">{used}</p>
          <p className="text-xs text-muted-foreground tabular-nums">of {limit} free</p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${title} used`} aria-valuenow={Math.round(percent * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`h-full rounded-full ${barColor(percent, usage.thresholds.warn, usage.thresholds.block)}`}
            style={{ width: `${Math.min(100, Math.max(percent * 100, percent > 0 ? 1 : 0))}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2 tabular-nums">{pct(percent)} used</p>
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
    <Label htmlFor={id} className="text-xs font-medium text-foreground/80">
      {label}
    </Label>
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      value={value}
      onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
      className="mt-1.5 tabular-nums"
    />
  </div>
);

const Estimate = ({ icon: Icon, label, value, detail }: { icon: typeof HardDrive; label: string; value: string; detail: string }) => (
  <div className="rounded-card bg-muted/60 px-4 py-3">
    <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </p>
    <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
    <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
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

  const header = (
    <AdminPageHeader
      eyebrow="Cloudflare R2 · Free plan"
      title="Storage"
      description="How much of the free image storage is used this month, and how much room is left."
      actions={
        <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing || loading}>
          <RefreshCw aria-hidden="true" className={refreshing ? 'animate-spin' : ''} /> Refresh
        </Button>
      }
      className="pb-0"
    />
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {header}
        <Skeleton className="h-16 w-full rounded-card" />
        <StatCardsSkeleton count={3} className="grid-cols-1 md:grid-cols-3 lg:grid-cols-3" label="Loading storage usage" />
        <div className="space-y-4 rounded-card border border-border bg-card p-5 sm:p-6">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-card" />)}
          </div>
        </div>
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
    <div className="mx-auto max-w-6xl space-y-6">
      {header}

      {error && (
        <Notice tone="danger" title="Could not load usage">
          {error}
        </Notice>
      )}

      {!publicUrlConfigured && (
        <Notice tone="warning" title="Uploads are not possible yet">
          The bucket&rsquo;s public link is not set. Turn on &ldquo;Public Development URL&rdquo; (or add a custom
          domain) for the <code>ssstorage</code> bucket in Cloudflare and put that link in <code>R2_PUBLIC_URL</code>.
        </Notice>
      )}

      {usage && (
        <>
          {/* Status */}
          <motion.div {...fadeUp}>
            <Notice
              tone={usage.level === 'block' ? 'danger' : usage.level === 'warn' ? 'warning' : 'success'}
              icon={usage.level === 'ok' ? ShieldCheck : AlertTriangle}
              role="status"
              title={
                usage.level === 'block'
                  ? 'Uploads are paused to stay on the free plan'
                  : usage.level === 'warn'
                    ? 'Getting close to the free limit'
                    : 'Everything is within the free plan'
              }
            >
              {usage.reasons.length > 0 && <p>{usage.reasons.join(' · ')}</p>}
              <p className="mt-0.5 text-muted-foreground">
                Period {shortDate(usage.periodStart)} to {shortDate(usage.periodEnd)} · resets in {daysLeft} day
                {daysLeft === 1 ? '' : 's'}
              </p>
            </Notice>
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

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {fmt(usage.objectCount)} {usage.objectCount === 1 ? 'file' : 'files'} stored · {usage.notes.join(' ')} Updated{' '}
              {new Date(usage.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.
            </span>
          </p>
        </>
      )}

      {/* Estimates */}
      <section className="rounded-card border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-foreground">What the free plan can handle</h2>
        <p className="mb-5 mt-1 text-xs text-muted-foreground">
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

        <p className="text-xs text-muted-foreground mt-4">
          Storage is the limit that matters: it fills up and stays full, while uploads and views reset every month.
          Visitor numbers are a floor: with a custom domain, Cloudflare&rsquo;s cache serves repeat photo views
          without counting them.
        </p>
      </section>

      {/* How the protection works */}
      <section className="rounded-card border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">How you stay on the free plan</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-foreground/80">
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
          <li>Deleting a product deletes its photos too (deleting is free), which frees space.</li>
          <li>
            Image views come from visitors, so the app can&apos;t stop them. Set a budget alert in Cloudflare
            (R2 → Billing → Add Budget Alert) so you get an email if anything ever becomes billable.
          </li>
        </ul>
      </section>
    </div>
  );
};

export default AdminStorage;
