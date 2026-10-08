/**
 * Admin WhatsApp team inbox.
 *
 * - Threads from `whatsappThreads` (filled by /api/whatsapp-webhook), with
 *   filters (All / Unread / Open / Resolved / Assigned to me) and search.
 * - Conversation timeline with delivery ticks, media on demand, locations
 *   and internal notes (stored as `direction: 'note'`, never sent).
 * - Assign to any admin, mark open / resolved, quick-reply snippets
 *   (`whatsappSnippets`).
 * - Composer respects Meta's 24-hour window: free-form text inside it,
 *   approved templates outside it (switches automatically when it closes).
 *
 * Sending, read receipts and media go through /api/whatsapp-reply with the
 * signed-in admin's Firebase token. DEV only: add ?demo=1 for sample data.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileText,
  LayoutTemplate,
  Lock,
  MessageCircle,
  Paperclip,
  RotateCcw,
  Search,
  Send,
  StickyNote,
  Trash2,
  User as UserIcon,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import MessageBubble, { DeliveryTicks } from '@/components/admin/whatsapp/MessageBubble';
import { SetupStatusButton, SetupStatusDialog, useWhatsAppSetupStatus } from '@/components/admin/whatsapp/SetupStatus';
import { useInboxData, type Actor } from '@/components/admin/whatsapp/useInboxData';
import { isSendableTemplate, statusStyle } from '@/components/admin/whatsapp/templateRules';
import { ATTACH_ACCEPT, prepareAttachment } from '@/components/admin/whatsapp/waMedia';
import {
  FILTERS,
  avatarTone,
  dayLabel,
  formatCountdown,
  formatListTime,
  initials,
  maskPhone,
  matchesFilter,
  matchesSearch,
  millisLeft,
  renderTemplate,
  threadStatus,
  type Snippet,
  type TeamMember,
  type TemplateMeta,
  type Thread,
  type ThreadFilter,
  type ThreadMessage,
} from '@/components/admin/whatsapp/inboxModel';

/** Native select, same look as <Input>. */
const SELECT_CLS =
  'h-11 min-w-0 flex-1 rounded-control border border-input bg-card px-3 text-base text-foreground transition-[border-color,box-shadow] duration-hover ease-out focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:text-sm';

