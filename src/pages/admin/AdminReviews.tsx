import React, { useState, useEffect } from 'react';
import { 
  subscribeToReviews, 
  updateReviewStatus, 
  deleteReview, 
  Review 
} from '@/services/reviewService';
import { 
  Star, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Search, 
  Filter,
  Eye,
  X,
  Loader2,
  Image as ImageIcon,
  LayoutGrid,
  List,
} from 'lucide-react';
import { toast } from 'sonner';
import { SmartImage } from "@/components/ui/smart-image";

const AdminReviews = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  useEffect(() => {
    const unsubscribe = subscribeToReviews((fetchedReviews) => {
      setReviews(fetchedReviews);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleApprove = async (reviewId: string) => {
    try {
      setActionLoading(reviewId);
      await updateReviewStatus(reviewId, 'approved');
      toast.success('Review approved successfully');
    } catch (error) {
      console.error('Error approving review:', error);
      toast.error('Failed to approve review');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (reviewId: string) => {
    try {
      setActionLoading(reviewId);
      await updateReviewStatus(reviewId, 'rejected');
      toast.success('Review rejected');
    } catch (error) {
      console.error('Error rejecting review:', error);
      toast.error('Failed to reject review');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (reviewId: string) => {
    try {
      setActionLoading(reviewId);
      await deleteReview(reviewId);
      toast.success('Review deleted successfully');
      setShowDeleteConfirm(null);
      if (selectedReview?.id === reviewId) {
        setSelectedReview(null);
      }
    } catch (error) {
      console.error('Error deleting review:', error);
      toast.error('Failed to delete review');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredReviews = reviews.filter(review => {
    const matchesSearch = 
      review.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.reviewText.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || review.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Pending</span>;
      case 'approved':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Approved</span>;
      case 'rejected':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">Rejected</span>;
      default:
        return null;
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const stats = {
    total: reviews.length,
    pending: reviews.filter(r => r.status === 'pending').length,
    approved: reviews.filter(r => r.status === 'approved').length,
    rejected: reviews.filter(r => r.status === 'rejected').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#8B7355]" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-6">Customer Reviews</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">Total Reviews</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
          <p className="text-sm text-yellow-700 mb-1">Pending</p>
          <p className="text-2xl font-bold text-yellow-800">{stats.pending}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-sm text-green-700 mb-1">Approved</p>
          <p className="text-2xl font-bold text-green-800">{stats.approved}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <p className="text-sm text-red-700 mb-1">Rejected</p>
          <p className="text-2xl font-bold text-red-800">{stats.rejected}</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by user, product, or review text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B7355]"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                statusFilter === status
                  ? 'bg-[#8B7355] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status}
            </button>
          ))}
          <div className="flex border border-gray-200 rounded-md overflow-hidden ml-2">
            <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-[#8B7355] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-[#8B7355] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Reviews Table */}
      {filteredReviews.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
          <Star className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-500">No reviews found</h3>
          <p className="text-sm text-gray-400 mt-1">
            {searchQuery || statusFilter !== 'all' 
              ? 'Try adjusting your filters' 
              : 'Reviews will appear here when customers submit them'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Grid View (Cards) */}
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {filteredReviews.map((review) => (
                <div key={review.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-sm">{review.userName}</p>
                      <p className="text-xs text-gray-500">{review.userEmail}</p>
                    </div>
                    {getStatusBadge(review.status)}
                  </div>
                  <p className="text-sm text-gray-600 font-medium mb-1 truncate">{review.productName}</p>
                  <div className="flex items-center gap-1 mb-2">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={14} className={i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} />
                    ))}
                  </div>
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{review.reviewText}</p>
                  {review.images?.length > 0 && (
                    <div className="flex gap-2 mb-3">
                      {review.images.slice(0, 3).map((img, i) => (
                        <SmartImage key={i} src={img} alt="" className="w-14 h-14 object-cover rounded-lg" preset="tile" />
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400">{formatDate(review.createdAt)}</p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setSelectedReview(review)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Eye size={14} /></button>
                      {review.status !== 'approved' && (
                        <button onClick={() => handleApprove(review.id)} disabled={actionLoading === review.id} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg">
                          {actionLoading === review.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        </button>
                      )}
                      {review.status !== 'rejected' && (
                        <button onClick={() => handleReject(review.id)} disabled={actionLoading === review.id} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg"><XCircle size={14} /></button>
                      )}
                      <button onClick={() => setShowDeleteConfirm(review.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <>
          {/* Table View - Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">User</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Product</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Rating</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Review</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Media</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredReviews.map((review) => (
                  <tr key={review.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-sm">{review.userName}</p>
                        <p className="text-xs text-gray-500">{review.userEmail}</p>
                        {review.isVerifiedPurchase && (
                          <span className="text-xs text-green-600 flex items-center gap-1 mt-1">
                            <CheckCircle size={12} /> Verified Purchase
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium max-w-[150px] truncate">{review.productName}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={14}
                            className={i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600 max-w-[200px] truncate">{review.reviewText}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        {review.images?.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <ImageIcon size={14} /> {review.images.length}
                          </span>
                        )}
                        {review.videoUrl && (
                          <span className="text-xs text-gray-500">📹</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(review.status)}</td>
                    <td className="px-6 py-4 text-xs text-gray-500">{formatDate(review.createdAt)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedReview(review)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View"
                        >
                          <Eye size={16} />
                        </button>
                        {review.status !== 'approved' && (
                          <button
                            onClick={() => handleApprove(review.id)}
                            disabled={actionLoading === review.id}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Approve"
                          >
                            {actionLoading === review.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <CheckCircle size={16} />
                            )}
                          </button>
                        )}
                        {review.status !== 'rejected' && (
                          <button
                            onClick={() => handleReject(review.id)}
                            disabled={actionLoading === review.id}
                            className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Reject"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => setShowDeleteConfirm(review.id)}
                          disabled={actionLoading === review.id}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {filteredReviews.map((review) => (
              <div key={review.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-sm">{review.userName}</p>
                    <p className="text-xs text-gray-500">{review.userEmail}</p>
                  </div>
                  {getStatusBadge(review.status)}
                </div>
                
                <p className="text-sm text-gray-600 font-medium mb-1">{review.productName}</p>
                
                <div className="flex items-center gap-1 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className={i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                    />
                  ))}
                </div>
                
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{review.reviewText}</p>
                
                {review.images?.length > 0 && (
                  <div className="flex gap-2 mb-3">
                    {review.images.slice(0, 3).map((img, i) => (
                      <SmartImage key={i} src={img} alt="" className="w-16 h-16 object-cover rounded-lg" preset="tile" />
                    ))}
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">{formatDate(review.createdAt)}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedReview(review)}
                      className="p-2 text-gray-400 hover:text-blue-600 bg-gray-50 rounded-lg"
                    >
                      <Eye size={16} />
                    </button>
                    {review.status !== 'approved' && (
                      <button
                        onClick={() => handleApprove(review.id)}
                        className="p-2 text-gray-400 hover:text-green-600 bg-gray-50 rounded-lg"
                      >
                        <CheckCircle size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => setShowDeleteConfirm(review.id)}
                      className="p-2 text-gray-400 hover:text-red-600 bg-gray-50 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
          )}
        </div>
      )}

      {/* Review Detail Modal */}
      {selectedReview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="font-semibold text-lg">Review Details</h3>
              <button
                onClick={() => setSelectedReview(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              {/* User Info */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h4 className="font-semibold text-lg">{selectedReview.userName}</h4>
                  <p className="text-sm text-gray-500">{selectedReview.userEmail}</p>
                  {selectedReview.isVerifiedPurchase && (
                    <span className="text-sm text-green-600 flex items-center gap-1 mt-1">
                      <CheckCircle size={14} /> Verified Purchase
                    </span>
                  )}
                </div>
                {getStatusBadge(selectedReview.status)}
              </div>
              
              {/* Product */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-500 mb-1">Product</p>
                <p className="font-medium">{selectedReview.productName}</p>
              </div>
              
              {/* Rating */}
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">Rating</p>
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={24}
                      className={i < selectedReview.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                    />
                  ))}
                  <span className="ml-2 text-lg font-semibold">{selectedReview.rating}/5</span>
                </div>
              </div>
              
              {/* Review Text */}
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">Review</p>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedReview.reviewText}</p>
              </div>
              
              {/* Images */}
              {selectedReview.images?.length > 0 && (
                <div className="mb-6">
                  <p className="text-sm text-gray-500 mb-2">Photos ({selectedReview.images.length})</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {selectedReview.images.map((img, i) => (
                      <SmartImage
                        key={i}
                        src={img}
                        alt={`Review photo ${i + 1}`}
                        className="w-full aspect-square object-cover rounded-lg border" preset="tile" />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Video */}
              {selectedReview.videoUrl && (
                <div className="mb-6">
                  <p className="text-sm text-gray-500 mb-2">Video</p>
                  <video
                    src={selectedReview.videoUrl}
                    controls
                    className="w-full max-h-64 rounded-lg border"
                  />
                </div>
              )}
              
              {/* Date */}
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-1">Submitted</p>
                <p className="text-sm">{formatDate(selectedReview.createdAt)}</p>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                {selectedReview.status !== 'approved' && (
                  <button
                    onClick={() => {
                      handleApprove(selectedReview.id);
                      setSelectedReview(null);
                    }}
                    className="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={18} /> Approve
                  </button>
                )}
                {selectedReview.status !== 'rejected' && (
                  <button
                    onClick={() => {
                      handleReject(selectedReview.id);
                      setSelectedReview(null);
                    }}
                    className="flex-1 py-3 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <XCircle size={18} /> Reject
                  </button>
                )}
                <button
                  onClick={() => setShowDeleteConfirm(selectedReview.id)}
                  className="flex-1 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="text-red-600" size={32} />
            </div>
            <h3 className="text-lg font-semibold mb-2">Delete Review?</h3>
            <p className="text-gray-500 text-sm mb-6">
              This action cannot be undone. The review will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                disabled={actionLoading === showDeleteConfirm}
                className="flex-1 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                {actionLoading === showDeleteConfirm ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <Trash2 size={18} /> Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReviews;
