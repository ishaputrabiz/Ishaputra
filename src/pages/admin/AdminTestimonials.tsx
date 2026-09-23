import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff, Loader2, ArrowLeft, Star } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ImageUploader from '@/components/ImageUploader';
import {
  getAllTestimonials,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
  uploadTestimonialAvatar,
  Testimonial,
} from '@/services/testimonialService';
import { toast } from 'sonner';

// Built-in avatar options
import avatar1 from '@/assets/avatars/avatar-1.jpg';
import avatar2 from '@/assets/avatars/avatar-2.jpg';
import avatar3 from '@/assets/avatars/avatar-3.jpg';
import { SmartImage } from "@/components/ui/smart-image";

const BUILT_IN_AVATARS = [
  // Real photos
  { key: 'avatar-1', label: 'Woman 1', src: avatar1 },
  { key: 'avatar-2', label: 'Woman 2', src: avatar2 },
  { key: 'avatar-3', label: 'Woman 3', src: avatar3 },
  { key: 'real-1', label: 'Woman 4', src: 'https://randomuser.me/api/portraits/women/44.jpg' },
  { key: 'real-2', label: 'Woman 5', src: 'https://randomuser.me/api/portraits/women/68.jpg' },
  { key: 'real-3', label: 'Man 1', src: 'https://randomuser.me/api/portraits/men/32.jpg' },
  { key: 'real-4', label: 'Woman 6', src: 'https://randomuser.me/api/portraits/women/90.jpg' },
  { key: 'real-5', label: 'Man 2', src: 'https://randomuser.me/api/portraits/men/75.jpg' },
  { key: 'real-6', label: 'Woman 7', src: 'https://randomuser.me/api/portraits/women/21.jpg' },
  // Animated people
  { key: 'anim-1', label: 'Animated 1', src: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Priya&backgroundColor=ffd5dc' },
  { key: 'anim-2', label: 'Animated 2', src: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Ananya&backgroundColor=d1f4e0' },
  { key: 'anim-3', label: 'Animated 3', src: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Ravi&backgroundColor=dbeafe' },
  { key: 'anim-4', label: 'Animated 4', src: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Meera&backgroundColor=fef9c3' },
  { key: 'anim-5', label: 'Animated 5', src: 'https://api.dicebear.com/9.x/notionists/svg?seed=Diya&backgroundColor=ede9fe' },
  { key: 'anim-6', label: 'Animated 6', src: 'https://api.dicebear.com/9.x/notionists/svg?seed=Arjun&backgroundColor=fce7f3' },
];

// Resolve avatar src for display
const resolveAvatar = (t: Testimonial): string => {
  if (t.avatarType === 'avatar') {
    return BUILT_IN_AVATARS.find((a) => a.key === t.avatarUrl)?.src || avatar1;
  }
  return t.avatarUrl;
};

type AvatarMethod = 'upload' | 'url' | 'avatar';

const emptyForm = {
  title: '',
  quote: '',
  author: '',
  role: '',
  rating: 5,
  order: 1,
  status: 'active' as 'active' | 'inactive',
};

const AdminTestimonials = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({ ...emptyForm });
  const [avatarMethod, setAvatarMethod] = useState<AvatarMethod>('avatar');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('avatar-1');
  const [urlError, setUrlError] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      setTestimonials(await getAllTestimonials());
    } catch {
      toast.error('Failed to load testimonials');
    } finally {
      setLoading(false);
    }
  };

  const resolveAvatarUrl = async (): Promise<string> => {
    if (avatarMethod === 'upload' && selectedFile) {
      return await uploadTestimonialAvatar(selectedFile);
    }
    if (avatarMethod === 'url') return avatarUrl;
    return selectedAvatar; // store the key, component resolves it
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.quote || !formData.author) {
      toast.error('Please fill all required fields');
      return;
    }
    if (avatarMethod === 'upload' && !selectedFile && !editing) {
      toast.error('Please select a profile image');
      return;
    }
    if (avatarMethod === 'url' && !avatarUrl && !editing) {
      toast.error('Please enter avatar URL');
      return;
    }

    try {
      setIsSubmitting(true);
      let finalAvatarUrl = editing?.avatarUrl || selectedAvatar;

      if (avatarMethod === 'upload' && selectedFile) {
        toast.loading('Uploading image...', { id: 'avatar-upload' });
        finalAvatarUrl = await uploadTestimonialAvatar(selectedFile);
        toast.success('Image uploaded!', { id: 'avatar-upload' });
      } else if (avatarMethod === 'url' && avatarUrl) {
        finalAvatarUrl = avatarUrl;
      } else if (avatarMethod === 'avatar') {
        finalAvatarUrl = selectedAvatar;
      }

      const payload = {
        ...formData,
        avatarType: avatarMethod,
        avatarUrl: finalAvatarUrl,
      };

      if (editing) {
        await updateTestimonial(editing.id!, payload);
        toast.success('Testimonial updated!');
      } else {
        await createTestimonial(payload);
        toast.success('Testimonial created!');
      }
      resetForm();
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save testimonial');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (t: Testimonial) => {
    setEditing(t);
    setFormData({
      title: t.title,
      quote: t.quote,
      author: t.author,
      role: t.role,
      rating: t.rating,
      order: t.order,
      status: t.status,
    });
    setAvatarMethod(t.avatarType);
    if (t.avatarType === 'avatar') setSelectedAvatar(t.avatarUrl);
    else if (t.avatarType === 'url') setAvatarUrl(t.avatarUrl);
    setUrlError(false);
    setShowForm(true);
  };

  const handleDelete = async (t: Testimonial) => {
    if (!confirm('Delete this testimonial?')) return;
    try {
      toast.loading('Deleting...', { id: 'del' });
      await deleteTestimonial(t.id!);
      toast.success('Deleted!', { id: 'del' });
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete', { id: 'del' });
    }
  };

  const resetForm = () => {
    setEditing(null);
    setSelectedFile(null);
    setAvatarUrl('');
    setSelectedAvatar('avatar-1');
    setAvatarMethod('avatar');
    setUrlError(false);
    setFormData({ ...emptyForm, order: testimonials.length + 1 });
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
              <h1 className="text-base md:text-3xl font-bold text-gray-900 whitespace-nowrap">Testimonials</h1>
              <p className="hidden md:block text-gray-600 mt-1">Manage "What Our Clients Say" section</p>
            </div>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1 px-3 py-2 md:px-6 md:py-3 bg-transparent md:bg-blue-600 border border-blue-600 text-blue-600 md:text-white rounded-lg hover:bg-blue-50 md:hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 md:w-5 md:h-5" />
              <span className="hidden md:inline text-sm font-medium">Add Testimonial</span>
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
              {editing ? 'Edit Testimonial' : 'Add New Testimonial'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Profile Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Profile Image <span className="text-red-500">*</span>
                </label>
                {/* Tabs */}
                <div className="flex gap-2 mb-4">
                  {(['avatar', 'upload', 'url'] as AvatarMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAvatarMethod(m)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg capitalize transition-colors ${
                        avatarMethod === m
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {m === 'avatar' ? 'Choose Avatar' : m === 'upload' ? 'Upload' : 'Image URL'}
                    </button>
                  ))}
                </div>

                {/* Avatar picker */}
                {avatarMethod === 'avatar' && (
                  <div className="flex gap-4 flex-wrap">
                    {BUILT_IN_AVATARS.map((av) => (
                      <button
                        key={av.key}
                        type="button"
                        onClick={() => setSelectedAvatar(av.key)}
                        className={`relative rounded-full overflow-hidden transition-all ${
                          selectedAvatar === av.key
                            ? 'ring-4 ring-blue-500 ring-offset-2 scale-110'
                            : 'ring-2 ring-gray-200 hover:ring-blue-300'
                        }`}
                      >
                        <img src={av.src} alt={av.label} className="w-16 h-16 object-cover rounded-full" />
                        {selectedAvatar === av.key && (
                          <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center rounded-full">
                            <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Upload */}
                {avatarMethod === 'upload' && (
                  <ImageUploader
                    key={editing?.id || 'new-avatar'}
                    onImageSelected={setSelectedFile}
                    existingImageUrl={editing?.avatarType === 'upload' ? editing.avatarUrl : undefined}
                    onRemove={() => setSelectedFile(null)}
                    isUploading={isSubmitting}
                  />
                )}

                {/* URL */}
                {avatarMethod === 'url' && (
                  <div>
                    <input
                      type="text"
                      value={avatarUrl}
                      onChange={(e) => { setAvatarUrl(e.target.value); setUrlError(false); }}
                      placeholder="https://example.com/profile.jpg"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {avatarUrl && (
                      <div className="mt-3 flex items-center gap-3">
                        {!urlError ? (
                          <SmartImage
                            src={avatarUrl}
                            alt="Preview"
                            className="w-14 h-14 rounded-full object-cover border-2 border-gray-200"
                            onError={() => setUrlError(true)} preset="thumb" />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center text-red-400 text-xs text-center leading-tight px-1">
                            Invalid URL
                          </div>
                        )}
                        <p className="text-xs text-gray-500">{urlError ? 'Could not load image from this URL.' : 'Preview'}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Star Rating */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rating <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFormData({ ...formData, rating: star })}
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-8 h-8 transition-colors ${
                          star <= formData.rating
                            ? 'fill-orange-400 text-orange-400'
                            : 'fill-gray-200 text-gray-200'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-sm text-gray-600 font-medium">{formData.rating} / 5</span>
                </div>
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
                  placeholder='e.g., "Charming Golden Jewellery"'
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Quote / Review */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Review / Bio <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.quote}
                  onChange={(e) => setFormData({ ...formData, quote: e.target.value })}
                  placeholder="Customer review text..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Author & Role */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.author}
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                    placeholder="e.g., Saanvi Iyer"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Role / Label</label>
                  <input
                    type="text"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="e.g., Verified Buyer"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Order & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Display Order</label>
                  <input
                    type="number"
                    value={formData.order}
                    onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 1 })}
                    min="1"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
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

              {/* Preview Card */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Preview</label>
                <div className="bg-white rounded-2xl p-6 shadow-md border border-border/30 max-w-sm" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  <div className="flex items-center gap-1 mb-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className={`w-4 h-4 ${i <= formData.rating ? 'fill-orange-400 text-orange-400' : 'fill-gray-200 text-gray-200'}`} />
                    ))}
                  </div>
                  <h4 className="text-base font-semibold mb-2 text-gray-900">
                    {formData.title ? `" ${formData.title} "` : '" Card Title "'}
                  </h4>
                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                    {formData.quote || 'Customer review will appear here...'}
                  </p>
                  <div className="flex items-center gap-3">
                    {avatarMethod === 'avatar' ? (
                      <img src={BUILT_IN_AVATARS.find(a => a.key === selectedAvatar)?.src || avatar1} alt="avatar" className="w-10 h-10 rounded-full object-cover" />
                    ) : avatarMethod === 'url' && avatarUrl && !urlError ? (
                      <SmartImage src={avatarUrl} alt="avatar" className="w-10 h-10 rounded-full object-cover" preset="thumb" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs font-bold">
                        {formData.author ? formData.author[0].toUpperCase() : '?'}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{formData.author || 'Customer Name'}</p>
                      <p className="text-xs text-gray-500">{formData.role || 'Role'}</p>
                    </div>
                  </div>
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
                      {editing ? 'Updating...' : 'Creating...'}
                    </span>
                  ) : editing ? 'Update Testimonial' : 'Create Testimonial'}
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

        {/* List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">All Testimonials ({testimonials.length})</h2>
            <p className="text-sm text-gray-500 mt-1">These appear in the "What Our Clients Say" section</p>
          </div>

          {testimonials.length === 0 ? (
            <div className="p-12 text-center text-gray-500">No testimonials yet. Add your first one!</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {testimonials.map((t, index) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="p-5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex gap-4 items-start">
                    <SmartImage
                      src={resolveAvatar(t)}
                      alt={t.author}
                      className="w-12 h-12 rounded-full object-cover flex-shrink-0" preset="thumb" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-sm text-gray-900 truncate">"{t.title}"</h3>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${t.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {t.status === 'active' ? <span className="flex items-center gap-1"><Eye className="w-3 h-3" />Active</span> : <span className="flex items-center gap-1"><EyeOff className="w-3 h-3" />Inactive</span>}
                        </span>
                        <span className="text-xs text-gray-400">Order: {t.order}</span>
                      </div>
                      {/* Stars */}
                      <div className="flex gap-0.5 mb-1">
                        {[1,2,3,4,5].map((i) => (
                          <Star key={i} className={`w-3 h-3 ${i <= t.rating ? 'fill-orange-400 text-orange-400' : 'fill-gray-200 text-gray-200'}`} />
                        ))}
                      </div>
                      <p className="text-xs text-gray-600 font-medium">{t.author} · {t.role}</p>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{t.quote}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => handleEdit(t)} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-blue-50 hover:border-blue-300 transition-colors">
                        <Edit2 className="w-4 h-4 text-blue-600" />
                      </button>
                      <button onClick={() => handleDelete(t)} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-300 transition-colors">
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
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

export default AdminTestimonials;
