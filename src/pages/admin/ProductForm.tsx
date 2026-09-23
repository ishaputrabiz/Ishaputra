import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  X,
  Loader2,
  Image as ImageIcon,
  Video,
  Plus,
  Trash2,
  Calculator,
  Info,
  ScanLine,
  Truck,
  Save,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  <span className="text-red-500 ml-0.5" title="Required">
    *
  </span>
);

/** Inline validation message shown under the field it belongs to. */
const FieldError = ({ message }: { message?: string }) =>
  message ? (
    <p className="mt-1 text-xs font-medium text-red-600 flex items-center gap-1">
      <span aria-hidden>!</span>
      {message}
    </p>
  ) : null;

/** Red ring on an invalid control, so the offending field is obvious. */
const invalidRing = (hasError?: boolean) =>
  hasError ? ' border-red-400 ring-1 ring-red-300 focus-visible:ring-red-400' : '';

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
  /** Shown under the Active switch when a rule changed it for the admin. */
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
    { label: 'Material', value: '' },
    { label: 'Purity', value: '' },
    { label: 'Dimensions', value: '' },
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
        const defaultLabels = ['material', 'purity', 'dimensions'];
        defaultLabels.forEach((key) => {
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
      toast({ title: 'Success', description: 'Subcategory added' });
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
      toast({ title: 'Success', description: 'Sub-subcategory added' });
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
        setStatusNote('Back in stock - this product will go live again when you save.');
      } else if (units <= 0 && formData.isActive) {
        setStatusNote('Stock is 0 - this product will be hidden from the store when you save.');
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
        toast({ title: 'Success', description: `${uploadedUrls.length} image(s) uploaded` });
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
      toast({ title: 'Success', description: 'Image URL added' });
    } catch {
      toast({ title: 'Invalid URL', description: 'Please enter a valid URL', variant: 'destructive' });
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
        toast({ title: 'Success', description: 'YouTube video added' });
        return;
      }
    }
    try {
      new URL(videoUrlInput);
      setVideos((prev) => [...prev, videoUrlInput]);
      setVideoUrlInput('');
      toast({ title: 'Success', description: 'Video URL added' });
    } catch {
      toast({ title: 'Invalid URL', description: 'Please enter a valid URL', variant: 'destructive' });
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
        errors.silverRate = 'No live silver rate is set — add one under Silver Rate, or turn the calculator off';
      }
    } else if (!(parseFloat(formData.price) > 0)) {
      errors.price = 'Enter a price greater than 0';
    }

    if (images.length === 0) errors.images = 'Add at least one product image';
    else if (images.length > MAX_PRODUCT_IMAGES) {
      errors.images = `A product can have at most ${MAX_PRODUCT_IMAGES} photos — remove ${images.length - MAX_PRODUCT_IMAGES}`;
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
    name: 'Product Name',
    category: 'Category',
    price: 'Price',
    weightGrams: 'Silver weight',
    silverRate: 'Silver rate',
    images: 'Product Images',
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
      const first = document.querySelector<HTMLElement>('[data-field-error="true"]');
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (first?.querySelector('input, textarea, button') as HTMLElement | null)?.focus?.();
      return;
    }
    setFieldErrors({});

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

      if (isEditing) {
        await updateProduct(productId!, productData);
      } else {
        await createProduct(productData, user!.uid);
      }
      if (hiddenForStock) {
        // Say so plainly - a product that "saved" but no longer shows on the
        // storefront otherwise looks like a failed save.
        toast({
          title: 'Saved, but hidden: out of stock',
          description: `${formData.name} has 0 in stock, so it is hidden from the store. It goes live again as soon as you add stock.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Success', description: isEditing ? 'Product updated successfully' : 'Product created successfully' });
      }
      savedRef.current = true;
      const dropped = [...loadedImagesRef.current, ...sessionUploadsRef.current].filter((url) => !images.includes(url));
      if (dropped.length) void releaseProductImages(dropped);
      navigate('/admin/products');
    } catch (error) {
      console.error('Error saving product:', error);
      // Show what actually went wrong. A bare "Failed to update product" left
      // no way to tell a permission problem from a bad field or a quota limit.
      toast({
        title: 'Failed to ' + (isEditing ? 'update' : 'create') + ' product',
        description: describeError(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (fetchingProduct) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header — sticky so the save button is reachable from anywhere in the
          form. The long form used to put "Update Product" only at the very
          bottom, which meant scrolling past every section to save one edit. */}
      <div className="sticky top-0 z-30 -mx-4 px-4 sm:-mx-6 sm:px-6 py-3 bg-white/95 backdrop-blur border-b border-gray-200 flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/products')} className="text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
            {isEditing ? 'Edit Product' : 'Add New Product'}
          </h1>
          <p className="text-gray-500 text-xs truncate">
            {isEditing ? formData.name || 'Update product details' : 'Add a new product to your catalog'}
            <span className="ml-2 hidden sm:inline text-gray-400">
              · fields marked <span className="text-red-500">*</span> are required
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button
            type="button"
            variant="outline"
            className="border-gray-300 text-gray-700 hover:bg-gray-100"
            onClick={() => navigate('/admin/products')}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="product-form"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {loading
              ? isEditing ? 'Updating…' : 'Creating…'
              : isEditing ? 'Update Product' : 'Create Product'}
          </Button>
        </div>
      </div>

      <form id="product-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">
          {/* Basic Info */}
          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div data-field-error={!!fieldErrors.name}>
                <Label className="text-gray-700">
                  Product Name<Required />
                </Label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={(e) => { clearFieldError('name'); handleInputChange(e); }}
                  placeholder="Enter product name"
                  className={'mt-2 bg-gray-100 border-gray-300 text-gray-900' + invalidRing(!!fieldErrors.name)}
                />
                <FieldError message={fieldErrors.name} />
              </div>

              <div>
                <Label className="text-gray-700">Barcode</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    name="barcode"
                    value={formData.barcode}
                    onChange={handleInputChange}
                    placeholder="Scan or type the barcode"
                    className="flex-1 bg-gray-100 border-gray-300 text-gray-900"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-50 shrink-0"
                    onClick={() => setScannerOpen(true)}
                  >
                    <ScanLine className="h-4 w-4 mr-2" />
                    Scan
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Saved with the product so you can find it later by scanning or searching
                  the barcode on the Products page.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div data-field-error={!!fieldErrors.category}>
                  <Label className="text-gray-700">
                    Category<Required />
                  </Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => {
                      clearFieldError('category');
                      setFormData((prev) => ({ ...prev, category: value, subcategory: '', subSubcategory: '' }));
                    }}
                  >
                    <SelectTrigger className={'mt-2 bg-gray-100 border-gray-300 text-gray-900' + invalidRing(!!fieldErrors.category)}>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.name} className="text-gray-900">{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={fieldErrors.category} />
                </div>

                <div>
                  <Label className="text-gray-700">Subcategory</Label>
                  <Select value={formData.subcategory} onValueChange={(value) => setFormData((prev) => ({ ...prev, subcategory: value, subSubcategory: '' }))} disabled={!formData.category || subcategoryOptions.length === 0}>
                    <SelectTrigger className="mt-2 bg-gray-100 border-gray-300 text-gray-900">
                      <SelectValue placeholder={subcategoryOptions.length > 0 ? 'Select subcategory' : 'No subcategories'} />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      {subcategoryOptions.map((sub) => (
                        <SelectItem key={sub.slug} value={sub.name} className="text-gray-900">{sub.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.category && selectedCategory && (
                    <div className="flex gap-1.5 mt-1.5">
                      <Input value={newSubcategory} onChange={(e) => setNewSubcategory(e.target.value)} placeholder="New subcategory" className="h-8 text-xs bg-white border-gray-300" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSubcategory())} />
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs border-gray-300" onClick={handleAddSubcategory} disabled={addingSub || !newSubcategory.trim()}>
                        {addingSub ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      </Button>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-gray-700">Sub-subcategory</Label>
                  <Select value={formData.subSubcategory} onValueChange={(value) => setFormData((prev) => ({ ...prev, subSubcategory: value }))} disabled={!formData.subcategory || subSubcategoryOptions.length === 0}>
                    <SelectTrigger className="mt-2 bg-gray-100 border-gray-300 text-gray-900">
                      <SelectValue placeholder={subSubcategoryOptions.length > 0 ? 'Select sub-subcategory' : 'None'} />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      {subSubcategoryOptions.map((child) => (
                        <SelectItem key={child.slug} value={child.name} className="text-gray-900">{child.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.subcategory && selectedSubcategory && (
                    <div className="flex gap-1.5 mt-1.5">
                      <Input value={newSubSubcategory} onChange={(e) => setNewSubSubcategory(e.target.value)} placeholder="New sub-subcategory" className="h-8 text-xs bg-white border-gray-300" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSubSubcategory())} />
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs border-gray-300" onClick={handleAddSubSubcategory} disabled={addingSubSub || !newSubSubcategory.trim()}>
                        {addingSubSub ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-gray-700">Description</Label>
                <Textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Enter product description" className="mt-2 bg-gray-100 border-gray-300 text-gray-900 min-h-[120px]" />
              </div>
            </CardContent>
          </Card>

          {/* Media */}
          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Media</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Images */}
              <div data-field-error={!!fieldErrors.images}>
                <Label className="text-gray-700">
                  Product Images<Required />
                </Label>
                <FieldError message={fieldErrors.images} />
                <div className="flex gap-2 mt-2 mb-3">
                  <button type="button" onClick={() => setImageUploadMode('upload')} className={'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ' + (imageUploadMode === 'upload' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50')}>
                    Upload Files
                  </button>
                  <button type="button" onClick={() => setImageUploadMode('url')} className={'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ' + (imageUploadMode === 'url' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50')}>
                    Paste URL
                  </button>
                </div>

                {images.length >= MAX_PRODUCT_IMAGES ? (
                  <div className="flex items-center justify-center w-full h-32 border-2 border-gray-200 border-dashed rounded-lg bg-gray-50 text-center px-4">
                    <p className="text-sm text-gray-600">
                      {MAX_PRODUCT_IMAGES} of {MAX_PRODUCT_IMAGES} photos added — the maximum. Remove one to add another.
                    </p>
                  </div>
                ) : imageUploadMode === 'upload' ? (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer hover:border-amber-600 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      {uploadingImages ? (
                        <>
                          <Loader2 className="h-8 w-8 animate-spin text-amber-600 mb-2" />
                          <p className="text-sm text-gray-600">Uploading... {uploadProgress}%</p>
                        </>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 text-gray-600 mb-2" />
                          <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
                          <p className="text-xs text-gray-500">
                            JPG, PNG or WebP · max 500 KB each · up to {MAX_PRODUCT_IMAGES} photos ({images.length}/{MAX_PRODUCT_IMAGES} used)
                          </p>
                        </>
                      )}
                    </div>
                    <input type="file" className="hidden" accept={IMAGE_ACCEPT} multiple onChange={handleImageUpload} disabled={uploadingImages} />
                  </label>
                ) : (
                  <div className="flex gap-2">
                    <Input type="url" value={imageUrlInput} onChange={(e) => setImageUrlInput(e.target.value)} placeholder="https://example.com/image.jpg" className="flex-1 bg-white border-gray-300" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddImageUrl())} />
                    <Button type="button" onClick={handleAddImageUrl} className="bg-gray-900 hover:bg-gray-800 text-white">Add</Button>
                  </div>
                )}

                {images.length > 0 && (
                  <>
                    <div className="flex items-center justify-between mt-4 mb-2">
                      <p className="text-xs text-gray-500">{images.length} image{images.length !== 1 ? 's' : ''} • drag to reorder • first image is shown in cards</p>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
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
                          className="relative group cursor-move"
                        >
                          <div className="w-full aspect-square bg-gray-200 rounded-lg overflow-hidden ring-1 ring-gray-200">
                            <SmartImage src={url} alt={'Product ' + (index + 1)} className={'w-full h-full object-cover ' + (thumbnail === url ? 'ring-2 ring-amber-500' : '')} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} preset="card" />
                          </div>
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                            <button type="button" onClick={() => setThumbnail(url)} className="p-1.5 bg-amber-600 hover:bg-amber-700 rounded text-white" title="Set as thumbnail"><ImageIcon className="h-4 w-4" /></button>
                            <button type="button" onClick={() => handleRemoveImage(url)} className="p-1.5 bg-red-500 hover:bg-red-600 rounded text-white" title="Remove"><X className="h-4 w-4" /></button>
                          </div>
                          <span className="absolute top-1 right-1 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">#{index + 1}</span>
                          {thumbnail === url && <span className="absolute top-1 left-1 bg-amber-600 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">THUMB</span>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Videos – YouTube aware */}
              <div>
                <Label className="text-gray-700">Product Videos (Optional)</Label>
                <p className="text-xs text-gray-500 mt-1 mb-2">Paste a YouTube URL and we auto-extract the video ID. Or paste a direct video URL.</p>
                <div className="flex gap-2">
                  <Input type="url" value={videoUrlInput} onChange={(e) => setVideoUrlInput(e.target.value)} placeholder="https://youtube.com/watch?v=... or video URL" className="flex-1 bg-white border-gray-300" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddVideoUrl())} />
                  <Button type="button" onClick={handleAddVideoUrl} className="bg-gray-900 hover:bg-gray-800 text-white">Add</Button>
                </div>
                {videos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                    {videos.map((v, index) => {
                      const isYt = v.startsWith('yt:');
                      const ytId = isYt ? v.replace('yt:', '') : null;
                      return (
                        <div key={index} className="relative group rounded-lg overflow-hidden bg-gray-100">
                          {ytId ? (
                            <img src={'https://img.youtube.com/vi/' + ytId + '/mqdefault.jpg'} alt="YouTube video" className="w-full aspect-video object-cover" />
                          ) : (
                            <div className="w-full aspect-video flex items-center justify-center">
                              <Video className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button type="button" onClick={() => setVideos((prev) => prev.filter((_, i) => i !== index))} className="p-1 bg-red-500 rounded text-white"><X className="h-4 w-4" /></button>
                          </div>
                          {ytId && <span className="absolute top-1 left-1 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">YouTube</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tags */}
              <div>
                <Label className="text-gray-700">Tags (optional)</Label>
                <Input name="tags" value={formData.tags} onChange={handleInputChange} placeholder="new, featured, bestseller (comma-separated)" className="mt-2 bg-white border-gray-300 text-gray-900" />
              </div>
            </CardContent>
          </Card>

          {/* Pricing & Inventory */}
          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Pricing & Inventory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* ── Silver Rate Calculator (optional) ── */}
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-4 space-y-3">
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
                    <Calculator className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800 truncate">Silver Rate Calculator</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 border transition-colors shrink-0 ${
                      silverPricing.enabled
                        ? 'text-amber-700 bg-amber-100 border-amber-300 font-medium'
                        : 'text-gray-500 bg-white border-gray-200'
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

                <p className="text-xs text-gray-500 leading-relaxed">
                  Enable for silver jewellery. Original Price = (grams × silver rate) + wastage + making charges.
                  For fixed-price articles, leave this off.
                </p>

                {silverPricing.enabled && (
                  <div className="space-y-4 pt-1">
                    {/* Silver rate display — live Firestore listener */}
                    <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
                      <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span className="text-xs text-gray-600 flex-1">
                        Current silver rate:{' '}
                        {silverRate > 0 ? (
                          <strong className="text-amber-700">₹{silverRate.toFixed(2)} / gram</strong>
                        ) : (
                          <span className="text-red-500">Not set — go to Silver Rate page first</span>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                        LIVE
                      </span>
                    </div>

                    {/* Inputs row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div data-field-error={!!fieldErrors.weightGrams || !!fieldErrors.silverRate}>
                        <Label className="text-gray-700 text-xs font-medium">
                          Weight (grams) — x<Required />
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
                          className={'mt-1.5 bg-white border-amber-200 text-gray-900 text-sm' + invalidRing(!!fieldErrors.weightGrams)}
                        />
                        <FieldError message={fieldErrors.weightGrams || fieldErrors.silverRate} />
                        {silverRate > 0 && silverPricing.weightGrams && (
                          <p className="text-xs text-amber-600 mt-1">
                            Silver cost: ₹{(parseFloat(silverPricing.weightGrams || '0') * silverRate).toFixed(2)}
                          </p>
                        )}
                      </div>

                      <div>
                        <Label className="text-gray-700 text-xs font-medium">Wastage % — y</Label>
                        <Input
                          type="number"
                          value={silverPricing.wastagePercent}
                          onChange={(e) => setSilverPricing((prev) => ({ ...prev, wastagePercent: e.target.value }))}
                          placeholder="e.g., 10"
                          min="0"
                          max="100"
                          step="0.1"
                          className="mt-1.5 bg-white border-amber-200 text-gray-900 text-sm"
                        />
                        {silverRate > 0 && silverPricing.weightGrams && silverPricing.wastagePercent && (
                          <p className="text-xs text-amber-600 mt-1">
                            Wastage: ₹{(parseFloat(silverPricing.weightGrams || '0') * silverRate * (parseFloat(silverPricing.wastagePercent || '0') / 100)).toFixed(2)}
                          </p>
                        )}
                      </div>

                      <div>
                        <Label className="text-gray-700 text-xs font-medium">Making Charges (₹) — z</Label>
                        <Input
                          type="number"
                          value={silverPricing.makingCharges}
                          onChange={(e) => setSilverPricing((prev) => ({ ...prev, makingCharges: e.target.value }))}
                          placeholder="e.g., 50"
                          min="0"
                          step="1"
                          className="mt-1.5 bg-white border-amber-200 text-gray-900 text-sm"
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
                        <div className="bg-white border border-amber-200 rounded-lg p-3 text-xs space-y-1.5">
                          <div className="flex justify-between text-gray-600">
                            <span>Silver cost ({grams}g × ₹{silverRate}/g)</span>
                            <span className="font-medium text-gray-800">₹{x.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-gray-600">
                            <span>Wastage ({wastage}%)</span>
                            <span className="font-medium text-gray-800">₹{y.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-gray-600">
                            <span>Making charges</span>
                            <span className="font-medium text-gray-800">₹{z.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between border-t border-amber-200 pt-1.5 font-semibold text-amber-700">
                            <span>Original Price (x + y + z)</span>
                            <span>₹{total.toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* ── Standard pricing fields ── */}
              {silverPricing.enabled ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-amber-800">Price (live)</span>
                    {formData.price ? (
                      <span className="text-lg font-bold text-amber-900">
                        ₹{parseFloat(formData.price).toLocaleString('en-IN')}
                        <span className="ml-2 text-xs font-normal text-amber-600">at ₹{silverRate}/g</span>
                      </span>
                    ) : (
                      <span className="text-sm text-amber-600">Fill calculator inputs above</span>
                    )}
                  </div>
                  <p className="text-xs text-amber-600 mt-1">Customers always see the price recomputed at the current live silver rate.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-gray-700">Original Price (&#8377;)</Label>
                    <Input
                      name="originalPrice"
                      type="number"
                      value={formData.originalPrice}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="mt-2 bg-gray-100 border-gray-300 text-gray-900"
                    />
                  </div>
                  <div data-field-error={!!fieldErrors.price}>
                    <Label className="text-gray-700">
                      Price (&#8377;)<Required />
                    </Label>
                    <Input
                      name="price"
                      type="number"
                      value={formData.price}
                      onChange={(e) => { clearFieldError('price'); handleInputChange(e); }}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className={'mt-2 bg-gray-100 border-gray-300 text-gray-900' + invalidRing(!!fieldErrors.price)}
                    />
                    <FieldError message={fieldErrors.price} />
                  </div>
                  <div>
                    <Label className="text-gray-700">Discount</Label>
                    <div className="flex gap-2 mt-2">
                      <Input name="discount" type="number" value={formData.discount} onChange={handleInputChange} placeholder="0" min="0" step="0.1" className="flex-1 bg-gray-100 border-gray-300 text-gray-900" />
                      <Select value={formData.discountType} onValueChange={(val) => setFormData((prev) => ({ ...prev, discountType: val as any }))}>
                        <SelectTrigger className="w-20 bg-gray-100 border-gray-300">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          <SelectItem value="percent">%</SelectItem>
                          <SelectItem value="amount">&#8377;</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Auto-calculated from prices</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-gray-700">Stock</Label>
                  <Input name="stock" type="number" value={formData.stock} onChange={handleInputChange} placeholder="0" min="0" className="mt-2 bg-gray-100 border-gray-300 text-gray-900" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-gray-700">Weight</Label>
                  <div className="flex gap-2 mt-2">
                    <Input name="weight" type="number" value={formData.weight} onChange={handleInputChange} placeholder="e.g., 100" min="0" step="0.01"
                      readOnly={silverPricing.enabled}
                      className={`flex-1 border-gray-300 text-gray-900 ${silverPricing.enabled ? 'bg-gray-200 cursor-not-allowed text-gray-500' : 'bg-gray-100'}`}
                    />
                    <Select value={formData.weightUnit} onValueChange={(val) => setFormData((prev) => ({ ...prev, weightUnit: val as 'grams' | 'kgs' }))} disabled={silverPricing.enabled}>
                      <SelectTrigger className={`w-28 border-gray-300 ${silverPricing.enabled ? 'bg-gray-200 cursor-not-allowed' : 'bg-gray-100'}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="grams">Grams</SelectItem>
                        <SelectItem value="kgs">Kilograms</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {silverPricing.enabled && (
                    <p className="text-xs text-amber-600 mt-1">Auto-synced from Silver Rate Calculator</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Specifications – dynamic */}
          <Card className="bg-white border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-gray-900">Specifications</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addSpecRow} className="text-xs">
                <Plus className="h-3 w-3 mr-1" /> Add Field
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {specifications.map((spec, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Input value={spec.label} onChange={(e) => handleSpecChange(idx, 'label', e.target.value)} placeholder="Label (e.g., Material)" className="bg-gray-100 border-gray-300 text-gray-900 text-sm" />
                  </div>
                  <div className="flex-[2] relative">
                    <Input value={spec.value} onChange={(e) => handleSpecChange(idx, 'value', e.target.value)} placeholder="Value (e.g., Silver)" className="bg-gray-100 border-gray-300 text-gray-900 text-sm" list={'spec-suggestions-' + idx} />
                    {spec.label && specSuggestions[spec.label.toLowerCase().trim()] && (
                      <datalist id={'spec-suggestions-' + idx}>
                        {specSuggestions[spec.label.toLowerCase().trim()].map((s, si) => (
                          <option key={si} value={s} />
                        ))}
                      </datalist>
                    )}
                  </div>
                  {specifications.length > 1 && (
                    <button type="button" onClick={() => removeSpecRow(idx)} className="p-2 text-red-400 hover:text-red-600 mt-0.5">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <p className="text-xs text-gray-500">Previously entered values will appear as suggestions.</p>
            </CardContent>
          </Card>

          {/* Delivery — per-product override of Commerce → Delivery */}
          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Truck className="h-4 w-4 text-amber-600" /> Delivery
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="text-gray-700">Set delivery for this product</Label>
                  <p className="text-xs text-gray-500 mt-1">
                    Off: this product follows the universal charge in Commerce → Delivery.
                  </p>
                </div>
                <Switch
                  checked={delivery.override}
                  onCheckedChange={(checked) => setDelivery((p) => ({ ...p, override: checked }))}
                />
              </div>

              {delivery.override && (
                <div className="space-y-4 border-t border-gray-200 pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label className="text-gray-700">Charge delivery</Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Off means this product always ships free.
                      </p>
                    </div>
                    <Switch
                      checked={delivery.chargeEnabled}
                      onCheckedChange={(checked) =>
                        setDelivery((p) => ({ ...p, chargeEnabled: checked }))
                      }
                    />
                  </div>

                  {delivery.chargeEnabled ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-field-error={!!fieldErrors.delivery}>
                      <div className="sm:col-span-2">
                        <FieldError message={fieldErrors.delivery} />
                      </div>
                      <div>
                        <Label className="text-gray-700">Within Andhra Pradesh (&#8377;)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={delivery.withinState}
                          onChange={(e) => { clearFieldError('delivery'); setDelivery((p) => ({ ...p, withinState: e.target.value })); }}
                          placeholder="0"
                          className="mt-2 bg-gray-100 border-gray-300 text-gray-900"
                        />
                      </div>
                      <div>
                        <Label className="text-gray-700">Outside Andhra Pradesh (&#8377;)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={delivery.outsideState}
                          onChange={(e) => { clearFieldError('delivery'); setDelivery((p) => ({ ...p, outsideState: e.target.value })); }}
                          placeholder="0"
                          className="mt-2 bg-gray-100 border-gray-300 text-gray-900"
                        />
                      </div>
                      <p className="sm:col-span-2 text-xs text-gray-500">
                        A state listed under Commerce → Delivery → Per-state rates overrides the
                        outside-AP figure for that destination, and free delivery above the
                        order threshold still applies.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                      Free delivery — no charge is added for this product.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4 lg:space-y-6">
          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-gray-700">Active</Label>
                <Switch checked={formData.isActive} onCheckedChange={(checked) => { setStatusNote(null); setFormData((prev) => ({ ...prev, isActive: checked })); }} />
              </div>
              {!formData.isActive && inactiveReason && !statusNote && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {inactiveReason === 'outOfStock'
                    ? 'Hidden automatically because it sold out. Add stock and it goes live again.'
                    : 'Hidden because it had no photos. Add a photo, then switch Active on.'}
                </p>
              )}
              {statusNote && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{statusNote}</p>
              )}
              <div className="flex items-center justify-between">
                <Label className="text-gray-700">Featured</Label>
                <Switch checked={formData.isFeatured} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isFeatured: checked }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-gray-700">New Arrival</Label>
                <Switch checked={formData.isNewArrival} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isNewArrival: checked }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-gray-700">Best Seller</Label>
                <Switch checked={formData.isBestSeller} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isBestSeller: checked }))} />
              </div>
              <div className="border-t border-gray-200 pt-4 mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Shop Flags</p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-700">Top Deal</Label>
                    <Switch checked={formData.isTopDeal} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isTopDeal: checked }))} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-700">Trend Product</Label>
                    <Switch checked={formData.isTrendProduct} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isTrendProduct: checked }))} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="lg:col-span-3">
          <div className="flex gap-3">
            <Button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white px-8" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isEditing ? 'Updating...' : 'Creating...'}
                </>
              ) : isEditing ? 'Update Product' : 'Create Product'}
            </Button>
            <Button type="button" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-200 hover:text-gray-900 px-8" onClick={() => navigate('/admin/products')}>
              Cancel
            </Button>
          </div>
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
