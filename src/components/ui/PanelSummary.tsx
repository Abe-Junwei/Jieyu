import type { ReactNode } from 'react';
import { PanelSection } from './PanelSection';
import { joinClassNames } from './classNames';

interface PanelSummaryProps {
  className?: string | undefined;
  headerClassName?: string | undefined;
  bodyClassName?: string | undefined;
  title?: ReactNode | undefined;
  titleClassName?: string | undefined;
  description?: ReactNode | undefined;
  descriptionClassName?: string | undefined;
  meta?: ReactNode | undefined;
  supportingText?: ReactNode | undefined;
  supportingClassName?: string | undefined;
  children?: ReactNode | undefined;
}

export function PanelSummary({
  className,
  headerClassName,
  bodyClassName,
  title,
  titleClassName,
  description,
  descriptionClassName,
  meta,
  supportingText,
  supportingClassName,
  children,
}: PanelSummaryProps) {
  const optionalProps = {
    ...(headerClassName ? { headerClassName } : {}),
    ...(bodyClassName ? { bodyClassName } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(titleClassName ? { titleClassName } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(descriptionClassName ? { descriptionClassName } : {}),
    ...(meta !== undefined ? { meta } : {}),
  };

  return (
    <PanelSection
      className={joinClassNames('panel-summary', className)}
      emphasis
      {...optionalProps}
    >
      {supportingText ? <p className={joinClassNames('panel-summary__supporting', supportingClassName)}>{supportingText}</p> : null}
      {children}
    </PanelSection>
  );
}
