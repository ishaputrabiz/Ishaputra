import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  X,
  Image as ImageIcon,
  Video,
  Plus,
  Trash2,
  Calculator,
  Info,
  ScanLine,
  Truck,
  Save,
  CircleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { FormSkeleton } from '@/components/skeletons';
import { subscribeDeliverySettings, DEFAULT_DELIVERY } from '@/services/siteSettingsService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  createProduct,
  updateProduct,
  getProduct,
  generateSlug,
  releaseProductImages,
  Product,
} from '@/services/productService';
import {
  uploadImage,
  describeUploadError,
  MAX_PRODUCT_IMAGES,
  IMAGE_ACCEPT,
} from '@/services/mediaStorage';
import {
  subscribeToCategories,
  seedDefaultCategories,
  healDuplicateCategories,
  addSubcategory,
  addSubSubcategory,
  Category,
} from '@/services/categoryService';
import BarcodeScannerDialog from '@/components/admin/BarcodeScannerDialog';
import { useHardwareScanner } from '@/hooks/useHardwareScanner';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { SmartImage } from "@/components/ui/smart-image";
import { describeError } from '@/lib/errorMessage';
import { formatINR, plural } from '@/lib/format';
import { SILVER_PRICING_ENABLED } from '@/config/features';
import { DealerPriceFieldView, type DealerPriceLoad } from '@/components/admin/DealerPriceField';
import { dealerPriceError, parseDealerPrice } from '@/lib/dealerPriceForm';
import { getProductDealerPrice, setProductDealerPrice } from '@/services/dealerService';

// YouTube helpers
function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

// Spec suggestions stored in localStorage
const SPEC_SUGGESTIONS_KEY = 'admin_spec_suggestions';

