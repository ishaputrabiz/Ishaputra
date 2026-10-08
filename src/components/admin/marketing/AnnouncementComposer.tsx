/**
 * Marketing → Announcement: type a message, pick everyone or chosen
 * customers, send on WhatsApp (one approved template) and/or web push.
 * Delivery runs server-side in /api/broadcast.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  Bell,
  CheckCircle2,
  Clock,
  Megaphone,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/config/firebase';
import { BRAND } from '@/config/brand';
import { useAuth } from '@/contexts/AuthContext';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import WhatsAppPreviewBubble from '@/components/admin/whatsapp/WhatsAppPreviewBubble';
import { cn } from '@/lib/utils';
import { whatsappAdminApi, WhatsAppApiError } from '@/services/whatsappAdminApi';
import {
  ANNOUNCEMENT_FOOTER,
  ANNOUNCEMENT_MAX_LENGTH,
  NAME_FALLBACK,
  announcementTemplateDraft,
  countWhatsAppReach,
  isCustomerRole,
  nextAnnouncementName,
  pickAnnouncementTemplate,
  renderAnnouncement,
  toCustomerRow,
  toWhatsAppParam,
  type AnnouncementTemplateRow,
  type CustomerRow,
} from './announcement';

type Audience = 'customers' | 'selected';

interface SendResult {
  ok: boolean;
  error?: string;
  recipientCount?: number;
  push?: { successCount?: number; failureCount?: number } | null;
  whatsapp?: {
    successCount?: number;
    failureCount?: number;
    failures?: Array<{ error: string }>;
    skipped?: { noPhone: number; invalidPhone: number; optedOut: number; duplicate: number };
  } | null;
}

const card = 'rounded-card border border-border bg-card p-4 shadow-sm sm:p-5';
const stepTitle = 'text-sm font-semibold text-foreground';
const firstName = (name: string) => name.split(' ')[0] || '';

export default function AnnouncementComposer({ templates }: { templates: AnnouncementTemplateRow[] }) {
  const { user, userProfile } = useAuth();
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<Audience>('customers');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useWhatsApp, setUseWhatsApp] = useState(true);
  const [usePush, setUsePush] = useState(false);

  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [optedOut, setOptedOut] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  const template = useMemo(() => pickAnnouncementTemplate(templates), [templates]);
  const templateStatus = String(template?.status || '').toUpperCase();
  // Hand-entered templates have no status; treat them as usable like the rest of the page.
  const templateReady = !!template && (templateStatus === 'APPROVED' || !template.status);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [usersSnap, optSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(query(collection(db, 'whatsappThreads'), where('marketingOptOut', '==', true))).catch(() => null),
        ]);
        if (cancelled) return;
        const rows = usersSnap.docs
          .filter((d) => isCustomerRole(d.data().role))
          .map((d) => toCustomerRow(d.id, d.data()))
          .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
        setCustomers(rows);
        setOptedOut(new Set(optSnap ? optSnap.docs.map((d) => d.id.replace(/\D/g, '')) : []));
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load customers.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const audienceRows = useMemo(() => {
    if (!customers) return [];
    return audience === 'customers' ? customers : customers.filter((c) => selected.has(c.uid));
  }, [customers, audience, selected]);

  const reach = useMemo(() => countWhatsAppReach(audienceRows, optedOut), [audienceRows, optedOut]);
  const previewName = firstName(audienceRows.find((r) => r.name)?.name || '') || NAME_FALLBACK;
  const trimmed = message.trim();

  const problems: string[] = [];
  if (!trimmed) problems.push('Write the announcement.');
  if (!useWhatsApp && !usePush) problems.push('Pick WhatsApp, website notification, or both.');
  if (audience === 'selected' && selected.size === 0) problems.push('Choose at least one customer.');
  if (useWhatsApp && !templateReady) problems.push('The WhatsApp announcement template is not approved yet (see the box above).');

  /** Never rejects: failures are shown in the result box, so the confirm dialog closes either way. */
  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) throw new Error('Please sign in again before sending.');
      const resp = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          audience,
          selectedUids: audience === 'selected' ? Array.from(selected) : undefined,
          channels: { push: usePush, whatsapp: useWhatsApp },
          push: usePush ? { title: BRAND.name, body: trimmed.slice(0, 240), url: '/' } : undefined,
          whatsapp:
            useWhatsApp && template
              ? {
                  template: template.name,
                  language: template.language,
                  params: [NAME_FALLBACK, toWhatsAppParam(trimmed)],
                  personalizeFirst: true,
                }
              : undefined,
          kind: 'announcement',
          actorUid: user?.uid || null,
          actorEmail: userProfile?.email || user?.email || null,
        }),
      });
      const isJson = (resp.headers.get('content-type') || '').includes('application/json');
      const data = isJson ? await resp.json() : {};
      if (!isJson) throw new Error('Sending works on the live site only (the API runs on Vercel).');
      if (!resp.ok || !data.ok) throw new Error(data?.error || `Send failed (HTTP ${resp.status}).`);
      setResult({ ok: true, ...data });
      toast.success('Announcement sent');
      setMessage('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed.';
      setResult({ ok: false, error: msg });
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const audienceLabel =
    audience === 'customers' ? `all ${customers?.length ?? ''} customers` : `${selected.size} chosen customer${selected.size === 1 ? '' : 's'}`;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="min-w-0 space-y-6 lg:col-span-3">
        {useWhatsApp && <TemplateStatusCard template={template} templates={templates} />}

        <section className={cn(card, 'space-y-3')}>
          <h2 className={stepTitle}>
            <label htmlFor="announcement-text">1. Write your announcement</label>
          </h2>
          <div className="relative">
            <Textarea
              id="announcement-text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={ANNOUNCEMENT_MAX_LENGTH}
              rows={5}
              placeholder="For example: Our new range is now on the website. Take a look this weekend."
              aria-describedby="announcement-help"
              className="min-h-[120px] resize-y pb-6"
            />
            <span className="pointer-events-none absolute bottom-1.5 right-2 text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
              {message.length}/{ANNOUNCEMENT_MAX_LENGTH}
            </span>
          </div>
          <p id="announcement-help" className="text-xs text-muted-foreground">
            Each customer sees their own first name in the greeting. WhatsApp shows the message as one paragraph, so
            line breaks become spaces. You can use *bold* and _italic_.
          </p>
        </section>

        <section className={cn(card, 'space-y-4')}>
          <h2 id="announcement-audience" className={stepTitle}>2. Choose who gets it</h2>
          <div role="radiogroup" aria-labelledby="announcement-audience" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <AudienceOption
              checked={audience === 'customers'}
              onSelect={() => setAudience('customers')}
              title="All customers"
              help={customers ? `${customers.length} customer accounts` : 'Loading'}
            />
            <AudienceOption
              checked={audience === 'selected'}
              onSelect={() => setAudience('selected')}
              title="Choose customers"
              help={selected.size ? `${selected.size} chosen` : 'Pick names from the list'}
            />
          </div>
          {loadError && (
            <Notice tone="danger" compact>
              Could not load customers: {loadError}
            </Notice>
          )}
          {audience === 'selected' && (
            <CustomerPicker customers={customers} optedOut={optedOut} selected={selected} onChange={setSelected} />
          )}
        </section>

        <section className={cn(card, 'space-y-3')}>
          <h2 className={stepTitle}>3. Send on</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ChannelCheck
              checked={useWhatsApp}
              onChange={setUseWhatsApp}
              icon={<MessageCircle aria-hidden="true" className="size-4 text-muted-foreground" />}
              title="WhatsApp"
              help="Meta charges a small fee for each marketing message."
            />
            <ChannelCheck
              checked={usePush}
              onChange={setUsePush}
              icon={<Bell aria-hidden="true" className="size-4 text-muted-foreground" />}
              title="Website notification"
              help="Only reaches people who allowed notifications."
            />
          </div>

          {useWhatsApp && customers && (
            <p className="text-xs text-foreground/80">
              WhatsApp will reach <strong className="tabular-nums text-foreground">{reach.reach}</strong> number
              {reach.reach === 1 ? '' : 's'}.
              {reach.noNumber > 0 && ` ${reach.noNumber} without a valid mobile number will be skipped.`}
              {reach.optedOut > 0 && ` ${reach.optedOut} replied STOP and will be skipped.`}
              {reach.duplicate > 0 && ` ${reach.duplicate} share a number with another account and get one message.`}
            </p>
          )}

          {problems.length > 0 && (trimmed || audience === 'selected') && (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-status-warning-fg">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <Button type="button" onClick={() => setConfirmOpen(true)} disabled={sending || problems.length > 0}>
            {sending ? <Spinner /> : <Send aria-hidden="true" />}
            {sending ? 'Sending' : 'Send announcement'}
          </Button>

          {result && <ResultBox result={result} />}
        </section>
      </div>

      <aside aria-label="Preview" className="min-w-0 space-y-3 self-start lg:sticky lg:top-4 lg:col-span-2">
        <h2 className="text-xs font-semibold text-muted-foreground">WhatsApp preview</h2>
        <WhatsAppPreviewBubble
          body={trimmed ? renderAnnouncement(previewName, trimmed) : ''}
          footer={ANNOUNCEMENT_FOOTER}
        />
        <p className="text-xs text-muted-foreground">
          Shown with the name of the first customer in your list. Customers who reply STOP stop getting announcements;
          START turns them back on.
        </p>
      </aside>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Send this announcement?"
        description={
          <>
            It goes to {audienceLabel}
            {useWhatsApp && ` (${reach.reach} on WhatsApp)`}
            {usePush && useWhatsApp ? ' and as a website notification' : usePush ? ' as a website notification' : ''}. You can't
            take it back once it's sent.
          </>
        }
        confirmLabel="Send now"
        cancelLabel="Go back"
        onConfirm={send}
      >
        <p className="break-words rounded-control bg-muted p-3 text-sm text-foreground">{toWhatsAppParam(trimmed)}</p>
      </ConfirmDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TemplateStatusCard({
  template,
  templates,
}: {
  template: AnnouncementTemplateRow | null;
  templates: AnnouncementTemplateRow[];
}) {
  const [busy, setBusy] = useState<'create' | 'sync' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = String(template?.status || '').toUpperCase();

  const create = async () => {
    setBusy('create');
    setError(null);
    try {
      const name = nextAnnouncementName(templates);
      await whatsappAdminApi.createTemplate(announcementTemplateDraft(name));
      toast.success('Template sent to Meta for review');
    } catch (err) {
      setError(err instanceof WhatsAppApiError ? err.message : 'Could not create the template.');
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy('sync');
    setError(null);
    try {
      await whatsappAdminApi.listTemplates(true);
    } catch (err) {
      setError(err instanceof WhatsAppApiError ? err.message : 'Could not check with Meta.');
    } finally {
      setBusy(null);
    }
  };

  let tone: 'info' | 'success' | 'danger' | 'warning' = 'info';
  let icon = Megaphone;
  let title = 'One-time setup: create the WhatsApp announcement template';
  let text = 'WhatsApp only allows messages to customers through a template that Meta has approved. Click the button once. Meta usually approves it within minutes, sometimes up to 24 hours.';
  let action: 'create' | 'sync' | null = 'create';

  if (template && (status === 'APPROVED' || !template.status)) {
    tone = 'success';
    icon = CheckCircle2;
    title = 'WhatsApp is ready';
    text = `Announcements use the approved template "${template.name}".`;
    action = null;
  } else if (template && (status === 'PENDING' || status === 'IN_APPEAL')) {
    tone = 'warning';
    icon = Clock;
    title = 'Waiting for Meta to approve the template';
    text = 'This usually takes a few minutes and can take up to 24 hours. Check again later.';
    action = 'sync';
  } else if (template && status === 'REJECTED') {
    tone = 'danger';
    icon = XCircle;
    title = 'Meta rejected the template';
    text = `${template.rejectedReason ? `Reason: ${template.rejectedReason}. ` : ''}Submit it again under a new name. If it is rejected twice, ask your developer.`;
  } else if (template) {
    tone = 'warning';
    title = `Template status: ${status.replace(/_/g, ' ').toLowerCase()}`;
    text = 'Meta has paused or disabled it. Check WhatsApp Manager, or submit a new version.';
  }

  return (
    <div>
      <Notice
        tone={tone}
        icon={icon}
        title={title}
        action={
          action || error ? (
            <>
              {error && (
                <p role="alert" className="w-full text-xs font-medium text-status-danger-fg">
                  {error}
                </p>
              )}
              {action === 'create' && (
                <Button type="button" size="sm" onClick={create} disabled={!!busy}>
                  {busy === 'create' ? <Spinner /> : <Megaphone aria-hidden="true" />}
                  {template ? 'Submit a new version' : 'Create announcement template'}
                </Button>
              )}
              {action && (
                <Button type="button" variant="outline" size="sm" onClick={sync} disabled={!!busy}>
                  {busy === 'sync' ? <Spinner /> : <RefreshCw aria-hidden="true" />}
                  Check status with Meta
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {text}
      </Notice>
    </div>
  );
}

const optionClass = (checked: boolean) =>
  cn(
    'flex min-h-11 cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors duration-hover has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
    checked ? 'border-primary bg-primary/10' : 'border-border hover:border-foreground/30',
  );

function AudienceOption({
  checked,
  onSelect,
  title,
  help,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  help: string;
}) {
  return (
    <label className={optionClass(checked)}>
      <input type="radio" name="announcement-audience" checked={checked} onChange={onSelect} className="mt-1 size-4 accent-primary" />
      <span>
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Users aria-hidden="true" className="size-3.5" /> {title}
        </span>
        <span className="block text-xs text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}

function ChannelCheck({
  checked,
  onChange,
  icon,
  title,
  help,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: ReactNode;
  title: string;
  help: string;
}) {
  return (
    <label className={optionClass(checked)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-4 accent-primary" />
      <span>
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {icon} {title}
        </span>
        <span className="block text-xs text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}

function CustomerPicker({
  customers,
  optedOut,
  selected,
  onChange,
}: {
  customers: CustomerRow[] | null;
  optedOut: Set<string>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [term, setTerm] = useState('');
  const shown = useMemo(() => {
    if (!customers) return [];
    const t = term.trim().toLowerCase();
    if (!t) return customers;
    const digits = t.replace(/\D/g, '');
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(t) ||
        c.email.toLowerCase().includes(t) ||
        (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)),
    );
  }, [customers, term]);

  const toggle = (uid: string) => {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    onChange(next);
  };
  const allShownSelected = shown.length > 0 && shown.every((c) => selected.has(c.uid));
  const toggleShown = () => {
    const next = new Set(selected);
    shown.forEach((c) => (allShownSelected ? next.delete(c.uid) : next.add(c.uid)));
    onChange(next);
  };

  if (!customers) {
    return (
      <div aria-busy="true" className="space-y-2">
        <span className="sr-only" role="status">Loading customers</span>
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by name, email or phone"
          aria-label="Search customers"
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/80">
        <span className="tabular-nums">
          {selected.size} chosen · {shown.length} shown
        </span>
        <span className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={toggleShown} disabled={shown.length === 0} className="h-8 px-2 text-xs text-primary">
            {allShownSelected ? 'Unselect shown' : 'Select all shown'}
          </Button>
          {selected.size > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(new Set())} className="h-8 px-2 text-xs text-primary">
              Clear
            </Button>
          )}
        </span>
      </div>
      <ul className="max-h-80 divide-y divide-border overflow-auto rounded-card border border-border">
        {shown.length === 0 && (
          <li className="p-4 text-center text-xs text-muted-foreground">No customers match "{term}".</li>
        )}
        {shown.map((c) => {
          const stopped = !!c.waNumber && optedOut.has(c.waNumber);
          return (
            <li key={c.uid}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 transition-colors duration-hover hover:bg-muted/60">
                <input
                  type="checkbox"
                  checked={selected.has(c.uid)}
                  onChange={() => toggle(c.uid)}
                  className="size-4 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {c.name || c.email || 'Unnamed customer'}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[c.phone, c.name ? c.email : ''].filter(Boolean).join(' · ') || 'No contact details'}
                  </span>
                </span>
                {!c.waNumber && <StatusBadge tone="neutral" label="No WhatsApp number" className="h-5 px-1.5 text-[11px]" />}
                {stopped && <StatusBadge tone="danger" label="Replied STOP" className="h-5 px-1.5 text-[11px]" />}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ResultBox({ result }: { result: SendResult }) {
  if (!result.ok) {
    return (
      <Notice tone="danger" compact>
        <span className="font-medium">{result.error || 'Send failed.'}</span>
      </Notice>
    );
  }
  const wa = result.whatsapp;
  const skipped = wa?.skipped;
  const skippedTotal = skipped ? skipped.noPhone + skipped.invalidPhone + skipped.optedOut + skipped.duplicate : 0;
  const firstError = wa?.failures?.[0]?.error;
  return (
    <Notice tone="success" title="Sent">
      <div className="space-y-1 text-xs">
        {wa && (
          <p>
            WhatsApp: {wa.successCount ?? 0} accepted by Meta
            {wa.failureCount ? `, ${wa.failureCount} failed` : ''}
            {skippedTotal ? `, ${skippedTotal} skipped (no number, replied STOP or duplicate)` : ''}.
            {firstError && ` First error: ${firstError}`}
          </p>
        )}
        {result.push && (
          <p>
            Website notification: {result.push.successCount ?? 0} delivered
            {result.push.failureCount ? `, ${result.push.failureCount} failed` : ''}.
          </p>
        )}
        <p className="text-muted-foreground">Each message is saved in Admin → WhatsApp under that customer, with delivery ticks, and shows there when they reply.</p>
      </div>
    </Notice>
  );
}
