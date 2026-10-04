import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { VideoCall, type CallSession } from '@/services/videoCallService';
import { confirmInApp, markLive } from '@/services/videoCallRequestService';
import { EASE_OUT } from '@/lib/motion';
import { usePageMeta } from '@/hooks/usePageMeta';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff,
  Loader2, SwitchCamera,
} from 'lucide-react';

// Brand mark
const BrandWatermark = () => (
  <div className="flex items-center gap-2.5">
    <img
      src="/white_logo.png"
      alt="Ishaputra Botanicals"
      className="h-8 w-auto object-contain drop-shadow-lg"
    />
  </div>
);

// Timer
const CallTimer = ({ active }: { active: boolean }) => {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="text-xs tabular-nums text-charcoal-foreground/75">
      {h > 0 ? `${pad(h)}:` : ''}{pad(m)}:{pad(s)}
    </span>
  );
};

// Control button
function CtrlBtn({
  active,
  danger,
  onClick,
  children,
  label,
  large,
  disabled,
  id,
}: {
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
  large?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  let bg = '';
  if (danger) {
    bg = 'bg-destructive text-destructive-foreground shadow-lg hover:bg-destructive/90';
  } else if (active) {
    bg = 'bg-charcoal-foreground text-charcoal shadow-md';
  } else {
    bg = 'bg-charcoal-foreground/10 text-charcoal-foreground border border-charcoal-foreground/25 hover:bg-charcoal-foreground/20';
  }

  const btnSize = large ? 'w-16 h-16' : 'w-12 h-12';

  // Focus: the global ring, drawn in light bronze on the charcoal screen.
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex min-w-[64px] flex-col items-center gap-2 rounded-card transition-transform duration-press ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={`${btnSize} flex items-center justify-center rounded-full transition-[background-color,color] duration-hover ${bg}`}
      >
        {children}
      </span>
      <span aria-hidden="true" className="text-[11px] font-medium text-charcoal-foreground/75">{label}</span>
    </button>
  );
}

const BRAND_NAME = 'Ishaputra Botanicals';
const INCOMPLETE_LINK = 'This call link is incomplete. Open it again from your WhatsApp message.';
const CONNECT_FAILED = 'We could not connect the call. Check your connection and try again.';

/**
 * /call               -> caller initiates a new call (?to=<uid>)
 * /call/:callId       -> callee answers an existing call
 */
