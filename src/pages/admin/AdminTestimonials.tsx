import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff, ArrowLeft, Star, ImageOff, Quote, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { IconButton } from '@/components/ui/icon-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Notice } from '@/components/ui/notice';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListSkeleton } from '@/components/skeletons';
import { fadeUp, staggerDelay } from '@/lib/motion';
import { plural } from '@/lib/format';
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

import { SmartImage } from "@/components/ui/smart-image";

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
  const confirmReturnRef = useRef<HTMLElement | null>(null);
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
  const [toDelete, setToDelete] = useState<Testimonial | null>(null);

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      setTestimonials(await getAllTestimonials());
    } catch {
      toast.error('Could not load testimonials');
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
      toast.error('Fill in the title, review and customer name');
      return;
    }
    if (avatarMethod === 'upload' && !selectedFile && !editing) {
      toast.error('Choose a profile picture');
      return;
    }
    if (avatarMethod === 'url' && !avatarUrl && !editing) {
      toast.error('Paste the profile picture URL');
      return;
    }

    try {
      setIsSubmitting(true);
      let finalAvatarUrl = editing?.avatarUrl || selectedAvatar;

      if (avatarMethod === 'upload' && selectedFile) {
        toast.loading('Uploading the picture', { id: 'avatar-upload' });
        finalAvatarUrl = await uploadTestimonialAvatar(selectedFile);
        toast.success('Picture uploaded', { id: 'avatar-upload' });
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
        toast.success('Testimonial saved');
      } else {
        await createTestimonial(payload);
        toast.success('Testimonial created');
      }
      resetForm();
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Could not save testimonial');
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
    try {
      toast.loading('Deleting the testimonial', { id: 'del' });
      await deleteTestimonial(t.id!);
      toast.success('Testimonial deleted', { id: 'del' });
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Could not delete the testimonial', { id: 'del' });
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

  const header = (
    <AdminPageHeader
      title="Testimonials"
      description="The customer reviews section on the home page."
      leading={
        <IconButton label="Back to dashboard" tooltip onClick={() => navigate('/admin')}>
          <ArrowLeft />
        </IconButton>
      }
      actions={
        !showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus aria-hidden="true" />
            Add testimonial
          </Button>
        )
      }
    />
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        {header}
        <ListSkeleton rows={3} thumb label="Loading testimonials" />
      </div>
    );
  }

  const METHOD_LABEL: Record<AvatarMethod, string> = { avatar: 'Initial', upload: 'Upload', url: 'Image URL' };

  return (
    <div className="mx-auto max-w-6xl">
      {header}

      {/* Form */}
      {showForm && (
        <motion.section
          {...fadeUp}
          aria-labelledby="testimonial-form-title"
          className="mb-8 rounded-card border border-border bg-card p-4 shadow-sm sm:p-6"
        >
          <h2 id="testimonial-form-title" className="mb-6 text-lg font-semibold text-foreground">
            {editing ? 'Edit testimonial' : 'Add testimonial'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Profile image */}
            <div>
              <p className="mb-2 block text-sm font-medium text-foreground/80">
                Profile picture
              </p>
              <ToggleGroup
                type="single"
                value={avatarMethod}
                onValueChange={(v) => v && setAvatarMethod(v as AvatarMethod)}
                aria-label="Profile picture source"
                className="mb-4"
              >
                {(['avatar', 'upload', 'url'] as AvatarMethod[]).map((m) => (
                  <ToggleGroupItem key={m} value={m} size="sm">{METHOD_LABEL[m]}</ToggleGroupItem>
                ))}
              </ToggleGroup>

              {/* Initial monogram */}
              {avatarMethod === 'avatar' && (
                <div className="flex items-center gap-3">
                  <Monogram name={formData.author} className="h-14 w-14 text-lg" />
                  <p className="text-xs text-muted-foreground">Shows the first letter of the customer&rsquo;s name. No photo needed.</p>
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
                  <Input
                    type="text"
                    aria-label="Profile picture URL"
                    value={avatarUrl}
                    onChange={(e) => { setAvatarUrl(e.target.value); setUrlError(false); }}
                    placeholder="https://example.com/profile.jpg"
                  />
                  {avatarUrl && (
                    <div className="mt-3 flex items-center gap-3">
                      {!urlError ? (
                        <SmartImage
                          src={avatarUrl}
                          alt="Preview"
                          className="h-14 w-14 rounded-full border border-border object-cover"
                          onError={() => setUrlError(true)} preset="thumb" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-status-danger-line bg-status-danger-bg text-status-danger-fg">
                          <ImageOff aria-hidden="true" className="h-5 w-5" />
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">{urlError ? 'This image did not load. Check the link.' : 'Preview'}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Star rating */}
            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-foreground/80">
                Rating <span aria-hidden="true" className="text-status-danger-fg">*</span>
              </legend>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    aria-pressed={formData.rating === star}
                    aria-label={plural(star, 'star')}
                    onClick={() => setFormData({ ...formData, rating: star })}
                    className="rounded-control p-1 transition-transform duration-press ease-out active:scale-[0.97]"
                  >
                    <Star
                      aria-hidden="true"
                      className={`h-7 w-7 transition-colors duration-hover ${
                        star <= formData.rating
                          ? 'fill-primary text-primary'
                          : 'fill-muted text-muted-foreground'
                      }`}
                    />
                  </button>
                ))}
                <span className="ml-2 text-sm font-medium tabular-nums text-foreground/80">{formData.rating} / 5</span>
              </div>
            </fieldset>

            {/* Title */}
            <div>
              <Label htmlFor="tm-title" className="mb-2 block text-sm font-medium text-foreground/80">
                Title <span aria-hidden="true" className="text-status-danger-fg">*</span>
              </Label>
              <Input
                id="tm-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., “Real energy, no crash”"
                required
              />
            </div>

            {/* Quote */}
            <div>
              <Label htmlFor="tm-quote" className="mb-2 block text-sm font-medium text-foreground/80">
                Review <span aria-hidden="true" className="text-status-danger-fg">*</span>
              </Label>
              <Textarea
                id="tm-quote"
                value={formData.quote}
                onChange={(e) => setFormData({ ...formData, quote: e.target.value })}
                placeholder="What the customer said, in their words"
                rows={3}
                required
              />
            </div>

            {/* Author and role */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="tm-author" className="mb-2 block text-sm font-medium text-foreground/80">
                  Customer name <span aria-hidden="true" className="text-status-danger-fg">*</span>
                </Label>
                <Input
                  id="tm-author"
                  type="text"
                  autoComplete="off"
                  value={formData.author}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  placeholder="e.g., Arjun M."
                  required
                />
              </div>
              <div>
                <Label htmlFor="tm-role" className="mb-2 block text-sm font-medium text-foreground/80">Role or label</Label>
                <Input
                  id="tm-role"
                  type="text"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  placeholder="e.g., Verified buyer"
                />
              </div>
            </div>

            {/* Order and status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tm-order" className="mb-2 block text-sm font-medium text-foreground/80">Display order</Label>
                <Input
                  id="tm-order"
                  type="number"
                  inputMode="numeric"
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 1 })}
                  min="1"
                  className="tabular-nums"
                />
              </div>
              <div>
                <Label htmlFor="tm-status" className="mb-2 block text-sm font-medium text-foreground/80">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v as 'active' | 'inactive' })}
                >
                  <SelectTrigger id="tm-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preview card */}
            <div>
              <p className="mb-2 block text-sm font-medium text-foreground/80">Preview</p>
              <div className="max-w-sm rounded-card border border-border bg-background p-6 shadow-sm">
                <div className="mb-3 flex items-center gap-1" aria-label={`${formData.rating} out of 5 stars`} role="img">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} aria-hidden="true" className={`h-4 w-4 ${i <= formData.rating ? 'fill-primary text-primary' : 'fill-muted text-muted-foreground'}`} />
                  ))}
                </div>
                <h3 className="mb-2 text-base font-semibold text-foreground">
                  {formData.title ? `“${formData.title}”` : '“Card title”'}
                </h3>
                <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                  {formData.quote || 'The review appears here.'}
                </p>
                <div className="flex items-center gap-3">
                  {avatarMethod === 'url' && avatarUrl && !urlError ? (
                    <SmartImage src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" preset="thumb" />
                  ) : (
                    <Monogram name={formData.author} className="h-10 w-10 text-sm" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">{formData.author || 'Customer name'}</p>
                    <p className="text-xs text-muted-foreground">{formData.role || 'Role'}</p>
                  </div>
                </div>
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
                  ? editing ? 'Saving' : 'Creating'
                  : editing ? 'Save testimonial' : 'Create testimonial'}
              </Button>
            </div>
          </form>
        </motion.section>
      )}

      {/* List */}
      <section aria-labelledby="testimonial-list-title" className="overflow-hidden rounded-card border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 id="testimonial-list-title" className="text-base font-semibold text-foreground">
            All testimonials <span className="font-normal tabular-nums text-muted-foreground">({testimonials.length})</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">These appear in the customer reviews section on the home page.</p>
        </div>

        {testimonials.some((t) => t.demo) && (
          <Notice tone="warning" className="m-4 sm:mx-6" role="note">
            Testimonials marked Demo are placeholders from the preview store. Replace them with real customer reviews, or switch them off, before launch.
          </Notice>
        )}

        {testimonials.length === 0 ? (
          <div className="px-4 py-12">
            <EmptyState
              icon={Quote}
              title="No testimonials yet"
              description="Add a real customer review."
              action={!showForm ? { label: 'Add testimonial', onClick: () => setShowForm(true) } : undefined}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {testimonials.map((t, index) => (
              <motion.li
                key={t.id}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: staggerDelay(index) }}
                className="p-4 sm:p-5"
              >
                <div className="flex items-start gap-4">
                  {t.avatarType === 'avatar' ? (
                    <Monogram name={t.author} className="h-12 w-12 shrink-0 text-base" />
                  ) : (
                    <SmartImage
                      src={t.avatarUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover" preset="thumb" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">“{t.title}”</h3>
                      {t.status === 'active'
                        ? <StatusBadge tone="success" icon={Eye} label="Active" />
                        : <StatusBadge tone="neutral" icon={EyeOff} label="Inactive" />}
                      {t.demo && <StatusBadge tone="neutral" icon={FlaskConical} label="Demo" title="Placeholder from the preview store" />}
                      <span className="text-xs tabular-nums text-muted-foreground">Position {index + 1}</span>
                    </div>
                    {/* Stars */}
                    <div className="mb-1 flex gap-0.5" role="img" aria-label={`${t.rating} out of 5 stars`}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} aria-hidden="true" className={`h-3 w-3 ${i <= t.rating ? 'fill-primary text-primary' : 'fill-muted text-muted-foreground'}`} />
                      ))}
                    </div>
                    <p className="text-xs font-medium text-foreground/80">{t.author}{t.role ? ` · ${t.role}` : ''}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.quote}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <IconButton label={`Edit testimonial from ${t.author}`} tooltip="Edit" size="sm" onClick={() => handleEdit(t)} className="text-foreground/70">
                      <Edit2 />
                    </IconButton>
                    <IconButton label={`Delete testimonial from ${t.author}`} tooltip="Delete" size="sm" onClick={(e) => { confirmReturnRef.current = e.currentTarget; setToDelete(t); }} className="text-muted-foreground hover:text-status-danger-fg">
                      <Trash2 />
                    </IconButton>
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
        title={`Delete the testimonial from ${toDelete?.author ?? 'this customer'}?`}
        description="It is removed from the home page. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => (toDelete ? handleDelete(toDelete) : undefined)}
      />
    </div>
  );
};

/** A round initial in place of a stock photo. */
const Monogram = ({ name, className = '' }: { name?: string; className?: string }) => (
  <span
    aria-hidden="true"
    className={`inline-flex items-center justify-center rounded-full bg-muted font-semibold text-foreground ${className}`}
  >
    {(name || '?').trim().charAt(0).toUpperCase() || '?'}
  </span>
);

export default AdminTestimonials;
