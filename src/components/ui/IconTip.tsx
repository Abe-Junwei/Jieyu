import { createPortal } from 'react-dom';
import {
  cloneElement,
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

const OPEN_MS = 400;
const SKIP_MS = 300;
const GAP_MS = 100;
const CLEARANCE = 32;
const EDGE = 8;

let closeCurrent: (() => void) | null = null;
let lastLeftAt = 0;

/** Test hook. Production callers never need this. */
export function resetIconTips(): void {
  closeCurrent?.();
  closeCurrent = null;
  lastLeftAt = 0;
}

type Place = { x: number; y: number; below: boolean; corner: boolean };

function measure(node: HTMLElement, corner: boolean): Place {
  const rect = node.getBoundingClientRect();
  if (corner) return { x: rect.right, y: rect.bottom, below: false, corner: true };
  const below = rect.top < CLEARANCE;
  return {
    x: rect.left + rect.width / 2,
    y: below ? rect.bottom : rect.top,
    below,
    corner: false,
  };
}

function holds(target: EventTarget | null, node: HTMLElement | null): boolean {
  return target instanceof Node && node !== null && (node === target || node.contains(target));
}

function hostOf(node: HTMLElement): HTMLElement {
  return node.closest<HTMLElement>('.jieyu-icon-tip-host') ?? node;
}

/** `display: contents` hosts have no box, so the tip would sit at the origin. */
function anchorOf(node: HTMLElement): HTMLElement {
  const host = hostOf(node);
  const rect = host.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) return host;
  return node;
}

/** A shown `role="dialog"` owns Escape. Minimized chat and hidden shells do not. */
function visibleDialogOpen(): boolean {
  for (const node of document.querySelectorAll<HTMLElement>('[role="dialog"]')) {
    if (node.closest('.is-minimized, [hidden]')) continue;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const box = node.getBoundingClientRect();
    if (box.width > 0 || box.height > 0) return true;
  }
  return false;
}

function useIconTip(label: string, suspended: boolean, corner: boolean) {
  const hostRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  const openRef = useRef(false);
  const clamped = useRef<Place | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [shift, setShift] = useState(0);
  const [shiftY, setShiftY] = useState(0);
  const api = useRef({ close: () => {} });
  const token = useRef(() => {
    api.current.close();
  });

  api.current.close = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    openRef.current = false;
    if (closeCurrent === token.current) closeCurrent = null;
    setPlace(null);
    setShift(0);
    setShiftY(0);
  };

  const publish = () => {
    if (closeCurrent && closeCurrent !== token.current) closeCurrent();
    closeCurrent = token.current;
  };

  const show = (node: HTMLElement) => {
    hostRef.current = anchorOf(node);
    openRef.current = true;
    setShift(0);
    setShiftY(0);
    setPlace(measure(hostRef.current, corner));
    publish();
  };

  const clearClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = 0;
  };

  const pressed = useRef(false);

  const open = (node: HTMLElement, immediate: boolean) => {
    if (suspended || pressed.current) return;
    clearClose();
    window.clearTimeout(openTimer.current);
    if (openRef.current || immediate || Date.now() - lastLeftAt < SKIP_MS) show(node);
    else openTimer.current = window.setTimeout(() => show(node), OPEN_MS);
  };

  const armClose = () => {
    lastLeftAt = Date.now();
    window.clearTimeout(openTimer.current);
    if (closeTimer.current) return;
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = 0;
      api.current.close();
    }, GAP_MS);
  };

  useEffect(() => {
    if (suspended) api.current.close();
  }, [suspended]);

  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
      if (closeCurrent === token.current) closeCurrent = null;
    },
    [],
  );

  useEffect(() => {
    if (!place) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || visibleDialogOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      api.current.close();
    };
    const anchorVisible = () => {
      const node = hostRef.current;
      if (!node?.isConnected) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 || rect.height > 0;
    };
    const move = () => {
      if (!anchorVisible()) {
        api.current.close();
        return;
      }
      setShift(0);
      setShiftY(0);
      setPlace(measure(hostRef.current as HTMLElement, corner));
    };
    const onPointer = (event: globalThis.PointerEvent) => {
      if (holds(event.target, hostRef.current) || holds(event.target, tipRef.current)) {
        clearClose();
        return;
      }
      if (!anchorVisible()) {
        api.current.close();
        return;
      }
      armClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', move, true);
    window.addEventListener('resize', move);
    window.addEventListener('pointermove', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', move, true);
      window.removeEventListener('resize', move);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [place, corner]);

  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!place || !tip || clamped.current === place) return;
    const box = tip.getBoundingClientRect();
    const deltaX =
      box.left < EDGE
        ? EDGE - box.left
        : box.right > window.innerWidth - EDGE
          ? window.innerWidth - EDGE - box.right
          : 0;
    const deltaY = place.corner
      ? box.bottom > window.innerHeight - EDGE
        ? window.innerHeight - EDGE - box.bottom
        : box.top < EDGE
          ? EDGE - box.top
          : 0
      : 0;
    clamped.current = place;
    if (deltaX !== 0) setShift(deltaX);
    if (deltaY !== 0) setShiftY(deltaY);
  }, [place, shift, shiftY]);

  const onPointerDown = () => {
    pressed.current = true;
    window.clearTimeout(openTimer.current);
    api.current.close();
  };
  const onPointerEnter = (event: PointerEvent<HTMLElement>) => open(event.currentTarget, false);
  const onPointerLeave = (event: PointerEvent<HTMLElement>) => {
    pressed.current = false;
    if (holds(event.relatedTarget, tipRef.current)) return;
    armClose();
  };
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    if (pressed.current) return;
    open(event.currentTarget, true);
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (holds(event.relatedTarget, tipRef.current)) return;
    api.current.close();
  };

  const node =
    place === null
      ? null
      : createPortal(
          <span
            ref={tipRef}
            className="jieyu-icon-tip"
            data-side={place.corner ? 'corner' : place.below ? 'below' : 'above'}
            aria-hidden="true"
            style={{
              left: place.x,
              top: place.y,
              transform: place.corner
                ? `translate(calc(4px + ${shift}px), calc(4px + ${shiftY}px))`
                : place.below
                  ? `translate(calc(-50% + ${shift}px), 4px)`
                  : `translate(calc(-50% + ${shift}px), calc(-100% - 4px))`,
            }}
            onPointerEnter={clearClose}
            onPointerLeave={(event) => {
              if (holds(event.relatedTarget, hostRef.current)) return;
              armClose();
            }}
          >
            {label}
          </span>,
          document.body,
        );

  return { onPointerEnter, onPointerLeave, onPointerDown, onFocus, onBlur, node };
}

