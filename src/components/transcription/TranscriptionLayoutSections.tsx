import type { ComponentPropsWithoutRef, CSSProperties, ReactNode, Ref } from 'react';
import ZoomControls, { type ZoomControlsProps } from './toolbar/ZoomControls';
import ObserverStatus, { type ObserverStatusProps } from './toolbar/ObserverStatus';
import UndoHistory, { type UndoHistoryProps } from './toolbar/UndoHistory';

type WaveformAreaSectionProps = Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'ref' | 'style'> & {
  containerRef?: Ref<HTMLDivElement>;
  layoutStyle?: CSSProperties;
  children: ReactNode;
};

export function WaveformAreaSection({
  containerRef,
  layoutStyle,
  children,
  ...divProps
}: WaveformAreaSectionProps) {
  return (
    <div
      ref={containerRef}
      style={layoutStyle}
      {...divProps}
    >
      {children}
    </div>
  );
}

type TimelineMainSectionProps = Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'ref'> & {
  containerRef?: Ref<HTMLDivElement>;
  children: ReactNode;
};

export function TimelineMainSection({ containerRef, children, ...divProps }: TimelineMainSectionProps) {
  return (
    <div ref={containerRef} {...divProps}>
      {children}
    </div>
  );
}

type BottomToolbarSectionProps = {
  children: ReactNode;
};

export function BottomToolbarSection({ children }: BottomToolbarSectionProps) {
  return <div className="transcription-list-toolbar transcription-list-toolbar-zoom-only">{children}</div>;
}

type ToolbarLeftSectionProps = {
  children: ReactNode;
};

export function ToolbarLeftSection({ children }: ToolbarLeftSectionProps) {
  return <div className="transcription-list-toolbar-left">{children}</div>;
}

type ToolbarRightSectionProps = UndoHistoryProps;

export function ToolbarRightSection(props: ToolbarRightSectionProps) {
  return (
    <div className="transcription-list-toolbar-right">
      <UndoHistory {...props} />
    </div>
  );
}

type ZoomControlsSectionProps = ZoomControlsProps;

export function ZoomControlsSection(props: ZoomControlsSectionProps) {
  return (
    <div className="waveform-zoom-bar waveform-zoom-bar-bottom">
      <ZoomControls {...props} />
    </div>
  );
}

type ObserverStatusSectionProps = ObserverStatusProps;

export function ObserverStatusSection(props: ObserverStatusSectionProps) {
  return (
    <div className="transcription-ai-observer-status-bar">
      <ObserverStatus {...props} />
    </div>
  );
}
