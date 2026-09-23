import React, { useState } from 'react';
import { Upload, Image as ImageIcon, Video, Trash2, Copy, Check, Loader2, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
          title: 'Success',
          description: `${newItems.length} file(s) uploaded successfully`,
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
      toast({
        title: 'Copied',
        description: 'URL copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy URL',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = (url: string) => {
    setMediaItems((prev) => prev.filter((item) => item.url !== url));
    toast({
      title: 'Removed',
      description: 'Media removed from library',
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Media Library</h1>
        <p className="text-gray-600 mt-1">Upload and manage your media files</p>
      </div>

      {/* Upload Section */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Upload Media</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer hover:border-amber-600 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {uploading ? (
                <>
                  <Loader2 className="h-12 w-12 animate-spin text-amber-600 mb-4" />
                  <p className="text-lg text-gray-700">Uploading... {uploadProgress}%</p>
                  <div className="w-64 h-2 bg-gray-100 rounded-full mt-4">
                    <div
                      className="h-full bg-amber-600 rounded-full transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-gray-600 mb-4" />
                  <p className="text-lg text-gray-700 mb-2">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-sm text-gray-500">
                    Images (JPG, PNG, WebP) up to 500 KB
                  </p>
                  <p className="text-sm text-gray-500">For videos, use a YouTube link</p>
                </>
              )}
            </div>
            <input
              type="file"
              className="hidden"
              accept={IMAGE_ACCEPT}
              multiple
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
        </CardContent>
      </Card>

      {/* Media Grid */}
      <Card className="bg-white border-gray-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-gray-900">
            Uploaded Media ({mediaItems.length})
          </CardTitle>
          <div className="flex border border-gray-200 rounded-md overflow-hidden">
            <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {mediaItems.length > 0 ? (
            viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {mediaItems.map((item, index) => (
                <div
                  key={index}
                  className="relative group rounded-lg overflow-hidden bg-gray-100"
                >
                  {item.type === 'image' ? (
                    <SmartImage
                      src={item.url}
                      alt={`Media ${index + 1}`}
                      className="w-full h-32 object-cover" preset="tile" />
                  ) : (
                    <div className="w-full h-32 flex items-center justify-center bg-gray-100">
                      <Video className="h-12 w-12 text-gray-400" />
                    </div>
                  )}

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleCopyUrl(item.url)}
                      className="p-2 bg-amber-600 rounded-lg text-white hover:bg-amber-700 transition-colors"
                      title="Copy URL"
                    >
                      {copiedUrl === item.url ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(item.url)}
                      className="p-2 bg-red-500 rounded-lg text-white hover:bg-red-600 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Type Badge */}
                  <div className="absolute top-2 left-2">
                    <span className="bg-black/60 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                      {item.type === 'image' ? (
                        <ImageIcon className="h-3 w-3" />
                      ) : (
                        <Video className="h-3 w-3" />
                      )}
                      {item.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Preview</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Type</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">URL</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {mediaItems.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {item.type === 'image' ? (
                          <SmartImage src={item.url} alt="" className="w-12 h-12 object-cover rounded" preset="tile" />
                        ) : (
                          <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center"><Video className="h-5 w-5 text-gray-400" /></div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 rounded capitalize">
                          {item.type === 'image' ? <ImageIcon className="h-3 w-3" /> : <Video className="h-3 w-3" />} {item.type}
                        </span>
                      </td>
                      <td className="px-4 py-3"><span className="text-xs text-gray-500 font-mono truncate max-w-xs block">{item.url}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => handleCopyUrl(item.url)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title="Copy URL">
                            {copiedUrl === item.url ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </button>
                          <button onClick={() => handleDelete(item.url)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )
          ) : (
            <div className="text-center py-12">
              <ImageIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No media uploaded</h3>
              <p className="text-gray-600">Upload images and videos to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-gray-500">
        Files are stored on Cloudflare R2. Free-plan usage is shown on the Storage page.
      </p>
    </div>
  );
};

export default Media;
