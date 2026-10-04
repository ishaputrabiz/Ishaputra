import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Save,
  Youtube as YoutubeIcon,
  ExternalLink,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Star,
} from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MediaGridSkeleton } from '@/components/skeletons';
import { fadeUp, staggerDelay } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  subscribeHomeVideos,
  createHomeVideo,
  updateHomeVideo,
  deleteHomeVideo,
  extractYouTubeId,
  youtubeThumb,
  type HomeVideo,
} from '@/services/homeContentService';
import { SmartImage } from "@/components/ui/smart-image";

const VideoForm = ({
  initial,
  onSaved,
  closeDialog,
}: {
  initial?: HomeVideo;
  onSaved: () => void;
  closeDialog: () => void;
}) => {
  const [urlInput, setUrlInput] = useState(
    initial?.youtubeUrl || (initial ? `https://youtu.be/${initial.videoId}` : '')
  );
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [featured, setFeatured] = useState<boolean>(initial?.featured ?? false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>(initial?.aspectRatio ?? '16:9');
  const [order, setOrder] = useState(initial?.order ?? 0);
  const [saving, setSaving] = useState(false);

  const videoId = extractYouTubeId(urlInput);
  const thumb = videoId ? youtubeThumb(videoId) : '';

  const handleSave = async () => {
    if (!videoId) {
      toast.error('Paste a YouTube link');
      return;
    }
    if (!title.trim()) {
      toast.error('Add a title');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        youtubeUrl: urlInput.trim(),
        videoId,
        thumbnailUrl: thumb,
        active,
        featured,
        aspectRatio,
        order: Number(order) || 0,
      };
      if (initial?.id) {
        await updateHomeVideo(initial.id, payload);
        toast.success('Video saved');
      } else {
        await createHomeVideo(payload);
        toast.success('Video added');
      }
      onSaved();
      closeDialog();
    } catch (err) {
      console.error(err);
      toast.error('Could not save the video');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="vd-url" className="text-xs font-medium text-foreground/80">YouTube URL</Label>
        <Input
          id="vd-url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="mt-1.5"
        />
        {videoId && (
          <div className="mt-3 aspect-video overflow-hidden rounded-card border border-border">
            <SmartImage src={thumb} alt="Preview" className="h-full w-full object-cover" preset="tile" />
          </div>
        )}
      </div>
      <div>
        <Label htmlFor="vd-title" className="text-xs font-medium text-foreground/80">Title</Label>
        <Input
          id="vd-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., How we make our hair oil"
          className="mt-1.5"
        />
      </div>
      <div>
        <Label htmlFor="vd-desc" className="text-xs font-medium text-foreground/80">Description</Label>
        <Textarea
          id="vd-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A short summary shown beside the player."
          className="mt-1.5"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="vd-order" className="text-xs font-medium text-foreground/80">Display order</Label>
          <Input
            id="vd-order"
            inputMode="numeric"
            type="number"
            value={order}
            onChange={(e) => setOrder(Number(e.target.value))}
            className="mt-1.5 tabular-nums"
          />
        </div>
        <div className="flex items-end gap-2 pb-2.5">
          <Switch id="vd-active" checked={active} onCheckedChange={setActive} />
          <Label htmlFor="vd-active" className="text-sm font-normal text-foreground/80">
            {active ? 'Visible' : 'Hidden'}
          </Label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p id="vd-ratio-label" className="text-xs font-medium text-foreground/80">Aspect ratio</p>
          <ToggleGroup
            type="single"
            value={aspectRatio}
            onValueChange={(v) => v && setAspectRatio(v as '16:9' | '9:16')}
            aria-labelledby="vd-ratio-label"
            className="mt-1.5 grid grid-cols-2"
          >
            <ToggleGroupItem value="16:9" size="sm" className="tabular-nums">Landscape 16:9</ToggleGroupItem>
            <ToggleGroupItem value="9:16" size="sm" className="tabular-nums">Portrait 9:16</ToggleGroupItem>
          </ToggleGroup>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Choose the video&rsquo;s true ratio so it plays without black bars.
          </p>
        </div>
        <div className="flex flex-col">
          <p className="text-xs font-medium text-foreground/80">Featured</p>
          <div className="mt-1.5 flex min-h-11 items-center gap-2 rounded-control border border-border px-3 py-2">
            <Switch id="vd-featured" checked={featured} onCheckedChange={setFeatured} />
            <Label htmlFor="vd-featured" className="text-sm font-normal text-foreground/80">
              {featured ? 'Show in featured spotlight' : 'Not featured'}
            </Label>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Only featured videos appear in the home page hero.
          </p>
        </div>
      </div>

      <DialogFooter className="gap-2 pt-2">
        <Button variant="outline" onClick={closeDialog} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Spinner /> : <Save aria-hidden="true" />}
          {saving ? 'Saving' : 'Save video'}
        </Button>
      </DialogFooter>
    </div>
  );
};

