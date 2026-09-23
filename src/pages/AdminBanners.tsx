import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      toast.error('Failed to load banners');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedDesktopFile && !formData.imageUrl) {
      toast.error('Please select a desktop banner image');
      return;
    }

    try {
      setIsSubmitting(true);
      let imageUrl = formData.imageUrl;
      let mobileImageUrl = formData.mobileImageUrl;

      if (selectedDesktopFile) {
        toast.loading('Uploading desktop banner image...', { id: 'upload-desktop' });
        imageUrl = await uploadBannerImage(selectedDesktopFile);
        toast.success('Desktop image uploaded successfully!', { id: 'upload-desktop' });
      }

      if (selectedMobileFile) {
        toast.loading('Uploading mobile banner image...', { id: 'upload-mobile' });
        mobileImageUrl = await uploadBannerImage(selectedMobileFile);
        toast.success('Mobile image uploaded successfully!', { id: 'upload-mobile' });
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
        toast.success('Banner updated successfully!');
      } else {
        await createBanner({
          imageUrl,
          mobileImageUrl,
          redirectLink: formData.redirectLink,
          order: formData.order,
          status: formData.status,
        });
        toast.success('Banner created successfully!');
      }

      // Reset form and reload
      resetForm();
      await loadBanners();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save banner');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (banner: Banner) => {
    if (!confirm('Are you sure you want to delete this banner?')) return;

    try {
      toast.loading('Deleting banner...', { id: 'delete' });
      await deleteBanner(banner.id!, banner.imageUrl);
      toast.success('Banner deleted successfully!', { id: 'delete' });
      await loadBanners();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete banner', { id: 'delete' });
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container-custom max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin')}
              className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Banner Management</h1>
              <p className="text-gray-600 mt-1">Manage homepage carousel banners</p>
            </div>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              Add Banner
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              {editingBanner ? 'Edit Banner' : 'Add New Banner'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Desktop Banner Image
                  </label>
                  <p className="mb-3 text-xs text-gray-500">
                    Use a 16:9 desktop asset (1920 × 1080 is ideal) - the hero shows it whole, uncropped.
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mobile Banner Image <span className="text-gray-400 text-xs">(Optional)</span>
                  </label>
                  <p className="mb-3 text-xs text-gray-500">Use a taller 4:5 mobile crop. If omitted, desktop image is used on mobile.</p>
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

              {/* Redirect Link */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Redirect Link <span className="text-gray-400 text-xs">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.redirectLink}
                  onChange={(e) => setFormData({ ...formData, redirectLink: e.target.value })}
                  placeholder="/shop/necklaces or https://example.com (leave empty for no click action)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Order and Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={formData.order}
                    onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) })}
                    min="1"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {editingBanner ? 'Updating...' : 'Creating...'}
                    </span>
                  ) : (
                    editingBanner ? 'Update Banner' : 'Create Banner'
                  )}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSubmitting}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Banners List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">
              All Banners ({banners.length})
            </h2>
          </div>

          {banners.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">No banners yet. Create your first banner!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {banners.map((banner, index) => (
                <motion.div
                  key={banner.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex gap-6">
                    {/* Image Preview */}
                    <div className="flex flex-shrink-0 gap-3">
                      <div className="w-40 h-24 rounded-lg overflow-hidden bg-gray-100">
                        <SmartImage
                          src={banner.imageUrl}
                          alt="Desktop banner preview"
                          className="w-full h-full object-cover" preset="hero" />
                      </div>
                      <div className="w-20 h-24 rounded-lg overflow-hidden bg-gray-100 border border-dashed border-gray-200">
                        <SmartImage
                          src={banner.mobileImageUrl || banner.imageUrl}
                          alt="Mobile banner preview"
                          className="w-full h-full object-cover" preset="hero" />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-xs font-semibold text-gray-500">
                              Order: {banner.order}
                            </span>
                            <span
                              className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                banner.status === 'active'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {banner.status === 'active' ? (
                                <span className="flex items-center gap-1">
                                  <Eye className="w-3 h-3" />
                                  Active
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <EyeOff className="w-3 h-3" />
                                  Inactive
                                </span>
                              )}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">
                            <span className="font-medium">Link:</span> {banner.redirectLink}
                          </p>
                          <p className="text-xs text-gray-500 mb-1">
                            <span className="font-medium">Mobile image:</span> {banner.mobileImageUrl ? 'Added' : 'Using desktop fallback'}
                          </p>
                          <p className="text-xs text-gray-400">
                            ID: {banner.id}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(banner)}
                            className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-blue-50 hover:border-blue-300 transition-colors"
                          >
                            <Edit2 className="w-4 h-4 text-blue-600" />
                          </button>
                          <button
                            onClick={() => handleDelete(banner)}
                            className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-300 transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminBanners;
