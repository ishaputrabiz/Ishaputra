/**
 * Marketing Center
 *
 * Tabbed admin console for orchestrating customer communications across
 * web push (FCM) and WhatsApp Cloud API. Audience resolution and delivery
 * happen server-side via /api/broadcast which writes auditable records to
 * the `broadcastCampaigns` collection.
 *
 * Tabs:
 *  - Compose   : pick audience + channels + content, fire a campaign.
 *  - History   : review past campaigns and per-channel results.
 *  - Templates : manage approved WhatsApp template metadata for the picker.
 */
import { useEffect, useMemo, useState } from 'react';
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
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bell,
  Send,
  Loader2,
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
} from 'lucide-react';
import { toast } from 'sonner';

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
}

interface CampaignRow {
  id: string;
  audience: AudienceKind;
  channels: { push?: boolean; whatsapp?: boolean };
  push?: { title?: string; body?: string } | null;
  whatsapp?: { template?: string } | null;
  status: 'sending' | 'completed' | 'failed';
  recipientCount?: number;
  pushResult?: { successCount?: number; failureCount?: number; invalidTokens?: string[] };
  whatsappResult?: { successCount?: number; failureCount?: number };
  createdAt?: Timestamp;
  finishedAt?: Timestamp;
  actorEmail?: string;
  error?: string;
}

const AUDIENCE_OPTIONS: { id: AudienceKind; label: string; help: string }[] = [
  { id: 'all', label: 'All accounts', help: 'Every customer + delivery partner with a profile' },
  { id: 'customers', label: 'Customers only', help: 'Role = customer' },
  { id: 'delivery', label: 'Delivery partners', help: 'Role = delivery' },
  { id: 'pushEnabled', label: 'Push-enabled devices', help: 'Anyone with at least one FCM token' },
  { id: 'selected', label: 'Selected customers', help: 'Pick specific users below' },
];

