import type { CSSProperties, KeyboardEventHandler, FocusEventHandler, MouseEventHandler, WheelEventHandler, ReactNode, Ref } from 'react';
import ZoomControls, { type ZoomControlsProps } from './toolbar/ZoomControls';
import ObserverStatus, { type ObserverStatusProps } from './toolbar/ObserverStatus';
import UndoHistory, { type UndoHistoryProps } from './toolbar/UndoHistory';

type WaveformAreaSectionProps = {
  containerRef?: Ref<HTMLDivElement>;
  className: string;
  style?: CSSProperties;
  tabIndex?: number;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  onMouseMove?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  onWheel?: WheelEventHandler<HTMLDivElement>;
  children: ReactNode;
};

export function WaveformAreaSection({
  containerRef,
  className,
  style,
  tabIndex,
  onKeyDown,
  onFocus,
  onBlur,
  onMouseMove,
  onMouseLeave,
  onWheel,
  children,
}: WaveformAreaSectionProps) {
  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onWheel={onWheel}
    >
      {children}
    </div>
  );
}

type TimelineMainSectionProps = {
  containerRef?: Ref<HTMLDivElement>;
  className: string;
  children: ReactNode;
};

export function TimelineMainSection({ containerRef, className, children }: TimelineMainSectionProps) {
  return (
    <div ref={containerRef} className={className}>
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
