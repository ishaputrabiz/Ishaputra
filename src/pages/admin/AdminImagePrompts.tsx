import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Copy,
  Check,
  UserRound,
  Image as ImageIcon,
  Wand2,
  ChevronDown,
  RefreshCw,
  Upload,
  X,
  Shield,
  Camera,
  GalleryHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { fadeUp } from '@/lib/motion';
import { formatTime } from '@/lib/format';
import {
  generateProductModelPrompt,
  generateProductStudioPrompt,
  generateHeroSectionPrompt,
  generateCustomImagePrompt,
  generateVariationPrompt,
  refinePrompt,
  type ImageInput,
  type HeroOutputFormat,
  type LogoMode,
} from '@/services/geminiService';
import {
  savePromptToHistory,
  subscribePromptHistory,
  deletePromptFromHistory,
} from '@/services/promptHistoryService';
import { SmartImage } from "@/components/ui/smart-image";

type PromptCategory = 'product-model' | 'product-studio' | 'hero-section' | 'custom';

interface GeneratedPrompt {
  id: string;
  category: PromptCategory;
  prompt: string;
  inputs: Record<string, string>;
  timestamp: Date;
}

// ─── Image Upload Helper ─────────────────────────────────────────────────

function fileToImageInput(file: File, maxPx = 1024): Promise<ImageInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        const scale = Math.min(1, maxPx / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Re-encode as JPEG at 0.85 quality if original is not a transparent PNG
        const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const resized = canvas.toDataURL(outMime, 0.85);
        const base64 = resized.split(',')[1];
        resolve({ base64, mimeType: outMime });
      };
      img.onerror = reject;
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

