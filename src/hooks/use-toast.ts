import type * as React from "react";
import { toast as sonner } from "sonner";

/**
 * Legacy shadcn `useToast()` API, now a thin adapter over Sonner so the whole
 * site has one toast system (src/components/ui/sonner.tsx). Existing callers
 * keep working unchanged:
 *
 *   const { toast } = useToast();
 *   toast({ title: 'Added to cart', description: name });
 *   toast({ title: 'Could not save', description: msg, variant: 'destructive' }); // -> toast.error
 *
 * New code can import { toast } from 'sonner' directly.
 */

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToasterToast {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "destructive" | null;
  /** An Undo-style action button. */
  action?: ToastAction;
  /** Milliseconds; Sonner's default is 4000. */
  duration?: number;
}

type Toast = Omit<ToasterToast, "id">;

function show({ title, description, variant, action, duration }: Toast, id?: string | number) {
  const options = {
    id,
    description,
    duration,
    action: action ? { label: action.label, onClick: action.onClick } : undefined,
  };
  const message = title ?? description ?? "";
  if (title === undefined || title === null) options.description = undefined;
  return variant === "destructive" ? sonner.error(message, options) : sonner(message, options);
}

function toast(props: Toast) {
  const id = show(props);
  return {
    id: String(id),
    dismiss: () => sonner.dismiss(id),
    update: (next: ToasterToast) => {
      show({ ...props, ...next }, id);
    },
  };
}

/** The toasts themselves live inside Sonner; `toasts` stays an empty list for old callers. */
function useToast() {
  return {
    toasts: [] as ToasterToast[],
    toast,
    dismiss: (toastId?: string) => sonner.dismiss(toastId),
  };
}

export { useToast, toast };
