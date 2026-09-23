import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Upload, X, Loader2, FileText, CheckCircle2, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { SmartImage } from "@/components/ui/smart-image";
import {
  assertUploadableImage,
  formatBytes,
  maxImageBytesFor,
  MAX_PDF_BYTES,
  type MediaCategory,
} from '@/services/mediaStorage';

interface ImageUploaderProps {
  onImageSelected: (file: File) => void;
  /** Where the file is headed - decides the size limit (banners may be 1 MB). */
  category?: MediaCategory;
  existingImageUrl?: string;
  existingFileName?: string;
  existingFileType?: 'pdf' | 'image';
  onRemove?: () => void;
  isUploading?: boolean;
  /** When true, also accept PDF files (up to 1 MB; used for refund receipts). */
  acceptPdf?: boolean;
  /**
   * When true, after selecting a file the component shows a preview with
   * Upload / Replace / Cancel buttons. `onImageSelected` is only fired
   * after the user clicks Upload. Useful for large uploads where
   * accidental drops should not start an upload.
   */
  confirmBeforeUpload?: boolean;
  /** Optional upload progress (0-100) when `isUploading` is true. */
  uploadProgress?: number;
  /** Optional cancellation hook shown while an upload is in progress. */
  onCancelUpload?: () => void;
}

const ImageUploader = ({
  onImageSelected,
  category,
  existingImageUrl,
  existingFileName,
  existingFileType,
  onRemove,
  isUploading,
  acceptPdf = false,
  confirmBeforeUpload = false,
  uploadProgress,
  onCancelUpload,
}: ImageUploaderProps) => {
  const [preview, setPreview] = useState<string | null>(existingImageUrl || null);
  const [previewKind, setPreviewKind] = useState<'pdf' | 'image'>(existingFileType || 'image');
  const [previewName, setPreviewName] = useState<string | null>(existingFileName || null);
  const [previewSize, setPreviewSize] = useState<number | null>(null);
  // When in confirm mode, holds the file pending user confirmation.
  const pendingFileRef = useRef<File | null>(null);
  const [hasPendingFile, setHasPendingFile] = useState(false);

  // Update preview when existing values change
  useEffect(() => {
    setPreview(existingImageUrl || null);
    setPreviewKind(existingFileType || 'image');
    setPreviewName(existingFileName || null);
  }, [existingImageUrl, existingFileType, existingFileName]);

  const renderPreviewForFile = (file: File) => {
    const isPdf = file.type === 'application/pdf';
    setPreviewKind(isPdf ? 'pdf' : 'image');
    setPreviewName(file.name);
    setPreviewSize(file.size);

    if (isPdf) {
      setPreview('pdf');
    } else {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
    if (rejectedFiles.length > 0) {
      const wrongType = rejectedFiles[0]?.errors?.some((error) => error.code === 'file-invalid-type');
      toast.error(
        wrongType
          ? acceptPdf ? 'Only JPG, PNG, WebP or PDF files are allowed.' : 'Only JPG, PNG or WebP images are allowed.'
          : rejectedFiles[0]?.errors?.map((error) => error.message).join(', ') || 'File rejected',
      );
      return;
    }

    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];

    // Size is checked here rather than via dropzone's maxSize because images
    // and PDFs have different limits, and the message should say which applies.
    if (file.type === 'application/pdf') {
      if (file.size > MAX_PDF_BYTES) {
        toast.error(`"${file.name}" is ${formatBytes(file.size)}. PDFs must be 1 MB or less.`);
        return;
      }
    } else {
      try {
        assertUploadableImage(file, category);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'File rejected');
        return;
      }
    }

    renderPreviewForFile(file);

    if (confirmBeforeUpload) {
      pendingFileRef.current = file;
      setHasPendingFile(true);
    } else {
      onImageSelected(file);
    }
  }, [onImageSelected, confirmBeforeUpload, acceptPdf, category]);

  const imageAccept = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] };
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: acceptPdf ? { ...imageAccept, 'application/pdf': ['.pdf'] } : imageAccept,
    maxFiles: 1,
    noClick: confirmBeforeUpload && hasPendingFile, // disable dropzone click while confirming
    noKeyboard: confirmBeforeUpload && hasPendingFile,
  });

  const handleRemove = () => {
    setPreview(null);
    setPreviewName(null);
    setPreviewKind('image');
    setPreviewSize(null);
    pendingFileRef.current = null;
    setHasPendingFile(false);
    onRemove?.();
  };

  const handleConfirmUpload = () => {
    const file = pendingFileRef.current;
    if (!file) return;
    setHasPendingFile(false);
    onImageSelected(file);
    // Keep pending file ref until upload completes so Replace can clear it.
  };

  const handleCancelPending = () => {
    pendingFileRef.current = null;
    setHasPendingFile(false);
    setPreview(existingImageUrl || null);
    setPreviewKind(existingFileType || 'image');
    setPreviewName(existingFileName || null);
    setPreviewSize(null);
  };

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {preview ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-3"
          >
            <div className="relative w-full h-64 rounded-xl overflow-hidden border-2 border-gray-200 dark:border-zinc-800">
              {previewKind === 'pdf' ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-zinc-900 gap-3">
                  <FileText className="w-16 h-16 text-red-500" />
                  <p className="text-sm font-medium text-gray-800 dark:text-zinc-200 max-w-[80%] truncate">
                    {previewName || 'document.pdf'}
                  </p>
                  <p className="text-xs text-gray-500">
                    PDF document{previewSize ? ` · ${formatBytes(previewSize)}` : ''}
                  </p>
                </div>
              ) : (
                <SmartImage
                  src={preview}
                  alt="Preview"
                  className="w-full h-full object-cover" preset="card" />
              )}
              {!isUploading && !hasPendingFile && (
                <button
                  onClick={handleRemove}
                  className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                  aria-label="Remove file"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
              {isUploading && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                  {typeof uploadProgress === 'number' && (
                    <div className="w-3/4 max-w-xs">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/30">
                        <div
                          className="h-full bg-white transition-all"
                          style={{ width: `${Math.max(0, Math.min(100, uploadProgress))}%` }}
                        />
                      </div>
                      <p className="mt-1 text-center text-xs font-semibold text-white">
                        {Math.round(uploadProgress)}%
                      </p>
                    </div>
                  )}
                  {onCancelUpload && (
                    <button
                      type="button"
                      onClick={onCancelUpload}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/50 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/25"
                    >
                      <X className="h-3.5 w-3.5" /> Stop upload
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Confirm-mode action bar */}
            {hasPendingFile && !isUploading && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmUpload}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" /> Upload
                </button>
                <button
                  type="button"
                  onClick={open}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  <RotateCcw className="w-4 h-4" /> Replace
                </button>
                <button
                  type="button"
                  onClick={handleCancelPending}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              {...getRootProps()}
              className={`w-full h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:bg-zinc-900/40'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className={`w-12 h-12 mb-4 ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`} />
              <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                {isDragActive
                  ? acceptPdf ? 'Drop the file here' : 'Drop the image here'
                  : acceptPdf ? 'Drag & drop image or PDF' : 'Drag & drop banner image'}
              </p>
              <p className="text-xs text-gray-500 dark:text-zinc-500">or click to browse</p>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2">
                {acceptPdf
                  ? `JPG, PNG, WebP up to ${formatBytes(maxImageBytesFor(category))} • PDF up to 1 MB`
                  : `JPG, PNG or WebP • max ${formatBytes(maxImageBytesFor(category))}`}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ImageUploader;
