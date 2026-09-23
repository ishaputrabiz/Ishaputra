/**
 * Admin WhatsApp inbox.
 *
 * Lists active WhatsApp threads from the `whatsappThreads` collection,
 * shows the message timeline in the selected thread, and provides a reply
 * composer that respects Meta's 24-hour customer-service window:
 *   - inside the window  → free-form text reply
 *   - outside the window → must use an approved template from
 *                          `whatsappTemplates`
 *
 * Sending is delegated to /api/whatsapp-reply with the signed-in admin's Firebase token.
 * Inbound messages arrive through /api/whatsapp-webhook.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  MessageCircle,
  Send,
  Loader2,
  Eye,
  EyeOff,
  Clock,
  AlertTriangle,
  User as UserIcon,
  ArrowLeft,
  MoreVertical,
} from 'lucide-react';
import { toast } from 'sonner';

interface Thread {
  id: string;
  phone: string;
  contactName?: string | null;
  lastMessage?: string;
  lastDirection?: 'inbound' | 'outbound';
  lastInboundAt?: Timestamp;
  lastOutboundAt?: Timestamp;
  replyWindowClosesAt?: Timestamp;
  unreadCount?: number;
  updatedAt?: Timestamp;
}

interface ThreadMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  type?: string;
  text?: string;
  template?: { name?: string; language?: string; params?: string[] };
  actorEmail?: string;
  createdAt?: Timestamp;
  providerMessageId?: string | null;
}

interface TemplateMeta {
  id: string;
  name: string;
  language: string;
  category: string;
  paramLabels: string[];
}

const maskPhone = (p: string) => {
  if (!p) return '';
  if (p.length <= 4) return p;
  return p.slice(0, p.length - 4).replace(/\d/g, '•') + p.slice(-4);
};

const formatTime = (ts?: Timestamp) => {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
};

const millisLeft = (ts?: Timestamp) => {
  if (!ts?.toDate) return 0;
  return ts.toMillis() - Date.now();
};

const formatCountdown = (ms: number) => {
  if (ms <= 0) return 'closed';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
};

const getErrorMessage = (err: unknown, fallback = 'Network error') =>
  err instanceof Error ? err.message : fallback;

const AdminWhatsApp = () => {
  const { user, userProfile } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  // -- subscriptions --------------------------------------------------------
  useEffect(() => {
    const q = query(collection(db, 'whatsappThreads'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Thread[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Thread, 'id'>),
        }));
        setThreads(next);
        setLoadingThreads(false);
        if (!activeId && next.length > 0) setActiveId(next[0].id);
      },
      (err) => {
        console.warn('[whatsapp] threads subscribe failed', err);
        setLoadingThreads(false);
      },
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'whatsappThreads', activeId, 'messages'),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ThreadMessage, 'id'>),
        })),
      );
    });
    return () => unsub();
  }, [activeId]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'whatsappTemplates'), orderBy('name')),
      (snap) => {
        setTemplates(
          snap.docs.map((d) => ({
            id: d.id,
            name: (d.data().name as string) || d.id,
            language: (d.data().language as string) || 'en_US',
            category: (d.data().category as string) || 'utility',
            paramLabels: (d.data().paramLabels as string[]) || [],
          })),
        );
      },
    );
    return () => unsub();
  }, []);

  // Auto-mark active thread read.
  useEffect(() => {
    if (!activeId) return;
    const t = threads.find((x) => x.id === activeId);
    if (!t || !t.unreadCount) return;
    updateDoc(doc(db, 'whatsappThreads', activeId), { unreadCount: 0 }).catch(() => undefined);
  }, [activeId, threads]);

  // Tick every minute so the countdown badge updates.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(i);
  }, []);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeId) || null,
    [threads, activeId],
  );
  const remainingMs = millisLeft(activeThread?.replyWindowClosesAt);
  const windowOpen = remainingMs > 0;

  return (
    <div className="h-[calc(100vh-138px)] min-h-[560px] overflow-hidden border border-[#d1d7db] bg-[#efeae2] shadow-sm md:rounded-[3px] md:bg-[#111b21]">
      <div className="grid h-full grid-cols-1 md:grid-cols-[360px_1fr]">
      {/* Threads list */}
      <aside className={`${activeThread ? 'hidden md:flex' : 'flex'} bg-white flex-col overflow-hidden md:border-r md:border-[#d1d7db]`}>
        <header className="h-[59px] px-4 bg-[#f0f2f5] border-b border-[#d1d7db] flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[#00a884] grid place-items-center">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          <span className="font-semibold text-[#111b21] text-base">WhatsApp</span>
          <span className="ml-auto text-xs text-[#667781]">{threads.length}</span>
        </header>
        {loadingThreads ? (
          <div className="flex-1 grid place-items-center text-xs text-gray-500 gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : threads.length === 0 ? (
          <div className="flex-1 grid place-items-center text-xs text-gray-500 px-6 text-center">
            No WhatsApp conversations yet. Inbound messages will appear here once Meta
            forwards them through the webhook.
          </div>
        ) : (
          <ul className="flex-1 overflow-auto divide-y divide-[#e9edef] bg-white">
            {threads.map((t) => {
              const unread = (t.unreadCount || 0) > 0;
              const ms = millisLeft(t.replyWindowClosesAt);
              const open = ms > 0;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => setActiveId(t.id)}
                    className={`w-full text-left px-3 py-3 text-xs hover:bg-[#f5f6f6] transition-colors ${
                      activeId === t.id ? 'bg-[#f0f2f5]' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 flex-none rounded-full bg-[#dfe5e7] grid place-items-center">
                        <UserIcon className="h-5 w-5 text-[#667781]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-[#111b21] text-[15px] truncate">
                            {t.contactName || maskPhone(t.phone)}
                          </span>
                          <span className={`text-[11px] ${unread ? 'text-[#00a884]' : 'text-[#667781]'}`}>
                            {formatTime(t.updatedAt)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <p className="min-w-0 flex-1 text-[13px] text-[#667781] truncate">
                            {t.lastDirection === 'outbound' ? 'You: ' : ''}
                            {t.lastMessage || 'No messages yet'}
                          </p>
                          {unread && (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#00a884] px-1.5 text-[11px] font-medium text-white">
                              {t.unreadCount}
                            </span>
                          )}
                        </div>
                      <span
                        className={`mt-2 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                          open
                            ? 'bg-[#d9fdd3] text-[#128c7e]'
                            : 'bg-[#fff3cd] text-[#8a6d1f]'
                        }`}
                      >
                        <Clock className="h-2.5 w-2.5" />
                        {open ? formatCountdown(ms) : 'template-only'}
                      </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* Thread detail */}
      <section className={`${activeThread ? 'flex' : 'hidden md:flex'} min-w-0 flex-col overflow-hidden bg-[#efeae2]`}>
        {!activeThread ? (
          <div className="flex-1 grid place-items-center text-sm text-gray-500">
            Select a conversation to view messages.
          </div>
        ) : (
          <>
            <header className="h-[59px] px-3 md:px-4 bg-[#f0f2f5] border-b border-[#d1d7db] flex items-center gap-3">
              <button onClick={() => setActiveId(null)} className="md:hidden p-1 text-[#54656f]" aria-label="Back to chats">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="h-10 w-10 rounded-full bg-[#dfe5e7] grid place-items-center">
                <UserIcon className="h-5 w-5 text-[#667781]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium text-[#111b21]">
                  {activeThread.contactName || 'Unknown'}
                </div>
                <div className="text-xs text-[#667781] flex items-center gap-2">
                  <span className="font-mono">
                    {reveal[activeThread.id]
                      ? activeThread.phone
                      : maskPhone(activeThread.phone)}
                  </span>
                  <button
                    onClick={() =>
                      setReveal((r) => ({ ...r, [activeThread.id]: !r[activeThread.id] }))
                    }
                    className="text-[#008069] hover:underline inline-flex items-center gap-0.5"
                    title="Toggle phone visibility"
                  >
                    {reveal[activeThread.id] ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
              <span
                key={tick /* force re-render on tick */}
                className={`hidden sm:inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full ${
                  windowOpen
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                <Clock className="h-3 w-3" />
                {windowOpen
                  ? `Free-form ${formatCountdown(remainingMs)}`
                  : 'Free-form window closed'}
              </span>
              <MoreVertical className="h-5 w-5 text-[#54656f]" />
            </header>

            <div className="flex-1 overflow-auto px-3 py-4 md:px-10 md:py-6 bg-[#efeae2] bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.36)_0_1px,transparent_1px),radial-gradient(circle_at_80%_40%,rgba(17,27,33,0.08)_0_1px,transparent_1px)] [background-size:24px_24px]">
              {messages.length === 0 ? (
                <div className="text-center text-xs text-gray-500 py-12">
                  No messages in this thread yet.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {messages.map((m) => (
                    <li
                      key={m.id}
                      className={`flex ${
                        m.direction === 'outbound' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[86%] md:max-w-[72%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                          m.direction === 'outbound'
                            ? 'bg-[#d9fdd3] text-[#111b21] rounded-tr-none'
                            : 'bg-white text-[#111b21] rounded-tl-none'
                        }`}
                      >
                        {m.type === 'template' && m.template ? (
                          <>
                            <div className="text-[10px] uppercase tracking-wide opacity-75 mb-1">
                              Template · {m.template.name}
                            </div>
                            {m.template.params && m.template.params.length > 0 && (
                              <ol className="text-xs list-decimal pl-4 opacity-90">
                                {m.template.params.map((p, i) => (
                                  <li key={i}>{p}</li>
                                ))}
                              </ol>
                            )}
                          </>
                        ) : (
                          <p className="whitespace-pre-wrap">{m.text || '—'}</p>
                        )}
                        <div className="text-[10px] mt-1 text-[#667781]">
                          {formatTime(m.createdAt)}
                          {m.actorEmail ? ` · ${m.actorEmail}` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <ReplyComposer
              phone={activeThread.phone}
              windowOpen={windowOpen}
              templates={templates}
              user={user}
              actorUid={user?.uid || null}
              actorEmail={userProfile?.email || user?.email || null}
            />
          </>
        )}
      </section>
      </div>
    </div>
  );
};

export default AdminWhatsApp;

// ---------------------------------------------------------------------------
const ReplyComposer = ({
  phone,
  windowOpen,
  templates,
  user,
  actorUid,
  actorEmail,
}: {
  phone: string;
  windowOpen: boolean;
  templates: TemplateMeta[];
  user: ReturnType<typeof useAuth>['user'];
  actorUid: string | null;
  actorEmail: string | null;
}) => {
  const [mode, setMode] = useState<'text' | 'template'>(windowOpen ? 'text' : 'template');
  const [text, setText] = useState('');
  const [tplId, setTplId] = useState('');
  const [tplParams, setTplParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Keep mode in sync with the window: outside window force template.
  useEffect(() => {
    if (!windowOpen) setMode('template');
  }, [windowOpen]);

  const tpl = useMemo(() => templates.find((t) => t.id === tplId) || null, [templates, tplId]);
  useEffect(() => {
    if (!tpl) {
      setTplParams([]);
      return;
    }
    setTplParams((prev) => {
      const next = [...prev];
      while (next.length < tpl.paramLabels.length) next.push('');
      next.length = tpl.paramLabels.length;
      return next;
    });
  }, [tpl]);

  const handleSend = async () => {
    if (mode === 'text' && !text.trim()) {
      toast.error('Type a message.');
      return;
    }
    if (mode === 'template' && !tpl) {
      toast.error('Pick a template.');
      return;
    }
    setSending(true);
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) {
        toast.error('Please sign in again before replying.');
        setSending(false);
        return;
      }
      const resp = await fetch('/api/whatsapp-reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          phone,
          ...(mode === 'text'
            ? { text: text.trim() }
            : {
                template: {
                  name: tpl!.name,
                  language: tpl!.language,
                  params: tplParams,
                },
              }),
          actorUid,
          actorEmail,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        toast.error(data?.error || 'Send failed');
      } else {
        toast.success('Reply sent');
        setText('');
        if (mode === 'template') setTplParams((p) => p.map(() => ''));
        taRef.current?.focus();
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-[#d1d7db] px-3 py-2 bg-[#f0f2f5] space-y-2">
      <div className="flex items-center gap-2">
        <div className="ml-auto inline-flex rounded-full border border-[#d1d7db] bg-white overflow-hidden text-[11px]">
          <button
            disabled={!windowOpen}
            onClick={() => setMode('text')}
            className={`px-2 py-1 ${
              mode === 'text'
                ? 'bg-[#008069] text-white'
                : 'bg-white text-[#54656f] disabled:opacity-50'
            }`}
            title={!windowOpen ? 'Free-form window closed' : ''}
          >
            Text
          </button>
          <button
            onClick={() => setMode('template')}
            className={`px-2 py-1 ${
              mode === 'template' ? 'bg-[#008069] text-white' : 'bg-white text-[#54656f]'
            }`}
          >
            Template
          </button>
        </div>
      </div>

      {!windowOpen && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 mt-0.5" />
          <span>
            Free-form window closed. Meta requires an approved template until the customer
            messages again.
          </span>
        </div>
      )}

      {mode === 'text' ? (
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Type your reply…"
          className="w-full px-4 py-2.5 border-0 rounded-lg text-sm resize-none focus:outline-none bg-white text-[#111b21] placeholder:text-[#667781]"
        />
      ) : (
        <div className="space-y-2">
          <select
            value={tplId}
            onChange={(e) => setTplId(e.target.value)}
            className="w-full px-3 py-2 border border-[#d1d7db] rounded-lg text-sm bg-white"
          >
            <option value="">Pick a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.language} · {t.category}
              </option>
            ))}
          </select>
          {tpl?.paramLabels.map((label, idx) => (
            <input
              key={idx}
              value={tplParams[idx] || ''}
              onChange={(e) => {
                const next = [...tplParams];
                next[idx] = e.target.value;
                setTplParams(next);
              }}
              placeholder={`{{${idx + 1}}} ${label}`}
              className="w-full px-3 py-1.5 border border-[#d1d7db] rounded-lg text-xs bg-white"
            />
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSend}
          disabled={sending}
          className="inline-flex items-center gap-1.5 bg-[#008069] hover:bg-[#017561] disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-full"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Send
        </button>
      </div>
    </div>
  );
};
