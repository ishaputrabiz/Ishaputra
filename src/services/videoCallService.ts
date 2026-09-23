/**
 * WebRTC video-call signalling via Firestore.
 *
 * Document layout under collection `videoCalls/{callId}`:
 *   { offer, answer, status, callerUid, calleeUid, createdAt }
 * Subcollections:
 *   `videoCalls/{callId}/callerCandidates/{auto}` — { candidate }
 *   `videoCalls/{callId}/calleeCandidates/{auto}` — { candidate }
 *
 * Only two browsers ever join a call. Caller publishes offer + caller
 * candidates and listens for answer + callee candidates. Callee does the
 * inverse.
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

const buildStaticIceServers = (): RTCIceServer[] => {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
  const turnUrls = (env.VITE_TURN_URLS || env.VITE_TURN_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ...(turnUrls.length
      ? [{ urls: turnUrls, username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL }]
      : []),
  ];
};

async function getIceServers(): Promise<RTCIceServer[]> {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
  const meteredUrl = String(env.VITE_METERED_TURN_API_URL || '').trim();
  const meteredApiKey = String(env.VITE_METERED_TURN_API_KEY || '').trim();

  if (!meteredUrl || !meteredApiKey) {
    return buildStaticIceServers();
  }

  try {
    const separator = meteredUrl.includes('?') ? '&' : '?';
    const response = await fetch(`${meteredUrl}${separator}apiKey=${encodeURIComponent(meteredApiKey)}`);
    if (!response.ok) {
      throw new Error(`TURN credential fetch failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('TURN credential response was empty');
    }

    return data as RTCIceServer[];
  } catch (error) {
    console.warn('[video-call] Metered TURN fetch failed, falling back to static ICE config:', error);
    return buildStaticIceServers();
  }
}

export interface CallSession {
  callId: string;
  pc: RTCPeerConnection;
  localStream: MediaStream;
  cleanup: () => Promise<void>;
}

export type CallEventHandlers = {
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;
  onEnded?: () => void;
};

const newPeer = async () => new RTCPeerConnection({ iceServers: await getIceServers() });

const attachRemoteStream = (pc: RTCPeerConnection, handlers: CallEventHandlers) => {
  const remote = new MediaStream();
  pc.addEventListener('track', (e) => {
    e.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
    handlers.onRemoteStream?.(remote);
  });
  pc.addEventListener('connectionstatechange', () => {
    handlers.onConnectionState?.(pc.connectionState);
    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
      handlers.onEnded?.();
    }
  });
};

const getMedia = () =>
  navigator.mediaDevices.getUserMedia({ video: true, audio: true });

/**
 * Caller — creates the call doc and waits for the callee to answer.
 * Returns immediately with a session handle; remote media arrives via handlers.
 */
export const startCall = async (
  params: { callerUid: string; calleeUid: string; callIdOverride?: string },
  handlers: CallEventHandlers = {},
): Promise<CallSession> => {
  const localStream = await getMedia();
  const pc = await newPeer();
  attachRemoteStream(pc, handlers);
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  const callRef = params.callIdOverride
    ? doc(db, 'videoCalls', params.callIdOverride)
    : doc(collection(db, 'videoCalls'));
  const callerCandidates = collection(callRef, 'callerCandidates');
  const calleeCandidates = collection(callRef, 'calleeCandidates');

  pc.addEventListener('icecandidate', (e) => {
    if (e.candidate) addDoc(callerCandidates, e.candidate.toJSON()).catch(() => {});
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await setDoc(callRef, {
    callerUid: params.callerUid,
    calleeUid: params.calleeUid,
    status: 'ringing',
    offer: { type: offer.type, sdp: offer.sdp },
    createdAt: serverTimestamp(),
  });

  const unsubAnswer = onSnapshot(callRef, async (snap) => {
    const data = snap.data();
    if (data?.answer && !pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
    if (data?.status === 'ended') handlers.onEnded?.();
  });

  const unsubCandidates = onSnapshot(calleeCandidates, (snap) => {
    snap.docChanges().forEach((c) => {
      if (c.type === 'added') {
        pc.addIceCandidate(new RTCIceCandidate(c.doc.data() as RTCIceCandidateInit)).catch(() => {});
      }
    });
  });

  const cleanup = async () => {
    unsubAnswer();
    unsubCandidates();
    pc.getSenders().forEach((s) => s.track?.stop());
    pc.close();
    try {
      await updateDoc(callRef, { status: 'ended' });
      // Best-effort delete subcollections
      const cleanSub = async (sub: ReturnType<typeof collection>) => {
        const docs = await getDocs(sub);
        await Promise.all(docs.docs.map((d) => deleteDoc(d.ref)));
      };
      await cleanSub(callerCandidates);
      await cleanSub(calleeCandidates);
      await deleteDoc(callRef);
    } catch { /* ignore */ }
  };

  return { callId: callRef.id, pc, localStream, cleanup };
};

/**
 * Callee — answers an existing call doc. Pass the callId surfaced by the
 * incoming-call notification (FCM data payload).
 */
export const answerCall = async (
  params: { callId: string },
  handlers: CallEventHandlers = {},
): Promise<CallSession> => {
  const callRef = doc(db, 'videoCalls', params.callId);

  // Wait up to 15 s for the call doc to appear — the admin may still be
  // acquiring camera/mic and creating the WebRTC offer.
  let snap = await getDoc(callRef);
  for (let i = 0; i < 15 && !snap.exists(); i++) {
    await new Promise<void>((r) => setTimeout(r, 1000));
    snap = await getDoc(callRef);
  }
  if (!snap.exists()) throw new Error('Call not found. The admin may have cancelled.');
  const data = snap.data() as { offer: RTCSessionDescriptionInit };

  const localStream = await getMedia();
  const pc = await newPeer();
  attachRemoteStream(pc, handlers);
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  const callerCandidates = collection(callRef, 'callerCandidates');
  const calleeCandidates = collection(callRef, 'calleeCandidates');

  pc.addEventListener('icecandidate', (e) => {
    if (e.candidate) addDoc(calleeCandidates, e.candidate.toJSON()).catch(() => {});
  });

  await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await updateDoc(callRef, {
    answer: { type: answer.type, sdp: answer.sdp },
    status: 'connected',
  });

  const unsubCandidates = onSnapshot(callerCandidates, (s) => {
    s.docChanges().forEach((c) => {
      if (c.type === 'added') {
        pc.addIceCandidate(new RTCIceCandidate(c.doc.data() as RTCIceCandidateInit)).catch(() => {});
      }
    });
  });
  const unsubStatus = onSnapshot(callRef, (s) => {
    if (s.data()?.status === 'ended') handlers.onEnded?.();
  });

  const cleanup = async () => {
    unsubCandidates();
    unsubStatus();
    pc.getSenders().forEach((sd) => sd.track?.stop());
    pc.close();
    try {
      await updateDoc(callRef, { status: 'ended' });
    } catch { /* ignore */ }
  };

  return { callId: params.callId, pc, localStream, cleanup };
};

export const endCall = async (callId: string) => {
  try {
    await updateDoc(doc(db, 'videoCalls', callId), { status: 'ended' });
  } catch { /* ignore */ }
};

export const VideoCall = { startCall, answerCall, endCall };
export default VideoCall;
