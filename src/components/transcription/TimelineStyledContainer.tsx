import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react';

type TimelineStyledContainerProps = Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'style'> & {
  layoutStyle: CSSProperties;
  children: ReactNode;
};

type TimelineStyledButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'style'> & {
  layoutStyle: CSSProperties;
  children: ReactNode;
};

type TimelineStyledSectionProps = Omit<ComponentPropsWithoutRef<'section'>, 'children' | 'style'> & {
  layoutStyle: CSSProperties;
  children: ReactNode;
};

export function TimelineStyledContainer({
  layoutStyle,
  children,
  ...divProps
}: TimelineStyledContainerProps) {
  return (
    <div {...divProps} style={layoutStyle}>
      {children}
    </div>
  );
}

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