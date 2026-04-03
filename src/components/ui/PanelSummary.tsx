import type { ReactNode } from 'react';
import { PanelSection } from './PanelSection';

interface PanelSummaryProps {
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  title?: ReactNode;
  titleClassName?: string;
  description?: ReactNode;
  descriptionClassName?: string;
  meta?: ReactNode;
  supportingText?: ReactNode;
  supportingClassName?: string;
  children?: ReactNode;
}

function joinClassNames(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(' ');
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
