import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff, Loader2, ArrowLeft, LayoutGrid, List } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingShowcase, setEditingShowcase] = useState<Showcase | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

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
      toast.error('Failed to load showcases');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate image input
    if (imageInputMethod === 'upload' && !selectedFile && !editingShowcase) {
      toast.error('Please select an image');
      return;
    }
    
    if (imageInputMethod === 'url' && !imageUrl && !editingShowcase) {
      toast.error('Please enter an image URL');
      return;
    }

    if (!formData.title || !formData.subtitle || !formData.description) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      setIsSubmitting(true);
      let finalImageUrl = editingShowcase?.imageUrl || '';

      // Upload new image if selected
      if (imageInputMethod === 'upload' && selectedFile) {
        toast.loading('Compressing and uploading image...', { id: 'upload' });
        finalImageUrl = await uploadShowcaseImage(selectedFile);
        toast.success('Image uploaded successfully!', { id: 'upload' });
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
        toast.success('Showcase updated successfully!');
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
        toast.success('Showcase created successfully!');
      }

      // Reset form and reload
      resetForm();
      await loadShowcases();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save showcase');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (showcase: Showcase) => {
    if (!confirm('Are you sure you want to delete this showcase?')) return;

    try {
      toast.loading('Deleting showcase...', { id: 'delete' });
      await deleteShowcase(showcase.id!, showcase.imageUrl);
      toast.success('Showcase deleted successfully!', { id: 'delete' });
      await loadShowcases();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete showcase', { id: 'delete' });
      console.error(error);
    }
  };

  const handleEdit = (showcase: Showcase) => {
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
              <h1 className="text-base md:text-3xl font-bold text-gray-900 whitespace-nowrap">Showcase Management</h1>
              <p className="hidden md:block text-gray-600 mt-1">Manage homepage category showcase section</p>
            </div>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1 px-3 py-2 md:px-6 md:py-3 bg-transparent md:bg-blue-600 border border-blue-600 text-blue-600 md:text-white rounded-lg hover:bg-blue-50 md:hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 md:w-5 md:h-5" />
              <span className="hidden md:inline text-sm font-medium">Add Showcase</span>
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
              {editingShowcase ? 'Edit Showcase' : 'Add New Showcase'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Image Upload or URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Showcase Image <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">Recommended size: 800x1000px (4:5 aspect ratio)</p>
                
                {/* Image Input Method Tabs */}
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setImageInputMethod('upload')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      imageInputMethod === 'upload'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Upload Image
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageInputMethod('url')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      imageInputMethod === 'url'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Image URL
                  </button>
                </div>
                
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
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => {
                        setImageUrl(e.target.value);
                        setImageLoadError(false);
                        setImageLoading(true);
                      }}
                      placeholder="https://example.com/image.jpg"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Enter a direct image URL (must end with .jpg, .jpeg, .png, .webp, or .gif)
                    </p>
                    {imageUrl && (
                      <div className="mt-3 rounded-lg overflow-hidden border-2 border-gray-200 bg-gray-50">
                        {imageLoading && !imageLoadError && (
                          <div className="w-full h-64 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                          </div>
                        )}
                        {imageLoadError && (
                          <div className="w-full h-64 flex flex-col items-center justify-center text-center p-6">
                            <div className="text-red-500 mb-2">
                              <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                            </div>
                            <p className="text-sm text-gray-700 font-medium mb-1">Failed to load image</p>
                            <p className="text-xs text-gray-500">
                              Please enter a direct link to an image file<br />
                              (e.g., https://example.com/image.jpg)
                            </p>
                          </div>
                        )}
                        <SmartImage
                          src={imageUrl}
                          alt="Preview"
                          className={`w-full h-64 object-cover ${imageLoading || imageLoadError ? 'hidden' : 'block'}`}
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., One-Of-A-Kinds"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Subtitle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subtitle <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value.toUpperCase() })}
                  placeholder="e.g., RINGS"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Automatically converts to uppercase</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g., Featuring unique and hand-sourced gemstones from all over the world."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* CTA Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Call to Action Text
                </label>
                <input
                  type="text"
                  value={formData.cta}
                  onChange={(e) => setFormData({ ...formData, cta: e.target.value })}
                  placeholder="e.g., See More Products"
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
                      {editingShowcase ? 'Updating...' : 'Creating...'}
                    </span>
                  ) : (
                    editingShowcase ? 'Update Showcase' : 'Create Showcase'
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

        {/* Showcases List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                All Showcases ({showcases.length})
              </h2>
              <p className="text-sm text-gray-500 mt-1">These appear in the category showcase section on the homepage</p>
            </div>
            <div className="flex border border-gray-200 rounded-md overflow-hidden">
              <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {showcases.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">No showcases yet. Create your first showcase!</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {showcases.map((showcase, index) => (
                <motion.div
                  key={showcase.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="aspect-[4/5] bg-gray-100 relative">
                    <SmartImage src={showcase.imageUrl} alt={showcase.title} className="w-full h-full object-cover" preset="hero" />
                    <span className={`absolute top-2 right-2 px-2 py-1 text-xs font-semibold rounded-full ${showcase.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                      {showcase.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 truncate">{showcase.title}</h3>
                    <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide truncate">{showcase.subtitle}</p>
                    <p className="text-xs text-gray-500 mt-1">Order: {showcase.order}</p>
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                      <button onClick={() => handleEdit(showcase)} className="flex-1 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                        <Edit2 className="w-3 h-3 inline mr-1" /> Edit
                      </button>
                      <button onClick={() => handleDelete(showcase)} className="py-1.5 px-3 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3 h-3 inline" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {showcases.map((showcase, index) => (
                <motion.div
                  key={showcase.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex gap-6">
                    {/* Image Preview */}
                    <div className="w-32 h-40 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                      <SmartImage
                        src={showcase.imageUrl}
                        alt={showcase.title}
                        className="w-full h-full object-cover" preset="hero" />
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{showcase.title}</h3>
                            <span className="text-xs font-semibold text-gray-500 px-2 py-1 bg-gray-100 rounded">
                              Order: {showcase.order}
                            </span>
                            <span
                              className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                showcase.status === 'active'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {showcase.status === 'active' ? (
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
                          <p className="text-sm font-medium text-gray-600 mb-1 uppercase tracking-wide">
                            {showcase.subtitle}
                          </p>
                          <p className="text-sm text-gray-600 mb-2">
                            {showcase.description}
                          </p>
                          <p className="text-xs text-gray-500">
                            CTA: {showcase.cta}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(showcase)}
                            className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-blue-50 hover:border-blue-300 transition-colors"
                          >
                            <Edit2 className="w-4 h-4 text-blue-600" />
                          </button>
                          <button
                            onClick={() => handleDelete(showcase)}
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

export default AdminShowcases;
