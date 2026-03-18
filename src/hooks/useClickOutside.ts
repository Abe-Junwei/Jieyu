/**
 * useClickOutside - Centralized hook for handling "click outside" pattern
 * 
 * This hook provides a clean way to close overlays/menus when the user clicks
 * outside of them, following industry best practices for overlay management.
 * 
 * Key differences from naive window.pointerdown listener:
 * - Only fires callback if click originates OUTSIDE the specified ref element
 * - Properly handles event delegation and composed events
 * - Supports optional Escape key handling
 * - Prevents race conditions with click handlers inside ref
 */

import { useEffect, useRef, useCallback, type RefObject } from 'react';

export interface UseClickOutsideOptions {
  /**
   * Whether to close the overlay when Escape key is pressed.
   * @default true
   */
  closeOnEscape?: boolean;
  /**
   * Delay in ms before handling the click (useful for debouncing rapid clicks)
   * @default 0
   */
  debounceMs?: number;
}

/**
 * Hook to handle "close on click outside" pattern
 * 
 * @param ref - Reference to the element that should NOT trigger the callback when clicked
 * @param callback - Function to call when user clicks outside the element
 * @param options - Configuration options
 * 
 * @example
 * const menuRef = useRef<HTMLDivElement>(null);
 * useClickOutside(menuRef, () => setShowMenu(false));
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  callback: () => void,
  options: UseClickOutsideOptions = {},
): void {
  const { closeOnEscape = true, debounceMs = 0 } = options;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleClickOutside = useCallback(
    (event: MouseEvent | PointerEvent) => {
      const element = ref.current;
      
      // If no ref or ref is not mounted, ignore
      if (!element) return;

      // If click target is not in the document, ignore (e.g., in React portals)
      if (!(event.target instanceof Node)) return;

      // If click is inside the element, don't close
      if (element.contains(event.target)) return;

      // Debounce if needed
      if (debounceMs > 0) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(callback, debounceMs);
      } else {
        callback();
      }
    },
    [ref, callback, debounceMs],
  );

  const handleEscape = useCallback(
    (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === 'Escape') {
        callback();
      }
    },
    [closeOnEscape, callback],
  );

  useEffect(() => {
    // Add listeners
    document.addEventListener('pointerdown', handleClickOutside, { capture: false });
    document.addEventListener('keydown', handleEscape, { capture: false });

    // Cleanup
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside, { capture: false });
      document.removeEventListener('keydown', handleEscape, { capture: false });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [handleClickOutside, handleEscape]);
}
