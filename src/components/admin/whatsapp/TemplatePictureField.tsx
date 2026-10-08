/**
 * Picks a template header picture, shrinks it to a JPEG within the store's
 * 500 KB limit and uploads it. The URL becomes Meta's review sample and the
 * picture sent with every message that uses the template.
 */
import { useId, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { describeUploadError } from '@/services/mediaStorage';
import { uploadTemplatePicture } from './waMedia';

export default function TemplatePictureField({
  imageUrl,
  onChange,
  error,
}: {
  imageUrl: string | null;
  onChange: (url: string | null) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const helpId = useId();

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setUploadError(null);
    try {
      onChange(await uploadTemplatePicture(file));
    } catch (err) {
      setUploadError(describeUploadError(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const message = uploadError || error;
  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id="tpl-header-imageUrl"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-describedby={helpId}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {imageUrl ? (
        <div className="flex items-center gap-3">
          <img src={imageUrl} alt="Header picture" className="h-16 w-28 flex-none rounded-control border border-border object-cover" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? <Spinner /> : <RefreshCw aria-hidden="true" />}
              Change
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)} disabled={busy}>
              <Trash2 aria-hidden="true" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-invalid={!!message}
          className="flex min-h-[72px] w-full items-center justify-center gap-2 rounded-control border border-dashed border-input bg-muted/60 px-3 text-sm font-medium text-foreground transition-colors duration-hover hover:border-primary hover:bg-muted disabled:opacity-60 aria-[invalid=true]:border-destructive"
        >
          {busy ? <Spinner /> : <ImagePlus aria-hidden="true" className="size-4" />}
          {busy ? 'Uploading' : 'Choose a picture'}
        </button>
      )}
      <p id={helpId} className="text-[11px] text-muted-foreground">
        JPEG or PNG; it is resized to fit. Wide pictures (about 1.91 : 1) look best. This picture goes with every message
        sent with this template.
      </p>
      {message && (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
