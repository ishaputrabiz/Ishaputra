/**
 * Types and pure helpers for the admin WhatsApp team inbox.
 */
import type { Timestamp } from 'firebase/firestore';

/** Firestore Timestamp or anything with the same two methods (demo data). */
export type TimeLike = Pick<Timestamp, 'toMillis' | 'toDate'>;

export type ThreadStatus = 'open' | 'resolved';
export type DeliveryStatus = 'accepted' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Thread {
  id: string;
  phone: string;
  contactName?: string | null;
  lastMessage?: string;
  lastMessageType?: string;
  lastDirection?: 'inbound' | 'outbound';
  lastInboundAt?: TimeLike;
  lastInboundMessageId?: string | null;
  lastOutboundAt?: TimeLike;
  lastStatus?: DeliveryStatus | null;
  replyWindowClosesAt?: TimeLike;
  unreadCount?: number;
  updatedAt?: TimeLike;
  status?: ThreadStatus;
  assignedTo?: { uid: string; name: string } | null;
  /** Replied STOP (or staff turned announcements off): no marketing messages. */
  marketingOptOut?: boolean;
}

export interface ThreadMessage {
  id: string;
  direction: 'inbound' | 'outbound' | 'note';
  type?: string;
  text?: string;
  template?: { name?: string; language?: string; params?: string[] };
  media?: { id: string; mimeType?: string | null; caption?: string | null; filename?: string | null; voice?: boolean } | null;
  location?: { latitude: number; longitude: number; name?: string | null; address?: string | null } | null;
  reaction?: { emoji: string; messageId: string } | null;
  actorEmail?: string | null;
  actorName?: string | null;
  createdAt?: TimeLike | null;
  providerMessageId?: string | null;
  status?: DeliveryStatus;
  error?: { code?: number | null; title?: string | null; message?: string | null } | null;
}

export interface TemplateMeta {
  id: string;
  name: string;
  language: string;
  category: string;
  paramLabels: string[];
  status?: string | null;
  bodyText?: string | null;
}

export interface TeamMember {
  uid: string;
  name: string;
  email?: string | null;
}

export interface Snippet {
  id: string;
  title: string;
  text: string;
}

export type ThreadFilter = 'all' | 'unread' | 'open' | 'resolved' | 'mine';

export const FILTERS: Array<{ id: ThreadFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'mine', label: 'Assigned to me' },
];

export const threadStatus = (t: Thread): ThreadStatus => (t.status === 'resolved' ? 'resolved' : 'open');

export function matchesFilter(t: Thread, f: ThreadFilter, myUid: string | null) {
  switch (f) {
    case 'unread':
      return (t.unreadCount || 0) > 0;
    case 'open':
      return threadStatus(t) === 'open';
    case 'resolved':
      return threadStatus(t) === 'resolved';
    case 'mine':
      return !!myUid && t.assignedTo?.uid === myUid;
    default:
      return true;
  }
}

export function matchesSearch(t: Thread, term: string) {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  if ((t.contactName || '').toLowerCase().includes(q)) return true;
  return digits.length >= 3 && t.phone.replace(/\D/g, '').includes(digits);
}

export const maskPhone = (p: string) => {
  if (!p) return '';
  if (p.length <= 4) return p;
  return p.slice(0, p.length - 4).replace(/\d/g, '•') + p.slice(-4);
};

export const initials = (name?: string | null) => {
  // Only words that start with a letter or digit, so "Priya (demo)" gives "P".
  const parts = String(name || '').trim().split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  if (!parts.length) return '';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

/** Status-tone tints (light and dark values come from the tokens). */
const AVATAR_TONES = [
  'bg-muted text-foreground/80',
  'bg-status-info-bg text-status-info-fg',
  'bg-status-returns-bg text-status-returns-fg',
  'bg-status-success-bg text-status-success-fg',
  'bg-status-warning-bg text-status-warning-fg',
];
export const avatarTone = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
};

export const millisLeft = (ts?: TimeLike | null, now = Date.now()) => (ts?.toMillis ? ts.toMillis() - now : 0);

export const formatCountdown = (ms: number) => {
  if (ms <= 0) return 'closed';
  const totalMin = Math.max(1, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
};

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "14:05", "Yesterday", "Mon", or "12/09/26" like WhatsApp's chat list. */
export const formatListTime = (ts?: TimeLike | null, now = new Date()) => {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  if (sameDay(d, now)) return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export const formatBubbleTime = (ts?: TimeLike | null) =>
  ts?.toDate ? ts.toDate().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';

export const dayLabel = (ts?: TimeLike | null, now = new Date()) => {
  if (!ts?.toDate) return 'Sending…';
  const d = ts.toDate();
  if (sameDay(d, now)) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

export const renderTemplate = (bodyText: string, params: string[]) =>
  String(bodyText || '').replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`);

/** Human text for a Meta delivery error code. */
export function describeSendError(err?: ThreadMessage['error']) {
  if (!err) return 'Not delivered.';
  const code = err.code || 0;
  if (code === 131047) return 'Not delivered: more than 24 hours since the customer last wrote. Send a template instead.';
  if (code === 131026) return 'Not delivered: this number may not use WhatsApp, or has an old app version.';
  if (code === 131049) return 'Not delivered: Meta limits how many marketing messages one person gets. Try later.';
  if (code === 131050) return 'Not delivered: the customer stopped marketing messages from you.';
  if (code === 131051) return 'Not delivered: this message type is not supported.';
  return `Not delivered: ${err.message || err.title || 'unknown reason'}${code ? ` (code ${code})` : ''}.`;
}