export const IconTipButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-label'> & { label: string }
>(function IconTipButton(
  { label, onPointerEnter, onPointerLeave, onPointerDown, onFocus, onBlur, children, ...rest },
  ref,
) {
  const tip = useIconTip(label, false, false);
  return (
    <span
      className="jieyu-icon-tip-host"
      onPointerEnter={tip.onPointerEnter}
      onPointerLeave={tip.onPointerLeave}
      onPointerDown={tip.onPointerDown}
    >
      <button
        {...rest}
        ref={ref}
        type="button"
        aria-label={label}
        onPointerEnter={(event) => {
          onPointerEnter?.(event);
          tip.onPointerEnter(event);
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event);
          tip.onPointerLeave(event);
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          tip.onPointerDown();
        }}
        onFocus={(event) => {
          onFocus?.(event);
          tip.onFocus(event);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          tip.onBlur(event);
        }}
      >
        {children}
      </button>
      {tip.node}
    </span>
  );
});

/** Icon-only control that is not a button, such as a disclosure summary. */
export function IconTipTrigger(props: {
  label: string;
  suspended?: boolean;
  /** Left rail: sit at the button’s bottom-right so the tip does not cover the icon above. */
  corner?: boolean;
  children: ReactElement<{
    onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
    onPointerLeave?: (event: PointerEvent<HTMLElement>) => void;
    onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
    onFocus?: (event: FocusEvent<HTMLElement>) => void;
    onBlur?: (event: FocusEvent<HTMLElement>) => void;
  }>;
}): ReactNode {
  const tip = useIconTip(props.label, props.suspended ?? false, props.corner ?? false);
  const child = props.children;
  return (
    <>
      {cloneElement(child, {
        onPointerEnter: (event: PointerEvent<HTMLElement>) => {
          child.props.onPointerEnter?.(event);
          tip.onPointerEnter(event);
        },
        onPointerLeave: (event: PointerEvent<HTMLElement>) => {
          child.props.onPointerLeave?.(event);
          tip.onPointerLeave(event);
        },
        onPointerDown: (event: PointerEvent<HTMLElement>) => {
          child.props.onPointerDown?.(event);
          tip.onPointerDown();
        },
        onFocus: (event: FocusEvent<HTMLElement>) => {
          child.props.onFocus?.(event);
          tip.onFocus(event);
        },
        onBlur: (event: FocusEvent<HTMLElement>) => {
          child.props.onBlur?.(event);
          tip.onBlur(event);
        },
      })}
      {tip.node}
    </>
  );
}