const formatDate = (ts?: Timestamp): string => {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const getErrorMessage = (err: unknown, fallback = 'Network error') =>
  err instanceof Error ? err.message : fallback;

// ---------------------------------------------------------------------------
const AdminNotifications = () => {
  const { user, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'compose' | 'history' | 'templates'>('compose');

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
          })),
        );
      },
      (err) => console.warn('[marketing] templates load failed', err),
    );
    return () => unsub();
  }, []);

  return (
    <div className="space-y-6">
      <header className="bg-gradient-to-br from-amber-50 via-white to-orange-50/30 border border-amber-200/40 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-100">
            <Bell className="h-6 w-6 text-amber-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Marketing Center</h1>
            <p className="text-sm text-gray-600">
              Run web push and WhatsApp campaigns. Audience resolution and delivery happen
              server-side via the broadcast endpoint.
            </p>
          </div>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="bg-white border border-gray-200 h-11">
          <TabsTrigger value="compose" className="gap-2">
            <Send className="h-3.5 w-3.5" /> Compose
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <HistoryIcon className="h-3.5 w-3.5" /> History
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="h-3.5 w-3.5" /> Templates
          </TabsTrigger>
        </TabsList>

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
    whatsapp?: { successCount?: number; failureCount?: number };
    error?: string;
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
        toast.success(`Campaign sent to ${data.recipientCount} recipient(s).`);
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
        <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Channels</h2>
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
          <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-600" /> Push content
            </h2>
            <Field label="Title" required>
              <input
                value={pushTitle}
                onChange={(e) => setPushTitle(e.target.value)}
                maxLength={80}
                placeholder="e.g. New collection launched"
                className="mc-input"
              />
              <span className="mc-counter">{pushTitle.length}/80</span>
            </Field>
            <Field label="Body" required>
              <textarea
                value={pushBody}
                onChange={(e) => setPushBody(e.target.value)}
                maxLength={240}
                rows={3}
                placeholder="Tap to explore the latest pieces…"
                className="mc-input resize-none"
              />
              <span className="mc-counter">{pushBody.length}/240</span>
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Image URL (optional)">
                <input
                  type="url"
                  value={pushImage}
                  onChange={(e) => setPushImage(e.target.value)}
                  placeholder="https://…"
                  className="mc-input"
                />
              </Field>
              <Field label="Click URL (optional)">
                <input
                  type="text"
                  value={pushUrl}
                  onChange={(e) => setPushUrl(e.target.value)}
                  placeholder="/category/jewellery"
                  className="mc-input"
                />
              </Field>
            </div>
          </section>
        )}

        {waEnabled && (
          <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp template
            </h2>
            {templates.length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No templates registered yet. Add one from the <strong>Templates</strong> tab —
                the template name and language must already be approved in Meta WhatsApp Manager.
              </p>
            ) : (
              <Field label="Template" required>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="mc-input"
                >
                  <option value="">Pick a template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.language} · {t.category}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {selectedTemplate && (
              <div className="space-y-3">
                {selectedTemplate.description && (
                  <p className="text-xs text-gray-600">{selectedTemplate.description}</p>
                )}
                {selectedTemplate.paramLabels.length === 0 ? (
                  <p className="text-xs text-gray-500">This template takes no parameters.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedTemplate.paramLabels.map((label, idx) => (
                      <Field
                        key={idx}
                        label={`{{${idx + 1}}} — ${label}${
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
                          className="mc-input"
                        />
                      </Field>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <button
            onClick={handleSend}
            disabled={sending}
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Send broadcast'}
          </button>
          {result && (
            <div
              className={`mt-3 rounded-lg border p-3 text-sm flex gap-2 items-start ${
                result.ok
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {result.ok ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5" />
              )}
              <div className="flex-1 space-y-0.5">
                {result.ok ? (
                  <>
                    <p className="font-medium">
                      Broadcast sent to {result.recipientCount} recipient(s).
                    </p>
                    {result.push && (
                      <p className="text-xs">
                        Push — delivered: {result.push.successCount} · failed:{' '}
                        {result.push.failureCount} · invalid tokens:{' '}
                        {result.push.invalidTokens?.length || 0}
                      </p>
                    )}
                    {result.whatsapp && (
                      <p className="text-xs">
                        WhatsApp — delivered: {result.whatsapp.successCount} · failed:{' '}
                        {result.whatsapp.failureCount}
                      </p>
                    )}
                    <p className="text-[11px] opacity-70">Campaign ID: {result.campaignId}</p>
                  </>
                ) : (
                  <p className="font-medium">{result.error || 'Send failed.'}</p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-amber-700" />
            <h3 className="font-semibold text-gray-900 text-sm">Audience</h3>
          </div>
          <div className="space-y-2">
            {AUDIENCE_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer"
              >
                <input
                  type="radio"
                  name="audience"
                  value={opt.id}
                  checked={audience === opt.id}
                  onChange={() => setAudience(opt.id)}
                  className="mt-1 accent-amber-600"
                />
                <span>
                  <span className="font-medium">{opt.label}</span>
                  <span className="block text-[11px] text-gray-500">{opt.help}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {audience === 'selected' && (
          <SelectedCustomersPicker selected={selectedUsers} onChange={setSelectedUsers} />
        )}

        <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 text-sm mb-2">Reminder</h3>
          <ul className="text-xs text-gray-600 space-y-1 list-disc pl-4">
            <li>WhatsApp templates require Meta approval before use.</li>
            <li>Push delivery only reaches customers who granted notification permission.</li>
            <li>Selected audience uses the picker above.</li>
          </ul>
        </section>
      </aside>

      {/* Tailwind doesn't support component-scoped classes — declare ours inline. */}
      <style>{`
        .mc-input { width: 100%; padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid #e5e7eb; background: white; font-size: 0.875rem; }
        .mc-input:focus { outline: none; border-color: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,0.15); }
        .mc-counter { position: absolute; right: 0.5rem; bottom: 0.35rem; font-size: 10px; color: #9ca3af; pointer-events: none; }
      `}</style>
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

  const runSearch = async () => {
    const t = term.trim().toLowerCase();
    if (!t) return;
    setSearching(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'customer')));
      const matches: UserRow[] = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        const name = String(data.fullName || data.name || '').toLowerCase();
        const email = String(data.email || '').toLowerCase();
        const phone = String(data.phone || data.mobile || '').toLowerCase();
        if (name.includes(t) || email.includes(t) || phone.includes(t)) {
          matches.push({
            uid: d.id,
            name: (data.fullName as string) || (data.name as string),
            email: data.email as string | undefined,
            phone: (data.phone as string) || (data.mobile as string),
            role: data.role as string | undefined,
          });
        }
      });
      setResults(matches.slice(0, 25));
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
    <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
      <h3 className="font-semibold text-gray-900 text-sm mb-3">Pick customers</h3>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="Search by name, email or phone"
            className="mc-input pl-8"
          />
        </div>
        <button
          onClick={runSearch}
          disabled={searching || !term.trim()}
          className="px-3 rounded-lg bg-gray-900 text-white text-xs font-medium disabled:bg-gray-300"
        >
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="border border-gray-100 rounded-lg max-h-44 overflow-auto mb-3">
          {results.map((r) => (
            <button
              key={r.uid}
              onClick={() => addUser(r)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 flex items-center justify-between border-b last:border-b-0 border-gray-100"
            >
              <span>
                <span className="block font-medium text-gray-900">{r.name || r.email || r.uid}</span>
                <span className="block text-[10px] text-gray-500">
                  {r.email} {r.phone ? `· ${r.phone}` : ''}
                </span>
              </span>
              <Plus className="h-3.5 w-3.5 text-amber-600" />
            </button>
          ))}
        </div>
      )}

      <div className="text-xs text-gray-500 mb-1">{selected.length} selected</div>
      <div className="flex flex-wrap gap-1.5 max-h-44 overflow-auto">
        {selected.map((s) => (
          <span
            key={s.uid}
            className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-full px-2 py-1 text-[11px]"
          >
            {s.name || s.email || s.uid.slice(0, 6)}
            <button onClick={() => removeUser(s.uid)} className="hover:text-red-700">
              <X className="h-3 w-3" />
            </button>
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
      <div className="flex items-center gap-2 text-sm text-gray-500 py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading campaign history…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-sm text-gray-500">
        No campaigns yet. Send your first broadcast from the <strong>Compose</strong> tab.
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-x-auto shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2.5">Sent</th>
            <th className="text-left px-4 py-2.5">Audience</th>
            <th className="text-left px-4 py-2.5">Channels</th>
            <th className="text-left px-4 py-2.5">Content</th>
            <th className="text-right px-4 py-2.5">Recipients</th>
            <th className="text-right px-4 py-2.5">Push ✓ / ✗</th>
            <th className="text-right px-4 py-2.5">WA ✓ / ✗</th>
            <th className="text-left px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-amber-50/30">
              <td className="px-4 py-2 text-gray-700">
                <div>{formatDate(r.createdAt)}</div>
                <div className="text-[10px] text-gray-400">{r.actorEmail || ''}</div>
              </td>
              <td className="px-4 py-2 text-gray-700">{r.audience}</td>
              <td className="px-4 py-2 text-gray-700">
                {[r.channels?.push && 'Push', r.channels?.whatsapp && 'WA']
                  .filter(Boolean)
                  .join(' + ') || '—'}
              </td>
              <td className="px-4 py-2 text-gray-700 max-w-xs">
                <div className="truncate font-medium">
                  {r.push?.title || r.whatsapp?.template || '—'}
                </div>
                <div className="truncate text-[10px] text-gray-500">{r.push?.body || ''}</div>
              </td>
              <td className="px-4 py-2 text-right text-gray-700">{r.recipientCount ?? '—'}</td>
              <td className="px-4 py-2 text-right text-gray-700">
                {r.pushResult
                  ? `${r.pushResult.successCount ?? 0} / ${r.pushResult.failureCount ?? 0}`
                  : '—'}
              </td>
              <td className="px-4 py-2 text-right text-gray-700">
                {r.whatsappResult
                  ? `${r.whatsappResult.successCount ?? 0} / ${r.whatsappResult.failureCount ?? 0}`
                  : '—'}
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
    sending: { cls: 'bg-amber-100 text-amber-800', icon: <Clock className="h-3 w-3" /> },
    completed: {
      cls: 'bg-green-100 text-green-800',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    failed: { cls: 'bg-red-100 text-red-800', icon: <AlertCircle className="h-3 w-3" /> },
  } as const;
  const m = map[status] || map.sending;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${m.cls}`}
    >
      {m.icon} {status}
    </span>
  );
};

// ===========================================================================
// Templates tab
// ===========================================================================
const TemplatesTab = ({ templates }: { templates: WhatsAppTemplate[] }) => {
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
      toast.error(getErrorMessage(err, 'Failed to save template'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Add or update a template</h2>
        <p className="text-xs text-gray-600">
          Register the metadata for an already-approved Meta WhatsApp template so admins can
          pick it from the composer. The template itself must be approved in WhatsApp Manager.
        </p>
        <Field label="Template name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="order_status_update_v1"
            className="mc-input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Language code">
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="en_US"
              className="mc-input"
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as WhatsAppTemplate['category'])}
              className="mc-input"
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
            className="mc-input resize-none"
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What this template is used for…"
            className="mc-input resize-none"
          />
        </Field>
        <button
          onClick={handleAdd}
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Save template
        </button>
      </section>

      <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Registered templates</h2>
        {templates.length === 0 ? (
          <p className="text-xs text-gray-500">No templates yet.</p>
        ) : (
          <ul className="space-y-2 max-h-[28rem] overflow-auto">
            {templates.map((t) => (
              <li key={t.id} className="border border-gray-100 rounded-lg p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{t.name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">
                    {t.language} · {t.category}
                  </span>
                </div>
                {t.description && <p className="text-gray-600">{t.description}</p>}
                {t.paramLabels.length > 0 && (
                  <ul className="text-gray-500 list-decimal pl-4">
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
    <span className="block text-xs font-medium text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
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
  const accentBg =
    accent === 'amber' ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300';
  const accentText = accent === 'amber' ? 'text-amber-700' : 'text-emerald-700';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`text-left rounded-xl border p-3 transition ${
        enabled
          ? `${accentBg} ${accentText}`
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-medium text-sm">
          {icon} {label}
        </span>
        <span
          className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${
            enabled ? 'bg-white/60' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {enabled ? 'On' : 'Off'}
        </span>
      </div>
      <p className="text-[11px] mt-1 opacity-80">{description}</p>
    </button>
  );
};
