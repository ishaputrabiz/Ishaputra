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
      toast.success('Profile photo updated!');
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
      toast.error('Name cannot be empty');
      return;
    }
    setSavingName(true);
    try {
      await updateUserProfile({ name: nameInput.trim() });
      setIsEditingName(false);
      toast.success('Name updated!');
    } catch {
      toast.error('Failed to update name.');
    } finally {
      setSavingName(false);
    }
  };

  const displayName = userProfile?.name || userProfile?.username || user?.email?.split('@')[0] || 'User';
  const initials = displayName.charAt(0).toUpperCase();

  const memberSince = userProfile?.createdAt
    ? new Date(userProfile.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';

  return (
    <>
      {/* Desktop site header */}
      <div className="hidden lg:block"><Header /></div>

      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900/50 pb-24 lg:pb-16 dark:bg-[linear-gradient(180deg,rgba(19,17,15,0.98)_0%,rgba(14,14,15,0.98)_100%)]" style={{ fontFamily: "'Poppins', sans-serif" }}>
        {/* Desktop page wrapper for centered card width */}
        <div className="lg:max-w-3xl lg:mx-auto lg:px-6 lg:pt-8">
        <button
          onClick={() => navigate('/account')}
          className="mb-4 hidden items-center gap-2 rounded-full border border-[#d4af37]/15 bg-white/90 dark:bg-zinc-900/90 px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 shadow-sm transition-colors hover:bg-white dark:border-[#d4af37]/20 dark:bg-zinc-900/88 dark:text-zinc-100 dark:hover:bg-zinc-900 lg:inline-flex"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        {/* ── Banner + Avatar Section ── */}
        <div className="relative lg:overflow-hidden lg:rounded-3xl lg:border lg:border-gray-100 dark:border-zinc-800 lg:bg-white dark:bg-zinc-900 lg:shadow-sm dark:lg:border-zinc-800 dark:lg:bg-zinc-900/88">
          {/* Banner Background with geometric pattern */}
          <div className="relative h-40 bg-gray-100 dark:bg-zinc-800 overflow-hidden">
            {/* Back Button — mobile only (desktop has site header) */}
            <button
              onClick={() => navigate(-1)}
              className="lg:hidden absolute top-4 left-4 z-10 rounded-full bg-white/80 dark:bg-zinc-900/80 p-2 shadow-sm transition-colors hover:bg-white dark:bg-zinc-900/85 dark:hover:bg-zinc-900"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-zinc-300 dark:text-zinc-100" />
            </button>

            {/* Geometric Network Pattern SVG */}
            <svg className="absolute inset-0 w-full h-full opacity-[0.15]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                  <circle cx="20" cy="20" r="1.5" fill="#6B7280" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#dots)" />
              {/* Connected lines */}
              <line x1="20" y1="10" x2="80" y2="40" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="80" y1="40" x2="140" y2="20" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="140" y1="20" x2="200" y2="50" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="200" y1="50" x2="260" y2="30" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="260" y1="30" x2="320" y2="60" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="320" y1="60" x2="380" y2="25" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="50" y1="70" x2="120" y2="90" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="120" y1="90" x2="180" y2="65" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="180" y1="65" x2="250" y2="100" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="250" y1="100" x2="340" y2="70" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="30" y1="110" x2="100" y2="130" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="100" y1="130" x2="170" y2="105" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="170" y1="105" x2="240" y2="140" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="240" y1="140" x2="310" y2="110" stroke="#9CA3AF" strokeWidth="0.5" />
              <line x1="310" y1="110" x2="380" y2="145" stroke="#9CA3AF" strokeWidth="0.5" />
              {/* Cross connections */}
              <line x1="80" y1="40" x2="120" y2="90" stroke="#D1D5DB" strokeWidth="0.3" />
              <line x1="200" y1="50" x2="180" y2="65" stroke="#D1D5DB" strokeWidth="0.3" />
              <line x1="260" y1="30" x2="250" y2="100" stroke="#D1D5DB" strokeWidth="0.3" />
              <line x1="140" y1="20" x2="170" y2="105" stroke="#D1D5DB" strokeWidth="0.3" />
              <line x1="320" y1="60" x2="310" y2="110" stroke="#D1D5DB" strokeWidth="0.3" />
              {/* Nodes at intersections */}
              <circle cx="80" cy="40" r="3" fill="#9CA3AF" opacity="0.4" />
              <circle cx="140" cy="20" r="2.5" fill="#9CA3AF" opacity="0.3" />
              <circle cx="200" cy="50" r="3.5" fill="#9CA3AF" opacity="0.4" />
              <circle cx="260" cy="30" r="2" fill="#9CA3AF" opacity="0.3" />
              <circle cx="320" cy="60" r="3" fill="#9CA3AF" opacity="0.4" />
              <circle cx="120" cy="90" r="2.5" fill="#9CA3AF" opacity="0.3" />
              <circle cx="180" cy="65" r="2" fill="#9CA3AF" opacity="0.4" />
              <circle cx="250" cy="100" r="3" fill="#9CA3AF" opacity="0.3" />
              <circle cx="170" cy="105" r="2.5" fill="#9CA3AF" opacity="0.4" />
              <circle cx="310" cy="110" r="2" fill="#9CA3AF" opacity="0.3" />
            </svg>

            {/* Logo in banner */}
            <img
              src={darkLogo}
              alt="Sreerasthu"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-14 object-contain opacity-[0.08] pointer-events-none"
            />
          </div>

          {/* Avatar overlapping the banner */}
          <div className="flex flex-col items-center -mt-14 relative z-10">
            <div className="relative mb-2">
              {avatarUrl ? (
                <SmartImage
                  key={avatarUrl}
                  src={avatarUrl}
                  alt="Profile"
                  className="w-28 h-28 rounded-full object-cover border-4 border-white dark:border-zinc-800 shadow-lg bg-white dark:bg-zinc-900"
                  referrerPolicy="no-referrer" preset="thumb" />
              ) : (
                <div className="w-28 h-28 rounded-full bg-gray-200 dark:bg-zinc-800 dark:bg-zinc-700 flex items-center justify-center border-4 border-white dark:border-zinc-800 shadow-lg">
                  <span className="text-gray-500 dark:text-zinc-500 dark:text-zinc-400 text-3xl font-bold">{initials}</span>
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute bottom-1 right-1 w-8 h-8 bg-gray-900 dark:bg-zinc-100 rounded-full flex items-center justify-center shadow-lg hover:bg-gray-800 dark:bg-zinc-100 transition-colors border-2 border-white dark:border-zinc-800"
              >
                {uploadingPhoto ? (
                  <div className="w-4 h-4 border-2 border-white dark:border-zinc-800 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </div>

            {/* Name */}
            <div className="flex items-center gap-2 mb-0.5">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-lg font-bold text-center px-3 py-1 rounded-lg border border-gray-300 dark:border-zinc-700 focus:outline-none focus:border-gray-500"
                    autoFocus
                    disabled={savingName}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  />
                  <button onClick={handleSaveName} disabled={savingName} className="p-1 rounded-full bg-gray-200 dark:bg-zinc-800 dark:bg-zinc-700">
                    <Check className="w-4 h-4 text-gray-700 dark:text-zinc-300" />
                  </button>
                  <button onClick={() => setIsEditingName(false)} className="p-1 rounded-full bg-gray-200 dark:bg-zinc-800 dark:bg-zinc-700">
                    <X className="w-4 h-4 text-gray-700 dark:text-zinc-300" />
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-gray-900 dark:text-zinc-100 text-lg font-bold">{displayName}</h2>
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="p-1 rounded-full bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:bg-zinc-700 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-gray-500 dark:text-zinc-500 dark:text-zinc-400" />
                  </button>
                </>
              )}
            </div>
            <p className="text-gray-500 dark:text-zinc-500 dark:text-zinc-400 text-xs">{user?.email}</p>
            <p className="text-gray-400 dark:text-zinc-500 text-[10px] mt-0.5">Member since {memberSince}</p>
          </div>
        </div>

        {/* ── Personal Information ── */}
        <div className="px-4 mt-5">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100 mb-3 px-1">Personal Information</h3>
            <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm divide-y divide-gray-100 dark:border-zinc-800 dark:bg-zinc-900/88 dark:divide-zinc-800">
              {/* Full Name */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-500 font-semibold">Full Name</p>
                  <p className="text-sm text-gray-900 dark:text-zinc-100 font-medium truncate">{displayName}</p>
                </div>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="text-blue-500 text-xs font-semibold"
                >
                  Edit
                </button>
              </div>

              {/* Email */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-500 font-semibold">Email</p>
                  <p className="text-sm text-gray-900 dark:text-zinc-100 font-medium truncate">{user?.email || 'Not set'}</p>
                </div>
                {user?.emailVerified && (
                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">Verified</span>
                )}
              </div>

              {/* Member Since */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-500 font-semibold">Member Since</p>
                  <p className="text-sm text-gray-900 dark:text-zinc-100 font-medium">{memberSince}</p>
                </div>
              </div>

              {/* WhatsApp helper / guidance */}
              <div className="flex items-start gap-3 px-4 py-3.5">
                <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-500 font-semibold">WhatsApp</p>
                  {userProfile?.whatsappNumber ? (
                    <p className="text-sm text-gray-900 dark:text-zinc-100 font-medium truncate">+91 {userProfile.whatsappNumber.replace(/^\+?91/, '')}</p>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-zinc-500 dark:text-zinc-400">Not linked yet</p>
                  )}
                  <p className="text-[11px] text-gray-500 dark:text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">
                    Verify a WhatsApp number to receive order updates, OTPs, and turn on two-factor sign-in.
                  </p>
                </div>
                <button
                  onClick={() => setShowWhatsAppModal(true)}
                  className="text-emerald-600 text-xs font-semibold inline-flex items-center gap-1 self-center whitespace-nowrap"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {userProfile?.whatsappNumber ? 'Manage' : 'Verify'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>

        {/* App Version */}
        <p className="text-center text-[10px] text-gray-400 dark:text-zinc-500 pb-2 mt-8">Sreerasthu Silvers v1.0.0</p>
        </div>
      </div>

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
            toast.error('Could not save number');
          } finally {
            setShowWhatsAppModal(false);
          }
        }}
        onSkip={() => setShowWhatsAppModal(false)}
      />

      {/* ── Crop Modal ── */}
      {showCropModal && imageToCrop && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-none sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-md overflow-hidden flex flex-col sm:block">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-zinc-800">
              <h2 className="text-gray-900 dark:text-zinc-100 text-lg font-semibold">Edit Photo</h2>
              <button
                onClick={handleCropCancel}
                className="p-1 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative bg-gray-100 dark:bg-zinc-800 flex-1 sm:h-[400px]">
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
            </div>

            <div className="px-6 py-5 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-3 mb-4">
                <ZoomOut className="w-5 h-5 text-gray-500 dark:text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-gray-200 dark:bg-zinc-800 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${((zoom - 1) / 2) * 100}%, #E5E7EB ${((zoom - 1) / 2) * 100}%, #E5E7EB 100%)`
                  }}
                />
                <ZoomIn className="w-5 h-5 text-gray-500 dark:text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-600 dark:text-zinc-400 min-w-[3rem] text-right">
                  {Math.round((zoom - 1) / 2 * 100)}%
                </span>
              </div>
              <button
                onClick={handleCropSave}
                disabled={uploadingPhoto}
                className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingPhoto ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <MobileBottomNav />
    </>
  );
};

export default ProfileEditPage;
