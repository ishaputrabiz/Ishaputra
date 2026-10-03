import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, Calendar, Clock, Phone, ExternalLink, X,
  CheckCircle, ArrowLeft, PhoneCall, AlertCircle, Ban,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { ListSkeleton } from '@/components/skeletons';
import EmptyStateBlock from '@/components/EmptyState';
import Header from '@/components/Header';
import MobileBottomNav from '@/components/MobileBottomNav';
import Footer from '@/components/Footer';
import { useAuth } from '@/contexts/AuthContext';
import {
  listenMyRequests,
  cancelVideoCallRequest,
  type VideoCallRequest,
  type VideoCallStatus,
} from '@/services/videoCallRequestService';
import type { Timestamp } from 'firebase/firestore';
import { SmartImage } from "@/components/ui/smart-image";
import { formatDateTime } from '@/lib/format';
import { DUR, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';

// ─── Status config (shared status tones) ─────────────────────────────────────
const STATUS_CONFIG: Record<VideoCallStatus, { label: string; tone: StatusTone; icon: LucideIcon }> = {
  pending: { label: 'Waiting for confirmation', tone: 'warning', icon: Clock },
  confirmed: { label: 'Confirmed', tone: 'info', icon: CheckCircle },
  live: { label: 'Live now', tone: 'success', icon: PhoneCall },
  completed: { label: 'Completed', tone: 'neutral', icon: CheckCircle },
  cancelled: { label: 'Cancelled', tone: 'danger', icon: Ban },
  no_show: { label: 'Missed', tone: 'warning', icon: AlertCircle },
};

const formatTs = (ts: Timestamp | null | undefined): string => formatDateTime(ts);

// ─── Component ────────────────────────────────────────────────────────────────
const MyVideoCalls = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<VideoCallRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    const unsub = listenMyRequests(user.uid, (data) => {
      setRequests(data);
      setLoading(false);
    });
    return unsub;
  }, [user, navigate]);

  const handleCancel = async (id: string) => {
    setCancelling(id);
    try {
      await cancelVideoCallRequest(id);
      toast.success('Request cancelled.');
    } catch {
      toast.error('Unable to cancel the request. Try again.');
    } finally {
      setCancelling(null);
    }
  };

  const activeRequests = requests.filter(r => ['pending', 'confirmed', 'live'].includes(r.status));
  const pastRequests = requests.filter(r => ['completed', 'cancelled', 'no_show'].includes(r.status));

  return (
    <div className="min-h-dvh tx-paper">
      <Header />

      <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-4 py-6 pb-28 outline-none md:pb-10">

        {/* ── Header ── */}
        <div className="mb-8 flex items-center gap-2">
          <IconButton label="Back" onClick={() => navigate(-1)} className="-ml-2">
            <ArrowLeft />
          </IconButton>
          <div aria-hidden="true" className="tx-slate grid size-10 shrink-0 place-items-center rounded-card">
            <Video className="size-5 text-highlight-soft" />
          </div>
          <div className="min-w-0 flex-1 pl-1">
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">My video calls</h1>
            <p className="text-xs text-muted-foreground">Your video consultations</p>
          </div>
        </div>

        {loading ? (
          <ListSkeleton rows={2} thumb label="Loading your calls" />
        ) : requests.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.modal, ease: EASE_OUT }}
            className="panel tx-sheet"
          >
            <EmptyStateBlock
              icon={Video}
              title="No video calls yet"
              description="Book a video consultation from any product page."
              action={{ label: 'Browse products', onClick: () => navigate('/') }}
            />
          </motion.div>
        ) : (
          <div className="space-y-8">
            {/* Active */}
            {activeRequests.length > 0 && (
              <section aria-labelledby="calls-active-heading">
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 id="calls-active-heading" className="font-heading text-[15px] font-semibold tracking-tight text-foreground">Active</h2>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{activeRequests.length} request{activeRequests.length !== 1 ? 's' : ''}</span>
                </div>
                <ul className="space-y-3">
                  <AnimatePresence initial={false}>
                    {activeRequests.map((req) => (
                      <RequestCard
                        key={req.id}
                        req={req}
                        cancelling={cancelling}
                        onCancel={handleCancel}
                        onJoin={(callId) => navigate(`/call/${callId}`)}
                        onJoinMeet={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            )}

            {/* Past */}
            {pastRequests.length > 0 && (
              <section aria-labelledby="calls-history-heading">
                <div className="mb-3 flex items-center gap-2">
                  <h2 id="calls-history-heading" className="font-heading text-[15px] font-semibold tracking-tight text-foreground">History</h2>
                </div>
                <ul className="space-y-3">
                  {pastRequests.map((req) => (
                    <RequestCard
                      key={req.id}
                      req={req}
                      cancelling={cancelling}
                      onCancel={handleCancel}
                      onJoin={(callId) => navigate(`/call/${callId}`)}
                      onJoinMeet={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </main>

      <Footer />
      <MobileBottomNav />
    </div>
  );
};

// ─── Request Card ─────────────────────────────────────────────────────────────
function RequestCard({
  req,
  cancelling,
  onCancel,
  onJoin,
  onJoinMeet,
}: {
  req: VideoCallRequest;
  cancelling: string | null;
  onCancel: (id: string) => void;
  onJoin: (callId: string) => void;
  onJoinMeet: (url: string) => void;
}) {
  const cfg = STATUS_CONFIG[req.status];
  const canCancel = req.status === 'pending' || req.status === 'confirmed';
  const isLive = req.status === 'live';

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: DUR.exit } }}
      transition={{ duration: DUR.modal, ease: EASE_OUT }}
      className={cn(
        'panel tx-sheet relative overflow-hidden',
        isLive && 'border-status-success-line',
      )}
    >
      <div className="p-4 sm:p-5">
        {/* Status row */}
        <div className="mb-3 flex items-center justify-between gap-2">
          {isLive ? (
            <StatusBadge tone="success" label={cfg.label} dot pulse />
          ) : (
            <StatusBadge tone={cfg.tone} label={cfg.label} icon={cfg.icon} />
          )}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {req.mode === 'scheduled'
              ? <><Calendar aria-hidden="true" className="size-3.5" /> Scheduled</>
              : <><Phone aria-hidden="true" className="size-3.5" /> On demand</>
            }
          </div>
        </div>

        {/* Product */}
        {req.productTitle && (
          <div className="mb-3 flex items-center gap-3">
            {req.productImage && (
              <div className="tile-img size-10 shrink-0 overflow-hidden">
                <SmartImage
                  src={req.productImage}
                  alt=""
                  className="h-full w-full object-cover" preset="thumb" />
              </div>
            )}
            <p className="truncate text-sm font-medium leading-tight text-foreground" title={req.productTitle}>{req.productTitle}</p>
          </div>
        )}

        {/* Time */}
        <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock aria-hidden="true" className="size-3.5 shrink-0" />
          {req.mode === 'scheduled' && req.scheduledAt
            ? <span>Scheduled for <strong className="font-semibold text-foreground tabular-nums">{formatTs(req.scheduledAt)}</strong></span>
            : <span className="tabular-nums">Requested {formatTs(req.createdAt)}</span>
          }
        </div>

        {/* Meeting info */}
        {req.meetingType === 'meet' && req.meetingUrl && req.status === 'confirmed' && (
          <p className="mb-3 flex items-center gap-2 rounded-card bg-foreground/[0.04] px-3 py-2 text-xs text-foreground">
            <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            Your Google Meet link is ready. Join below.
          </p>
        )}
        {req.meetingType === 'inapp' && req.callId && (req.status === 'confirmed' || req.status === 'live') && (
          <p className="mb-3 flex items-center gap-2 rounded-card bg-foreground/[0.04] px-3 py-2 text-xs text-foreground">
            <Video aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            Your in-app video call is ready. Join below.
          </p>
        )}

        {/* Actions */}
        <div className="mt-2 flex flex-wrap gap-2">
          {/* Join Google Meet */}
          {req.status === 'confirmed' && req.meetingType === 'meet' && req.meetingUrl && (
            <button type="button" className="btn-copper h-10 px-4" onClick={() => onJoinMeet(req.meetingUrl!)}>
              <ExternalLink aria-hidden="true" className="size-3.5" />
              Join Google Meet
            </button>
          )}

          {/* Join in-app call */}
          {(req.status === 'confirmed' || req.status === 'live') &&
            req.meetingType === 'inapp' && req.callId && (
              <button type="button" className="btn-copper h-10 px-4" onClick={() => onJoin(req.callId!)}>
                <Video aria-hidden="true" className="size-3.5" />
                {isLive ? 'Rejoin call' : 'Join call'}
              </button>
            )}

          {/* Cancel (pending or confirmed) */}
          {canCancel && (
            <Button
              size="sm"
              variant="destructive"
              className="h-10"
              disabled={cancelling === req.id}
              onClick={() => onCancel(req.id)}
            >
              {cancelling === req.id ? <Spinner /> : <X aria-hidden="true" />}
              Cancel request
            </Button>
          )}
        </div>
      </div>
    </motion.li>
  );
}

export default MyVideoCalls;
