/**
 * Marketing Center
 *
 * Tabbed admin console for orchestrating customer communications across
 * web push (FCM) and WhatsApp Cloud API. Audience resolution and delivery
 * happen server-side via /api/broadcast which writes auditable records to
 * the `broadcastCampaigns` collection.
 *
 * Tabs:
 *  - Announcement : type a message, send it to all or chosen customers
 *                   through one approved WhatsApp template (and/or push).
 *  - Custom       : pick audience + channels + any template, fire a campaign.
 *  - History      : review past campaigns and per-channel results.
 *  - Templates    : create WhatsApp templates in Meta, sync their approval status,
 *                   delete them, or add metadata by hand as a fallback.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { IconButton } from '@/components/ui/icon-button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { TableSkeleton } from '@/components/skeletons';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { DELIVERY_PARTNERS_ENABLED } from '@/config/features';
import { formatDateTime, plural } from '@/lib/format';
import {
  Bell,
  Send,
  Users,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  Search,
  Plus,
  X,
  Clock,
  History as HistoryIcon,
  FileText,
  Megaphone,
} from 'lucide-react';
import { toast } from 'sonner';
import TemplateCreator from '@/components/admin/whatsapp/TemplateCreator';
import TemplateLibrary, { TemplateStatusBadge } from '@/components/admin/whatsapp/TemplateLibrary';
import { isSendableTemplate, statusStyle } from '@/components/admin/whatsapp/templateRules';
import AnnouncementComposer from '@/components/admin/marketing/AnnouncementComposer';
import { isCustomerRole } from '@/components/admin/marketing/announcement';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AudienceKind = 'all' | 'customers' | 'delivery' | 'pushEnabled' | 'selected';

interface UserRow {
  uid: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: 'utility' | 'marketing' | 'authentication';
  paramLabels: string[];
  description?: string;
  status?: string | null;
  rejectedReason?: string | null;
  source?: string | null;
  metaId?: string | null;
  bodyText?: string | null;
  headerFormat?: string | null;
  headerImageUrl?: string | null;
}

interface CampaignRow {
  id: string;
  audience: AudienceKind;
  channels: { push?: boolean; whatsapp?: boolean };
  push?: { title?: string; body?: string } | null;
  whatsapp?: { template?: string; params?: string[] } | null;
  kind?: 'announcement' | 'custom';
  status: 'sending' | 'completed' | 'failed';
  recipientCount?: number;
  pushResult?: { successCount?: number; failureCount?: number; invalidTokens?: string[] };
  whatsappResult?: { successCount?: number; failureCount?: number };
  createdAt?: Timestamp;
  finishedAt?: Timestamp;
  actorEmail?: string;
  error?: string;
}

// The delivery-partner audience only exists while that feature is switched on.
const AUDIENCE_OPTIONS: { id: AudienceKind; label: string; help: string }[] = [
  {
    id: 'all',
    label: 'All accounts',
    help: DELIVERY_PARTNERS_ENABLED ? 'Every customer and delivery partner with a profile' : 'Everyone with a profile',
  },
  { id: 'customers', label: 'Customers only', help: 'Every shopper account (not admins or delivery)' },
  ...(DELIVERY_PARTNERS_ENABLED
    ? [{ id: 'delivery' as AudienceKind, label: 'Delivery partners', help: 'Everyone with a delivery partner account' }]
    : []),
  { id: 'pushEnabled', label: 'Push-enabled devices', help: 'Customers with notifications on' },
  { id: 'selected', label: 'Selected customers', help: 'Pick specific customers below' },
];

const formatDate = (ts?: Timestamp): string => {
  if (!ts?.toDate) return 'Unknown';
  return formatDateTime(ts.toDate());
};

/** One field look for this page (native inputs, selects and textareas). */
const MC_INPUT =
  'w-full rounded-control border border-input bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground transition-colors duration-hover focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:text-sm';
const MC_COUNTER = 'pointer-events-none absolute bottom-1.5 right-2 text-[11px] tabular-nums text-muted-foreground';

const getErrorMessage = (err: unknown, fallback = 'Network error') =>
  err instanceof Error ? err.message : fallback;

