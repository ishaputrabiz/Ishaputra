// ============================================
// DEALER PROGRAMME (/dealer): pure views. Props only, no Firestore, so every
// state can be checked with fixture data. src/pages/DealerProgramme.tsx wires
// them to useDealer() and the dealer service.
// ============================================

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BadgeCheck,
  BadgePercent,
  Check,
  ChevronRight,
  Clock,
  Info,
  PauseCircle,
  ReceiptText,
  ShoppingBasket,
  Store,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { PanelSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import {
  BUSINESS_TYPES,
  businessTypeLabel,
  cleanDealerApplication,
  validateDealerApplication,
  type DealerApplicationInput,
} from '@/lib/dealerForm';
import { formatDate, formatINR } from '@/lib/format';
import { INDIAN_STATES } from '@/lib/indianStates';
import { DUR, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { DealerRecord } from '@/services/dealerService';

const SUPPORT_PATH = '/customer-support';

const enter = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DUR.modal, ease: EASE_OUT, delay },
});

const panelHeading = 'text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground';

/** Charcoal icon tile, as on the wallet panels. */
const IconTile = ({ icon: Icon }: { icon: LucideIcon }) => (
  <div aria-hidden="true" className="tx-slate flex size-10 shrink-0 items-center justify-center rounded-[8px] text-highlight-soft">
    <Icon className="size-5" />
  </div>
);

/** A date, or '' while the server time is still pending (never a 1970 date). */
const dateOf = (ms: number) => (ms > 0 ? formatDate(ms) : '');

// ─── Band ──────────────────────────────────────────────────────────────────

export type DealerBandVariant = 'apply' | 'pending' | 'approved' | 'approvedOff' | 'rejected' | 'suspended';

const BAND_LEAD: Record<DealerBandVariant, string> = {
  apply: 'Dealer prices for businesses that resell or use our products. Apply once with your business details.',
  pending: 'Dealer prices for businesses that resell or use our products. Your application is with our team.',
  approved: 'Your business has a dealer account. Dealer prices show across the store while you are signed in.',
  approvedOff: 'Your business has a dealer account. Dealer prices are off in the shop for now.',
  rejected: 'Dealer prices for businesses that resell or use our products. You can update your details and apply again.',
  suspended: 'Your dealer account is on hold. Regular prices apply for now.',
};

export const DealerBand = ({ variant }: { variant: DealerBandVariant }) => (
  <section className="tx-slate tx-contour relative mb-6 overflow-hidden rounded-panel p-6 text-charcoal-foreground shadow-panel dark:ring-1 dark:ring-highlight-soft/20 lg:p-8">
    <Store aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 size-36 opacity-[0.07]" />
    <p className="eyebrow-no on-dark !text-[10px]"><span>For businesses</span></p>
    <h1 className="sr-only mt-2 text-2xl font-semibold tracking-tight lg:not-sr-only lg:block lg:text-3xl">Dealer programme</h1>
    <p className="relative mt-2 max-w-xl text-sm leading-relaxed text-charcoal-foreground/80 lg:text-[15px]">
      {BAND_LEAD[variant]}
    </p>
  </section>
);

// ─── How it works (apply page: never shows the discount) ───────────────────

