import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_HOME_COLLECTIONS } from '@/data/defaultHomeCollections';
import {
  HomeCollection,
  subscribeHomeCollections,
  createHomeCollection,
  updateHomeCollection,
  deleteHomeCollection,
  uploadHomeMedia,
} from '@/services/homeContentService';
import { SmartImage } from "@/components/ui/smart-image";
import { assertUploadableImage, describeUploadError, IMAGE_ACCEPT } from "@/services/mediaStorage";

const TINTS: { label: string; value: string }[] = [
  { label: 'Maroon', value: 'from-[#3a1d20]/85 via-[#3a1d20]/35 to-transparent' },
  { label: 'Charcoal', value: 'from-[#1f2937]/80 via-[#1f2937]/30 to-transparent' },
  { label: 'Sienna', value: 'from-[#3b2417]/80 via-[#3b2417]/30 to-transparent' },
  { label: 'Cocoa', value: 'from-[#3a2418]/85 via-[#3a2418]/30 to-transparent' },
  { label: 'Espresso', value: 'from-[#2a1810]/88 via-[#2a1810]/35 to-transparent' },
];

interface DraftCollection {
  id?: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaLink: string;
  imageUrl: string;
  tint: string;
  active: boolean;
  order: number;
}

const emptyDraft = (order = 0): DraftCollection => ({
  eyebrow: 'Curated Collection',
  title: '',
  subtitle: '',
  ctaLabel: 'Explore Collection',
  ctaLink: '/',
  imageUrl: '',
  tint: TINTS[0].value,
  active: true,
  order,
});

