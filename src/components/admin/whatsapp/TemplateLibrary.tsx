/**
 * Template library for Admin -> Marketing -> Templates: Firestore metadata
 * merged with the latest "Sync from Meta" result, status badges, delete.
 */
import { useMemo, useRef, useState } from 'react';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Image as ImageIcon,
  PauseCircle,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { db } from '@/config/firebase';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Notice } from '@/components/ui/notice';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { whatsappAdminApi, WhatsAppApiError, type MetaTemplateRow } from '@/services/whatsappAdminApi';
import { statusStyle } from './templateRules';
import { formatWhatsAppText } from './WhatsAppPreviewBubble';
import TemplatePictureField from './TemplatePictureField';

export interface LibraryTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  paramLabels: string[];
  description?: string | null;
  status?: string | null;
  rejectedReason?: string | null;
  source?: string | null;
  metaId?: string | null;
  bodyText?: string | null;
  /** 'IMAGE' for picture headers; those need headerImageUrl before sending. */
  headerFormat?: string | null;
  headerImageUrl?: string | null;
}

type Row = LibraryTemplate & { key: string; fromMeta: boolean };

const STATUS_ICON: Record<string, LucideIcon> = {
  APPROVED: CheckCircle2,
  PENDING: Clock,
  REJECTED: XCircle,
  PAUSED: PauseCircle,
  DISABLED: Ban,
};

/** A template's approval status as a chip (icon + label, never colour alone). */
export const TemplateStatusBadge = ({ status, className }: { status?: string | null; className?: string }) => {
  const s = statusStyle(status);
  return (
    <StatusBadge
      tone={s.tone}
      icon={STATUS_ICON[String(status || '').toUpperCase()] ?? FileText}
      label={s.label}
      title={s.help || undefined}
      className={className}
    />
  );
};