export const HowItWorks = ({ minOrder }: { minOrder: number }) => {
  const items: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: BadgePercent,
      title: 'Dealer prices on the full range',
      body: 'Dealer prices show across the store while you are signed in. Some products have their own dealer price.',
    },
    minOrder > 0
      ? {
          icon: ShoppingBasket,
          title: `Dealer prices from ${formatINR(minOrder)}`,
          body: `They apply when your order is worth ${formatINR(minOrder)} or more at regular prices.`,
        }
      : {
          icon: ShoppingBasket,
          title: 'No minimum order',
          body: 'Dealer prices apply to every order you place.',
        },
    {
      icon: ReceiptText,
      title: 'GST invoice with your business details',
      body: 'Your business name, and your GSTIN if you add one, on the invoice.',
    },
    {
      icon: UserCheck,
      title: 'Reviewed by our team',
      body: 'We check your business details. You will see the outcome on this page.',
    },
  ];
  return (
    <section aria-labelledby="dealer-how-heading" className="panel tx-sheet p-6">
      <h2 id="dealer-how-heading" className={cn(panelHeading, 'mb-5')}>How it works</h2>
      <ul className="space-y-5">
        {items.map((b) => (
          <li key={b.title} className="flex gap-3">
            <IconTile icon={b.icon} />
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-foreground">{b.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{b.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 border-t border-foreground/[0.08] pt-4 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Good to know: </span>
        coupons, points and cashback don't apply to dealer-priced orders, and they earn no points. Delivery and GST are charged as usual.
      </p>
    </section>
  );
};

// ─── Apply form ────────────────────────────────────────────────────────────

type FieldName = keyof DealerApplicationInput;

const FIELD_ORDER: FieldName[] = ['businessName', 'businessType', 'contactName', 'phone', 'city', 'state', 'gstin', 'message'];

const FIELD_ID: Record<FieldName, string> = {
  businessName: 'dealer-business-name',
  businessType: 'dealer-business-type',
  contactName: 'dealer-contact-name',
  phone: 'dealer-phone',
  city: 'dealer-city',
  state: 'dealer-state',
  gstin: 'dealer-gstin',
  message: 'dealer-message',
};

interface FieldAria {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

/** Small-caps label, the control (given its id and aria wiring), then the error or hint. */
const Field = ({
  name,
  label,
  required,
  optional,
  hint,
  error,
  counter,
  className,
  children,
}: {
  name: FieldName;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string;
  counter?: string;
  className?: string;
  children: (aria: FieldAria) => React.ReactNode;
}) => {
  const id = FIELD_ID[name];
  const noteId = `${id}-${error ? 'error' : 'hint'}`;
  const hasNote = Boolean(error || hint);
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-primary">*</span>}
        {optional && <span className="ml-1 font-medium normal-case tracking-normal">(optional)</span>}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': hasNote ? noteId : undefined,
      })}
      {(hasNote || counter) && (
        <div className="flex justify-between gap-3 text-xs leading-snug">
          {error ? (
            <p id={noteId} className="text-destructive">{error}</p>
          ) : hint ? (
            <p id={noteId} className="text-muted-foreground">{hint}</p>
          ) : (
            <span />
          )}
          {counter && <span aria-hidden="true" className="shrink-0 tabular-nums text-muted-foreground">{counter}</span>}
        </div>
      )}
    </div>
  );
};

export interface DealerApplyFormProps {
  /** Starting answers: the prefilled name and phone, or the old application when applying again. */
  initial: DealerApplicationInput;
  submitting?: boolean;
  /** Called with the cleaned, valid application. The caller writes it and reports a failure. */
  onSubmit: (application: DealerApplicationInput) => void | Promise<void>;
  heading?: string;
  /** Shows a Cancel button (applying again can be abandoned). */
  onCancel?: () => void;
  /** Move focus to the heading when the form appears (it replaced the panel the user was on). */
  focusOnMount?: boolean;
}

const selectInvalid = 'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/25';

