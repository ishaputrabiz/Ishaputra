import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { VideoCall, type CallSession } from '@/services/videoCallService';
import { confirmInApp, markLive } from '@/services/videoCallRequestService';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff,
  Loader2, SwitchCamera,
} from 'lucide-react';

// ─── Brand mark ──────────────────────────────────────────────────────────────
const BrandWatermark = () => (
  <div className="flex items-center gap-2.5">
    <img
      src="/white_logo.png"
      alt="Sreerasthu Silvers"
      className="h-8 w-auto object-contain drop-shadow-lg"
    />
  </div>
);

// ─── Timer ───────────────────────────────────────────────────────────────────
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
    <span className="text-xs text-white/70 tabular-nums">
      {h > 0 ? `${pad(h)}:` : ''}{pad(m)}:{pad(s)}
    </span>
  );
};

// ─── Control button ──────────────────────────────────────────────────────────
function CtrlBtn({
  active,
  danger,
  onClick,
  children,
  label,
  large,
}: {
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
  large?: boolean;
}) {
  let bg = '';
  if (danger) {
    bg = 'bg-red-500 hover:bg-red-600 shadow-xl shadow-red-900/60 border-2 border-red-400/40';
  } else if (active) {
    bg = 'bg-red-500/80 border-2 border-red-400/40 shadow-lg shadow-red-900/40';
  } else {
    bg = 'bg-white/10 hover:bg-white/20 border border-white/25 shadow-md shadow-black/30';
  }

  const btnSize = large ? 'w-16 h-16' : 'w-13 h-13';

  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex flex-col items-center gap-2 focus:outline-none active:scale-90 transition-all duration-150"
    >
      <div className={`${btnSize} rounded-full flex items-center justify-center backdrop-blur-sm transition-all duration-200 ${bg}`}>
        {children}
      </div>
      <span className="text-[11px] font-medium text-white/70 tracking-wide">{label}</span>
    </button>
  );
}

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
          callerName: user.displayName || user.email?.split('@')[0] || 'Sreerasthu Silvers customer',
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
          if (!to) throw new Error('Missing ?to=<uid>');
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
        setError(err instanceof Error ? err.message : 'Failed to start call');
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
      // `exact` facingMode fails on desktop — try without `exact`
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

  // ─── End-call confirmation dialog ──────────────────────────────────────────
  const EndCallDialog = () => (
    <AnimatePresence>
      {showConfirmEnd && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowConfirmEnd(false)}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="mx-6 bg-[#1a1a2e]/95 border border-white/10 rounded-3xl p-6 text-center shadow-2xl w-full max-w-xs"
          >
            <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <PhoneOff className="w-7 h-7 text-red-400" />
            </div>
            <h3 className="text-white font-semibold text-base mb-1">End Call?</h3>
            <p className="text-white/50 text-sm mb-6">This will disconnect both participants.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmEnd(false)}
                className="flex-1 py-2.5 rounded-2xl bg-white/10 text-white/80 text-sm font-medium hover:bg-white/15 transition"
              >
                Cancel
              </button>
              <button
                onClick={hangup}
                className="flex-1 py-2.5 rounded-2xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition shadow-lg shadow-red-900/30"
              >
                End Call
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      className="min-h-screen bg-[#0a0a14] text-white flex flex-col overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* ── Remote video background ── */}
      <div className="absolute inset-0 z-0">
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        {/* Dark vignette overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
      </div>

      {/* ── End-call dialog ── */}
      <EndCallDialog />

      {/* ── Top bar ── */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-4 pb-2">
        <BrandWatermark />
        <div className="text-right">
          <p className="text-xs text-white/50 leading-tight">
            {status === 'ringing' && 'Connecting…'}
            {status === 'connected' && 'In Call'}
            {status === 'ended' && 'Call Ended'}
            {status === 'error' && 'Error'}
            {status === 'init' && 'Initialising…'}
          </p>
          {callId && status !== 'error' && (
            <p className="text-[10px] text-white/30 leading-tight">ID {callId.slice(0, 8)}</p>
          )}
        </div>
      </div>

      {/* ── Status badges ── */}
      <div className="relative z-10 flex justify-center mt-2">
        <AnimatePresence>
          {status === 'connected' && (
            <motion.div
              key="connected"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 rounded-full px-4 py-1.5 backdrop-blur-sm"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs text-emerald-300 font-medium">Connected</span>
              <span className="text-white/30 text-xs">·</span>
              <CallTimer active={status === 'connected'} />
            </motion.div>
          )}
          {status === 'ringing' && (
            <motion.div
              key="ringing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 bg-amber-500/20 border border-amber-400/30 rounded-full px-4 py-1.5 backdrop-blur-sm"
            >
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              <span className="text-xs text-amber-300 font-medium">Connecting…</span>
            </motion.div>
          )}
          {status === 'ended' && (
            <motion.div
              key="ended"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 backdrop-blur-sm"
            >
              <span className="text-xs text-white/70 font-medium">Call ended — returning…</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Ringing / Error overlays ── */}
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
                <span className="absolute inset-0 rounded-full border-2 border-amber-400/30 animate-ping" />
                <span className="absolute inset-3 rounded-full border-2 border-amber-400/40 animate-ping [animation-delay:300ms]" />
                <span className="absolute inset-6 rounded-full border-2 border-amber-400/60 animate-ping [animation-delay:600ms]" />
                <div className="absolute inset-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-xl shadow-amber-900/50">
                  <img src="/white_logo.png" alt="Sreerasthu Silvers" className="w-8 h-8 object-contain" />
                </div>
              </div>
              <p className="text-white/90 font-medium">Connecting to expert…</p>
              <p className="text-white/50 text-sm mt-1">Please wait</p>
            </div>
          </motion.div>
        )}
        {status === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-10 flex items-center justify-center"
          >
            <div className="mx-6 bg-[#1a0a0a]/90 border border-red-500/30 rounded-3xl px-6 py-8 text-center max-w-xs shadow-2xl backdrop-blur-sm">
              <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <PhoneOff className="w-7 h-7 text-red-400" />
              </div>
              <p className="text-white font-semibold mb-2">Connection Failed</p>
              <p className="text-white/50 text-sm mb-6">{error || 'Unable to connect.'}</p>
              <button
                onClick={() => goBack()}
                className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition"
              >
                Go Back
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Local (PiP) video ── */}
      <div className="absolute bottom-32 right-4 z-20">
        <div className="relative">
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            className="w-28 h-40 sm:w-36 sm:h-52 rounded-2xl object-cover border-2 border-white/20 shadow-2xl bg-neutral-900"
            style={{ filter: camOff ? 'brightness(0.3)' : 'none' }}
          />
          {camOff && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40">
              <VideoOff className="w-6 h-6 text-white/60" />
            </div>
          )}
          {/* Amber border accent */}
          <div className="absolute -inset-0.5 rounded-2xl border border-amber-400/20 pointer-events-none" />
        </div>
      </div>

      {/* ── Controls bar ── */}
      <div className="relative z-20 pb-8 pt-3 px-4">
        {/* Glass pill */}
        <div className="bg-black/50 backdrop-blur-2xl border border-white/12 rounded-[32px] px-6 py-5 max-w-sm mx-auto shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between">
            {/* Mute */}
            <CtrlBtn active={muted} onClick={toggleMute} label={muted ? 'Unmute' : 'Mute'}>
              {muted
                ? <MicOff className="w-5 h-5 text-white" />
                : <Mic className="w-5 h-5 text-white/90" />
              }
            </CtrlBtn>

            {/* Flip camera */}
            <CtrlBtn onClick={switchCamera} label="Flip Cam">
              <SwitchCamera className="w-5 h-5 text-white/90" />
            </CtrlBtn>

            {/* Hang up — centre, larger */}
            <CtrlBtn danger onClick={() => setShowConfirmEnd(true)} label="End Call" large>
              <PhoneOff className="w-6 h-6 text-white" />
            </CtrlBtn>

            {/* Camera on/off */}
            <CtrlBtn active={camOff} onClick={toggleCam} label={camOff ? 'Start Cam' : 'Stop Cam'}>
              {camOff
                ? <VideoOff className="w-5 h-5 text-white" />
                : <VideoIcon className="w-5 h-5 text-white/90" />
              }
            </CtrlBtn>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoCallPage;
