import { useEffect, useState, type CSSProperties } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const NARROW = "(max-width: 639px)";

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => {
    try {
      return window.matchMedia(NARROW).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(NARROW);
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

/**
 * The one toast system (Sonner). Mounted once in App.tsx.
 * Paper card, 12px radius, 4s, close button; bottom-centre on phones,
 * bottom-right above 640px. Follows the site theme, not the OS.
 * Call `toast()` / `toast.success()` / `toast.error()` from 'sonner', or the
 * legacy `useToast()` adapter in src/hooks/use-toast.ts.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();
  const narrow = useIsNarrow();

  return (
    <Sonner
      theme={resolvedTheme}
      position={narrow ? "bottom-center" : "bottom-right"}
      duration={4000}
      closeButton
      gap={8}
      className="toaster group"
      style={
        {
          zIndex: "var(--z-toast)",
          // Stay clickable (Undo, close) while a modal sets pointer-events: none on body.
          pointerEvents: "auto",
          "--normal-bg": "hsl(var(--card))",
          "--normal-border": "hsl(var(--foreground) / 0.1)",
          "--normal-text": "hsl(var(--foreground))",
          "--border-radius": "var(--radius-card)",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-card group-[.toaster]:border group-[.toaster]:border-foreground/10 group-[.toaster]:bg-card group-[.toaster]:[background-image:var(--tx-paper-fibre)] dark:group-[.toaster]:[background-image:var(--tx-slate-grit)] group-[.toaster]:text-foreground group-[.toaster]:text-[13px] group-[.toaster]:shadow-[var(--shadow-panel)] group-[.toaster]:font-body",
          title: "group-[.toast]:font-semibold group-[.toast]:leading-snug",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-[13px]",
          actionButton:
            "group-[.toast]:!rounded-control group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground group-[.toast]:!text-[11px] group-[.toast]:!font-bold group-[.toast]:!uppercase group-[.toast]:!tracking-[0.16em] group-[.toast]:!h-8 group-[.toast]:!px-3",
          cancelButton: "group-[.toast]:!rounded-control group-[.toast]:!bg-muted group-[.toast]:!text-foreground",
          closeButton:
            "group-[.toast]:!border-foreground/10 group-[.toast]:!bg-card group-[.toast]:!text-muted-foreground hover:group-[.toast]:!text-foreground",
          success: "[&_[data-icon]]:text-status-success-fg",
          error: "[&_[data-icon]]:text-status-danger-fg",
          warning: "[&_[data-icon]]:text-status-warning-fg",
          info: "[&_[data-icon]]:text-status-info-fg",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
