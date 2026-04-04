import type { HTMLAttributes, ReactNode } from 'react';

interface EmbeddedPanelShellProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
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

function joinClassNames(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(' ');
}

export function EmbeddedPanelShell({
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
