import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X, RefreshCw, Usb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useHardwareScanner } from '@/hooks/useHardwareScanner';

/**
 * Camera barcode scanner for the admin panel.
 *
 * ZXing is loaded with a dynamic import so its ~200KB decoder never lands in
 * the storefront bundle — admins are the only ones who scan anything.
 *
 * Works on any browser that grants `getUserMedia`; note that browsers only hand
 * out the camera on https:// or http://localhost, so a plain-http LAN address
 * will report "camera unavailable".
 *
 * A USB / Bluetooth scanner also works while this is open, and does not need
 * the camera at all - see `useHardwareScanner`. The shop counter has a corded
 * scanner, and holding a laptop up to each piece would be far slower.
 */

type ScannerControls = { stop: () => void };

interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once with the decoded text; the dialog closes itself afterwards. */
  onDetected: (code: string) => void;
  title?: string;
  description?: string;
}

export const BarcodeScannerDialog = ({
  open,
  onOpenChange,
  onDetected,
  title = 'Scan barcode',
  description = 'Point the camera at the product barcode.',
}: BarcodeScannerDialogProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const detectedRef = useRef(false);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(0);

  const stop = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      // already stopped
    }
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  /**
   * A corded scanner types the code and presses Enter, so it works while this
   * dialog is open without touching the camera at all - and still works when
   * the camera is unavailable, which is what a plain-http LAN address gives.
   *
   * Declared after `stop` so the dependency is plain to read rather than
   * relying on the closure happening to run late.
   */
  useHardwareScanner({
    enabled: open,
    onScan: (code) => {
      if (detectedRef.current) return;
      detectedRef.current = true;
      stop();
      onDetected(code);
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }

    let cancelled = false;
    detectedRef.current = false;
    setError(null);
    setStarting(true);

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');

        // Enumerating cameras needs permission first on most browsers.
        const cams = await BrowserMultiFormatReader.listVideoInputDevices().catch(
          () => [] as MediaDeviceInfo[],
        );
        if (cancelled) return;
        setDevices(cams);

        // Prefer the rear camera on phones/tablets.
        const preferred =
          cams.find((d) => /back|rear|environment/i.test(d.label))?.deviceId ??
          cams[deviceIndex]?.deviceId ??
          undefined;

        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(
          preferred,
          videoRef.current!,
          (result) => {
            if (!result || detectedRef.current) return;
            detectedRef.current = true;
            const text = result.getText().trim();
            stop();
            onDetected(text);
            onOpenChange(false);
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (e) {
        if (cancelled) return;
        const msg = (e as Error)?.message || '';
        setError(
          /permission|denied|NotAllowed/i.test(msg)
            ? 'Camera permission was blocked. Allow camera access for this site and try again.'
            : /NotFound|no video|Requested device/i.test(msg)
              ? 'No camera found on this device.'
              : 'Camera unavailable. Browsers only allow scanning on https:// or localhost — you can type the barcode instead.',
        );
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, deviceIndex, onDetected, onOpenChange, stop]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) stop(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-amber-600" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="relative rounded-xl overflow-hidden bg-black aspect-square">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {/*
            A square guide, in a square frame. The shop's tags carry QR codes,
            which are square, and the old 3:1 letterbox guide pushed people to
            frame them the way you would frame a 1D barcode - far away, so the
            QR ended up small in the middle and slow to lock on. ZXing reads
            both symbologies either way; this only tells the eye where to aim.
          */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-3/5 aspect-square">
              <span className="absolute -left-0.5 -top-0.5 h-7 w-7 rounded-tl-lg border-l-4 border-t-4 border-amber-400" />
              <span className="absolute -right-0.5 -top-0.5 h-7 w-7 rounded-tr-lg border-r-4 border-t-4 border-amber-400" />
              <span className="absolute -bottom-0.5 -left-0.5 h-7 w-7 rounded-bl-lg border-b-4 border-l-4 border-amber-400" />
              <span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-br-lg border-b-4 border-r-4 border-amber-400" />
            </div>
          </div>
          {starting && (
            <div className="absolute inset-0 grid place-items-center bg-black/60 text-white text-sm gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Starting camera…
            </div>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Usb className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          A USB scanner works here too — just scan, no setup needed.
        </p>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg p-2.5">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          {devices.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeviceIndex((i) => (i + 1) % devices.length)}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Switch camera
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="w-3.5 h-3.5 mr-1.5" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BarcodeScannerDialog;
