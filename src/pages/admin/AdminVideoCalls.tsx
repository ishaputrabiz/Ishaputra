import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Video, Phone, Calendar, Clock, CheckCircle, X, ExternalLink,
  User, Check, MessageCircle, CalendarCheck, CircleX, UserX,
  type LucideIcon,
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
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ListSkeleton } from '@/components/skeletons';
import { EmptyState } from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import { formatDateTime } from '@/lib/format';

const STATUS_LABELS: Record<VideoCallStatus, { label: string; tone: StatusTone; icon: LucideIcon }> = {
  pending: { label: 'Pending', tone: 'warning', icon: Clock },
  confirmed: { label: 'Confirmed', tone: 'info', icon: CalendarCheck },
  live: { label: 'Live', tone: 'success', icon: Video },
  completed: { label: 'Completed', tone: 'neutral', icon: CheckCircle },
  cancelled: { label: 'Cancelled', tone: 'danger', icon: CircleX },
  no_show: { label: 'No show', tone: 'warning', icon: UserX },
};

const formatTs = (ts: Timestamp | null | undefined): string => {
  if (!ts) return 'Not set';
  const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as number);
  return formatDateTime(d) || 'Not set';
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
  // The request waiting for "Cancel this request?" to be confirmed.
  const [cancelTarget, setCancelTarget] = useState<VideoCallRequest | null>(null);
  // The Cancel button that opened the confirmation, so focus goes back to it on close.
  const cancelOpenerRef = useRef<HTMLElement | null>(null);

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
      toast.error('Failed to send the Meet link');
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
    catch { toast.error('Failed to update the request'); }
    finally { setAction(id, false); }
  };

  const handleMarkNoShow = async (id: string) => {
    setAction(id, true);
    try { await markNoShow(id); toast.success('Marked no-show'); }
    catch { toast.error('Failed to update the request'); }
    finally { setAction(id, false); }
  };

  // Runs after the ConfirmDialog (the browser confirm() is gone).
  const handleCancel = async (id: string) => {
    setAction(id, true);
    try { await adminCancelRequest(id); toast.success('Request cancelled'); }
    catch { toast.error('Failed to cancel the request'); }
    finally { setAction(id, false); }
  };

  const renderCard = (req: VideoCallRequest) => {
    const st = STATUS_LABELS[req.status];
    const busy = actioning[req.id];
    const meetInputId = `meet-url-${req.id}`;
    return (
      <motion.li
        key={req.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
        className="panel bg-card p-5 text-card-foreground"
      >
        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {st && <StatusBadge tone={st.tone} label={st.label} icon={st.icon} />}
            <div className="mt-2 flex items-center gap-1.5">
              <User aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <span className="truncate text-sm font-semibold text-foreground">{req.customerName}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Phone aria-hidden="true" className="size-3 text-muted-foreground" />
              <span className="text-xs tabular-nums text-muted-foreground">{req.customerPhone}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-right text-xs tabular-nums text-muted-foreground">
            {req.mode === 'scheduled' ? (
              <>
                <Calendar aria-hidden="true" className="size-3.5" />
                <span className="sr-only">Scheduled for </span>
                {formatTs(req.scheduledAt)}
              </>
            ) : (
              <>
                <Clock aria-hidden="true" className="size-3.5" />
                <span className="sr-only">Requested </span>
                {formatTs(req.createdAt)}
              </>
            )}
          </div>
        </div>

        {req.productTitle && (
          <div className="mb-3 flex items-center gap-3 rounded-control bg-muted p-2.5">
            {req.productImage && (
              <SmartImage
                src={req.productImage}
                alt=""
                className="size-12 shrink-0 rounded-control border border-border object-cover"
                preset="thumb"
              />
            )}
            <div className="min-w-0">
              <p className="mb-0.5 text-xs text-muted-foreground">Product</p>
              <p className="line-clamp-2 text-sm font-medium leading-tight text-foreground">{req.productTitle}</p>
            </div>
          </div>
        )}

        {/* Existing meeting info */}
        {req.meetingType === 'meet' && req.meetingUrl && (
          <a
            href={req.meetingUrl}
            target="_blank"
            rel="noreferrer"
            className="mb-3 inline-flex min-h-9 max-w-full items-center gap-1 break-all text-xs text-primary underline-offset-4 hover:underline"
          >
            <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
            {req.meetingUrl}
          </a>
        )}

        {/* Actions */}
        {(req.status === 'pending' || req.status === 'confirmed') && (
          <div className="mt-2 space-y-3 border-t border-foreground/[0.08] pt-3">
            {/* Send Google Meet link */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor={meetInputId} className="sr-only">Google Meet link for {req.customerName}</label>
              <Input
                id={meetInputId}
                type="url"
                inputMode="url"
                placeholder="https://meet.google.com/xxx-xxxx-xxx"
                value={meetUrls[req.id] || ''}
                onChange={(e) =>
                  setMeetUrls((p) => ({ ...p, [req.id]: e.target.value }))
                }
                className="h-9 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={busy}
                onClick={() => handleSendMeet(req)}
              >
                {busy ? <Spinner /> : <ExternalLink aria-hidden="true" />}
                Send Meet + WhatsApp
              </Button>
            </div>
            {/* Start in-app call */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => handleStartInApp(req)}>
                <Video aria-hidden="true" /> Start in-app call
                <MessageCircle aria-hidden="true" className="opacity-70" />
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => handleMarkCompleted(req.id)}>
                <Check aria-hidden="true" /> Mark completed
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleMarkNoShow(req.id)}>
                No show
              </Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={(e) => {
                  cancelOpenerRef.current = e.currentTarget;
                  setCancelTarget(req);
                }}>
                <X aria-hidden="true" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {req.status === 'live' && (
          <div className="mt-2 flex flex-wrap gap-2 border-t border-foreground/[0.08] pt-3">
            <Button size="sm" disabled={busy} onClick={() => handleMarkCompleted(req.id)}>
              <CheckCircle aria-hidden="true" /> Mark completed
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleMarkNoShow(req.id)}>
              No show
            </Button>
          </div>
        )}
      </motion.li>
    );
  };

  const loading = tab === 'queue' ? loadingQueue : loadingHistory;
  const items = tab === 'queue' ? queue : history;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <AdminPageHeader
        title="Video calls"
        description="Manage customer demo call bookings."
        className="pb-0"
      />

      {/* Tabs */}
      <ToggleGroup
        type="single"
        value={tab}
        onValueChange={(v) => v && setTab(v as ActiveTab)}
        aria-label="Requests"
        className="self-start"
      >
        <ToggleGroupItem value="queue" size="sm" className="px-4">
          {`Queue (${queue.length})`}
        </ToggleGroupItem>
        <ToggleGroupItem value="history" size="sm" className="px-4">
          History
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="w-full max-w-3xl">
        {loading ? (
          <ListSkeleton rows={3} label="Loading requests" />
        ) : items.length === 0 ? (
          <div className="rounded-card border border-dashed border-border bg-card">
            <EmptyState
              icon={Video}
              title="No requests in this section"
              description={tab === 'queue' ? 'New demo call requests appear here.' : 'Finished and cancelled requests appear here.'}
              as="h2"
            />
          </div>
        ) : (
          <ul className="space-y-4">{items.map(renderCard)}</ul>
        )}
      </div>

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        returnFocusRef={cancelOpenerRef}
        title="Cancel this request?"
        description={cancelTarget ? `The demo call request from ${cancelTarget.customerName} is cancelled.` : undefined}
        confirmLabel="Cancel request"
        cancelLabel="Keep request"
        tone="danger"
        onConfirm={() => (cancelTarget ? handleCancel(cancelTarget.id) : undefined)}
      />
    </div>
  );
};

export default AdminVideoCalls;
