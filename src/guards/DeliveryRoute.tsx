import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Truck } from 'lucide-react';
import { motion } from 'framer-motion';
import { DELIVERY_PARTNERS_ENABLED } from '@/config/features';

interface DeliveryRouteProps {
  children: React.ReactNode;
}

const DeliveryRoute: React.FC<DeliveryRouteProps> = ({ children }) => {
  const { user, userProfile, loading, isDelivery } = useAuth();
  const location = useLocation();

  // Delivery-partner system is disabled — send everyone back home.
  if (!DELIVERY_PARTNERS_ENABLED) {
    return <Navigate to="/" replace />;
  }

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Loader2 className="h-12 w-12 animate-spin text-amber-500 mx-auto" />
          <p className="mt-4 text-gray-400">Verifying delivery access...</p>
        </motion.div>
      </div>
    );
  }

  // Redirect to delivery login if not authenticated
  if (!user) {
    return <Navigate to="/delivery" state={{ from: location }} replace />;
  }

  // Show access denied if user is not a delivery partner
  if (!isDelivery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4">
        <motion.div 
          className="text-center max-w-md mx-auto p-8"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="bg-red-500/10 rounded-full p-6 w-24 h-24 mx-auto mb-6 flex items-center justify-center">
            <Truck className="h-12 w-12 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-gray-400 mb-6">
            This area is restricted to delivery partners only. 
            If you believe you should have access, please contact the administrator.
          </p>
          <div className="space-y-3">
            <a
              href="/"
              className="block w-full bg-amber-600 hover:bg-amber-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
            >
              Go to Homepage
            </a>
            <a
              href="/delivery"
              className="block w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-6 rounded-lg transition-colors"
            >
              Login as Delivery Partner
            </a>
          </div>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
};

export default DeliveryRoute;
