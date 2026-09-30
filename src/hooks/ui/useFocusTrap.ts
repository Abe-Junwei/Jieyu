/**
 * useFocusTrap - Focus trap hook for modal dialogs
 *
 * Traps focus within the given container ref when active.
 * Handles Tab key cycling and Escape key dismissal.
 *
 * Initial focus and restore run only when `active` flips. `onEscape` is read
 * from a ref so a new callback identity (common when a dialog re-renders on
 * each keystroke) does not steal focus back to the first tabbable control.
 *
 * @param containerRef - Ref to the dialog container
 * @param active - Whether the trap is active (default: true)
 * @param onEscape - Optional callback when Escape is pressed
 */

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]',
].join(', ');

function listFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null,
  );
}

function pickInitialFocus(container: HTMLElement): HTMLElement {
  const autofocus = container.querySelector<HTMLElement>('[autofocus]');
  if (autofocus && autofocus.offsetParent !== null) {
    return autofocus;
  }
  return listFocusable(container)[0] ?? container;
}

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  active = true,
  onEscape?: () => void,
) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      if (e.key === 'Escape' && onEscapeRef.current) {
        e.preventDefault();
        onEscapeRef.current();
        return;
      }

      if (e.key !== 'Tab') return;
      const focusable = listFocusable(container);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey) {
        if (container.contains(document.activeElement) && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (container.contains(document.activeElement) && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, containerRef]);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const alreadyInside =
      container.contains(previousActiveElement) && previousActiveElement !== container;
    if (!alreadyInside) {
      pickInitialFocus(container).focus();
    }

    return () => {
      if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus();
      }
    };
  }, [active, containerRef]);
}
