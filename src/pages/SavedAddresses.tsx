import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ListSkeleton } from '@/components/skeletons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import MobileBottomNav from '@/components/MobileBottomNav';
import Header from '@/components/Header';
import MobileHeader from '@/components/MobileHeader';
import MobileSearchBar from '@/components/MobileSearchBar';
import CategoryIconNav from '@/components/CategoryIconNav';
import Footer from '@/components/Footer';
import { useToast } from '@/hooks/use-toast';
import { EASE_OUT, staggerDelay } from '@/lib/motion';
import {
  getUserAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  Address,
  AddressFormData,
} from '@/services/addressService';
import {
  ArrowLeft,
  Plus,
  MapPin,
  Edit2,
  Trash2,
  Check,
  X,
  MoreVertical,
  ExternalLink,
} from 'lucide-react';

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana',
  'Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
  'Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi',
  'Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
];

type FieldName = 'fullName' | 'phoneNumber' | 'pinCode' | 'address' | 'city' | 'state';
type FieldErrors = Partial<Record<FieldName, string>>;

/** Field checks for the form. Each message says how to fix it. */
const validateAddress = (data: AddressFormData): FieldErrors => {
  const errors: FieldErrors = {};
  if (!data.fullName.trim()) errors.fullName = 'Enter the name for delivery.';
  if (data.phoneNumber.replace(/\D/g, '').length < 10) errors.phoneNumber = 'Enter a 10-digit mobile number.';
  if (!/^\d{6}$/.test(data.pinCode.trim())) errors.pinCode = 'Enter a 6-digit PIN code.';
  if (!data.address.trim()) errors.address = 'Enter the house number and street.';
  if (!data.city.trim()) errors.city = 'Enter the city.';
  if (!data.state) errors.state = 'Select a state.';
  return errors;
};

const FIELD_ORDER: FieldName[] = ['fullName', 'phoneNumber', 'pinCode', 'address', 'city', 'state'];

