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
    return (
      <div {...divProps} ref={ref} style={layoutStyle}>
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
  return (
    <button {...buttonProps} style={layoutStyle}>
      {children}
    </button>
  );
}

export function TimelineStyledSection({
  layoutStyle,
  children,
  ...sectionProps
}: TimelineStyledSectionProps) {
  return (
    <section {...sectionProps} style={layoutStyle}>
      {children}
    </section>
  );
}