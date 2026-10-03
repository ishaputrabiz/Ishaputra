import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { IconButton } from '@/components/ui/icon-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MediaGridSkeleton } from '@/components/skeletons';
import { fadeUp, staggerDelay } from '@/lib/motion';
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
  { label: 'Maroon', value: 'from-charcoal/85 via-charcoal/35 to-transparent' },
  { label: 'Charcoal', value: 'from-[#1f2937]/80 via-[#1f2937]/30 to-transparent' },
  { label: 'Sienna', value: 'from-charcoal/80 via-charcoal/30 to-transparent' },
  { label: 'Cocoa', value: 'from-charcoal/85 via-charcoal/30 to-transparent' },
  { label: 'Espresso', value: 'from-charcoal/88 via-charcoal/35 to-transparent' },
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
  const confirmReturnRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<DraftCollection>(emptyDraft());
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [importingDefaults, setImportingDefaults] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeHomeCollections((data) => {
      setItems(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const openNew = () => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setDraft(emptyDraft(items.length));
    setFile(null);
    setShowForm(true);
  };

  const openEdit = (item: HomeCollection) => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
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
    if (!draft.title.trim()) return toast.error('Add a title');
    if (!draft.imageUrl && !file) return toast.error('Add an image');

    try {
      setSaving(true);
      let imageUrl = draft.imageUrl;
      if (file) {
        toast.loading('Uploading the image', { id: 'hc-upload' });
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
        toast.success('Collection saved');
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
    try {
      await deleteHomeCollection(id);
      toast.success('Collection card deleted');
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
    if (items.length > 0 || importingDefaults) return;
    try {
      setImportingDefaults(true);
      await Promise.all(
        DEFAULT_HOME_COLLECTIONS.map((item) => createHomeCollection(item))
      );
      toast.success('Home page collections imported');
    } catch (err: any) {
      toast.error(err?.message || 'Could not import defaults');
    } finally {
      setImportingDefaults(false);
    }
  };

  const deleting = items.find((i) => i.id === deleteId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AdminPageHeader
        eyebrow="Home page"
        title="Our collections"
        description="The cards in the “Our Collections” section on the home page."
        actions={
          <Button onClick={openNew}>
            <Plus aria-hidden="true" /> Add collection
          </Button>
        }
        className="pb-0"
      />

      {loading ? (
        <MediaGridSkeleton count={3} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 [&>*]:aspect-[4/5]" label="Loading collections" />
      ) : items.length === 0 ? (
        <div className="rounded-card border border-dashed border-input bg-card px-4 py-12">
          <EmptyState
            icon={LayoutGrid}
            title="No collection cards yet"
            description="The home page is using the built-in collection cards. Import them once, then edit or reorder them here."
            action={{ label: importingDefaults ? 'Importing' : 'Import collections', onClick: importDefaults }}
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <motion.li
              key={item.id}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: staggerDelay(index) }}
              className="group relative overflow-hidden rounded-card border border-border bg-card shadow-sm"
            >
              <div className="relative aspect-[4/5]">
                <SmartImage src={item.imageUrl} alt={item.title} className="absolute inset-0 h-full w-full object-cover" preset="card" />
                <div className={`absolute inset-0 bg-gradient-to-t ${item.tint || TINTS[0].value}`} />
                <div className="on-photo absolute inset-x-0 bottom-0 p-4 text-charcoal-foreground">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-charcoal-foreground/80">{item.eyebrow}</p>
                  <h2 className="text-lg font-semibold leading-tight" style={{ fontFamily: 'var(--font-heading)', fontStretch: 'var(--font-heading-stretch)' }}>
                    {item.title}
                  </h2>
                  {item.subtitle && <p className="mt-1 line-clamp-2 text-xs text-charcoal-foreground/80">{item.subtitle}</p>}
                </div>
                {!item.active && (
                  <span className="absolute left-3 top-3">
                    <StatusBadge tone="neutral" icon={EyeOff} label="Hidden" />
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                <div className="text-xs tabular-nums text-muted-foreground">Position {index + 1}</div>
                <div className="flex items-center gap-1">
                  <IconButton label={item.active ? `Hide ${item.title}` : `Show ${item.title}`} tooltip={item.active ? 'Hide' : 'Show'} size="sm" onClick={() => toggleActive(item)}>
                    {item.active ? <Eye /> : <EyeOff />}
                  </IconButton>
                  <IconButton label={`Edit ${item.title}`} tooltip="Edit" size="sm" onClick={() => openEdit(item)} className="text-foreground/70">
                    <Edit2 />
                  </IconButton>
                  <IconButton label={`Delete ${item.title}`} tooltip="Delete" size="sm" onClick={(e) => { confirmReturnRef.current = e.currentTarget; if (item.id) setDeleteId(item.id); }} className="text-muted-foreground hover:text-status-danger-fg">
                    <Trash2 />
                  </IconButton>
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        returnFocusRef={confirmReturnRef}
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={`Delete ${deleting?.title ?? 'this collection card'}?`}
        description="It is removed from the home page. This cannot be undone."
        confirmLabel="Delete card"
        tone="danger"
        onConfirm={() => handleDelete(deleteId ?? undefined)}
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent
          className="max-h-[90vh] max-w-2xl overflow-y-auto"
          onCloseAutoFocus={(e) => {
            if (returnFocusRef.current?.isConnected) {
              e.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Edit collection' : 'New collection'}</DialogTitle>
            <DialogDescription>A card in the Our Collections section of the home page.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Eyebrow" htmlFor="hc-eyebrow">
                <Input id="hc-eyebrow" value={draft.eyebrow} onChange={(e) => setDraft({ ...draft, eyebrow: e.target.value })} />
              </Field>
              <Field label="Title" htmlFor="hc-title" required>
                <Input id="hc-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required />
              </Field>
            </div>
            <Field label="Subtitle" htmlFor="hc-subtitle">
              <Textarea id="hc-subtitle" className="min-h-[70px]" value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Button label" htmlFor="hc-cta">
                <Input id="hc-cta" value={draft.ctaLabel} onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })} />
              </Field>
              <Field label="Button link" htmlFor="hc-link">
                <Input id="hc-link" value={draft.ctaLink} onChange={(e) => setDraft({ ...draft, ctaLink: e.target.value })} placeholder="/category/hair-care" />
              </Field>
            </div>
            <Field label="Image" htmlFor="hc-file">
              <div className="flex flex-col gap-2">
                {(file || draft.imageUrl) && (
                  <SmartImage
                    src={file ? URL.createObjectURL(file) : draft.imageUrl}
                    alt="Preview"
                    className="h-40 w-full rounded-card border border-border object-cover" preset="card" />
                )}
                <input
                  id="hc-file"
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
                  className="text-sm text-foreground/80 file:mr-3 file:h-9 file:cursor-pointer file:rounded-control file:border file:border-input file:bg-transparent file:px-3 file:text-xs file:font-semibold file:text-foreground hover:file:bg-muted"
                />
                <Input
                  aria-label="Image URL"
                  value={draft.imageUrl}
                  onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
                  placeholder="Or paste an image URL"
                />
              </div>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Tint" htmlFor="hc-tint">
                <Select value={draft.tint} onValueChange={(v) => setDraft({ ...draft, tint: v })}>
                  <SelectTrigger id="hc-tint"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TINTS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Order" htmlFor="hc-order">
                <Input id="hc-order" type="number" inputMode="numeric" className="tabular-nums" value={draft.order} onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) || 0 })} />
              </Field>
              <div>
                <p className="mb-1.5 block text-xs font-medium text-foreground/80">Visibility</p>
                <div className="flex h-11 items-center gap-2">
                  <Checkbox id="hc-active" checked={draft.active} onCheckedChange={(checked) => setDraft({ ...draft, active: checked === true })} />
                  <Label htmlFor="hc-active" className="text-sm font-normal text-foreground">Show on home page</Label>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Spinner />}
                {draft.id ? 'Save changes' : 'Create collection'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Field = ({ label, htmlFor, required, children }: { label: string; htmlFor: string; required?: boolean; children: React.ReactNode }) => (
  <div>
    <Label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-foreground/80">
      {label}
      {required && <span aria-hidden="true" className="ml-0.5 text-status-danger-fg">*</span>}
    </Label>
    {children}
  </div>
);

export default AdminHomeCollections;
