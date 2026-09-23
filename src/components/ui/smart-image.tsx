import { useState, type ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { cldUrl, cldSrcSet, type ImagePreset } from '@/lib/cloudinaryUrl';
import { mediaPreviewUrl } from '@/lib/mediaUrl';

const FALLBACK_SRC = '/placeholder.svg';

/** Slots small enough that the 600px preview of a stored image is sharp. */
const PREVIEW_PRESETS = new Set<ImagePreset>(['thumb', 'tile', 'card']);

export interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  src: string | undefined | null;
  /** Layout slot this image fills. Drives width, quality and srcset. */
  preset?: ImagePreset;
  /**
   * Set on images inside the initial viewport (hero, first grid row). Loads
   * eagerly with high priority instead of lazily.
   */
  priority?: boolean;
  fallbackSrc?: string;
}

/**
 * Drop-in `<img>` replacement for any URL that came out of Firestore.
 *
 *  - Images uploaded through /api/media (R2) render their 600px preview in
 *    small slots, falling back to the full image if the preview is missing.
 *  - Legacy Cloudinary URLs go through the transformer in src/lib/cloudinaryUrl.ts.
 *  - Anything else passes through untouched.
 */
export const SmartImage = ({
  src,
  preset = 'card',
  priority = false,
  fallbackSrc = FALLBACK_SRC,
  className,
  alt = '',
  ...rest
}: SmartImageProps) => {
  // 0 = preferred source, 1 = full stored image, 2 = placeholder. Tied to the
  // src it was reached for, so a new src starts fresh on its first render.
  const [failure, setFailure] = useState<{ src: typeof src; stage: number }>({ src, stage: 0 });
  const stage = failure.src === src ? failure.stage : 0;

  const preview = PREVIEW_PRESETS.has(preset) ? mediaPreviewUrl(src) : null;

  let resolved: string;
  let srcSet: string | undefined;
  if (!src || stage >= 2) {
    resolved = fallbackSrc;
  } else if (preview) {
    resolved = stage === 0 ? preview : src;
  } else {
    resolved = cldUrl(src, preset);
    srcSet = cldSrcSet(src, preset);
  }

  const handleError = () => setFailure({ src, stage: preview && stage === 0 ? 1 : 2 });

  // React 18 does not map the camelCase `fetchPriority` prop to the DOM
  // attribute (that landed in React 19), so pass the lowercase attribute name
  // directly. Only set it when it carries meaning - "auto" is the default.
  const priorityAttr = priority ? ({ fetchpriority: 'high' } as Record<string, string>) : {};

  return (
    <img
      {...rest}
      {...priorityAttr}
      src={resolved}
      srcSet={srcSet}
      alt={alt}
      className={cn(className)}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      onError={handleError}
    />
  );
};

export default SmartImage;
