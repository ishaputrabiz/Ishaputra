import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import MobileBottomNav from '@/components/MobileBottomNav';
import Footer from '@/components/Footer';
import {
  User,
  CreditCard,
  MapPin,
  Bell,
  Shield,
  HelpCircle,
  Heart,
  Package,
  LogOut,
  ChevronRight,
  Sparkles,
  Ticket,
  Globe,
  Star,
  MessageCircle,
} from 'lucide-react';

const Profile = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const quickAccessCards = [
    { id: 'orders', label: 'Orders', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'wishlist', label: 'Wishlist', icon: Heart, color: 'text-pink-600', bg: 'bg-pink-50' },
    { id: 'coupons', label: 'Coupons', icon: Ticket, color: 'text-orange-600', bg: 'bg-orange-50' },
    { id: 'help', label: 'Help Center', icon: HelpCircle, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  const accountSettings = [
    { id: 'plus', label: 'Venkat Plus', icon: Sparkles, color: 'text-yellow-600' },
    { id: 'profile', label: 'Edit Profile', icon: User, color: 'text-blue-600' },
    { id: 'cards', label: 'Saved Credit / Debit & Gift Cards', icon: CreditCard, color: 'text-purple-600' },
    { id: 'addresses', label: 'Saved Addresses', icon: MapPin, color: 'text-red-600' },
    { id: 'language', label: 'Select Language', icon: Globe, color: 'text-blue-600' },
    { id: 'notifications', label: 'Notification Settings', icon: Bell, color: 'text-green-600' },
    { id: 'privacy', label: 'Privacy Center', icon: Shield, color: 'text-gray-600' },
  ];

  const myActivity = [
    { id: 'reviews', label: 'Reviews', icon: Star, color: 'text-yellow-600' },
    { id: 'questions', label: 'Questions & Answers', icon: MessageCircle, color: 'text-blue-600' },
  ];

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900">
      <div className="hidden lg:block">
        <Header />
      </div>

      {/* Mobile View */}
      <div className="lg:hidden">
        {/* Quick Access Cards */}
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3">
            {quickAccessCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.button
                  key={card.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-zinc-800 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${card.color}`} />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{card.label}</span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Promotional Banner */}
        <div className="px-4 pb-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-r from-gray-900 to-gray-700 rounded-2xl p-6 text-white overflow-hidden relative"
          >
            <div className="relative z-10">
              <p className="text-xs mb-2 opacity-80">EXCLUSIVE OFFER</p>
              <h3 className="text-xl font-bold mb-1">Premium Silver</h3>
              <h3 className="text-xl font-bold mb-3">Collection</h3>
              <p className="text-2xl font-bold text-yellow-400 mb-2">From ₹2,999*</p>
              <p className="text-xs opacity-80">Pure 925 Sterling Silver</p>
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mb-12"></div>
          </motion.div>
        </div>

        {/* Account Settings */}
        <div className="px-4 pb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100 mb-4">Account Settings</h2>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
            {accountSettings.map((setting, index) => {
              const Icon = setting.icon;
              return (
                <motion.button
                  key={setting.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.05 }}
                  className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 transition-colors border-b border-gray-100 dark:border-zinc-800 last:border-b-0"
                >
                  <Icon className={`w-5 h-5 ${setting.color}`} />
                  <span className="text-sm font-medium text-gray-900 dark:text-zinc-100 flex-1 text-left">
                    {setting.label}
                  </span>
                  <ChevronRight className="w-5 h-5 text-gray-400 dark:text-zinc-500" />
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* My Activity */}
        <div className="px-4 pb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100 mb-4">My Activity</h2>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
            {myActivity.map((activity, index) => {
              const Icon = activity.icon;
              return (
                <motion.button
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + index * 0.05 }}
                  className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 transition-colors border-b border-gray-100 dark:border-zinc-800 last:border-b-0"
                >
                  <Icon className={`w-5 h-5 ${activity.color}`} />
                  <span className="text-sm font-medium text-gray-900 dark:text-zinc-100 flex-1 text-left">
                    {activity.label}
                  </span>
                  <ChevronRight className="w-5 h-5 text-gray-400 dark:text-zinc-500" />
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Sign Out Button */}
        <div className="px-4 pb-20">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            onClick={handleLogout}
            className="w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-4 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center justify-center gap-2">
              <LogOut className="w-5 h-5 text-gray-700 dark:text-zinc-300" />
              <span className="text-sm font-medium text-gray-900 dark:text-zinc-100">
                Sign Out
              </span>
            </div>
          </motion.button>
        </div>
      </div>

      {/* Desktop View */}
      <div className="hidden lg:block">
        <div className="container-custom py-8">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold mb-8">My Account</h1>
            
            {/* Quick Access Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              {quickAccessCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.id}
                    className="bg-white dark:bg-zinc-900 border-2 border-gray-200 dark:border-zinc-800 rounded-xl p-6 hover:border-primary transition-all"
                  >
                    <div className={`w-12 h-12 rounded-lg ${card.bg} flex items-center justify-center mb-4`}>
                      <Icon className={`w-6 h-6 ${card.color}`} />
                    </div>
                    <span className="text-lg font-semibold text-gray-900 dark:text-zinc-100">{card.label}</span>
                  </button>
                );
              })}
            </div>
            
            {/* Account Settings */}
            <div className="mt-8">
              <h2 className="text-2xl font-bold mb-6">Account Settings</h2>
              <div className="space-y-2">
                {accountSettings.map((setting) => {
                  const Icon = setting.icon;
                  return (
                    <button
                      key={setting.id}
                      className="w-full flex items-center gap-4 p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 transition-colors"
                    >
                      <Icon className={`w-6 h-6 ${setting.color}`} />
                      <span className="text-base font-medium text-gray-900 dark:text-zinc-100 flex-1 text-left">
                        {setting.label}
                      </span>
                      <ChevronRight className="w-5 h-5 text-gray-400 dark:text-zinc-500" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* My Activity */}
            <div className="mt-8">
              <h2 className="text-2xl font-bold mb-6">My Activity</h2>
              <div className="space-y-2">
                {myActivity.map((activity) => {
                  const Icon = activity.icon;
                  return (
                    <button
                      key={activity.id}
                      className="w-full flex items-center gap-4 p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 transition-colors"
                    >
                      <Icon className={`w-6 h-6 ${activity.color}`} />
                      <span className="text-base font-medium text-gray-900 dark:text-zinc-100 flex-1 text-left">
                        {activity.label}
                      </span>
                      <ChevronRight className="w-5 h-5 text-gray-400 dark:text-zinc-500" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sign Out */}
            <div className="mt-8">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-3 p-4 rounded-lg border-2 border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 transition-colors"
              >
                <LogOut className="w-6 h-6 text-gray-700 dark:text-zinc-300" />
                <span className="text-base font-medium text-gray-900 dark:text-zinc-100">
                  Sign Out
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <MobileBottomNav />
      <div className="hidden lg:block">
        <Footer />
      </div>
    </div>
  );
};

export default Profile;
