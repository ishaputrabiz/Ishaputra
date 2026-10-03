import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Upload, X, FileText, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { DUR, EASE_OUT } from '@/lib/motion';
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
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: DUR.dropdown, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: DUR.exit } }}
            className="space-y-3"
          >
            <div className="relative h-64 w-full overflow-hidden rounded-card border border-border">
              {previewKind === 'pdf' ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted/50">
                  <FileText aria-hidden="true" className="h-14 w-14 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground max-w-[80%] truncate">
                    {previewName || 'document.pdf'}
                  </p>
                  <p className="text-xs text-muted-foreground">
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
                <IconButton
                  label="Remove file"
                  variant="onPhoto"
                  onClick={handleRemove}
                  className="absolute right-2 top-2"
                >
                  <X />
                </IconButton>
              )}
              {isUploading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-charcoal/60 text-charcoal-foreground backdrop-blur-[2px]">
                  <Spinner size={28} label="Uploading" />
                  {typeof uploadProgress === 'number' && (
                    <div className="w-3/4 max-w-xs">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-charcoal-foreground/30" role="progressbar" aria-label="Upload progress" aria-valuenow={Math.round(uploadProgress)} aria-valuemin={0} aria-valuemax={100}>
                        <div
                          className="h-full bg-charcoal-foreground"
                          style={{ width: `${Math.max(0, Math.min(100, uploadProgress))}%` }}
                        />
                      </div>
                      <p className="mt-1 text-center text-xs font-semibold tabular-nums">
                        {Math.round(uploadProgress)}%
                      </p>
                    </div>
                  )}
                  {onCancelUpload && (
                    <Button type="button" variant="line" size="sm" onClick={onCancelUpload} className="mt-2">
                      <X aria-hidden="true" /> Stop upload
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Confirm-mode action bar */}
            {hasPendingFile && !isUploading && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={handleConfirmUpload} className="flex-1">
                  <CheckCircle2 aria-hidden="true" /> Upload
                </Button>
                <Button type="button" variant="outline" onClick={open}>
                  <RotateCcw aria-hidden="true" /> Replace
                </Button>
                <Button type="button" variant="ghost" onClick={handleCancelPending}>
                  Cancel
                </Button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DUR.dropdown, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: DUR.exit } }}
          >
            <div
              {...getRootProps({ 'aria-label': acceptPdf ? 'Upload an image or PDF' : 'Upload an image' })}
              className={`flex h-64 w-full cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed px-4 text-center transition-[background-color,border-color] duration-hover ${
                isDragActive
                  ? 'border-primary bg-muted'
                  : 'border-input bg-muted/30 hover:border-primary hover:bg-muted/60'
              }`}
            >
              <input {...getInputProps()} />
              <Upload aria-hidden="true" className={`mb-4 h-10 w-10 ${isDragActive ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="mb-1 text-sm font-medium text-foreground/80">
                {isDragActive
                  ? acceptPdf ? 'Drop the file here' : 'Drop the image here'
                  : acceptPdf ? 'Drag and drop an image or PDF' : 'Drag and drop an image'}
              </p>
              <p className="text-xs text-muted-foreground">or click to browse</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {acceptPdf
                  ? `JPG, PNG, WebP up to ${formatBytes(maxImageBytesFor(category))} · PDF up to 1 MB`
                  : `JPG, PNG or WebP · max ${formatBytes(maxImageBytesFor(category))}`}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ImageUploader;
