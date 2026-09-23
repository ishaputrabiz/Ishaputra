import { useEffect, useRef } from 'react';

/**
 * Listen for a USB / Bluetooth barcode scanner.
 *
 * These are not cameras and they need no drivers, no pairing and no browser
 * permission: the device registers as a keyboard (HID), "types" the code it
 * read as fast as the OS will accept keystrokes, and finishes with Enter. So
 * there is nothing to connect to - the page only has to notice that a burst of
 * keystrokes arrived far faster than a person could type, and read it as a scan
 * instead of as typing.
 *
 * That speed is the whole signal. A quick human types a character every 80ms or
 * so; a scanner does it in under 20ms. The decision is made on the burst's
 * AVERAGE gap rather than on each keystroke: re-rendering the field the code is
 * landing in can stall a single keystroke well past any per-key threshold, and
 * judging keys individually split one scan into two - the page then received
 * only the tail of the code, which looked exactly like a misread scanner.
 *
 * Works with any scanner in "keyboard wedge" mode, which is the factory default
 * on essentially every USB model, and it reads QR codes as happily as barcodes -
 * the device decodes the symbol, the browser only ever sees the text.
 */

/** Average gap above this over a whole burst means a person typing. */
const SCAN_MAX_GAP_MS = 35;
/**
 * A pause this long means a new interaction, so the buffer starts over.
 *
 * Deliberately far above any stutter a scan can suffer: the run is never split
 * on a merely slow keystroke, because the slow ones land at the START of a
 * burst - the first characters arrive while React is still re-rendering the
 * field they are typing into. Splitting there handed the page the tail of the
 * code and dropped its first characters. Scan or typing is decided once, at the
 * Enter, from the average gap.
 */
const BURST_RESET_MS = 500;
/** Shorter than this and it is a keyboard shortcut or a stray keypress. */
const MIN_CODE_LENGTH = 3;

export interface HardwareScannerOptions {
  /** Called with the decoded text once a scan completes. */
  onScan: (code: string) => void;
  /** Turn the listener off (e.g. while a modal owns the keyboard). */
  enabled?: boolean;
  /**
   * Read scans even while a text field has focus.
   *
   * On by default: the shop's counter staff leave the cursor in the search box
   * and scan straight into it, and swallowing those would make the scanner look
   * broken. The keystrokes are still removed from the field so the code is not
   * left behind as half-typed text.
   */
  captureInInputs?: boolean;
}

export function useHardwareScanner({
  onScan,
  enabled = true,
  captureInInputs = true,
}: HardwareScannerOptions) {
  // Kept in a ref so a changing callback never re-binds the listener mid-scan.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = '';
    let firstKeyAt = 0;
    let lastKeyAt = 0;
    /** The field the burst started in, so we can undo what it typed there. */
    let target: HTMLInputElement | HTMLTextAreaElement | null = null;
    let valueBeforeScan = '';

    const reset = () => {
      buffer = '';
      firstKeyAt = 0;
      target = null;
      valueBeforeScan = '';
    };

    /** Mean milliseconds between the keys collected so far. */
    const averageGap = () =>
      buffer.length > 1 ? (lastKeyAt - firstKeyAt) / (buffer.length - 1) : 0;

    const isEditable = (el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement =>
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLElement && el.isContentEditable);

    const onKeyDown = (e: KeyboardEvent) => {
      // A scanner sends plain characters. Anything with a modifier is a person
      // using a shortcut, so drop whatever was accumulating.
      if (e.ctrlKey || e.metaKey || e.altKey) {
        reset();
        return;
      }

      const active = document.activeElement;
      const inField = isEditable(active);
      if (inField && !captureInInputs) return;

      const now = Date.now();
      const gap = now - lastKeyAt;

      if (e.key === 'Enter') {
        const code = buffer.trim();
        // Judge the run as a whole. The Enter itself often arrives later than
        // the characters did, so the final gap says little on its own.
        const wasScan = code.length >= MIN_CODE_LENGTH && averageGap() < SCAN_MAX_GAP_MS;
        lastKeyAt = now;
        if (wasScan) {
          // Take the keystrokes back out of whatever field they landed in, so
          // the page decides what to do with the code rather than the field
          // being left holding it.
          const field = target;
          const restoreTo = valueBeforeScan;
          if (field && field.isConnected) {
            const setter = Object.getOwnPropertyDescriptor(
              field instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype,
              'value',
            )?.set;
            // React listens for the native input event; setting `.value`
            // directly would leave its state holding the scanned characters.
            setter?.call(field, restoreTo);
            field.dispatchEvent(new Event('input', { bubbles: true }));
          }
          // Stop the Enter from submitting the form the cursor happens to be in.
          e.preventDefault();
          e.stopPropagation();
          reset();
          // Hand the code over only once React has processed the restore above,
          // so a page that answers a scan by filling that same field is not
          // fighting our own update.
          setTimeout(() => onScanRef.current(code), 0);
          return;
        }
        reset();
        return;
      }

      // Only single printable characters are part of a code.
      if (e.key.length !== 1) return;

      if (buffer === '' || gap > BURST_RESET_MS) {
        // Start a new burst, remembering the field so it can be put back.
        buffer = e.key;
        firstKeyAt = now;
        lastKeyAt = now;
        target =
          inField && !(active as HTMLElement).isContentEditable
            ? (active as HTMLInputElement | HTMLTextAreaElement)
            : null;
        valueBeforeScan = target ? target.value : '';
        return;
      }

      buffer += e.key;
      lastKeyAt = now;
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, captureInInputs]);
}

export default useHardwareScanner;