const AdminHomeCollections = () => {
  const [items, setItems] = useState<HomeCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftCollection>(emptyDraft());
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [importingDefaults, setImportingDefaults] = useState(false);

  useEffect(() => {
    const unsub = subscribeHomeCollections((data) => {
      setItems(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const openNew = () => {
    setDraft(emptyDraft(items.length));
    setFile(null);
    setShowForm(true);
  };

  const openEdit = (item: HomeCollection) => {
    setDraft({
      id: item.id,
      eyebrow: item.eyebrow || '',
      title: item.title,
      subtitle: item.subtitle || '',
      ctaLabel: item.ctaLabel || 'Explore',
      ctaLink: item.ctaLink || '/',
      imageUrl: item.imageUrl,
      tint: item.tint || TINTS[0].value,
      active: item.active !== false,
      order: item.order ?? 0,
    });
    setFile(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return toast.error('Title is required');
    if (!draft.imageUrl && !file) return toast.error('Image is required');

    try {
      setSaving(true);
      let imageUrl = draft.imageUrl;
      if (file) {
        toast.loading('Uploading image…', { id: 'hc-upload' });
        imageUrl = await uploadHomeMedia(file);
        toast.success('Image uploaded', { id: 'hc-upload' });
      }
      const payload = {
        eyebrow: draft.eyebrow.trim(),
        title: draft.title.trim(),
        subtitle: draft.subtitle.trim(),
        ctaLabel: draft.ctaLabel.trim() || 'Explore',
        ctaLink: draft.ctaLink.trim() || '/',
        imageUrl,
        tint: draft.tint,
        active: draft.active,
        order: draft.order,
      };
      if (draft.id) {
        await updateHomeCollection(draft.id, payload);
        toast.success('Collection updated');
      } else {
        await createHomeCollection(payload);
        toast.success('Collection added');
      }
      setShowForm(false);
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    if (!confirm('Delete this collection card?')) return;
    try {
      await deleteHomeCollection(id);
      toast.success('Deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    }
  };

  const toggleActive = async (item: HomeCollection) => {
    if (!item.id) return;
    try {
      await updateHomeCollection(item.id, { active: !item.active });
    } catch (err: any) {
      toast.error(err?.message || 'Update failed');
    }
  };

  const importDefaults = async () => {
    if (items.length > 0) return;
    try {
      setImportingDefaults(true);
      await Promise.all(
        DEFAULT_HOME_COLLECTIONS.map((item) => createHomeCollection(item))
      );
      toast.success('Imported current home-page collections into admin');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to import defaults');
    } finally {
      setImportingDefaults(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-700 dark:text-amber-400 font-medium mb-2 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> Content & Media
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white">
            Our Collections
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage the cards displayed in the “Our Collections” section on the home page.
          </p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-full bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 text-sm font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Collection
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center">
          <p className="text-sm text-gray-500 max-w-xl mx-auto">
            No collection cards yet. The home page is currently using the built-in collection cards. Import them here once, then update or reorder them from admin.
          </p>
          <button
            type="button"
            onClick={importDefaults}
            disabled={importingDefaults}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-default disabled:opacity-60 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
          >
            {importingDefaults ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Import Current Collections
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="group relative rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm"
            >
              <div className="aspect-[4/5] relative">
                <SmartImage src={item.imageUrl} alt={item.title} className="absolute inset-0 w-full h-full object-cover" preset="card" />
                <div className={`absolute inset-0 bg-gradient-to-t ${item.tint || TINTS[0].value}`} />
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <p className="text-[10px] uppercase tracking-[0.25em] opacity-80">{item.eyebrow}</p>
                  <h3 className="text-lg font-semibold leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                    {item.title}
                  </h3>
                  {item.subtitle && <p className="text-xs opacity-80 mt-1 line-clamp-2">{item.subtitle}</p>}
                </div>
                {!item.active && (
                  <div className="absolute top-3 left-3 rounded-full bg-black/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white">
                    Hidden
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                <div className="text-xs text-gray-500">Order: {item.order ?? 0}</div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(item)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title={item.active ? 'Hide' : 'Show'}>
                    {item.active ? <Eye className="w-4 h-4 text-gray-600 dark:text-gray-300" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors"
                    title="Edit collection"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {draft.id ? 'Edit Collection' : 'New Collection'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Eyebrow">
                  <input className="form-input" value={draft.eyebrow} onChange={(e) => setDraft({ ...draft, eyebrow: e.target.value })} />
                </Field>
                <Field label="Title *">
                  <input className="form-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required />
                </Field>
              </div>
              <Field label="Subtitle">
                <textarea className="form-input min-h-[70px]" value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="CTA Label">
                  <input className="form-input" value={draft.ctaLabel} onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })} />
                </Field>
                <Field label="CTA Link">
                  <input className="form-input" value={draft.ctaLink} onChange={(e) => setDraft({ ...draft, ctaLink: e.target.value })} placeholder="/category/jewellery" />
                </Field>
              </div>
              <Field label="Image">
                <div className="flex flex-col gap-2">
                  {(file || draft.imageUrl) && (
                    <SmartImage
                      src={file ? URL.createObjectURL(file) : draft.imageUrl}
                      alt="preview"
                      className="h-40 w-full object-cover rounded-lg border border-gray-200 dark:border-gray-700" preset="card" />
                  )}
                  <input
                    type="file"
                    accept={IMAGE_ACCEPT}
                    onChange={(e) => {
                      const picked = e.target.files?.[0] || null;
                      if (picked) {
                        try {
                          assertUploadableImage(picked);
                        } catch (err) {
                          toast.error(describeUploadError(err));
                          e.target.value = '';
                          return;
                        }
                      }
                      setFile(picked);
                    }}
                    className="text-sm"
                  />
                  <input
                    className="form-input"
                    value={draft.imageUrl}
                    onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
                    placeholder="…or paste an image URL"
                  />
                </div>
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Tint">
                  <select className="form-input" value={draft.tint} onChange={(e) => setDraft({ ...draft, tint: e.target.value })}>
                    {TINTS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Order">
                  <input type="number" className="form-input" value={draft.order} onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) || 0 })} />
                </Field>
                <Field label="Active">
                  <label className="inline-flex items-center gap-2 mt-2 text-sm">
                    <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                    Show on home page
                  </label>
                </Field>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-lg"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {draft.id ? 'Save changes' : 'Create collection'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <style>{`
        .form-input {
          width: 100%;
          padding: 0.55rem 0.75rem;
          border-radius: 0.6rem;
          border: 1px solid rgb(229 231 235);
          background: white;
          color: rgb(17 24 39);
          font-size: 0.875rem;
        }
        .dark .form-input {
          background: rgb(17 24 39);
          color: white;
          border-color: rgb(55 65 81);
        }
        .form-input:focus { outline: none; border-color: rgb(217 119 6); box-shadow: 0 0 0 3px rgba(217,119,6,0.15); }
      `}</style>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{label}</span>
    {children}
  </label>
);

export default AdminHomeCollections;
