import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, Calendar, Clock, Phone, ExternalLink, X,
  CheckCircle, Loader2, ChevronLeft, Sparkles,
  PhoneCall, AlertCircle, Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<VideoCallStatus, {
  label: string;
  badge: string;
  dot: string;
  border: string;
  icon: React.ElementType;
  pulse?: boolean;
}> = {
  pending: {
    label: 'Pending Confirmation',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
    dot: 'bg-amber-400',
    border: 'border-amber-200/60 dark:border-amber-800/40',
    icon: Clock,
  },
  confirmed: {
    label: 'Confirmed',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200',
    dot: 'bg-blue-500',
    border: 'border-blue-200/60 dark:border-blue-800/40',
    icon: CheckCircle,
  },
  live: {
    label: 'Live Now',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
    dot: 'bg-emerald-500',
    border: 'border-emerald-300/60 dark:border-emerald-700/40',
    icon: PhoneCall,
    pulse: true,
  },
  completed: {
    label: 'Completed',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400',
    dot: 'bg-gray-400',
    border: 'border-gray-200/40 dark:border-gray-700/30',
    icon: CheckCircle,
  },
  cancelled: {
    label: 'Cancelled',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    dot: 'bg-red-400',
    border: 'border-red-200/40 dark:border-red-800/30',
    icon: Ban,
  },
  no_show: {
    label: 'No Show',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    dot: 'bg-orange-400',
    border: 'border-orange-200/40 dark:border-orange-800/30',
    icon: AlertCircle,
  },
};

const formatTs = (ts: Timestamp | null | undefined): string => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as number);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

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
      toast.success('Request cancelled');
    } catch {
      toast.error('Failed to cancel');
    } finally {
      setCancelling(null);
    }
  };

  const activeRequests = requests.filter(r => ['pending', 'confirmed', 'live'].includes(r.status));
  const pastRequests = requests.filter(r => ['completed', 'cancelled', 'no_show'].includes(r.status));

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6 pb-28 md:pb-10">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm">
                <Video className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">My Video Calls</h1>
            </div>
            <p className="text-xs text-muted-foreground ml-10">Track & manage your demo call appointments</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
            </div>
            <p className="text-sm text-muted-foreground">Loading your calls…</p>
          </div>
        ) : requests.length === 0 ? (
          <EmptyState onBrowse={() => navigate('/')} />
        ) : (
          <div className="space-y-8">
            {/* Active */}
            {activeRequests.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Active</h2>
                  <span className="ml-auto text-xs text-muted-foreground">{activeRequests.length} request{activeRequests.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-3">
                  <AnimatePresence>
                    {activeRequests.map((req) => (
                      <RequestCard
                        key={req.id}
                        req={req}
                        cancelling={cancelling}
                        onCancel={handleCancel}
                        onJoin={(callId) => navigate(`/call/${callId}`)}
                        onJoinMeet={(url) => window.open(url, '_blank')}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}

            {/* Past */}
            {pastRequests.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">History</h2>
                </div>
                <div className="space-y-3">
                  {pastRequests.map((req) => (
                    <RequestCard
                      key={req.id}
                      req={req}
                      cancelling={cancelling}
                      onCancel={handleCancel}
                      onJoin={(callId) => navigate(`/call/${callId}`)}
                      onJoinMeet={(url) => window.open(url, '_blank')}
                    />
                  ))}
                </div>
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
  const StatusIcon = cfg.icon;
  const canCancel = req.status === 'pending' || req.status === 'confirmed';
  const isLive = req.status === 'live';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22 }}
      className={`relative bg-card border rounded-2xl overflow-hidden shadow-sm ${cfg.border}`}
    >
      {/* Live pulse top bar */}
      {isLive && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400 animate-pulse" />
      )}

      <div className="p-4 sm:p-5">
        {/* Status row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {cfg.pulse ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.dot}`} />
              </span>
            ) : (
              <span className={`inline-flex rounded-full h-2 w-2 ${cfg.dot}`} />
            )}
            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${cfg.badge}`}>
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {req.mode === 'scheduled'
              ? <><Calendar className="w-3 h-3" /> Scheduled</>
              : <><Phone className="w-3 h-3" /> On-demand</>
            }
          </div>
        </div>

        {/* Product */}
        {req.productTitle && (
          <div className="flex items-center gap-2 mb-3">
            {req.productImage && (
              <SmartImage
                src={req.productImage}
                alt={req.productTitle}
                className="w-9 h-9 rounded-lg object-cover border border-border flex-shrink-0" preset="thumb" />
            )}
            <p className="text-sm font-medium text-foreground leading-tight truncate">{req.productTitle}</p>
          </div>
        )}

        {/* Time */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Clock className="w-3 h-3 flex-shrink-0" />
          {req.mode === 'scheduled' && req.scheduledAt
            ? <span>Scheduled for <strong className="text-foreground">{formatTs(req.scheduledAt)}</strong></span>
            : <span>Requested {formatTs(req.createdAt)}</span>
          }
        </div>

        {/* Meeting info */}
        {req.meetingType === 'meet' && req.meetingUrl && req.status === 'confirmed' && (
          <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2 mb-3">
            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Google Meet link ready — tap below to join</span>
          </div>
        )}
        {req.meetingType === 'inapp' && req.callId && (req.status === 'confirmed' || req.status === 'live') && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2 mb-3">
            <Video className="w-3.5 h-3.5 flex-shrink-0" />
            <span>In-app video call prepared — tap Join Call</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap mt-2">
          {/* Join Google Meet */}
          {req.status === 'confirmed' && req.meetingType === 'meet' && req.meetingUrl && (
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 rounded-xl shadow-sm"
              onClick={() => onJoinMeet(req.meetingUrl!)}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Join Google Meet
            </Button>
          )}

          {/* Join in-app call */}
          {(req.status === 'confirmed' || req.status === 'live') &&
            req.meetingType === 'inapp' && req.callId && (
              <Button
                size="sm"
                className={`gap-1.5 rounded-xl shadow-sm text-white ${isLive ? 'bg-emerald-500 hover:bg-emerald-600 animate-pulse' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                onClick={() => onJoin(req.callId!)}
              >
                <Video className="w-3.5 h-3.5" />
                {isLive ? 'Rejoin Live Call' : 'Join Call'}
              </Button>
            )}

          {/* Cancel (pending or confirmed) */}
          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20 gap-1 rounded-xl"
              disabled={cancelling === req.id}
              onClick={() => onCancel(req.id)}
            >
              {cancelling === req.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <><X className="w-3.5 h-3.5" />Cancel Request</>
              )}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-24 text-center gap-4"
    >
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/10 flex items-center justify-center shadow-inner">
        <Video className="w-9 h-9 text-amber-500" />
      </div>
      <div>
        <p className="font-semibold text-foreground mb-1">No video call requests yet</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Book a live demo call with our jewellery experts from any product page.
        </p>
      </div>
      <Button
        className="mt-2 bg-amber-600 hover:bg-amber-700 text-white rounded-full px-6 gap-2"
        onClick={onBrowse}
      >
        <Sparkles className="w-4 h-4" />
        Browse Jewellery
      </Button>
    </motion.div>
  );
}

export default MyVideoCalls;
