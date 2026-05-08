import { forwardRef, type ComponentProps, type ComponentPropsWithoutRef, type CSSProperties, type ReactNode } from 'react';

type TimelineStyledContainerProps = Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'style'> & {
  layoutStyle: CSSProperties;
  children: ReactNode;
};

type TimelineStyledButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'style'> & {
  layoutStyle: CSSProperties;
  children: ReactNode;
};

type TimelineStyledSectionProps = Omit<ComponentProps<'section'>, 'children' | 'style'> & {
  layoutStyle: CSSProperties;
  children: ReactNode;
};

export const TimelineStyledContainer = forwardRef<HTMLDivElement, TimelineStyledContainerProps>(
  function TimelineStyledContainer({ layoutStyle, children, ...divProps }, ref) {
    const layoutProps = { style: layoutStyle };
    return (
      <div {...divProps} {...layoutProps} ref={ref}>
        {children}
      </div>
    );
  },
);

export function TimelineStyledButton({
  layoutStyle,
  children,
  ...buttonProps
}: TimelineStyledButtonProps) {
  const layoutProps = { style: layoutStyle };
  return (
    <button {...buttonProps} {...layoutProps}>
      {children}
    </button>
  );
}

export function TimelineStyledSection({
  layoutStyle,
  children,
  ...sectionProps
}: TimelineStyledSectionProps) {
  const layoutProps = { style: layoutStyle };
  return (
    <section {...sectionProps} {...layoutProps}>
      {children}
    </section>
  );
}