export const DealerApplyForm = ({
  initial,
  submitting = false,
  onSubmit,
  heading = 'Apply for a dealer account',
  onCancel,
  focusOnMount = false,
}: DealerApplyFormProps) => {
  const [values, setValues] = useState<DealerApplicationInput>(initial);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<FieldName | null>(null);

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  // Focus after the error text and aria-invalid are in the page, so a screen reader reads them with the field.
  useEffect(() => {
    if (!pendingFocus.current) return;
    formRef.current?.querySelector<HTMLElement>(`#${FIELD_ID[pendingFocus.current]}`)?.focus();
    pendingFocus.current = null;
  }, [errors]);

  const set = (name: FieldName, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const cleaned = cleanDealerApplication(values);
    const found = validateDealerApplication(cleaned);
    const first = FIELD_ORDER.find((k) => found[k]);
    if (first) {
      pendingFocus.current = first;
      setErrors(found);
      return;
    }
    setErrors({});
    void onSubmit(cleaned);
  };

  return (
    <section aria-labelledby="dealer-apply-heading" className="panel tx-sheet p-6">
      <h2 id="dealer-apply-heading" ref={headingRef} tabIndex={-1} className="scroll-mt-24 text-lg font-semibold text-foreground outline-none">
        {heading}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Fields marked <span aria-hidden="true" className="text-primary">*</span>
        <span className="sr-only">with a star</span> are required.
      </p>
      <form ref={formRef} noValidate onSubmit={handleSubmit} className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field name="businessName" label="Business name" required error={errors.businessName} className="sm:col-span-2">
          {(aria) => (
            <Input
              {...aria}
              required
              aria-required="true"
              autoComplete="organization"
              maxLength={80}
              value={values.businessName}
              onChange={(e) => set('businessName', e.target.value)}
            />
          )}
        </Field>
        <Field name="businessType" label="Business type" required error={errors.businessType} className="sm:col-span-2">
          {(aria) => (
            <Select value={values.businessType} onValueChange={(v) => set('businessType', v)}>
              <SelectTrigger {...aria} aria-required="true" className={selectInvalid}>
                <SelectValue placeholder="Choose a business type" />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field name="contactName" label="Your name" required error={errors.contactName}>
          {(aria) => (
            <Input
              {...aria}
              required
              aria-required="true"
              autoComplete="name"
              maxLength={60}
              value={values.contactName}
              onChange={(e) => set('contactName', e.target.value)}
            />
          )}
        </Field>
        <Field name="phone" label="Phone" required error={errors.phone}>
          {(aria) => (
            <Input
              {...aria}
              type="tel"
              inputMode="tel"
              required
              aria-required="true"
              autoComplete="tel"
              maxLength={20}
              value={values.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          )}
        </Field>
        <Field name="city" label="City" required error={errors.city}>
          {(aria) => (
            <Input
              {...aria}
              required
              aria-required="true"
              autoComplete="address-level2"
              maxLength={60}
              value={values.city}
              onChange={(e) => set('city', e.target.value)}
            />
          )}
        </Field>
        <Field name="state" label="State" required error={errors.state}>
          {(aria) => (
            <Select value={values.state} onValueChange={(v) => set('state', v)}>
              <SelectTrigger {...aria} aria-required="true" className={selectInvalid}>
                <SelectValue placeholder="Choose a state" />
              </SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field
          name="gstin"
          label="GSTIN"
          optional
          hint="15 characters. Printed on your dealer invoices."
          error={errors.gstin}
          className="sm:col-span-2"
        >
          {(aria) => (
            <Input
              {...aria}
              value={values.gstin}
              onChange={(e) => set('gstin', e.target.value.toUpperCase().replace(/\s/g, ''))}
              maxLength={15}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="uppercase tracking-[0.06em] placeholder:normal-case placeholder:tracking-normal"
            />
          )}
        </Field>
        <Field
          name="message"
          label="Message"
          optional
          hint="What you sell, where, and what you would like to stock."
          error={errors.message}
          counter={`${values.message.length}/500`}
          className="sm:col-span-2"
        >
          {(aria) => (
            <Textarea
              {...aria}
              value={values.message}
              onChange={(e) => set('message', e.target.value.slice(0, 500))}
              maxLength={500}
              rows={4}
              placeholder="Tell us about your business"
            />
          )}
        </Field>
        <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting && <Spinner />}
            Send application
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting} className="w-full sm:w-auto">
              Cancel
            </Button>
          )}
          <p className="text-xs text-muted-foreground">You can withdraw it while it's under review.</p>
        </div>
      </form>
    </section>
  );
};

// ─── Application summary ───────────────────────────────────────────────────

export const ApplicationSummary = ({ title, application }: { title: string; application: DealerApplicationInput }) => {
  const rows: { label: string; value: string; empty?: boolean; numeric?: boolean }[] = [
    { label: 'Business name', value: application.businessName },
    { label: 'Business type', value: businessTypeLabel(application.businessType) },
    { label: 'Your name', value: application.contactName },
    { label: 'Phone', value: application.phone },
    { label: 'City', value: [application.city, application.state].filter(Boolean).join(', ') },
    application.gstin
      ? { label: 'GSTIN', value: application.gstin, numeric: true }
      : { label: 'GSTIN', value: 'Not added', empty: true },
    application.message
      ? { label: 'Message', value: application.message }
      : { label: 'Message', value: 'Not added', empty: true },
  ];
  return (
    <section aria-labelledby="dealer-summary-heading" className="panel tx-sheet overflow-hidden">
      <h2 id="dealer-summary-heading" className={cn(panelHeading, 'px-5 pb-2 pt-5 md:px-6')}>{title}</h2>
      <dl className="divide-y divide-foreground/[0.07]">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)] gap-4 px-5 py-3 md:px-6">
            <dt className="pt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{r.label}</dt>
            <dd
              className={cn(
                'whitespace-pre-line break-words text-sm',
                r.empty ? 'text-muted-foreground' : 'text-foreground',
                r.numeric && 'tabular-nums tracking-[0.04em]',
              )}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

// ─── Pending ───────────────────────────────────────────────────────────────

export const DealerPendingPanel = ({
  appliedAtMs,
  onWithdraw,
  withdrawRef,
}: {
  appliedAtMs: number;
  onWithdraw: () => void;
  withdrawRef?: React.Ref<HTMLButtonElement>;
}) => {
  const received = dateOf(appliedAtMs);
  return (
    <section aria-labelledby="dealer-pending-heading" className="panel tx-sheet p-6">
      <StatusBadge tone="warning" label="Under review" icon={Clock} />
      <h2 id="dealer-pending-heading" className="mt-3 text-xl font-semibold tracking-tight text-foreground">
        {received ? `Application received ${received}` : 'Application received'}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Your application is with our team. You will see the outcome on this page, and dealer prices switch on once you're approved.
      </p>
      <Button ref={withdrawRef} type="button" variant="destructive" onClick={onWithdraw} className="mt-5 w-full sm:w-auto">
        Withdraw application
      </Button>
    </section>
  );
};

// ─── The team's note (rejected, suspended) ─────────────────────────────────

const TeamNote = ({ note }: { note: string }) => (
  <figure className="mt-3 rounded-card border border-foreground/[0.08] bg-muted/60 p-3">
    <figcaption className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Note from our team</figcaption>
    <blockquote className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-foreground">{note}</blockquote>
  </figure>
);

const linkArrow = "link-arrow relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']";

export const DealerRejectedNotice = ({
  record,
  onReapply,
}: {
  record: DealerRecord;
  onReapply: () => void;
}) => {
  const reviewed = dateOf(record.reviewedAtMs);
  return (
    <Notice
      tone="neutral"
      title="Your application wasn't approved"
      role="region"
      aria-label="Application outcome"
      action={
        <>
          <Button id="dealer-reapply" type="button" onClick={onReapply}>Apply again</Button>
          <Link to={SUPPORT_PATH} className={linkArrow}>
            Contact support <ChevronRight aria-hidden="true" className="size-3.5" />
          </Link>
        </>
      }
    >
      {reviewed && <p className="text-muted-foreground tabular-nums">Reviewed {reviewed}</p>}
      <TeamNote note={record.reviewNote || 'No reason was given.'} />
    </Notice>
  );
};

// ─── Account card (approved, suspended) ────────────────────────────────────

export type DealerCardMode = 'on' | 'off' | 'paused';

/** Charcoal dealer account card. `off`: approved while the shop has dealer prices off. `paused`: suspended. */
export const DealerAccountCard = ({ record, mode = 'on' }: { record: DealerRecord; mode?: DealerCardMode }) => {
  const approvedMs = record.approvedAtMs || (record.status === 'approved' ? record.reviewedAtMs : 0);
  const rows: [string, string, boolean?][] = [
    ['GSTIN', record.gstin || 'Not added', Boolean(record.gstin)],
    ...(approvedMs > 0 ? [['Approved', dateOf(approvedMs)] as [string, string]] : []),
    ['Business type', businessTypeLabel(record.businessType)],
    ['City', [record.city, record.state].filter(Boolean).join(', ')],
  ];
  return (
    <section
      aria-labelledby="dealer-card-heading"
      className="tx-slate tx-contour relative overflow-hidden rounded-panel p-6 text-charcoal-foreground shadow-panel dark:ring-1 dark:ring-highlight-soft/20"
    >
      <div className="relative flex items-center gap-3">
        <div aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full border border-highlight-soft/45 bg-charcoal-foreground/5 text-highlight-soft">
          <Store className="size-6" />
        </div>
        <div className="min-w-0">
          <p className="eyebrow-no on-dark !text-[10px]"><span>Dealer account</span></p>
          <h2 id="dealer-card-heading" className="mt-1 break-words text-xl font-semibold tracking-tight">{record.businessName}</h2>
        </div>
      </div>
      <div className="relative mt-4">
        {mode === 'paused' ? (
          <StatusBadge tone="warning" label="Dealer prices paused" icon={PauseCircle} />
        ) : mode === 'off' ? (
          <StatusBadge tone="neutral" label="Dealer prices are off for now" icon={Info} />
        ) : (
          <StatusBadge tone="success" label="Dealer prices on" icon={BadgeCheck} />
        )}
      </div>
      <dl className="relative mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-charcoal-foreground/15 pt-4">
        {rows.map(([k, v, numeric]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-charcoal-foreground/70">{k}</dt>
            <dd className={cn('mt-1 break-words text-sm font-medium', numeric && 'tabular-nums tracking-[0.04em]')}>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

// ─── Terms (approved, programme on) ────────────────────────────────────────

export const DealerTerms = ({
  discountPercent,
  minOrder,
  hasGstin,
}: {
  discountPercent: number;
  minOrder: number;
  hasGstin: boolean;
}) => {
  const terms = [
    discountPercent > 0
      ? `${discountPercent}% off regular prices. Some products have their own dealer price.`
      : 'Some products have their own dealer price.',
    ...(minOrder > 0 ? [`Applies on orders of ${formatINR(minOrder)} or more at regular prices.`] : []),
    "Coupons, points and cashback don't apply to dealer-priced orders, and they earn no points.",
    'Delivery and GST are charged as usual.',
    hasGstin ? 'GST invoice with your business name and GSTIN.' : 'GST invoice with your business name.',
  ];
  return (
    <section aria-labelledby="dealer-terms-heading" className="panel tx-sheet p-6">
      <h2 id="dealer-terms-heading" className={cn(panelHeading, 'mb-4')}>How dealer prices work</h2>
      <ul className="space-y-3">
        {terms.map((t) => (
          <li key={t} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary [stroke-width:2]" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Button asChild className="w-full sm:w-auto">
          <Link to="/products">Shop at dealer prices</Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          To change your business details,{' '}
          <Link to={SUPPORT_PATH} className="font-semibold text-primary underline-offset-4 hover:underline">contact support</Link>.
        </p>
      </div>
    </section>
  );
};

// ─── The whole page body for one state ─────────────────────────────────────

export interface DealerPageViewProps {
  /** Dealer state is still loading (sign-in, settings, own application). */
  loading?: boolean;
  record: DealerRecord | null;
  /** The programme switch (siteSettings/dealer.enabled). */
  programmeOn: boolean;
  /** Only readable once approved while the programme is on; null otherwise. */
  discountPercent: number | null;
  minOrder: number;
  /** After a rejection: show the form again, prefilled with the old answers. */
  reapplying: boolean;
  /** Prefill for a first application (name and phone from the profile). */
  prefill: DealerApplicationInput;
  submitting: boolean;
  onSubmit: (application: DealerApplicationInput) => void | Promise<void>;
  onReapply: () => void;
  onCancelReapply: () => void;
  onWithdraw: () => void;
  withdrawRef?: React.Ref<HTMLButtonElement>;
}

const twoCol = 'grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]';

const toInput = (r: DealerRecord): DealerApplicationInput => ({
  businessName: r.businessName,
  businessType: r.businessType,
  contactName: r.contactName,
  phone: r.phone,
  city: r.city,
  state: r.state,
  gstin: r.gstin,
  message: r.message,
});

export const DealerPageView = ({
  loading = false,
  record,
  programmeOn,
  discountPercent,
  minOrder,
  reapplying,
  prefill,
  submitting,
  onSubmit,
  onReapply,
  onCancelReapply,
  onWithdraw,
  withdrawRef,
}: DealerPageViewProps) => {
  if (loading) {
    return (
      <div>
        <div aria-hidden="true" className="tx-slate mb-6 h-40 rounded-panel opacity-60" />
        <PanelSkeleton lines={4} label="Loading the dealer programme" />
      </div>
    );
  }

  if (!record && !programmeOn) {
    return (
      <EmptyState
        icon={Store}
        as="h1"
        title="The dealer programme isn't open right now."
        description="Regular prices apply across the store."
        action={{ label: 'Shop the range', to: '/products' }}
      />
    );
  }

  const status = record?.status;

  if (!record || (status === 'rejected' && reapplying)) {
    const again = Boolean(record);
    return (
      <>
        <motion.div {...enter()}><DealerBand variant={again ? 'rejected' : 'apply'} /></motion.div>
        <div className={twoCol}>
          <motion.div {...enter(0.04)}><HowItWorks minOrder={minOrder} /></motion.div>
          <motion.div {...enter(0.08)}>
            <DealerApplyForm
              key={again ? 'again' : 'new'}
              initial={record ? toInput(record) : prefill}
              heading={again ? 'Apply again' : undefined}
              submitting={submitting}
              onSubmit={onSubmit}
              onCancel={again ? onCancelReapply : undefined}
              focusOnMount={again}
            />
          </motion.div>
        </div>
      </>
    );
  }

  if (status === 'pending') {
    return (
      <>
        <motion.div {...enter()}><DealerBand variant="pending" /></motion.div>
        <div className={twoCol}>
          <motion.div {...enter(0.04)}>
            <DealerPendingPanel appliedAtMs={record.appliedAtMs} onWithdraw={onWithdraw} withdrawRef={withdrawRef} />
          </motion.div>
          <motion.div {...enter(0.08)}><ApplicationSummary title="Your application" application={record} /></motion.div>
        </div>
      </>
    );
  }

  if (status === 'approved') {
    return (
      <>
        <motion.div {...enter()}><DealerBand variant={programmeOn ? 'approved' : 'approvedOff'} /></motion.div>
        <div className={twoCol}>
          <motion.div {...enter(0.04)}><DealerAccountCard record={record} mode={programmeOn ? 'on' : 'off'} /></motion.div>
          <motion.div {...enter(0.08)}>
            {!programmeOn ? (
              <Notice
                tone="info"
                role="region"
                aria-label="Dealer prices status"
                action={
                  <Link to="/products" className={linkArrow}>
                    Continue shopping <ChevronRight aria-hidden="true" className="size-3.5" />
                  </Link>
                }
              >
                The shop has paused dealer prices. Your dealer account stays approved.
              </Notice>
            ) : discountPercent === null ? (
              <Notice tone="warning" title="Dealer prices didn't load" role="region" aria-label="Dealer prices status">
                Refresh the page to try again. Your dealer account is approved.
              </Notice>
            ) : (
              <DealerTerms discountPercent={discountPercent} minOrder={minOrder} hasGstin={Boolean(record.gstin)} />
            )}
          </motion.div>
        </div>
      </>
    );
  }

  if (status === 'rejected') {
    return (
      <>
        <motion.div {...enter()}><DealerBand variant="rejected" /></motion.div>
        <div className={twoCol}>
          <motion.div {...enter(0.04)}><DealerRejectedNotice record={record} onReapply={onReapply} /></motion.div>
          <motion.div {...enter(0.08)}><ApplicationSummary title="Your last application" application={record} /></motion.div>
        </div>
      </>
    );
  }

  // suspended
  return (
    <>
      <motion.div {...enter()}><DealerBand variant="suspended" /></motion.div>
      <div className={twoCol}>
        <motion.div {...enter(0.04)}><DealerAccountCard record={record} mode="paused" /></motion.div>
        <motion.div {...enter(0.08)}>
          <Notice
            tone="warning"
            title="Dealer prices are paused"
            role="region"
            aria-label="Dealer account status"
            action={
              <>
                <Button asChild><Link to={SUPPORT_PATH}>Contact support</Link></Button>
                <Link to="/products" className={linkArrow}>
                  Continue shopping <ChevronRight aria-hidden="true" className="size-3.5" />
                </Link>
              </>
            }
          >
            Your dealer account is on hold, so your orders use regular prices for now. Contact support to find out more.
            {record.reviewNote && <TeamNote note={record.reviewNote} />}
          </Notice>
        </motion.div>
      </div>
    </>
  );
};
