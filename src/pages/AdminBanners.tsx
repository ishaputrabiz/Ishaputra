import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff, ArrowLeft, Copy, GalleryHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { IconButton } from '@/components/ui/icon-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListSkeleton } from '@/components/skeletons';
import { fadeUp, staggerDelay } from '@/lib/motion';
import { useAuth } from '@/contexts/AuthContext';
import ImageUploader from '@/components/ImageUploader';
import { 
  getAllBanners, 
  createBanner, 
  updateBanner, 
  deleteBanner,
  uploadBannerImage,
  Banner 
} from '@/services/bannerService';
import { toast } from 'sonner';
import { SmartImage } from "@/components/ui/smart-image";

const AdminBanners = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const confirmReturnRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bannerToDelete, setBannerToDelete] = useState<Banner | null>(null);

  // Form state
  const [selectedDesktopFile, setSelectedDesktopFile] = useState<File | null>(null);
  const [selectedMobileFile, setSelectedMobileFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    imageUrl: '',
    mobileImageUrl: '',
    redirectLink: '',
    order: 1,
    status: 'active' as 'active' | 'inactive',
  });

  useEffect(() => {
    // Check if user is admin
    if (!user) {
      navigate('/');
      return;
    }

    loadBanners();
  }, [user, navigate]);

  const loadBanners = async () => {
    try {
      setLoading(true);
      const data = await getAllBanners();
      setBanners(data);
    } catch (error) {
      toast.error('Could not load banners');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedDesktopFile && !formData.imageUrl) {
      toast.error('Choose a desktop banner image');
      return;
    }

    try {
      setIsSubmitting(true);
      let imageUrl = formData.imageUrl;
      let mobileImageUrl = formData.mobileImageUrl;

      if (selectedDesktopFile) {
        toast.loading('Uploading the desktop image', { id: 'upload-desktop' });
        imageUrl = await uploadBannerImage(selectedDesktopFile);
        toast.success('Desktop image uploaded', { id: 'upload-desktop' });
      }

      if (selectedMobileFile) {
        toast.loading('Uploading the mobile image', { id: 'upload-mobile' });
        mobileImageUrl = await uploadBannerImage(selectedMobileFile);
        toast.success('Mobile image uploaded', { id: 'upload-mobile' });
      }

      // Create or update banner
      if (editingBanner) {
        await updateBanner(editingBanner.id!, {
          imageUrl,
          mobileImageUrl,
          redirectLink: formData.redirectLink,
          order: formData.order,
          status: formData.status,
        });
        toast.success('Banner saved');
      } else {
        await createBanner({
          imageUrl,
          mobileImageUrl,
          redirectLink: formData.redirectLink,
          order: formData.order,
          status: formData.status,
        });
        toast.success('Banner created');
      }

      // Reset form and reload
      resetForm();
      await loadBanners();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not save banner');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (banner: Banner) => {
    try {
      toast.loading('Deleting the banner', { id: 'delete' });
      await deleteBanner(banner.id!, banner.imageUrl);
      toast.success('Banner deleted', { id: 'delete' });
      await loadBanners();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not delete banner', { id: 'delete' });
      console.error(error);
    }
  };

  const handleEdit = (banner: Banner) => {
    setEditingBanner(banner);
    setFormData({
      imageUrl: banner.imageUrl,
      mobileImageUrl: banner.mobileImageUrl || '',
      redirectLink: banner.redirectLink,
      order: banner.order,
      status: banner.status,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingBanner(null);
    setSelectedDesktopFile(null);
    setSelectedMobileFile(null);
    setFormData({
      imageUrl: '',
      mobileImageUrl: '',
      redirectLink: '',
      order: banners.length + 1,
      status: 'active',
    });
    setShowForm(false);
  };

  const copyId = async (id?: string) => {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Banner ID copied');
    } catch {
      toast.error('Could not copy the ID');
    }
  };

  const header = (
    <AdminPageHeader
      title="Banners"
      description="Home page carousel banners."
      leading={
        <IconButton label="Back to dashboard" tooltip onClick={() => navigate('/admin')}>
          <ArrowLeft />
        </IconButton>
      }
      actions={
        !showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus aria-hidden="true" />
            Add banner
          </Button>
        )
      }
    />
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        {header}
        <ListSkeleton rows={3} thumb label="Loading banners" />
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
          aria-labelledby="banner-form-title"
          className="mb-8 rounded-card border border-border bg-card p-4 shadow-sm sm:p-6"
        >
          <h2 id="banner-form-title" className="mb-6 text-lg font-semibold text-foreground">
            {editingBanner ? 'Edit banner' : 'Add banner'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-2 block text-sm font-medium text-foreground/80">
                  Desktop banner image
                </p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Use a 16:9 desktop image (1920 × 1080 is ideal). The hero shows it whole, uncropped.
                </p>
                <ImageUploader
                  key={`${editingBanner?.id || 'new'}-desktop`}
                  category="banners"
                  onImageSelected={setSelectedDesktopFile}
                  existingImageUrl={formData.imageUrl || undefined}
                  onRemove={() => {
                    setSelectedDesktopFile(null);
                    setFormData((prev) => ({ ...prev, imageUrl: '' }));
                  }}
                  isUploading={isSubmitting}
                />
              </div>

              <div>
                <p className="mb-2 block text-sm font-medium text-foreground/80">
                  Mobile banner image <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <p className="mb-3 text-xs text-muted-foreground">Use a taller 4:5 mobile crop. Without one, the desktop image is used on mobile.</p>
                <ImageUploader
                  key={`${editingBanner?.id || 'new'}-mobile`}
                  category="banners"
                  onImageSelected={setSelectedMobileFile}
                  existingImageUrl={formData.mobileImageUrl || undefined}
                  onRemove={() => {
                    setSelectedMobileFile(null);
                    setFormData((prev) => ({ ...prev, mobileImageUrl: '' }));
                  }}
                  isUploading={isSubmitting}
                />
              </div>
            </div>

            {/* Redirect link */}
            <div>
              <Label htmlFor="banner-link" className="mb-2 block text-sm font-medium text-foreground/80">
                Link <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="banner-link"
                type="text"
                value={formData.redirectLink}
                onChange={(e) => setFormData({ ...formData, redirectLink: e.target.value })}
                placeholder="/category/hair-care or https://example.com (empty for no link)"
              />
            </div>

            {/* Order and status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="banner-order" className="mb-2 block text-sm font-medium text-foreground/80">
                  Display order
                </Label>
                <Input
                  id="banner-order"
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
                <Label htmlFor="banner-status" className="mb-2 block text-sm font-medium text-foreground/80">
                  Status
                </Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v as 'active' | 'inactive' })}
                >
                  <SelectTrigger id="banner-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
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
                  ? editingBanner ? 'Saving' : 'Creating'
                  : editingBanner ? 'Save banner' : 'Create banner'}
              </Button>
            </div>
          </form>
        </motion.section>
      )}

      {/* Banner list */}
      <section aria-labelledby="banner-list-title" className="overflow-hidden rounded-card border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 id="banner-list-title" className="text-base font-semibold text-foreground">
            All banners <span className="font-normal tabular-nums text-muted-foreground">({banners.length})</span>
          </h2>
        </div>

        {banners.length === 0 ? (
          <div className="px-4 py-12">
            <EmptyState
              icon={GalleryHorizontal}
              title="No banners yet"
              description="Add your first home page banner."
              action={!showForm ? { label: 'Add banner', onClick: () => setShowForm(true) } : undefined}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {banners.map((banner, index) => (
              <motion.li
                key={banner.id}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: staggerDelay(index) }}
                className="p-4 sm:p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
                  {/* Image previews */}
                  <div className="flex shrink-0 gap-3">
                    <div className="h-24 w-40 overflow-hidden rounded-control bg-muted">
                      <SmartImage
                        src={banner.imageUrl}
                        alt={`Banner ${index + 1}, desktop`}
                        className="h-full w-full object-cover" preset="hero" />
                    </div>
                    <div className="h-24 w-20 overflow-hidden rounded-control border border-dashed border-border bg-muted">
                      <SmartImage
                        src={banner.mobileImageUrl || banner.imageUrl}
                        alt={`Banner ${index + 1}, mobile`}
                        className="h-full w-full object-cover" preset="hero" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                          Position {index + 1}
                        </span>
                        {banner.status === 'active' ? (
                          <StatusBadge tone="success" icon={Eye} label="Active" />
                        ) : (
                          <StatusBadge tone="neutral" icon={EyeOff} label="Inactive" />
                        )}
                      </div>
                      <p className="truncate text-sm text-foreground/80">
                        <span className="font-medium">Link:</span> {banner.redirectLink || 'None'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Mobile image:</span> {banner.mobileImageUrl ? 'Added' : 'Using the desktop image'}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 gap-1">
                      <IconButton label="Copy banner ID" tooltip onClick={() => copyId(banner.id)} className="text-muted-foreground">
                        <Copy />
                      </IconButton>
                      <IconButton label={`Edit banner ${index + 1}`} tooltip="Edit" onClick={() => handleEdit(banner)} className="text-foreground/70">
                        <Edit2 />
                      </IconButton>
                      <IconButton label={`Delete banner ${index + 1}`} tooltip="Delete" onClick={(e) => { confirmReturnRef.current = e.currentTarget; setBannerToDelete(banner); }} className="text-muted-foreground hover:text-status-danger-fg">
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
        open={!!bannerToDelete}
        onOpenChange={(open) => !open && setBannerToDelete(null)}
        title={`Delete banner ${bannerToDelete ? banners.indexOf(bannerToDelete) + 1 : ''}?`}
        description="It is removed from the home page carousel. This cannot be undone."
        confirmLabel="Delete banner"
        tone="danger"
        onConfirm={() => (bannerToDelete ? handleDelete(bannerToDelete) : undefined)}
      />
    </div>
  );
};

export default AdminBanners;
