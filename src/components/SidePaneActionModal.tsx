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
import { DialogShell } from './ui/DialogShell';

interface SidePaneActionModalProps {
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  closeLabel?: string;
}

export function SidePaneActionModal({ ariaLabel, children, onClose, className, closeLabel = 'Close' }: SidePaneActionModalProps) {
  const locale = useLocale();
  const { uiTextDirection, uiFontScale } = useUiFontScaleRuntime(locale);
  const viewportWidth = useViewportWidth();
  const isSpeakerModal = Boolean(
    className?.includes('side-pane-dialog-speaker'),
  );
  const dialogAutoWidth = useMemo(() => {
    const base = computeAdaptivePanelWidth({
      baseWidth: isSpeakerModal ? 560 : 340,
      locale,
      direction: uiTextDirection,
      uiFontScale,
      density: isSpeakerModal ? 'data-dense' : 'compact',
      minWidth: isSpeakerModal ? 460 : 280,
      maxWidth: isSpeakerModal ? 900 : 620,
      ...(viewportWidth !== undefined ? { viewportWidth } : {}),
    });
    return Math.max(isSpeakerModal ? 460 : 300, Math.min(isSpeakerModal ? 900 : 620, base));
  }, [isSpeakerModal, locale, uiFontScale, uiTextDirection, viewportWidth]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="dialog-overlay dialog-overlay-topmost"
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <DialogShell
        className={`side-pane-action-modal${isSpeakerModal ? ' side-pane-action-modal-speaker' : ''}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        dir={uiTextDirection}
        title={ariaLabel}
        bodyClassName="side-pane-action-modal-body"
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
    </div>,
    document.body,
  );
}