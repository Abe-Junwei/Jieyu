import type { ElementType, ReactNode } from 'react';
import { joinClassNames } from './classNames';

interface PanelSectionProps {
  as?: ElementType;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  title?: ReactNode;
  titleClassName?: string;
  description?: ReactNode;
  descriptionClassName?: string;
  meta?: ReactNode;
  metaClassName?: string;
  emphasis?: boolean;
  children?: ReactNode;
}

export function PanelSection({
  as: Tag = 'section',
  className,
  headerClassName,
  bodyClassName,
  title,
  titleClassName,
  description,
  descriptionClassName,
  meta,
  metaClassName,
  emphasis = false,
  children,
}: PanelSectionProps) {
  const hasHeader = title !== undefined || description !== undefined || meta !== undefined;

  return (
    <Tag className={joinClassNames('panel-section', emphasis && 'panel-section--emphasis', className)}>
      {hasHeader ? (
        <div className={joinClassNames('panel-section__header', headerClassName)}>
          {(title !== undefined || description !== undefined) ? (
            <div className="panel-section__copy">
              {title !== undefined ? <div className={joinClassNames('panel-section__title', titleClassName)}>{title}</div> : null}
              {description !== undefined ? <p className={joinClassNames('panel-section__description', descriptionClassName)}>{description}</p> : null}
            </div>
          ) : null}
          {meta ? <div className={joinClassNames('panel-section__meta', metaClassName)}>{meta}</div> : null}
        </div>
      ) : null}
      {children ? <div className={joinClassNames('panel-section__body', bodyClassName)}>{children}</div> : null}
    </Tag>
  );
}