// ---------------------------------------------------------------------------
const AdminNotifications = () => {
  const { user, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'announcement' | 'compose' | 'history' | 'templates'>('announcement');

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'whatsappTemplates'), orderBy('name')),
      (snap) => {
        setTemplates(
          snap.docs.map((d) => ({
            id: d.id,
            name: (d.data().name as string) || d.id,
            language: (d.data().language as string) || 'en_US',
            category: ((d.data().category as string) || 'utility') as WhatsAppTemplate['category'],
            paramLabels: (d.data().paramLabels as string[]) || [],
            description: d.data().description as string | undefined,
            status: (d.data().status as string | undefined) ?? null,
            rejectedReason: (d.data().rejectedReason as string | undefined) ?? null,
            source: (d.data().source as string | undefined) ?? null,
            metaId: (d.data().metaId as string | undefined) ?? null,
            bodyText: (d.data().bodyText as string | undefined) ?? null,
            headerFormat: (d.data().headerFormat as string | undefined) ?? null,
            headerImageUrl: (d.data().headerImageUrl as string | undefined) ?? null,
          })),
        );
      },
      (err) => console.warn('[marketing] templates load failed', err),
    );
    return () => unsub();
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AdminPageHeader
        title="Marketing"
        description="Send announcements and offers to your customers on WhatsApp and as website notifications."
        className="pb-0"
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="announcement" className="gap-2">
            <Megaphone aria-hidden="true" className="h-3.5 w-3.5" /> Announcement
          </TabsTrigger>
          <TabsTrigger value="compose" className="gap-2">
            <Send aria-hidden="true" className="h-3.5 w-3.5" /> Custom
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <HistoryIcon aria-hidden="true" className="h-3.5 w-3.5" /> History
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileText aria-hidden="true" className="h-3.5 w-3.5" /> Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="announcement" className="mt-4">
          <AnnouncementComposer templates={templates} />
        </TabsContent>
        <TabsContent value="compose" className="mt-4">
          <ComposeTab
            templates={templates}
            user={user}
            actorUid={user?.uid || null}
            actorEmail={userProfile?.email || user?.email || null}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab templates={templates} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminNotifications;

