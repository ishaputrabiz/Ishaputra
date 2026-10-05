// ============================================
// ADMIN > DEALERS: the application sheet. A pure view (props only, no Firestore):
// AdminDealers.tsx owns the list, the busy state and the writes.
// ============================================

import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Check, CirclePause, CircleX, Clock, Info, RotateCcw, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { businessTypeLabel } from '@/lib/dealerForm';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DealerRecord, DealerStatus } from '@/services/dealerService';

export type DealerAction = 'approve' | 'reject' | 'suspend' | 'reinstate';

const STATUS_META: Record<DealerStatus, { label: string; tone: StatusTone; icon: LucideIcon; decidedLabel: string }> = {
  pending: { label: 'Pending', tone: 'warning', icon: Clock, decidedLabel: 'Applied' },
  approved: { label: 'Approved', tone: 'success', icon: BadgeCheck, decidedLabel: 'Approved' },
  rejected: { label: 'Rejected', tone: 'danger', icon: CircleX, decidedLabel: 'Rejected' },
  suspended: { label: 'Suspended', tone: 'neutral', icon: CirclePause, decidedLabel: 'Suspended' },
};

/** A stored time of 0 means "no date yet" (a write the server has not stamped, or an old record): never print 1970. */
const dateOrDash = (ms: number) => (ms > 0 ? formatDate(ms) : '—');

/**
 * When the application came in and, once reviewed, when it was decided.
 * 'stacked' is a table cell; 'inline' is one sentence for cards and the sheet header.
 */
export function DealerDates({ record, layout }: { record: DealerRecord; layout: 'stacked' | 'inline' }) {
  const applied = dateOrDash(record.appliedAtMs);
  const decided = record.status !== 'pending' && record.reviewedAtMs > 0 ? formatDate(record.reviewedAtMs) : '';
  const decidedLabel = STATUS_META[record.status].decidedLabel;
  if (layout === 'stacked') {
    return (
      <>
        <span className="tabular-nums text-foreground/80">{applied}</span>
        {decided && (
          <span className="block text-xs text-muted-foreground">
            {decidedLabel} <span className="tabular-nums">{decided}</span>
          </span>
        )}
      </>
    );
  }
  return (
    <>
      Applied <span className="tabular-nums">{applied}</span>
      {decided && (
        <>
          , {decidedLabel.toLowerCase()} <span className="tabular-nums">{decided}</span>
        </>
      )}
    </>
  );
}

function useMediaQuery(query: string) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = React.useState(get);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return matches;
}

/** The link-arrow is about 20px tall: give it a 44px hit area. */
const LINK_HIT = "relative after:absolute after:-inset-x-1 after:-inset-y-3.5 after:content-['']";
const SECTION_HEADING = 'mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground';

function DlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export interface DealerApplicationSheetProps {
  /** The application to show; null keeps the sheet closed. */
  record: DealerRecord | null;
  /** 'reject' (Reject pressed on a row) puts focus in the note field; otherwise it goes to the title. */
  intent: 'view' | 'reject';
  /** The decision being saved, if any: its buttons spin and every button is disabled meanwhile. */
  busy: { uid: string; action: DealerAction } | null;
  /** The note typed for a rejection (up to 300 characters). */
  note: string;
  onNoteChange: (value: string) => void;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onReinstate: () => void;
  /** Suspend asks for confirmation (and a note), which the page shows once this sheet has closed. */
  onSuspend: () => void;
  /** Runs when the sheet has closed: the page puts focus back (or opens the Suspend confirmation). */
  onCloseAutoFocus: (event: Event) => void;
}

