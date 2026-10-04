import React, { useState, useEffect, useRef } from 'react';
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
  Eye,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Clock,
  Video,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard } from '@/components/admin/StatCard';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListSkeleton, StatCardsSkeleton } from '@/components/skeletons';
import { formatDateTime, plural } from '@/lib/format';
import { toast } from 'sonner';
import { SmartImage } from "@/components/ui/smart-image";

const AdminReviews = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const confirmReturnRef = useRef<HTMLElement | null>(null);
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
      toast.success('Review approved');
    } catch (error) {
      console.error('Error approving review:', error);
      toast.error('Could not approve the review');
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
      toast.error('Could not reject the review');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (reviewId: string) => {
    try {
      setActionLoading(reviewId);
      await deleteReview(reviewId);
      toast.success('Review deleted');
      setShowDeleteConfirm(null);
      if (selectedReview?.id === reviewId) {
        setSelectedReview(null);
      }
    } catch (error) {
      console.error('Error deleting review:', error);
      toast.error('Could not delete the review');
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
        return <StatusBadge tone="warning" icon={Clock} label="Pending" />;
      case 'approved':
        return <StatusBadge tone="success" icon={CheckCircle} label="Approved" />;
      case 'rejected':
        return <StatusBadge tone="danger" icon={XCircle} label="Rejected" />;
      default:
        return null;
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return formatDateTime(date);
  };

  const stats = {
    total: reviews.length,
    pending: reviews.filter(r => r.status === 'pending').length,
    approved: reviews.filter(r => r.status === 'approved').length,
    rejected: reviews.filter(r => r.status === 'rejected').length,
  };

  const stars = (rating: number, size = 'h-3.5 w-3.5') => (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[...Array(5)].map((_, i) => (
        <Star key={i} aria-hidden="true" className={`${size} ${i < rating ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
      ))}
    </span>
  );

  /** View / approve / reject / delete, shared by the card, the row and the phone card. */
  const actions = (review: Review) => (
    <div className="flex items-center gap-0.5">
      <IconButton label={`View review by ${review.userName}`} tooltip="View" size="sm" onClick={() => setSelectedReview(review)}>
        <Eye />
      </IconButton>
      {review.status !== 'approved' && (
        <IconButton
          label={`Approve review by ${review.userName}`}
          tooltip="Approve"
          size="sm"
          onClick={() => handleApprove(review.id)}
          disabled={actionLoading === review.id}
          className="hover:text-status-success-fg"
        >
          {actionLoading === review.id ? <Spinner /> : <CheckCircle />}
        </IconButton>
      )}
      {review.status !== 'rejected' && (
        <IconButton
          label={`Reject review by ${review.userName}`}
          tooltip="Reject"
          size="sm"
          onClick={() => handleReject(review.id)}
          disabled={actionLoading === review.id}
          className="hover:text-status-warning-fg"
        >
          <XCircle />
        </IconButton>
      )}
      <IconButton
        label={`Delete review by ${review.userName}`}
        tooltip="Delete"
        size="sm"
        onClick={(e) => { confirmReturnRef.current = e.currentTarget; setShowDeleteConfirm(review.id); }}
        disabled={actionLoading === review.id}
        className="hover:text-status-danger-fg"
      >
        <Trash2 />
      </IconButton>
    </div>
  );

  const header = (
    <AdminPageHeader title="Customer reviews" description="Approve, reject or remove what customers write about your products." />
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        {header}
        <StatCardsSkeleton count={4} className="mb-6" label="" />
        <ListSkeleton rows={4} label="Loading reviews" />
      </div>
    );
  }

  const deleting = reviews.find((r) => r.id === showDeleteConfirm);

  return (
    <div className="mx-auto max-w-6xl">
      {header}

      {/* Stats */}
      <ul className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <li><StatCard label="Total reviews" value={stats.total} icon={MessageSquare} /></li>
        <li><StatCard label="Pending" value={stats.pending} tone="warning" icon={Clock} /></li>
        <li><StatCard label="Approved" value={stats.approved} tone="success" icon={CheckCircle} /></li>
        <li><StatCard label="Rejected" value={stats.rejected} tone="danger" icon={XCircle} /></li>
      </ul>

      {/* Search and filter */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search reviews"
            placeholder="Search by customer, product or review text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={statusFilter}
            onValueChange={(v) => v && setStatusFilter(v as typeof statusFilter)}
            aria-label="Filter by status"
            className="max-w-full overflow-x-auto"
          >
            {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
              <ToggleGroupItem key={status} value={status} size="sm" className="shrink-0 capitalize">
                {status}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as 'grid' | 'table')}
            aria-label="Review view"
            className="shrink-0"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view" size="sm" className="w-9 px-0">
              <LayoutGrid aria-hidden="true" className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="List view" size="sm" className="w-9 px-0">
              <List aria-hidden="true" className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Reviews */}
      {filteredReviews.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-card px-4 py-12">
          <EmptyState
            icon={Star}
            title="No reviews found"
            description={searchQuery || statusFilter !== 'all'
              ? 'Try a different search or filter.'
              : 'Reviews appear here when customers submit them.'}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-card">
          {viewMode === 'grid' ? (
            <ul className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredReviews.map((review) => (
                <li key={review.id} className="rounded-card border border-border p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{review.userName}</p>
                      <p className="truncate text-xs text-muted-foreground">{review.userEmail}</p>
                    </div>
                    {getStatusBadge(review.status)}
                  </div>
                  <p className="mb-1 truncate text-sm font-medium text-foreground/80">{review.productName}</p>
                  <div className="mb-2">{stars(review.rating)}</div>
                  <p className="mb-3 line-clamp-2 text-sm text-foreground/80">{review.reviewText}</p>
                  {review.images?.length > 0 && (
                    <div className="mb-3 flex gap-2">
                      {review.images.slice(0, 3).map((img, i) => (
                        <SmartImage key={i} src={img} alt="" className="h-14 w-14 rounded-control object-cover" preset="tile" />
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</p>
                    {actions(review)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
          <>
          {/* Table: desktop */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  {['Customer', 'Product', 'Rating', 'Review', 'Media', 'Status', 'Date'].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground lg:px-6">{h}</th>
                  ))}
                  <th scope="col" className="px-4 py-3 lg:px-6"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredReviews.map((review) => (
                  <tr key={review.id} className="transition-colors duration-hover hover:bg-muted/60">
                    <td className="px-4 py-3 lg:px-6">
                      <p className="text-sm font-medium text-foreground">{review.userName}</p>
                      <p className="text-xs text-muted-foreground">{review.userEmail}</p>
                      {review.isVerifiedPurchase && (
                        <span className="mt-1 flex items-center gap-1 text-xs text-status-success-fg">
                          <CheckCircle aria-hidden="true" className="h-3 w-3" /> Verified purchase
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 lg:px-6">
                      <p className="max-w-[150px] truncate text-sm font-medium text-foreground" title={review.productName}>{review.productName}</p>
                    </td>
                    <td className="px-4 py-3 lg:px-6">{stars(review.rating)}</td>
                    <td className="px-4 py-3 lg:px-6">
                      <p className="max-w-[200px] truncate text-sm text-foreground/80" title={review.reviewText}>{review.reviewText}</p>
                    </td>
                    <td className="px-4 py-3 lg:px-6">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {review.images?.length > 0 && (
                          <span className="flex items-center gap-1" aria-label={plural(review.images.length, 'photo')}>
                            <ImageIcon aria-hidden="true" className="h-3.5 w-3.5" /> {review.images.length}
                          </span>
                        )}
                        {review.videoUrl && (
                          <span className="flex items-center gap-1" aria-label="Has a video">
                            <Video aria-hidden="true" className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 lg:px-6">{getStatusBadge(review.status)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground lg:px-6">{formatDate(review.createdAt)}</td>
                    <td className="px-2 py-2 lg:px-4">{actions(review)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards: phones */}
          <ul className="divide-y divide-border md:hidden">
            {filteredReviews.map((review) => (
              <li key={review.id} className="p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{review.userName}</p>
                    <p className="truncate text-xs text-muted-foreground">{review.userEmail}</p>
                  </div>
                  {getStatusBadge(review.status)}
                </div>
                <p className="mb-1 text-sm font-medium text-foreground/80">{review.productName}</p>
                <div className="mb-2">{stars(review.rating)}</div>
                <p className="mb-3 line-clamp-2 text-sm text-foreground/80">{review.reviewText}</p>
                {review.images?.length > 0 && (
                  <div className="mb-3 flex gap-2">
                    {review.images.slice(0, 3).map((img, i) => (
                      <SmartImage key={i} src={img} alt="" className="h-16 w-16 rounded-control object-cover" preset="tile" />
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</p>
                  {actions(review)}
                </div>
              </li>
            ))}
          </ul>
          </>
          )}
        </div>
      )}

      {/* Review detail */}
      <Dialog open={!!selectedReview} onOpenChange={(open) => !open && setSelectedReview(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {selectedReview && (
            <>
              <DialogHeader>
                <DialogTitle>Review details</DialogTitle>
                <DialogDescription>{selectedReview.productName}</DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                {/* Customer */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-foreground">{selectedReview.userName}</p>
                    <p className="truncate text-sm text-muted-foreground">{selectedReview.userEmail}</p>
                    {selectedReview.isVerifiedPurchase && (
                      <span className="mt-1 flex items-center gap-1 text-sm text-status-success-fg">
                        <CheckCircle aria-hidden="true" className="h-3.5 w-3.5" /> Verified purchase
                      </span>
                    )}
                  </div>
                  {getStatusBadge(selectedReview.status)}
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Rating</p>
                  <div className="flex items-center gap-2">
                    {stars(selectedReview.rating, 'h-5 w-5')}
                    <span className="text-base font-semibold tabular-nums text-foreground">{selectedReview.rating}/5</span>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Review</p>
                  <p className="whitespace-pre-wrap text-foreground/80">{selectedReview.reviewText}</p>
                </div>

                {selectedReview.images?.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Photos ({selectedReview.images.length})</p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {selectedReview.images.map((img, i) => (
                        <SmartImage
                          key={i}
                          src={img}
                          alt={`Review photo ${i + 1}`}
                          className="aspect-square w-full rounded-control border border-border object-cover" preset="tile" />
                      ))}
                    </div>
                  </div>
                )}

                {selectedReview.videoUrl && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Video</p>
                    <video
                      src={selectedReview.videoUrl}
                      controls
                      className="max-h-64 w-full rounded-control border border-border"
                    />
                  </div>
                )}

                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Submitted</p>
                  <p className="text-sm text-foreground">{formatDate(selectedReview.createdAt)}</p>
                </div>
              </div>

              <DialogFooter className="gap-2 border-t border-border pt-4 sm:justify-between">
                <Button variant="destructive" onClick={(e) => { confirmReturnRef.current = e.currentTarget; setShowDeleteConfirm(selectedReview.id); }}>
                  <Trash2 aria-hidden="true" /> Delete
                </Button>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  {selectedReview.status !== 'rejected' && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleReject(selectedReview.id);
                        setSelectedReview(null);
                      }}
                    >
                      <XCircle aria-hidden="true" /> Reject
                    </Button>
                  )}
                  {selectedReview.status !== 'approved' && (
                    <Button
                      onClick={() => {
                        handleApprove(selectedReview.id);
                        setSelectedReview(null);
                      }}
                    >
                      <CheckCircle aria-hidden="true" /> Approve
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        returnFocusRef={confirmReturnRef}
        open={!!showDeleteConfirm}
        onOpenChange={(open) => !open && setShowDeleteConfirm(null)}
        title={`Delete the review by ${deleting?.userName ?? 'this customer'}?`}
        description="It is removed from the product page for good. This cannot be undone."
        confirmLabel="Delete review"
        tone="danger"
        onConfirm={() => (showDeleteConfirm ? handleDelete(showDeleteConfirm) : undefined)}
      />
    </div>
  );
};

export default AdminReviews;