/** Re-render every 30 s so window countdowns stay current. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(i);
  }, [intervalMs]);
  return now;
}

const Avatar = ({ thread, size = 'size-12' }: { thread: Thread; size?: string }) => {
  const ini = initials(thread.contactName);
  return (
    <div className={cn(size, 'grid flex-none place-items-center rounded-full text-sm font-semibold', avatarTone(thread.id))} aria-hidden="true">
      {ini || <UserIcon className="size-5" />}
    </div>
  );
};

const AdminWhatsApp = () => {
  const { user, userProfile } = useAuth();
  const actor: Actor = useMemo(
    () => ({
      uid: user?.uid || null,
      name: String((userProfile as { fullName?: string; username?: string } | null)?.fullName || userProfile?.username || userProfile?.email || user?.email || 'Admin'),
      email: userProfile?.email || user?.email || null,
    }),
    [user, userProfile],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ThreadFilter>('all');
  const [search, setSearch] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const data = useInboxData(actor, activeId);
  const setup = useWhatsAppSetupStatus(data.demo);
  const now = useNow();

  // Desktop opens the newest conversation; mobile starts on the list.
  useEffect(() => {
    if (activeId || data.loadingThreads || !data.threads.length) return;
    if (window.matchMedia('(min-width: 768px)').matches) setActiveId(data.threads[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.loadingThreads]);

  const activeThread = useMemo(() => data.threads.find((t) => t.id === activeId) || null, [data.threads, activeId]);

  // Mark as read while the conversation is on screen.
  useEffect(() => {
    if (!activeThread || !activeThread.unreadCount) return;
    if (document.visibilityState !== 'visible') return;
    data.actions.markRead(activeThread);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThread?.id, activeThread?.unreadCount]);

  const counts = useMemo(() => {
    const c = {} as Record<ThreadFilter, number>;
    FILTERS.forEach((f) => {
      c[f.id] = data.threads.filter((t) => matchesFilter(t, f.id, actor.uid)).length;
    });
    return c;
  }, [data.threads, actor.uid]);
  const visible = useMemo(
    () => data.threads.filter((t) => matchesFilter(t, filter, actor.uid) && matchesSearch(t, search)),
    [data.threads, filter, search, actor.uid],
  );
  const totalUnread = data.threads.reduce((n, t) => n + ((t.unreadCount || 0) > 0 ? 1 : 0), 0);

  return (
    <div className="-m-4 h-[calc(100dvh-64px)] min-h-[520px] overflow-hidden bg-card lg:m-0 lg:h-[calc(100dvh-112px)] lg:rounded-card lg:border lg:border-border lg:shadow-sm">
      <div className="grid h-full grid-cols-1 md:grid-cols-[minmax(300px,380px)_1fr]">
        {/* ------------------------------------------------ thread list */}
        <aside className={cn(activeThread ? 'hidden md:flex' : 'flex', 'min-h-0 flex-col overflow-hidden bg-card md:border-r md:border-border')}>
          <header className="flex h-[60px] flex-none items-center gap-2 border-b border-border bg-muted px-3">
            <div className="grid size-10 place-items-center rounded-full bg-card text-foreground" aria-hidden="true">
              <MessageCircle className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold leading-tight text-foreground">WhatsApp inbox</h1>
              <p className="text-xs leading-tight text-muted-foreground" aria-live="polite">
                {data.demo ? 'Demo data, ' : ''}
                {totalUnread ? `${totalUnread} unread` : 'All caught up'}
              </p>
            </div>
            <SetupStatusButton missing={setup.missing.length} onClick={() => setSetupOpen(true)} />
          </header>

          {setup.missing.length > 0 && (
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="focus-inset flex flex-none items-center gap-2 border-b border-status-warning-line bg-status-warning-bg px-4 py-2.5 text-left text-[13px] text-status-warning-fg transition-colors duration-hover hover:bg-status-warning-bg/80"
            >
              <AlertTriangle className="size-4 flex-none" aria-hidden="true" />
              <span className="flex-1">
                Setup incomplete: {setup.missing.length} item{setup.missing.length === 1 ? '' : 's'} missing.
              </span>
              <span className="font-semibold underline underline-offset-2">View</span>
            </button>
          )}

          <div className="flex-none space-y-2 border-b border-border px-3 py-2">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone"
                aria-label="Search by name or phone"
                className="h-10 pl-9 pr-10"
              />
              {search && (
                <IconButton label="Clear search" size="sm" onClick={() => setSearch('')} className="absolute right-1 top-1/2 size-8 -translate-y-1/2">
                  <X />
                </IconButton>
              )}
            </div>
            <div className="-mx-3 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]">
              <ToggleGroup
                type="single"
                value={filter}
                onValueChange={(v) => v && setFilter(v as ThreadFilter)}
                aria-label="Filter conversations"
                className="min-w-max"
              >
                {FILTERS.map((f) => (
                  <ToggleGroupItem key={f.id} value={f.id} size="sm" className="h-8 flex-none gap-1 px-3 text-[13px]">
                    {f.label}
                    {counts[f.id] > 0 && f.id !== 'all' && <span className="tabular-nums">{counts[f.id]}</span>}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>

          {data.loadingThreads ? (
            <div aria-busy="true" className="min-h-0 flex-1 divide-y divide-border overflow-hidden">
              <span className="sr-only" role="status">Loading conversations</span>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-3">
                  <Skeleton className="size-12 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2 pt-1">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : data.threadsError ? (
            <div className="p-4">
              <Notice tone="danger" compact>{data.threadsError}</Notice>
            </div>
          ) : data.threads.length === 0 ? (
            <div className="grid flex-1 place-items-center px-8 text-center">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">No conversations yet</p>
                <p className="text-[13px] text-muted-foreground">
                  When a customer messages your WhatsApp business number, it appears here.
                </p>
                <Button type="button" variant="link" size="sm" onClick={() => setSetupOpen(true)}>
                  Check WhatsApp setup
                </Button>
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div className="grid flex-1 place-items-center px-8 text-center text-[13px] text-muted-foreground">
              <div className="space-y-3">
                <p>No conversations match {search ? `"${search}"` : 'this filter'}.</p>
                {data.hasMoreThreads && (
                  <LoadMoreThreads loading={data.loadingMoreThreads} onClick={data.loadMoreThreads} label="Search older conversations" />
                )}
              </div>
            </div>
          ) : (
            <ul aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {visible.map((t) => (
                <ThreadRow key={t.id} t={t} active={t.id === activeId} now={now} myUid={actor.uid} onOpen={() => setActiveId(t.id)} />
              ))}
              {data.hasMoreThreads && (
                <li className="flex justify-center px-4 py-3">
                  <LoadMoreThreads loading={data.loadingMoreThreads} onClick={data.loadMoreThreads} label="Load older conversations" />
                </li>
              )}
            </ul>
          )}
        </aside>

        {/* ------------------------------------------------ conversation */}
        <section
          aria-label={activeThread ? `Conversation with ${activeThread.contactName || 'customer'}` : 'Conversation'}
          className={cn(activeThread ? 'flex' : 'hidden md:flex', 'min-h-0 min-w-0 flex-col overflow-hidden bg-background')}
        >
          {!activeThread ? (
            <div className="tx-paper grid flex-1 place-items-center px-8 text-center">
              <div className="max-w-sm space-y-2">
                <MessageCircle className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
                <p className="text-lg font-medium text-foreground">Pick a conversation</p>
                <p className="text-[13px] text-muted-foreground">Replies go out from your WhatsApp business number. Internal notes stay inside the team.</p>
              </div>
            </div>
          ) : (
            <Conversation
              key={activeThread.id}
              thread={activeThread}
              messages={data.messages}
              loading={data.loadingMessages}
              templates={data.templates}
              team={data.team}
              snippets={data.snippets}
              actor={actor}
              now={now}
              demo={data.demo}
              actions={data.actions}
              onBack={() => setActiveId(null)}
            />
          )}
        </section>
      </div>
      <SetupStatusDialog open={setupOpen} onOpenChange={setSetupOpen} status={setup} />
    </div>
  );
};

export default AdminWhatsApp;

// ===========================================================================
const ThreadRow = ({ t, active, now, myUid, onOpen }: { t: Thread; active: boolean; now: number; myUid: string | null; onOpen: () => void }) => {
  const unread = (t.unreadCount || 0) > 0;
  const ms = millisLeft(t.replyWindowClosesAt, now);
  const resolved = threadStatus(t) === 'resolved';
  const assignedName = t.assignedTo ? (t.assignedTo.uid === myUid ? 'You' : t.assignedTo.name) : null;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'focus-inset flex w-full items-center gap-3 px-3 text-left transition-colors duration-hover hover:bg-muted/60',
          active && 'bg-muted shadow-[inset_2px_0_0_hsl(var(--primary))]',
        )}
      >
        <Avatar thread={t} />
        <div className="min-w-0 flex-1 border-b border-border py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn('truncate text-base text-foreground', unread && 'font-semibold')}>{t.contactName || maskPhone(t.phone)}</span>
            <span className={cn('flex-none text-xs tabular-nums', unread ? 'font-semibold text-primary' : 'text-muted-foreground')}>{formatListTime(t.updatedAt)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {t.lastDirection === 'outbound' && <DeliveryTicks status={t.lastStatus || 'sent'} />}
            <p className={cn('min-w-0 flex-1 truncate text-sm', unread ? 'text-foreground' : 'text-muted-foreground')}>
              {t.lastMessage || 'No messages yet'}
            </p>
            {unread && (
              <span className="inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                {t.unreadCount}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </div>
          {(assignedName || resolved || ms <= 2 * 3600_000) && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {resolved && <StatusBadge tone="success" icon={CheckCircle2} label="Resolved" className="h-5 px-1.5 text-[11px]" />}
              {assignedName && <StatusBadge tone="neutral" icon={UserIcon} label={assignedName} className="h-5 px-1.5 text-[11px]" />}
              {!resolved && ms > 0 && ms <= 2 * 3600_000 && (
                <StatusBadge tone="warning" icon={Clock} label={`${formatCountdown(ms)} left`} className="h-5 px-1.5 text-[11px]" />
              )}
              {!resolved && ms <= 0 && <StatusBadge tone="neutral" icon={Clock} label="Template only" className="h-5 px-1.5 text-[11px]" />}
            </div>
          )}
        </div>
      </button>
    </li>
  );
};

// ===========================================================================
type Actions = ReturnType<typeof useInboxData>['actions'];

const Conversation = ({
  thread,
  messages,
  loading,
  templates,
  team,
  snippets,
  actor,
  now,
  demo,
  actions,
  onBack,
}: {
  thread: Thread;
  messages: ThreadMessage[];
  loading: boolean;
  templates: TemplateMeta[];
  team: TeamMember[];
  snippets: Snippet[];
  actor: Actor;
  now: number;
  demo: boolean;
  actions: Actions;
  onBack: () => void;
}) => {
  const [reveal, setReveal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const remainingMs = millisLeft(thread.replyWindowClosesAt, now);
  const windowOpen = remainingMs > 0;
  const resolved = threadStatus(thread) === 'resolved';

  // Keep the newest message in view (no smooth scroll: this runs often).
  const stickToBottom = useRef(true);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = true;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, thread.id]);
  // Stay pinned to the newest message when the box resizes (composer grows,
  // media loads, keyboard opens) unless the admin scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    const ro = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
  }, [thread.id, loading]);

  const toggleResolved = async () => {
    try {
      await actions.setStatus(thread.id, resolved ? 'open' : 'resolved');
      toast.success(resolved ? 'Conversation reopened' : 'Marked as resolved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the conversation');
    }
  };
  const assignTo = async (m: TeamMember | null) => {
    try {
      await actions.assign(thread.id, m);
      toast.success(m ? `Assigned to ${m.uid === actor.uid ? 'you' : m.name}` : 'Unassigned');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not assign');
    }
  };

  // Group messages by day for separators.
  const groups = useMemo(() => {
    const out: Array<{ label: string; items: ThreadMessage[] }> = [];
    messages.forEach((m) => {
      const label = dayLabel(m.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(m);
      else out.push({ label, items: [m] });
    });
    return out;
  }, [messages]);

  const assignee = thread.assignedTo;
  return (
    <>
      <header className="flex h-[60px] flex-none items-center gap-1.5 border-b border-border bg-muted px-2 md:gap-3 md:px-4">
        <IconButton label="Back to conversations" onClick={onBack} className="md:hidden">
          <ArrowLeft />
        </IconButton>
        <Avatar thread={thread} size="size-10" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-medium leading-tight text-foreground">{thread.contactName || 'Unknown contact'}</h2>
          <div className="flex items-center gap-1 text-xs leading-tight text-muted-foreground">
            <span className="truncate font-mono tabular-nums">{reveal ? thread.phone : maskPhone(thread.phone)}</span>
            <IconButton
              label={reveal ? 'Hide phone number' : 'Show phone number'}
              aria-pressed={reveal}
              size="sm"
              onClick={() => setReveal((r) => !r)}
              className="size-7 [&_svg]:size-3.5"
            >
              {reveal ? <EyeOff /> : <Eye />}
            </IconButton>
          </div>
        </div>

        <StatusBadge
          tone={windowOpen ? 'success' : 'warning'}
          icon={Clock}
          label={windowOpen ? `Reply window ${formatCountdown(remainingMs)}` : 'Window closed'}
          title="Meta allows free-form replies for 24 hours after the customer's last message."
          className="hidden lg:inline-flex"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex-none gap-1.5 px-2.5"
              aria-label={assignee ? `Assigned to ${assignee.name}. Change assignee` : 'Assign conversation'}
            >
              {assignee ? (
                <span className={cn('grid size-6 place-items-center rounded-full text-[11px] font-semibold', avatarTone(assignee.uid))} aria-hidden="true">
                  {initials(assignee.name) || '?'}
                </span>
              ) : (
                <UserPlus aria-hidden="true" />
              )}
              <span className="hidden max-w-[8rem] truncate md:inline">{assignee ? (assignee.uid === actor.uid ? 'You' : assignee.name) : 'Assign'}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Assign to</DropdownMenuLabel>
            {actor.uid && (
              <DropdownMenuItem onSelect={() => assignTo({ uid: actor.uid!, name: actor.name, email: actor.email })}>
                <span className="flex-1">Me</span>
                {assignee?.uid === actor.uid && <Check className="size-4" aria-hidden="true" />}
              </DropdownMenuItem>
            )}
            {team
              .filter((m) => m.uid !== actor.uid)
              .map((m) => (
                <DropdownMenuItem key={m.uid} onSelect={() => assignTo(m)}>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {assignee?.uid === m.uid && <Check className="size-4" aria-hidden="true" />}
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!assignee} onSelect={() => assignTo(null)}>
              Unassign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          size="sm"
          variant={resolved ? 'outline' : 'default'}
          onClick={toggleResolved}
          className="flex-none px-2.5 md:px-3"
          aria-label={resolved ? 'Reopen conversation' : 'Mark conversation as resolved'}
        >
          {resolved ? <RotateCcw aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          <span className="hidden md:inline">{resolved ? 'Reopen' : 'Resolve'}</span>
        </Button>
      </header>

      <div
        ref={scrollRef}
        className="tx-paper min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 md:px-[6%] md:py-5"
        role="log"
        aria-label={`Messages with ${thread.contactName || 'customer'}`}
      >
        {loading ? (
          <div aria-busy="true" className="space-y-3">
            <span className="sr-only" role="status">Loading messages</span>
            <Skeleton className="h-12 w-3/5" />
            <Skeleton className="ml-auto h-10 w-1/2" />
            <Skeleton className="h-16 w-2/3" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-muted-foreground">No messages in this conversation yet.</p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="sticky top-0 z-raised mb-2 flex justify-center">
                  <span className="rounded-card border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm">{g.label}</span>
                </div>
                <ul className="space-y-1.5">
                  {g.items.map((m) => (
                    <MessageBubble key={m.id} m={m} demo={demo} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <Composer thread={thread} windowOpen={windowOpen} remainingMs={remainingMs} templates={templates} snippets={snippets} actions={actions} />
    </>
  );
};

// ===========================================================================
type Mode = 'reply' | 'template' | 'note';

const Composer = ({
  thread,
  windowOpen,
  remainingMs,
  templates,
  snippets,
  actions,
}: {
  thread: Thread;
  windowOpen: boolean;
  remainingMs: number;
  templates: TemplateMeta[];
  snippets: Snippet[];
  actions: Actions;
}) => {
  const [mode, setMode] = useState<Mode>(windowOpen ? 'reply' : 'template');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [tplId, setTplId] = useState('');
  const [params, setParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // A photo or document to send with the reply text as its caption.
  const [attachment, setAttachment] = useState<{ file: File; kind: 'image' | 'document'; previewUrl: string | null } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
  }, [attachment]);

  const attach = async (file: File | undefined) => {
    if (!file) return;
    if (!windowOpen) {
      toast.error('Photos and files can only be sent inside the 24-hour reply window.');
      return;
    }
    setPreparing(true);
    try {
      const ready = await prepareAttachment(file);
      setMode('reply');
      setAttachment({ ...ready, previewUrl: ready.kind === 'image' ? URL.createObjectURL(ready.file) : null });
      requestAnimationFrame(() => taRef.current?.focus());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not attach that file.');
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // When the 24 h window closes, free-form replies are no longer allowed.
  useEffect(() => {
    if (!windowOpen && mode === 'reply') setMode('template');
  }, [windowOpen, mode]);

  const tpl = useMemo(() => templates.find((t) => t.id === tplId) || null, [templates, tplId]);
  useEffect(() => {
    setParams((prev) => Array.from({ length: tpl?.paramLabels.length || 0 }, (_, i) => prev[i] || ''));
  }, [tpl]);

  // Auto-grow the textarea up to ~6 lines.
  const value = mode === 'note' ? note : text;
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value, mode]);

  const submit = async () => {
    if (sending) return;
    try {
      if (mode === 'note') {
        if (!note.trim()) return;
        setSending(true);
        await actions.addNote(thread.id, note.trim());
        setNote('');
        toast.success('Note added. Only your team can see it.');
      } else if (mode === 'reply') {
        if (attachment) {
          setSending(true);
          await actions.sendMedia(thread, attachment.file, attachment.kind, text.trim());
          setAttachment(null);
          setText('');
        } else {
          if (!text.trim()) return;
          setSending(true);
          await actions.send(thread, { text: text.trim() });
          setText('');
        }
      } else {
        if (!tpl) {
          toast.error('Pick a template first.');
          return;
        }
        const missing = params.findIndex((p) => !p.trim());
        if (missing >= 0) {
          toast.error(`Fill in "${tpl.paramLabels[missing] || `Variable ${missing + 1}`}".`);
          return;
        }
        setSending(true);
        await actions.send(thread, { template: tpl, params: params.map((p) => p.trim()) });
        setParams((p) => p.map(() => ''));
        toast.success('Template sent');
      }
      taRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends on desktop; on touch screens Enter adds a new line.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      submit();
    }
  };

  const insertSnippet = (s: Snippet) => {
    if (mode === 'note') setNote((n) => (n ? `${n}\n${s.text}` : s.text));
    else {
      if (!windowOpen) {
        toast.error('The reply window is closed. Quick replies can only be sent inside it.');
        return;
      }
      setMode('reply');
      setText((t) => (t ? `${t}\n${s.text}` : s.text));
    }
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const modes: Array<{ id: Mode; label: string; Icon: typeof Send; disabled?: boolean }> = [
    { id: 'reply', label: 'Reply', Icon: Send, disabled: !windowOpen },
    { id: 'template', label: 'Template', Icon: LayoutTemplate },
    { id: 'note', label: 'Note', Icon: StickyNote },
  ];
  const sendable = templates.filter((t) => isSendableTemplate(t.status));

  return (
    <div className="flex-none border-t border-border bg-muted px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:px-4">
      {/* window state */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as Mode)}
          aria-label="Composer mode"
          className="bg-card"
        >
          {modes.map((m) => (
            <ToggleGroupItem
              key={m.id}
              value={m.id}
              size="sm"
              disabled={m.disabled}
              title={m.disabled ? 'The 24-hour reply window is closed. Use a template.' : undefined}
              className={cn(
                'h-8 gap-1.5 px-3 text-[13px] data-[state=on]:bg-muted',
                m.id === 'note' && 'data-[state=on]:bg-status-warning-bg data-[state=on]:text-status-warning-fg',
              )}
            >
              <m.Icon aria-hidden="true" className="size-3.5" />
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1 text-xs',
            !windowOpen || remainingMs < 2 * 3600_000 ? 'text-status-warning-fg' : 'text-muted-foreground',
          )}
          aria-live="polite"
        >
          <Clock className="size-3.5" aria-hidden="true" />
          {windowOpen ? `${formatCountdown(remainingMs)} left to reply freely` : 'Template only'}
        </span>
      </div>

      {!windowOpen && mode !== 'note' && (
        <Notice tone="warning" compact className="mb-2 text-xs">
          More than 24 hours since the customer's last message. Meta only allows approved templates until they write again.
        </Notice>
      )}

      {mode === 'template' ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="wa-template">Template</label>
            <select id="wa-template" value={tplId} onChange={(e) => setTplId(e.target.value)} className={SELECT_CLS}>
              <option value="">{sendable.length ? 'Pick an approved template' : 'No approved templates yet'}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id} disabled={!isSendableTemplate(t.status)}>
                  {t.name} · {t.language}
                  {!isSendableTemplate(t.status) ? ` (${statusStyle(t.status).label})` : ''}
                </option>
              ))}
            </select>
            <SendButton onClick={submit} sending={sending} disabled={!tpl} label="Send template" />
          </div>
          {tpl && tpl.paramLabels.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {tpl.paramLabels.map((label, i) => (
                <Input
                  key={i}
                  value={params[i] || ''}
                  onChange={(e) => setParams((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`{{${i + 1}}} ${label}`}
                  aria-label={`${label} (variable ${i + 1})`}
                  className="h-10 bg-card"
                />
              ))}
            </div>
          )}
          {tpl?.bodyText && (
            <p className="line-clamp-3 rounded-control border border-border bg-card px-3 py-2 text-[13px] text-foreground/80">
              {renderTemplate(tpl.bodyText, params)}
            </p>
          )}
        </div>
      ) : (
        <>
          {attachment && mode === 'reply' && (
            <div className="mb-2 flex items-center gap-3 rounded-card border border-border bg-card p-2 pr-1">
              {attachment.previewUrl ? (
                <img src={attachment.previewUrl} alt="" className="size-12 flex-none rounded-control object-cover" />
              ) : (
                <span className="grid size-12 flex-none place-items-center rounded-control bg-muted text-muted-foreground">
                  <FileText className="size-5" aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {attachment.kind === 'image' ? 'Photo' : attachment.file.name}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {(attachment.file.size / 1024 / 1024).toFixed(attachment.file.size < 1024 * 1024 ? 2 : 1)} MB · your text below is sent as the caption
                </span>
              </span>
              <IconButton label="Remove attachment" onClick={() => setAttachment(null)}>
                <X />
              </IconButton>
            </div>
          )}
          <div className="flex items-end gap-2">
            <SnippetsPopover snippets={snippets} onInsert={insertSnippet} currentText={value} onAdd={actions.addSnippet} onDelete={actions.deleteSnippet} />
            {mode === 'reply' && (
              <>
                <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => attach(e.target.files?.[0])} />
                <IconButton
                  label="Attach a photo or document"
                  tooltip="Attach a photo or document (up to 3 MB)"
                  onClick={() => fileRef.current?.click()}
                  disabled={preparing || sending}
                  className="size-11"
                >
                  {preparing ? <Spinner size={20} /> : <Paperclip />}
                </IconButton>
              </>
            )}
            <div
              className={cn(
                'flex min-w-0 flex-1 items-end rounded-control border transition-[border-color,box-shadow] duration-hover focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
                mode === 'note' ? 'border-status-warning-line bg-status-warning-bg' : 'border-input bg-card',
              )}
            >
              {mode === 'note' && <Lock className="mb-3 ml-3 size-4 flex-none text-status-warning-fg" aria-hidden="true" />}
              <label htmlFor="wa-composer" className="sr-only">{mode === 'note' ? 'Internal note' : 'Message'}</label>
              <Textarea
                id="wa-composer"
                ref={taRef}
                value={value}
                onChange={(e) => (mode === 'note' ? setNote(e.target.value) : setText(e.target.value))}
                onKeyDown={onKeyDown}
                onPaste={(e) => {
                  const file = mode === 'reply' ? Array.from(e.clipboardData.files)[0] : undefined;
                  if (file) {
                    e.preventDefault();
                    attach(file);
                  }
                }}
                rows={1}
                maxLength={attachment && mode === 'reply' ? 1024 : 4096}
                placeholder={mode === 'note' ? 'Write a note for your team (not sent to the customer)' : attachment ? 'Add a caption (optional)' : 'Type a message'}
                className="max-h-40 min-h-[44px] resize-none border-0 bg-transparent py-[11px] leading-[1.4] focus-visible:ring-0"
              />
            </div>
            <SendButton
              onClick={submit}
              sending={sending}
              disabled={mode === 'reply' && attachment ? preparing : !value.trim()}
              label={mode === 'note' ? 'Add note' : attachment ? 'Send attachment' : 'Send reply'}
              note={mode === 'note'}
            />
          </div>
        </>
      )}
    </div>
  );
};

const SendButton = ({ onClick, sending, disabled, label, note }: { onClick: () => void; sending: boolean; disabled?: boolean; label: string; note?: boolean }) => (
  <Button
    type="button"
    size="icon"
    variant={note ? 'outline' : 'default'}
    onClick={onClick}
    disabled={sending || disabled}
    aria-label={label}
    className="size-11 flex-none [&_svg]:size-5"
  >
    {sending ? <Spinner size={20} /> : note ? <StickyNote aria-hidden="true" /> : <Send aria-hidden="true" />}
  </Button>
);

// ===========================================================================
const SnippetsPopover = ({
  snippets,
  onInsert,
  currentText,
  onAdd,
  onDelete,
}: {
  snippets: Snippet[];
  onInsert: (s: Snippet) => void;
  currentText: string;
  onAdd: (title: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const filtered = snippets.filter((s) => !q.trim() || `${s.title} ${s.text}`.toLowerCase().includes(q.trim().toLowerCase()));

  const startAdd = () => {
    setAdding(true);
    setTitle('');
    setBody(currentText.trim());
  };
  const save = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await onAdd(title.trim().slice(0, 60), body.trim().slice(0, 2000));
      setAdding(false);
      toast.success('Quick reply saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setAdding(false); }}>
      <PopoverTrigger asChild>
        <IconButton label="Quick replies" className="size-11">
          <Zap />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-medium text-foreground">Quick replies</p>
          {!adding && (
            <Button type="button" variant="ghost" size="sm" onClick={startAdd} className="h-8 px-2 text-primary">
              New
            </Button>
          )}
        </div>
        {adding ? (
          <div className="space-y-2 p-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short name, e.g. Order tracking"
              maxLength={60}
              aria-label="Quick reply name"
              autoFocus
              className="h-10"
            />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="The message text"
              aria-label="Quick reply text"
              className="resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
              <Button type="button" size="sm" onClick={save} disabled={saving || !title.trim() || !body.trim()}>
                {saving && <Spinner />} Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            {snippets.length > 5 && (
              <div className="border-b border-border p-2">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search quick replies" aria-label="Search quick replies" className="h-9" />
              </div>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
                {snippets.length ? 'No match.' : 'Save answers you type often, like delivery times or usage tips.'}
              </p>
            ) : (
              <ul className="max-h-72 overflow-y-auto py-1">
                {filtered.map((s) => (
                  <li key={s.id} className="flex items-start">
                    <button
                      type="button"
                      onClick={() => {
                        onInsert(s);
                        setOpen(false);
                      }}
                      className="focus-inset min-w-0 flex-1 px-3 py-2 text-left transition-colors duration-hover hover:bg-muted/60"
                    >
                      <span className="block truncate text-[13px] font-medium text-foreground">{s.title}</span>
                      <span className="line-clamp-2 block text-xs text-muted-foreground">{s.text}</span>
                    </button>
                    <IconButton
                      label={`Delete quick reply ${s.title}`}
                      size="sm"
                      onClick={() => onDelete(s.id).catch(() => toast.error('Could not delete'))}
                      className="m-1 hover:text-destructive"
                    >
                      <Trash2 />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

const LoadMoreThreads = ({ loading, onClick, label }: { loading: boolean; onClick: () => void; label: string }) => (
  <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={loading}>
    {loading && <Spinner />}
    {loading ? 'Loading' : label}
  </Button>
);
