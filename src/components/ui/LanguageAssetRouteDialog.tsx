import { type ReactNode, useRef } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { DialogOverlay } from './DialogOverlay';
import { joinClassNames } from './classNames';

interface LanguageAssetRouteDialogProps {
  ariaLabel: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  surfaceClassName?: string;
  surfaceVariant?: 'default' | 'workspace';
}

export function LanguageAssetRouteDialog({
  ariaLabel,
  closeLabel,
  onClose,
  children,
  className,
  surfaceClassName,
  surfaceVariant = 'default',
}: LanguageAssetRouteDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, true, onClose);

  return (
    <DialogOverlay
      onClose={onClose}
      topmost
      closeOn="mousedown"
      className={joinClassNames('language-asset-route-dialog-overlay', className)}
    >
      <div className="app-modal-panel-frame language-asset-modal-frame" role="presentation">
        <div
          ref={containerRef}
          className={joinClassNames(
            'language-asset-modal-surface',
            surfaceVariant === 'workspace' ? 'language-asset-modal-surface--workspace' : '',
            surfaceClassName,
          )}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="language-asset-modal-close icon-btn"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
          >
            <X size={16} />
          </button>
          {children}
        </div>
      </div>
    </DialogOverlay>
  );
}