import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Power,
  PowerOff,
  Loader2,
  X,
  Mail,
  Phone,
  MapPin,
  Truck,
  Package,
  Star,
  Upload,
  Eye,
  EyeOff,
  AlertCircle,
  LayoutGrid,
  List,
  UserCheck,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { db } from '@/config/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  DeliveryBoy,
  DeliveryBoyFormData,
  subscribeToDeliveryBoys,
  createDeliveryBoy,
  updateDeliveryBoy,
  deleteDeliveryBoy,
  toggleDeliveryBoyStatus,
  getDeliveryBoyStats,
} from '@/services/deliveryBoyService';
import { SmartImage } from "@/components/ui/smart-image";

const AdminDeliveryBoys = () => {
  const navigate = useNavigate();
  // State Management
  const [deliveryBoys, setDeliveryBoys] = useState<DeliveryBoy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedDeliveryBoy, setSelectedDeliveryBoy] = useState<DeliveryBoy | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [profileDeliveryBoy, setProfileDeliveryBoy] = useState<DeliveryBoy | null>(null);
  const [profileOrders, setProfileOrders] = useState<any[]>([]);
  const [profileRatings, setProfileRatings] = useState<any[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    onDuty: 0,
    totalDeliveries: 0,
    averageRating: 0,
  });

  // Form Data
  const [formData, setFormData] = useState<DeliveryBoyFormData & { confirmPassword?: string }>({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    vehicleType: 'bike',
    address: '',
    profileImage: '',
    isActive: true,
  });

  // Load delivery boys on mount
  useEffect(() => {
    const unsubscribe = subscribeToDeliveryBoys(
      (fetchedDeliveryBoys) => {
        setDeliveryBoys(fetchedDeliveryBoys);
        setLoading(false);
        loadStats();
      },
      (error) => {
        console.error('Error fetching delivery boys:', error);
        toast.error('Failed to load delivery boys');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const openProfile = async (boy: DeliveryBoy) => {
    setProfileDeliveryBoy(boy);
    setProfileLoading(true);
    try {
      const [ordersSnap, ratingsSnap] = await Promise.all([
        getDocs(query(collection(db, 'orders'), where('deliveryBoyId', '==', boy.id), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'deliveryRatings'), where('deliveryBoyId', '==', boy.id), orderBy('createdAt', 'desc'))),
      ]);
      setProfileOrders(ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProfileRatings(ratingsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      setProfileOrders([]);
      setProfileRatings([]);
    } finally {
      setProfileLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const deliveryStats = await getDeliveryBoyStats();
      setStats(deliveryStats);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  // Filter delivery boys
  const filteredDeliveryBoys = deliveryBoys.filter((boy) => {
    const matchesSearch =
      boy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      boy.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      boy.phone.includes(searchQuery);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && boy.isActive) ||
      (statusFilter === 'inactive' && !boy.isActive);

    return matchesSearch && matchesStatus;
  });

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name || !formData.email || !formData.phone) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!showEditModal) {
      // Creating new delivery boy
      if (!formData.password || !formData.confirmPassword) {
        toast.error('Password is required');
        return;
      }

      if (formData.password.length < 6) {
        toast.error('Password must be at least 6 characters');
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    // Phone validation
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(formData.phone.replace(/\D/g, ''))) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }

    setSubmitting(true);

    try {
      if (showEditModal && selectedDeliveryBoy) {
        // Update existing delivery boy
        await updateDeliveryBoy(selectedDeliveryBoy.id, {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          vehicleType: formData.vehicleType,
          address: formData.address,
          profileImage: formData.profileImage,
          isActive: formData.isActive,
        });
        toast.success('Delivery boy updated successfully');
        setShowEditModal(false);
      } else {
        // Create new delivery boy
        await createDeliveryBoy({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
          vehicleType: formData.vehicleType,
          address: formData.address,
          profileImage: formData.profileImage,
          isActive: formData.isActive,
        });
        toast.success('Delivery boy created successfully');
        setShowAddModal(false);
      }

      // Reset form
      resetForm();
    } catch (error: any) {
      console.error('Error saving delivery boy:', error);
      toast.error(error.message || 'Failed to save delivery boy');
    } finally {
      setSubmitting(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      vehicleType: 'bike',
      address: '',
      profileImage: '',
      isActive: true,
    });
    setSelectedDeliveryBoy(null);
  };

  // Handle edit
  const handleEdit = (deliveryBoy: DeliveryBoy) => {
    setSelectedDeliveryBoy(deliveryBoy);
    setFormData({
      name: deliveryBoy.name,
      email: deliveryBoy.email,
      phone: deliveryBoy.phone,
      password: '',
      confirmPassword: '',
      vehicleType: deliveryBoy.vehicleType,
      address: deliveryBoy.address,
      profileImage: deliveryBoy.profileImage,
      isActive: deliveryBoy.isActive,
    });
    setShowEditModal(true);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedDeliveryBoy) return;

    setSubmitting(true);
    try {
      await deleteDeliveryBoy(selectedDeliveryBoy.id);
      toast.success('Delivery boy deleted successfully');
      setShowDeleteDialog(false);
      setSelectedDeliveryBoy(null);
    } catch (error: any) {
      console.error('Error deleting delivery boy:', error);
      toast.error(error.message || 'Failed to delete delivery boy');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle toggle status
  const handleToggleStatus = async (deliveryBoy: DeliveryBoy) => {
    try {
      await toggleDeliveryBoyStatus(deliveryBoy.id, !deliveryBoy.isActive);
      toast.success(
        `Delivery boy ${!deliveryBoy.isActive ? 'activated' : 'deactivated'} successfully`
      );
    } catch (error: any) {
      console.error('Error toggling status:', error);
      toast.error(error.message || 'Failed to update status');
    }
  };

  // Get vehicle icon
  const getVehicleIcon = (type: string) => {
    switch (type) {
      case 'bike':
        return '🏍️';
      case 'cycle':
        return '🚲';
      case 'van':
        return '🚐';
      default:
        return '🏍️';
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      {/* Header Section */}
      <div className="bg-card border border-border rounded-panel shadow-sm p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Delivery Boys Management
            </h1>
            <p className="text-foreground/80">Create and manage delivery partners</p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Delivery Boy
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-panel shadow-sm p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground/80 text-sm">Total Delivery Boys</p>
              <p className="text-3xl font-bold text-foreground mt-1">{stats.total}</p>
            </div>
            <div className="bg-muted p-3 rounded-full">
              <Users className="h-6 w-6 text-primary" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-panel shadow-sm p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground/80 text-sm">Active</p>
              <p className="text-3xl font-bold text-status-success-fg mt-1">{stats.active}</p>
            </div>
            <div className="bg-status-success-bg p-3 rounded-full">
              <Power className="h-6 w-6 text-status-success-fg" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card border border-border rounded-panel shadow-sm p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground/80 text-sm">On Duty</p>
              <p className="text-3xl font-bold text-primary mt-1">{stats.onDuty}</p>
            </div>
            <div className="bg-primary/15 p-3 rounded-full">
              <Truck className="h-6 w-6 text-primary" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-panel shadow-sm p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground/80 text-sm">Total Deliveries</p>
              <p className="text-3xl font-bold text-status-returns-fg mt-1">
                {stats.totalDeliveries}
              </p>
            </div>
            <div className="bg-status-returns-bg p-3 rounded-full">
              <Package className="h-6 w-6 text-status-returns-fg" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters Section */}
      <div className="bg-card border border-border rounded-panel shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="w-full md:w-48">
            <Select
              value={statusFilter}
              onValueChange={(value: any) => setStatusFilter(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground/80 hover:bg-muted/60 '}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground/80 hover:bg-muted/60 '}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Delivery Boys View */}
      {loading ? (
        <div className="bg-card border border-border rounded-panel shadow-sm flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredDeliveryBoys.length === 0 ? (
        <div className="bg-card border border-border rounded-panel shadow-sm">
          <div className="flex flex-col items-center justify-center py-12">
            <Users className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {searchQuery || statusFilter !== 'all'
                ? 'No delivery boys found'
                : 'No delivery partners added yet'}
            </h3>
            <p className="text-foreground/80 mb-4">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Start by adding your first delivery partner'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button
                onClick={() => {
                  resetForm();
                  setShowAddModal(true);
                }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add First Delivery Boy
              </Button>
            )}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View — premium card */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6 px-1">
          {filteredDeliveryBoys.map((deliveryBoy) => (
            <motion.div
              key={deliveryBoy.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="group relative bg-card border border-border rounded-panel shadow-sm hover:shadow-xl transition-[transform,background-color,color,border-color,box-shadow,opacity] duration-300 hover:-translate-y-0.5 p-5 flex flex-col"
            >
              {/* Top: avatar + name + status pill */}
              <div className="flex items-start gap-3">
                {deliveryBoy.profileImage ? (
                  <SmartImage
                    src={deliveryBoy.profileImage}
                    alt={deliveryBoy.name}
                    className="h-14 w-14 rounded-full object-cover ring-2 ring-ring/40 shadow-sm" preset="thumb" />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-primary font-semibold text-lg">
                      {deliveryBoy.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground truncate">
                    {deliveryBoy.name}
                  </h3>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                    <span className="text-base mr-0.5">{getVehicleIcon(deliveryBoy.vehicleType)}</span>
                    <span className="capitalize">{deliveryBoy.vehicleType}</span>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                    deliveryBoy.isActive
                      ? 'bg-status-success-bg text-status-success-fg '
                      : 'bg-muted text-foreground/80 '
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      deliveryBoy.isActive ? 'bg-status-success-fg' : 'bg-muted-foreground'
                    }`}
                  />
                  {deliveryBoy.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Stat tiles */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-primary">
                    <Star className="h-3 w-3 fill-current" />
                    <span className="text-xs font-semibold text-foreground">
                      {deliveryBoy.rating.toFixed(1)}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Rating</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <div className="text-xs font-semibold text-foreground">
                    {deliveryBoy.totalDeliveries}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Done</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <div className="text-xs font-semibold text-foreground">
                    {deliveryBoy.currentOrdersCount}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Active</div>
                </div>
              </div>

              {/* Contact rows */}
              <div className="space-y-1.5 text-xs text-foreground/80 mt-4">
                <div className="flex items-center gap-2">
                  <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{deliveryBoy.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{deliveryBoy.email}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 mt-4 border-t border-border space-y-2">
                <button
                  onClick={() => navigate(`/admin/delivery-boys/${deliveryBoy.id}`)}
                  className="w-full py-2 text-xs font-medium text-primary-foreground bg-primary rounded-control hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  View Full Profile
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(deliveryBoy)}
                    className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-muted text-primary hover:bg-muted transition-colors flex items-center justify-center gap-1"
                  >
                    <Edit className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleToggleStatus(deliveryBoy)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      deliveryBoy.isActive
                        ? 'bg-primary/10 text-primary hover:bg-primary/15 '
                        : 'bg-status-success-bg text-status-success-fg hover:bg-status-success-bg '
                    }`}
                    title={deliveryBoy.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {deliveryBoy.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => { setSelectedDeliveryBoy(deliveryBoy); setShowDeleteDialog(true); }}
                    className="p-1.5 rounded-lg bg-status-danger-bg text-status-danger-fg hover:bg-status-danger-bg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="bg-card border border-border rounded-panel shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground/80 uppercase tracking-wider">Delivery Boy</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground/80 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground/80 uppercase tracking-wider">Vehicle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground/80 uppercase tracking-wider">Current Orders</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground/80 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground/80 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {filteredDeliveryBoys.map((deliveryBoy) => (
                  <motion.tr key={deliveryBoy.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-muted/60 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          {deliveryBoy.profileImage ? (
                            <SmartImage src={deliveryBoy.profileImage} alt={deliveryBoy.name} className="h-10 w-10 rounded-full object-cover" preset="thumb" />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                              <span className="text-primary font-semibold text-sm">{deliveryBoy.name.charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-foreground">{deliveryBoy.name}</div>
                          <div className="text-sm text-muted-foreground flex items-center mt-1">
                            <Star className="h-3 w-3 text-primary mr-1 fill-current" />
                            {deliveryBoy.rating.toFixed(1)} ({deliveryBoy.totalDeliveries} deliveries)
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-foreground flex items-center mb-1"><Mail className="h-3 w-3 mr-2 text-muted-foreground" />{deliveryBoy.email}</div>
                      <div className="text-sm text-muted-foreground flex items-center"><Phone className="h-3 w-3 mr-2 text-muted-foreground" />{deliveryBoy.phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="text-2xl mr-2">{getVehicleIcon(deliveryBoy.vehicleType)}</span>
                        <span className="text-sm text-foreground capitalize">{deliveryBoy.vehicleType}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center"><Package className="h-4 w-4 text-muted-foreground mr-2" /><span className="text-sm font-semibold text-foreground">{deliveryBoy.currentOrdersCount}</span></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={deliveryBoy.isActive ? 'default' : 'secondary'} className={deliveryBoy.isActive ? 'bg-status-success-bg text-status-success-fg hover:bg-status-success-bg' : 'bg-muted text-foreground hover:bg-muted'}>
                        {deliveryBoy.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/delivery-boys/${deliveryBoy.id}`)} className="text-primary hover:text-primary hover:bg-muted"><UserCheck className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(deliveryBoy)} className="text-primary hover:text-primary hover:bg-muted"><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(deliveryBoy)} className={deliveryBoy.isActive ? 'text-primary hover:text-primary hover:bg-primary/10 ' : 'text-status-success-fg hover:text-status-success-fg hover:bg-status-success-bg '}>
                          {deliveryBoy.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedDeliveryBoy(deliveryBoy); setShowDeleteDialog(true); }} className="text-status-danger-fg hover:text-status-danger-fg hover:bg-status-danger-bg"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showAddModal || showEditModal} onOpenChange={(open) => {
        if (!open) {
          setShowAddModal(false);
          setShowEditModal(false);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {showEditModal ? 'Edit Delivery Boy' : 'Add New Delivery Boy'}
            </DialogTitle>
            <DialogDescription>
              {showEditModal
                ? 'Update delivery boy information'
                : 'Create a new delivery partner account'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Full Name <span className="text-status-danger-fg">*</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter full name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">
                  Email <span className="text-status-danger-fg">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter email address"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  disabled={showEditModal}
                />
              </div>

              {/* Phone Number */}
              <div className="space-y-2">
                <Label htmlFor="phone">
                  Phone Number <span className="text-status-danger-fg">*</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Enter phone number"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </div>

              {/* Vehicle Type */}
              <div className="space-y-2">
                <Label htmlFor="vehicleType">
                  Vehicle Type <span className="text-status-danger-fg">*</span>
                </Label>
                <Select
                  value={formData.vehicleType}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, vehicleType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select vehicle type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bike">🏍️ Bike</SelectItem>
                    <SelectItem value="cycle">🚲 Cycle</SelectItem>
                    <SelectItem value="van">🚐 Van</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Password - Only for new delivery boy */}
              {!showEditModal && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="password">
                      Password <span className="text-status-danger-fg">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter password"
                        value={formData.password}
                        onChange={(e) =>
                          setFormData({ ...formData, password: e.target.value })
                        }
                        required={!showEditModal}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">
                      Confirm Password <span className="text-status-danger-fg">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm password"
                        value={formData.confirmPassword}
                        onChange={(e) =>
                          setFormData({ ...formData, confirmPassword: e.target.value })
                        }
                        required={!showEditModal}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="address">
                Address <span className="text-status-danger-fg">*</span>
              </Label>
              <Input
                id="address"
                type="text"
                placeholder="Enter full address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                required
              />
            </div>

            {/* Profile Image URL */}
            <div className="space-y-2">
              <Label htmlFor="profileImage">Profile Image URL (Optional)</Label>
              <Input
                id="profileImage"
                type="url"
                placeholder="Enter image URL"
                value={formData.profileImage}
                onChange={(e) =>
                  setFormData({ ...formData, profileImage: e.target.value })
                }
              />
            </div>

            {/* Status Toggle */}
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="isActive">Account Status</Label>
                <p className="text-sm text-muted-foreground">
                  {formData.isActive
                    ? 'Delivery boy can login and receive orders'
                    : 'Account is disabled'}
                </p>
              </div>
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddModal(false);
                  setShowEditModal(false);
                  resetForm();
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : showEditModal ? (
                  'Update Delivery Boy'
                ) : (
                  'Create Delivery Boy'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Profile Drawer */}
      <AnimatePresence>
        {profileDeliveryBoy && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-charcoal z-40"
              onClick={() => setProfileDeliveryBoy(null)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-card shadow-2xl z-50 flex flex-col"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card text-foreground">
                <h2 className="text-lg font-semibold">Delivery Boy Profile</h2>
                <button onClick={() => setProfileDeliveryBoy(null)} className="p-1 rounded-full hover:bg-muted transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Profile Info */}
                <div className="px-6 py-5 flex items-center gap-4 border-b border-border">
                  {profileDeliveryBoy.profileImage ? (
                    <SmartImage src={profileDeliveryBoy.profileImage} alt={profileDeliveryBoy.name} className="h-16 w-16 rounded-full object-cover" preset="thumb" />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-primary text-xl font-bold">{profileDeliveryBoy.name.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{profileDeliveryBoy.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">{profileDeliveryBoy.vehicleType}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Star className="h-4 w-4 text-primary fill-current" />
                      <span className="text-sm font-medium text-foreground/80">{profileDeliveryBoy.rating.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground">({profileDeliveryBoy.totalDeliveries} deliveries)</span>
                    </div>
                  </div>
                </div>

                {/* Contact Info */}
                <div className="px-6 py-4 space-y-2 border-b border-border">
                  <div className="flex items-center gap-3 text-sm text-foreground/80"><Mail className="h-4 w-4 text-muted-foreground" />{profileDeliveryBoy.email}</div>
                  <div className="flex items-center gap-3 text-sm text-foreground/80"><Phone className="h-4 w-4 text-muted-foreground" />{profileDeliveryBoy.phone}</div>
                  {profileDeliveryBoy.address && <div className="flex items-center gap-3 text-sm text-foreground/80"><MapPin className="h-4 w-4 text-muted-foreground" />{profileDeliveryBoy.address}</div>}
                </div>

                {/* Stats Row */}
                <div className="px-6 py-4 grid grid-cols-3 gap-3 border-b border-border">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-xl font-bold text-primary">{profileDeliveryBoy.totalDeliveries}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Deliveries</p>
                  </div>
                  <div className="text-center p-3 bg-primary/10 rounded-lg">
                    <p className="text-xl font-bold text-primary">{profileDeliveryBoy.rating.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Avg Rating</p>
                  </div>
                  <div className="text-center p-3 bg-status-success-bg rounded-lg">
                    <p className="text-xl font-bold text-status-success-fg">{profileDeliveryBoy.currentOrdersCount}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Active</p>
                  </div>
                </div>

                {profileLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    {/* Recent Deliveries */}
                    <div className="px-6 py-4 border-b border-border">
                      <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        Recent Deliveries ({profileOrders.length})
                      </h4>
                      {profileOrders.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No deliveries yet</p>
                      ) : (
                        <div className="space-y-2">
                          {profileOrders.slice(0, 10).map((ord) => (
                            <div key={ord.id} className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
                              <div>
                                <p className="text-xs font-medium text-foreground">ORD-{ord.orderId || ord.id.slice(0, 6).toUpperCase()}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Clock className="h-3 w-3" />
                                  {ord.createdAt?.seconds
                                    ? new Date(ord.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                                    : 'None'}
                                </p>
                              </div>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                ord.status === 'delivered' ? 'bg-status-success-bg text-status-success-fg' :
                                ord.status === 'outForDelivery' ? 'bg-muted text-primary' :
                                ord.status === 'cancelled' ? 'bg-status-danger-bg text-status-danger-fg' :
                                'bg-muted text-foreground/80'
                              }`}>
                                {ord.status === 'outForDelivery' ? 'Out for Delivery' : ord.status?.charAt(0).toUpperCase() + ord.status?.slice(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Customer Ratings */}
                    <div className="px-6 py-4">
                      <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Star className="h-4 w-4 text-primary" />
                        Customer Ratings ({profileRatings.length})
                      </h4>
                      {profileRatings.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No ratings yet</p>
                      ) : (
                        <div className="space-y-3">
                          {profileRatings.map((r) => (
                            <div key={r.id} className="p-3 border border-border rounded-lg">
                              <div className="flex items-center gap-1 mb-1">
                                {[1,2,3,4,5].map(n => (
                                  <Star key={n} className={`h-3.5 w-3.5 ${n <= r.rating ? 'text-primary fill-current' : 'text-muted-foreground'}`} />
                                ))}
                                <span className="text-xs text-muted-foreground ml-1">
                                  {r.createdAt?.seconds
                                    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                                    : ''}
                                </span>
                              </div>
                              {r.comment && <p className="text-xs text-foreground/80">{r.comment}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the delivery boy account for{' '}
              <strong>{selectedDeliveryBoy?.name}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={submitting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminDeliveryBoys;
