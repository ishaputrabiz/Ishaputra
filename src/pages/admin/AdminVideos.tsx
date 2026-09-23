import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  Save,
  Youtube as YoutubeIcon,
  ExternalLink,
  Eye,
  EyeOff,
  Sparkles,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
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
      toast.error('Please paste a valid YouTube URL');
      return;
    }
    if (!title.trim()) {
      toast.error('Title is required');
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
        toast.success('Video updated');
      } else {
        await createHomeVideo(payload);
        toast.success('Video added');
      }
      onSaved();
      closeDialog();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-gray-500">YouTube URL</Label>
        <Input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="mt-1.5"
        />
        {videoId && (
          <div className="mt-3 aspect-video rounded-lg overflow-hidden border">
            <SmartImage src={thumb} alt="Preview" className="w-full h-full object-cover" preset="tile" />
          </div>
        )}
      </div>
      <div>
        <Label className="text-xs text-gray-500">Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="The Atelier Story"
          className="mt-1.5"
        />
      </div>
      <div>
        <Label className="text-xs text-gray-500">Description</Label>
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A short summary shown beside the player."
          className="mt-1.5"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-500">Display order</Label>
          <Input
            type="number"
            value={order}
            onChange={(e) => setOrder(Number(e.target.value))}
            className="mt-1.5"
          />
        </div>
        <div className="flex items-end gap-2">
          <Switch checked={active} onCheckedChange={setActive} />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {active ? 'Visible' : 'Hidden'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-500">Aspect ratio</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAspectRatio('16:9')}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                aspectRatio === '16:9'
                  ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span className="block text-[10px] uppercase tracking-wider opacity-70">Landscape</span>
              16 : 9
            </button>
            <button
              type="button"
              onClick={() => setAspectRatio('9:16')}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                aspectRatio === '9:16'
                  ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span className="block text-[10px] uppercase tracking-wider opacity-70">Portrait</span>
              9 : 16
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400">
            Choose the upload's true ratio so it plays inline without black bars.
          </p>
        </div>
        <div className="flex flex-col">
          <Label className="text-xs text-gray-500">Featured</Label>
          <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
            <Switch checked={featured} onCheckedChange={setFeatured} />
            <span className="text-sm text-gray-700 dark:text-gray-200">
              {featured ? 'Show in featured spotlight' : 'Hide from featured area'}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400">
            Only featured videos appear in the home‑page hero. Leave off otherwise.
          </p>
        </div>
      </div>

      <DialogFooter className="pt-2">
        <Button onClick={handleSave} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" /> Save
            </>
          )}
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

  useEffect(() => {
    const unsub = subscribeHomeVideos((vids) => {
      setVideos(vids);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this video?')) return;
    try {
      await deleteHomeVideo(id);
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const move = async (v: HomeVideo, direction: -1 | 1) => {
    if (!v.id) return;
    const newOrder = (v.order || 0) + direction;
    try {
      await updateHomeVideo(v.id, { order: newOrder });
    } catch {
      toast.error('Failed to reorder');
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-700 dark:text-amber-400 font-medium mb-2 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> YouTube Showcase
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white">
            Video Stories
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Curate the YouTube reel shown on the homepage.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white">
              <Plus className="w-4 h-4 mr-2" /> Add video
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add YouTube video</DialogTitle>
            </DialogHeader>
            <VideoForm onSaved={() => {}} closeDialog={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {videos.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-dashed border-[#F5EFE6] dark:border-gray-800 rounded-2xl p-16 text-center">
          <YoutubeIcon className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500">No videos yet. Add your first YouTube video above.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {videos.map((v) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-white dark:bg-gray-900 border border-[#F5EFE6] dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm"
            >
              <div className="aspect-video relative bg-black">
                <img
                  src={v.thumbnailUrl || youtubeThumb(v.videoId)}
                  alt={v.title}
                  className="w-full h-full object-cover"
                />
                {v.featured && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] uppercase tracking-wider font-semibold shadow">
                    ★ Featured
                  </span>
                )}
                <span className="absolute top-2 right-2 inline-flex items-center px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] uppercase tracking-wider font-medium backdrop-blur-sm">
                  {v.aspectRatio || '16:9'}
                </span>
                {!v.active && (
                  <div className="absolute inset-0 bg-black/60 grid place-items-center">
                    <span className="text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <EyeOff className="w-3.5 h-3.5" /> Hidden
                    </span>
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1">
                  {v.title}
                </h3>
                {v.description && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{v.description}</p>
                )}
                <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                  <span>Order: {v.order ?? 0}</span>
                  <span>·</span>
                  <a
                    href={v.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-amber-700 hover:underline"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => move(v, -1)}>
                      <ArrowUp className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => move(v, 1)}>
                      <ArrowDown className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => v.id && updateHomeVideo(v.id, { active: !v.active })}
                    >
                      {v.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </Button>
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
                        </DialogHeader>
                        <VideoForm
                          initial={v}
                          onSaved={() => {}}
                          closeDialog={() => setEditing(null)}
                        />
                      </DialogContent>
                    </Dialog>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => v.id && handleDelete(v.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminVideos;
