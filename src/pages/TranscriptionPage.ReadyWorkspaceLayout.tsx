/**
 * ReadyWorkspace 渲染壳组件 | ReadyWorkspace render shell component
 *
 * 仅负责 ready workspace 的页面拼装，不承载业务编排。| Only composes the ready workspace view and keeps business orchestration out of the page shell.
 */

import { Suspense, lazy } from 'react';
import type { CSSProperties, ContextType, ReactNode, RefObject } from 'react';
import { TimelineRailSection, TimelineScrollSection } from '../components/transcription/TranscriptionTimelineSections';
import { BottomToolbarSection, ObserverStatusSection, TimelineMainSection, ToolbarLeftSection, ToolbarRightSection, ZoomControlsSection } from '../components/transcription/TranscriptionLayoutSections';
import { TimelineStyledSection } from '../components/transcription/TimelineStyledContainer';
import { LeftRailProjectHub } from '../components/transcription/LeftRailProjectHub';
import { CollaborationConflictReviewDrawer } from '../components/transcription/CollaborationConflictReviewDrawer';
import { TranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { AiPanelContext } from '../contexts/AiPanelContext';
import { ToastProvider } from '../contexts/ToastContext';
import { t, tf, type Locale } from '../i18n';
import { LayerActionPopover } from '../components/LayerActionPopover';
import { ToastController } from './TranscriptionPage.ToastController';
import { TranscriptionPageAiPanelHandle } from './TranscriptionPage.AiPanelHandle';
import { RecoveryBanner, TranscriptionOverlays, TranscriptionPageAiSidebar, TranscriptionPageAssistantBridge, TranscriptionPageBatchOps, TranscriptionPageDialogs, TranscriptionPagePdfRuntime, TranscriptionPageSidePane, TranscriptionPageTimelineContent, TranscriptionPageTimelineTop, TranscriptionPageToolbar } from './TranscriptionPage.ReadyWorkspace.runtime';

const OrchestratorWaveformContent = lazy(async () => {
  const mod = await import('./OrchestratorWaveformContent');
  return { default: mod.OrchestratorWaveformContent };
});

interface RecoveryBannerProps {
  shouldRender: boolean;
  recoveryAvailable: boolean;
  recoveryDiffSummary: React.ComponentProps<typeof RecoveryBanner>['recoveryDiffSummary'];
  onApply: () => void;
  onDismiss: () => void;
}

interface TimelineResizeTooltip {
  x: number;
  y: number;
  start: number;
  end: number;
}

type ZoomControlsProps = React.ComponentProps<typeof ZoomControlsSection>;
type HistoryControlsProps = React.ComponentProps<typeof ToolbarRightSection>;

interface BatchOpsSectionProps {
  shouldRender: boolean;
  props: React.ComponentProps<typeof TranscriptionPageBatchOps>;
}

interface AssistantBridgeSectionProps {
  controllerInput: React.ComponentProps<typeof TranscriptionPageAssistantBridge>['controllerInput'];
  onRuntimeStateChange: React.ComponentProps<typeof TranscriptionPageAssistantBridge>['onRuntimeStateChange'];
}

interface MediaInputProps {
  ref: RefObject<HTMLInputElement | null>;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}

interface WorkspaceAreaProps {
  waveformSectionRef: RefObject<HTMLElement | null>;
  workspaceRef: RefObject<HTMLElement | null>;
  listMainRef: RefObject<HTMLDivElement | null>;
  tierContainerRef: RefObject<HTMLDivElement | null>;
  isAiPanelCollapsed: boolean;
  isTimelineLaneHeaderCollapsed: boolean;
  readyWorkspaceWaveformContentProps: React.ComponentProps<typeof OrchestratorWaveformContent>;
  timelineTopProps: React.ComponentProps<typeof TranscriptionPageTimelineTop>;
  readyWorkspaceSidePaneProps: React.ComponentProps<typeof TranscriptionPageSidePane>;
  timelineContentProps: React.ComponentProps<typeof TranscriptionPageTimelineContent>;
  editorContextValue: ContextType<typeof TranscriptionEditorContext>;
  aiPanelContextValue: ContextType<typeof AiPanelContext>;
  lassoHandlers: {
    onPointerDown: React.PointerEventHandler<HTMLElement>;
    onPointerMove: React.PointerEventHandler<HTMLElement>;
    onPointerUp: React.PointerEventHandler<HTMLElement>;
    onScroll: React.UIEventHandler<HTMLElement>;
  };
  timelineResizeTooltip: TimelineResizeTooltip | null;
  formatTime: (value: number) => string;
  zoomControlsProps: ZoomControlsProps;
  historyControlsProps: HistoryControlsProps;
  aiPanelHandleProps: React.ComponentProps<typeof TranscriptionPageAiPanelHandle>;
  assistantBridge: AssistantBridgeSectionProps;
  aiSidebarProps: React.ComponentProps<typeof TranscriptionPageAiSidebar>;
  shouldRenderAiSidebar: boolean;
  dialogsProps: React.ComponentProps<typeof TranscriptionPageDialogs>;
  shouldRenderDialogs: boolean;
  pdfRuntimeProps: React.ComponentProps<typeof TranscriptionPagePdfRuntime>;
  shouldRenderPdfRuntime: boolean;
}

interface ReadyStageProps {
  toastProps: React.ComponentProps<typeof ToastController>;
  recoveryBannerProps: RecoveryBannerProps;
  collaborationCloudStatusSlot?: ReactNode;
  toolbarProps: React.ComponentProps<typeof TranscriptionPageToolbar>;
  observerProps: React.ComponentProps<typeof ObserverStatusSection>;
  acousticRuntimeStatus: React.ComponentProps<typeof TranscriptionPageToolbar>['acousticRuntimeStatus'];
  vadCacheStatus: React.ComponentProps<typeof TranscriptionPageToolbar>['vadCacheStatus'];
  projectHubProps: React.ComponentProps<typeof LeftRailProjectHub>;
  mediaInputProps: MediaInputProps;
  workspaceAreaProps: WorkspaceAreaProps;
  batchOpsSection: BatchOpsSectionProps;
}

export interface TranscriptionPageReadyWorkspaceLayoutProps {
  locale: Locale;
  phase: 'loading' | 'error' | 'ready' | string;
  errorMessage?: string;
  screenRef: RefObject<HTMLElement | null>;
  dir: 'ltr' | 'rtl' | 'auto';
  layoutStyle: CSSProperties;
  readyStageProps: ReadyStageProps;
  overlaysProps: React.ComponentProps<typeof TranscriptionOverlays>;
  layerPopoverProps: React.ComponentProps<typeof LayerActionPopover> | null;
  conflictReviewDrawerProps?: React.ComponentProps<typeof CollaborationConflictReviewDrawer>;
}

function ReadyStageContent({
  locale,
  toastProps,
  recoveryBannerProps,
  collaborationCloudStatusSlot,
  toolbarProps,
  observerProps,
  acousticRuntimeStatus,
  vadCacheStatus,
  projectHubProps,
  mediaInputProps,
  workspaceAreaProps,
  batchOpsSection,
}: ReadyStageProps & { locale: Locale }) {
  const {
    waveformSectionRef,
    workspaceRef,
    listMainRef,
    tierContainerRef,
    isAiPanelCollapsed,
    isTimelineLaneHeaderCollapsed,
    readyWorkspaceWaveformContentProps,
    timelineTopProps,
    readyWorkspaceSidePaneProps,
    timelineContentProps,
    editorContextValue,
    aiPanelContextValue,
    lassoHandlers,
    timelineResizeTooltip,
    formatTime,
    zoomControlsProps,
    historyControlsProps,
    aiPanelHandleProps,
    assistantBridge,
    aiSidebarProps,
    shouldRenderAiSidebar,
    dialogsProps,
    shouldRenderDialogs,
    pdfRuntimeProps,
    shouldRenderPdfRuntime,
  } = workspaceAreaProps;

  return (
    <>
      <ToastProvider>
        <ToastController {...toastProps} />
        {recoveryBannerProps.shouldRender ? (
          <Suspense fallback={null}>
            <RecoveryBanner
              locale={locale}
              recoveryAvailable={recoveryBannerProps.recoveryAvailable}
              recoveryDiffSummary={recoveryBannerProps.recoveryDiffSummary}
              onApply={recoveryBannerProps.onApply}
              onDismiss={recoveryBannerProps.onDismiss}
            />
          </Suspense>
        ) : null}

        {collaborationCloudStatusSlot}

        <section className="transcription-waveform" ref={waveformSectionRef}>
          <Suspense fallback={null}>
            <TranscriptionPageToolbar
              {...toolbarProps}
              leftToolbarExtras={(
                <>
                  <ObserverStatusSection {...observerProps} />
                  {toolbarProps.leftToolbarExtras ? (
                    <>
                      <span className="transcription-toolbar-sep transcription-wave-toolbar-extras-sep" aria-hidden="true" />
                      {toolbarProps.leftToolbarExtras}
                    </>
                  ) : null}
                </>
              )}
              {...(acousticRuntimeStatus ? { acousticRuntimeStatus } : {})}
              {...(vadCacheStatus ? { vadCacheStatus } : {})}
            />
          </Suspense>
        </section>

        <LeftRailProjectHub {...projectHubProps} />

        <input
          ref={mediaInputProps.ref}
          type="file"
          className="transcription-media-file-input"
          accept=".mp3,.wav,.ogg,.webm,.m4a,.flac,.aac,.mp4,.webm,.mov,.avi,.mkv"
          aria-label={t(locale, 'transcription.importDialog.selectMedia')}
          onChange={mediaInputProps.onChange}
        />

        <section
          ref={workspaceRef}
          className={`transcription-workspace ${isAiPanelCollapsed ? 'transcription-workspace-ai-collapsed' : ''}`}
        >
          <section
            className={`transcription-list-panel ${isTimelineLaneHeaderCollapsed ? 'transcription-list-panel-lane-header-collapsed' : ''}`}
          >
            <Suspense fallback={<div className="transcription-waveform-area-suspense-fallback" aria-hidden="true" />}>
              <OrchestratorWaveformContent {...readyWorkspaceWaveformContentProps} />
            </Suspense>
            <Suspense fallback={<div className="transcription-timeline-top-suspense-fallback" aria-hidden="true" />}>
              <TranscriptionPageTimelineTop {...timelineTopProps} />
            </Suspense>
            <TimelineMainSection
              containerRef={listMainRef}
              className={`transcription-list-main ${isTimelineLaneHeaderCollapsed ? 'transcription-list-main-lane-header-collapsed' : ''}`}
            >
              <TimelineRailSection>
                <Suspense fallback={<div className="transcription-side-pane transcription-side-pane-placeholder" aria-hidden="true" />}>
                  <TranscriptionPageSidePane {...readyWorkspaceSidePaneProps} />
                </Suspense>
              </TimelineRailSection>

              <TimelineScrollSection
                containerRef={tierContainerRef}
                onPointerDown={lassoHandlers.onPointerDown}
                onPointerMove={lassoHandlers.onPointerMove}
                onPointerUp={lassoHandlers.onPointerUp}
                onScroll={lassoHandlers.onScroll}
              >
                <TranscriptionEditorContext.Provider value={editorContextValue}>
                  <Suspense
                    fallback={(
                      <div className="timeline-scroll-suspense-fallback" aria-hidden="true">
                        <div className="timeline-scroll-suspense-fallback-row" />
                        <div className="timeline-scroll-suspense-fallback-row" />
                        <div className="timeline-scroll-suspense-fallback-row" />
                      </div>
                    )}
                  >
                    <TranscriptionPageTimelineContent {...timelineContentProps} />
                  </Suspense>
                </TranscriptionEditorContext.Provider>
              </TimelineScrollSection>
            </TimelineMainSection>

            {timelineResizeTooltip ? (
              <div
                className="timeline-resize-tooltip"
                style={{ left: timelineResizeTooltip.x, top: timelineResizeTooltip.y - 16 }}
              >
                {formatTime(timelineResizeTooltip.start)} - {formatTime(timelineResizeTooltip.end)}
              </div>
            ) : null}

            <BottomToolbarSection>
              <ToolbarLeftSection>
                <ZoomControlsSection {...zoomControlsProps} />
              </ToolbarLeftSection>
              <ToolbarRightSection {...historyControlsProps} />
            </BottomToolbarSection>
          </section>

          <TranscriptionPageAiPanelHandle {...aiPanelHandleProps} />

          <Suspense fallback={null}>
            <TranscriptionPageAssistantBridge
              controllerInput={assistantBridge.controllerInput}
              onRuntimeStateChange={assistantBridge.onRuntimeStateChange}
            />
          </Suspense>

          <AiPanelContext.Provider value={aiPanelContextValue}>
            <Suspense fallback={null}>
              <TranscriptionPageAiSidebar
                {...aiSidebarProps}
                shouldRenderRuntime={shouldRenderAiSidebar}
              />
            </Suspense>
          </AiPanelContext.Provider>

          {shouldRenderDialogs ? (
            <Suspense fallback={null}>
              <TranscriptionPageDialogs {...dialogsProps} />
            </Suspense>
          ) : null}
          {shouldRenderPdfRuntime ? (
            <Suspense fallback={null}>
              <TranscriptionPagePdfRuntime {...pdfRuntimeProps} />
            </Suspense>
          ) : null}
        </section>
      </ToastProvider>

      {batchOpsSection.shouldRender ? (
        <Suspense fallback={null}>
          <TranscriptionPageBatchOps {...batchOpsSection.props} />
        </Suspense>
      ) : null}
    </>
  );
}

export function TranscriptionPageReadyWorkspaceLayout({
  locale,
  phase,
  errorMessage,
  screenRef,
  dir,
  layoutStyle,
  readyStageProps,
  overlaysProps,
  layerPopoverProps,
  conflictReviewDrawerProps,
}: TranscriptionPageReadyWorkspaceLayoutProps) {
  return (
    <TimelineStyledSection
      className="transcription-screen"
      ref={screenRef}
      dir={dir}
      layoutStyle={layoutStyle}
    >
      {phase === 'loading' ? <p className="hint">{t(locale, 'transcription.status.loading')}</p> : null}
      {phase === 'error' ? <p className="error">{tf(locale, 'transcription.status.dbError', { message: errorMessage ?? '' })}</p> : null}
      {phase === 'ready' ? <ReadyStageContent locale={locale} {...readyStageProps} /> : null}
      {phase === 'ready' && conflictReviewDrawerProps ? <CollaborationConflictReviewDrawer {...conflictReviewDrawerProps} /> : null}

      <Suspense fallback={null}>
        <TranscriptionOverlays {...overlaysProps} />
      </Suspense>
      {layerPopoverProps ? <LayerActionPopover {...layerPopoverProps} /> : null}
    </TimelineStyledSection>
  );
}
