import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { fetchStorageUsage, formatBytes, STORAGE_LIMIT_EVENT, type StorageUsage } from '@/services/mediaStorage';
import { usesCloudinary } from '@/lib/mediaProvider';

const RECHECK_MS = 30 * 60 * 1000;
const DISMISS_KEY = 'storageLimitDismissed';

/** Remembered per browser tab so the popup doesn't nag on every page change. */
const wasDismissed = (level: string, period: string) => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === `${level}:${period}`;
  } catch {
    return false;
  }
};

const rememberDismissed = (level: string, period: string) => {
  try {
    sessionStorage.setItem(DISMISS_KEY, `${level}:${period}`);
  } catch {
    /* storage unavailable - the popup will simply show again */
  }
};

/**
 * Admin-wide popup for the free storage plan. Shows when usage crosses the
 * warning line (80%) or uploads are paused (95%), and immediately whenever an
 * upload is refused for the limit. Mounted once in AdminLayout.
 */
const StorageLimitWatcher = () => {
  const navigate = useNavigate();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback((next: StorageUsage | null | undefined, force: boolean) => {
    if (!next || next.level === 'ok') return;
    setUsage(next);
    if (force || !wasDismissed(next.level, next.periodStart)) setOpen(true);
  }, []);

  useEffect(() => {
    // The R2 free-tier guard doesn't apply to Cloudinary; its dashboard shows usage.
    if (usesCloudinary) return;
    let cancelled = false;
    const check = () =>
      fetchStorageUsage()
        .then(({ usage: next }) => !cancelled && show(next, false))
        .catch((err) => console.warn('[storage] usage check failed:', err));

    void check();
    const timer = window.setInterval(check, RECHECK_MS);
    const onLimit = (e: Event) => show((e as CustomEvent<StorageUsage | undefined>).detail, true);
    window.addEventListener(STORAGE_LIMIT_EVENT, onLimit);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(STORAGE_LIMIT_EVENT, onLimit);
    };
  }, [show]);

  if (!usage) return null;

  const blocked = usage.level === 'block';
  const close = () => {
    rememberDismissed(usage.level, usage.periodStart);
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className={`h-5 w-5 ${blocked ? 'text-red-600' : 'text-amber-600'}`} />
            {blocked ? 'Uploads paused — free storage limit reached' : 'Free storage plan is almost used up'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <ul className="list-disc pl-5 space-y-1">
                {usage.reasons.map((reason) => (
                  <li key={reason}>{reason}.</li>
                ))}
              </ul>
              <p>
                Storage: {formatBytes(usage.storageBytes)} of 10 GB · Uploads: {usage.classA.toLocaleString('en-IN')} of
                10,00,000
                {usage.classB != null && ` · Views: ${usage.classB.toLocaleString('en-IN')} of 1,00,00,000`}
              </p>
              <p>
                {blocked
                  ? 'New photo uploads are stopped so nothing gets billed. The shop and existing photos keep working. Delete unused products to free space, or wait for the monthly reset.'
                  : `Uploads will stop automatically at ${Math.round(usage.thresholds.block * 100)}%. Consider removing unused products or photos.`}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>OK</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              close();
              navigate('/admin/storage');
            }}
            className="bg-amber-600 hover:bg-amber-700"
          >
            View storage
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default StorageLimitWatcher;
