import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Loader2,
  Save,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Layers,
  Trash2,
} from 'lucide-react';
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
    title: 'Collection Banner',
    description: 'Full-width banner displayed inside the showcase area on the home page.',
    ratioHint: 'Recommended ratio: 21:9 · 1920×820',
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
  ctaLabel: 'Shop Now',
  ctaLink: '/category/jewellery',
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
      toast.error('Please upload an image first');
      return;
    }
    if (!draft.title?.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      if (draft.id) {
        await updateHomeBanner(draft.id, draft);
        toast.success('Banner updated');
      } else {
        const id = await createHomeBanner(draft);
        setDraft((prev) => ({ ...prev, id }));
        toast.success('Banner created');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white dark:bg-gray-900 border border-[#F5EFE6] dark:border-gray-800 rounded-2xl p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/20 grid place-items-center text-amber-700 dark:text-amber-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{config.title}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Switch checked={draft.active} onCheckedChange={(v) => setField('active', v)} />
          <span>{draft.active ? 'Active' : 'Hidden'}</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Image upload */}
        <div>
          <Label className="text-xs text-gray-500">Image</Label>
          <p className="text-[11px] text-gray-400 mb-2">{config.ratioHint}</p>
          <div
            onClick={() => fileRef.current?.click()}
            className="relative aspect-[16/10] rounded-xl border-2 border-dashed border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 grid place-items-center cursor-pointer hover:border-amber-400 transition-colors overflow-hidden"
          >
            {draft.imageUrl ? (
              <SmartImage
                src={draft.imageUrl}
                alt="Banner preview"
                className="absolute inset-0 w-full h-full object-cover" preset="card" />
            ) : (
              <div className="text-center text-gray-400">
                <ImageIcon className="w-8 h-8 mx-auto mb-2" />
                <p className="text-xs">Click to upload</p>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/40 grid place-items-center">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
          {draft.imageUrl && (
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="flex-1"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" /> Replace
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setField('imageUrl', '')}
                className="text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Content fields */}
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-500">Eyebrow (small uppercase label)</Label>
            <Input
              value={draft.eyebrow || ''}
              onChange={(e) => setField('eyebrow', e.target.value)}
              placeholder="LUXURY NECKLACE"
              className="mt-1.5 bg-white dark:bg-gray-950"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Title</Label>
            <Input
              value={draft.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder="Best Friend Jewelry"
              className="mt-1.5 bg-white dark:bg-gray-950"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Subtitle</Label>
            <Textarea
              rows={2}
              value={draft.subtitle || ''}
              onChange={(e) => setField('subtitle', e.target.value)}
              placeholder="A wide range of exquisite necklaces"
              className="mt-1.5 bg-white dark:bg-gray-950"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">CTA label</Label>
              <Input
                value={draft.ctaLabel}
                onChange={(e) => setField('ctaLabel', e.target.value)}
                placeholder="Shop Now"
                className="mt-1.5 bg-white dark:bg-gray-950"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">CTA link</Label>
              <Input
                value={draft.ctaLink}
                onChange={(e) => setField('ctaLink', e.target.value)}
                placeholder="/shop/necklaces"
                className="mt-1.5 bg-white dark:bg-gray-950"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" /> Save banner
            </>
          )}
        </Button>
      </div>
    </motion.div>
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

  if (loading) {
    return (
      <div className="grid place-items-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-700 dark:text-amber-400 font-medium mb-2 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" /> Showcase
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white">
          Collection Banner
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage the full-width collection banner displayed inside the home page showcase.
        </p>
      </div>

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
