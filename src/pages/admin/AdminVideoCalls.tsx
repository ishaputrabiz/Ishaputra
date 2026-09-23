import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Video, Phone, Calendar, Clock, CheckCircle, X, ExternalLink,
  Loader2, User, Check, MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import {
  listenAdminQueue,
  listenAdminHistory,
  confirmWithMeet,
  confirmInApp,
  adminCancelRequest,
  markCompleted,
  markNoShow,
  type VideoCallRequest,
  type VideoCallStatus,
} from '@/services/videoCallRequestService';
import { sendVideoCallInAppTemplate, sendVideoCallMeetTemplate } from '@/services/whatsappService';
import type { Timestamp } from 'firebase/firestore';
import { SmartImage } from "@/components/ui/smart-image";

const STATUS_LABELS: Record<VideoCallStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  live: { label: 'Live', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  completed: { label: 'Completed', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  no_show: { label: 'No Show', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
};

const formatTs = (ts: Timestamp | null | undefined): string => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as number);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

type ActiveTab = 'queue' | 'history';

const AdminVideoCalls = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ActiveTab>('queue');
  const [queue, setQueue] = useState<VideoCallRequest[]>([]);
  const [history, setHistory] = useState<VideoCallRequest[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Per-card state for Meet URL input
  const [meetUrls, setMeetUrls] = useState<Record<string, string>>({});
  const [actioning, setActioning] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsubQ = listenAdminQueue((data) => { setQueue(data); setLoadingQueue(false); });
    const unsubH = listenAdminHistory((data) => { setHistory(data); setLoadingHistory(false); });
    return () => { unsubQ(); unsubH(); };
  }, []);

  const setAction = (id: string, v: boolean) =>
    setActioning((p) => ({ ...p, [id]: v }));

  const handleSendMeet = async (req: VideoCallRequest) => {
    const url = (meetUrls[req.id] || '').trim();
    if (!url.startsWith('https://meet.google.com/')) {
      toast.error('Enter a valid Google Meet link (https://meet.google.com/...)');
      return;
    }
    if (!user) return;
    setAction(req.id, true);
    try {
      await confirmWithMeet(req.id, url, user.uid);
      toast.success('Meet link sent to customer');
      setMeetUrls((p) => ({ ...p, [req.id]: '' }));
      // Notify customer on WhatsApp
      sendVideoCallMeetTemplate({
        to: req.customerPhone,
        customerName: req.customerName,
        productTitle: req.productTitle,
        meetUrl: url,
      });
    } catch {
      toast.error('Failed');
    } finally {
      setAction(req.id, false);
    }
  };

  const handleStartInApp = async (req: VideoCallRequest) => {
    if (!user) return;
    setAction(req.id, true);
    try {
      // Commit callId = req.id to Firestore immediately so the customer sees the
      // "Join Call" button before the admin's camera/WebRTC setup finishes.
      await confirmInApp(req.id, req.id, user.uid);
      // Notify customer on WhatsApp with deep link
      sendVideoCallInAppTemplate({
        to: req.customerPhone,
        customerName: req.customerName,
        productTitle: req.productTitle,
        requestId: req.id,
      });
      navigate(`/call?to=${req.customerUid}&requestId=${req.id}&callIdOverride=${req.id}`);
    } catch {
      toast.error('Failed to start call');
    } finally {
      setAction(req.id, false);
    }
  };

  const handleMarkCompleted = async (id: string) => {
    setAction(id, true);
    try { await markCompleted(id); toast.success('Marked completed'); }
    catch { toast.error('Failed'); }
    finally { setAction(id, false); }
  };

  const handleMarkNoShow = async (id: string) => {
    setAction(id, true);
    try { await markNoShow(id); toast.success('Marked no-show'); }
    catch { toast.error('Failed'); }
    finally { setAction(id, false); }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this request?')) return;
    setAction(id, true);
    try { await adminCancelRequest(id); toast.success('Cancelled'); }
    catch { toast.error('Failed'); }
    finally { setAction(id, false); }
  };

  const renderCard = (req: VideoCallRequest) => {
    const st = STATUS_LABELS[req.status];
    const busy = actioning[req.id];
    return (
      <motion.div
        key={req.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-900 border border-[#F5EFE6] dark:border-gray-800 rounded-2xl p-5 shadow-sm"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>
              {st.label}
            </span>
            <div className="flex items-center gap-1.5 mt-2">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold">{req.customerName}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Phone className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{req.customerPhone}</span>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {req.mode === 'scheduled' ? (
              <>
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                {formatTs(req.scheduledAt)}
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 inline mr-1" />
                {formatTs(req.createdAt)}
              </>
            )}
          </div>
        </div>

        {req.productTitle && (
          <div className="flex items-center gap-3 mb-3 bg-muted/40 rounded-xl p-2.5">
            {req.productImage && (
              <SmartImage
                src={req.productImage}
                alt={req.productTitle}
                className="w-12 h-12 rounded-lg object-cover shrink-0 border border-border" preset="thumb" />
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Product</p>
              <p className="text-sm font-medium leading-tight line-clamp-2">{req.productTitle}</p>
            </div>
          </div>
        )}

        {/* Existing meeting info */}
        {req.meetingType === 'meet' && req.meetingUrl && (
          <a
            href={req.meetingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 flex items-center gap-1 mb-3"
          >
            <ExternalLink className="w-3 h-3" />
            {req.meetingUrl}
          </a>
        )}

        {/* Actions */}
        {(req.status === 'pending' || req.status === 'confirmed') && (
          <div className="space-y-3 border-t border-border pt-3 mt-2">
            {/* Send Google Meet link */}
            <div className="flex gap-2">
              <Input
                placeholder="https://meet.google.com/xxx-xxxx-xxx"
                value={meetUrls[req.id] || ''}
                onChange={(e) =>
                  setMeetUrls((p) => ({ ...p, [req.id]: e.target.value }))
                }
                className="text-xs h-8"
              />
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3 gap-1 whitespace-nowrap"
                disabled={busy}
                onClick={() => handleSendMeet(req)}
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <><ExternalLink className="w-3 h-3" /> Send Meet + WhatsApp</>}
              </Button>
            </div>
            {/* Start in-app call */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                disabled={busy}
                onClick={() => handleStartInApp(req)}
              >
                <Video className="w-3.5 h-3.5" /> Start In-App Call
                <MessageCircle className="w-3 h-3 opacity-70" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={busy}
                onClick={() => handleMarkCompleted(req.id)}
              >
                <Check className="w-3.5 h-3.5" /> Mark Completed
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-orange-600 border-orange-200 gap-1.5"
                disabled={busy}
                onClick={() => handleMarkNoShow(req.id)}
              >
                No Show
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 gap-1.5"
                disabled={busy}
                onClick={() => handleCancel(req.id)}
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {req.status === 'live' && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3 mt-2">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" disabled={busy}
              onClick={() => handleMarkCompleted(req.id)}>
              <CheckCircle className="w-3.5 h-3.5" /> Mark Completed
            </Button>
            <Button size="sm" variant="outline" className="text-orange-600 border-orange-200" disabled={busy}
              onClick={() => handleMarkNoShow(req.id)}>
              No Show
            </Button>
          </div>
        )}
      </motion.div>
    );
  };

  const loading = tab === 'queue' ? loadingQueue : loadingHistory;
  const items = tab === 'queue' ? queue : history;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
          <Video className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Video Call Requests</h1>
          <p className="text-sm text-muted-foreground">Manage customer demo call bookings</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-full bg-muted p-1 mb-6 max-w-xs">
        {([
          { id: 'queue' as ActiveTab, label: `Queue (${queue.length})` },
          { id: 'history' as ActiveTab, label: 'History' },
        ]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 text-sm font-medium py-2 rounded-full transition-all ${
              tab === id ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Video className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No requests in this section.</p>
        </div>
      ) : (
        <div className="space-y-4">{items.map(renderCard)}</div>
      )}
    </div>
  );
};

export default AdminVideoCalls;
