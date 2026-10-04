import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff, ArrowLeft, LayoutGrid, List, LayoutPanelTop, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { IconButton } from '@/components/ui/icon-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { useInlineFormFocus } from '@/components/admin/useInlineFormFocus';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MediaGridSkeleton } from '@/components/skeletons';
import { fadeUp, staggerDelay } from '@/lib/motion';
import { subscribeToCategories, type Category } from '@/services/categoryService';
import { useAuth } from '@/contexts/AuthContext';
import ImageUploader from '@/components/ImageUploader';
import { 
  getAllShowcases, 
  createShowcase, 
  updateShowcase, 
  deleteShowcase,
  uploadShowcaseImage,
  Showcase 
} from '@/services/showcaseService';
import { toast } from 'sonner';
import { SmartImage } from "@/components/ui/smart-image";

const AdminShowcases = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showcases, setShowcases] = useState<Showcase[]>([]);
  const confirmReturnRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingShowcase, setEditingShowcase] = useState<Showcase | null>(null);
  // Focus moves to the form when it opens and back to the opener when it closes.
  const { headingRef: formHeadingRef, addButtonRef, rememberOpener } = useInlineFormFocus(showForm, editingShowcase?.id);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [showcaseToDelete, setShowcaseToDelete] = useState<Showcase | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => subscribeToCategories(setCategories), []);

  // Form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageInputMethod, setImageInputMethod] = useState<'upload' | 'url'>('upload');
  const [imageUrl, setImageUrl] = useState('');
  const [imageLoadError, setImageLoadError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    description: '',
    cta: 'See More Products',
    order: 1,
    status: 'active' as 'active' | 'inactive',
  });

  useEffect(() => {
    // Check if user is admin
    if (!user) {
      navigate('/');
      return;
    }

    loadShowcases();
  }, [user, navigate]);

  const loadShowcases = async () => {
    try {
      setLoading(true);
      const data = await getAllShowcases();
      setShowcases(data);
    } catch (error) {
      toast.error('Could not load showcases');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate image input
    if (imageInputMethod === 'upload' && !selectedFile && !editingShowcase) {
      toast.error('Choose an image');
      return;
    }
    
    if (imageInputMethod === 'url' && !imageUrl && !editingShowcase) {
      toast.error('Paste an image URL');
      return;
    }

    if (!formData.title || !formData.subtitle || !formData.description) {
      toast.error('Fill in the title, category slug and description');
      return;
    }

    try {
      setIsSubmitting(true);
      let finalImageUrl = editingShowcase?.imageUrl || '';

      // Upload new image if selected
      if (imageInputMethod === 'upload' && selectedFile) {
        toast.loading('Compressing and uploading the image', { id: 'upload' });
        finalImageUrl = await uploadShowcaseImage(selectedFile);
        toast.success('Image uploaded', { id: 'upload' });
      } else if (imageInputMethod === 'url' && imageUrl) {
        finalImageUrl = imageUrl;
      }

      // Create or update showcase
      if (editingShowcase) {
        await updateShowcase(editingShowcase.id!, {
          title: formData.title,
          subtitle: formData.subtitle,
          description: formData.description,
          cta: formData.cta,
          imageUrl: finalImageUrl,
          order: formData.order,
          status: formData.status,
        });
        toast.success('Showcase saved');
      } else {
        await createShowcase({
          title: formData.title,
          subtitle: formData.subtitle,
          description: formData.description,
          cta: formData.cta,
          imageUrl: finalImageUrl,
          order: formData.order,
          status: formData.status,
        });
        toast.success('Showcase created');
      }

      // Reset form and reload
      resetForm();
      await loadShowcases();
    } catch (error: any) {
      toast.error(error.message || 'Could not save showcase');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (showcase: Showcase) => {
    try {
      toast.loading('Deleting the showcase', { id: 'delete' });
      await deleteShowcase(showcase.id!, showcase.imageUrl);
      toast.success('Showcase deleted', { id: 'delete' });
      await loadShowcases();
    } catch (error: any) {
      toast.error(error.message || 'Could not delete showcase', { id: 'delete' });
      console.error(error);
    }
  };

  const handleEdit = (showcase: Showcase) => {
    rememberOpener();
    setEditingShowcase(showcase);
    setFormData({
      title: showcase.title,
      subtitle: showcase.subtitle,
      description: showcase.description,
      cta: showcase.cta,
      order: showcase.order,
      status: showcase.status,
    });
    setImageUrl(showcase.imageUrl);
    setImageLoadError(false);
    setImageLoading(false);
    setImageInputMethod(showcase.imageUrl.includes('cloudinary') || showcase.imageUrl.includes('http') ? 'url' : 'upload');
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingShowcase(null);
    setSelectedFile(null);
    setImageUrl('');
    setImageLoadError(false);
    setImageLoading(false);
    setImageInputMethod('upload');
    setFormData({
      title: '',
      subtitle: '',
      description: '',
      cta: 'See More Products',
      order: showcases.length + 1,
      status: 'active',
    });
    setShowForm(false);
  };

  /** Showcase subtitles are category slugs; show the category's own name. */
  const categoryName = (subtitle: string) => {
    const slug = subtitle.toLowerCase().trim();
    const hit = categories.find((c) => (c.slug || '').toLowerCase() === slug);
    if (hit) return hit.name;
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const header = (
    <AdminPageHeader
      title="Showcases"
      description="The category showcase section on the home page."
      leading={
        <IconButton label="Back to dashboard" tooltip onClick={() => navigate('/admin')}>
          <ArrowLeft />
        </IconButton>
      }
      actions={
        !showForm && (
          <Button ref={addButtonRef} onClick={() => setShowForm(true)}>
            <Plus aria-hidden="true" />
            Add showcase
          </Button>
        )
      }
    />
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        {header}
        <MediaGridSkeleton count={6} className="lg:grid-cols-3" label="Loading showcases" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      {header}

      {/* Form */}
      {showForm && (
        <motion.section
          {...fadeUp}
          aria-labelledby="showcase-form-title"
          className="mb-8 rounded-card border border-border bg-card p-4 shadow-sm sm:p-6"
        >
          <h2 ref={formHeadingRef} tabIndex={-1} id="showcase-form-title" className="mb-6 text-lg font-semibold text-foreground">
            {editingShowcase ? 'Edit showcase' : 'Add showcase'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Image upload or URL */}
            <div>
              <p className="mb-2 block text-sm font-medium text-foreground/80">
                Showcase image <span aria-hidden="true" className="text-status-danger-fg">*</span>
              </p>
              <p className="mb-2 text-xs text-muted-foreground">Recommended size: 800 × 1000 px (4:5)</p>

              <ToggleGroup
                type="single"
                value={imageInputMethod}
                onValueChange={(v) => v && setImageInputMethod(v as 'upload' | 'url')}
                aria-label="How to add the image"
                className="mb-3"
              >
                <ToggleGroupItem value="upload" size="sm">Upload image</ToggleGroupItem>
                <ToggleGroupItem value="url" size="sm">Image URL</ToggleGroupItem>
              </ToggleGroup>

              {imageInputMethod === 'upload' ? (
                <ImageUploader
                  key={editingShowcase?.id || 'new'}
                  onImageSelected={setSelectedFile}
                  existingImageUrl={editingShowcase?.imageUrl}
                  onRemove={() => setSelectedFile(null)}
                  isUploading={isSubmitting}
                />
              ) : (
                <div>
                  <Input
                    type="url"
                    aria-label="Image URL"
                    aria-describedby="showcase-url-hint"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      setImageLoadError(false);
                      setImageLoading(true);
                    }}
                    placeholder="https://example.com/image.jpg"
                  />
                  <p id="showcase-url-hint" className="mt-1.5 text-xs text-muted-foreground">
                    A direct link to an image file (.jpg, .jpeg, .png, .webp or .gif)
                  </p>
                  {imageUrl && (
                    <div className="mt-3 overflow-hidden rounded-card border border-border bg-muted/50">
                      {imageLoading && !imageLoadError && (
                        <Skeleton className="h-64 w-full rounded-none" />
                      )}
                      {imageLoadError && (
                        <div className="flex h-64 w-full flex-col items-center justify-center p-6 text-center">
                          <TriangleAlert aria-hidden="true" className="mb-2 h-10 w-10 text-status-danger-fg" />
                          <p className="mb-1 text-sm font-medium text-foreground/80">This image did not load</p>
                          <p className="text-xs text-muted-foreground">
                            Paste a direct link to an image file, for example https://example.com/image.jpg
                          </p>
                        </div>
                      )}
                      <SmartImage
                        src={imageUrl}
                        alt="Preview"
                        className={`h-64 w-full object-cover ${imageLoading || imageLoadError ? 'hidden' : 'block'}`}
                        onLoad={() => {
                          setImageLoading(false);
                          setImageLoadError(false);
                        }}
                        onError={() => {
                          setImageLoading(false);
                          setImageLoadError(true);
                        }} preset="card" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Title */}
            <div>
              <Label htmlFor="sc-title" className="mb-2 block text-sm font-medium text-foreground/80">
                Title <span aria-hidden="true" className="text-status-danger-fg">*</span>
              </Label>
              <Input
                id="sc-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Energy and vitality"
                required
              />
            </div>

            {/* Subtitle */}
            <div>
              <Label htmlFor="sc-subtitle" className="mb-2 block text-sm font-medium text-foreground/80">
                Category slug <span aria-hidden="true" className="text-status-danger-fg">*</span>
              </Label>
              <Input
                id="sc-subtitle"
                type="text"
                aria-describedby="sc-subtitle-hint"
                value={formData.subtitle}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value.toUpperCase() })}
                placeholder="e.g., HAIR-CARE"
                className="uppercase"
                required
              />
              <p id="sc-subtitle-hint" className="mt-1.5 text-xs text-muted-foreground">Links the card to that category. Saved in capitals.</p>
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="sc-desc" className="mb-2 block text-sm font-medium text-foreground/80">
                Description <span aria-hidden="true" className="text-status-danger-fg">*</span>
              </Label>
              <Textarea
                id="sc-desc"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Classical formulations, clean ingredients."
                rows={3}
                required
              />
            </div>

            {/* CTA text */}
            <div>
              <Label htmlFor="sc-cta" className="mb-2 block text-sm font-medium text-foreground/80">
                Button text
              </Label>
              <Input
                id="sc-cta"
                type="text"
                value={formData.cta}
                onChange={(e) => setFormData({ ...formData, cta: e.target.value })}
                placeholder="e.g., Shop the range"
              />
            </div>

            {/* Order and status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sc-order" className="mb-2 block text-sm font-medium text-foreground/80">
                  Display order
                </Label>
                <Input
                  id="sc-order"
                  type="number"
                  inputMode="numeric"
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) })}
                  min="1"
                  className="tabular-nums"
                  required
                />
              </div>

              <div>
                <Label htmlFor="sc-status" className="mb-2 block text-sm font-medium text-foreground/80">
                  Status
                </Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v as 'active' | 'inactive' })}
                >
                  <SelectTrigger id="sc-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Live</SelectItem>
                    <SelectItem value="inactive">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={resetForm} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner />}
                {isSubmitting
                  ? editingShowcase ? 'Saving' : 'Creating'
                  : editingShowcase ? 'Save showcase' : 'Create showcase'}
              </Button>
            </div>
          </form>
        </motion.section>
      )}

      {/* Showcase list */}
      <section aria-labelledby="showcase-list-title" className="overflow-hidden rounded-card border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="showcase-list-title" className="text-base font-semibold text-foreground">
              All showcases <span className="font-normal tabular-nums text-muted-foreground">({showcases.length})</span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">These appear in the category showcase section on the home page.</p>
          </div>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as 'grid' | 'table')}
            aria-label="Showcase view"
            className="shrink-0"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view" size="sm" className="w-9 px-0">
              <LayoutGrid aria-hidden="true" className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="List view" size="sm" className="w-9 px-0">
              <List aria-hidden="true" className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {showcases.length === 0 ? (
          <div className="m-4 rounded-card border border-dashed border-border px-4 py-12 sm:m-6">
            <EmptyState
              icon={LayoutPanelTop}
              title="No showcases yet"
              description="Add your first category showcase with Add showcase."
            />
          </div>
        ) : viewMode === 'grid' ? (
          <ul className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            {showcases.map((showcase, index) => (
              <motion.li
                key={showcase.id}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: staggerDelay(index) }}
                className="overflow-hidden rounded-card border border-border"
              >
                <div className="relative aspect-[4/5] bg-muted">
                  <SmartImage src={showcase.imageUrl} alt={showcase.title} className="h-full w-full object-cover" preset="hero" />
                  <span className="absolute right-2 top-2">
                    {showcase.status === 'active'
                      ? <StatusBadge tone="success" icon={Eye} label="Live" />
                      : <StatusBadge tone="neutral" icon={EyeOff} label="Hidden" />}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="truncate font-semibold text-foreground">{showcase.title}</h3>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{categoryName(showcase.subtitle)}</p>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">Position {index + 1}</p>
                  <div className="mt-3 flex items-center justify-end gap-1 border-t border-border pt-3">
                    <IconButton label={`Edit ${showcase.title}`} tooltip="Edit" size="sm" onClick={() => handleEdit(showcase)} className="text-foreground/70">
                      <Edit2 />
                    </IconButton>
                    <IconButton label={`Delete ${showcase.title}`} tooltip="Delete" size="sm" onClick={(e) => { confirmReturnRef.current = e.currentTarget; setShowcaseToDelete(showcase); }} className="text-muted-foreground hover:text-status-danger-fg">
                      <Trash2 />
                    </IconButton>
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-border">
            {showcases.map((showcase, index) => (
              <motion.li
                key={showcase.id}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: staggerDelay(index) }}
                className="p-4 sm:p-6"
              >
                <div className="flex gap-4 sm:gap-6">
                  {/* Image preview */}
                  <div className="h-28 w-24 shrink-0 overflow-hidden rounded-control bg-muted sm:h-40 sm:w-32">
                    <SmartImage
                      src={showcase.imageUrl}
                      alt={showcase.title}
                      className="h-full w-full object-cover" preset="hero" />
                  </div>

                  {/* Info */}
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground">{showcase.title}</h3>
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                          Position {index + 1}
                        </span>
                        {showcase.status === 'active'
                          ? <StatusBadge tone="success" icon={Eye} label="Live" />
                          : <StatusBadge tone="neutral" icon={EyeOff} label="Hidden" />}
                      </div>
                      <p className="mb-1 text-sm font-medium text-foreground/80">
                        {categoryName(showcase.subtitle)}
                      </p>
                      <p className="mb-2 line-clamp-2 text-sm text-foreground/80">
                        {showcase.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Button: {showcase.cta}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 gap-1">
                      <IconButton label={`Edit ${showcase.title}`} tooltip="Edit" onClick={() => handleEdit(showcase)} className="text-foreground/70">
                        <Edit2 />
                      </IconButton>
                      <IconButton label={`Delete ${showcase.title}`} tooltip="Delete" onClick={(e) => { confirmReturnRef.current = e.currentTarget; setShowcaseToDelete(showcase); }} className="text-muted-foreground hover:text-status-danger-fg">
                        <Trash2 />
                      </IconButton>
                    </div>
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        returnFocusRef={confirmReturnRef}
        open={!!showcaseToDelete}
        onOpenChange={(open) => !open && setShowcaseToDelete(null)}
        title={`Delete ${showcaseToDelete?.title ?? 'this showcase'}?`}
        description="It is removed from the home page. This cannot be undone."
        confirmLabel="Delete showcase"
        tone="danger"
        onConfirm={() => (showcaseToDelete ? handleDelete(showcaseToDelete) : undefined)}
      />
    </div>
  );
};

export default AdminShowcases;
