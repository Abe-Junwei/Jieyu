import type { HTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from './classNames';

interface EmbeddedPanelShellProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  layoutStyle?: React.CSSProperties;
  className?: string;
  headerClassName?: string;
  headerProps?: HTMLAttributes<HTMLDivElement>;
  bodyClassName?: string;
  footerClassName?: string;
  title?: ReactNode;
  titleClassName?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function EmbeddedPanelShell({
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
  children,
  ...divProps
}: EmbeddedPanelShellProps) {
  const hasHeader = title !== undefined || actions !== undefined;

  return (
    <div
      className={joinClassNames(
        'embedded-panel-shell',
        'panel-design-match',
        'panel-design-match-dialog',
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
