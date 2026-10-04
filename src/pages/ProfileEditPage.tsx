import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { uploadImage, deleteMedia, describeUploadError } from '@/services/mediaStorage';
import { updateSecuritySettings } from '@/services/securityService';
import { toast } from 'sonner';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import Cropper from 'react-easy-crop';
import { Area } from 'react-easy-crop';
import { motion } from 'framer-motion';
import darkLogo from '@/assets/dark.png';
import WhatsAppSetupModal from '@/components/auth/WhatsAppSetupModal';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/format';
import { fadeUp } from '@/lib/motion';
import {
  ZoomIn,
  ZoomOut,
  ArrowLeft,
  Camera,
  Check,
  Edit3,
  User,
  Mail,
  Calendar,
  Phone,
  ShieldCheck,
  CircleCheck,
  X,
} from 'lucide-react';
import { SmartImage } from "@/components/ui/smart-image";

// Helper function to create image from cropped area
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.src = url;
  });

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Canvas is empty'));
      }
    }, 'image/jpeg', 0.95);
  });
}

const ProfileEditPage = () => {
  const navigate = useNavigate();
  const { user, userProfile, updateUserProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Crop states
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);

  // WhatsApp inline editor modal
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  useEffect(() => {
    if (userProfile?.avatar) {
      setAvatarUrl(userProfile.avatar);
    } else if (user?.photoURL) {
      setAvatarUrl(user.photoURL);
    }
  }, [userProfile, user]);

  useEffect(() => {
    const currentName = userProfile?.name || userProfile?.username || user?.email?.split('@')[0] || 'User';
    setNameInput(currentName);
  }, [userProfile, user]);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      setImageToCrop(reader.result as string);
      setShowCropModal(true);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
  };

  const handleCropSave = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;

    setUploadingPhoto(true);
    setShowCropModal(false);

    try {
      const croppedBlob = await getCroppedImg(imageToCrop, croppedAreaPixels);
      const croppedFile = new File([croppedBlob], 'profile-picture.jpg', { type: 'image/jpeg' });
      const previousAvatar = userProfile?.avatar;
      const result = await uploadImage(croppedFile, { category: 'avatars', autoCompress: true });
      setAvatarUrl(result.url);
      await updateUserProfile({ avatar: result.url });
      if (previousAvatar && previousAvatar !== result.url) void deleteMedia([previousAvatar]);
      toast.success('Profile photo updated');
      setImageToCrop(null);
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error(describeUploadError(error));
      if (userProfile?.avatar) {
        setAvatarUrl(userProfile.avatar);
      } else if (user?.photoURL) {
        setAvatarUrl(user.photoURL);
      }
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCropCancel = () => {
    setShowCropModal(false);
    setImageToCrop(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) {
      toast.error('Enter your name.');
      return;
    }
    setSavingName(true);
    try {
      await updateUserProfile({ name: nameInput.trim() });
      setIsEditingName(false);
      toast.success('Name updated');
    } catch {
      toast.error('Unable to update your name. Try again.');
    } finally {
      setSavingName(false);
    }
  };

  const displayName = userProfile?.name || userProfile?.username || user?.email?.split('@')[0] || 'User';
  const initials = displayName.charAt(0).toUpperCase();

  const memberSince = (userProfile?.createdAt && formatDate(userProfile.createdAt)) || 'Not available';

  const startEditingName = () => setIsEditingName(true);
  const cancelEditingName = () => {
    setIsEditingName(false);
    setNameInput(displayName);
  };

  const zoomPercent = ((zoom - 1) / 2) * 100;
  const rowLabel = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground';

  return (
    <>
      {/* Desktop site header */}
      <div className="hidden lg:block"><Header /></div>

      <main id="main" tabIndex={-1} className="min-h-screen tx-paper pb-24 lg:pb-16 outline-none">
        {/* Desktop page wrapper for centered card width */}
        <div className="lg:max-w-3xl lg:mx-auto lg:px-6 lg:pt-8">
        <button
          type="button"
          onClick={() => navigate('/account')}
          className="mb-4 hidden h-10 items-center gap-2 rounded-control border border-input bg-card px-4 text-sm font-medium text-foreground/80 transition-[background-color,color,transform] duration-press ease-out hover:bg-muted hover:text-foreground active:scale-[0.97] lg:inline-flex"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to account
        </button>
        {/* ── Banner + Avatar Section ── */}
        <div className="relative lg:overflow-hidden lg:rounded-panel lg:border lg:border-foreground/[0.08] lg:bg-card lg:shadow-sm">
          {/* Banner Background with geometric pattern */}
          <div className="tx-slate tx-contour relative h-40 overflow-hidden">
            {/* Back Button: mobile only (desktop has site header) */}
            <IconButton
              label="Back"
              variant="onPhoto"
              onClick={() => navigate(-1)}
              className="lg:hidden absolute top-4 left-4 z-raised ring-1 ring-charcoal-foreground/15"
            >
              <ArrowLeft aria-hidden="true" />
            </IconButton>

            {/* Geometric network pattern (decorative), drawn in the bronze highlight */}
            <svg aria-hidden="true" className="absolute inset-0 w-full h-full opacity-25" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="profile-banner-dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                  <circle cx="20" cy="20" r="1.5" fill="hsl(var(--highlight-soft))" opacity="0.6" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#profile-banner-dots)" />
              <g stroke="hsl(var(--highlight-soft))" strokeWidth="0.5">
                <line x1="20" y1="10" x2="80" y2="40" />
                <line x1="80" y1="40" x2="140" y2="20" />
                <line x1="140" y1="20" x2="200" y2="50" />
                <line x1="200" y1="50" x2="260" y2="30" />
                <line x1="260" y1="30" x2="320" y2="60" />
                <line x1="320" y1="60" x2="380" y2="25" />
                <line x1="50" y1="70" x2="120" y2="90" />
                <line x1="120" y1="90" x2="180" y2="65" />
                <line x1="180" y1="65" x2="250" y2="100" />
                <line x1="250" y1="100" x2="340" y2="70" />
                <line x1="30" y1="110" x2="100" y2="130" />
                <line x1="100" y1="130" x2="170" y2="105" />
                <line x1="170" y1="105" x2="240" y2="140" />
                <line x1="240" y1="140" x2="310" y2="110" />
                <line x1="310" y1="110" x2="380" y2="145" />
              </g>
              <g stroke="hsl(var(--highlight-soft))" strokeWidth="0.3" opacity="0.7">
                <line x1="80" y1="40" x2="120" y2="90" />
                <line x1="200" y1="50" x2="180" y2="65" />
                <line x1="260" y1="30" x2="250" y2="100" />
                <line x1="140" y1="20" x2="170" y2="105" />
                <line x1="320" y1="60" x2="310" y2="110" />
              </g>
              <g fill="hsl(var(--highlight-soft))">
                <circle cx="80" cy="40" r="3" opacity="0.4" />
                <circle cx="140" cy="20" r="2.5" opacity="0.3" />
                <circle cx="200" cy="50" r="3.5" opacity="0.4" />
                <circle cx="260" cy="30" r="2" opacity="0.3" />
                <circle cx="320" cy="60" r="3" opacity="0.4" />
                <circle cx="120" cy="90" r="2.5" opacity="0.3" />
                <circle cx="180" cy="65" r="2" opacity="0.4" />
                <circle cx="250" cy="100" r="3" opacity="0.3" />
                <circle cx="170" cy="105" r="2.5" opacity="0.4" />
                <circle cx="310" cy="110" r="2" opacity="0.3" />
              </g>
            </svg>

            {/* Logo in banner (decorative watermark) */}
            <img
              src={darkLogo}
              alt=""
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-14 object-contain opacity-[0.08] pointer-events-none"
            />
          </div>

          {/* Avatar overlapping the banner */}
          <div className="flex flex-col items-center -mt-14 relative z-raised px-4 lg:pb-6">
            <div className="relative mb-3">
              {avatarUrl ? (
                <SmartImage
                  key={avatarUrl}
                  src={avatarUrl}
                  alt="Your profile photo"
                  className="w-28 h-28 rounded-full object-cover border-4 border-card shadow-lg bg-card"
                  referrerPolicy="no-referrer" preset="thumb" />
              ) : (
                <div aria-hidden="true" className="w-28 h-28 rounded-full bg-muted flex items-center justify-center border-4 border-card shadow-lg">
                  <span className="text-muted-foreground text-3xl font-semibold" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>{initials}</span>
                </div>
              )}
              <IconButton
                label="Change photo"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                aria-busy={uploadingPhoto || undefined}
                className="absolute -bottom-0.5 -right-0.5 size-10 border-2 border-card bg-primary text-primary-foreground shadow-md hover:bg-primary hover:text-primary-foreground [@media(pointer:fine)]:size-10 [&_svg]:size-4"
              >
                {uploadingPhoto ? <Spinner /> : <Camera aria-hidden="true" />}
              </IconButton>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>

            {/* Name */}
            <div className="flex items-center gap-1 mb-0.5">
              {isEditingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    aria-label="Full name"
                    autoComplete="name"
                    autoCapitalize="words"
                    className="h-11 w-[min(16rem,60vw)] rounded-control border border-input bg-background px-3 text-center text-base font-semibold text-foreground transition-[border-color,box-shadow] duration-hover focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
                    autoFocus
                    disabled={savingName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') cancelEditingName();
                    }}
                  />
                  <IconButton label="Save name" variant="solid" onClick={handleSaveName} disabled={savingName}>
                    {savingName ? <Spinner /> : <Check aria-hidden="true" />}
                  </IconButton>
                  <IconButton label="Cancel editing name" onClick={cancelEditingName} disabled={savingName}>
                    <X aria-hidden="true" />
                  </IconButton>
                </div>
              ) : (
                <>
                  <h1 className="text-foreground text-xl font-semibold text-center break-words [overflow-wrap:anywhere]" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>{displayName}</h1>
                  <IconButton label="Edit name" size="sm" onClick={startEditingName} className="text-muted-foreground">
                    <Edit3 aria-hidden="true" />
                  </IconButton>
                </>
              )}
            </div>
            <p className="text-muted-foreground text-sm break-words [overflow-wrap:anywhere] text-center">{user?.email}</p>
            <p className="text-muted-foreground text-xs mt-1">Member since {memberSince}</p>
          </div>
        </div>

        {/* ── Personal Information ── */}
        <div className="px-4 mt-6 lg:px-0">
          <motion.section
            aria-labelledby="personal-info-heading"
            initial={fadeUp.initial}
            animate={fadeUp.animate}
            transition={{ ...fadeUp.transition, delay: 0.06 }}
          >
            <h2 id="personal-info-heading" className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3 px-1">Personal information</h2>
            <div className="panel tx-sheet overflow-hidden divide-y divide-foreground/[0.08]">
              {/* Full Name */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <User aria-hidden="true" className="size-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={rowLabel}>Full name</p>
                  <p className="text-sm text-foreground font-medium break-words [overflow-wrap:anywhere]">{displayName}</p>
                </div>
                <button
                  type="button"
                  onClick={startEditingName}
                  className="-mr-2 inline-flex min-h-11 items-center rounded-control px-2 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Edit<span className="sr-only"> full name</span>
                </button>
              </div>

              {/* Email */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <Mail aria-hidden="true" className="size-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={rowLabel}>Email</p>
                  <p className="text-sm text-foreground font-medium break-words [overflow-wrap:anywhere]">{user?.email || 'Not set'}</p>
                </div>
                {user?.emailVerified && (
                  <StatusBadge tone="success" label="Verified" icon={CircleCheck} />
                )}
              </div>

              {/* Member Since */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <Calendar aria-hidden="true" className="size-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={rowLabel}>Member since</p>
                  <p className="text-sm text-foreground font-medium">{memberSince}</p>
                </div>
              </div>

              {/* WhatsApp helper / guidance */}
              <div className="flex items-start gap-3 px-4 py-3.5">
                <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <Phone aria-hidden="true" className="size-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={rowLabel}>WhatsApp</p>
                  {userProfile?.whatsappNumber ? (
                    <p className="text-sm text-foreground font-medium tabular-nums">+91 {userProfile.whatsappNumber.replace(/^\+?91/, '')}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not linked yet</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">
                    Verify a WhatsApp number for order updates and sign-in codes, and to turn on 2-step verification.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWhatsAppModal(true)}
                  className="-mr-2 inline-flex min-h-11 items-center gap-1.5 self-center whitespace-nowrap rounded-control px-2 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                >
                  <ShieldCheck aria-hidden="true" className="size-3.5" />
                  {userProfile?.whatsappNumber ? 'Manage' : 'Verify'}
                  <span className="sr-only"> WhatsApp number</span>
                </button>
              </div>
            </div>
          </motion.section>
        </div>
        </div>
      </main>

      {/* Desktop site footer */}
      <div className="hidden lg:block"><Footer /></div>

      {/* ── WhatsApp inline editor modal ── */}
      <WhatsAppSetupModal
        open={showWhatsAppModal}
        onSuccess={async (phone) => {
          try {
            await updateUserProfile({ whatsappNumber: phone });
            if (user?.uid) {
              await updateSecuritySettings(user.uid, { phoneVerified: true });
            }
            toast.success('WhatsApp number saved');
          } catch {
            toast.error('Unable to save your number. Try again.');
          } finally {
            setShowWhatsAppModal(false);
          }
        }}
        onSkip={() => setShowWhatsAppModal(false)}
      />

      {/* ── Crop Modal ── */}
      <Dialog open={showCropModal && !!imageToCrop} onOpenChange={(open) => { if (!open) handleCropCancel(); }}>
        <DialogContent className="flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-panel sm:border">
          <DialogHeader className="border-b border-foreground/[0.08] px-5 py-4 text-left">
            <DialogTitle className="px-0 pr-10 sm:pl-0 sm:pr-10">Edit photo</DialogTitle>
            <DialogDescription className="sr-only">Drag to position your photo and use the slider to zoom.</DialogDescription>
          </DialogHeader>

          <div className="relative flex-1 bg-muted sm:h-[400px] sm:flex-none">
            {imageToCrop && (
              <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            )}
          </div>

          <div className="border-t border-foreground/[0.08] bg-card px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mb-4 flex items-center gap-3">
              <ZoomOut aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                aria-label="Zoom"
                aria-valuetext={`${Math.round(zoomPercent)}%`}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="h-1 flex-1 rounded-full accent-primary [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent"
                style={{
                  background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${zoomPercent}%, hsl(var(--foreground) / 0.12) ${zoomPercent}%, hsl(var(--foreground) / 0.12) 100%)`,
                }}
              />
              <ZoomIn aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <span aria-hidden="true" className="min-w-[3rem] text-right text-sm font-medium text-muted-foreground tabular-nums">
                {Math.round(zoomPercent)}%
              </span>
            </div>
            <Button size="lg" onClick={handleCropSave} disabled={uploadingPhoto} className="w-full">
              {uploadingPhoto && <Spinner />}
              {uploadingPhoto ? 'Saving…' : 'Save photo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MobileBottomNav />
    </>
  );
};

export default ProfileEditPage;
