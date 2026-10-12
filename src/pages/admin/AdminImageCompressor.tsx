import { useCallback, useEffect, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { Archive, Check, Download, Trash2, Upload, X, AlertCircle } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { compressImage, outputName, canEncodeWebp, type OutputFormat } from '@/lib/imageCompressor';
import { formatBytes, MAX_IMAGE_BYTES, MAX_BANNER_BYTES } from '@/services/mediaStorage';

/**
 * Admin tool: shrink a batch of photos under the upload limit at the best
 * quality possible, then download them (one by one or as a ZIP) to upload.
 * Everything runs in the browser - nothing is uploaded from this page.
 */

type Status = 'waiting' | 'working' | 'done' | 'error';

interface Item {
  id: string;
  file: File;
  previewUrl: string;
  status: Status;
  result?: { blob: Blob; url: string; width: number; height: number; quality: number | null; keptOriginal: boolean };
  error?: string;
}

const TARGETS = [
  { bytes: MAX_IMAGE_BYTES, label: '500 KB', hint: 'Products, gallery, collections, everything else' },
  { bytes: MAX_BANNER_BYTES, label: '1 MB', hint: 'Hero banners only' },
];

const ACCEPT = 'image/jpeg,image/png,image/webp';

const AdminImageCompressor = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [targetBytes, setTargetBytes] = useState(MAX_IMAGE_BYTES);
  const [format, setFormat] = useState<OutputFormat>('webp');
  const [webpOk, setWebpOk] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [zipping, setZipping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(false);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    canEncodeWebp().then((ok) => {
      setWebpOk(ok);
      if (!ok) setFormat('jpeg');
    });
  }, []);

  // Stop the queue and free object URLs when the page closes.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      itemsRef.current.forEach((it) => {
        URL.revokeObjectURL(it.previewUrl);
        if (it.result) URL.revokeObjectURL(it.result.url);
      });
    };
  }, []);

  const update = (id: string, patch: Partial<Item>) => {
    const apply = (list: Item[]) => list.map((it) => (it.id === id ? { ...it, ...patch } : it));
    // The queue reads the ref, so keep it current without waiting for a render.
    itemsRef.current = apply(itemsRef.current);
    setItems(apply);
  };

  /** Works through every waiting item, one at a time so the page stays responsive. */
  const processQueue = useCallback(async (bytes: number, fmt: OutputFormat) => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      for (;;) {
        if (!mountedRef.current) break;
        const next = itemsRef.current.find((it) => it.status === 'waiting');
        if (!next) break;
        update(next.id, { status: 'working' });
        try {
          // Hero banners span the full screen width, so they keep more pixels (2x a 1440px screen).
          const maxEdge = bytes > MAX_IMAGE_BYTES ? 3200 : 2400;
          const r = await compressImage(next.file, { maxBytes: bytes, format: fmt, maxEdge });
          if (!mountedRef.current) break; // page closed mid-image: make no URL that nothing would free
          update(next.id, { status: 'done', result: { ...r, url: URL.createObjectURL(r.blob) }, error: undefined });
        } catch (e) {
          update(next.id, { status: 'error', error: e instanceof Error ? e.message : 'Could not compress this image.' });
        }
        // Let React commit before picking the next item.
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      runningRef.current = false;
    }
  }, []);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    const images = list.filter((f) => ACCEPT.split(',').includes(f.type));
    if (images.length < list.length) {
      toast.error(`${list.length - images.length} file(s) skipped — only JPG, PNG and WebP images are supported.`);
    }
    if (!images.length) return;
    const fresh: Item[] = images.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'waiting',
    }));
    itemsRef.current = [...itemsRef.current, ...fresh];
    setItems(itemsRef.current);
    processQueue(targetBytes, format);
  };

  /** Changing the target or format re-runs every image with the new settings. */
  const changeSettings = (bytes: number, fmt: OutputFormat) => {
    if (runningRef.current) {
      toast.message('Please wait for the current batch to finish, then change the setting.');
      return;
    }
    setTargetBytes(bytes);
    setFormat(fmt);
    const reset = itemsRef.current.map((it) => {
      if (it.result) URL.revokeObjectURL(it.result.url);
      return { ...it, status: 'waiting' as Status, result: undefined, error: undefined };
    });
    itemsRef.current = reset;
    setItems(reset);
    if (reset.length) processQueue(bytes, fmt);
  };

  const remove = (id: string) => {
    const it = itemsRef.current.find((x) => x.id === id);
    if (it) {
      URL.revokeObjectURL(it.previewUrl);
      if (it.result) URL.revokeObjectURL(it.result.url);
    }
    itemsRef.current = itemsRef.current.filter((x) => x.id !== id);
    setItems(itemsRef.current);
  };

  const clearAll = () => {
    if (runningRef.current) return;
    itemsRef.current.forEach((it) => {
      URL.revokeObjectURL(it.previewUrl);
      if (it.result) URL.revokeObjectURL(it.result.url);
    });
    itemsRef.current = [];
    setItems([]);
  };

  const done = items.filter((it) => it.status === 'done' && it.result);
  const busy = items.some((it) => it.status === 'waiting' || it.status === 'working');
  const originalTotal = done.reduce((n, it) => n + it.file.size, 0);
  const outputTotal = done.reduce((n, it) => n + it.result!.blob.size, 0);

  const downloadOne = (it: Item) => {
    if (!it.result) return;
    const a = document.createElement('a');
    a.href = it.result.url;
    a.download = outputName(it.file.name, it.result.blob, new Set());
    a.click();
  };

  const downloadZip = async () => {
    if (!done.length) return;
    setZipping(true);
    try {
      const taken = new Set<string>();
      const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
      for (const it of done) {
        const name = outputName(it.file.name, it.result!.blob, taken);
        // Images are already compressed, so store them as-is (level 0) - zipping is instant.
        entries[name] = [new Uint8Array(await it.result!.blob.arrayBuffer()), { level: 0 }];
      }
      const zip = zipSync(entries);
      const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `compressed-images-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(`Downloaded ${done.length} image${done.length > 1 ? 's' : ''} as a ZIP`);
    } catch (e) {
      console.error('[compressor] zip failed', e);
      toast.error('Could not create the ZIP. Try downloading the images one by one.');
    } finally {
      setZipping(false);
    }
  };

  const chip = (active: boolean) =>
    cn(
      'rounded-control border px-3 py-2.5 text-left transition-colors duration-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      active
        ? 'border-primary bg-primary/10 text-foreground'
        : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
    );

  return (
    <div>
      <AdminPageHeader
        title="Image compressor"
        description="Shrinks photos below the upload limit at the highest quality possible, then downloads them as a ZIP for uploading. Photos stay on this computer: nothing is uploaded from this page."
      />

      <div className="space-y-6">
        {/* Settings */}
        <div className="grid gap-5 rounded-card border border-border bg-card p-4 sm:p-5 md:grid-cols-2">
          <div>
            <p id="compress-size" className="mb-2 text-sm font-medium text-foreground">Size limit</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="compress-size">
              {TARGETS.map((t) => (
                <button
                  key={t.bytes}
                  type="button"
                  role="radio"
                  aria-checked={targetBytes === t.bytes}
                  onClick={() => targetBytes !== t.bytes && changeSettings(t.bytes, format)}
                  className={chip(targetBytes === t.bytes)}
                >
                  <span className="block text-sm font-semibold">Under {t.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p id="compress-format" className="mb-2 text-sm font-medium text-foreground">Format</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="compress-format">
              <button
                type="button"
                role="radio"
                aria-checked={format === 'webp'}
                disabled={!webpOk}
                onClick={() => format !== 'webp' && changeSettings(targetBytes, 'webp')}
                className={chip(format === 'webp')}
              >
                <span className="block text-sm font-semibold">WebP (recommended)</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {webpOk ? 'Sharpest result for the size' : 'Not supported in this browser. Use Chrome or Edge.'}
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={format === 'jpeg'}
                onClick={() => format !== 'jpeg' && changeSettings(targetBytes, 'jpeg')}
                className={chip(format === 'jpeg')}
              >
                <span className="block text-sm font-semibold">JPG</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Works everywhere, slightly softer</span>
              </button>
            </div>
          </div>
        </div>

        {/* Drop zone */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-10 transition-colors duration-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            dragOver ? 'border-primary bg-primary/10' : 'border-input bg-muted/30 hover:border-primary hover:bg-muted/60',
          )}
        >
          <Upload aria-hidden="true" className="size-8 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            Drop photos here or <span className="text-primary">choose files</span>
          </span>
          <span className="text-xs text-muted-foreground">JPG, PNG or WebP · select as many as you like</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {items.length > 0 && (
          <div className="overflow-hidden rounded-card border border-border bg-card">
            {/* Summary + actions */}
            <div className="flex flex-col justify-between gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:px-5">
              <div className="text-sm text-foreground" aria-live="polite">
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner />
                    Compressing {done.length + 1} of {items.length}…
                  </span>
                ) : (
                  <span className="tabular-nums">
                    <strong>{done.length}</strong> of {items.length} ready
                    {done.length > 0 && (
                      <> · {formatBytes(originalTotal)} → <strong>{formatBytes(outputTotal)}</strong></>
                    )}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearAll} disabled={busy}>
                  <Trash2 aria-hidden="true" /> Clear all
                </Button>
                <Button size="sm" onClick={downloadZip} disabled={busy || zipping || done.length === 0}>
                  {zipping ? <Spinner /> : <Archive aria-hidden="true" />}
                  Download all as ZIP
                </Button>
              </div>
            </div>

            <ul className="divide-y divide-border">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5">
                  <img
                    src={it.result?.url || it.previewUrl}
                    alt=""
                    className="size-14 shrink-0 rounded-control bg-muted object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground" title={it.file.name}>{it.file.name}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {formatBytes(it.file.size)}
                      {it.result && (
                        <>
                          {' → '}
                          <span className="font-semibold text-foreground">{formatBytes(it.result.blob.size)}</span>
                          {' · '}{it.result.width}×{it.result.height}
                          {it.result.keptOriginal
                            ? ' · already under the limit, kept untouched'
                            : ` · quality ${Math.round((it.result.quality ?? 0) * 100)}%`}
                        </>
                      )}
                    </p>
                    {it.status === 'error' && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle aria-hidden="true" className="size-3.5" /> {it.error}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {it.status === 'waiting' && <span className="text-xs text-muted-foreground">Waiting</span>}
                    {it.status === 'working' && <Spinner label="Compressing" />}
                    {it.status === 'done' && (
                      <>
                        <StatusBadge tone="success" label="Done" icon={Check} className="hidden sm:inline-flex" />
                        <IconButton label={`Download ${it.file.name}`} size="sm" onClick={() => downloadOne(it)}>
                          <Download />
                        </IconButton>
                      </>
                    )}
                    <IconButton
                      label={`Remove ${it.file.name}`}
                      size="sm"
                      onClick={() => remove(it.id)}
                      disabled={it.status === 'working'}
                      className="hover:text-destructive disabled:opacity-40"
                    >
                      <X />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminImageCompressor;