export const TemplateLibrary = ({ templates }: { templates: LibraryTemplate[] }) => {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [metaRows, setMetaRows] = useState<MetaTemplateRow[] | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'APPROVED' | 'PENDING' | 'REJECTED'>('all');
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    templates.forEach((t) => {
      map.set(`${t.name}|${t.language}`, { ...t, key: `fs-${t.id}`, fromMeta: t.source === 'meta' });
    });
    // The sync result is fresher than the Firestore snapshot until it lands.
    metaRows?.forEach((m) => {
      const k = `${m.name}|${m.language}`;
      const prev = map.get(k);
      map.set(k, {
        id: prev?.id || m.name,
        name: m.name,
        language: m.language,
        category: m.category.toLowerCase(),
        paramLabels: prev?.paramLabels || Array.from({ length: m.paramCount }, (_, i) => `Variable ${i + 1}`),
        description: prev?.description,
        status: m.status,
        rejectedReason: m.rejectedReason,
        source: 'meta',
        metaId: m.id,
        bodyText: m.bodyText,
        headerFormat: m.headerFormat ?? prev?.headerFormat ?? null,
        headerImageUrl: prev?.headerImageUrl ?? null,
        key: prev?.key || `meta-${m.id}`,
        fromMeta: true,
      });
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [templates, metaRows]);

  const counts = useMemo(() => {
    const c = { all: rows.length, APPROVED: 0, PENDING: 0, REJECTED: 0 };
    rows.forEach((r) => {
      const s = String(r.status || '').toUpperCase();
      if (s === 'APPROVED' || s === 'PENDING' || s === 'REJECTED') c[s] += 1;
    });
    return c;
  }, [rows]);
  const visible = filter === 'all' ? rows : rows.filter((r) => String(r.status || '').toUpperCase() === filter);

  const sync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const resp = await whatsappAdminApi.listTemplates(true);
      setMetaRows(resp.templates);
      setLastSync(new Date());
      toast.success(`Synced ${resp.templates.length} template${resp.templates.length === 1 ? '' : 's'} from Meta`);
    } catch (err) {
      setSyncError(err instanceof WhatsAppApiError ? err.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  /** Rejects on failure so the confirm dialog stays open (it reports nothing itself). */
  const confirmDelete = async () => {
    const row = pendingDelete;
    if (!row) return;
    try {
      if (row.fromMeta) {
        await whatsappAdminApi.deleteTemplate(row.name, row.metaId);
        setMetaRows((prev) => prev?.filter((m) => !(m.name === row.name && (!row.metaId || m.id === row.metaId))) ?? prev);
        toast.success(`Deleted "${row.name}" from Meta`);
      } else {
        await deleteDoc(doc(db, 'whatsappTemplates', row.id));
        toast.success(`Removed "${row.name}" from the list`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
      throw err;
    }
  };

  return (
    <section className="rounded-card border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Your templates</h2>
          <p className="text-xs text-muted-foreground">
            {lastSync ? `Synced with Meta at ${formatTime(lastSync)}.` : 'Sync to pull the latest approval status from Meta.'}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={sync} disabled={syncing}>
          {syncing ? <Spinner /> : <RefreshCw aria-hidden="true" />}
          {syncing ? 'Syncing' : 'Sync from Meta'}
        </Button>
      </div>

      <div aria-live="polite">
        {syncError && (
          <Notice tone="danger" compact className="mx-4 mt-4 sm:mx-5">
            {syncError}
          </Notice>
        )}
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto px-4 pt-4 sm:px-5">
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && setFilter(v as typeof filter)}
            aria-label="Filter by status"
            className="min-w-max"
          >
            {(['all', 'APPROVED', 'PENDING', 'REJECTED'] as const).map((f) => (
              <ToggleGroupItem key={f} value={f} size="sm" className="h-8 gap-1.5 px-3 text-xs">
                {f === 'all' ? 'All' : statusStyle(f).label}
                <span className="tabular-nums">{counts[f]}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <FileText aria-hidden="true" className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No templates yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Create one with the "Create new" tab, or press Sync from Meta if you already made templates in WhatsApp Manager.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border p-2 sm:p-3">
          {visible.map((t) => {
            const open = expanded === t.key;
            return (
              <li key={t.key} className="px-2 py-3 sm:px-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="break-all font-mono text-[13px] font-medium text-foreground">{t.name}</span>
                      <TemplateStatusBadge status={t.status} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t.language} · {t.category}
                      {t.paramLabels.length ? ` · ${t.paramLabels.length} variable${t.paramLabels.length === 1 ? '' : 's'}` : ''}
                      {!t.fromMeta ? ' · added by hand' : ''}
                    </p>
                    {String(t.headerFormat || '').toUpperCase() === 'IMAGE' && <HeaderPictureRow t={t} />}
                    {t.rejectedReason && (
                      <p className="mt-1.5 text-xs text-status-danger-fg">
                        Reason from Meta: {t.rejectedReason.replace(/_/g, ' ').toLowerCase()}
                      </p>
                    )}
                    {(t.bodyText || t.description) && (
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : t.key)}
                        aria-expanded={open}
                        className="mt-1.5 inline-flex min-h-8 items-center gap-1 rounded-control text-xs font-medium text-primary hover:underline"
                      >
                        {open ? 'Hide text' : 'Show text'}
                        <ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform duration-hover', open && 'rotate-180')} />
                      </button>
                    )}
                    {open && (
                      <div className="mt-2 space-y-1 rounded-control bg-muted p-3 text-[13px] text-foreground">
                        {t.bodyText && <p className="whitespace-pre-wrap break-words">{formatWhatsAppText(t.bodyText)}</p>}
                        {t.description && <p className="text-xs text-foreground/80">{t.description}</p>}
                        {t.paramLabels.length > 0 && (
                          <ol className="list-decimal pl-5 text-xs text-foreground/80">
                            {t.paramLabels.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}
                  </div>
                  <IconButton
                    label={`Delete ${t.name}`}
                    tooltip="Delete"
                    onClick={(e) => {
                      deleteTriggerRef.current = e.currentTarget;
                      setPendingDelete(t);
                    }}
                    className="hover:text-destructive"
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              </li>
            );
          })}
          {visible.length === 0 && <li className="px-3 py-8 text-center text-xs text-muted-foreground">No templates with this status.</li>}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.name ?? ''}"?`}
        description={
          pendingDelete?.fromMeta
            ? `This deletes the ${pendingDelete?.metaId ? `${pendingDelete.language} version of the ` : ''}template from Meta and removes it from the inbox and campaigns. Messages already sent are not affected. You cannot reuse this name for 30 days.`
            : 'This only removes it from the picker list here. Nothing changes in Meta.'
        }
        confirmLabel="Delete template"
        tone="danger"
        onConfirm={confirmDelete}
        returnFocusRef={deleteTriggerRef}
      />
    </section>
  );
};

/**
 * Picture-header templates send their saved picture with every message.
 * Templates made in WhatsApp Manager arrive without one, so it is set here.
 */
const HeaderPictureRow = ({ t }: { t: Row }) => {
  const [editing, setEditing] = useState(false);
  const save = async (url: string | null) => {
    try {
      await setDoc(doc(db, 'whatsappTemplates', t.id), { headerImageUrl: url, updatedAt: serverTimestamp() }, { merge: true });
      toast.success(url ? 'Picture saved. It goes with every message using this template.' : 'Picture removed.');
      setEditing(false);
    } catch {
      toast.error('Could not save the picture. Try again.');
    }
  };
  if (editing) {
    return (
      <div className="mt-2 max-w-sm">
        <TemplatePictureField imageUrl={t.headerImageUrl || null} onChange={save} />
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {t.headerImageUrl ? (
        <img src={t.headerImageUrl} alt="Header picture" className="h-9 w-16 rounded-chip border border-border object-cover" />
      ) : (
        <span className="text-xs text-status-warning-fg">Has a picture header but no picture saved here, so it can't be sent yet.</span>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-8 px-2 text-xs text-primary">
        <ImageIcon aria-hidden="true" />
        {t.headerImageUrl ? 'Change picture' : 'Set picture'}
      </Button>
    </div>
  );
};

export default TemplateLibrary;
