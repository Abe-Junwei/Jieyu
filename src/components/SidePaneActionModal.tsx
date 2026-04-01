import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

interface SidePaneActionModalProps {
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}

export function SidePaneActionModal({ ariaLabel, children, onClose, className }: SidePaneActionModalProps) {
  const isSpeakerModal = Boolean(className?.includes('transcription-side-pane-action-popover-speaker-centered'));
  const defaultSize = useMemo(
    () => (isSpeakerModal ? { width: 560, height: 560 } : { width: 340, height: 200 }),
    [isSpeakerModal],
  );
  const minSize = useMemo(
    () => (isSpeakerModal ? { width: 420, height: 320 } : { width: 280, height: 160 }),
    [isSpeakerModal],
  );

  const clampSize = useCallback((raw: { width: number; height: number }) => {
    const viewportPadding = 16;
    const maxWidth = Math.max(minSize.width, window.innerWidth - viewportPadding * 2);
    const maxHeight = Math.max(minSize.height, window.innerHeight - viewportPadding * 2);
    return {
      width: Math.min(Math.max(raw.width, minSize.width), maxWidth),
      height: Math.min(Math.max(raw.height, minSize.height), maxHeight),
    };
  }, [minSize.height, minSize.width]);

  const centerPosition = useCallback((panelSize: { width: number; height: number }) => ({
    x: Math.max(16, Math.round((window.innerWidth - panelSize.width) / 2)),
    y: Math.max(16, Math.round((window.innerHeight - panelSize.height) / 2)),
  }), []);

  const clampPosition = useCallback((raw: { x: number; y: number }, panelSize: { width: number; height: number }) => {
    const viewportPadding = 16;
    const maxX = Math.max(viewportPadding, window.innerWidth - panelSize.width - viewportPadding);
    const maxY = Math.max(viewportPadding, window.innerHeight - panelSize.height - viewportPadding);
    return {
      x: Math.min(Math.max(raw.x, viewportPadding), maxX),
      y: Math.min(Math.max(raw.y, viewportPadding), maxY),
    };
  }, []);

  const [size, setSize] = useState(() => clampSize(defaultSize));
  const [position, setPosition] = useState(() => centerPosition(clampSize(defaultSize)));
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const currentPositionRef = useRef(position);
  const currentSizeRef = useRef(size);

  useEffect(() => {
    currentPositionRef.current = position;
  }, [position]);

  useEffect(() => {
    currentSizeRef.current = size;
  }, [size]);

  useEffect(() => {
    const safeSize = clampSize(defaultSize);
    setSize(safeSize);
    setPosition(centerPosition(safeSize));
  }, [ariaLabel, centerPosition, clampSize, defaultSize]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (dragRef.current) {
        const next = {
          x: dragRef.current.startLeft + (event.clientX - dragRef.current.startX),
          y: dragRef.current.startTop + (event.clientY - dragRef.current.startY),
        };
        setPosition(clampPosition(next, currentSizeRef.current));
      }

      if (resizeRef.current) {
        const nextSize = clampSize({
          width: resizeRef.current.startWidth + (event.clientX - resizeRef.current.startX),
          height: resizeRef.current.startHeight + (event.clientY - resizeRef.current.startY),
        });
        setSize(nextSize);
        setPosition((prev) => clampPosition(prev, nextSize));
      }
    };

    const onPointerUp = () => {
      if (!dragRef.current && !resizeRef.current) return;
      dragRef.current = null;
      resizeRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [clampPosition, clampSize]);

  useEffect(() => {
    const onResize = () => {
      setSize((prev) => {
        const safe = clampSize(prev);
        setPosition((old) => clampPosition(old, safe));
        return safe;
      });
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampPosition, clampSize]);

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: currentPositionRef.current.x,
      startTop: currentPositionRef.current.y,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'move';
  };

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: currentSizeRef.current.width,
      startHeight: currentSizeRef.current.height,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
  };

  const handleResetLayout = (event?: ReactMouseEvent<HTMLElement>) => {
    event?.stopPropagation();
    const safe = clampSize(defaultSize);
    setSize(safe);
    setPosition(centerPosition(safe));
  };

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="layer-action-popover-backdrop"
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={className ?? 'transcription-side-pane-action-popover transcription-side-pane-action-popover-centered floating-panel'}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          transform: 'none',
        }}
      >
        <div
          className="transcription-side-pane-action-popover-title floating-panel-title-row floating-panel-drag-handle"
          onPointerDown={handleDragStart}
          onDoubleClick={() => handleResetLayout()}
          title="Drag to move, double-click to recenter and reset size"
        >
          <span>{ariaLabel}</span>
          <button
            type="button"
            className="floating-panel-reset-btn"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleResetLayout}
            aria-label="Reset position and size"
            title="Reset position and size"
          >
            ↺
          </button>
        </div>
        <div className="transcription-side-pane-action-popover-body">
          {children}
        </div>
        <div className="floating-panel-resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
      </div>
    </div>,
    document.body,
  );
}