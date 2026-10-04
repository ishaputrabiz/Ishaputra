import { useEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { cldUrl, cldSrcSet, type ImagePreset } from '@/lib/cloudinaryUrl';
import { mediaPreviewUrl } from '@/lib/mediaUrl';

/** Slots small enough that the 600px preview of a stored image is sharp. */
const PREVIEW_PRESETS = new Set<ImagePreset>(['thumb', 'tile', 'card']);

/** The I/S monogram's silhouette, used as a mask so it takes the theme's text colour. */
const MONOGRAM_MASK = "url('/loading_black.png')";

export interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  src: string | undefined | null;
  /** Layout slot this image fills. Drives width, quality and srcset. */
  preset?: ImagePreset;
  /**
   * Set on images inside the initial viewport (hero, first grid row). Loads
   * eagerly with high priority instead of lazily, and skips the fade-in.
   */
  priority?: boolean;
  /** An image URL to show instead of the monogram when the source is missing or broken. */
  fallbackSrc?: string;
}

/**
 * Drop-in `<img>` replacement for any URL that came out of Firestore.
 *
 *  - Images uploaded through /api/media (R2) render their 600px preview in
 *    small slots, falling back to the full image if the preview is missing.
 *  - Legacy Cloudinary URLs go through the transformer in src/lib/cloudinaryUrl.ts.
 *  - Anything else passes through untouched.
 *  - Non-priority images fade in over 240ms once loaded (not under reduced motion).
 *  - A missing or broken image shows a faint brand monogram on the slot's own
 *    background (the wrapper's tile-img or bg-muted shows through), never a
 *    grey "broken image" box.
 */
export const SmartImage = ({
  src,
  preset = 'card',
  priority = false,
  fallbackSrc,
  className,
  alt = '',
  onLoad,
  style,
  ...rest
}: SmartImageProps) => {
  // 0 = preferred source, 1 = full stored image, 2 = fallback. Tied to the
  // src it was reached for, so a new src starts fresh on its first render.
  const [failure, setFailure] = useState<{ src: typeof src; stage: number }>({ src, stage: 0 });
  const stage = failure.src === src ? failure.stage : 0;
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const preview = PREVIEW_PRESETS.has(preset) ? mediaPreviewUrl(src) : null;

  let resolved: string | null;
  let srcSet: string | undefined;
  if (!src || stage >= 2) {
    resolved = fallbackSrc ?? null;
  } else if (preview) {
    resolved = stage === 0 ? preview : src;
  } else {
    resolved = cldUrl(src, preset);
    srcSet = cldSrcSet(src, preset);
  }

  // An image served from cache can finish before React attaches onLoad.
  useEffect(() => {
    const img = imgRef.current;
    if (img && resolved && img.complete && img.naturalWidth > 0) setLoadedSrc(resolved);
  }, [resolved]);

  if (!resolved) {
    const monogram: CSSProperties = {
      backgroundColor: 'hsl(var(--foreground) / 0.25)',
      WebkitMaskImage: MONOGRAM_MASK,
      maskImage: MONOGRAM_MASK,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskOrigin: 'content-box',
      maskOrigin: 'content-box',
      WebkitMaskClip: 'content-box',
      maskClip: 'content-box',
      ...style,
    };
    return (
      <span
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={cn('block p-[28%]', className, 'object-contain')}
        style={monogram}
      />
    );
  }

  const handleError = () => setFailure({ src, stage: preview && stage === 0 ? 1 : 2 });

  // React 18 does not map the camelCase `fetchPriority` prop to the DOM
  // attribute (that landed in React 19), so pass the lowercase attribute name
  // directly. Only set it when it carries meaning - "auto" is the default.
  const priorityAttr = priority ? ({ fetchpriority: 'high' } as Record<string, string>) : {};
  const loaded = priority || loadedSrc === resolved;

  return (
    <img
      {...rest}
      {...priorityAttr}
      ref={imgRef}
      src={resolved}
      srcSet={srcSet}
      alt={alt}
      data-loaded={loaded}
      style={style}
      className={cn(
        !priority && 'transition-opacity duration-[240ms] ease-out data-[loaded=false]:opacity-0 motion-reduce:data-[loaded=false]:opacity-100',
        className,
      )}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      onLoad={(e) => {
        setLoadedSrc(resolved);
        onLoad?.(e);
      }}
      onError={handleError}
    />
  );
};

export default SmartImage;
