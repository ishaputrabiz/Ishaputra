import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff, Loader2, ArrowLeft, Image as ImageIcon, ChevronUp, ChevronDown } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GalleryImage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({ ...emptyForm });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageMethod, setImageMethod] = useState<'upload' | 'url'>('upload');

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      setImages(await getAllGalleryImages());
    } catch {
      toast.error('Failed to load gallery images');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (imageMethod === 'upload' && !selectedFile && !editing) {
      toast.error('Please select an image');
      return;
    }
    if (imageMethod === 'url' && !imageUrl && !editing) {
      toast.error('Please enter image URL');
      return;
    }

    try {
      setIsSubmitting(true);
      let finalImageUrl = editing?.imageUrl || '';

      if (imageMethod === 'upload' && selectedFile) {
        toast.loading('Uploading image...', { id: 'image-upload' });
        finalImageUrl = await uploadGalleryImage(selectedFile);
        toast.success('Image uploaded!', { id: 'image-upload' });
      } else if (imageMethod === 'url' && imageUrl) {
        finalImageUrl = imageUrl;
      }

      const payload = {
        ...formData,
        imageUrl: finalImageUrl,
      };

      if (editing) {
        await updateGalleryImage(editing.id!, payload);
        toast.success('Gallery image updated!');
      } else {
        await createGalleryImage(payload);
        toast.success('Gallery image added!');
      }
      resetForm();
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save gallery image');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (img: GalleryImage) => {
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
    if (!confirm('Delete this gallery image?')) return;
    try {
      toast.loading('Deleting...', { id: 'del' });
      await deleteGalleryImage(img.id!);
      toast.success('Deleted!', { id: 'del' });
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete', { id: 'del' });
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin')}
              className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <div>
              <h1 className="text-base md:text-3xl font-bold text-gray-900 whitespace-nowrap">Gallery</h1>
              <p className="hidden md:block text-gray-600 mt-1">Manage homepage gallery images (shown below banner)</p>
            </div>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1 px-3 py-2 md:px-6 md:py-3 bg-transparent md:bg-blue-600 border border-blue-600 text-blue-600 md:text-white rounded-lg hover:bg-blue-50 md:hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 md:w-5 md:h-5" />
              <span className="hidden md:inline text-sm font-medium">Add Image</span>
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
              {editing ? 'Edit Gallery Image' : 'Add New Gallery Image'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Image Upload/URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image <span className="text-red-500">*</span>
                </label>
                {/* Tabs */}
                <div className="flex gap-2 mb-4">
                  {(['upload', 'url'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setImageMethod(m)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg capitalize transition-colors ${
                        imageMethod === m
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {m === 'upload' ? 'Upload Image' : 'Image URL'}
                    </button>
                  ))}
                </div>

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
                    <input
                      type="text"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {imageUrl && (
                      <div className="mt-3">
                        <SmartImage
                          src={imageUrl}
                          alt="Preview"
                          className="w-32 h-32 rounded-lg object-cover border-2 border-gray-200"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }} preset="card" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Alt Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description / Alt Text (Optional)
                </label>
                <input
                  type="text"
                  value={formData.alt}
                  onChange={(e) => setFormData({ ...formData, alt: e.target.value })}
                  placeholder="e.g., Gold ring with diamonds"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Order & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Display Order</label>
                  <div className="flex gap-2">
                    <input
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
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, order: (Number(formData.order) || 0) + 1 })}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded transition-colors"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, order: Math.max(1, (Number(formData.order) || 1) - 1) })}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded transition-colors"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
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
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {editing ? 'Updating...' : 'Adding...'}
                    </span>
                  ) : editing ? 'Update Image' : 'Add Image'}
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

        {/* Gallery Grid */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">All Images ({images.length})</h2>
            <p className="text-sm text-gray-500 mt-1">Grid below "Shop The Latest Trends" banner</p>
          </div>

          {images.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No gallery images yet. Add your first one!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-6">
              {images.map((img, index) => (
                <motion.div
                  key={img.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.03 }}
                  className="relative group"
                >
                  <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 border-2 border-gray-200">
                    <SmartImage
                      src={img.imageUrl}
                      alt={img.alt}
                      className="w-full h-full object-cover" preset="tile" />
                    {img.status === 'inactive' && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-xs font-semibold text-white bg-red-500 px-2 py-1 rounded">Inactive</span>
                      </div>
                    )}
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEdit(img)}
                      className="w-8 h-8 rounded-lg bg-white shadow-lg border border-gray-200 flex items-center justify-center hover:bg-blue-50 hover:border-blue-300 transition-colors"
                    >
                      <Edit2 className="w-4 h-4 text-blue-600" />
                    </button>
                    <button
                      onClick={() => handleDelete(img)}
                      className="w-8 h-8 rounded-lg bg-white shadow-lg border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-300 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-gray-600 truncate">{img.alt}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400">Order: {img.order}</span>
                      {img.status === 'active' ? (
                        <Eye className="w-3 h-3 text-green-500" />
                      ) : (
                        <EyeOff className="w-3 h-3 text-gray-400" />
                      )}
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

export default AdminGallery;
