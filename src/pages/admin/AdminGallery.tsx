import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff, ArrowLeft, Image as ImageIcon, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useAuth } from '@/contexts/AuthContext';
import ImageUploader from '@/components/ImageUploader';
import {
  getAllGalleryImages,
  createGalleryImage,
  updateGalleryImage,
  deleteGalleryImage,
  uploadGalleryImage,
  GalleryImage,
} from '@/services/galleryService';
import { toast } from 'sonner';
import { SmartImage } from "@/components/ui/smart-image";

const emptyForm = {
  alt: '',
  order: 1,
  status: 'active' as 'active' | 'inactive',
};

const AdminGallery = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const confirmReturnRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GalleryImage | null>(null);
  // Focus moves to the form when it opens and back to the opener when it closes.
  const { headingRef: formHeadingRef, addButtonRef, rememberOpener } = useInlineFormFocus(showForm, editing?.id);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({ ...emptyForm });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageMethod, setImageMethod] = useState<'upload' | 'url'>('upload');
  const [toDelete, setToDelete] = useState<GalleryImage | null>(null);

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      setImages(await getAllGalleryImages());
    } catch {
      toast.error('Could not load gallery images');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (imageMethod === 'upload' && !selectedFile && !editing) {
      toast.error('Choose an image');
      return;
    }
    if (imageMethod === 'url' && !imageUrl && !editing) {
      toast.error('Paste the image URL');
      return;
    }

    try {
      setIsSubmitting(true);
      let finalImageUrl = editing?.imageUrl || '';

      if (imageMethod === 'upload' && selectedFile) {
        toast.loading('Uploading the image', { id: 'image-upload' });
        finalImageUrl = await uploadGalleryImage(selectedFile);
        toast.success('Image uploaded', { id: 'image-upload' });
      } else if (imageMethod === 'url' && imageUrl) {
        finalImageUrl = imageUrl;
      }

      const payload = {
        ...formData,
        imageUrl: finalImageUrl,
      };

      if (editing) {
        await updateGalleryImage(editing.id!, payload);
        toast.success('Image saved');
      } else {
        await createGalleryImage(payload);
        toast.success('Image added');
      }
      resetForm();
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Could not save gallery image');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (img: GalleryImage) => {
    rememberOpener();
    setEditing(img);
    setFormData({
      alt: img.alt,
      order: img.order,
      status: img.status,
    });
    setImageUrl(img.imageUrl);
    setImageMethod('url');
    setShowForm(true);
  };

  const handleDelete = async (img: GalleryImage) => {
    try {
      toast.loading('Deleting the image', { id: 'del' });
      await deleteGalleryImage(img.id!);
      toast.success('Image deleted', { id: 'del' });
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Could not delete the image', { id: 'del' });
    }
  };

  const resetForm = () => {
    setEditing(null);
    setSelectedFile(null);
    setImageUrl('');
    setImageMethod('upload');
    setFormData({ ...emptyForm, order: images.length + 1 });
    setShowForm(false);
  };

  const header = (
    <AdminPageHeader
      title="Gallery"
      description="Grid shown on the home page."
      leading={
        <IconButton label="Back to dashboard" tooltip onClick={() => navigate('/admin')}>
          <ArrowLeft />
        </IconButton>
      }
      actions={
        !showForm && (
          <Button ref={addButtonRef} onClick={() => setShowForm(true)}>
            <Plus aria-hidden="true" />
            Add image
          </Button>
        )
      }
    />
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        {header}
        <MediaGridSkeleton count={12} className="md:grid-cols-3 lg:grid-cols-6" label="Loading gallery" />
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
          aria-labelledby="gallery-form-title"
          className="mb-8 rounded-card border border-border bg-card p-4 shadow-sm sm:p-6"
        >
          <h2 ref={formHeadingRef} tabIndex={-1} id="gallery-form-title" className="mb-6 text-lg font-semibold text-foreground">
            {editing ? 'Edit gallery image' : 'Add gallery image'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Image upload or URL */}
            <div>
              <p className="mb-2 block text-sm font-medium text-foreground/80">
                Image <span aria-hidden="true" className="text-status-danger-fg">*</span>
              </p>
              <ToggleGroup
                type="single"
                value={imageMethod}
                onValueChange={(v) => v && setImageMethod(v as 'upload' | 'url')}
                aria-label="How to add the image"
                className="mb-4"
              >
                <ToggleGroupItem value="upload" size="sm">Upload image</ToggleGroupItem>
                <ToggleGroupItem value="url" size="sm">Image URL</ToggleGroupItem>
              </ToggleGroup>

              {imageMethod === 'upload' ? (
                <ImageUploader
                  key={editing?.id || 'new'}
                  onImageSelected={setSelectedFile}
                  existingImageUrl={editing?.imageUrl}
                  onRemove={() => setSelectedFile(null)}
                  isUploading={isSubmitting}
                />
              ) : (
                <div>
                  <Input
                    type="text"
                    aria-label="Image URL"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                  />
                  {imageUrl && (
                    <div className="mt-3">
                      <SmartImage
                        src={imageUrl}
                        alt="Preview"
                        className="h-32 w-32 rounded-card border border-border object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }} preset="card" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Alt text */}
            <div>
              <Label htmlFor="gl-alt" className="mb-2 block text-sm font-medium text-foreground/80">
                Description <span className="font-normal text-muted-foreground">(optional, read aloud by screen readers)</span>
              </Label>
              <Input
                id="gl-alt"
                type="text"
                value={formData.alt}
                onChange={(e) => setFormData({ ...formData, alt: e.target.value })}
                placeholder="e.g., Beard oil on a stone plinth"
              />
            </div>

            {/* Order and status */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="gl-order" className="mb-2 block text-sm font-medium text-foreground/80">Display order</Label>
                <div className="flex gap-2">
                  <Input
                    id="gl-order"
                    type="text"
                    inputMode="numeric"
                    value={formData.order}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Allow empty or valid numbers
                      if (val === '' || /^\d+$/.test(val)) {
                        setFormData({ ...formData, order: val === '' ? '' as any : parseInt(val) });
                      }
                    }}
                    onBlur={(e) => {
                      const val = e.target.value;
                      if (val === '' || parseInt(val) < 1 || isNaN(parseInt(val))) {
                        setFormData({ ...formData, order: 1 });
                      }
                    }}
                    placeholder="1"
                    className="flex-1 tabular-nums"
                  />
                  <IconButton
                    label="Increase order number"
                    variant="solid"
                    onClick={() => setFormData({ ...formData, order: (Number(formData.order) || 0) + 1 })}
                  >
                    <ChevronUp />
                  </IconButton>
                  <IconButton
                    label="Decrease order number"
                    variant="solid"
                    onClick={() => setFormData({ ...formData, order: Math.max(1, (Number(formData.order) || 1) - 1) })}
                  >
                    <ChevronDown />
                  </IconButton>
                </div>
              </div>
              <div>
                <Label htmlFor="gl-status" className="mb-2 block text-sm font-medium text-foreground/80">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v as 'active' | 'inactive' })}
                >
                  <SelectTrigger id="gl-status"><SelectValue /></SelectTrigger>
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
                  ? editing ? 'Saving' : 'Adding'
                  : editing ? 'Save image' : 'Add image'}
              </Button>
            </div>
          </form>
        </motion.section>
      )}

      {/* Gallery grid */}
      <section aria-labelledby="gallery-list-title" className="overflow-hidden rounded-card border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 id="gallery-list-title" className="text-base font-semibold text-foreground">
            All images <span className="font-normal tabular-nums text-muted-foreground">({images.length})</span>
          </h2>
        </div>

        {images.length === 0 ? (
          <div className="m-4 rounded-card border border-dashed border-border px-4 py-12 sm:m-6">
            <EmptyState
              icon={ImageIcon}
              title="No gallery images yet"
              description="Add your first image with Add image."
            />
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 p-4 sm:p-6 md:grid-cols-3 lg:grid-cols-6">
            {images.map((img, index) => (
              <motion.li
                key={img.id}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: staggerDelay(index) }}
                className="group relative"
              >
                <div className="relative aspect-square overflow-hidden rounded-card border border-border bg-muted">
                  <SmartImage
                    src={img.imageUrl}
                    alt={img.alt}
                    className={`h-full w-full object-cover ${img.status === 'inactive' ? 'opacity-50' : ''}`} preset="tile" />
                  {img.status === 'inactive' && (
                    <span className="absolute bottom-2 left-2">
                      <StatusBadge tone="neutral" icon={EyeOff} label="Hidden" />
                    </span>
                  )}
                  <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-100 transition-opacity duration-hover lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                    <IconButton label={`Edit image ${index + 1}`} variant="solid" size="sm" onClick={() => handleEdit(img)}>
                      <Edit2 />
                    </IconButton>
                    <IconButton label={`Delete image ${index + 1}`} variant="solid" size="sm" onClick={(e) => { confirmReturnRef.current = e.currentTarget; setToDelete(img); }} className="hover:text-status-danger-fg">
                      <Trash2 />
                    </IconButton>
                  </div>
                </div>
                <div className="mt-2">
                  <p className="truncate text-xs text-foreground/80">{img.alt || 'No description'}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">Position {index + 1}</span>
                    {img.status === 'active' && (
                      <Eye aria-label="Live" className="h-3 w-3 text-status-success-fg" />
                    )}
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        returnFocusRef={confirmReturnRef}
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete this gallery image?"
        description="It is removed from the home page grid. This cannot be undone."
        confirmLabel="Delete image"
        tone="danger"
        onConfirm={() => (toDelete ? handleDelete(toDelete) : undefined)}
      />
    </div>
  );
};

export default AdminGallery;
