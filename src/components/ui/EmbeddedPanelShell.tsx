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
  titleHeadingLevel?: 2 | 3;
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
  titleHeadingLevel = 3,
  titleClassName,
  actions,
  footer,
  children,
  ...divProps
}: EmbeddedPanelShellProps) {
  const hasHeader = title !== undefined || actions !== undefined;
  const TitleHeading = `h${titleHeadingLevel}` as const;
  const embeddedPanelLayoutStyleProps = layoutStyle !== undefined ? { style: layoutStyle } : {};

  return (
    <div
      className={joinClassNames(
        'embedded-panel-shell',
        'panel-design-match',
        'panel-design-match-dialog',
        className,
      )}
      {...embeddedPanelLayoutStyleProps}
      {...divProps}
    >
      {hasHeader ? (
        <div className={joinClassNames('dialog-header', headerClassName)} {...headerProps}>
          {title !== undefined ? (
            <TitleHeading className={joinClassNames('dialog-shell__title', titleClassName)}>
              {title}
            </TitleHeading>
          ) : (
            <span />
          )}
          {actions ? <div className="dialog-header-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={joinClassNames('dialog-body', bodyClassName)}>{children}</div>
      {footer ? (
        <div className={joinClassNames('dialog-footer', footerClassName)}>{footer}</div>
      ) : null}
    </div>
  );
}