const AdminVideos = () => {
  const [videos, setVideos] = useState<HomeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<HomeVideo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeVideo | null>(null);
  const confirmReturnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const unsub = subscribeHomeVideos((vids) => {
      setVideos(vids);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteHomeVideo(id);
      toast.success('Video deleted');
    } catch {
      toast.error('Could not delete the video');
    }
  };

  const move = async (v: HomeVideo, direction: -1 | 1) => {
    if (!v.id) return;
    const newOrder = (v.order || 0) + direction;
    try {
      await updateHomeVideo(v.id, { order: newOrder });
    } catch {
      toast.error('Could not reorder');
    }
  };

  const addVideoButton = (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" /> Add video
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add YouTube video</DialogTitle>
          <DialogDescription>Paste a YouTube link. The thumbnail is picked up for you.</DialogDescription>
        </DialogHeader>
        <VideoForm onSaved={() => {}} closeDialog={() => setCreateOpen(false)} />
      </DialogContent>
    </Dialog>
  );

  const header = (
    <AdminPageHeader
      eyebrow="Home page"
      title="Video stories"
      description="The YouTube reel on the home page."
      actions={addVideoButton}
      className="pb-0"
    />
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {header}
        <MediaGridSkeleton count={4} className="grid-cols-1 md:grid-cols-2 lg:grid-cols-2 [&>*]:aspect-video" label="Loading videos" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {header}

      {videos.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-card px-4 py-12">
          <EmptyState
            icon={YoutubeIcon}
            title="No videos yet"
            description="Add your first YouTube video with Add video."
          />
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {videos.map((v, index) => (
            <motion.li
              key={v.id}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: staggerDelay(index) }}
              className="overflow-hidden rounded-card border border-border bg-card shadow-sm"
            >
              <div className="relative aspect-video bg-charcoal">
                <img
                  src={v.thumbnailUrl || youtubeThumb(v.videoId)}
                  alt={v.title}
                  className={`h-full w-full object-cover ${!v.active ? 'opacity-40' : ''}`}
                />
                {v.featured && (
                  <span className="absolute left-2 top-2">
                    <StatusBadge tone="info" icon={Star} label="Featured" />
                  </span>
                )}
                <span className="tag-dark absolute right-2 top-2 tabular-nums">
                  {v.aspectRatio || '16:9'}
                </span>
                {!v.active && (
                  <span className="absolute bottom-2 left-2">
                    <StatusBadge tone="neutral" icon={EyeOff} label="Hidden" />
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="line-clamp-1 font-semibold text-foreground">
                  {v.title}
                </h3>
                {v.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{v.description}</p>
                )}
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">Order {v.order ?? 0}</span>
                  <span aria-hidden="true">·</span>
                  <a
                    href={v.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Open on YouTube <ExternalLink aria-hidden="true" className="h-3 w-3" />
                  </a>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                  <div className="flex gap-1">
                    <IconButton label={`Move ${v.title} up`} tooltip="Move up" size="sm" onClick={() => move(v, -1)}>
                      <ArrowUp />
                    </IconButton>
                    <IconButton label={`Move ${v.title} down`} tooltip="Move down" size="sm" onClick={() => move(v, 1)}>
                      <ArrowDown />
                    </IconButton>
                    <IconButton
                      label={v.active ? `Hide ${v.title}` : `Show ${v.title}`}
                      tooltip={v.active ? 'Hide' : 'Show'}
                      size="sm"
                      onClick={() => v.id && updateHomeVideo(v.id, { active: !v.active })}
                    >
                      {v.active ? <Eye /> : <EyeOff />}
                    </IconButton>
                  </div>
                  <div className="flex gap-1">
                    <Dialog
                      open={editing?.id === v.id}
                      onOpenChange={(o) => setEditing(o ? v : null)}
                    >
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Edit video</DialogTitle>
                          <DialogDescription>{v.title}</DialogDescription>
                        </DialogHeader>
                        <VideoForm
                          initial={v}
                          onSaved={() => {}}
                          closeDialog={() => setEditing(null)}
                        />
                      </DialogContent>
                    </Dialog>
                    <IconButton
                      label={`Delete ${v.title}`}
                      tooltip="Delete"
                      size="sm"
                      className="text-muted-foreground hover:text-status-danger-fg"
                      onClick={(e) => { confirmReturnRef.current = e.currentTarget; setDeleteTarget(v); }}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        returnFocusRef={confirmReturnRef}
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.title ?? 'this video'}?`}
        description="It is removed from the home page. The video stays on YouTube."
        confirmLabel="Delete video"
        tone="danger"
        onConfirm={() => (deleteTarget?.id ? handleDelete(deleteTarget.id) : undefined)}
      />
    </div>
  );
};

export default AdminVideos;
