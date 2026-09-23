import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronUp,
  Loader2,
  Navigation as NavigationIcon,
  MapPin,
  User,
  Phone,
  AlertCircle,
  Target,
  X,
  Layers,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getOrder, Order } from '@/services/orderService';
import { toast } from 'sonner';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet-routing-machine';

/* ══════════════════════════════════════════════════════════════════
   GLOBAL SETUP
   ══════════════════════════════════════════════════════════════════ */

// Hide the default leaflet-routing-machine itinerary panel
const _globalStyle = document.createElement('style');
_globalStyle.textContent = `.leaflet-routing-container{display:none!important}`;
document.head.appendChild(_globalStyle);

// Fix default Leaflet marker icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

/* ══════════════════════════════════════════════════════════════════
   TILE LAYER CONFIGURATIONS
   CartoDB Positron (Light) · CartoDB Dark Matter (Dark) · ESRI Satellite
   ══════════════════════════════════════════════════════════════════ */

type MapStyle = 'light' | 'dark' | 'satellite';

const TILE_CONFIGS: Record<MapStyle, { url: string; attribution: string; maxZoom: number }> = {
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
    maxZoom: 19,
  },
};

const STYLE_META: Record<MapStyle, { icon: string; label: string }> = {
  light: { icon: '☀️', label: 'Light' },
  dark: { icon: '🌙', label: 'Dark' },
  satellite: { icon: '🛰️', label: 'Satellite' },
};

/* ══════════════════════════════════════════════════════════════════
   MARKER ICONS
   ══════════════════════════════════════════════════════════════════ */

// Customer destination marker (red pin)
const customerIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Calculate compass bearing (degrees, clockwise from north)
const getBearing = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

// Delivery boy SVG icon with direction cone (bearing = degrees from north)
const createDeliveryBoyIcon = (bearing: number) => {
  const rot = bearing - 90; // SVG bike faces east (90°), adjust to bearing-from-north
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:56px;height:56px;">
        <!-- Direction cone -->
        <div style="position:absolute;top:50%;left:50%;width:90px;height:90px;transform:translate(-50%,-50%) rotate(${rot}deg);pointer-events:none;z-index:0;">
          <svg viewBox="0 0 90 90" width="90" height="90" style="overflow:visible">
            <path d="M45 45 L80 32 Q88 45 80 58 Z" fill="#3b82f6" opacity="0.18"/>
          </svg>
        </div>
        <!-- Pulse ring -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1;pointer-events:none;">
          <svg viewBox="0 0 60 60" width="60" height="60">
            <circle cx="30" cy="30" r="10" fill="#3b82f6" opacity="0.12">
              <animate attributeName="r" values="8;20;8" dur="2s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.2;0;0.2" dur="2s" repeatCount="indefinite"/>
            </circle>
          </svg>
        </div>
        <!-- Bike + Rider -->
        <div style="position:absolute;top:50%;left:50%;width:44px;height:44px;transform:translate(-50%,-50%) rotate(${rot}deg);z-index:2;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="44" height="44">
            <circle cx="18" cy="48" r="7" fill="none" stroke="#1e293b" stroke-width="2.5"/>
            <circle cx="18" cy="48" r="2" fill="#475569"/>
            <circle cx="46" cy="48" r="7" fill="none" stroke="#1e293b" stroke-width="2.5"/>
            <circle cx="46" cy="48" r="2" fill="#475569"/>
            <path d="M18 48 L28 36 L40 36 L46 48" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="28" y1="36" x2="18" y2="48" stroke="#dc2626" stroke-width="2" stroke-linecap="round"/>
            <line x1="34" y1="36" x2="46" y2="48" stroke="#dc2626" stroke-width="2" stroke-linecap="round"/>
            <rect x="26" y="38" width="12" height="6" rx="2" fill="#b91c1c"/>
            <line x1="42" y1="33" x2="48" y2="30" stroke="#374151" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="48" y1="28" x2="48" y2="33" stroke="#374151" stroke-width="2" stroke-linecap="round"/>
            <line x1="18" y1="44" x2="12" y2="42" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round"/>
            <rect x="10" y="26" width="14" height="12" rx="2" fill="#f97316" stroke="#ea580c" stroke-width="1"/>
            <rect x="13" y="29" width="8" height="6" rx="1" fill="#fed7aa"/>
            <path d="M30 34 C30 26 30 24 34 22" fill="none" stroke="#1e40af" stroke-width="3" stroke-linecap="round"/>
            <line x1="32" y1="28" x2="38" y2="32" stroke="#1e40af" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M35 26 Q40 28 43 32" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
            <line x1="30" y1="34" x2="34" y2="40" stroke="#1e3a5f" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="34" cy="18" r="6" fill="#dc2626"/>
            <path d="M28 18 Q28 14 34 12 Q40 14 40 18" fill="#b91c1c"/>
            <rect x="28" y="17" width="12" height="2.5" rx="1" fill="#1e293b" opacity="0.7"/>
            <circle cx="48" cy="36" r="2" fill="#fbbf24"/>
            <circle cx="48" cy="36" r="1" fill="#fef3c7"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    popupAnchor: [0, -28],
  });
};

