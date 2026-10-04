import React, { useState } from 'react';
import { Upload, Image as ImageIcon, Video, Trash2, Copy, Check, LayoutGrid, List } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { uploadImage, describeUploadError, IMAGE_ACCEPT } from '@/services/mediaStorage';
import { SmartImage } from "@/components/ui/smart-image";

interface MediaItem {
  url: string;
  type: 'image' | 'video';
  publicId: string;
  uploadedAt: Date;
}

const Media = () => {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const newItems: MediaItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const result = await uploadImage(file, {
            category: 'media',
            onProgress: (progress) => {
              setUploadProgress(Math.round(((i + progress.percentage / 100) / files.length) * 100));
            },
          });
          newItems.push({ url: result.url, type: 'image', publicId: result.key, uploadedAt: new Date() });
        } catch (error) {
          toast({ title: 'Not uploaded', description: describeUploadError(error), variant: 'destructive' });
          if ((error as { code?: string })?.code === 'LIMIT_REACHED') break;
        }
      }

      setMediaItems((prev) => [...newItems, ...prev]);

      if (newItems.length > 0) {
        toast({
          title: newItems.length === 1 ? 'Image uploaded' : `${newItems.length} images uploaded`,
        });
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
      toast({ title: 'Link copied' });
    } catch (error) {
      toast({ title: 'Could not copy the link', variant: 'destructive' });
    }
  };

  const handleDelete = (url: string) => {
    setMediaItems((prev) => prev.filter((item) => item.url !== url));
    toast({ title: 'Removed from this list' });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AdminPageHeader
        title="Media library"
        description="Upload images and copy their links for products, banners and pages."
        className="pb-0"
      />

      {/* Upload */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-foreground leading-tight tracking-tight">Upload media</h2>
        </CardHeader>
        <CardContent>
          <label className="flex h-48 w-full cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed border-input bg-muted/30 px-4 text-center transition-colors duration-hover hover:border-primary has-[input:focus-visible]:border-primary has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring">
            {uploading ? (
              <>
                <Spinner size={32} className="mb-4 text-primary" />
                <p className="text-base tabular-nums text-foreground/80" aria-live="polite">Uploading {uploadProgress}%</p>
                <div className="mt-4 h-2 w-64 max-w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Upload progress" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <Upload aria-hidden="true" className="mb-4 h-10 w-10 text-muted-foreground" />
                <p className="mb-2 text-base text-foreground/80">
                  Click to upload or drag and drop
                </p>
                <p className="text-sm text-muted-foreground">
                  Images (JPG, PNG, WebP) up to 500 KB
                </p>
                <p className="text-sm text-muted-foreground">For videos, use a YouTube link</p>
              </>
            )}
            <input
              type="file"
              className="sr-only"
              aria-label="Upload images"
              accept={IMAGE_ACCEPT}
              multiple
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
        </CardContent>
      </Card>

      {/* Media grid */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <h2 className="text-base font-semibold text-foreground leading-tight tracking-tight">
            Uploaded media <span className="font-normal tabular-nums text-muted-foreground">({mediaItems.length})</span>
          </h2>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as 'grid' | 'table')}
            aria-label="Media view"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view" size="sm" className="w-9 px-0">
              <LayoutGrid aria-hidden="true" className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="List view" size="sm" className="w-9 px-0">
              <List aria-hidden="true" className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          {mediaItems.length > 0 ? (
            viewMode === 'grid' ? (
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {mediaItems.map((item, index) => (
                <li
                  key={index}
                  className="group relative overflow-hidden rounded-card bg-muted"
                >
                  {item.type === 'image' ? (
                    <SmartImage
                      src={item.url}
                      alt={`Media ${index + 1}`}
                      className="h-32 w-full object-cover" preset="tile" />
                  ) : (
                    <div className="flex h-32 w-full items-center justify-center bg-muted">
                      <Video aria-hidden="true" className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}

                  {/* Actions: always on touch, on hover or focus with a mouse */}
                  <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-100 transition-opacity duration-hover lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                    <IconButton label={copiedUrl === item.url ? 'Copied' : `Copy link to media ${index + 1}`} variant="onPhoto" size="sm" onClick={() => handleCopyUrl(item.url)}>
                      {copiedUrl === item.url ? <Check /> : <Copy />}
                    </IconButton>
                    <IconButton label={`Remove media ${index + 1} from this list`} variant="onPhoto" size="sm" onClick={() => handleDelete(item.url)}>
                      <Trash2 />
                    </IconButton>
                  </div>

                  {/* Type badge */}
                  <span className="tag-dark absolute left-2 top-2 inline-flex items-center gap-1 capitalize">
                    {item.type === 'image' ? (
                      <ImageIcon aria-hidden="true" className="h-3 w-3" />
                    ) : (
                      <Video aria-hidden="true" className="h-3 w-3" />
                    )}
                    {item.type}
                  </span>
                </li>
              ))}
            </ul>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Preview</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">URL</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-muted-foreground"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mediaItems.map((item, index) => (
                    <tr key={index} className="hover:bg-muted/60">
                      <td className="px-4 py-3">
                        {item.type === 'image' ? (
                          <SmartImage src={item.url} alt="" className="h-12 w-12 rounded-control object-cover" preset="tile" />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-control bg-muted"><Video aria-hidden="true" className="h-5 w-5 text-muted-foreground" /></div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-chip bg-muted px-2 py-1 text-xs capitalize text-foreground/70">
                          {item.type === 'image' ? <ImageIcon aria-hidden="true" className="h-3 w-3" /> : <Video aria-hidden="true" className="h-3 w-3" />} {item.type}
                        </span>
                      </td>
                      <td className="px-4 py-3"><span className="block max-w-xs truncate font-mono text-xs text-muted-foreground" title={item.url}>{item.url}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton label={copiedUrl === item.url ? 'Copied' : `Copy link to media ${index + 1}`} size="sm" onClick={() => handleCopyUrl(item.url)}>
                            {copiedUrl === item.url ? <Check /> : <Copy />}
                          </IconButton>
                          <IconButton label={`Remove media ${index + 1} from this list`} size="sm" className="text-muted-foreground hover:text-status-danger-fg" onClick={() => handleDelete(item.url)}>
                            <Trash2 />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )
          ) : (
            <EmptyState
              icon={ImageIcon}
              title="No media uploaded"
              description="Upload product and banner photos"
              as="h3"
              className="py-8"
            />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Files are stored on Cloudflare R2. Free-plan usage is shown on the Storage page.
      </p>
    </div>
  );
};

export default Media;