const VideoCallPage = () => {
  const { callId: routeCallId } = useParams<{ callId?: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();

  // Reliably return home even when the page was opened via a direct link/notification
  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  }, [navigate]);
  const { user } = useAuth();

  usePageMeta({ title: 'Video call', noindex: true });

  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  const [session, setSession] = useState<CallSession | null>(null);
  const [status, setStatus] = useState<'init' | 'ringing' | 'connected' | 'ended' | 'error'>('init');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [callId, setCallId] = useState<string | null>(routeCallId || null);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);

  const notifyIncomingCall = useCallback(async (nextCallId: string) => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      await fetch('/api/send-call-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          callId: nextCallId,
          callerName: user.displayName || user.email?.split('@')[0] || 'Ishaputra Botanicals customer',
        }),
      });
    } catch { /* non-critical */ }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const requestId = search.get('requestId') ?? null;

    const handlers = {
      onRemoteStream: (stream: MediaStream) => {
        if (remoteRef.current) {
          remoteRef.current.srcObject = stream;
          remoteRef.current.play().catch(() => {});
        }
        setStatus('connected');
        // Mark the request as live once the remote stream arrives (call is connected)
        if (requestId) markLive(requestId).catch(() => {});
      },
      onConnectionState: (s: RTCPeerConnectionState) => {
        if (s === 'connected') setStatus('connected');
      },
      onEnded: () => {
        setStatus('ended');
        setTimeout(() => goBack(), 1500);
      },
    };

    const init = async () => {
      try {
        let s: CallSession;
        if (routeCallId) {
          setStatus('ringing');
          s = await VideoCall.answerCall({ callId: routeCallId }, handlers);
        } else {
          const to = search.get('to');
          if (!to) throw new Error(INCOMPLETE_LINK);
          const callIdOverride = search.get('callIdOverride') ?? undefined;
          setStatus('ringing');
          s = await VideoCall.startCall({ callerUid: user.uid, calleeUid: to, callIdOverride }, handlers);
        }
        if (cancelled) { await s.cleanup(); return; }
        setSession(s);
        setCallId(s.callId);
        if (localRef.current) {
          localRef.current.srcObject = s.localStream;
          localRef.current.play().catch(() => {});
        }
        if (!routeCallId) {
          void notifyIncomingCall(s.callId);
          // Write callId + meetingType back to the request so the customer sees "Join" button
          if (requestId) {
            confirmInApp(requestId, s.callId, user.uid).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('Video call failed to start', err);
        setError(err instanceof Error && err.message === INCOMPLETE_LINK ? INCOMPLETE_LINK : CONNECT_FAILED);
        setStatus('error');
      }
    };
    init();
    return () => { cancelled = true; };
  }, [goBack, notifyIncomingCall, routeCallId, search, user]);

  const hangup = async () => {
    setShowConfirmEnd(false);
    if (session) await session.cleanup();
    setStatus('ended');
    setTimeout(() => goBack(), 1500);
  };

  const toggleMute = () => {
    if (!session) return;
    session.localStream.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted(!muted);
  };

  const toggleCam = () => {
    if (!session) return;
    session.localStream.getVideoTracks().forEach((t) => (t.enabled = camOff));
    setCamOff(!camOff);
  };

  const switchCamera = async () => {
    if (!session) return;
    const newFacing: 'user' | 'environment' = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: newFacing } },
        audio: false,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      // Replace the video sender's track in the peer connection
      const sender = session.pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newVideoTrack);

      // Stop old video tracks, swap in the new one
      session.localStream.getVideoTracks().forEach((t) => {
        t.stop();
        session.localStream.removeTrack(t);
      });
      session.localStream.addTrack(newVideoTrack);

      // Refresh local preview
      if (localRef.current) {
        localRef.current.srcObject = null;
        localRef.current.srcObject = session.localStream;
        localRef.current.play().catch(() => {});
      }

      setFacingMode(newFacing);
    } catch {
      // `exact` facingMode fails on desktop: try without `exact`
      try {
        const fallback = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFacing },
          audio: false,
        });
        const track = fallback.getVideoTracks()[0];
        if (!track) return;
        const sender = session.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(track);
        session.localStream.getVideoTracks().forEach((t) => { t.stop(); session.localStream.removeTrack(t); });
        session.localStream.addTrack(track);
        if (localRef.current) {
          localRef.current.srcObject = null;
          localRef.current.srcObject = session.localStream;
          localRef.current.play().catch(() => {});
        }
        setFacingMode(newFacing);
      } catch { /* camera switch not supported on this device */ }
    }
  };

  // End-call confirmation dialog: Escape or Cancel keeps the call going and
  // puts focus back on the End call control.
  const closeEndDialog = () => {
    setShowConfirmEnd(false);
    requestAnimationFrame(() => document.getElementById('call-end-button')?.focus());
  };

  const EndCallDialog = () => (
    <AnimatePresence>
      {showConfirmEnd && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.24, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
          className="absolute inset-0 z-overlay flex items-center justify-center bg-charcoal/60 backdrop-blur-[2px]"
          onClick={closeEndDialog}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="end-call-title"
            aria-describedby="end-call-desc"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.24, ease: EASE_OUT } }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18, ease: EASE_OUT } }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeEndDialog();
            }}
            className="mx-6 w-full max-w-xs rounded-panel border border-charcoal-foreground/10 bg-charcoal/95 p-6 text-center text-charcoal-foreground shadow-2xl"
          >
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-destructive/20 text-destructive">
              <PhoneOff aria-hidden="true" className="size-6" />
            </div>
            <h2 id="end-call-title" className="mb-1 font-heading text-base font-semibold">End call?</h2>
            <p id="end-call-desc" className="mb-6 text-sm text-charcoal-foreground/70">This disconnects both of you.</p>
            <div className="flex gap-3">
              <button
                type="button"
                autoFocus
                onClick={closeEndDialog}
                className="h-11 flex-1 rounded-control bg-charcoal-foreground/10 text-sm font-medium text-charcoal-foreground transition-[background-color,transform] duration-hover ease-out hover:bg-charcoal-foreground/15 active:scale-[0.97]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={hangup}
                className="h-11 flex-1 rounded-control bg-destructive text-sm font-semibold text-destructive-foreground transition-[background-color,transform] duration-hover ease-out hover:bg-destructive/90 active:scale-[0.97]"
              >
                End call
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <main
      id="main"
      tabIndex={-1}
      // Always dark: the `dark` class scopes the dark tokens to the call screen in either theme.
      className="dark relative min-h-[100dvh] bg-charcoal text-charcoal-foreground flex flex-col overflow-hidden outline-none"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <h1 className="sr-only">Video call with {BRAND_NAME}</h1>

      {/* Remote video background */}
      <div className="absolute inset-0 z-0">
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          aria-label="Expert's video"
          className="w-full h-full object-cover"
        />
        {/* Dark vignette overlay */}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-charcoal/50 via-transparent to-charcoal/70" />
      </div>

      {/* End-call dialog */}
      <EndCallDialog />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-4 pb-2">
        <BrandWatermark />
        <div className="text-right">
          <p role="status" className="text-xs leading-tight text-charcoal-foreground/70">
            {status === 'ringing' && 'Connecting…'}
            {status === 'connected' && 'In call'}
            {status === 'ended' && 'Call ended'}
            {status === 'error' && 'Not connected'}
            {status === 'init' && 'Starting…'}
          </p>
          {callId && status !== 'error' && (
            <p className="text-[10px] leading-tight tabular-nums text-charcoal-foreground/60">ID {callId.slice(0, 8)}</p>
          )}
        </div>
      </div>

      {/* Status badges */}
      <div className="relative z-10 flex justify-center mt-2">
        <AnimatePresence>
          {status === 'connected' && (
            <motion.div
              key="connected"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 rounded-chip border border-charcoal-foreground/15 bg-charcoal/70 px-3 py-1.5 backdrop-blur-sm"
            >
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-status-success-fg" />
              <span className="text-xs font-medium text-charcoal-foreground">Connected</span>
              <span aria-hidden="true" className="text-xs text-charcoal-foreground/60">·</span>
              <CallTimer active={status === 'connected'} />
            </motion.div>
          )}
          {status === 'ringing' && (
            <motion.div
              key="ringing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 rounded-chip border border-highlight-soft/25 bg-charcoal/70 px-3 py-1.5 backdrop-blur-sm"
            >
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-highlight-soft" />
              <span className="text-xs text-highlight-soft font-medium">Connecting…</span>
            </motion.div>
          )}
          {status === 'ended' && (
            <motion.div
              key="ended"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 rounded-chip border border-charcoal-foreground/20 bg-charcoal/70 px-3 py-1.5 backdrop-blur-sm"
            >
              <span className="text-xs font-medium text-charcoal-foreground/80">Call ended. Returning…</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ringing and error overlays */}
      <AnimatePresence>
        {status === 'ringing' && (
          <motion.div
            key="ringanim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
          >
            <div className="text-center">
              {/* Pulsing rings */}
              <div className="relative w-28 h-28 mx-auto mb-6">
                <span aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-highlight-soft/20 animate-ping" />
                <span aria-hidden="true" className="absolute inset-3 rounded-full border-2 border-highlight-soft/28 animate-ping [animation-delay:300ms]" />
                <span aria-hidden="true" className="absolute inset-6 rounded-full border-2 border-highlight-soft/42 animate-ping [animation-delay:600ms]" />
                <div className="absolute inset-8 flex items-center justify-center rounded-full bg-primary shadow-xl">
                  <img src="/white_logo.png" alt="" className="h-8 w-8 object-contain" />
                </div>
              </div>
              <p className="font-medium text-charcoal-foreground">Connecting to an expert…</p>
              <p className="mt-1 text-sm text-charcoal-foreground/70">This takes a few seconds</p>
            </div>
          </motion.div>
        )}
        {status === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-raised flex items-center justify-center"
          >
            <div role="alert" className="mx-6 max-w-xs rounded-panel border border-charcoal-foreground/10 bg-charcoal/95 px-6 py-8 text-center shadow-2xl">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-card bg-charcoal-foreground/10 text-highlight-soft">
                <PhoneOff aria-hidden="true" className="size-6" />
              </div>
              <h2 className="mb-2 font-heading text-base font-semibold text-charcoal-foreground">Call not connected</h2>
              <p className="mb-6 text-sm leading-relaxed text-charcoal-foreground/75 [text-wrap:pretty]">{error || CONNECT_FAILED}</p>
              <button
                type="button"
                onClick={() => goBack()}
                className="h-11 w-full rounded-control bg-charcoal-foreground/10 text-sm font-medium text-charcoal-foreground transition-[background-color,transform] duration-hover ease-out hover:bg-charcoal-foreground/15 active:scale-[0.97]"
              >
                Go back
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Local (PiP) video: hidden when the call could not start (owner decision) */}
      <div className={`absolute bottom-32 right-4 z-20 ${status === 'error' ? 'hidden' : ''}`}>
        <div className="relative">
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            aria-label="Your video"
            className="h-40 w-28 rounded-card border-2 border-charcoal-foreground/20 bg-charcoal object-cover shadow-2xl sm:h-52 sm:w-36"
            style={{ filter: camOff ? 'brightness(0.3)' : 'none' }}
          />
          {camOff && (
            <div className="absolute inset-0 flex items-center justify-center rounded-card bg-charcoal/40">
              <VideoOff aria-hidden="true" className="size-6 text-charcoal-foreground/70" />
            </div>
          )}
          <div aria-hidden="true" className="pointer-events-none absolute -inset-0.5 rounded-card border border-highlight-soft/14" />
        </div>
      </div>

      {/* Controls dock: hidden when the call could not start (owner decision) */}
      <div className={`relative z-20 px-4 pb-8 pt-3 ${status === 'error' ? 'hidden' : ''}`}>
        <div className="mx-auto max-w-sm rounded-panel border border-charcoal-foreground/12 bg-charcoal/70 px-5 py-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between">
            {/* Mute */}
            <CtrlBtn active={muted} onClick={toggleMute} label={muted ? 'Unmute' : 'Mute'}>
              {muted ? <MicOff aria-hidden="true" className="size-5" /> : <Mic aria-hidden="true" className="size-5" />}
            </CtrlBtn>

            {/* Flip camera */}
            <CtrlBtn onClick={switchCamera} label="Flip camera">
              <SwitchCamera aria-hidden="true" className="size-5" />
            </CtrlBtn>

            {/* Hang up: centre, larger */}
            <CtrlBtn id="call-end-button" danger onClick={() => setShowConfirmEnd(true)} label="End call" large>
              <PhoneOff aria-hidden="true" className="size-6" />
            </CtrlBtn>

            {/* Camera on/off */}
            <CtrlBtn active={camOff} onClick={toggleCam} label={camOff ? 'Start camera' : 'Stop camera'}>
              {camOff ? <VideoOff aria-hidden="true" className="size-5" /> : <VideoIcon aria-hidden="true" className="size-5" />}
            </CtrlBtn>
          </div>
        </div>
      </div>
    </main>
  );
};

export default VideoCallPage;
