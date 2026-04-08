import {
  useMemo,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLocale } from '../i18n';
import { computeAdaptivePanelWidth } from '../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../hooks/useViewportWidth';
import { DialogOverlay, DialogShell } from './ui';

interface SidePaneActionModalProps {
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  closeLabel?: string;
  footer?: ReactNode;
  widthPreset?: 'standard' | 'wide';
  open?: boolean;
  keepMounted?: boolean;
}

export function SidePaneActionModal({
  ariaLabel,
  children,
  onClose,
  className,
  closeLabel = 'Close',
  footer,
  widthPreset = 'standard',
  open = true,
  keepMounted = false,
}: SidePaneActionModalProps) {
  const locale = useLocale();
  const { uiTextDirection, uiFontScale } = useUiFontScaleRuntime(locale);
  const viewportWidth = useViewportWidth();
  const isSpeakerModal = Boolean(
    className?.includes('side-pane-dialog-speaker'),
  );
  const isWideModal = widthPreset === 'wide';
  const dialogAutoWidth = useMemo(() => {
    const base = computeAdaptivePanelWidth({
      baseWidth: isSpeakerModal || isWideModal ? 560 : 340,
      locale,
      direction: uiTextDirection,
      uiFontScale,
      density: 'compact',
      minWidth: isSpeakerModal || isWideModal ? 460 : 280,
      maxWidth: 620,
      ...(viewportWidth !== undefined ? { viewportWidth } : {}),
    });
    return Math.max(isSpeakerModal || isWideModal ? 460 : 300, Math.min(620, base));
  }, [isSpeakerModal, isWideModal, locale, uiFontScale, uiTextDirection, viewportWidth]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  const hidden = !open;

  if (typeof document === 'undefined') {
    return null;
  }

  if (hidden && !keepMounted) {
    return null;
  }

  return createPortal(
    <DialogOverlay
      onClose={onClose}
      topmost
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      hidden={hidden}
      aria-hidden={hidden ? 'true' : undefined}
      style={hidden ? { display: 'none' } : undefined}
    >
      <DialogShell
        className={`side-pane-action-modal${isSpeakerModal ? ' side-pane-action-modal-speaker' : ''}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        dir={uiTextDirection}
        title={ariaLabel}
        bodyClassName="side-pane-action-modal-body"
        footer={footer}
        actions={(
          <button
            type="button"
            className="icon-btn"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
            aria-label={`${ariaLabel} ${closeLabel}`}
            title={`${ariaLabel} ${closeLabel}`}
          >
            <X size={18} />
          </button>
        )}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        style={{ '--dialog-auto-width': `${dialogAutoWidth}px` } as React.CSSProperties}
      >
        {children}
      </DialogShell>
    </DialogOverlay>,
    document.body,
  );
}