/* ══════════════════════════════════════════════════════════════════
   SMOOTH MARKER ANIMATION (ease-out cubic)
   ══════════════════════════════════════════════════════════════════ */

const animateMarker = (
  marker: L.Marker,
  target: L.LatLngExpression,
  duration = 800,
  onComplete?: () => void
) => {
  const from = marker.getLatLng();
  const to = L.latLng(target);
  const t0 = performance.now();

  const step = (now: number) => {
    const p = Math.min((now - t0) / duration, 1);
    const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
    marker.setLatLng([
      from.lat + (to.lat - from.lat) * e,
      from.lng + (to.lng - from.lng) * e,
    ]);
    if (p < 1) requestAnimationFrame(step);
    else onComplete?.();
  };

  requestAnimationFrame(step);
};

/* ══════════════════════════════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════════════════════════════ */

interface LocationData {
  latitude: number;
  longitude: number;
}

/* ══════════════════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════════════════ */

const DeliveryMapPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user, isDelivery } = useAuth();

  // ─── STATE ───
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [deliveryBoyLocation, setDeliveryBoyLocation] = useState<LocationData | null>(null);
  const [customerLocation, setCustomerLocation] = useState<LocationData | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [duration, setDuration] = useState<string | null>(null);
  const [updatingLocation, setUpdatingLocation] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [routeSteps, setRouteSteps] = useState<any[]>([]);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>('light');
  const [autoFollow, setAutoFollow] = useState(true);
  const [showStylePicker, setShowStylePicker] = useState(false);

  // ─── REFS ───
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const routingControlRef = useRef<any>(null);
  const deliveryBoyMarkerRef = useRef<L.Marker | null>(null);
  const customerMarkerRef = useRef<L.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const mapInitializedRef = useRef(false);
  const lastRoutedLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const autoFollowRef = useRef(true);

  // Keep ref in sync with state (so callbacks/effects always have current value)
  useEffect(() => {
    autoFollowRef.current = autoFollow;
  }, [autoFollow]);

  // ─── AUTH REDIRECT ───
  useEffect(() => {
    if (!user || !isDelivery) navigate('/delivery');
  }, [user, isDelivery, navigate]);

  // ─── FETCH ORDER ───
  useEffect(() => {
    if (!orderId) {
      navigate('/delivery/dashboard');
      return;
    }

    const fetchOrder = async () => {
      try {
        const fetched = await getOrder(orderId);
        if (!fetched) {
          toast.error('Order not found');
          navigate('/delivery/dashboard');
          return;
        }
        if (fetched.delivery_boy_id !== user?.uid) {
          toast.error('You are not assigned to this order');
          navigate('/delivery/dashboard');
          return;
        }
        setOrder(fetched);
        if (fetched.shippingAddress) geocodeAddress(fetched.shippingAddress);
      } catch {
        toast.error('Failed to load order details');
        navigate('/delivery/dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, user, navigate]);

  // ─── GEOCODE CUSTOMER ADDRESS ───
  const geocodeAddress = async (address: any) => {
    try {
      // 1) If coordinates are already stored with the order, use them directly (most accurate)
      if (address.latitude && address.longitude) {
        console.log('Using stored coordinates:', address.latitude, address.longitude);
        setCustomerLocation({ latitude: address.latitude, longitude: address.longitude });
        return;
      }

      console.log('No stored coordinates, geocoding address...');

      // Haversine distance in km between two points
      const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      // Helper to try a Nominatim query
      const tryGeocode = async (queryStr: string): Promise<{ lat: number; lon: number } | null> => {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}&limit=1&countrycodes=in`
        );
        const data = await res.json();
        if (data?.length > 0) {
          return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        }
        return null;
      };

      // Step A: Get CITY coordinates first as our reference anchor
      const cityRef = await tryGeocode(`${address.city}, ${address.state}, India`);
      if (!cityRef) {
        toast.error('Could not locate city on map');
        return;
      }
      console.log('City reference point:', address.city, cityRef);

      // Validate a result is within maxKm of the city center (reject wrong matches)
      const MAX_DISTANCE_KM = 20;
      const isNearCity = (result: { lat: number; lon: number }) => {
        const dist = haversineKm(cityRef.lat, cityRef.lon, result.lat, result.lon);
        console.log(`  Distance from ${address.city}: ${dist.toFixed(1)} km`);
        return dist <= MAX_DISTANCE_KM;
      };

      // Step B: Try locality (area name like Ramanayyapeta) + city — validate distance
      if (address.locality) {
        const result = await tryGeocode(`${address.locality}, ${address.city}, ${address.state}, India`);
        if (result && isNearCity(result)) {
          console.log('✓ Geocoded via locality+city (validated):', result);
          setCustomerLocation({ latitude: result.lat, longitude: result.lon });
          return;
        }
        if (result) console.log('✗ Locality result rejected — too far from city');
      }

      // Step C: Try locality + pincode — validate distance
      if (address.locality && address.pincode) {
        const result = await tryGeocode(`${address.locality}, ${address.pincode}, India`);
        if (result && isNearCity(result)) {
          console.log('✓ Geocoded via locality+pincode (validated):', result);
          setCustomerLocation({ latitude: result.lat, longitude: result.lon });
          return;
        }
      }

      // Step D: Pincode + city — validate distance
      if (address.pincode) {
        const result = await tryGeocode(`${address.pincode}, ${address.city}, India`);
        if (result && isNearCity(result)) {
          console.log('✓ Geocoded via pincode+city (validated):', result);
          setCustomerLocation({ latitude: result.lat, longitude: result.lon });
          return;
        }
      }

      // Step E: Just pincode — validate distance
      if (address.pincode) {
        const result = await tryGeocode(`${address.pincode}, India`);
        if (result && isNearCity(result)) {
          console.log('✓ Geocoded via pincode (validated):', result);
          setCustomerLocation({ latitude: result.lat, longitude: result.lon });
          return;
        }
      }

      // Step F: Fall back to city center — always valid
      console.log('Using city center as delivery location:', cityRef);
      setCustomerLocation({ latitude: cityRef.lat, longitude: cityRef.lon });

    } catch {
      toast.error('Failed to locate customer address on map');
    }
  };

  // ─── GET CURRENT LOCATION (one-shot with fallback) ───
  const getCurrentLocation = useCallback(() => {
    setUpdatingLocation(true);

    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      setUpdatingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDeliveryBoyLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocationError(null);
        setUpdatingLocation(false);
        toast.success('Location updated');
      },
      () => {
        // Retry with lower accuracy
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setDeliveryBoyLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            setLocationError(null);
            setUpdatingLocation(false);
            toast.success('Location updated (approximate)');
          },
          () => {
            setLocationError('Unable to get your location. Please enable GPS.');
            setUpdatingLocation(false);
            toast.error('Failed to get location');
          },
          { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
    );
  }, []);

  // ─── WATCH POSITION (real-time GPS) ───
  useEffect(() => {
    getCurrentLocation();

    if (!navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setDeliveryBoyLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocationError(null);
      },
      (err) => {
        if (err.code !== err.TIMEOUT) console.error('Watch error:', err);
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 15000 }
    );

    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [getCurrentLocation]);

  // ─── INITIALIZE MAP (once, after loading finishes and container is available) ───
  useEffect(() => {
    if (loading) return; // wait for order to load so the container div is mounted
    if (!mapContainerRef.current || mapInitializedRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,       // cleaner mobile look — pinch to zoom
      attributionControl: true,
    });

    // Start with OpenStreetMap tiles (most reliable)
    const cfg = TILE_CONFIGS.light;
    const tile = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
    }).addTo(map);
    tileLayerRef.current = tile;

    // Default view (India center) — overridden once real coords arrive
    map.setView([17.0, 81.0], 10);

    // Disable auto-follow when user manually drags the map
    map.on('dragstart', () => setAutoFollow(false));

    mapRef.current = map;
    mapInitializedRef.current = true;

    // Force Leaflet to recalculate container size (fixes blank tiles)
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);

    return () => {
      if (routingControlRef.current) {
        try { map.removeControl(routingControlRef.current); } catch (_) { /* safe */ }
        routingControlRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      mapInitializedRef.current = false;
    };
  }, [loading]);

  // ─── SWITCH TILE LAYER ───
  const switchMapStyle = useCallback((style: MapStyle) => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);

    const cfg = TILE_CONFIGS[style];
    tileLayerRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
    }).addTo(map);

    setMapStyle(style);
    setShowStylePicker(false);
  }, []);

  // ─── UPDATE ROUTE (OSRM) ───
  const updateRoute = useCallback(
    (map: L.Map, from: LocationData, to: LocationData, isNav: boolean) => {
      // Remove existing route safely
      if (routingControlRef.current) {
        try { map.removeControl(routingControlRef.current); } catch (_) { /* safe */ }
        routingControlRef.current = null;
      }

      const routeColor = isNav ? '#10b981' : '#3b82f6';
      const routeWeight = isNav ? 6 : 5;
      const routeOpacity = isNav ? 0.85 : 0.75;

      const rc = (L as any).Routing.control({
        waypoints: [
          L.latLng(from.latitude, from.longitude),
          L.latLng(to.latitude, to.longitude),
        ],
        routeWhileDragging: false,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: false,
        showAlternatives: false,
        show: false,
        lineOptions: {
          styles: [{ color: routeColor, weight: routeWeight, opacity: routeOpacity }],
        },
        createMarker: () => null,
        router: (L as any).Routing.osrmv1({
          serviceUrl: 'https://router.project-osrm.org/route/v1',
        }),
      }).addTo(map);

      rc.on('routesfound', (e: any) => {
        const r = e.routes?.[0];
        if (!r) return;
        setDistance(`${(r.summary.totalDistance / 1000).toFixed(2)} km`);
        setDuration(`${Math.round(r.summary.totalTime / 60)} min`);
        if (r.instructions?.length) setRouteSteps(r.instructions);
      });

      routingControlRef.current = rc;
    },
    []
  );

  // ─── UPDATE MARKERS & ROUTE WHEN LOCATIONS CHANGE ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !customerLocation) return;

    // ── Customer marker ──
    if (customerMarkerRef.current) {
      customerMarkerRef.current.setLatLng([customerLocation.latitude, customerLocation.longitude]);
    } else {
      const m = L.marker([customerLocation.latitude, customerLocation.longitude], { icon: customerIcon }).addTo(map);
      m.bindPopup(
        `<div style="text-align:center"><strong>📍 Delivery Location</strong><br/>${order?.shippingAddress.fullName || 'Customer'}<br/>${order?.shippingAddress.city || ''}</div>`
      );
      customerMarkerRef.current = m;
    }

    // ── Delivery boy marker ──
    if (deliveryBoyLocation) {
      const bearing = getBearing(deliveryBoyLocation, customerLocation);
      const icon = createDeliveryBoyIcon(bearing);

      if (deliveryBoyMarkerRef.current) {
        // Smooth animated transition to new position
        animateMarker(
          deliveryBoyMarkerRef.current,
          [deliveryBoyLocation.latitude, deliveryBoyLocation.longitude],
          800
        );
        // Update icon rotation immediately
        deliveryBoyMarkerRef.current.setIcon(icon);
      } else {
        // First time — create marker
        const m = L.marker(
          [deliveryBoyLocation.latitude, deliveryBoyLocation.longitude],
          { icon }
        ).addTo(map);
        m.bindPopup(`<div style="text-align:center"><strong>🏍️ You</strong><br/>Delivery Partner</div>`);
        deliveryBoyMarkerRef.current = m;

        // Fit bounds to show both markers on first load
        const bounds = L.latLngBounds(
          [deliveryBoyLocation.latitude, deliveryBoyLocation.longitude],
          [customerLocation.latitude, customerLocation.longitude]
        );
        map.fitBounds(bounds, { padding: [60, 60] });
      }

      // Auto-follow: smooth pan to delivery boy
      if (autoFollowRef.current) {
        map.panTo([deliveryBoyLocation.latitude, deliveryBoyLocation.longitude], {
          animate: true,
          duration: 0.8,
        });
      }

      // Re-route only if delivery boy moved > ~50m
      const last = lastRoutedLocationRef.current;
      const moved =
        !last ||
        Math.abs(deliveryBoyLocation.latitude - last.lat) > 0.0005 ||
        Math.abs(deliveryBoyLocation.longitude - last.lng) > 0.0005;

      if (moved) {
        updateRoute(map, deliveryBoyLocation, customerLocation, isNavigating);
        lastRoutedLocationRef.current = {
          lat: deliveryBoyLocation.latitude,
          lng: deliveryBoyLocation.longitude,
        };
      }
    } else {
      map.setView([customerLocation.latitude, customerLocation.longitude], 14);
    }
  }, [customerLocation, deliveryBoyLocation, order, isNavigating, updateRoute]);

  // ─── START NAVIGATION ───
  const openNavigation = () => {
    if (!customerLocation || !deliveryBoyLocation || !mapRef.current) {
      toast.error('Locations not available');
      return;
    }

    setIsNavigating(true);
    setAutoFollow(true);

    // Force re-route on next render (useEffect will pick it up with green color)
    lastRoutedLocationRef.current = null;

    const bounds = L.latLngBounds(
      [deliveryBoyLocation.latitude, deliveryBoyLocation.longitude],
      [customerLocation.latitude, customerLocation.longitude]
    );
    mapRef.current.fitBounds(bounds, { padding: [60, 60] });
    toast.success('Navigation started!');
  };

  // ─── STOP NAVIGATION ───
  const stopNavigation = () => {
    setIsNavigating(false);
    setRouteSteps([]);
    // Force re-route on next render (blue color)
    lastRoutedLocationRef.current = null;
  };

  // ─── CALL CUSTOMER ───
  const callCustomer = () => {
    if (order?.shippingAddress.mobile) {
      window.location.href = `tel:${order.shippingAddress.mobile}`;
    }
  };

  // ─── RECENTER & RE-ENABLE AUTO-FOLLOW ───
  const recenter = useCallback(() => {
    if (!deliveryBoyLocation || !mapRef.current) return;
    setAutoFollow(true);
    mapRef.current.setView(
      [deliveryBoyLocation.latitude, deliveryBoyLocation.longitude],
      17,
      { animate: true }
    );
  }, [deliveryBoyLocation]);

  /* ══════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════ */

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-stone-600 font-medium">Loading map…</p>
        </div>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-stone-900">
      {/* ─── FULL-SCREEN MAP ─── */}
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />

      {/* ─── TOP-LEFT: BACK BUTTON ─── */}
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => navigate(`/delivery/order/${orderId}`)}
        className="absolute top-4 left-4 z-[999] p-2.5 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md shadow-lg text-stone-700 hover:bg-white transition-all"
      >
        <ChevronLeft className="h-5 w-5" />
      </motion.button>

      {/* ─── TOP-RIGHT: CONTROL CLUSTER ─── */}
      <div className="absolute top-4 right-4 z-[999] flex flex-col gap-2">
        {/* Map Style Toggler */}
        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowStylePicker(!showStylePicker)}
            className="p-2.5 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md shadow-lg text-stone-700 hover:bg-white transition-all"
          >
            <Layers className="h-5 w-5" />
          </motion.button>

          <AnimatePresence>
            {showStylePicker && (
              <motion.div
                initial={{ opacity: 0, scale: 0.85, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute top-12 right-0 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-stone-200 p-1.5 min-w-[140px]"
              >
                {(Object.keys(TILE_CONFIGS) as MapStyle[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => switchMapStyle(key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                      mapStyle === key
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <span className="text-base">{STYLE_META[key].icon}</span>
                    {STYLE_META[key].label}
                    {mapStyle === key && (
                      <span className="ml-auto w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Recenter / Auto-Follow */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={recenter}
          className={`p-2.5 rounded-full shadow-lg backdrop-blur-md transition-all ${
            autoFollow
              ? 'bg-blue-500 text-white shadow-blue-500/30'
              : 'bg-white/90 text-stone-600 hover:bg-white'
          }`}
        >
          <Target className="h-5 w-5" />
        </motion.button>

        {/* Refresh GPS */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={getCurrentLocation}
          disabled={updatingLocation}
          className="p-2.5 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md shadow-lg text-stone-600 hover:bg-white transition-all disabled:opacity-50"
        >
          {updatingLocation ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <NavigationIcon className="h-5 w-5" />
          )}
        </motion.button>
      </div>

      {/* ─── ERROR OVERLAY ─── */}
      <AnimatePresence>
        {locationError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-4 left-16 right-16 z-[999] bg-red-50/95 backdrop-blur-md border border-red-200 rounded-2xl px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700 font-medium">{locationError}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── LIVE NAVIGATION PILL (shown when navigating) ─── */}
      {isNavigating && distance && duration && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[999] bg-emerald-500 text-white px-5 py-2 rounded-full shadow-lg shadow-emerald-500/30 flex items-center gap-3"
        >
          <NavigationIcon className="h-4 w-4" />
          <span className="text-sm font-bold">{distance}</span>
          <span className="w-px h-4 bg-white/40" />
          <span className="text-sm font-bold">{duration}</span>
        </motion.div>
      )}

      {/* ─── BOTTOM SHEET ─── */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: isSheetOpen ? 0 : 'calc(100% - 88px)' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
        className="absolute bottom-0 left-0 right-0 z-[998] bg-white dark:bg-zinc-900 rounded-t-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.15)]"
        style={{ maxHeight: '78vh' }}
      >
        {/* Handle */}
        <button
          onClick={() => setIsSheetOpen(!isSheetOpen)}
          className="w-full flex flex-col items-center pt-3 pb-2 cursor-pointer active:bg-stone-50 rounded-t-3xl transition-colors"
        >
          <div className="w-10 h-1 rounded-full bg-stone-300 mb-1.5" />
          <motion.div
            animate={{ rotate: isSheetOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronUp className="h-5 w-5 text-stone-400" />
          </motion.div>
        </button>

        {/* Peek: Distance & ETA */}
        <div className="px-4 pb-3">
          {distance && duration ? (
            <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">Distance</p>
                  <p className="text-lg font-bold text-stone-800">{distance}</p>
                </div>
                <div className="w-px h-8 bg-blue-200" />
                <div className="text-center">
                  <p className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">ETA</p>
                  <p className="text-lg font-bold text-stone-800">{duration}</p>
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <NavigationIcon className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center bg-stone-50 rounded-2xl px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-stone-400 mr-2" />
              <p className="text-xs text-stone-400">Calculating route…</p>
            </div>
          )}
        </div>

        {/* Expanded Content */}
        <AnimatePresence>
          {isSheetOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="px-4 pb-6 overflow-y-auto"
              style={{ maxHeight: 'calc(78vh - 140px)' }}
            >
              {/* Order badge */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Order</span>
                <span className="font-mono text-xs font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md">
                  #{order.orderId}
                </span>
              </div>

              {/* Customer Card */}
              <div className="bg-stone-50 rounded-2xl p-4 mb-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                    <User className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-800 truncate">
                      {order.shippingAddress.fullName}
                    </p>
                    <p className="text-xs text-stone-400">{order.shippingAddress.mobile}</p>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={callCustomer}
                    className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all"
                  >
                    <Phone className="h-4 w-4" />
                  </motion.button>
                </div>
                <div className="flex items-start gap-2 text-xs text-stone-500">
                  <MapPin className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p>
                    {order.shippingAddress.address}
                    {order.shippingAddress.locality && `, ${order.shippingAddress.locality}`}
                    , {order.shippingAddress.city}, {order.shippingAddress.state} -{' '}
                    {order.shippingAddress.pincode}
                  </p>
                </div>
              </div>

              {/* Turn-by-turn directions (during navigation) */}
              {isNavigating && routeSteps.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-2">
                    Directions
                  </p>
                  <div className="max-h-36 overflow-y-auto bg-stone-50 rounded-xl border border-stone-100 divide-y divide-stone-100">
                    {routeSteps
                      .filter((s: any) => s.text?.trim())
                      .map((s: any, i: number) => (
                        <div key={i} className="flex items-start gap-2.5 px-3 py-2">
                          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-bold mt-0.5">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-stone-700 leading-relaxed">{s.text}</p>
                            {s.distance > 0 && (
                              <p className="text-[10px] text-stone-400 mt-0.5">
                                {s.distance >= 1000
                                  ? `${(s.distance / 1000).toFixed(1)} km`
                                  : `${Math.round(s.distance)} m`}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2">
                {!isNavigating ? (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={openNavigation}
                    disabled={!customerLocation || !deliveryBoyLocation}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <NavigationIcon className="h-5 w-5" />
                    Start Navigation
                  </motion.button>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={stopNavigation}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-semibold rounded-xl shadow-lg shadow-red-500/20 transition-all"
                  >
                    <X className="h-5 w-5" />
                    Stop Navigation
                  </motion.button>
                )}

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={recenter}
                  disabled={!deliveryBoyLocation}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium rounded-xl transition-all disabled:opacity-50"
                >
                  <Target className="h-4 w-4" />
                  Center on My Location
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default DeliveryMapPage;
