import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Name the object: "Delete this address?", "Remove all 3 items?" */
  title: string;
  /** The consequence, in one or two sentences. */
  description?: React.ReactNode;
  /** The action, in 1-3 words: "Delete address". */
  confirmLabel: string;
  /** Default "Cancel"; "Keep items" reads better when the action removes something. */
  cancelLabel?: string;
  /** 'danger' fills the confirm button red: the only place a filled red button is allowed. */
  tone?: "danger" | "default";
  /**
   * Runs on confirm. If it returns a promise the button shows a spinner, both
   * buttons are disabled, and the dialog closes when it resolves (stays open
   * if it throws, so the caller can show the error).
   */
  onConfirm: () => void | Promise<unknown>;
  children?: React.ReactNode;
  /**
   * For a dialog opened from state (no Trigger): the element to focus when it
   * closes, usually the button that opened it. Radix would otherwise drop focus on body.
   */
  returnFocusRef?: React.RefObject<HTMLElement>;
}

/**
 * The confirmation for anything destructive or irreversible. Cancel has focus
 * when it opens, Escape cancels, focus returns to the trigger afterwards.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  children,
  returnFocusRef,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);

  const handleConfirm = async (event: React.MouseEvent) => {
    event.preventDefault();
    try {
      const result = onConfirm();
      if (result && typeof (result as Promise<unknown>).then === "function") {
        setBusy(true);
        await result;
      }
      onOpenChange(false);
    } catch {
      // The caller reports the error (toast or Notice); keep the dialog open.
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!busy ? onOpenChange(next) : undefined)}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current) {
            event.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={handleConfirm}
            className={cn(tone === "danger" && buttonVariants({ variant: "destructiveSolid" }))}
          >
            {busy && <Spinner />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmDialog;
