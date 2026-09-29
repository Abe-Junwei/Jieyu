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
import { useLatest } from './useLatest';

function focusDialogEntry(root: HTMLElement): void {
  const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null && element.dataset.dialogClose !== 'true',
  );
  const preferred =
    focusable.find((element) => element.hasAttribute('autofocus')) ??
    focusable.find((element) => element.matches('input, textarea, select')) ??
    focusable[0];
  if (preferred) preferred.focus();
  else root.focus();
}

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

  const onEscapeRef = useLatest(onEscape);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active || !containerRef.current) return;

      // Escape to close. Read the latest callback so typing in the dialog
      // does not rebuild this listener and re-run the initial focus effect.
      if (e.key === 'Escape' && onEscapeRef.current) {
        e.preventDefault();
        onEscapeRef.current();
        return;
      }

      // Trap Tab
      if (e.key !== 'Tab') return;
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey) {
        if (
          containerRef.current!.contains(document.activeElement) &&
          document.activeElement === first
        ) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (
          containerRef.current!.contains(document.activeElement) &&
          document.activeElement === last
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [active, containerRef, getFocusableElements, onEscapeRef],
  );

  // Depends on `active` only. Callback and ref identity must not re-enter this
  // effect: each typed character recreates `onClose`, and re-running used to
  // focus the header close button again.
  useEffect(() => {
    if (!active) return;
    const root = containerRef.current;
    if (!root) return;

    const previousActiveElement =
      document.activeElement instanceof HTMLElement && !root.contains(document.activeElement)
        ? document.activeElement
        : null;

    if (!root.contains(document.activeElement)) {
      focusDialogEntry(root);
    }

    return () => {
      if (root.isConnected && root.contains(document.activeElement)) return;
      if (previousActiveElement?.isConnected) previousActiveElement.focus();
    };
    // containerRef is a ref object. Reading `.current` after paint is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!active) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active, handleKeyDown]);
}