const SavedAddresses = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  // Form state
  const [formData, setFormData] = useState<AddressFormData>({
    fullName: '',
    phoneNumber: '',
    pinCode: '',
    locality: '',
    address: '',
    googleMapsUrl: '',
    city: '',
    state: '',
    isDefault: false,
  });

  // Fetch addresses on mount
  useEffect(() => {
    if (user) {
      loadAddresses();
    }
  }, [user]);

  const loadAddresses = async () => {
    if (!user) return;

    try {
      const userAddresses = await getUserAddresses(user.uid);
      setAddresses(userAddresses);
    } catch (error) {
      console.error('Error loading addresses:', error);
      toast({
        title: 'Unable to load your addresses',
        description: 'Check your connection and refresh the page.',
        variant: 'destructive',
      });
    } finally {
      setAddressesLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as FieldName]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validation: inline, next to each field, focus the first one to fix
    const found = validateAddress(formData);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      const first = FIELD_ORDER.find((f) => found[f]);
      if (first) formRef.current?.querySelector<HTMLElement>(`#${first}`)?.focus();
      return;
    }
    setErrors({});

    try {
      setFormLoading(true);

      if (editingAddress) {
        // Update existing address
        await updateAddress(user.uid, editingAddress.id, formData);
        toast({ title: 'Address updated' });
      } else {
        // Add new address
        await addAddress(user.uid, formData);
        toast({ title: 'Address saved' });
      }

      // Reset form and reload addresses
      resetForm();
      await loadAddresses();
    } catch (error) {
      console.error('Error saving address:', error);
      toast({
        title: 'Unable to save the address',
        description: 'Check your connection and try again.',
        variant: 'destructive',
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (address: Address) => {
    setEditingAddress(address);
    setFormData({
      fullName: address.fullName,
      phoneNumber: address.phoneNumber,
      pinCode: address.pinCode,
      locality: address.locality,
      address: address.address,
      googleMapsUrl: address.googleMapsUrl || '',
      city: address.city,
      state: address.state,
      isDefault: address.isDefault,
    });
    setErrors({});
    setShowForm(true);
  };

  /** Runs after the shopper confirms in the dialog. */
  const handleDelete = async (addressId: string) => {
    if (!user) return;

    try {
      await deleteAddress(user.uid, addressId);
      toast({ title: 'Address deleted' });
      await loadAddresses();
    } catch (error) {
      console.error('Error deleting address:', error);
      toast({
        title: 'Unable to delete the address',
        description: 'Check your connection and try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSetDefault = async (addressId: string) => {
    if (!user) return;

    try {
      await setDefaultAddress(user.uid, addressId);
      toast({ title: 'Default address updated' });
      await loadAddresses();
    } catch (error) {
      console.error('Error setting default:', error);
      toast({
        title: 'Unable to change the default address',
        description: 'Check your connection and try again.',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      fullName: '',
      phoneNumber: '',
      pinCode: '',
      locality: '',
      address: '',
      googleMapsUrl: '',
      city: '',
      state: '',
      isDefault: false,
    });
    setEditingAddress(null);
    setErrors({});
    setShowForm(false);
  };

  /** aria wiring for a field with an inline error. */
  const errorProps = (field: FieldName) =>
    errors[field]
      ? { 'aria-invalid': true as const, 'aria-describedby': `${field}-error` }
      : {};

  const FieldError = ({ field }: { field: FieldName }) =>
    errors[field] ? (
      <p id={`${field}-error`} className="mt-1.5 text-xs text-destructive">{errors[field]}</p>
    ) : null;

  const labelClass = 'mb-2 block text-sm font-medium text-foreground/80';
  const optional = <span className="font-normal text-muted-foreground"> (optional)</span>;

  return (
    <>
      {/* Desktop Header */}
      <div className="hidden lg:block">
        <Header />
        <CategoryIconNav />
      </div>
      {/* Mobile Header */}
      <div className="lg:hidden">
        <MobileHeader />
        <MobileSearchBar />
      </div>
      <main id="main" tabIndex={-1} className="min-h-screen tx-paper outline-none" style={{ fontFamily: "var(--font-body)" }}>
        <div className="container mx-auto max-w-4xl px-4 py-4 pb-24">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2">
              <IconButton
                label={showForm ? 'Back to addresses' : 'Back'}
                className="-ml-2"
                onClick={() => {
                  if (showForm) {
                    resetForm();
                    return;
                  }
                  navigate('/account');
                }}
              >
                <ArrowLeft aria-hidden="true" />
              </IconButton>
              <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">Addresses</h1>
            </div>
            {!showForm && addresses.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
                <Plus aria-hidden="true" className="size-4" />
                Add address
              </Button>
            )}
          </div>

          {/* Address Form */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.24, ease: EASE_OUT } }}
                exit={{ opacity: 0, transition: { duration: 0.18 } }}
                className="mb-8"
              >
                <section aria-labelledby="address-form-heading" className="panel tx-sheet p-6 md:p-8">
                  <div className="flex items-center justify-between gap-3 mb-6">
                    <h2 id="address-form-heading" className="font-heading text-xl font-semibold tracking-tight text-foreground">
                      {editingAddress ? 'Edit address' : 'Add a new address'}
                    </h2>
                    <IconButton label="Close form" className="-mr-2 text-muted-foreground" onClick={resetForm}>
                      <X aria-hidden="true" />
                    </IconButton>
                  </div>

                  <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
                    {/* Full Name */}
                    <div>
                      <Label htmlFor="fullName" className={labelClass}>Full name</Label>
                      <Input
                        id="fullName"
                        name="fullName"
                        autoComplete="name"
                        autoCapitalize="words"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        {...errorProps('fullName')}
                      />
                      <FieldError field="fullName" />
                    </div>

                    {/* Phone Number */}
                    <div>
                      <Label htmlFor="phoneNumber" className={labelClass}>Mobile number</Label>
                      <Input
                        id="phoneNumber"
                        name="phoneNumber"
                        type="tel"
                        autoComplete="tel-national"
                        inputMode="numeric"
                        maxLength={10}
                        value={formData.phoneNumber}
                        onChange={handleInputChange}
                        placeholder="10-digit mobile number"
                        {...errorProps('phoneNumber')}
                      />
                      <FieldError field="phoneNumber" />
                    </div>

                    {/* Pin Code & Locality */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <Label htmlFor="pinCode" className={labelClass}>PIN code</Label>
                        <Input
                          id="pinCode"
                          name="pinCode"
                          autoComplete="postal-code"
                          inputMode="numeric"
                          value={formData.pinCode}
                          onChange={handleInputChange}
                          placeholder="6-digit PIN code"
                          maxLength={6}
                          className="tabular-nums"
                          {...errorProps('pinCode')}
                        />
                        <FieldError field="pinCode" />
                      </div>
                      <div>
                        <Label htmlFor="locality" className={labelClass}>Locality{optional}</Label>
                        <Input
                          id="locality"
                          name="locality"
                          autoComplete="address-level3"
                          value={formData.locality}
                          onChange={handleInputChange}
                          placeholder="Locality or town"
                        />
                      </div>
                    </div>

                    {/* Address */}
                    <div>
                      <Label htmlFor="address" className={labelClass}>Address (area and street)</Label>
                      <Input
                        id="address"
                        name="address"
                        autoComplete="address-line1"
                        value={formData.address}
                        onChange={handleInputChange}
                        placeholder="Flat or house no., building, street"
                        {...errorProps('address')}
                      />
                      <FieldError field="address" />
                    </div>

                    <div>
                      <Label htmlFor="googleMapsUrl" className={labelClass}>Google Maps link{optional}</Label>
                      <Input
                        id="googleMapsUrl"
                        name="googleMapsUrl"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        value={formData.googleMapsUrl || ''}
                        onChange={handleInputChange}
                        placeholder="https://maps.app.goo.gl/..."
                      />
                    </div>

                    {/* City & State */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <Label htmlFor="city" className={labelClass}>City</Label>
                        <Input
                          id="city"
                          name="city"
                          autoComplete="address-level2"
                          value={formData.city}
                          onChange={handleInputChange}
                          {...errorProps('city')}
                        />
                        <FieldError field="city" />
                      </div>
                      <div>
                        <Label htmlFor="state" className={labelClass}>State</Label>
                        <select
                          id="state"
                          name="state"
                          autoComplete="address-level1"
                          value={formData.state}
                          onChange={(e) => {
                            setFormData((p) => ({ ...p, state: e.target.value }));
                            if (errors.state) setErrors((prev) => ({ ...prev, state: undefined }));
                          }}
                          className="h-11 w-full rounded-control border border-input bg-background px-3 text-base text-foreground transition-[border-color,box-shadow] duration-hover focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 aria-[invalid=true]:border-destructive md:text-sm"
                          {...errorProps('state')}
                        >
                          <option value="">Select state</option>
                          {INDIAN_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <FieldError field="state" />
                      </div>
                    </div>

                    {/* Set as Default */}
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="isDefault"
                        checked={formData.isDefault}
                        onCheckedChange={(v) => setFormData((prev) => ({ ...prev, isDefault: v === true }))}
                      />
                      <Label htmlFor="isDefault" className="cursor-pointer text-sm font-medium text-foreground/80">
                        Use as my default delivery address
                      </Label>
                    </div>

                    {/* Submit Buttons */}
                    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                      <Button type="button" variant="outline" size="lg" onClick={resetForm} className="sm:w-40">
                        Cancel
                      </Button>
                      <Button type="submit" size="lg" disabled={formLoading} className="flex-1">
                        {formLoading ? <Spinner /> : <Check aria-hidden="true" className="size-4" />}
                        {formLoading ? 'Saving…' : editingAddress ? 'Update address' : 'Save address'}
                      </Button>
                    </div>
                  </form>
                </section>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Address List */}
          {!showForm && (
            addressesLoading ? (
              <ListSkeleton rows={2} label="Loading your addresses" />
            ) : addresses.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: EASE_OUT }}
                className="panel tx-sheet"
              >
                <EmptyState
                  icon={MapPin}
                  title="No saved addresses yet"
                  description="Save one now and checkout fills it in for you."
                  action={{ label: 'Add address', onClick: () => setShowForm(true) }}
                />
              </motion.div>
            ) : (
              <ul className="flex flex-col gap-3">
                {addresses.map((address, index) => (
                  <motion.li
                    key={address.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, ease: EASE_OUT, delay: staggerDelay(index) }}
                    className="relative rounded-card border border-foreground/[0.08] bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold text-foreground break-words [overflow-wrap:anywhere]">
                            {address.fullName}
                          </h2>
                          {address.isDefault && <StatusBadge tone="neutral" label="Default" icon={Check} />}
                        </div>
                        <div className="space-y-0.5 text-sm text-muted-foreground break-words [overflow-wrap:anywhere]">
                          <p>{address.address}</p>
                          {address.locality && <p>{address.locality}</p>}
                          <p>{address.city}, {address.state} <span className="tabular-nums">{address.pinCode}</span></p>
                          <p className="pt-1 tabular-nums">{address.phoneNumber}</p>
                        </div>
                        <a
                          href={address.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address.address}, ${address.locality || ''}, ${address.city}, ${address.state} ${address.pinCode}, India`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="-mb-2 inline-flex min-h-[44px] items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
                        >
                          <MapPin aria-hidden="true" className="size-3.5" />
                          View on Google Maps
                          <ExternalLink aria-hidden="true" className="size-3" />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      </div>

                      {/* Three-dot Menu */}
                      <DropdownMenu
                        open={openMenuId === address.id}
                        onOpenChange={(open) => setOpenMenuId(open ? address.id : null)}
                      >
                        <DropdownMenuTrigger asChild>
                          <IconButton label="Address options" className="-mr-2 -mt-1 text-muted-foreground">
                            <MoreVertical aria-hidden="true" />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem className="gap-2.5" onSelect={() => handleEdit(address)}>
                            <Edit2 aria-hidden="true" className="size-4" />
                            Edit
                          </DropdownMenuItem>
                          {!address.isDefault && (
                            <DropdownMenuItem className="gap-2.5" onSelect={() => handleSetDefault(address.id)}>
                              <Check aria-hidden="true" className="size-4" />
                              Set as default
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setPendingDeleteId(address.id)}
                            className="gap-2.5 text-destructive focus:bg-status-danger-bg focus:text-status-danger-fg"
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </motion.li>
                ))}
              </ul>
            )
          )}
        </div>
      </main>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title="Delete this address?"
        description="It will be removed from your saved addresses. You can add it again at any time."
        confirmLabel="Delete address"
        cancelLabel="Keep"
        tone="danger"
        onConfirm={() => (pendingDeleteId ? handleDelete(pendingDeleteId) : undefined)}
      />

      <Footer />
      <MobileBottomNav />
    </>
  );
};

export default SavedAddresses;
