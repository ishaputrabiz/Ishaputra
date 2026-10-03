import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Save,
  Upload,
  Image as ImageIcon,
  GalleryHorizontal,
  Trash2,
} from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { FormSkeleton } from '@/components/skeletons';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { fadeUp } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  subscribeHomeBanners,
  createHomeBanner,
  updateHomeBanner,
  uploadHomeMedia,
  type HomeBanner,
  type HomeBannerSlot,
} from '@/services/homeContentService';
import { SmartImage } from "@/components/ui/smart-image";
import { describeUploadError, IMAGE_ACCEPT } from "@/services/mediaStorage";

interface SlotConfig {
  slot: HomeBannerSlot;
  title: string;
  description: string;
  ratioHint: string;
}

const SLOTS: SlotConfig[] = [
  {
    slot: 'collection-wide',
    title: 'Collection banner',
    description: 'Full-width banner displayed inside the showcase area on the home page.',
    ratioHint: 'Recommended ratio: 21:9 · 1920 × 820',
  },
];

interface DraftBanner {
  id?: string;
  slot: HomeBannerSlot;
  imageUrl: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  ctaLabel: string;
  ctaLink: string;
  active: boolean;
  order: number;
}

const emptyDraft = (slot: HomeBannerSlot, order = 0): DraftBanner => ({
  slot,
  imageUrl: '',
  eyebrow: '',
  title: '',
  subtitle: '',
  ctaLabel: 'Shop now',
  ctaLink: '/products',
  active: true,
  order,
});

const SlotCard = ({ config, banner }: { config: SlotConfig; banner?: HomeBanner }) => {
  const [draft, setDraft] = useState<DraftBanner>(
    banner ? { ...banner } : emptyDraft(config.slot)
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync when banner changes from snapshot
  useEffect(() => {
    if (banner) setDraft({ ...banner });
  }, [banner]);

  const setField = <K extends keyof DraftBanner>(key: K, value: DraftBanner[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadHomeMedia(file);
      setField('imageUrl', url);
      toast.success('Image uploaded');
    } catch (err) {
      console.error(err);
      toast.error(describeUploadError(err));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!draft.imageUrl) {
      toast.error('Upload an image first');
      return;
    }
    if (!draft.title?.trim()) {
      toast.error('Add a title');
      return;
    }
    setSaving(true);
    try {
      if (draft.id) {
        await updateHomeBanner(draft.id, draft);
        toast.success('Banner saved');
      } else {
        const id = await createHomeBanner(draft);
        setDraft((prev) => ({ ...prev, id }));
        toast.success('Banner created');
      }
    } catch (err) {
      console.error(err);
      toast.error('Could not save the banner');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.section
      {...fadeUp}
      aria-labelledby={`slot-${config.slot}-title`}
      className="rounded-card border border-border bg-card p-4 shadow-sm sm:p-6"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-muted text-foreground/70">
            <GalleryHorizontal aria-hidden="true" className="h-4 w-4" />
          </div>
          <div>
            <h2 id={`slot-${config.slot}-title`} className="text-base font-semibold text-foreground">{config.title}</h2>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch id={`slot-${config.slot}-active`} checked={draft.active} onCheckedChange={(v) => setField('active', v)} />
          <Label htmlFor={`slot-${config.slot}-active`} className="text-sm font-normal text-foreground/80">{draft.active ? 'Active' : 'Hidden'}</Label>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Image upload */}
        <div>
          <p className="text-xs font-medium text-foreground/80">Image</p>
          <p className="mb-2 text-xs text-muted-foreground">{config.ratioHint}</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={draft.imageUrl ? 'Replace the banner image' : 'Upload a banner image'}
            className="relative grid aspect-[16/10] w-full cursor-pointer place-items-center overflow-hidden rounded-card border-2 border-dashed border-input bg-muted/40 transition-colors duration-hover hover:border-primary"
          >
            {draft.imageUrl ? (
              <SmartImage
                src={draft.imageUrl}
                alt="Banner preview"
                className="absolute inset-0 w-full h-full object-cover" preset="card" />
            ) : (
              <span className="flex flex-col items-center text-center text-muted-foreground">
                <ImageIcon aria-hidden="true" className="mx-auto mb-2 h-8 w-8" />
                <span className="text-xs">Click to upload</span>
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 grid place-items-center bg-charcoal/60 text-charcoal-foreground">
                <Spinner size={24} label="Uploading" />
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
          {draft.imageUrl && (
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="flex-1"
              >
                <Upload aria-hidden="true" /> Replace
              </Button>
              <IconButton
                label="Remove image"
                size="sm"
                onClick={() => setField('imageUrl', '')}
                className="text-muted-foreground hover:text-status-danger-fg"
              >
                <Trash2 />
              </IconButton>
            </div>
          )}
        </div>

        {/* Content fields */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="hb-eyebrow" className="text-xs font-medium text-foreground/80">Eyebrow (small uppercase label)</Label>
            <Input
              id="hb-eyebrow"
              value={draft.eyebrow || ''}
              onChange={(e) => setField('eyebrow', e.target.value)}
              placeholder="ROOTED IN AYURVEDA"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="hb-title" className="text-xs font-medium text-foreground/80">Title</Label>
            <Input
              id="hb-title"
              value={draft.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder="Built for the modern man"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="hb-subtitle" className="text-xs font-medium text-foreground/80">Subtitle</Label>
            <Textarea
              id="hb-subtitle"
              rows={2}
              value={draft.subtitle || ''}
              onChange={(e) => setField('subtitle', e.target.value)}
              placeholder="Classical formulations, clean ingredients."
              className="mt-1.5"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="hb-cta" className="text-xs font-medium text-foreground/80">Button label</Label>
              <Input
                id="hb-cta"
                value={draft.ctaLabel}
                onChange={(e) => setField('ctaLabel', e.target.value)}
                placeholder="Shop now"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="hb-link" className="text-xs font-medium text-foreground/80">Button link</Label>
              <Input
                id="hb-link"
                value={draft.ctaLink}
                onChange={(e) => setField('ctaLink', e.target.value)}
                placeholder="/category/hair-care"
                className="mt-1.5"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Spinner /> : <Save aria-hidden="true" />}
          {saving ? 'Saving' : 'Save banner'}
        </Button>
      </div>
    </motion.section>
  );
};

const AdminHomeBanners = () => {
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeHomeBanners((all) => {
      setBanners(all);
      setLoading(false);
    });
    return unsub;
  }, []);

  const header = (
    <AdminPageHeader
      eyebrow="Home page"
      title="Collection banner"
      description="The full-width collection banner inside the home page showcase."
      className="pb-0"
    />
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl [&>*]:max-w-4xl space-y-6">
        {header}
        <div className="rounded-card border border-border bg-card p-4 sm:p-6">
          <FormSkeleton fields={5} label="Loading banner" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-4xl space-y-6">
      {header}

      {SLOTS.map((s) => (
        <SlotCard
          key={s.slot}
          config={s}
          banner={banners.find((b) => b.slot === s.slot)}
        />
      ))}
    </div>
  );
};

export default AdminHomeBanners;
