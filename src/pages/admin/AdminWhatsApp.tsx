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
  Eye,
  EyeOff,
  Clock,
  User as UserIcon,
  ArrowLeft,
  MoreVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

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
  return formatDateTime(ts);
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
    <div className="h-[calc(100vh-138px)] min-h-[560px] overflow-hidden rounded-card border border-border bg-card shadow-sm">
      <h1 className="sr-only">WhatsApp inbox</h1>
      <div className="grid h-full grid-cols-1 md:grid-cols-[360px_1fr]">
      {/* Threads list */}
      <div className={`${activeThread ? 'hidden md:flex' : 'flex'} flex-col overflow-hidden bg-card md:border-r md:border-border`}>
        <div className="flex h-[59px] shrink-0 items-center gap-3 border-b border-border bg-muted px-4">
          <div aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-card text-foreground">
            <MessageCircle className="size-5" />
          </div>
          <h2 className="text-base font-semibold text-foreground">WhatsApp</h2>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            <span className="sr-only">Conversations: </span>{threads.length}
          </span>
        </div>
        {loadingThreads ? (
          <div aria-busy="true" className="flex-1 divide-y divide-border">
            <span className="sr-only" role="status">Loading conversations</span>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-3">
                <Skeleton className="size-12 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2 pt-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="grid flex-1 place-items-center px-6 text-center text-sm text-muted-foreground">
            No WhatsApp conversations yet. Inbound messages will appear here once Meta
            forwards them through the webhook.
          </div>
        ) : (
          <ul aria-label="Conversations" className="flex-1 divide-y divide-border overflow-auto bg-card">
            {threads.map((t) => {
              const unread = (t.unreadCount || 0) > 0;
              const ms = millisLeft(t.replyWindowClosesAt);
              const open = ms > 0;
              const isActive = activeId === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'focus-inset w-full px-3 py-3 text-left text-xs transition-colors duration-hover hover:bg-muted/60',
                      isActive && 'bg-muted shadow-[inset_2px_0_0_hsl(var(--primary))]',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div aria-hidden="true" className="grid size-12 flex-none place-items-center rounded-full bg-muted">
                        <UserIcon className="size-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[15px] font-medium text-foreground">
                            {t.contactName || maskPhone(t.phone)}
                          </span>
                          <span className={cn('shrink-0 text-[11px] tabular-nums', unread ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                            {formatTime(t.updatedAt)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                            {t.lastDirection === 'outbound' ? 'You: ' : ''}
                            {t.lastMessage || 'No messages yet'}
                          </p>
                          {unread && (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                              <span className="sr-only">Unread: </span>{t.unreadCount}
                            </span>
                          )}
                        </div>
                        <StatusBadge
                          tone={open ? 'success' : 'warning'}
                          icon={Clock}
                          label={open ? formatCountdown(ms) : 'Template only'}
                          className="mt-2 h-5 px-1.5 text-[11px]"
                        />
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Thread detail */}
      <section
        aria-label={activeThread ? `Conversation with ${activeThread.contactName || 'customer'}` : 'Conversation'}
        className={`${activeThread ? 'flex' : 'hidden md:flex'} min-w-0 flex-col overflow-hidden bg-background`}
      >
        {!activeThread ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
            Select a conversation to view messages.
          </div>
        ) : (
          <>
            <div className="flex h-[59px] shrink-0 items-center gap-3 border-b border-border bg-muted px-2 md:px-4">
              <IconButton label="Back to chats" onClick={() => setActiveId(null)} className="md:hidden">
                <ArrowLeft />
              </IconButton>
              <div aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-card">
                <UserIcon className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[15px] font-medium text-foreground">
                  {activeThread.contactName || 'Unknown'}
                </h2>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    {reveal[activeThread.id]
                      ? activeThread.phone
                      : maskPhone(activeThread.phone)}
                  </span>
                  <IconButton
                    label={reveal[activeThread.id] ? 'Hide phone number' : 'Show phone number'}
                    aria-pressed={!!reveal[activeThread.id]}
                    size="sm"
                    onClick={() =>
                      setReveal((r) => ({ ...r, [activeThread.id]: !r[activeThread.id] }))
                    }
                    className="size-7 [&_svg]:size-3.5"
                  >
                    {reveal[activeThread.id] ? <EyeOff /> : <Eye />}
                  </IconButton>
                </div>
              </div>
              <StatusBadge
                key={tick /* force re-render on tick */}
                tone={windowOpen ? 'success' : 'warning'}
                icon={Clock}
                label={windowOpen ? `Free-form ${formatCountdown(remainingMs)}` : 'Free-form window closed'}
                className="hidden sm:inline-flex"
              />
              <MoreVertical aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            </div>

            <div className="tx-paper flex-1 overflow-auto px-3 py-4 md:px-10 md:py-6">
              {messages.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
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
                        className={cn(
                          'max-w-[86%] rounded-card px-3 py-2 text-sm text-foreground shadow-sm md:max-w-[72%]',
                          m.direction === 'outbound'
                            ? 'rounded-tr-chip border border-primary/20 bg-primary/10'
                            : 'rounded-tl-chip border border-foreground/[0.06] bg-card',
                        )}
                      >
                        <span className="sr-only">{m.direction === 'outbound' ? 'You: ' : 'Customer: '}</span>
                        {m.type === 'template' && m.template ? (
                          <>
                            <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                              Template · {m.template.name}
                            </div>
                            {m.template.params && m.template.params.length > 0 && (
                              <ol className="list-decimal pl-4 text-xs text-foreground/80">
                                {m.template.params.map((p, i) => (
                                  <li key={i}>{p}</li>
                                ))}
                              </ol>
                            )}
                          </>
                        ) : (
                          <p className="whitespace-pre-wrap">{m.text || 'No text'}</p>
                        )}
                        <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
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

  const fieldClass =
    'w-full rounded-control border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-hover ease-out focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:text-sm';

  return (
    <div className="shrink-0 space-y-2 border-t border-border bg-muted px-3 py-2">
      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as 'text' | 'template')}
          aria-label="Reply type"
          className="ml-auto bg-card"
        >
          <ToggleGroupItem
            value="text"
            size="sm"
            disabled={!windowOpen}
            title={!windowOpen ? 'Free-form window closed' : undefined}
            className="h-8 px-3 text-xs data-[state=on]:bg-muted"
          >
            Text
          </ToggleGroupItem>
          <ToggleGroupItem value="template" size="sm" className="h-8 px-3 text-xs data-[state=on]:bg-muted">
            Template
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!windowOpen && (
        <Notice tone="warning" compact className="text-xs">
          Free-form window closed. Meta requires an approved template until the customer
          messages again.
        </Notice>
      )}

      {mode === 'text' ? (
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={1000}
          aria-label="Reply"
          placeholder="Type your reply"
          className={cn(fieldClass, 'resize-none py-2.5')}
        />
      ) : (
        <div className="space-y-2">
          <select
            value={tplId}
            onChange={(e) => setTplId(e.target.value)}
            aria-label="Template"
            className={cn(fieldClass, 'h-10')}
          >
            <option value="">Pick a template</option>
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
              aria-label={label || `Parameter ${idx + 1}`}
              placeholder={`{{${idx + 1}}} ${label}`}
              className={cn(fieldClass, 'h-9 text-sm')}
            />
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSend} disabled={sending}>
          {sending ? <Spinner /> : <Send aria-hidden="true" />}
          Send
        </Button>
      </div>
    </div>
  );
};
