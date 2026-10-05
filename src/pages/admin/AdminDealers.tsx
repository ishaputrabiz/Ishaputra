// ============================================
// ADMIN > DEALERS: review dealer applications. `DealersView` is pure (props
// only, no Firestore) so every state can be checked with fixture data; the
// default export is the thin container that listens to Firestore and saves
// decisions through reviewDealer().
// ============================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BadgeCheck, Check, CirclePause, Clock, Handshake, MapPin, RotateCcw, Search, Settings, X, UserRound, FileText, Calendar } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard } from '@/components/admin/StatCard';
import { DealerApplicationSheet, DealerDates, type DealerAction } from '@/components/admin/DealerApplicationSheet';
import ConfirmDialog from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { StatCardsSkeleton, TableSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/contexts/AuthContext';
import { businessTypeLabel } from '@/lib/dealerForm';
import { describeError } from '@/lib/errorMessage';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { reviewDealer, subscribeDealerApplications, type DealerRecord, type DealerStatus } from '@/services/dealerService';

const TABS: { status: DealerStatus; label: string; emptyTitle: string; emptyText: string }[] = [
  { status: 'pending', label: 'Pending', emptyTitle: 'Nothing waiting for review', emptyText: 'New applications show up here.' },
  { status: 'approved', label: 'Approved', emptyTitle: 'No approved dealers yet', emptyText: 'Approved dealers show up here.' },
  { status: 'rejected', label: 'Rejected', emptyTitle: 'No rejected applications', emptyText: 'Rejected applications show up here.' },
  { status: 'suspended', label: 'Suspended', emptyTitle: 'No suspended dealers', emptyText: 'Suspended dealers show up here.' },
];
const STATUSES = TABS.map((t) => t.status);

/** Business name, contact name, phone or GSTIN; case-insensitive, and phone numbers match without their spaces. */
function matchesQuery(r: DealerRecord, q: string) {
  if (!q) return true;
  const compact = q.replace(/[\s-]/g, '');
  return (
    r.businessName.toLowerCase().includes(q) ||
    r.contactName.toLowerCase().includes(q) ||
    r.gstin.toLowerCase().includes(q) ||
    r.phone.toLowerCase().includes(q) ||
    (compact !== '' && r.phone.replace(/[\s-]/g, '').includes(compact))
  );
}

const gstinText = (r: DealerRecord) =>
  r.gstin ? (
    <span className="font-medium tabular-nums tracking-wide text-foreground">{r.gstin}</span>
  ) : (
    <span className="text-muted-foreground">No GSTIN</span>
  );

export interface DealersViewProps {
  /** Every application, newest first; null while the first load is running. */
  records: DealerRecord[] | null;
  /** A load error to show instead of the list. */
  error: string | null;
  onRetry: () => void;
  /**
   * Save a decision. Resolves true when it was saved and false when it failed
   * (the page has already shown the toast); the sheet stays open on false.
   */
  onReview: (record: DealerRecord, action: DealerAction, note: string) => Promise<boolean>;
}

export function DealersView({ records, error, onRetry, onReview }: DealersViewProps) {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as DealerStatus | null;
  const tab: DealerStatus = tabParam && STATUSES.includes(tabParam) ? tabParam : 'pending';
  const tabMeta = TABS.find((t) => t.status === tab) ?? TABS[0];
  const [queryText, setQueryText] = useState('');

  const [sheet, setSheet] = useState<{ uid: string; intent: 'view' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [confirmUid, setConfirmUid] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [suspendNote, setSuspendNote] = useState('');
  const [busy, setBusy] = useState<{ uid: string; action: DealerAction } | null>(null);
  const lockRef = useRef(false);
  /** Suspend was pressed inside the sheet: the confirmation opens once the sheet has closed. */
  const pendingConfirmRef = useRef(false);

  const openerRef = useRef<HTMLElement | null>(null);
  const confirmOpenerRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLElement | null>(null);

  /** Focus goes back to the button that opened something; if that row has moved to another tab, to the list. */
  const returnFocus = useMemo(
    () =>
      ({
        get current() {
          const el = openerRef.current;
          return el && el.isConnected ? el : listRef.current;
        },
      }) as React.RefObject<HTMLElement>,
    [],
  );
  const confirmReturnFocus = useMemo(
    () =>
      ({
        get current() {
          const el = confirmOpenerRef.current;
          return el && el.isConnected ? el : returnFocus.current;
        },
      }) as React.RefObject<HTMLElement>,
    [returnFocus],
  );

  const q = queryText.trim().toLowerCase();
  const counts = useMemo(() => {
    const c: Record<DealerStatus, number> = { pending: 0, approved: 0, rejected: 0, suspended: 0 };
    for (const r of records ?? []) c[r.status] += 1;
    return c;
  }, [records]);
  const list = useMemo(() => (records ?? []).filter((r) => r.status === tab && matchesQuery(r, q)), [records, tab, q]);
  const otherTabMatches = useMemo(
    () => (q ? (records ?? []).filter((r) => r.status !== tab && matchesQuery(r, q)).length : 0),
    [records, tab, q],
  );

  const current = sheet && records ? records.find((r) => r.uid === sheet.uid) ?? null : null;
  const confirmRecord = confirmUid && records ? records.find((r) => r.uid === confirmUid) ?? null : null;

  const setTab = (value: string) => {
    if (!value) return;
    setParams(
      (p) => {
        p.set('tab', value);
        return p;
      },
      { replace: true },
    );
  };

  const openSheet = (el: HTMLElement, uid: string, intent: 'view' | 'reject' = 'view') => {
    openerRef.current = el;
    setNote('');
    setSheet({ uid, intent });
  };

  const openSuspend = (el: HTMLElement, uid: string) => {
    confirmOpenerRef.current = el;
    setSuspendNote('');
    setConfirmUid(uid);
    setConfirmOpen(true);
  };

  /**
   * The confirmation is an alert dialog and the sheet sits above it (z-drawer over z-overlay), so
   * from the sheet the order is: close the sheet, then open the confirmation. Cancel lands on the row.
   */
  const suspendFromSheet = (uid: string) => {
    confirmOpenerRef.current = openerRef.current;
    setSuspendNote('');
    setConfirmUid(uid);
    pendingConfirmRef.current = true;
    setSheet(null);
    // Safety net if the sheet never reports that it closed.
    window.setTimeout(() => {
      if (pendingConfirmRef.current) {
        pendingConfirmRef.current = false;
        setConfirmOpen(true);
      }
    }, 800);
  };

  const onSheetCloseAutoFocus = (event: Event) => {
    if (pendingConfirmRef.current) {
      pendingConfirmRef.current = false;
      event.preventDefault();
      setConfirmOpen(true);
      return;
    }
    const el = returnFocus.current;
    if (el) {
      event.preventDefault();
      el.focus();
    }
  };

  const run = async (record: DealerRecord, action: DealerAction, text = '') => {
    if (lockRef.current) return false;
    lockRef.current = true;
    setBusy({ uid: record.uid, action });
    try {
      return await onReview(record, action, text);
    } finally {
      lockRef.current = false;
      setBusy(null);
    }
  };

  /** A button on a row: when it worked the row usually leaves this tab, so make sure focus is not lost with it. */
  const rowAct = async (record: DealerRecord, action: DealerAction) => {
    if (await run(record, action)) {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!active || active === document.body || !active.isConnected) listRef.current?.focus();
      });
    }
  };

  const sheetAct = async (action: 'approve' | 'reject' | 'reinstate') => {
    if (!current) return;
    if (await run(current, action, action === 'reject' ? note : '')) setSheet(null);
  };

  const locked = busy !== null;

  const rowActions = (r: DealerRecord, phone = false) => {
    const tall = phone ? 'h-11 flex-1' : '';
    const working = (a: DealerAction) => busy?.uid === r.uid && busy.action === a;
    const approve = (
      <Button
        variant="outline"
        size="sm"
        className={cn('relative z-raised', tall)}
        disabled={locked}
        onClick={() => rowAct(r, 'approve')}
        aria-label={`Approve ${r.businessName}`}
      >
        {working('approve') ? <Spinner /> : <Check aria-hidden="true" />}
        Approve
      </Button>
    );
    if (r.status === 'pending')
      return (
        <>
          <Button
            variant="ghost"
            size="sm"
            className={cn('relative z-raised text-status-danger-fg hover:bg-status-danger-bg hover:text-status-danger-fg', tall)}
            disabled={locked}
            onClick={(e) => openSheet(e.currentTarget, r.uid, 'reject')}
            aria-label={`Reject ${r.businessName}`}
          >
            <X aria-hidden="true" />
            Reject
          </Button>
          {approve}
        </>
      );
    if (r.status === 'approved')
      return (
        <Button
          variant="ghost"
          size="sm"
          className={cn('relative z-raised text-foreground/80 hover:bg-status-warning-bg hover:text-status-warning-fg', tall)}
          disabled={locked}
          onClick={(e) => openSuspend(e.currentTarget, r.uid)}
          aria-label={`Suspend ${r.businessName}`}
        >
          <CirclePause aria-hidden="true" />
          Suspend
        </Button>
      );
    if (r.status === 'suspended')
      return (
        <Button
          variant="outline"
          size="sm"
          className={cn('relative z-raised', tall)}
          disabled={locked}
          onClick={() => rowAct(r, 'reinstate')}
          aria-label={`Reinstate ${r.businessName}`}
        >
          {working('reinstate') ? <Spinner /> : <RotateCcw aria-hidden="true" />}
          Reinstate
        </Button>
      );
    return approve;
  };

  const loading = records === null && !error;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <AdminPageHeader
        title="Dealers"
        description="Review business applications and choose who sees dealer prices."
        className="pb-0"
        actions={
          <Button variant="outline" size="sm" asChild className="h-11 sm:h-9">
            <Link to="/admin/commerce-settings">
              <Settings aria-hidden="true" />
              Dealer settings
            </Link>
          </Button>
        }
      />

      {error && (
        <Notice
          tone="danger"
          title="Could not load dealer applications"
          action={
            <Button variant="outline" size="sm" onClick={onRetry} className="h-11 sm:h-9">
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
          }
        >
          {error}
        </Notice>
      )}

      {loading ? (
        <>
          <StatCardsSkeleton count={3} label="Loading dealer totals" />
          <TableSkeleton rows={5} cols={5} label="Loading dealer applications" />
        </>
      ) : records === null ? null : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
            <li>
              <StatCard label="Pending" value={formatNumber(counts.pending)} icon={Clock} tone="warning" subtitle="Waiting for your review" />
            </li>
            <li>
              <StatCard label="Approved" value={formatNumber(counts.approved)} icon={BadgeCheck} tone="success" subtitle="See dealer prices" />
            </li>
            <li className="col-span-2 sm:col-span-1">
              <StatCard
                label="Paused or rejected"
                value={formatNumber(counts.suspended + counts.rejected)}
                icon={CirclePause}
                subtitle={`${counts.suspended} suspended, ${counts.rejected} rejected`}
              />
            </li>
          </ul>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <ToggleGroup
              type="single"
              value={tab}
              onValueChange={setTab}
              aria-label="Dealer status"
              className="grid w-full shrink-0 grid-cols-2 sm:inline-flex sm:w-auto sm:self-start"
            >
              {TABS.map((t) => (
                <ToggleGroupItem key={t.status} value={t.status} size="sm" className="h-11 gap-1.5 px-3 sm:h-9">
                  {t.label}
                  <span
                    className={cn(
                      'rounded-chip px-1.5 text-xs tabular-nums',
                      t.status === 'pending' && counts.pending > 0 ? 'bg-status-warning-bg text-status-warning-fg' : 'bg-muted text-foreground/80',
                    )}
                  >
                    {counts[t.status]}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="relative flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search dealers"
                placeholder="Search by name, phone or GSTIN"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <section ref={listRef} tabIndex={-1} aria-label={`${tabMeta.label} dealers`} className="outline-none">
            <p role="status" className="sr-only">
              {list.length} {tabMeta.label.toLowerCase()} {list.length === 1 ? 'dealer' : 'dealers'} shown
            </p>

            {list.length === 0 ? (
              <div className="rounded-card border border-dashed border-border bg-card">
                <EmptyState
                  icon={Handshake}
                  title={q ? 'No dealers match' : tabMeta.emptyTitle}
                  description={
                    q
                      ? otherTabMatches > 0
                        ? `${otherTabMatches} ${otherTabMatches === 1 ? 'match is' : 'matches are'} in the other tabs.`
                        : 'Try another name, phone or GSTIN.'
                      : tabMeta.emptyText
                  }
                />
              </div>
            ) : (
              <>
                {/* Desktop: table */}
                <div className="hidden overflow-hidden rounded-card border border-foreground/[0.08] bg-card text-card-foreground shadow-sm lg:block">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">{tabMeta.label} dealers</caption>
                    <thead className="bg-muted/60 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-2.5 font-semibold">Business</th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">Contact</th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">City and state</th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">GSTIN</th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">Applied</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-foreground/[0.07]">
                      {list.map((r) => (
                        <tr key={r.uid} className="transition-colors duration-hover hover:bg-muted/60">
                          <td className="max-w-[18rem] px-4 py-3 align-top">
                            <button
                              type="button"
                              onClick={(e) => openSheet(e.currentTarget, r.uid)}
                              className="rounded-chip text-left font-semibold text-foreground underline-offset-4 [overflow-wrap:anywhere] hover:text-primary hover:underline"
                            >
                              {r.businessName}
                            </button>
                            <p className="mt-0.5 text-xs text-muted-foreground">{businessTypeLabel(r.businessType)}</p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p className="text-foreground [overflow-wrap:anywhere]">{r.contactName}</p>
                            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{r.phone}</p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p className="text-foreground">{r.city}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{r.state}</p>
                          </td>
                          <td className="px-4 py-3 align-top text-sm">{gstinText(r)}</td>
                          <td className="whitespace-nowrap px-4 py-3 align-top text-sm">
                            <DealerDates record={r} layout="stacked" />
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center justify-end gap-1.5">{rowActions(r)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Phone and tablet: cards */}
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                  {list.map((r) => (
                    <li
                      key={r.uid}
                      className="relative flex min-w-0 flex-col rounded-card border border-foreground/[0.08] bg-card text-card-foreground shadow-sm has-[button[data-card-link]:focus-visible]:outline has-[button[data-card-link]:focus-visible]:outline-2 has-[button[data-card-link]:focus-visible]:outline-offset-2 has-[button[data-card-link]:focus-visible]:outline-ring"
                    >
                      <div className="p-4 pb-3">
                        <button
                          type="button"
                          data-card-link
                          onClick={(e) => openSheet(e.currentTarget, r.uid)}
                          className="text-left font-semibold leading-snug text-foreground outline-none [overflow-wrap:anywhere] after:absolute after:inset-0 after:content-['']"
                        >
                          {r.businessName}
                        </button>
                        <p className="mt-0.5 text-xs text-muted-foreground">{businessTypeLabel(r.businessType)}</p>
                      </div>
                      <dl className="flex flex-col gap-2 px-4 pb-4 text-sm">
                        <div className="flex items-start gap-2">
                          <dt className="sr-only">Contact</dt>
                          <UserRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <dd className="min-w-0 text-foreground [overflow-wrap:anywhere]">
                            {r.contactName} <span className="tabular-nums text-muted-foreground">{r.phone}</span>
                          </dd>
                        </div>
                        <div className="flex items-start gap-2">
                          <dt className="sr-only">City and state</dt>
                          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <dd className="min-w-0 text-foreground">{[r.city, r.state].filter(Boolean).join(', ')}</dd>
                        </div>
                        <div className="flex items-start gap-2">
                          <dt className="sr-only">GSTIN</dt>
                          <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <dd className="min-w-0">{gstinText(r)}</dd>
                        </div>
                        <div className="flex items-start gap-2">
                          <dt className="sr-only">Applied</dt>
                          <Calendar aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <dd className="min-w-0 text-foreground/80">
                            <DealerDates record={r} layout="inline" />
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-auto flex items-center gap-2 border-t border-foreground/[0.08] p-3">{rowActions(r, true)}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      <DealerApplicationSheet
        record={current}
        intent={sheet?.intent ?? 'view'}
        busy={busy}
        note={note}
        onNoteChange={setNote}
        onClose={() => setSheet(null)}
        onApprove={() => sheetAct('approve')}
        onReject={() => sheetAct('reject')}
        onReinstate={() => sheetAct('reinstate')}
        onSuspend={() => current && suspendFromSheet(current.uid)}
        onCloseAutoFocus={onSheetCloseAutoFocus}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        returnFocusRef={confirmReturnFocus}
        title="Suspend this dealer?"
        description="They'll pay regular prices until you reinstate them."
        confirmLabel="Suspend"
        onConfirm={async () => {
          if (!confirmRecord) throw new Error('Dealer not found');
          if (!(await run(confirmRecord, 'suspend', suspendNote))) throw new Error('Suspend failed');
        }}
      >
        {confirmRecord && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{confirmRecord.businessName}</p>
            <div>
              <Label htmlFor="dealer-suspend-note" className="text-sm">
                Note to the dealer
                <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="dealer-suspend-note"
                rows={2}
                maxLength={300}
                value={suspendNote}
                onChange={(e) => setSuspendNote(e.target.value)}
                aria-describedby="dealer-suspend-note-hint"
                placeholder="For example, why their account is on hold"
                className="mt-1.5 min-h-[4.5rem]"
              />
              <div id="dealer-suspend-note-hint" className="mt-1.5 flex justify-between gap-3 text-xs text-muted-foreground">
                <span>Shown on their dealer page while they are suspended.</span>
                <span className="shrink-0 tabular-nums">{suspendNote.length}/300</span>
              </div>
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

const VERB: Record<DealerAction, { done: string; fail: string }> = {
  approve: { done: 'approved', fail: 'approve' },
  reject: { done: 'rejected', fail: 'reject' },
  suspend: { done: 'suspended', fail: 'suspend' },
  reinstate: { done: 'reinstated', fail: 'reinstate' },
};

/** The page: listens to every application and saves the admin's decisions. */
const AdminDealers: React.FC = () => {
  const { user } = useAuth();
  const adminUid = user?.uid;
  const [records, setRecords] = useState<DealerRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(null);
    return subscribeDealerApplications(setRecords, (e) => {
      console.error('Dealer applications listener failed:', e);
      setError(describeError(e, 'Something went wrong while loading applications.'));
    });
  }, [attempt]);

  const retry = useCallback(() => {
    setRecords(null);
    setAttempt((n) => n + 1);
  }, []);

  const review = useCallback(
    async (record: DealerRecord, action: DealerAction, note: string) => {
      const name = record.businessName;
      if (!adminUid) {
        toast.error(`Could not ${VERB[action].fail} ${name}`, { description: 'Your session expired. Sign in again and retry.' });
        return false;
      }
      try {
        if (action === 'approve') await reviewDealer(record.uid, 'approve', adminUid, '', record.approvedAtMs === 0);
        else if (action === 'reject') await reviewDealer(record.uid, 'reject', adminUid, note);
        else if (action === 'suspend') await reviewDealer(record.uid, 'suspend', adminUid, note);
        else await reviewDealer(record.uid, 'reinstate', adminUid);
        toast.success(`${name} ${VERB[action].done}`);
        return true;
      } catch (e) {
        console.error(`Dealer ${action} failed:`, e);
        toast.error(`Could not ${VERB[action].fail} ${name}`, { description: describeError(e) });
        return false;
      }
    },
    [adminUid],
  );

  return <DealersView records={records} error={error} onRetry={retry} onReview={review} />;
};

export default AdminDealers;