export function DealerApplicationSheet({
  record,
  intent,
  busy,
  note,
  onNoteChange,
  onClose,
  onApprove,
  onReject,
  onReinstate,
  onSuspend,
  onCloseAutoFocus,
}: DealerApplicationSheetProps) {
  const wide = useMediaQuery('(min-width: 640px)');
  const titleRef = React.useRef<HTMLHeadingElement | null>(null);
  const noteRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Keep drawing the last application while the sheet slides out, so closing is not a snap.
  const lastRecord = React.useRef<DealerRecord | null>(record);
  if (record) lastRecord.current = record;
  const shown = record ?? lastRecord.current;

  const locked = busy !== null;
  const mine = shown && busy?.uid === shown.uid ? busy.action : null;
  const meta = shown ? STATUS_META[shown.status] : null;
  const reviewed = shown?.status === 'rejected' || shown?.status === 'suspended';

  return (
    <Sheet open={!!record} onOpenChange={(open) => !open && onClose()}>
      {shown && meta && (
        <SheetContent
          side={wide ? 'right' : 'bottom'}
          hideClose
          className={cn('flex flex-col gap-0 overflow-hidden p-0', wide && 'w-full sm:max-w-md')}
          onOpenAutoFocus={(e) => {
            // Reading: focus the title (Radix would jump to the note field and open a phone keyboard).
            // Reject from a row: straight to the note.
            e.preventDefault();
            (intent === 'reject' && shown.status === 'pending' ? noteRef.current : titleRef.current)?.focus();
          }}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <div className="relative border-b border-border px-5 pb-4 pt-5 sm:px-6">
            <SheetHeader className="gap-1.5">
              <div className="flex flex-wrap items-center gap-2 pr-10">
                <StatusBadge tone={meta.tone} icon={meta.icon} label={meta.label} />
                <span className="text-xs text-muted-foreground">
                  <DealerDates record={shown} layout="inline" />
                </span>
              </div>
              <SheetTitle ref={titleRef} tabIndex={-1} className="text-xl outline-none [overflow-wrap:anywhere]">
                {shown.businessName}
              </SheetTitle>
              <SheetDescription>{businessTypeLabel(shown.businessType)}</SheetDescription>
            </SheetHeader>
            {/* 44px Close on touch (the Sheet's built-in one is 40px). */}
            <SheetClose asChild>
              <IconButton label="Close" className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground sm:right-3">
                <X />
              </IconButton>
            </SheetClose>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <section className="mb-5">
              <h3 className={SECTION_HEADING}>Application</h3>
              <dl className="divide-y divide-foreground/[0.08] text-sm">
                <DlRow label="GSTIN">
                  {shown.gstin ? (
                    <span className="tabular-nums tracking-wide">{shown.gstin}</span>
                  ) : (
                    <span className="font-normal text-muted-foreground">Not given</span>
                  )}
                </DlRow>
                <DlRow label="Contact name">{shown.contactName}</DlRow>
                <DlRow label="Phone">
                  <a
                    href={`tel:${shown.phone.replace(/[^\d+]/g, '')}`}
                    className="-my-3 inline-flex min-h-11 items-center tabular-nums text-primary underline-offset-4 hover:underline sm:my-0 sm:min-h-0"
                  >
                    {shown.phone}
                  </a>
                </DlRow>
                <DlRow label="City and state">
                  {[shown.city, shown.state].filter(Boolean).join(', ')}
                </DlRow>
              </dl>
            </section>

            <section className="mb-5">
              <h3 className={SECTION_HEADING}>Message</h3>
              {shown.message ? (
                <p className="whitespace-pre-line rounded-card bg-muted px-4 py-3 text-sm leading-relaxed text-foreground/80 [overflow-wrap:anywhere] [text-wrap:pretty]">
                  {shown.message}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No message.</p>
              )}
            </section>

            <section className="mb-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Customer account</h3>
                <Link to={`/admin/customers/${shown.uid}`} className={cn('link-arrow', LINK_HIT)}>
                  Open customer <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </div>
            </section>

            {/* The note is only ever shown to the applicant when rejected or suspended. */}
            {reviewed && (
              <Notice
                tone="neutral"
                title={shown.status === 'rejected' ? 'Note sent with the rejection' : 'Note shown with the suspension'}
                role="note"
                className="mb-5 [overflow-wrap:anywhere]"
              >
                {shown.reviewNote || 'No note was given.'}
              </Notice>
            )}

            {shown.status === 'pending' && (
              <div>
                <Label htmlFor="dealer-reject-note" className="text-sm">
                  Note to the applicant
                  <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="dealer-reject-note"
                  ref={noteRef}
                  rows={2}
                  maxLength={300}
                  value={note}
                  onChange={(e) => onNoteChange(e.target.value)}
                  aria-describedby="dealer-reject-note-hint"
                  placeholder="For example, what to send so you can look again"
                  className="mt-1.5 min-h-[4.5rem]"
                />
                <div id="dealer-reject-note-hint" className="mt-1.5 flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>Shown on their dealer page if you reject.</span>
                  <span className="shrink-0 tabular-nums">{note.length}/300</span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border bg-background px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
            {shown.status === 'pending' && (
              <p className="mb-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                Approving shows dealer prices to this customer on orders that reach the dealer minimum.
              </p>
            )}
            <div className="flex gap-2 sm:justify-end">
              {shown.status === 'pending' && (
                <Button variant="destructive" className="flex-1 sm:flex-none" disabled={locked} onClick={onReject}>
                  {mine === 'reject' ? <Spinner /> : <X aria-hidden="true" />}
                  Reject
                </Button>
              )}
              {(shown.status === 'pending' || shown.status === 'rejected') && (
                <Button className="flex-1 sm:flex-none" disabled={locked} onClick={onApprove}>
                  {mine === 'approve' ? <Spinner /> : <Check aria-hidden="true" />}
                  Approve
                </Button>
              )}
              {shown.status === 'approved' && (
                <Button variant="outline" className="flex-1 sm:flex-none" disabled={locked} onClick={onSuspend}>
                  <CirclePause aria-hidden="true" />
                  Suspend
                </Button>
              )}
              {shown.status === 'suspended' && (
                <Button className="flex-1 sm:flex-none" disabled={locked} onClick={onReinstate}>
                  {mine === 'reinstate' ? <Spinner /> : <RotateCcw aria-hidden="true" />}
                  Reinstate
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}

export default DealerApplicationSheet;
