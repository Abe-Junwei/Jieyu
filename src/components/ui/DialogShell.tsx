import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { joinClassNames } from './classNames';

interface DialogShellProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  containerRef?: Ref<HTMLDivElement>;
  layoutStyle?: React.CSSProperties | undefined;
  className?: string;
  headerClassName?: string;
  headerProps?: HTMLAttributes<HTMLDivElement>;
  bodyClassName?: string;
  footerClassName?: string;
  title?: ReactNode;
  titleClassName?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  compact?: boolean;
  wide?: boolean;
  children: ReactNode;
}

export function DialogShell({
  containerRef,
  layoutStyle,
  className,
  headerClassName,
  headerProps,
  bodyClassName,
  footerClassName,
  title,
  titleClassName,
  actions,
  footer,
  compact = false,
  wide = false,
  children,
  ...divProps
}: DialogShellProps) {
  const hasHeader = title !== undefined || actions !== undefined;

  return (
    <div
      ref={containerRef}
      className={joinClassNames(
        'dialog-card',
        'panel-design-match',
        'panel-design-match-dialog',
        compact && 'dialog-card-compact',
        wide && 'dialog-card-wide',
        className,
      )}
      style={layoutStyle}
      {...divProps}
    >
      {hasHeader ? (
        <div className={joinClassNames('dialog-header', headerClassName)} {...headerProps}>
          {title !== undefined ? <h3 className={joinClassNames('dialog-shell__title', titleClassName)}>{title}</h3> : <span />}
          {actions ? <div className="dialog-header-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={joinClassNames('dialog-body', bodyClassName)}>{children}</div>
      {footer ? <div className={joinClassNames('dialog-footer', footerClassName)}>{footer}</div> : null}
    </div>
  );
}
