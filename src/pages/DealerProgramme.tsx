// ============================================
// DEALER PROGRAMME (/dealer): apply, pending, approved, rejected, suspended.
// A thin container: dealer state from useDealer(), writes through the dealer
// service, and every screen drawn by src/components/dealer/DealerViews.tsx.
// ============================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDealer } from '@/hooks/useDealer';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { IconButton } from '@/components/ui/icon-button';
import { DealerPageView } from '@/components/dealer/DealerViews';
import { describeError } from '@/lib/errorMessage';
import type { DealerApplicationInput } from '@/lib/dealerForm';
import { applyAsDealer, withdrawDealerApplication } from '@/services/dealerService';

/** Wallet-style chrome (PurchaseSummary's shell): desktop Header and Footer, phone sticky title bar and bottom nav. */
const DealerShell = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh tx-paper">
      <div className="hidden lg:block"><Header /></div>

      <div className="tx-sheet sticky top-0 z-sticky flex items-center gap-2 border-b border-foreground/[0.08] px-2 py-1.5 lg:hidden">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft />
        </IconButton>
        <p className="font-heading text-xl font-semibold tracking-tight text-foreground" aria-hidden="true">Dealer programme</p>
      </div>

      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-6 pb-24 outline-none lg:py-10 lg:pb-10">
        {children}
      </main>

      <div className="lg:hidden"><MobileBottomNav /></div>
      <div className="hidden lg:block"><Footer /></div>
    </div>
  );
};

const focusMain = () => document.getElementById('main')?.focus();

const DealerProgramme: React.FC = () => {
  const { user, userProfile } = useAuth();
  const dealer = useDealer();
  const [submitting, setSubmitting] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  /**
   * What the customer sent, kept until the write is confirmed. The Firestore listener fires
   * a local snapshot on the write, so the page moves to Pending and the form unmounts at once;
   * if the server then rejects the write, the form comes back with this, not an empty one.
   */
  const [draft, setDraft] = useState<DealerApplicationInput | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const withdrawRef = useRef<HTMLButtonElement>(null);
  /** Where focus goes when the withdraw dialog closes: the button on Cancel, the page once it is gone. */
  const dialogReturnRef = useRef<HTMLElement | null>(null);
  const focusReapplyAfterCancel = useRef(false);
  const lastStatus = useRef<string | null | undefined>(undefined);

  usePageMeta({ title: 'Dealer programme', noindex: true });

  const { ready, record, settings, pricing } = dealer;
  const status = record?.status ?? null;

  // Applying again only makes sense while the application is rejected.
  useEffect(() => {
    if (status !== 'rejected') setReapplying(false);
  }, [status]);

  // A button that was pressed disappears when the status changes (Send, Withdraw), so
  // focus would drop to the page body. Keep it on the page instead.
  useEffect(() => {
    if (!ready) return;
    if (lastStatus.current !== undefined && lastStatus.current !== status) {
      const active = document.activeElement;
      if (!active || active === document.body) focusMain();
    }
    lastStatus.current = status;
  }, [ready, status]);

  useEffect(() => {
    if (!reapplying && focusReapplyAfterCancel.current) {
      focusReapplyAfterCancel.current = false;
      document.getElementById('dealer-reapply')?.focus();
    }
  }, [reapplying]);

  const prefill = useMemo<DealerApplicationInput>(
    () => ({
      businessName: '',
      businessType: '',
      contactName: userProfile?.name || userProfile?.username || '',
      phone: userProfile?.phone || '',
      city: '',
      state: '',
      gstin: '',
      message: '',
    }),
    [userProfile?.name, userProfile?.username, userProfile?.phone],
  );

  const handleSubmit = useCallback(
    async (application: DealerApplicationInput) => {
      if (!user) return;
      const reapply = status === 'rejected';
      setDraft(application);
      setSubmitting(true);
      try {
        await applyAsDealer(user.uid, application, reapply);
        setDraft(null);
        toast.success('Application sent');
      } catch (e) {
        toast.error(describeError(e));
        // The local snapshot already reset `reapplying` (the status went to pending); once it
        // reverts to rejected, show the form again, not the rejected notice.
        if (reapply) setReapplying(true);
      } finally {
        setSubmitting(false);
      }
    },
    [user, status],
  );

  const handleWithdraw = useCallback(async () => {
    if (!user) return;
    try {
      await withdrawDealerApplication(user.uid);
    } catch (e) {
      toast.error(describeError(e));
      throw e; // keeps the dialog open
    }
    dialogReturnRef.current = document.getElementById('main');
    toast('Application withdrawn');
  }, [user]);

  return (
    <DealerShell>
      <DealerPageView
        loading={!ready || !user}
        record={record}
        programmeOn={settings.enabled}
        discountPercent={pricing?.discountPercent ?? null}
        minOrder={settings.minOrder}
        reapplying={reapplying}
        prefill={prefill}
        draft={draft}
        submitting={submitting}
        onSubmit={handleSubmit}
        onReapply={() => setReapplying(true)}
        onCancelReapply={() => {
          focusReapplyAfterCancel.current = true;
          setDraft(null);
          setReapplying(false);
        }}
        onWithdraw={() => {
          dialogReturnRef.current = withdrawRef.current;
          setConfirmOpen(true);
        }}
        withdrawRef={withdrawRef}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Withdraw your application?"
        description="We'll delete it. You can send a new application if the programme is open."
        confirmLabel="Withdraw"
        cancelLabel="Keep application"
        tone="danger"
        returnFocusRef={dialogReturnRef}
        onConfirm={handleWithdraw}
      />
    </DealerShell>
  );
};

export default DealerProgramme;