// ===========================================================================
// Compose tab
// ===========================================================================
const ComposeTab = ({
  templates,
  user,
  actorUid,
  actorEmail,
}: {
  templates: WhatsAppTemplate[];
  user: ReturnType<typeof useAuth>['user'];
  actorUid: string | null;
  actorEmail: string | null;
}) => {
  const [audience, setAudience] = useState<AudienceKind>('customers');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [waEnabled, setWaEnabled] = useState(false);

  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushImage, setPushImage] = useState('');
  const [pushUrl, setPushUrl] = useState('');

  const [templateId, setTemplateId] = useState<string>('');
  const [templateParams, setTemplateParams] = useState<string[]>([]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId],
  );

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateParams([]);
      return;
    }
    setTemplateParams((prev) => {
      const next = [...prev];
      while (next.length < selectedTemplate.paramLabels.length) next.push('');
      next.length = selectedTemplate.paramLabels.length;
      return next;
    });
  }, [selectedTemplate]);

  const [selectedUsers, setSelectedUsers] = useState<UserRow[]>([]);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    campaignId?: string;
    recipientCount?: number;
    push?: { successCount?: number; failureCount?: number; invalidTokens?: string[] };
    whatsapp?: { successCount?: number; failureCount?: number; notSent?: number };
    error?: string;
    warning?: string;
  } | null>(null);

  const handleSend = async () => {
    if (!pushEnabled && !waEnabled) {
      toast.error('Pick at least one channel.');
      return;
    }
    if (audience === 'selected' && selectedUsers.length === 0) {
      toast.error('Add at least one customer to the selected list.');
      return;
    }
    if (pushEnabled && (!pushTitle.trim() || !pushBody.trim())) {
      toast.error('Push title and body are required.');
      return;
    }
    if (waEnabled && !selectedTemplate) {
      toast.error('Pick a WhatsApp template.');
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) {
        toast.error('Please sign in again before sending a campaign.');
        setSending(false);
        return;
      }
      const resp = await fetch('/api/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          audience,
          selectedUids: audience === 'selected' ? selectedUsers.map((u) => u.uid) : undefined,
          channels: { push: pushEnabled, whatsapp: waEnabled },
          push: pushEnabled
            ? {
                title: pushTitle.trim(),
                body: pushBody.trim(),
                image: pushImage.trim() || undefined,
                url: pushUrl.trim() || undefined,
              }
            : undefined,
          whatsapp:
            waEnabled && selectedTemplate
              ? {
                  template: selectedTemplate.name,
                  language: selectedTemplate.language,
                  params: templateParams,
                }
              : undefined,
          actorUid,
          actorEmail,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        setResult({ ok: false, error: data?.error || `HTTP ${resp.status}` });
        toast.error(data?.error || 'Broadcast failed');
      } else {
        setResult({ ok: true, ...data });
        if (data.warning) toast.warning(data.warning);
        else toast.success(`Campaign sent to ${plural(data.recipientCount ?? 0, 'recipient')}`);
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setResult({ ok: false, error: message });
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <section className="rounded-card border border-border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Channels</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ChannelToggle
              icon={<Bell className="h-4 w-4" />}
              label="Web push"
              description="Send via Firebase Cloud Messaging to subscribed browsers."
              enabled={pushEnabled}
              onToggle={() => setPushEnabled((v) => !v)}
              accent="amber"
            />
            <ChannelToggle
              icon={<MessageCircle className="h-4 w-4" />}
              label="WhatsApp"
              description="Send an approved Meta Cloud API template."
              enabled={waEnabled}
              onToggle={() => setWaEnabled((v) => !v)}
              accent="emerald"
            />
          </div>
        </section>

        {pushEnabled && (
          <section className="space-y-3 rounded-card border border-border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Bell aria-hidden="true" className="h-4 w-4 text-muted-foreground" /> Push content
            </h2>
            <Field label="Title" required>
              <input
                value={pushTitle}
                onChange={(e) => setPushTitle(e.target.value)}
                maxLength={80}
                placeholder="e.g. New collection launched"
                className={MC_INPUT}
              />
              <span className={MC_COUNTER}>{pushTitle.length}/80</span>
            </Field>
            <Field label="Body" required>
              <textarea
                value={pushBody}
                onChange={(e) => setPushBody(e.target.value)}
                maxLength={240}
                rows={3}
                placeholder="Tap to see what is new"
                className={`${MC_INPUT} resize-none`}
              />
              <span className={MC_COUNTER}>{pushBody.length}/240</span>
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Image URL (optional)">
                <input
                  type="url"
                  value={pushImage}
                  onChange={(e) => setPushImage(e.target.value)}
                  placeholder="https://…"
                  className={MC_INPUT}
                />
              </Field>
              <Field label="Click URL (optional)">
                <input
                  type="text"
                  value={pushUrl}
                  onChange={(e) => setPushUrl(e.target.value)}
                  placeholder="/category/hair-care"
                  className={MC_INPUT}
                />
              </Field>
            </div>
          </section>
        )}

        {waEnabled && (
          <section className="space-y-3 rounded-card border border-border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MessageCircle aria-hidden="true" className="h-4 w-4 text-muted-foreground" /> WhatsApp template
            </h2>
            {templates.length === 0 ? (
              <Notice tone="info" compact>
                No templates registered yet. Add one from the <strong>Templates</strong> tab.
                The template name and language must already be approved in Meta WhatsApp Manager.
              </Notice>
            ) : (
              <Field label="Template" required>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className={MC_INPUT}
                >
                  <option value="">Pick a template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id} disabled={!isSendableTemplate(t.status)}>
                      {t.name} · {t.language} · {t.category}
                      {t.status && !isSendableTemplate(t.status) ? ` (${statusStyle(t.status).label})` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {selectedTemplate && (
              <div className="space-y-3">
                {selectedTemplate.description && (
                  <p className="text-xs text-foreground/80">{selectedTemplate.description}</p>
                )}
                {selectedTemplate.paramLabels.length === 0 ? (
                  <p className="text-xs text-muted-foreground">This template takes no parameters.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedTemplate.paramLabels.map((label, idx) => (
                      <Field
                        key={idx}
                        label={`{{${idx + 1}}}: ${label}${
                          idx === 0 ? ' (auto-personalised per customer)' : ''
                        }`}
                      >
                        <input
                          value={templateParams[idx] || ''}
                          onChange={(e) => {
                            const next = [...templateParams];
                            next[idx] = e.target.value;
                            setTemplateParams(next);
                          }}
                          placeholder={
                            idx === 0
                              ? 'Default first name fallback'
                              : 'Value for every recipient'
                          }
                          className={MC_INPUT}
                        />
                      </Field>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section className="rounded-card border border-border bg-card p-4 shadow-sm sm:p-5">
          <Button onClick={handleSend} disabled={sending}>
            {sending ? <Spinner /> : <Send aria-hidden="true" />}
            {sending ? 'Sending' : 'Send broadcast'}
          </Button>
          {result && (
            <Notice
              tone={!result.ok ? 'danger' : result.warning ? 'warning' : 'success'}
              className="mt-3"
              title={result.ok ? `Broadcast sent to ${plural(result.recipientCount ?? 0, 'recipient')}` : result.error || 'Send failed'}
            >
              {result.ok && (
                <div className="space-y-0.5 text-xs tabular-nums">
                  {result.warning && <p className="font-medium">{result.warning}</p>}
                  {result.push && (
                    <p>
                      Push: {result.push.successCount} delivered · {result.push.failureCount} failed ·{' '}
                      {result.push.invalidTokens?.length || 0} invalid tokens
                    </p>
                  )}
                  {result.whatsapp && (
                    <p>
                      WhatsApp: {result.whatsapp.successCount} delivered · {result.whatsapp.failureCount} failed
                    </p>
                  )}
                  <p className="text-muted-foreground">Campaign ID: {result.campaignId}</p>
                </div>
              )}
            </Notice>
          )}
        </section>
      </div>

      <aside aria-label="Audience" className="space-y-6">
        <section className="rounded-card border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Users aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <h2 id="mc-audience" className="text-sm font-semibold text-foreground">Audience</h2>
          </div>
          <div className="space-y-1" role="radiogroup" aria-labelledby="mc-audience">
            {AUDIENCE_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-control px-2 py-1.5 text-sm text-foreground/80 transition-colors duration-hover hover:bg-muted/60"
              >
                <input
                  type="radio"
                  name="audience"
                  value={opt.id}
                  checked={audience === opt.id}
                  onChange={() => setAudience(opt.id)}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="font-medium text-foreground">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">{opt.help}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {audience === 'selected' && (
          <SelectedCustomersPicker selected={selectedUsers} onChange={setSelectedUsers} />
        )}

        <section className="rounded-card border border-border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Reminder</h2>
          <ul className="text-xs text-foreground/80 space-y-1 list-disc pl-4">
            <li>WhatsApp templates require Meta approval before use.</li>
            <li>Push delivery only reaches customers who granted notification permission.</li>
            <li>Selected audience uses the picker above.</li>
          </ul>
        </section>
      </aside>

    </div>
  );
};

// ===========================================================================
// Selected customers picker
// ===========================================================================
const SelectedCustomersPicker = ({
  selected,
  onChange,
}: {
  selected: UserRow[];
  onChange: (next: UserRow[]) => void;
}) => {
  const [term, setTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserRow[]>([]);
  // Customers are read once per visit; later searches filter that list in memory.
  const customersRef = useRef<UserRow[] | null>(null);

  const loadCustomers = async () => {
    if (customersRef.current) return customersRef.current;
    // Shoppers are saved with role 'user' (older ones 'customer' or none).
    const snap = await getDocs(collection(db, 'users'));
    const rows: UserRow[] = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      if (!isCustomerRole(data.role)) return;
      rows.push({
        uid: d.id,
        name: (data.fullName as string) || (data.name as string),
        email: data.email as string | undefined,
        phone: (data.whatsappNumber as string) || (data.phone as string) || (data.mobile as string),
        role: data.role as string | undefined,
      });
    });
    customersRef.current = rows;
    return rows;
  };

  const runSearch = async () => {
    const t = term.trim().toLowerCase();
    if (!t) return;
    setSearching(true);
    try {
      const matches = (await loadCustomers()).filter((u) =>
        [u.name, u.email, u.phone].some((v) => String(v || '').toLowerCase().includes(t)),
      );
      setResults(matches.slice(0, 25));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load customers'));
    } finally {
      setSearching(false);
    }
  };

  const addUser = (u: UserRow) => {
    if (selected.find((s) => s.uid === u.uid)) return;
    onChange([...selected, u]);
  };

  const removeUser = (uid: string) => onChange(selected.filter((s) => s.uid !== uid));

  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Pick customers</h2>
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search customers"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="Search by name, email or phone"
            className={`${MC_INPUT} pl-8`}
          />
        </div>
        <Button variant="outline" size="sm" className="h-auto" onClick={runSearch} disabled={searching || !term.trim()}>
          {searching && <Spinner />}
          Search
        </Button>
      </div>

      {results.length > 0 && (
        <div className="mb-3 max-h-44 overflow-auto rounded-card border border-border">
          {results.map((r) => (
            <button
              key={r.uid}
              type="button"
              onClick={() => addUser(r)}
              aria-label={`Add ${r.name || r.email || 'customer'}`}
              className="focus-inset flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-xs transition-colors duration-hover last:border-b-0 hover:bg-muted/60"
            >
              <span>
                <span className="block font-medium text-foreground">{r.name || r.email || r.uid}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {r.email} {r.phone ? `· ${r.phone}` : ''}
                </span>
              </span>
              <Plus aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      <div className="mb-1 text-xs tabular-nums text-muted-foreground">{selected.length} selected</div>
      <div className="flex max-h-44 flex-wrap gap-1.5 overflow-auto">
        {selected.map((s) => (
          <span
            key={s.uid}
            className="inline-flex items-center gap-1 rounded-chip border border-border bg-muted py-0.5 pl-2 pr-0.5 text-xs text-foreground"
          >
            {s.name || s.email || s.uid.slice(0, 6)}
            <IconButton label={`Remove ${s.name || s.email || 'customer'}`} size="sm" className="h-6 w-6 [&_svg]:size-3.5" onClick={() => removeUser(s.uid)}>
              <X />
            </IconButton>
          </span>
        ))}
      </div>
    </section>
  );
};

// ===========================================================================
// History tab
// ===========================================================================
const HistoryTab = () => {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'broadcastCampaigns'), orderBy('createdAt', 'desc')),
      (snap) => {
        setRows(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<CampaignRow, 'id'>),
          })),
        );
        setLoading(false);
      },
      (err) => {
        console.warn('[marketing] history load failed', err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <TableSkeleton rows={5} cols={6} label="Loading campaign history" />
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No campaigns yet. Send your first announcement from the <strong>Announcement</strong> tab.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">Sent</th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">Audience</th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">Channels</th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">Content</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Recipients</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-medium">Push sent / failed</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-medium">WhatsApp sent / failed</th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="transition-colors duration-hover hover:bg-muted/60">
              <td className="whitespace-nowrap px-4 py-2 text-foreground/80">
                <div>{formatDate(r.createdAt)}</div>
                <div className="text-[11px] text-muted-foreground">{r.actorEmail || ''}</div>
              </td>
              <td className="px-4 py-2 text-foreground/80">{r.audience}</td>
              <td className="px-4 py-2 text-foreground/80">
                {[r.channels?.push && 'Push', r.channels?.whatsapp && 'WA']
                  .filter(Boolean)
                  .join(' + ') || 'None'}
              </td>
              <td className="px-4 py-2 text-foreground/80 max-w-xs">
                <div className="truncate font-medium">
                  {r.kind === 'announcement'
                    ? r.whatsapp?.params?.[1] || r.push?.body || 'Announcement'
                    : r.push?.title || r.whatsapp?.template || 'None'}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">{r.kind === 'announcement' ? '' : r.push?.body || ''}</div>
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-foreground/80">{r.recipientCount ?? 'n/a'}</td>
              <td className="px-4 py-2 text-right tabular-nums text-foreground/80">
                {r.pushResult
                  ? `${r.pushResult.successCount ?? 0} / ${r.pushResult.failureCount ?? 0}`
                  : 'n/a'}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-foreground/80">
                {r.whatsappResult
                  ? `${r.whatsappResult.successCount ?? 0} / ${r.whatsappResult.failureCount ?? 0}`
                  : 'n/a'}
              </td>
              <td className="px-4 py-2">
                <StatusPill status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const StatusPill = ({ status }: { status: CampaignRow['status'] }) => {
  const map = {
    sending: { tone: 'info', icon: Clock, label: 'Sending' },
    completed: { tone: 'success', icon: CheckCircle2, label: 'Completed' },
    failed: { tone: 'danger', icon: AlertCircle, label: 'Failed' },
  } as const;
  const m = map[status] || map.sending;
  return <StatusBadge tone={m.tone} icon={m.icon} label={m.label} />;
};

// ===========================================================================
// Templates tab
// ===========================================================================
const TemplatesTab = ({ templates }: { templates: WhatsAppTemplate[] }) => {
  const [view, setView] = useState<'library' | 'create' | 'manual'>('library');
  const views = [
    { id: 'library', label: 'Library' },
    { id: 'create', label: 'Create new' },
    { id: 'manual', label: 'Add manually' },
  ] as const;
  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        value={view}
        onValueChange={(v) => v && setView(v as typeof view)}
        aria-label="Templates"
        className="max-w-full justify-start overflow-x-auto"
      >
        {views.map((v) => (
          <ToggleGroupItem key={v.id} value={v.id} className="h-9 flex-none px-3 text-sm sm:px-4">
            {v.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {view === 'library' && <TemplateLibrary templates={templates} />}
      {view === 'create' && <TemplateCreator onCreated={() => setView('library')} />}
      {view === 'manual' && <ManualTemplateForm templates={templates} />}
    </div>
  );
};

/** Fallback: type in metadata for a template that already exists in Meta. */
const ManualTemplateForm = ({ templates }: { templates: WhatsAppTemplate[] }) => {
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en_US');
  const [category, setCategory] = useState<WhatsAppTemplate['category']>('utility');
  const [paramLabelsRaw, setParamLabelsRaw] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Template name is required.');
      return;
    }
    setSaving(true);
    try {
      const id = trimmed; // template names are unique within a Meta WABA
      await setDoc(doc(db, 'whatsappTemplates', id), {
        name: trimmed,
        language: language.trim() || 'en_US',
        category,
        paramLabels: paramLabelsRaw
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        description: description.trim() || null,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Saved ${trimmed}`);
      setName('');
      setParamLabelsRaw('');
      setDescription('');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Could not save template'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="space-y-3 rounded-card border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Add template details by hand</h2>
        <p className="text-xs text-foreground/80">
          Use this only for a template that is already approved in WhatsApp Manager and does not
          show up after Sync from Meta. Type the exact name, language and variable names.
        </p>
        <Field label="Template name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="order_status_update_v1"
            className={MC_INPUT}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Language code">
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="en_US"
              className={MC_INPUT}
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as WhatsAppTemplate['category'])}
              className={MC_INPUT}
            >
              <option value="utility">Utility</option>
              <option value="marketing">Marketing</option>
              <option value="authentication">Authentication</option>
            </select>
          </Field>
        </div>
        <Field label="Parameter labels (one per line, in {{1}} {{2}} order)">
          <textarea
            value={paramLabelsRaw}
            onChange={(e) => setParamLabelsRaw(e.target.value)}
            rows={4}
            placeholder={'Customer first name\nOrder short id\nStatus phrase\nTracking link'}
            className={`${MC_INPUT} resize-none`}
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What this template is used for"
            className={`${MC_INPUT} resize-none`}
          />
        </Field>
        <Button onClick={handleAdd} disabled={saving || !name.trim()}>
          {saving ? <Spinner /> : <Plus aria-hidden="true" />}
          Save template
        </Button>
      </section>

      <section className="rounded-card border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Registered templates</h2>
        {templates.length === 0 ? (
          <p className="text-xs text-muted-foreground">No templates yet.</p>
        ) : (
          <ul className="space-y-2 max-h-[28rem] overflow-auto">
            {templates.map((t) => (
              <li key={t.id} className="space-y-1 rounded-card border border-border p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex flex-wrap items-center gap-2 break-all font-semibold text-foreground">
                    {t.name} <TemplateStatusBadge status={t.status} />
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t.language} · {t.category}
                  </span>
                </div>
                {t.description && <p className="text-foreground/80">{t.description}</p>}
                {t.paramLabels.length > 0 && (
                  <ul className="text-muted-foreground list-decimal pl-4">
                    {t.paramLabels.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

// ===========================================================================
// Tiny presentational helpers
// ===========================================================================
const Field = ({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-medium text-foreground/80">
      {label} {required && <span aria-hidden="true" className="text-status-danger-fg">*</span>}
    </span>
    <div className="relative">{children}</div>
  </label>
);

const ChannelToggle = ({
  icon,
  label,
  description,
  enabled,
  onToggle,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  accent: 'amber' | 'emerald';
}) => {
  void accent;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      className={`rounded-card border p-3 text-left transition-[background-color,border-color,color,transform] duration-press ease-out active:scale-[0.97] ${
        enabled
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-card text-foreground/80 hover:border-foreground/30'
      }`}
    >
      <span className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          {icon} {label}
        </span>
        <span
          className={`rounded-chip px-2 py-0.5 text-[11px] font-semibold ${
            enabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          {enabled ? 'On' : 'Off'}
        </span>
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
    </button>
  );
};