function loadSpecSuggestions(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(SPEC_SUGGESTIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSpecSuggestion(label: string, value: string) {
  const suggestions = loadSpecSuggestions();
  const key = label.toLowerCase().trim();
  if (!key || !value.trim()) return;
  if (!suggestions[key]) suggestions[key] = [];
  if (!suggestions[key].includes(value.trim())) {
    suggestions[key].push(value.trim());
    if (suggestions[key].length > 20) suggestions[key] = suggestions[key].slice(-20);
  }
  localStorage.setItem(SPEC_SUGGESTIONS_KEY, JSON.stringify(suggestions));
}

/** Red asterisk marking a field the form will not submit without. */
const Required = () => (
  <span className="ml-0.5 text-status-danger-fg" aria-hidden="true" title="Required">
    *
  </span>
);

/** Muted "(optional)" after a label. */
const Optional = () => <span className="ml-1 font-normal text-muted-foreground">(optional)</span>;

/** Inline validation message shown under the field it belongs to. */
const FieldError = ({ message, id }: { message?: string; id?: string }) =>
  message ? (
    <p id={id} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-status-danger-fg">
      <CircleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  ) : null;

/** Red ring on an invalid control, so the offending field is obvious. */
const invalidRing = (hasError?: boolean) =>
  hasError ? ' border-destructive focus-visible:border-destructive' : '';

const ProductForm = () => {
  const { productId } = useParams();
  const isEditing = !!productId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [fetchingProduct, setFetchingProduct] = useState(isEditing);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [imageUploadMode, setImageUploadMode] = useState<'upload' | 'url'>('upload');
  const [newSubcategory, setNewSubcategory] = useState('');
  const [newSubSubcategory, setNewSubSubcategory] = useState('');
  const [addingSub, setAddingSub] = useState(false);
  const [addingSubSub, setAddingSubSub] = useState(false);

  // Silver rate (live from Firestore)
  const [silverRate, setSilverRate] = useState<number>(0);

  // Silver-rate-based pricing calculator (optional)
  const [silverPricing, setSilverPricing] = useState({
    enabled: false,
    weightGrams: '',
    wastagePercent: '',
    makingCharges: '',
  });

  // Categories from Firestore
  const [categories, setCategories] = useState<Category[]>([]);

  // Home state from Commerce > Delivery, only to label the two charge fields.
  const [homeState, setHomeState] = useState(DEFAULT_DELIVERY.homeState);
  useEffect(() => {
    const unsub = subscribeDeliverySettings((d) => setHomeState(d.homeState || DEFAULT_DELIVERY.homeState));
    return unsub;
  }, []);

  useEffect(() => {
    // Seed any missing default, then fold away duplicate documents left behind
    // by the old non-idempotent seeding (that is what listed every category
    // twice and rendered "JewelleryJewellery" in the trigger). Both are no-ops
    // once the collection is clean.
    seedDefaultCategories().then(() => healDuplicateCategories());
    const unsub = subscribeToCategories(setCategories);
    return unsub;
  }, []);

  // Fetch live silver rate from Firestore
  useEffect(() => {
    const ref = doc(db, 'siteSettings', 'silverRate');
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data() || {};
        if (typeof d.manualPricePerGramInr === 'number' && d.manualPricePerGramInr > 0) {
          setSilverRate(d.manualPricePerGramInr);
        }
      }
    });
    return unsub;
  }, []);

  // Auto-calculate price whenever silver pricing inputs change
  useEffect(() => {
    if (!silverPricing.enabled) return;
    const grams = parseFloat(silverPricing.weightGrams) || 0;
    const wastage = parseFloat(silverPricing.wastagePercent) || 0;
    const making = parseFloat(silverPricing.makingCharges) || 0;
    if (grams <= 0 || silverRate <= 0) return;
    const x = grams * silverRate;          // silver cost
    const y = x * (wastage / 100);         // wastage on silver cost
    const z = making;                       // making charges
    const computed = Math.ceil(x + y + z); // live price
    setFormData((prev) => ({ ...prev, price: computed.toString() }));
  }, [silverPricing.enabled, silverPricing.weightGrams, silverPricing.wastagePercent, silverPricing.makingCharges, silverRate]);

  // Auto-sync inventory weight from silver calculator when silver pricing is enabled
  useEffect(() => {
    if (!silverPricing.enabled) return;
    const w = silverPricing.weightGrams;
    if (w === '') return;
    setFormData((prev) => ({ ...prev, weight: w, weightUnit: 'grams' }));
  }, [silverPricing.enabled, silverPricing.weightGrams]);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    category: '',
    subcategory: '',
    subSubcategory: '',
    description: '',
    tags: '',
    price: '',
    originalPrice: '',
    discount: '',
    discountType: 'percent' as 'percent' | 'amount',
    stock: '',
    weight: '',
    weightUnit: 'grams' as 'grams' | 'kgs',
    isActive: true,
    isFeatured: false,
    isNewArrival: false,
    isBestSeller: false,
    isTopDeal: false,
    isTrendProduct: false,
  });

  const [scannerOpen, setScannerOpen] = useState(false);
  /** Why the loaded product is hidden, when a rule hid it (see InactiveReason). */
  const [inactiveReason, setInactiveReason] = useState<'outOfStock' | 'noImages' | null>(null);
  /** Shown under the Live in store switch when a rule changed it for the admin. */
  const [statusNote, setStatusNote] = useState<string | null>(null);

  /**
   * Scanning anywhere on this form fills the barcode field.
   *
   * Tagging a new piece is: type the details, point the scanner at the tag,
   * save. Reaching for the camera button between every product would undo the
   * point of having a corded scanner on the counter.
   */
  const handleScannedCode = (code: string) => {
    setFormData((prev) => ({ ...prev, barcode: code }));
    toast({ title: 'Barcode scanned', description: code });
  };

  useHardwareScanner({ onScan: handleScannedCode, enabled: !scannerOpen });

  /**
   * Per-field validation messages, keyed by field name.
   *
   * Submitting used to fail with one generic "Please fill in all required
   * fields" toast that never said which field, and a save that failed
   * server-side said only "Failed to update product". Both now name the
   * problem, and the offending field is highlighted and scrolled to.
   */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = (field: string) =>
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  /**
   * Dealer price: a fixed price for approved dealers, kept in
   * dealerPricing/current (not on the product) and written after the product
   * saves. A failed read disables only this field, and nothing is written for
   * it, so a blank that was never loaded cannot clear the stored price.
   */
  const [dealerPrice, setDealerPrice] = useState('');
  const [dealerLoad, setDealerLoad] = useState<DealerPriceLoad>('loading');
  /** The store-wide dealer discount, in percent, for the hint under the field. */
  const [dealerPercent, setDealerPercent] = useState<number | null>(null);
  /** The price stored when the form opened ('' = none). Saving writes only a change to it. */
  const loadedDealerPriceRef = useRef('');
  /** The id of a product this form created, so a second Save updates it instead of making another. */
  const createdIdRef = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    setDealerLoad('loading');
    // A new product has no id yet: the empty id has no fixed price, and still returns the store-wide percent.
    getProductDealerPrice(productId ?? '')
      .then(({ price, discountPercent }) => {
        if (!live) return;
        const text = price === null ? '' : String(price);
        loadedDealerPriceRef.current = text;
        setDealerPrice(text);
        setDealerPercent(discountPercent);
        setDealerLoad('ready');
      })
      .catch((error: unknown) => {
        console.error('Error fetching the dealer price:', error);
        if (live) setDealerLoad('error');
      });
    return () => {
      live = false;
    };
  }, [productId]);

  /**
   * Per-product delivery override.
   *
   * Off => this product always ships free. On => it uses these two charges
   * instead of the universal charge in Commerce → Delivery. Leaving it off and
   * untouched is not the same as "free": a product only overrides the universal
   * charge once the admin turns this on (see `hasDeliveryOverride`).
   */
  const [delivery, setDelivery] = useState({
    override: false,
    chargeEnabled: true,
    withinState: '',
    outsideState: '',
  });

  // Dynamic specifications
  const [specifications, setSpecifications] = useState<{ label: string; value: string }[]>([
    { label: 'Net quantity', value: '' },
    { label: 'Key ingredients', value: '' },
    { label: 'How to use', value: '' },
  ]);

  const [specSuggestions, setSpecSuggestions] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setSpecSuggestions(loadSpecSuggestions());
  }, []);

  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [thumbnail, setThumbnail] = useState<string>('');
  // Stored files this form may need to clean up: what the product had when it
  // loaded, plus everything uploaded since. Whatever isn't in the saved product
  // (or never gets saved) is released so it doesn't sit in storage unused.
  const loadedImagesRef = useRef<string[]>([]);
  const sessionUploadsRef = useRef<string[]>([]);
  const savedRef = useRef(false);

  useEffect(
    () => () => {
      if (!savedRef.current && sessionUploadsRef.current.length) {
        void releaseProductImages(sessionUploadsRef.current);
      }
    },
    [],
  );

  // Derived subcategories
  const selectedCategory = categories.find((c) => c.name === formData.category);
  const subcategoryOptions = selectedCategory?.subcategories || [];
  const selectedSubcategory = subcategoryOptions.find((s) => s.name === formData.subcategory);
  const subSubcategoryOptions = selectedSubcategory?.children || [];

  // Fetch product if editing
  useEffect(() => {
    if (isEditing && productId) {
      fetchProductData();
    }
  }, [productId]);

  const fetchProductData = async () => {
    try {
      const product = await getProduct(productId!);
      if (product) {
        setFormData({
          name: product.name,
          barcode: product.barcode || '',
          category: product.category,
          subcategory: product.subcategory || '',
          subSubcategory: product.subSubcategory || '',
          description: product.description,
          tags: '',
          price: product.price.toString(),
          originalPrice: product.originalPrice?.toString() || '',
          discount: product.discount?.toString() || '',
          discountType: 'percent',
          stock: product.inventory?.stock?.toString() || '',
          weight: product.inventory?.weight || '',
          weightUnit: product.inventory?.weightUnit || 'grams',
          isActive: product.flags?.isActive ?? true,
          isFeatured: product.flags?.isFeatured ?? false,
          isNewArrival: product.flags?.isNewArrival ?? false,
          isBestSeller: product.flags?.isBestSeller ?? false,
          isTopDeal: (product.flags as any)?.isTopDeal ?? false,
          isTrendProduct: (product.flags as any)?.isTrendProduct ?? false,
        });
        setImages(product.media?.images || []);
        setInactiveReason(((product as any).inactiveReason as 'outOfStock' | 'noImages' | null) || null);
        loadedImagesRef.current = product.media?.images || [];
        setVideos(product.media?.videos || []);
        setThumbnail(product.media?.thumbnail || '');

        const d = product.delivery;
        if (d) {
          setDelivery({
            override: true,
            chargeEnabled: d.chargeEnabled !== false,
            withinState: d.withinState != null ? String(d.withinState) : '',
            outsideState: d.outsideState != null ? String(d.outsideState) : '',
          });
        }

        const specs = product.specifications || {};
        const specEntries: { label: string; value: string }[] = [];
        // The old store's fixed rows come first when a product has them; empty
        // ones are no longer added, so a product's saved specs stay as they are.
        const defaultLabels = ['material', 'purity', 'dimensions'];
        defaultLabels.forEach((key) => {
          if (!(key in (specs as any))) return;
          const val = (specs as any)[key] || '';
          specEntries.push({ label: key.charAt(0).toUpperCase() + key.slice(1), value: val });
        });
        Object.keys(specs).forEach((key) => {
          if (!defaultLabels.includes(key.toLowerCase())) {
            specEntries.push({ label: key, value: (specs as any)[key] });
          }
        });
        if (specEntries.length > 0) setSpecifications(specEntries);

        // Restore silver pricing if saved
        const sp = (product as any).silverPricing;
        if (sp && sp.enabled) {
          setSilverPricing({
            enabled: true,
            weightGrams: sp.weightGrams?.toString() || '',
            wastagePercent: sp.wastagePercent?.toString() || '',
            makingCharges: sp.makingCharges?.toString() || '',
          });
        }
      }
    } catch (error) {
      console.error('Error fetching product:', error);
      toast({ title: 'Could not load this product', description: describeError(error), variant: 'destructive' });
    } finally {
      setFetchingProduct(false);
    }
  };

  // Handle adding custom subcategory
  const handleAddSubcategory = async () => {
    if (!newSubcategory.trim() || !selectedCategory?.id) return;
    setAddingSub(true);
    try {
      await addSubcategory(selectedCategory.id, selectedCategory.subcategories, newSubcategory.trim());
      setFormData((prev) => ({ ...prev, subcategory: newSubcategory.trim(), subSubcategory: '' }));
      setNewSubcategory('');
      toast({ title: 'Subcategory added', description: newSubcategory.trim() });
    } catch (error) {
      toast({ title: 'Could not add subcategory', description: describeError(error), variant: 'destructive' });
    } finally {
      setAddingSub(false);
    }
  };

  // Handle adding custom sub-subcategory
  const handleAddSubSubcategory = async () => {
    if (!newSubSubcategory.trim() || !selectedCategory?.id || !selectedSubcategory) return;
    setAddingSubSub(true);
    try {
      await addSubSubcategory(selectedCategory.id, selectedCategory.subcategories, selectedSubcategory.slug, newSubSubcategory.trim());
      setFormData((prev) => ({ ...prev, subSubcategory: newSubSubcategory.trim() }));
      setNewSubSubcategory('');
      toast({ title: 'Sub-subcategory added', description: newSubSubcategory.trim() });
    } catch (error) {
      toast({ title: 'Could not add sub-subcategory', description: describeError(error), variant: 'destructive' });
    } finally {
      setAddingSubSub(false);
    }
  };

  // Auto-calculate pricing
  const recalcPricing = useCallback(
    (field: 'price' | 'originalPrice' | 'discount', value: string) => {
      setFormData((prev) => {
        const next = { ...prev, [field]: value };
        const original = parseFloat(next.originalPrice) || 0;
        const price = parseFloat(next.price) || 0;
        const discount = parseFloat(next.discount) || 0;

        if (field === 'price' && original > 0 && price > 0) {
          const disc = ((original - price) / original) * 100;
          next.discount = disc > 0 ? disc.toFixed(1) : '0';
          next.discountType = 'percent';
        } else if (field === 'originalPrice' && price > 0 && original > 0) {
          const disc = ((original - price) / original) * 100;
          next.discount = disc > 0 ? disc.toFixed(1) : '0';
          next.discountType = 'percent';
        } else if (field === 'discount' && original > 0 && discount >= 0) {
          if (next.discountType === 'percent') {
            next.price = (original - (original * discount) / 100).toFixed(2);
          } else {
            next.price = (original - discount).toFixed(2);
          }
        }
        return next;
      });
    },
    []
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (['price', 'originalPrice', 'discount'].includes(name)) {
      recalcPricing(name as any, value);
    } else if (name === 'stock') {
      const units = parseInt(value, 10) || 0;
      // A product hidden because it sold out goes back on sale when it is
      // restocked. Done here, on the visible switch, rather than silently at
      // save time - so the admin sees it and can still turn it off.
      const reList = units > 0 && inactiveReason === 'outOfStock' && !formData.isActive;
      setFormData((prev) => ({ ...prev, stock: value, ...(reList ? { isActive: true } : {}) }));
      if (reList) {
        setStatusNote('Back in stock. This product goes live again when you save.');
      } else if (units <= 0 && formData.isActive) {
        setStatusNote('Stock is 0. This product will be hidden from the store when you save.');
      } else if (units > 0) {
        setStatusNote(null);
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Image handlers
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const picked = Array.from(input.files || []);
    input.value = ''; // let the same file be picked again after a fix
    if (picked.length === 0) return;

    const slots = MAX_PRODUCT_IMAGES - images.length;
    if (slots <= 0) {
      toast({
        title: `Maximum ${MAX_PRODUCT_IMAGES} photos per product`,
        description: 'Remove a photo before adding another.',
        variant: 'destructive',
      });
      return;
    }
    const files = picked.slice(0, slots);
    if (picked.length > slots) {
      toast({
        title: `Only ${slots} more photo${slots === 1 ? '' : 's'} allowed`,
        description: `A product can have at most ${MAX_PRODUCT_IMAGES} photos. Uploading the first ${slots}.`,
      });
    }

    setUploadingImages(true);
    setUploadProgress(0);
    const uploadedUrls: string[] = [];
    const failures: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        try {
          const result = await uploadImage(files[i], {
            category: 'products',
            onProgress: (progress) => {
              setUploadProgress(Math.round(((i + progress.percentage / 100) / files.length) * 100));
            },
          });
          uploadedUrls.push(result.url);
          sessionUploadsRef.current.push(result.url);
        } catch (error) {
          failures.push(describeUploadError(error));
          // Paused for the storage limit: the rest would fail the same way.
          if ((error as { code?: string })?.code === 'LIMIT_REACHED') break;
        }
      }
      if (uploadedUrls.length > 0) {
        setImages((prev) => [...prev, ...uploadedUrls].slice(0, MAX_PRODUCT_IMAGES));
        clearFieldError('images');
        if (!thumbnail) setThumbnail(uploadedUrls[0]);
        toast({ title: uploadedUrls.length === 1 ? 'Image uploaded' : `${uploadedUrls.length} images uploaded` });
      }
      if (failures.length > 0) {
        toast({
          title: failures.length === 1 ? 'A photo was not uploaded' : `${failures.length} photos were not uploaded`,
          description: [...new Set(failures)].join(' '),
          variant: 'destructive',
        });
      }
    } finally {
      setUploadingImages(false);
      setUploadProgress(0);
    }
  };

  const handleRemoveImage = (url: string) => {
    setImages((prev) => prev.filter((img) => img !== url));
    if (thumbnail === url) setThumbnail(images.find((img) => img !== url) || '');
  };

  const handleAddImageUrl = () => {
    if (!imageUrlInput.trim()) return;
    if (images.length >= MAX_PRODUCT_IMAGES) {
      toast({
        title: `Maximum ${MAX_PRODUCT_IMAGES} photos per product`,
        description: 'Remove a photo before adding another.',
        variant: 'destructive',
      });
      return;
    }
    try {
      new URL(imageUrlInput);
      setImages((prev) => [...prev, imageUrlInput]);
      clearFieldError('images');
      if (!thumbnail) setThumbnail(imageUrlInput);
      setImageUrlInput('');
      toast({ title: 'Image added' });
    } catch {
      toast({ title: 'That link is not valid', description: 'Paste a full address starting with https://', variant: 'destructive' });
    }
  };

  // Video handlers – YouTube extraction
  const handleAddVideoUrl = () => {
    if (!videoUrlInput.trim()) return;
    if (isYouTubeUrl(videoUrlInput)) {
      const ytId = extractYouTubeId(videoUrlInput);
      if (ytId) {
        setVideos((prev) => [...prev, 'yt:' + ytId]);
        setVideoUrlInput('');
        toast({ title: 'YouTube video added' });
        return;
      }
    }
    try {
      new URL(videoUrlInput);
      setVideos((prev) => [...prev, videoUrlInput]);
      setVideoUrlInput('');
      toast({ title: 'Video added' });
    } catch {
      toast({ title: 'That link is not valid', description: 'Paste a full address starting with https://', variant: 'destructive' });
    }
  };

  // Specification handlers
  const handleSpecChange = (index: number, field: 'label' | 'value', val: string) => {
    setSpecifications((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };
  const addSpecRow = () => setSpecifications((prev) => [...prev, { label: '', value: '' }]);
  const removeSpecRow = (index: number) => setSpecifications((prev) => prev.filter((_, i) => i !== index));

  /** Field name -> message for everything the form requires. */
  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) errors.name = 'Product name is required';
    if (!formData.category) errors.category = 'Pick a category';

    if (silverPricing.enabled) {
      // The price is computed from the calculator, so validate its inputs.
      if (!(parseFloat(silverPricing.weightGrams) > 0)) {
        errors.weightGrams = 'Enter the silver weight in grams';
      }
      if (!(silverRate > 0)) {
        errors.silverRate = 'No live silver rate is set. Add one under Silver Rate, or turn the calculator off';
      }
    } else if (!(parseFloat(formData.price) > 0)) {
      errors.price = 'Enter a price greater than 0';
    }

    if (dealerLoad === 'ready') {
      const dealerError = dealerPriceError(dealerPrice, parseFloat(formData.price));
      if (dealerError) errors.dealerPrice = dealerError;
    }

    if (images.length === 0) errors.images = 'Add at least one product image';
    else if (images.length > MAX_PRODUCT_IMAGES) {
      errors.images = `A product can have at most ${MAX_PRODUCT_IMAGES} photos. Remove ${images.length - MAX_PRODUCT_IMAGES}`;
    }

    if (delivery.override && delivery.chargeEnabled) {
      if (delivery.withinState === '' && delivery.outsideState === '') {
        errors.delivery = 'Enter the delivery charges, or switch "Charge delivery" off for free delivery';
      }
    }

    return errors;
  };

  /** Human labels for the toast summary, in the order they appear in the form. */
  const FIELD_LABELS: Record<string, string> = {
    name: 'Product name',
    category: 'Category',
    price: 'Price',
    dealerPrice: 'Dealer price',
    weightGrams: 'Silver weight',
    silverRate: 'Silver rate',
    images: 'Product images',
    delivery: 'Delivery charges',
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const missing = Object.keys(errors).map((k) => FIELD_LABELS[k] || k);
      toast({
        title: missing.length === 1 ? 'One field needs attention' : `${missing.length} fields need attention`,
        description: Object.values(errors).join(' · '),
        variant: 'destructive',
      });
      // Put the first problem on screen — the form is long enough that an
      // error above the fold is invisible when you save from the bottom.
      // After React has rendered the error state (the attribute is not on the
      // page yet while this handler runs).
      requestAnimationFrame(() => {
        const first = document.querySelector<HTMLElement>('[data-field-error="true"]');
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        first?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        (first?.querySelector('input, textarea, button') as HTMLElement | null)?.focus?.({ preventScroll: true });
      });
      return;
    }
    setFieldErrors({});

    // A product this form already created (its dealer price failed to save) is updated, not created again.
    const existingId = productId ?? createdIdRef.current;
    setLoading(true);
    try {
      specifications.forEach((spec) => {
        if (spec.label && spec.value) saveSpecSuggestion(spec.label, spec.value);
      });
      setSpecSuggestions(loadSpecSuggestions());

      const specsObj: Record<string, string> = {};
      specifications.forEach((spec) => {
        if (spec.label.trim()) specsObj[spec.label.trim().toLowerCase()] = spec.value.trim();
      });

      // Nothing sells with no stock, so a product saved at 0 is hidden even if
      // the Active switch was left on. It comes back by itself on restock.
      const stockUnits = parseInt(formData.stock) || 0;
      const goesLive = formData.isActive && stockUnits > 0;
      const hiddenForStock = formData.isActive && stockUnits <= 0;

      const productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> = {
        name: formData.name,
        slug: generateSlug(formData.name),
        // `null` rather than `undefined`: on an update Firestore treats
        // undefined as "leave unchanged", so clearing a barcode or subcategory
        // would silently keep the old value.
        barcode: formData.barcode.trim() || null,
        category: formData.category,
        subcategory: formData.subcategory || null,
        subSubcategory: formData.subSubcategory || null,
        description: formData.description,
        price: parseFloat(formData.price),
        ...(!silverPricing.enabled && formData.originalPrice && { originalPrice: parseFloat(formData.originalPrice) }),
        ...(!silverPricing.enabled && formData.discount && { discount: parseFloat(formData.discount) }),
        currency: 'INR',
        media: { images, videos, thumbnail: thumbnail || images[0] },
        inventory: { stock: parseInt(formData.stock) || 0, sku: '', weight: formData.weight, weightUnit: formData.weightUnit },
        specifications: specsObj as any,
        flags: { isActive: goesLive, isFeatured: formData.isFeatured, isNewArrival: formData.isNewArrival, isBestSeller: formData.isBestSeller, isTopDeal: formData.isTopDeal, isTrendProduct: formData.isTrendProduct },
        // Recorded only when a rule hid it; a hand-made hide carries none, so
        // it is never switched back on automatically.
        inactiveReason: goesLive
          ? null
          : stockUnits <= 0
            ? 'outOfStock'
            : inactiveReason === 'noImages' && images.length === 0
              ? 'noImages'
              : null,
        // Delivery: only written when the admin explicitly overrides the
        // universal charge, so an untouched product keeps following Commerce.
        // `null` (not undefined) so switching the override off actually clears
        // the stored config and the product falls back to the universal charge.
        delivery: delivery.override
          ? {
              chargeEnabled: delivery.chargeEnabled,
              withinState: parseFloat(delivery.withinState) || 0,
              outsideState: parseFloat(delivery.outsideState) || 0,
            }
          : null,
        // Silver rate-based pricing snapshot
        silverPricing: silverPricing.enabled ? {
          enabled: true,
          weightGrams: parseFloat(silverPricing.weightGrams) || 0,
          wastagePercent: parseFloat(silverPricing.wastagePercent) || 0,
          makingCharges: parseFloat(silverPricing.makingCharges) || 0,
          silverRateUsed: silverRate,
        } : { enabled: false },
      } as any;

      let savedId = existingId;
      if (savedId) {
        await updateProduct(savedId, productData);
      } else {
        savedId = await createProduct(productData, user!.uid);
        createdIdRef.current = savedId;
      }

      // The dealer price is written once the product exists, and only when it
      // changed. If this fails the product is still saved: say so, and stay.
      let dealerPriceSaved = true;
      const dealerValue = parseDealerPrice(dealerPrice);
      if (dealerLoad === 'ready' && dealerValue !== parseDealerPrice(loadedDealerPriceRef.current)) {
        try {
          await setProductDealerPrice(savedId, dealerValue);
          loadedDealerPriceRef.current = dealerPrice;
        } catch (dealerError) {
          console.error('Error saving the dealer price:', dealerError);
          dealerPriceSaved = false;
        }
      }

      if (!dealerPriceSaved) {
        toast({
          title: "Product saved, but the dealer price wasn't. Try saving again.",
          description: hiddenForStock ? `${formData.name} has 0 in stock, so it is hidden from the store.` : formData.name,
          variant: 'destructive',
        });
      } else if (hiddenForStock) {
        // Say so plainly - a product that "saved" but no longer shows on the
        // storefront otherwise looks like a failed save.
        toast({
          title: 'Saved, but hidden: out of stock',
          description: `${formData.name} has 0 in stock, so it is hidden from the store. It goes live again as soon as you add stock.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: existingId ? 'Product saved' : 'Product created', description: formData.name });
      }
      // Staying on the form (dealer price failed): the saved photos are the new baseline, and
      // photos uploaded from here on are still cleaned up if the form is left unsaved.
      savedRef.current = dealerPriceSaved;
      const dropped = [...loadedImagesRef.current, ...sessionUploadsRef.current].filter((url) => !images.includes(url));
      if (dropped.length) void releaseProductImages(dropped);
      loadedImagesRef.current = images;
      sessionUploadsRef.current = [];
      if (dealerPriceSaved) navigate('/admin/products');
    } catch (error) {
      console.error('Error saving product:', error);
      // Show what actually went wrong. A bare "Failed to update product" left
      // no way to tell a permission problem from a bad field or a quota limit.
      toast({
        title: existingId ? 'Could not save the product' : 'Could not create the product',
        description: describeError(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (fetchingProduct) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="h-16 border-b border-border" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-card border border-border bg-card p-6 lg:col-span-2">
            <FormSkeleton fields={5} label="Loading product" />
          </div>
          <div className="rounded-card border border-border bg-card p-6">
            <FormSkeleton fields={3} label="" />
          </div>
        </div>
      </div>
    );
  }

  const goBack = () => navigate('/admin/products');
  const saveLabel = loading
    ? isEditing ? 'Saving' : 'Creating'
    : isEditing ? 'Save product' : 'Create product';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header: sticky so Save is reachable from anywhere in the long form. */}
      <div className="sticky top-0 z-sticky -mx-4 flex flex-wrap items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md lg:-mx-6 lg:px-6">
        {/* Below sm the title row takes the full width and the actions wrap under it, so the title never truncates. */}
        <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto">
          <IconButton label="Back to products" onClick={goBack} tooltip>
            <ArrowLeft />
          </IconButton>
          <div className="min-w-0 flex-1">
            <h1
              className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
              style={{ fontFamily: 'var(--font-heading)', fontStretch: 'var(--font-heading-stretch)' }}
            >
              {isEditing ? 'Edit product' : 'Add product'}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {isEditing ? formData.name || 'Update product details' : 'Add a new product to your catalogue'}
              <span className="ml-2 hidden sm:inline">
                · Required fields are marked <span aria-hidden="true" className="text-status-danger-fg">*</span>
                <span className="sr-only">with an asterisk</span>
              </span>
            </p>
          </div>
        </div>
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <Button type="button" variant="outline" size="sm" className="h-10 flex-1 sm:flex-none" onClick={goBack} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" size="sm" className="h-10 flex-1 sm:flex-none" disabled={loading}>
            {loading ? <Spinner /> : <Save aria-hidden="true" />}
            {saveLabel}
          </Button>
        </div>
      </div>

      <form id="product-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        {/* Main content */}
        <div className="space-y-4 lg:col-span-2 lg:space-y-6">
          {/* Basic info */}
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-foreground leading-tight tracking-tight">Basic information</h2>
              <CardDescription>Name, category and description shown on the product page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div data-field-error={!!fieldErrors.name}>
                <Label htmlFor="pf-name" className="text-foreground/80">
                  Product name<Required />
                </Label>
                <Input
                  id="pf-name"
                  name="name"
                  value={formData.name}
                  onChange={(e) => { clearFieldError('name'); handleInputChange(e); }}
                  placeholder="e.g., Shilajit resin"
                  aria-required="true"
                  aria-invalid={!!fieldErrors.name || undefined}
                  aria-describedby={fieldErrors.name ? 'pf-name-error' : undefined}
                  className={'mt-2' + invalidRing(!!fieldErrors.name)}
                />
                <FieldError id="pf-name-error" message={fieldErrors.name} />
              </div>

              <div>
                <Label htmlFor="pf-barcode" className="text-foreground/80">Barcode<Optional /></Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    id="pf-barcode"
                    name="barcode"
                    value={formData.barcode}
                    onChange={handleInputChange}
                    placeholder="Scan or type the barcode"
                    aria-describedby="pf-barcode-hint"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 shrink-0"
                    onClick={() => setScannerOpen(true)}
                  >
                    <ScanLine aria-hidden="true" />
                    Scan
                  </Button>
                </div>
                <p id="pf-barcode-hint" className="mt-1.5 text-xs text-muted-foreground">
                  Saved with the product so you can find it later by scanning or searching
                  the barcode on the Products page.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div data-field-error={!!fieldErrors.category}>
                  <Label htmlFor="pf-category" className="text-foreground/80">
                    Category<Required />
                  </Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => {
                      clearFieldError('category');
                      setFormData((prev) => ({ ...prev, category: value, subcategory: '', subSubcategory: '' }));
                    }}
                  >
                    <SelectTrigger
                      id="pf-category"
                      aria-required="true"
                      aria-invalid={!!fieldErrors.category || undefined}
                      aria-describedby={fieldErrors.category ? 'pf-category-error' : undefined}
                      className={'mt-2' + invalidRing(!!fieldErrors.category)}
                    >
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError id="pf-category-error" message={fieldErrors.category} />
                </div>

                <div>
                  <Label htmlFor="pf-subcategory" className="text-foreground/80">Subcategory</Label>
                  <Select value={formData.subcategory} onValueChange={(value) => setFormData((prev) => ({ ...prev, subcategory: value, subSubcategory: '' }))} disabled={!formData.category || subcategoryOptions.length === 0}>
                    <SelectTrigger id="pf-subcategory" className="mt-2">
                      <SelectValue placeholder={subcategoryOptions.length > 0 ? 'Select subcategory' : 'No subcategories'} />
                    </SelectTrigger>
                    <SelectContent>
                      {subcategoryOptions.map((sub) => (
                        <SelectItem key={sub.slug} value={sub.name}>{sub.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.category && selectedCategory && (
                    <div className="mt-2 flex gap-1.5">
                      <Input aria-label="New subcategory name" value={newSubcategory} onChange={(e) => setNewSubcategory(e.target.value)} placeholder="New subcategory" className="h-9 text-sm md:text-xs" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSubcategory())} />
                      <Button type="button" size="sm" variant="outline" className="w-9 shrink-0 px-0" aria-label="Add subcategory" onClick={handleAddSubcategory} disabled={addingSub || !newSubcategory.trim()}>
                        {addingSub ? <Spinner /> : <Plus aria-hidden="true" />}
                      </Button>
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="pf-subsub" className="text-foreground/80">Sub-subcategory</Label>
                  <Select value={formData.subSubcategory} onValueChange={(value) => setFormData((prev) => ({ ...prev, subSubcategory: value }))} disabled={!formData.subcategory || subSubcategoryOptions.length === 0}>
                    <SelectTrigger id="pf-subsub" className="mt-2">
                      <SelectValue placeholder={subSubcategoryOptions.length > 0 ? 'Select sub-subcategory' : 'None'} />
                    </SelectTrigger>
                    <SelectContent>
                      {subSubcategoryOptions.map((child) => (
                        <SelectItem key={child.slug} value={child.name}>{child.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.subcategory && selectedSubcategory && (
                    <div className="mt-2 flex gap-1.5">
                      <Input aria-label="New sub-subcategory name" value={newSubSubcategory} onChange={(e) => setNewSubSubcategory(e.target.value)} placeholder="New sub-subcategory" className="h-9 text-sm md:text-xs" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSubSubcategory())} />
                      <Button type="button" size="sm" variant="outline" className="w-9 shrink-0 px-0" aria-label="Add sub-subcategory" onClick={handleAddSubSubcategory} disabled={addingSubSub || !newSubSubcategory.trim()}>
                        {addingSubSub ? <Spinner /> : <Plus aria-hidden="true" />}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="pf-description" className="text-foreground/80">Description</Label>
                <Textarea id="pf-description" name="description" value={formData.description} onChange={handleInputChange} placeholder="What it is, who it is for and what makes it different" className="mt-2 min-h-[120px]" />
              </div>
            </CardContent>
          </Card>

          {/* Media */}
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-foreground leading-tight tracking-tight">Media</h2>
              <CardDescription>Photos and videos. The cover photo is used on product cards.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Images */}
              <div data-field-error={!!fieldErrors.images}>
                <p id="pf-images-label" className="text-sm font-medium leading-none text-foreground/80">
                  Product images<Required />
                </p>
                <FieldError message={fieldErrors.images} />
                <ToggleGroup
                  type="single"
                  value={imageUploadMode}
                  onValueChange={(v) => v && setImageUploadMode(v as 'upload' | 'url')}
                  aria-label="How to add images"
                  className="mb-3 mt-2 grid w-full grid-cols-2"
                >
                  <ToggleGroupItem value="upload" size="sm">Upload files</ToggleGroupItem>
                  <ToggleGroupItem value="url" size="sm">Paste URL</ToggleGroupItem>
                </ToggleGroup>

                {images.length >= MAX_PRODUCT_IMAGES ? (
                  <div className="flex h-32 w-full items-center justify-center rounded-card border-2 border-dashed border-border bg-muted/50 px-4 text-center">
                    <p className="text-sm text-foreground/80">
                      {MAX_PRODUCT_IMAGES} of {MAX_PRODUCT_IMAGES} photos added, the maximum. Remove one to add another.
                    </p>
                  </div>
                ) : imageUploadMode === 'upload' ? (
                  <label
                    className={
                      'flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed bg-muted/30 transition-colors duration-hover hover:border-primary has-[input:focus-visible]:border-primary has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring ' +
                      (fieldErrors.images ? 'border-destructive' : 'border-input')
                    }
                  >
                    <div className="flex flex-col items-center justify-center px-4 text-center">
                      {uploadingImages ? (
                        <>
                          <Spinner size={24} className="mb-2 text-primary" />
                          <p className="text-sm tabular-nums text-foreground/80" aria-live="polite">Uploading {uploadProgress}%</p>
                        </>
                      ) : (
                        <>
                          <Upload aria-hidden="true" className="mb-2 h-7 w-7 text-muted-foreground" />
                          <p className="text-sm text-foreground/80">Click to upload or drag and drop</p>
                          <p className="text-xs text-muted-foreground">
                            JPG, PNG or WebP · max 500 KB each · up to {MAX_PRODUCT_IMAGES} photos ({images.length}/{MAX_PRODUCT_IMAGES} used)
                          </p>
                        </>
                      )}
                    </div>
                    <input type="file" className="sr-only" aria-labelledby="pf-images-label" accept={IMAGE_ACCEPT} multiple onChange={handleImageUpload} disabled={uploadingImages} />
                  </label>
                ) : (
                  <div className="flex gap-2">
                    <Input type="url" aria-label="Image URL" value={imageUrlInput} onChange={(e) => setImageUrlInput(e.target.value)} placeholder="https://example.com/image.jpg" className="flex-1" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddImageUrl())} />
                    <Button type="button" variant="outline" size="sm" className="h-11" onClick={handleAddImageUrl}>Add image</Button>
                  </div>
                )}

                {images.length > 0 && (
                  <>
                    <p className="mb-2 mt-4 text-xs text-muted-foreground">{plural(images.length, 'image')} · drag to reorder · the cover is shown on cards</p>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {images.map((url, index) => (
                        <div
                          key={url + index}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', String(index));
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const from = Number(e.dataTransfer.getData('text/plain'));
                            const to = index;
                            if (from === to || isNaN(from)) return;
                            setImages((prev) => {
                              const next = [...prev];
                              const [moved] = next.splice(from, 1);
                              next.splice(to, 0, moved);
                              return next;
                            });
                          }}
                          className="group relative cursor-move"
                        >
                          <div className={'aspect-square w-full overflow-hidden rounded-card bg-muted ' + (thumbnail === url ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'ring-1 ring-border')}>
                            <SmartImage src={url} alt={'Product image ' + (index + 1)} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} preset="card" />
                          </div>
                          <span className="tag-dark absolute right-1.5 top-1.5 tabular-nums">{index + 1}</span>
                          {thumbnail === url && <span className="absolute left-1.5 top-1.5 rounded-chip bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">Cover</span>}
                          <div className="absolute inset-x-1.5 bottom-1.5 flex justify-end gap-1 opacity-100 transition-opacity duration-hover lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                            {thumbnail !== url && (
                              <IconButton label={`Use image ${index + 1} as cover`} variant="onPhoto" size="sm" onClick={() => setThumbnail(url)}>
                                <ImageIcon />
                              </IconButton>
                            )}
                            <IconButton label={`Remove image ${index + 1}`} variant="onPhoto" size="sm" onClick={() => handleRemoveImage(url)}>
                              <X />
                            </IconButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Videos: YouTube aware */}
              <div>
                <Label htmlFor="pf-video" className="text-foreground/80">Product videos<Optional /></Label>
                <p id="pf-video-hint" className="mb-2 mt-1.5 text-xs text-muted-foreground">Paste a YouTube link and the video ID is picked up for you, or paste a direct video URL.</p>
                <div className="flex gap-2">
                  <Input id="pf-video" type="url" aria-describedby="pf-video-hint" value={videoUrlInput} onChange={(e) => setVideoUrlInput(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="flex-1" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddVideoUrl())} />
                  <Button type="button" variant="outline" size="sm" className="h-11" onClick={handleAddVideoUrl}>Add video</Button>
                </div>
                {videos.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {videos.map((v, index) => {
                      const isYt = v.startsWith('yt:');
                      const ytId = isYt ? v.replace('yt:', '') : null;
                      return (
                        <div key={index} className="group relative overflow-hidden rounded-card bg-muted">
                          {ytId ? (
                            <img src={'https://img.youtube.com/vi/' + ytId + '/mqdefault.jpg'} alt={`YouTube video ${index + 1}`} className="aspect-video w-full object-cover" />
                          ) : (
                            <div className="flex aspect-video w-full items-center justify-center">
                              <Video aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                          {ytId && <span className="tag-dark absolute left-1.5 top-1.5">YouTube</span>}
                          <IconButton
                            label={`Remove video ${index + 1}`}
                            variant="onPhoto"
                            size="sm"
                            onClick={() => setVideos((prev) => prev.filter((_, i) => i !== index))}
                            className="absolute bottom-1.5 right-1.5 opacity-100 transition-opacity duration-hover lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                          >
                            <X />
                          </IconButton>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tags */}
              <div>
                <Label htmlFor="pf-tags" className="text-foreground/80">Tags<Optional /></Label>
                <Input id="pf-tags" name="tags" value={formData.tags} onChange={handleInputChange} placeholder="new, featured, bestseller (comma-separated)" className="mt-2" />
              </div>
            </CardContent>
          </Card>

          {/* Pricing and inventory */}
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-foreground leading-tight tracking-tight">Pricing and inventory</h2>
              <CardDescription>What customers pay and how many you have.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* ── Silver Rate Calculator (optional) ── */}
              {SILVER_PRICING_ENABLED && (
              <div className="rounded-card border border-dashed border-primary/45 bg-primary/6 p-4 space-y-3">
                {/* Entire header row is clickable to toggle */}
                <div
                  className="flex items-center justify-between gap-3 cursor-pointer select-none flex-wrap"
                  onClick={() => {
                    const next = !silverPricing.enabled;
                    setSilverPricing((prev) => ({ ...prev, enabled: next }));
                    if (!next) {
                      setFormData((prev) => ({ ...prev, originalPrice: '', discount: '0' }));
                    }
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Calculator className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-foreground truncate">Silver rate calculator</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 border transition-colors shrink-0 ${
                      silverPricing.enabled
                        ? 'text-primary bg-primary/15 border-primary/45 font-medium'
                        : 'text-muted-foreground bg-card border-border'
                    }`}>
                      {silverPricing.enabled ? 'Enabled' : 'Optional'}
                    </span>
                  </div>
                  {/* Stop propagation so clicking the Switch itself doesn't fire onClick twice */}
                  <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <Switch
                      checked={silverPricing.enabled}
                      onCheckedChange={(checked) => {
                        setSilverPricing((prev) => ({ ...prev, enabled: checked }));
                        if (!checked) {
                          setFormData((prev) => ({ ...prev, originalPrice: '', discount: '0' }));
                        }
                      }}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enable for silver jewellery. Original Price = (grams × silver rate) + wastage + making charges.
                  For fixed-price articles, leave this off.
                </p>

                {silverPricing.enabled && (
                  <div className="space-y-4 pt-1">
                    {/* Silver rate display, live Firestore listener */}
                    <div className="flex items-center gap-2 bg-card border border-primary/30 rounded-lg px-3 py-2">
                      <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-xs text-foreground/80 flex-1">
                        Current silver rate:{' '}
                        {silverRate > 0 ? (
                          <strong className="text-primary">₹{silverRate.toFixed(2)} / gram</strong>
                        ) : (
                          <span className="text-status-danger-fg">Not set. Set it on the Silver Rate page first</span>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-status-success-fg bg-status-success-bg border border-status-success-line rounded-full px-2 py-0.5 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-status-success-fg animate-pulse" />
                        LIVE
                      </span>
                    </div>

                    {/* Inputs row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div data-field-error={!!fieldErrors.weightGrams || !!fieldErrors.silverRate}>
                        <Label className="text-foreground/80 text-xs font-medium">
                          Weight (grams), x<Required />
                        </Label>
                        <Input
                          type="number"
                          value={silverPricing.weightGrams}
                          onChange={(e) => {
                            clearFieldError('weightGrams');
                            setSilverPricing((prev) => ({ ...prev, weightGrams: e.target.value }));
                          }}
                          placeholder="e.g., 12"
                          min="0"
                          step="0.01"
                          className={'mt-1.5 bg-card border-primary/30 text-foreground text-sm' + invalidRing(!!fieldErrors.weightGrams)}
                        />
                        <FieldError message={fieldErrors.weightGrams || fieldErrors.silverRate} />
                        {silverRate > 0 && silverPricing.weightGrams && (
                          <p className="text-xs text-primary mt-1">
                            Silver cost: ₹{(parseFloat(silverPricing.weightGrams || '0') * silverRate).toFixed(2)}
                          </p>
                        )}
                      </div>

                      <div>
                        <Label className="text-foreground/80 text-xs font-medium">Wastage %, y</Label>
                        <Input
                          type="number"
                          value={silverPricing.wastagePercent}
                          onChange={(e) => setSilverPricing((prev) => ({ ...prev, wastagePercent: e.target.value }))}
                          placeholder="e.g., 10"
                          min="0"
                          max="100"
                          step="0.1"
                          className="mt-1.5 bg-card border-primary/30 text-foreground text-sm"
                        />
                        {silverRate > 0 && silverPricing.weightGrams && silverPricing.wastagePercent && (
                          <p className="text-xs text-primary mt-1">
                            Wastage: ₹{(parseFloat(silverPricing.weightGrams || '0') * silverRate * (parseFloat(silverPricing.wastagePercent || '0') / 100)).toFixed(2)}
                          </p>
                        )}
                      </div>

                      <div>
                        <Label className="text-foreground/80 text-xs font-medium">Making charges (₹), z</Label>
                        <Input
                          type="number"
                          value={silverPricing.makingCharges}
                          onChange={(e) => setSilverPricing((prev) => ({ ...prev, makingCharges: e.target.value }))}
                          placeholder="e.g., 50"
                          min="0"
                          step="1"
                          className="mt-1.5 bg-card border-primary/30 text-foreground text-sm"
                        />
                      </div>
                    </div>

                    {/* Breakdown summary */}
                    {silverRate > 0 && silverPricing.weightGrams && (() => {
                      const grams = parseFloat(silverPricing.weightGrams) || 0;
                      const wastage = parseFloat(silverPricing.wastagePercent) || 0;
                      const making = parseFloat(silverPricing.makingCharges) || 0;
                      const x = grams * silverRate;
                      const y = x * (wastage / 100);
                      const z = making;
                      const total = Math.ceil(x + y + z);
                      return (
                        <div className="bg-card border border-primary/30 rounded-lg p-3 text-xs space-y-1.5">
                          <div className="flex justify-between text-foreground/80">
                            <span>Silver cost ({grams}g × ₹{silverRate}/g)</span>
                            <span className="font-medium text-foreground">₹{x.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-foreground/80">
                            <span>Wastage ({wastage}%)</span>
                            <span className="font-medium text-foreground">₹{y.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-foreground/80">
                            <span>Making charges</span>
                            <span className="font-medium text-foreground">₹{z.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between border-t border-primary/30 pt-1.5 font-semibold text-primary">
                            <span>Original price (x + y + z)</span>
                            <span>₹{total.toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              )}

              {/* Standard pricing fields */}
              {silverPricing.enabled ? (
                <div className="rounded-card border border-primary/30 bg-primary/10 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Price (live)</span>
                    {formData.price ? (
                      <span className="text-lg font-bold tabular-nums text-foreground">
                        {formatINR(parseFloat(formData.price))}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">at ₹{silverRate}/g</span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Fill calculator inputs above</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Customers always see the price recomputed at the current live silver rate.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="pf-original-price" className="text-foreground/80">Original price (&#8377;)</Label>
                    <Input
                      id="pf-original-price"
                      name="originalPrice"
                      type="number"
                      inputMode="decimal"
                      value={formData.originalPrice}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="mt-2 tabular-nums"
                    />
                  </div>
                  <div data-field-error={!!fieldErrors.price}>
                    <Label htmlFor="pf-price" className="text-foreground/80">
                      Price (&#8377;)<Required />
                    </Label>
                    <Input
                      id="pf-price"
                      name="price"
                      type="number"
                      inputMode="decimal"
                      value={formData.price}
                      onChange={(e) => { clearFieldError('price'); handleInputChange(e); }}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      aria-required="true"
                      aria-invalid={!!fieldErrors.price || undefined}
                      aria-describedby={fieldErrors.price ? 'pf-price-error' : undefined}
                      className={'mt-2 tabular-nums' + invalidRing(!!fieldErrors.price)}
                    />
                    <FieldError id="pf-price-error" message={fieldErrors.price} />
                  </div>
                  <div>
                    <Label htmlFor="pf-discount" className="text-foreground/80">Discount</Label>
                    <div className="mt-2 flex gap-2">
                      <Input id="pf-discount" name="discount" type="number" inputMode="decimal" value={formData.discount} onChange={handleInputChange} placeholder="0" min="0" step="0.1" aria-describedby="pf-discount-hint" className="flex-1 tabular-nums" />
                      <Select value={formData.discountType} onValueChange={(val) => setFormData((prev) => ({ ...prev, discountType: val as any }))}>
                        <SelectTrigger aria-label="Discount type" className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">%</SelectItem>
                          <SelectItem value="amount">&#8377;</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p id="pf-discount-hint" className="mt-1.5 text-xs text-muted-foreground">Worked out from the two prices</p>
                  </div>
                </div>
              )}

              <DealerPriceFieldView
                value={dealerPrice}
                onChange={(value) => { clearFieldError('dealerPrice'); setDealerPrice(value); }}
                onBlur={() => {
                  const message = dealerPriceError(dealerPrice, parseFloat(formData.price));
                  if (message) setFieldErrors((prev) => ({ ...prev, dealerPrice: message }));
                }}
                regularPrice={parseFloat(formData.price) || 0}
                storeWidePercent={dealerPercent}
                load={dealerLoad}
                // Once flagged (on leaving the field or on Save) the live message shows while it is still wrong.
                error={fieldErrors.dealerPrice ? dealerPriceError(dealerPrice, parseFloat(formData.price)) : undefined}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="pf-stock" className="text-foreground/80">Stock</Label>
                  <Input id="pf-stock" name="stock" type="number" inputMode="numeric" value={formData.stock} onChange={handleInputChange} placeholder="0" min="0" className="mt-2 tabular-nums" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="pf-weight" className="text-foreground/80">Weight</Label>
                  <div className="mt-2 flex gap-2">
                    <Input id="pf-weight" name="weight" type="number" inputMode="decimal" value={formData.weight} onChange={handleInputChange} placeholder="e.g., 100" min="0" step="0.01"
                      readOnly={silverPricing.enabled}
                      className={`flex-1 tabular-nums ${silverPricing.enabled ? 'cursor-not-allowed bg-muted text-muted-foreground' : ''}`}
                    />
                    <Select value={formData.weightUnit} onValueChange={(val) => setFormData((prev) => ({ ...prev, weightUnit: val as 'grams' | 'kgs' }))} disabled={silverPricing.enabled}>
                      <SelectTrigger aria-label="Weight unit" className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="grams">Grams</SelectItem>
                        <SelectItem value="kgs">Kilograms</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {silverPricing.enabled && (
                    <p className="mt-1.5 text-xs text-muted-foreground">Synced from the silver rate calculator</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Specifications: dynamic */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-foreground leading-tight tracking-tight">Specifications</h2>
                <CardDescription>Shown as a table on the product page.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addSpecRow} className="shrink-0">
                <Plus aria-hidden="true" /> Add field
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {specifications.map((spec, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input aria-label={`Specification ${idx + 1} label`} value={spec.label} onChange={(e) => handleSpecChange(idx, 'label', e.target.value)} placeholder="Label (e.g., Net quantity)" />
                  </div>
                  <div className="relative flex-[2]">
                    <Input aria-label={spec.label ? `${spec.label} value` : `Specification ${idx + 1} value`} value={spec.value} onChange={(e) => handleSpecChange(idx, 'value', e.target.value)} placeholder="Value (e.g., 30 ml)" list={'spec-suggestions-' + idx} />
                    {spec.label && specSuggestions[spec.label.toLowerCase().trim()] && (
                      <datalist id={'spec-suggestions-' + idx}>
                        {specSuggestions[spec.label.toLowerCase().trim()].map((s, si) => (
                          <option key={si} value={s} />
                        ))}
                      </datalist>
                    )}
                  </div>
                  {specifications.length > 1 && (
                    <IconButton
                      label={spec.label ? `Remove ${spec.label}` : `Remove specification ${idx + 1}`}
                      onClick={() => removeSpecRow(idx)}
                      className="text-muted-foreground hover:text-status-danger-fg"
                    >
                      <Trash2 />
                    </IconButton>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Values you entered before appear as suggestions.</p>
            </CardContent>
          </Card>

          {/* Delivery: per-product override of Commerce > Delivery */}
          <Card>
            <CardHeader>
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground leading-tight tracking-tight">
                <Truck aria-hidden="true" className="h-4 w-4 text-muted-foreground" /> Delivery
              </h2>
              <CardDescription>Override the store-wide delivery charge for this product.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="pf-delivery-override" className="text-foreground/80">Set delivery for this product</Label>
                  <p id="pf-delivery-override-hint" className="mt-1 text-xs text-muted-foreground">
                    Off: this product follows the universal charge in Commerce → Delivery.
                  </p>
                </div>
                <Switch
                  id="pf-delivery-override"
                  aria-describedby="pf-delivery-override-hint"
                  checked={delivery.override}
                  onCheckedChange={(checked) => setDelivery((p) => ({ ...p, override: checked }))}
                />
              </div>

              {delivery.override && (
                <div className="space-y-4 border-t border-border pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label htmlFor="pf-delivery-charge" className="text-foreground/80">Charge delivery</Label>
                      <p id="pf-delivery-charge-hint" className="mt-1 text-xs text-muted-foreground">
                        Off means this product always ships free.
                      </p>
                    </div>
                    <Switch
                      id="pf-delivery-charge"
                      aria-describedby="pf-delivery-charge-hint"
                      checked={delivery.chargeEnabled}
                      onCheckedChange={(checked) =>
                        setDelivery((p) => ({ ...p, chargeEnabled: checked }))
                      }
                    />
                  </div>

                  {delivery.chargeEnabled ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-field-error={!!fieldErrors.delivery}>
                      {fieldErrors.delivery && (
                        <div className="sm:col-span-2">
                          <FieldError id="pf-delivery-error" message={fieldErrors.delivery} />
                        </div>
                      )}
                      <div>
                        <Label htmlFor="pf-within" className="text-foreground/80">Within {homeState} (&#8377;)</Label>
                        <Input
                          id="pf-within"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          value={delivery.withinState}
                          onChange={(e) => { clearFieldError('delivery'); setDelivery((p) => ({ ...p, withinState: e.target.value })); }}
                          placeholder="0"
                          aria-invalid={!!fieldErrors.delivery || undefined}
                          aria-describedby={fieldErrors.delivery ? 'pf-delivery-error' : undefined}
                          className={'mt-2 tabular-nums' + invalidRing(!!fieldErrors.delivery)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="pf-outside" className="text-foreground/80">Outside {homeState} (&#8377;)</Label>
                        <Input
                          id="pf-outside"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          value={delivery.outsideState}
                          onChange={(e) => { clearFieldError('delivery'); setDelivery((p) => ({ ...p, outsideState: e.target.value })); }}
                          placeholder="0"
                          aria-invalid={!!fieldErrors.delivery || undefined}
                          aria-describedby={fieldErrors.delivery ? 'pf-delivery-error' : undefined}
                          className={'mt-2 tabular-nums' + invalidRing(!!fieldErrors.delivery)}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground sm:col-span-2">
                        A state listed under Commerce → Delivery → Per-state rates overrides the
                        outside {homeState} figure for that destination, and free delivery above the
                        order threshold still applies.
                      </p>
                    </div>
                  ) : (
                    <Notice tone="success" compact>
                      Free delivery. No charge is added for this product.
                    </Notice>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4 lg:space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-foreground leading-tight tracking-tight">Status</h2>
              <CardDescription>Where this product appears in the store.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor="pf-active" className="text-foreground/80">Live in store</Label>
                  <p id="pf-active-hint" className="mt-0.5 text-xs text-muted-foreground">Off hides it from shoppers</p>
                </div>
                <Switch id="pf-active" aria-describedby="pf-active-hint" checked={formData.isActive} onCheckedChange={(checked) => { setStatusNote(null); setFormData((prev) => ({ ...prev, isActive: checked })); }} />
              </div>
              {!formData.isActive && inactiveReason && !statusNote && (
                <Notice tone="info" compact>
                  {inactiveReason === 'outOfStock'
                    ? 'Hidden automatically because it sold out. Add stock and it goes live again.'
                    : 'Hidden because it had no photos. Add a photo, then switch Live in store on.'}
                </Notice>
              )}
              {statusNote && (
                <Notice tone="info" compact>{statusNote}</Notice>
              )}
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="pf-featured" className="text-foreground/80">Featured</Label>
                <Switch id="pf-featured" checked={formData.isFeatured} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isFeatured: checked }))} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="pf-new" className="text-foreground/80">New arrival</Label>
                <Switch id="pf-new" checked={formData.isNewArrival} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isNewArrival: checked }))} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="pf-bestseller" className="text-foreground/80">Best seller</Label>
                <Switch id="pf-bestseller" checked={formData.isBestSeller} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isBestSeller: checked }))} />
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-3 text-xs font-medium text-muted-foreground">Shop flags</p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="pf-topdeal" className="text-foreground/80">Top deal</Label>
                    <Switch id="pf-topdeal" checked={formData.isTopDeal} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isTopDeal: checked }))} />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="pf-trend" className="text-foreground/80">Trend product</Label>
                    <Switch id="pf-trend" checked={formData.isTrendProduct} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isTrendProduct: checked }))} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions: same order as the header, right-aligned */}
        <div className="flex justify-end gap-3 border-t border-border pt-4 lg:col-span-3">
          <Button type="button" variant="outline" onClick={goBack} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Spinner />}
            {saveLabel}
          </Button>
        </div>
      </form>

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleScannedCode}
        description="Point the camera at the product barcode. It is saved with the product."
      />
    </div>
  );
};

export default ProductForm;
