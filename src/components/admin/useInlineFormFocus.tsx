import { useCallback, useEffect, useRef } from 'react';

/**
 * Focus for an inline "Add / Edit" form that replaces the header's Add button
 * (Banners, Showcases, Testimonials, Gallery). The Add button unmounts when
 * the form opens, so without this focus falls to <body>.
 *
 * - Opening the form (or switching to another item's Edit) moves focus to the
 *   form heading, so keyboard and screen reader users land on the form.
 * - Closing it returns focus to the control that opened it (an Edit button),
 *   or to the re-mounted Add button when that control is gone.
 *
 *   const { headingRef, addButtonRef, rememberOpener } = useInlineFormFocus(showForm, editing?.id);
 *   <Button ref={addButtonRef} ...>Add banner</Button>
 *   <h2 ref={headingRef} tabIndex={-1}>Add banner</h2>
 *   const handleEdit = (item) => { rememberOpener(); ... };
 */
export function useInlineFormFocus(open: boolean, itemKey?: unknown) {
  const headingEl = useRef<HTMLHeadingElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  // Opened while the page was still loading: the heading mounts later, so focus it then.
  const focusWhenMounted = useRef(false);

  const headingRef = useCallback((el: HTMLHeadingElement | null) => {
    headingEl.current = el;
    if (el && focusWhenMounted.current) {
      focusWhenMounted.current = false;
      el.focus();
    }
  }, []);

  useEffect(() => {
    if (open) {
      if (headingEl.current) headingEl.current.focus();
      else focusWhenMounted.current = true;
    } else if (wasOpen.current) {
      focusWhenMounted.current = false;
      const opener = openerRef.current;
      openerRef.current = null;
      (opener?.isConnected ? opener : addButtonRef.current)?.focus();
    }
    wasOpen.current = open;
  }, [open, itemKey]);

  /** Call from an Edit handler so focus goes back to that button when the form closes. */
  const rememberOpener = useCallback(() => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, []);

  return { headingRef, addButtonRef, rememberOpener };
}

export default useInlineFormFocus;