async function urlToImageInput(url: string): Promise<ImageInput> {
  const res = await fetch(url);
  const blob = await res.blob();
  return fileToImageInput(new File([blob], 'logo.png', { type: blob.type }));
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// ─── Drop Zone Component ─────────────────────────────────────────────────

function ImageDropZone({
  label,
  image,
  preview,
  onSelect,
  onClear,
  hint,
  required,
}: {
  label: string;
  image: ImageInput | null;
  preview: string;
  onSelect: (file: File) => void;
  onClear: () => void;
  hint?: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) onSelect(file);
      else toast.error('Drop an image file');
    },
    [onSelect]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onSelect(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      {label && (
        <p className="mb-1.5 block text-sm font-medium text-foreground/80">
          {label} {required && <span aria-hidden="true" className="text-status-danger-fg">*</span>}
        </p>
      )}
      {image && preview ? (
        <div className="group relative overflow-hidden rounded-card border border-border bg-muted/50">
          <SmartImage src={preview} alt="Preview" className="h-36 w-full bg-card object-contain" preset="card" />
          <IconButton
            label={`Remove ${label ? label.toLowerCase() : 'image'}`}
            variant="onPhoto"
            size="sm"
            onClick={onClear}
            className="absolute right-1.5 top-1.5 opacity-100 transition-opacity duration-hover lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
          >
            <X />
          </IconButton>
        </div>
      ) : (
        <button
          type="button"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          aria-label={label ? `${label}: drop an image or choose a file` : 'Drop an image or choose a file'}
          className={`block w-full cursor-pointer rounded-card border-2 border-dashed p-5 text-center transition-colors duration-hover ${
            dragOver
              ? 'border-primary bg-primary/10'
              : 'border-input bg-muted/30 hover:border-primary hover:bg-muted/60'
          }`}
        >
          <Upload aria-hidden="true" className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground" />
          <span className="block text-xs text-muted-foreground">
            Drop image or <span className="font-medium text-primary">click to upload</span>
          </span>
          {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

// ─── Multi-Image Drop Zone (Hero) ────────────────────────────────────────

function HeroImageDropZone({
  onSelectMultiple,
  onSelectSingle,
  imageCount,
}: {
  onSelectMultiple: (files: FileList) => void;
  onSelectSingle: (file: File) => void;
  imageCount: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 1) {
        onSelectMultiple(files);
      } else if (files.length === 1 && files[0].type.startsWith('image/')) {
        onSelectSingle(files[0]);
      } else {
        toast.error('Drop image files');
      }
    },
    [onSelectMultiple, onSelectSingle]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onSelectMultiple(files);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <>
      <button
        type="button"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        aria-label="Reference images: drop images or choose files"
        className={`block w-full cursor-pointer rounded-card border-2 border-dashed p-4 text-center transition-colors duration-hover ${
          dragOver
            ? 'border-primary bg-primary/10'
            : 'border-input bg-muted/30 hover:border-primary hover:bg-muted/60'
        }`}
      >
        <Upload aria-hidden="true" className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
        <span className="block text-xs text-muted-foreground">
          {imageCount === 0
            ? <>Drop images or <span className="text-primary font-medium">click to upload</span> (select multiple)</>
            : <>Add more images: <span className="text-primary font-medium">click or drop</span></>
          }
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          Upload products, style references and banner ideas. AI studies them all and creates one banner
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

const AdminImagePrompts = () => {
  const [activeTab, setActiveTab] = useState<PromptCategory>('product-model');
  const [loading, setLoading] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<GeneratedPrompt[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Refine / Variation state
  const [refineText, setRefineText] = useState('');
  const [refining, setRefining] = useState(false);
  const [variationLoading, setVariationLoading] = useState(false);

  // Hero section form state
  const [festivalOrEvent, setFestivalOrEvent] = useState('');
  const [offerTitle, setOfferTitle] = useState('');
  const [offerInfo, setOfferInfo] = useState('');
  const [bannerHeadline, setBannerHeadline] = useState('');
  const [includeModel, setIncludeModel] = useState<'auto' | 'yes' | 'no'>('auto');
  const [heroOutputFormat, setHeroOutputFormat] = useState<HeroOutputFormat>('both');

  // Custom form state
  const [customRequirement, setCustomRequirement] = useState('');
  const [customImageType, setCustomImageType] = useState('Product Photography');

  // Image upload state
  const [productImage, setProductImage] = useState<ImageInput | null>(null);
  const [productPreview, setProductPreview] = useState('');
  const [logoImage, setLogoImage] = useState<ImageInput | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [logoMode, setLogoMode] = useState<LogoMode>('auto-contrast');
  const [blackLogoImage, setBlackLogoImage] = useState<ImageInput | null>(null);
  const [blackLogoPreview, setBlackLogoPreview] = useState('');
  const [whiteLogoImage, setWhiteLogoImage] = useState<ImageInput | null>(null);
  const [whiteLogoPreview, setWhiteLogoPreview] = useState('');
  const [referenceImage, setReferenceImage] = useState<ImageInput | null>(null);
  const [referencePreview, setReferencePreview] = useState('');
  // Hero multi-image state
  const [heroImages, setHeroImages] = useState<ImageInput[]>([]);
  const [heroPreviews, setHeroPreviews] = useState<string[]>([]);

  // Auto-load contrast-aware logo variants
  useEffect(() => {
    Promise.allSettled([
      urlToImageInput('/black_logo_full.png'),
      urlToImageInput('/white_logo_full.png'),
      urlToImageInput('/logo-new.png'),
    ]).then(([blackResult, whiteResult, fallbackResult]) => {
      if (blackResult.status === 'fulfilled') {
        setBlackLogoImage(blackResult.value);
        setBlackLogoPreview('/black_logo_full.png');
      } else if (fallbackResult.status === 'fulfilled') {
        setBlackLogoImage(fallbackResult.value);
        setBlackLogoPreview('/logo-new.png');
      }

      if (whiteResult.status === 'fulfilled') {
        setWhiteLogoImage(whiteResult.value);
        setWhiteLogoPreview('/white_logo_full.png');
      }
    });
  }, []);

  // Subscribe to Firestore prompt history (persistent across sessions)
  useEffect(() => {
    const unsub = subscribePromptHistory((entries) => {
      setHistory(
        entries.map((e) => ({
          id: e.id,
          category: e.category,
          prompt: e.prompt,
          inputs: e.inputs ?? {},
          timestamp: e.createdAt,
        }))
      );
    }, 50);
    return () => unsub();
  }, []);

  const handleProductImageSelect = async (file: File) => {
    const img = await fileToImageInput(file);
    setProductImage(img);
    setProductPreview(URL.createObjectURL(file));
  };

  const handleReferenceImageSelect = async (file: File) => {
    const img = await fileToImageInput(file);
    setReferenceImage(img);
    setReferencePreview(URL.createObjectURL(file));
  };

  const handleHeroImageAdd = async (file: File) => {
    const img = await fileToImageInput(file);
    setHeroImages(prev => [...prev, img]);
    setHeroPreviews(prev => [...prev, URL.createObjectURL(file)]);
  };

  const handleHeroImageAddMultiple = async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        const img = await fileToImageInput(file);
        setHeroImages(prev => [...prev, img]);
        setHeroPreviews(prev => [...prev, URL.createObjectURL(file)]);
      }
    }
  };

  const handleHeroImageRemove = (index: number) => {
    setHeroImages(prev => prev.filter((_, i) => i !== index));
    setHeroPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleLogoSelect = async (file: File) => {
    const img = await fileToImageInput(file);
    setLogoImage(img);
    setLogoPreview(URL.createObjectURL(file));
    setLogoMode('custom');
  };

  const getLogoImages = useCallback((): ImageInput[] => {
    if (logoMode === 'black') {
      return blackLogoImage ? [blackLogoImage] : logoImage ? [logoImage] : [];
    }

    if (logoMode === 'white') {
      return whiteLogoImage ? [whiteLogoImage] : logoImage ? [logoImage] : [];
    }

    if (logoMode === 'custom') {
      return logoImage ? [logoImage] : [];
    }

    const contrastLogos = [blackLogoImage, whiteLogoImage].filter(Boolean) as ImageInput[];
    return contrastLogos.length > 0 ? contrastLogos : logoImage ? [logoImage] : [];
  }, [blackLogoImage, logoImage, logoMode, whiteLogoImage]);

  const activeLogoPreview = logoMode === 'white'
    ? whiteLogoPreview
    : logoMode === 'black'
      ? blackLogoPreview
      : logoMode === 'custom'
        ? logoPreview
        : blackLogoPreview || whiteLogoPreview || logoPreview;

  const activeLogoCount = getLogoImages().length;

  const activeLogoStatus = activeLogoCount === 0
    ? 'No logo loaded. Add black_logo_full.png and white_logo_full.png to public, or upload a custom logo.'
    : logoMode === 'auto-contrast'
      ? `${activeLogoCount} logo reference${activeLogoCount > 1 ? 's' : ''} active. Prompts choose black or white to suit the generated background.`
      : logoMode === 'black'
        ? 'Black logo active. Prompts use it on light or high-contrast backgrounds.'
        : logoMode === 'white'
          ? 'White logo active. Prompts use it on dark or rich backgrounds.'
          : 'Custom logo active. Prompts place the uploaded mark directly without recreating it.';

  const tabs = [
    { id: 'product-model' as PromptCategory, label: 'Product and model', icon: UserRound, description: 'Website-ready model product photo' },
    { id: 'product-studio' as PromptCategory, label: 'Studio product', icon: Camera, description: 'Clean studio product shots' },
    { id: 'hero-section' as PromptCategory, label: 'Hero banners', icon: GalleryHorizontal, description: 'Festival and offer hero banners' },
    { id: 'custom' as PromptCategory, label: 'Custom prompt', icon: Wand2, description: 'Any custom image need' },
  ];

  const festivalSuggestions = [
    'Diwali Sale', "International Men's Day", 'Navratri Collection', 'Christmas Offer',
    'New Year Sale', 'Pongal Festival', 'Wedding Season', 'Raksha Bandhan',
    'Valentine\'s Day', 'Father\'s Day', 'Independence Day', 'Ugadi Festival',
    'Onam Special', 'Eid Collection', 'Ganesh Chaturthi', 'Monsoon Hair Care',
    'Anniversary Sale', 'Launch Offer', 'Clearance Sale', 'Flash Sale',
  ];

  const handleGenerate = async () => {
    setLoading(true);
    setGeneratedPrompt('');
    setCopied(false);

    try {
      let prompt = '';
      let inputs: Record<string, string> = {};
      const activeLogoImages = getLogoImages();

      switch (activeTab) {
        case 'product-model':
          if (!productImage) {
            toast.error('Upload a product image. Model shots need one.');
            setLoading(false);
            return;
          }
          prompt = await generateProductModelPrompt(
            productImage, activeLogoImages, logoMode
          );
          inputs = { type: 'Product + Model', logoMode };
          break;

        case 'product-studio':
          if (!productImage) {
            toast.error('Upload a product image. Studio shots need one.');
            setLoading(false);
            return;
          }
          prompt = await generateProductStudioPrompt(
            productImage, activeLogoImages, logoMode
          );
          inputs = { type: 'Studio Product', logoMode };
          break;

        case 'hero-section':
          if (!festivalOrEvent.trim()) {
            toast.error('Enter the festival, event or offer type');
            setLoading(false);
            return;
          }
          if (!offerTitle.trim()) {
            toast.error('Enter the offer title');
            setLoading(false);
            return;
          }
          prompt = await generateHeroSectionPrompt(
            festivalOrEvent, offerTitle, offerInfo,
            bannerHeadline || '', includeModel, heroOutputFormat,
            heroImages.length > 0 ? heroImages : undefined, activeLogoImages, logoMode
          );
          inputs = { festivalOrEvent, offerTitle, offerInfo, bannerHeadline, includeModel, heroOutputFormat, logoMode };
          break;

        case 'custom':
          if (!customRequirement.trim()) { toast.error('Describe what you need'); setLoading(false); return; }
          prompt = await generateCustomImagePrompt(
            customRequirement, customImageType,
            referenceImage || productImage || undefined, activeLogoImages, logoMode
          );
          inputs = { customRequirement, customImageType, logoMode };
          break;
      }

      setGeneratedPrompt(prompt);

      const newEntry: GeneratedPrompt = {
        id: Date.now().toString(),
        category: activeTab,
        prompt,
        inputs,
        timestamp: new Date(),
      };
      setHistory(prev => [newEntry, ...prev].slice(0, 20));

      // Persist to Firestore (fire-and-forget; subscription will refresh)
      savePromptToHistory({
        category: activeTab,
        prompt,
        inputs,
        ...(activeTab === 'hero-section' ? { modelMode: includeModel } : {}),
      }).catch((e) => console.warn('[promptHistory] save failed:', e));

      toast.success('Prompt generated');
    } catch (error: unknown) {
      console.error('Gemini API error:', error);
      toast.error(getErrorMessage(error, 'Could not generate prompt. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      toast.success('Prompt copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the prompt');
    }
  };

  const loadFromHistory = (entry: GeneratedPrompt) => {
    setGeneratedPrompt(entry.prompt);
    setActiveTab(entry.category);
    setCopied(false);
    setRefineText('');
  };

  const handleRefine = async () => {
    if (!refineText.trim() || !generatedPrompt) return;
    setRefining(true);
    try {
      const refined = await refinePrompt(generatedPrompt, refineText);
      setGeneratedPrompt(refined);
      setRefineText('');
      toast.success('Prompt refined');
      const newEntry: GeneratedPrompt = {
        id: Date.now().toString(),
        category: activeTab,
        prompt: refined,
        inputs: { type: 'Refined' },
        timestamp: new Date(),
      };
      setHistory(prev => [newEntry, ...prev].slice(0, 20));
      savePromptToHistory({ category: activeTab, prompt: refined, inputs: { type: 'Refined' } })
        .catch((e) => console.warn('[promptHistory] save failed:', e));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Could not refine prompt'));
    } finally {
      setRefining(false);
    }
  };

  const handleVariation = async () => {
    if (!generatedPrompt || !productImage) return;
    setVariationLoading(true);
    try {
      const variation = await generateVariationPrompt(generatedPrompt, productImage, getLogoImages(), logoMode);
      setGeneratedPrompt(variation);
      toast.success('Variation ready: a new angle and pose on the same background');
      const newEntry: GeneratedPrompt = {
        id: Date.now().toString(),
        category: 'product-model',
        prompt: variation,
        inputs: { type: 'Variation' },
        timestamp: new Date(),
      };
      setHistory(prev => [newEntry, ...prev].slice(0, 20));
      savePromptToHistory({ category: 'product-model', prompt: variation, inputs: { type: 'Variation' } })
        .catch((e) => console.warn('[promptHistory] save failed:', e));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Could not generate variation'));
    } finally {
      setVariationLoading(false);
    }
  };

  const inputStyles = "h-11 w-full rounded-control border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground transition-colors duration-hover focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:text-sm";
  const selectStyles = "h-11 w-full cursor-pointer appearance-none rounded-control border border-input bg-background px-3 pr-9 text-base text-foreground transition-colors duration-hover focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:text-sm";
  const labelStyles = "block text-sm font-medium text-foreground/80 mb-1.5";
  const textareaStyles = "w-full resize-none rounded-control border border-input bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground transition-colors duration-hover focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:text-sm";
  /** One look for every option group on this page: a quiet tile, copper outline when picked. */
  const optionStyles = (on: boolean) =>
    `rounded-control border px-3 py-2 text-xs font-medium transition-[background-color,border-color,color,transform] duration-press ease-out active:scale-[0.97] ${
      on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
    }`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AdminPageHeader
        title="AI image prompts"
        description="Upload a product image, then generate reference-locked Nano Banana Pro prompts for product photos and banners."
        className="pb-0"
      >
        <StatusBadge tone="neutral" label="Gemini 2.5 Flash" dot />
      </AdminPageHeader>

      {/* Tab navigation */}
      <ToggleGroup
        type="single"
        value={activeTab}
        onValueChange={(v) => { if (!v) return; setActiveTab(v as PromptCategory); setGeneratedPrompt(''); setCopied(false); }}
        aria-label="Prompt type"
        className="grid w-full grid-cols-2 sm:grid-cols-4"
      >
        {tabs.map((tab) => (
          <ToggleGroupItem key={tab.id} value={tab.id} className="min-w-0 gap-2">
            <tab.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Input Section */}
        <div className="xl:col-span-2 space-y-4">
          <motion.section
            key={activeTab}
            {...fadeUp}
            aria-label={tabs.find(t => t.id === activeTab)?.label}
            className="space-y-5 rounded-card border border-border bg-card p-4 sm:p-6"
          >
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-control bg-muted text-foreground/70">
                {activeTab === 'product-model' && <UserRound className="h-4 w-4" />}
                {activeTab === 'product-studio' && <Camera className="h-4 w-4" />}
                {activeTab === 'hero-section' && <GalleryHorizontal className="h-4 w-4" />}
                {activeTab === 'custom' && <Wand2 className="h-4 w-4" />}
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {tabs.find(t => t.id === activeTab)?.label}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {tabs.find(t => t.id === activeTab)?.description}
                </p>
              </div>
            </div>

            {/* Product forms (model and studio: only the image upload is needed) */}
            {(activeTab === 'product-model' || activeTab === 'product-studio') && (
              <>
                {/* Product image upload: required */}
                <ImageDropZone
                  label="Product image"
                  image={productImage}
                  preview={productPreview}
                  onSelect={handleProductImageSelect}
                  onClear={() => { setProductImage(null); setProductPreview(''); }}
                  hint="The prompt locks this exact product as the source. No product description needed."
                  required
                />

                {activeTab === 'product-model' && (
                  <div className="space-y-1.5 rounded-card border border-border bg-muted/40 p-3">
                    <p className="text-xs font-semibold text-foreground">Website product page model shot</p>
                    <ul className="list-inside list-disc space-y-0.5 text-xs text-foreground/80">
                      <li>Premium Indian model, photographed on a DSLR, not AI-looking</li>
                      <li>Real skin pores, catchlights, hair flyaways, natural imperfections</li>
                      <li>Product stays large, sharp, centered, and inspectable for the product page</li>
                      <li>Your exact uploaded product is treated as the locked source asset</li>
                      <li>Background, pose, lighting, and styling improve without changing the product</li>
                      <li>After generating, select <strong>New angle or pose</strong> for variations</li>
                      <li>Use <strong>Refine prompt</strong> to change any detail</li>
                    </ul>
                  </div>
                )}
                {activeTab === 'product-studio' && (
                  <div className="space-y-1.5 rounded-card border border-border bg-muted/40 p-3">
                    <p className="text-xs font-semibold text-foreground">Studio product photoshoot</p>
                    <ul className="list-inside list-disc space-y-0.5 text-xs text-foreground/80">
                      <li>Product-only premium studio shot, no model</li>
                      <li>Keeps the original colours, label and proportions</li>
                      <li>Macro-level detail: every texture and label razor-sharp</li>
                      <li>Premium surface auto-selected to complement the product</li>
                      <li>1:1, 4K, Canon macro lens, focus stacking</li>
                    </ul>
                  </div>
                )}
              </>
            )}

            {/* Hero Section Form */}
            {activeTab === 'hero-section' && (
              <>
                {/* Multi-Image Upload for Hero */}
                <div>
                  <p className="mb-1.5 block text-sm font-medium text-foreground/80">
                    Reference or product images <span className="text-xs font-normal text-muted-foreground">(upload several)</span>
                  </p>
                  {heroPreviews.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {heroPreviews.map((preview, idx) => (
                        <div key={idx} className="group relative overflow-hidden rounded-card border border-border bg-muted/50">
                          <SmartImage src={preview} alt={`Reference ${idx + 1}`} className="h-24 w-full bg-card object-contain" preset="card" />
                          <IconButton
                            label={`Remove image ${idx + 1}`}
                            variant="onPhoto"
                            size="sm"
                            onClick={() => handleHeroImageRemove(idx)}
                            className="absolute right-1 top-1 opacity-100 transition-opacity duration-hover lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                          >
                            <X />
                          </IconButton>
                          <div className="absolute bottom-0 left-0 right-0 bg-charcoal/70 py-0.5 text-center text-[10px] text-charcoal-foreground">
                            Image {idx + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <HeroImageDropZone
                    onSelectMultiple={handleHeroImageAddMultiple}
                    onSelectSingle={handleHeroImageAdd}
                    imageCount={heroPreviews.length}
                  />
                  {heroPreviews.length > 0 && (
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-xs text-muted-foreground">{heroPreviews.length} image{heroPreviews.length > 1 ? 's' : ''} uploaded. AI studies them all and creates one banner.</p>
                      <button
                        type="button"
                        onClick={() => { setHeroImages([]); setHeroPreviews([]); }}
                        className="shrink-0 rounded-control px-2 py-1 text-xs font-medium text-status-danger-fg hover:bg-status-danger-bg"
                      >
                        Clear all
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="ip-event" className={labelStyles}>Festival, event or offer type <span aria-hidden="true" className="text-status-danger-fg">*</span></label>
                  <input
                    id="ip-event"
                    type="text"
                    value={festivalOrEvent}
                    onChange={(e) => setFestivalOrEvent(e.target.value)}
                    placeholder="e.g., Diwali sale, Wedding season, Monsoon hair care"
                    className={inputStyles}
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {festivalSuggestions.slice(0, 8).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFestivalOrEvent(s)}
                        aria-pressed={festivalOrEvent === s}
                        className={optionStyles(festivalOrEvent === s) + ' px-2 py-1'}
                      >
                        {s}
                      </button>
                    ))}
                    <div className="relative group">
                      <button
                        type="button"
                        aria-haspopup="true"
                        className={optionStyles(false) + ' px-2 py-1'}
                      >
                        More
                      </button>
                      <div className="absolute bottom-full left-0 z-popover mb-1 hidden w-64 flex-wrap gap-1 rounded-card border border-border bg-popover p-2 shadow-lg group-focus-within:flex group-hover:flex">
                        {festivalSuggestions.slice(8).map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setFestivalOrEvent(s)}
                            aria-pressed={festivalOrEvent === s}
                            className={optionStyles(festivalOrEvent === s) + ' px-2 py-1'}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <label htmlFor="ip-headline" className={labelStyles}>Banner headline <span className="text-muted-foreground text-xs font-normal">(optional, AI writes one if blank)</span></label>
                  <input
                    id="ip-headline"
                    type="text"
                    value={bannerHeadline}
                    onChange={(e) => setBannerHeadline(e.target.value)}
                    placeholder="e.g., Rituals for a stronger you"
                    className={inputStyles}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">The emotional tagline rendered on the banner with aesthetic typography</p>
                </div>
                <div>
                  <label htmlFor="ip-offer" className={labelStyles}>Offer title <span aria-hidden="true" className="text-status-danger-fg">*</span></label>
                  <input
                    id="ip-offer"
                    type="text"
                    value={offerTitle}
                    onChange={(e) => setOfferTitle(e.target.value)}
                    placeholder="e.g., Flat 30% Off, Buy 1 Get 1 Free, Up to 50% Off"
                    className={inputStyles}
                  />
                </div>
                <div>
                  <label htmlFor="ip-details" className={labelStyles}>Offer details <span className="text-xs font-normal text-muted-foreground">(optional)</span></label>
                  <textarea
                    id="ip-details"
                    value={offerInfo}
                    onChange={(e) => setOfferInfo(e.target.value)}
                    placeholder="e.g., On all orders above ₹1,499. Valid till 31st Dec."
                    rows={2}
                    className={textareaStyles}
                  />
                </div>
                <div>
                  <p className={labelStyles}>Include a model?</p>
                  <div className="flex gap-2">
                    {([
                      { value: 'auto', label: 'AI decides', desc: 'Recommended' },
                      { value: 'yes', label: 'Yes', desc: 'Include model' },
                      { value: 'no', label: 'No', desc: 'Product only' },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setIncludeModel(opt.value)}
                        aria-pressed={includeModel === opt.value}
                        className={optionStyles(includeModel === opt.value) + ' flex-1 text-center'}
                      >
                        <span className="block">{opt.label}</span>
                        <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={labelStyles}>Banner format</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: 'desktop-16:9', label: 'Desktop', desc: '16:9' },
                      { value: 'mobile-4:5', label: 'Mobile', desc: '4:5' },
                      { value: 'both', label: 'Both', desc: '16:9 + 4:5' },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setHeroOutputFormat(opt.value)}
                        aria-pressed={heroOutputFormat === opt.value}
                        className={optionStyles(heroOutputFormat === opt.value) + ' text-center'}
                      >
                        <span className="block">{opt.label}</span>
                        <span className="mt-0.5 block text-[11px] font-normal tabular-nums text-muted-foreground">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mobile banners use the homepage's 4:5 crop; Both asks Nano Banana Pro for two native campaign outputs.
                  </p>
                </div>
                <div className="space-y-1.5 rounded-card border border-border bg-muted/40 p-3">
                  <p className="text-xs font-semibold text-foreground">Complete banner design</p>
                  <ul className="list-inside list-disc space-y-0.5 text-xs text-foreground/80">
                    <li><strong>Upload several images</strong>: products, references, ideas. AI studies them all</li>
                    <li>Text rendered IN the image with aesthetic typography</li>
                    <li>Offer styled as a premium design element (not plain text)</li>
                    <li>SHOP NOW / CTA button included in the design</li>
                    <li>Logo placed where it fits best (not always bottom-right)</li>
                    <li>AI decides model or product-only, both equally premium</li>
                    <li>Desktop 16:9, mobile 4:5, or both, with real DSLR camera quality</li>
                  </ul>
                </div>
              </>
            )}

            {/* Custom Prompt Form */}
            {activeTab === 'custom' && (
              <>
                <ImageDropZone
                  label="Reference or product image (optional)"
                  image={referenceImage || productImage}
                  preview={referencePreview || productPreview}
                  onSelect={handleReferenceImageSelect}
                  onClear={() => { setReferenceImage(null); setReferencePreview(''); setProductImage(null); setProductPreview(''); }}
                  hint="Upload any image. AI references it exactly in the prompt."
                />
                <div>
                  <label htmlFor="ip-type" className={labelStyles}>Image type</label>
                  <div className="relative">
                    <select id="ip-type" value={customImageType} onChange={(e) => setCustomImageType(e.target.value)} className={selectStyles}>
                      <option value="Product Photography">Product Photography</option>
                      <option value="Model Photography">Model Photography</option>
                      <option value="Banner/Hero Image">Banner / Hero Image</option>
                      <option value="Social Media Post">Social Media Post</option>
                      <option value="Category Banner">Category Banner</option>
                      <option value="Promotional Image">Promotional Image</option>
                      <option value="Lifestyle Shot">Lifestyle Shot</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label htmlFor="ip-req" className={labelStyles}>Describe what you need <span aria-hidden="true" className="text-status-danger-fg">*</span></label>
                  <textarea
                    id="ip-req"
                    value={customRequirement}
                    onChange={(e) => setCustomRequirement(e.target.value)}
                    placeholder="Describe exactly what you want, e.g., ‘A dark apothecary banner with amber bottles and a raw ashwagandha root under warm copper light’"
                    rows={5}
                    className={textareaStyles}
                  />
                </div>
                <div className="rounded-card border border-border bg-muted/40 p-3 text-xs text-foreground/80">
                  <strong>Custom:</strong> Any image type. Upload a reference and AI will preserve it exactly while enhancing the scene around it.
                </div>
              </>
            )}

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full"
            >
              {loading ? <Spinner /> : <Sparkles aria-hidden="true" />}
              {loading ? 'Generating' : 'Generate prompt'}
            </Button>
          </motion.section>

          {/* Logo / Watermark Card */}
          <section aria-labelledby="ip-watermark" className="rounded-card border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Shield aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              <h2 id="ip-watermark" className="text-sm font-semibold text-foreground">Brand watermark</h2>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {([
                { value: 'auto-contrast', label: 'Auto contrast' },
                { value: 'black', label: 'Black logo' },
                { value: 'white', label: 'White logo' },
                { value: 'custom', label: 'Custom' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLogoMode(opt.value)}
                  aria-pressed={logoMode === opt.value}
                  className={optionStyles(logoMode === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {activeLogoPreview && logoMode !== 'custom' && (
              <div className="mb-3 rounded-card border border-border bg-muted/50 p-3">
                <img src={activeLogoPreview} alt="Selected logo" className="h-12 w-full object-contain" />
              </div>
            )}
            <ImageDropZone
              label="Custom logo"
              image={logoImage}
              preview={logoPreview}
              onSelect={handleLogoSelect}
              onClear={() => { setLogoImage(null); setLogoPreview(''); }}
              hint="Optional. Auto mode uses the black and white logos and lets Nano Banana Pro choose the contrast."
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {activeLogoStatus}
            </p>
          </section>
        </div>

        {/* Output Section */}
        <div className="xl:col-span-3 space-y-4">
          {/* Generated Prompt Display */}
          <section aria-labelledby="ip-output" className="overflow-hidden rounded-card border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6">
              <h2 id="ip-output" className="text-sm font-semibold text-foreground">Generated prompt</h2>
              <div className="flex items-center gap-2">
                {generatedPrompt && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerate}
                      disabled={loading}
                    >
                      <RefreshCw aria-hidden="true" className={loading ? 'animate-spin' : ''} />
                      Regenerate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                    >
                      {copied ? <Check aria-hidden="true" className="text-status-success-fg" /> : <Copy aria-hidden="true" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="p-4 sm:p-6">
              {loading ? (
                <div aria-busy="true" className="space-y-3 py-4">
                  <p className="text-sm text-muted-foreground" role="status">Gemini 2.5 Flash is studying your product and writing the prompt</p>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : generatedPrompt ? (
                <div className="space-y-4">
                  <div className="max-h-[400px] overflow-y-auto rounded-card bg-muted/50 p-4">
                    <pre className="whitespace-pre-wrap text-sm text-foreground leading-relaxed font-sans">
                      {generatedPrompt}
                    </pre>
                  </div>

                  {/* Action buttons row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {activeTab === 'product-model' && productImage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleVariation}
                        disabled={variationLoading || refining}
                      >
                        {variationLoading ? <Spinner /> : <Camera aria-hidden="true" />}
                        {variationLoading ? 'Generating variation' : 'New angle or pose'}
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Copy prompt → paste into Nano Banana Pro with the same reference images
                    </span>
                    {(productImage || referenceImage || heroImages.length > 0) && (
                      <span className="rounded-chip bg-muted px-2 py-0.5 text-xs font-medium text-foreground/70">
                        Attach product/reference images alongside the prompt
                      </span>
                    )}
                    {activeTab === 'hero-section' && heroOutputFormat === 'both' && (
                      <span className="rounded-chip bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-foreground/70">
                        Expects two outputs: desktop 16:9 + mobile 4:5
                      </span>
                    )}
                  </div>

                  {/* Refine Section */}
                  <div className="space-y-3 rounded-card border border-border bg-muted/40 p-4">
                    <div className="flex items-center gap-2">
                      <Wand2 aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-medium text-foreground">Refine this prompt</h3>
                    </div>
                    <textarea
                      aria-label="What to change"
                      value={refineText}
                      onChange={(e) => setRefineText(e.target.value)}
                      placeholder="Tell AI what to change, e.g., ‘Make the background darker’ or ‘Change the pose to a side profile’"
                      rows={2}
                      className="w-full bg-card border border-border rounded-control border-input bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 transition-colors duration-hover resize-none md:text-sm"
                    />
                    <Button
                      onClick={handleRefine}
                      disabled={!refineText.trim() || refining || variationLoading}
                      size="sm"
                    >
                      {refining ? <Spinner /> : <Sparkles aria-hidden="true" />}
                      {refining ? 'Refining' : 'Refine prompt'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
                  <div className="flex h-14 w-14 items-center justify-center rounded-card bg-muted">
                    <Wand2 aria-hidden="true" className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm">Upload your product image, then select Generate prompt</p>
                  <p className="text-xs">The prompt will lock your uploaded product as the exact source asset</p>
                </div>
              )}
            </div>
          </section>

          {/* How to use */}
          <section aria-labelledby="ip-howto" className="rounded-card border border-border bg-card p-4 sm:p-6">
            <h2 id="ip-howto" className="mb-3 text-sm font-semibold text-foreground">How to use these prompts</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-foreground/80">
              <div className="flex items-start gap-2">
                <span aria-hidden="true" className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-foreground">1</span>
                <span><strong>Upload</strong> your product image → Gemini builds a prompt that uses it as a locked product reference, not a text description.</span>
              </div>
              <div className="flex items-start gap-2">
                <span aria-hidden="true" className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-foreground">2</span>
                <span><strong>Copy</strong> the prompt and paste into Nano Banana Pro. <strong>Attach the same product and logo references</strong> alongside it.</span>
              </div>
              <div className="flex items-start gap-2">
                <span aria-hidden="true" className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-foreground">3</span>
                <span>The prompt says <strong>“use the attached product image directly”</strong>, so Nano Banana Pro should preserve the original and enhance only the scene.</span>
              </div>
              <div className="flex items-start gap-2">
                <span aria-hidden="true" className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-foreground">4</span>
                <span>Your <strong>logo watermark</strong> can use black or white variants. Auto Contrast asks the prompt to choose based on background readability.</span>
              </div>
            </div>
          </section>

          {/* History */}
          {history.length > 0 && (
            <div className="bg-card rounded-card border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                aria-expanded={showHistory}
                className="focus-inset flex w-full items-center justify-between px-4 py-4 transition-colors duration-hover hover:bg-muted/60 sm:px-6"
              >
                <span className="text-sm font-semibold text-foreground">
                  Prompt history <span className="font-normal tabular-nums text-muted-foreground">({history.length})</span>
                </span>
                <ChevronDown aria-hidden="true" className={`h-4 w-4 text-muted-foreground transition-transform duration-dropdown ease-out ${showHistory ? 'rotate-180' : ''}`} />
              </button>
              {showHistory && (
                <div className="border-t border-border divide-y divide-border max-h-[400px] overflow-y-auto">
                  {history.map((entry) => (
                    <div
                      key={entry.id}
                      className="group relative"
                    >
                      <button
                        type="button"
                        onClick={() => loadFromHistory(entry)}
                        className="focus-inset block w-full px-4 py-3 pr-14 text-left transition-colors duration-hover hover:bg-muted/60 sm:px-6 sm:pr-14"
                      >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium capitalize text-foreground">
                          {entry.category.replace('-', ' ')}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatTime(entry.timestamp)}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs text-foreground/80">
                        {entry.prompt.slice(0, 120)}…
                      </span>
                      </button>
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePromptFromHistory(entry.id)
                            .then(() => toast.success('Removed from history'))
                            .catch(() => toast.error('Could not remove it'));
                        }}
                        size="sm"
                        label="Remove from history"
                        className="absolute right-2 top-2 text-muted-foreground opacity-100 transition-opacity duration-hover hover:text-status-danger-fg lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                      >
                        <X />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminImagePrompts;
