/**
 * useFocusTrap - Focus trap hook for modal dialogs
 *
 * Traps focus within the given container ref when active.
 * Handles Tab key cycling and Escape key dismissal.
 *
 * @param containerRef - Ref to the dialog container
 * @param active - Whether the trap is active (default: true)
 * @param onEscape - Optional callback when Escape is pressed
 */

import { useEffect, useCallback } from 'react';

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

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  active = true,
  onEscape?: () => void,
) {
  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((el) => el.offsetParent !== null); // visible elements only
  }, [containerRef]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active || !containerRef.current) return;

      // Escape to close
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }

      // Trap Tab
      if (e.key !== 'Tab') return;
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey) {
        if (containerRef.current!.contains(document.activeElement) && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (containerRef.current!.contains(document.activeElement) && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [active, containerRef, getFocusableElements, onEscape],
  );

  // Activate focus trap
  useEffect(() => {
    if (!active || !containerRef.current) return;

    // Store the previously focused element
    const previousActiveElement = document.activeElement as HTMLElement | null;

    // Focus the first focusable element
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0]!.focus();
    } else if (containerRef.current) {
      containerRef.current.focus();
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus when unmounting
      if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus();
      }
    };
  }, [active, containerRef, getFocusableElements, handleKeyDown]);
}
