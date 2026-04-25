import React, { useState, useCallback, useMemo } from 'react';
import type { LayerLinkDocType, LayerDocType, LayerDisplaySettings, OrthographyDocType } from '../db';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import { buildLayerBundles } from '../services/LayerOrderingService';
import { buildLayerLinkConnectorLayout, getLayerLinkStackWidth } from '../utils/layerLinkConnector';
import { useLocale, t, tf, type Locale } from '../i18n';
import { getTimelineLaneHeaderMessages } from '../i18n/messages';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { buildLayerStyleMenuItems } from './LayerStyleSubmenu';
import { computeAdaptivePanelWidth } from '../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../hooks/useViewportWidth';
import { useTimelineLaneHeaderDrag } from './useTimelineLaneHeaderDrag';
import { ModalPanel, PanelButton, PanelSection, PanelSummary } from './ui';
import { buildLayerOperationMenuItems, type LayerOperationActionType } from './layerOperationMenuItems';

interface TimelineLaneHeaderProps {
  layer: LayerDocType;
  layerIndex: number;
  activeTextTimelineMode?: 'document' | 'media' | null;
  allLayers: LayerDocType[];
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
  deletableLayers: LayerDocType[];
  onFocusLayer: (layerId: string) => void;
  renderLaneLabel: (layer: LayerDocType) => React.ReactNode;
  onLayerAction: (action: LayerOperationActionType, layerId: string) => void;
  layerLinks?: LayerLinkDocType[];
  showConnectors?: boolean;
  onToggleConnectors?: () => void;
  isCollapsed?: boolean;
  /** Receives the header's `layer.id` so parents can pass a stable callback. */
  onToggleCollapsed?: (layerId: string) => void;
  onLaneLabelWidthResize?: (e: React.PointerEvent<HTMLDivElement>) => void;
  speakerQuickActions?: {
    selectedCount: number;
    speakerOptions: Array<{ id: string; name: string }>;
    onAssignToSelection: (speakerId: string) => void;
    onClearSelection: () => void;
    onOpenCreateAndAssignPanel: () => void;
  };
  trackModeControl?: {
    mode: TranscriptionTrackDisplayMode;
    onToggle: () => void;
    onSetMode?: (nextMode: TranscriptionTrackDisplayMode) => void;
    onLockSelectedToLane?: (laneIndex: number) => void;
    onUnlockSelected?: () => void;
    onResetAuto?: () => void;
    selectedSpeakerNames?: string[];
    lockedSpeakerCount?: number;
    lockConflictCount?: number;
  };
  /** \\u663e\\u793a\\u6837\\u5f0f\\u83dc\\u5355\\u6240\\u9700 | Display style submenu dependencies */
  displayStyleControl?: {
    orthographies: OrthographyDocType[];
    onUpdate: (layerId: string, patch: Partial<LayerDisplaySettings>) => void;
    onReset: (layerId: string) => void;
    localFonts?: Parameters<typeof buildLayerStyleMenuItems>[7];
  };
  /**
   * 层头右键是否允许「轨道 / 说话人」整条时间轴级 chrome。
   * `layer-chrome`：仅层操作、视图与显示样式，即使误传 track/speaker props 也不渲染。
   * `layer-chrome-plus-track`：在提供对应 props 时可渲染轨道与说话人。
   * 省略时等同于 `layer-chrome-plus-track`（与既有调用方兼容）。
   */
  headerMenuPreset?: 'layer-chrome' | 'layer-chrome-plus-track';
}

interface LaneLockDialogState {
  initialLaneIndex: number;
  selectedSpeakerHint: string;
}

const LANE_LINK_COLUMN_WIDTH = 18;
const LANE_LINK_TRUNK_X = 16.5;
const LANE_LINK_MARKER_X = 2.5;
const LANE_LINK_ELBOW_START_X = 6.5;

function renderLaneLinkConnectorSvg(
  segment: { column: number; colorIndex: number; role: 'bundle-root' | 'bundle-child-middle' | 'bundle-child-end' },
) {
  const connectorClasses = `lane-link-connector-svg lane-link-connector-svg-${segment.role} lane-link-connector-svg-color-${segment.colorIndex % 6}`;
  const offsetX = segment.column * LANE_LINK_COLUMN_WIDTH;
  return (
    <g
      key={`${segment.column}-${segment.role}-${segment.colorIndex}`}
      className={connectorClasses}
      transform={`translate(${offsetX} 0)`}
    >
      {segment.role === 'bundle-root' ? (
        <>
          <line className="lane-link-connector-svg-trunk" x1={LANE_LINK_TRUNK_X} x2={LANE_LINK_TRUNK_X} y1={50} y2={100} />
          <line className="lane-link-connector-svg-elbow" x1={LANE_LINK_MARKER_X + 1} x2={LANE_LINK_TRUNK_X} y1={50} y2={50} />
          <circle className="lane-link-connector-svg-dot" cx={LANE_LINK_MARKER_X} cy={50} r={2.5} />
        </>
      ) : (
        <>
          <line
            className="lane-link-connector-svg-trunk"
            x1={LANE_LINK_TRUNK_X}
            x2={LANE_LINK_TRUNK_X}
            y1={0}
            y2={segment.role === 'bundle-child-end' ? 50 : 100}
          />
          <line className="lane-link-connector-svg-elbow" x1={LANE_LINK_ELBOW_START_X} x2={LANE_LINK_TRUNK_X} y1={50} y2={50} />
          <polygon className="lane-link-connector-svg-arrow" points={`${LANE_LINK_MARKER_X},50 ${LANE_LINK_ELBOW_START_X},46 ${LANE_LINK_ELBOW_START_X},54`} />
        </>
      )}
    </g>
  );
}

function formatTrackModeMenuLabel(locale: Locale, mode: TranscriptionTrackDisplayMode): string {
  switch (mode) {
    case 'single':
      return t(locale, 'transcription.trackFocus.mode.single');
    case 'multi-auto':
      return t(locale, 'transcription.trackFocus.mode.multiAuto');
    case 'multi-locked':
      return t(locale, 'transcription.trackFocus.mode.multiLocked');
    case 'multi-speaker-fixed':
      return t(locale, 'transcription.trackFocus.mode.multiSpeakerFixed');
    default:
      return mode;
  }
}

export function TimelineLaneHeader({
  layer,
  layerIndex,
  activeTextTimelineMode,
  allLayers,
  onReorderLayers,
  deletableLayers,
  onFocusLayer,
  renderLaneLabel,
  showConnectors = true,
  onToggleConnectors,
  isCollapsed = false,
  onToggleCollapsed,
  onLayerAction,
  layerLinks: layerLinks = [],
  onLaneLabelWidthResize,
  speakerQuickActions,
  trackModeControl,
  displayStyleControl,
  headerMenuPreset,
}: TimelineLaneHeaderProps) {
  const locale = useLocale();
  const { uiTextDirection, uiFontScale } = useUiFontScaleRuntime(locale);
  const viewportWidth = useViewportWidth();
  const laneLockDialogWidth = useMemo(
    () => computeAdaptivePanelWidth({
      baseWidth: 480,
      locale,
      direction: uiTextDirection,
      uiFontScale,
      density: 'standard',
      minWidth: 360,
      maxWidth: 760,
      ...(viewportWidth !== undefined ? { viewportWidth } : {}),
    }),
    [locale, uiFontScale, uiTextDirection, viewportWidth],
  );
  const messages = getTimelineLaneHeaderMessages(locale);
  const allowGlobalTimelineHeaderChrome = headerMenuPreset !== 'layer-chrome';
  const resolvedSpeakerQuickActions = allowGlobalTimelineHeaderChrome ? speakerQuickActions : undefined;
  const resolvedTrackModeControl = allowGlobalTimelineHeaderChrome ? trackModeControl : undefined;
  const connectorLayout = useMemo(
    () => buildLayerLinkConnectorLayout(allLayers, layerLinks),
    [allLayers, layerLinks],
  );
  const canOpenTranslationCreate = allLayers.some((item) => item.layerType === 'transcription');
  const rowSegments = connectorLayout.segmentsByLayerId[layer.id] ?? [];
  const hasResolvableConnectorData = connectorLayout.maxColumns > 0;
  const effectiveShowConnectors = showConnectors && hasResolvableConnectorData;
  const { bundleBoundaryIndexes, bundleRootIds, bundleRanges, bundleRoleByLayerId } = useMemo(() => {
    const boundaries = new Set<number>([0, allLayers.length]);
    const rootIds = new Set<string>();
    const ranges: Array<{ rootId: string; start: number; end: number }> = [];
    const roleByLayerId = new Map<string, 'bundle-root' | 'bundle-child-middle' | 'bundle-child-end' | 'bundle-detached-root'>();
    let cursor = 0;
    for (const bundle of buildLayerBundles(allLayers, layerLinks)) {
      const start = cursor;
      boundaries.add(cursor);
      if (!bundle.detached) {
        rootIds.add(bundle.root.id);
      }
      roleByLayerId.set(bundle.root.id, bundle.detached ? 'bundle-detached-root' : 'bundle-root');

      const dependents = [...bundle.transcriptionDependents, ...bundle.translationDependents];
      dependents.forEach((dependent, dependentIndex) => {
        roleByLayerId.set(
          dependent.id,
          dependentIndex === dependents.length - 1 ? 'bundle-child-end' : 'bundle-child-middle',
        );
      });

      cursor += 1 + bundle.transcriptionDependents.length + bundle.translationDependents.length;
      boundaries.add(cursor);
      ranges.push({ rootId: bundle.root.id, start, end: cursor });
    }
    return {
      bundleBoundaryIndexes: [...boundaries].sort((left, right) => left - right),
      bundleRootIds: rootIds,
      bundleRanges: ranges,
      bundleRoleByLayerId: roleByLayerId,
    };
  }, [allLayers, layerLinks]);

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [laneLockDialog, setLaneLockDialog] = useState<LaneLockDialogState | null>(null);
  const [laneLockValue, setLaneLockValue] = useState('1');
  const [laneLockError, setLaneLockError] = useState('');

  const { headerRef, dragState, dropTargetIndex, handleMouseDown } = useTimelineLaneHeaderDrag({
    layer,
    allLayers,
    onReorderLayers,
    bundleBoundaryIndexes,
    bundleRootIds,
    bundleRanges,
    layerLinks,
  });

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
    onFocusLayer(layer.id);
  }, [layer.id, onFocusLayer]);

  const closeLaneLockDialog = useCallback(() => {
    setLaneLockDialog(null);
    setLaneLockValue('1');
    setLaneLockError('');
  }, []);

  const openLaneLockDialog = useCallback((selectedSpeakerHint: string, initialLaneIndex: number) => {
    setLaneLockDialog({ selectedSpeakerHint, initialLaneIndex });
    setLaneLockValue(String(initialLaneIndex + 1));
    setLaneLockError('');
  }, []);

  const confirmLaneLockDialog = useCallback(() => {
    if (!resolvedTrackModeControl?.onLockSelectedToLane) return;
    const laneIndex = Number.parseInt(laneLockValue.trim(), 10);
    if (!Number.isFinite(laneIndex) || laneIndex < 1) {
      setLaneLockError(messages.laneLockErrorMin);
      return;
    }
    resolvedTrackModeControl.onLockSelectedToLane(laneIndex - 1);
    closeLaneLockDialog();
  }, [closeLaneLockDialog, laneLockValue, messages.laneLockErrorMin, resolvedTrackModeControl]);

  const viewMenuItems: ContextMenuItem[] = [
    {
      label: isCollapsed
        ? t(locale, 'transcription.laneHeader.view.expandLayer')
        : t(locale, 'transcription.laneHeader.view.collapseLayer'),
      onClick: () => {
        onToggleCollapsed?.(layer.id);
      },
    },
    {
      label: effectiveShowConnectors
        ? t(locale, 'transcription.laneHeader.view.hideConnectors')
        : (hasResolvableConnectorData
          ? t(locale, 'transcription.laneHeader.view.showConnectors')
          : t(locale, 'transcription.laneHeader.view.showConnectorsNoLinks')),
      disabled: !hasResolvableConnectorData,
      onClick: () => {
        onToggleConnectors?.();
      },
    },
  ];

  const layerOperationMenuItems = buildLayerOperationMenuItems({
    layer,
    deletableLayers,
    canOpenTranslationCreate,
    labels: {
      editLayerMetadata: messages.editLayerMetadata,
      createTranscription: t(locale, 'transcription.laneHeader.layer.createTranscription'),
      createTranslation: t(locale, 'transcription.laneHeader.layer.createTranslation'),
      deleteCurrentLayer: t(locale, 'transcription.laneHeader.layer.deleteCurrent'),
    },
    onAction: (action, layerId) => {
      if (!layerId) return;
      onLayerAction(action, layerId);
    },
  });

  const contextMenuItems: ContextMenuItem[] = [
    ...layerOperationMenuItems,
    {
      label: t(locale, 'transcription.laneHeader.view.category'),
      meta: tf(locale, 'transcription.laneHeader.view.categoryMeta', {
        layerState: isCollapsed
          ? t(locale, 'transcription.laneHeader.view.layerCollapsed')
          : t(locale, 'transcription.laneHeader.view.layerExpanded'),
        linkState: effectiveShowConnectors
          ? t(locale, 'transcription.laneHeader.view.connectorsOn')
          : t(locale, 'transcription.laneHeader.view.connectorsOff'),
      }),
      variant: 'category',
      separatorBefore: true,
      children: viewMenuItems,
    },
  ];

  // \\u663e\\u793a\\u6837\\u5f0f\\u5b50\\u83dc\\u5355 | Display style submenu
  if (displayStyleControl) {
    const styleItems = buildLayerStyleMenuItems(
      layer.displaySettings,
      layer.id,
      layer.languageId,
      layer.orthographyId,
      displayStyleControl.orthographies,
      (patch) => displayStyleControl.onUpdate(layer.id, patch),
      () => displayStyleControl.onReset(layer.id),
      displayStyleControl.localFonts,
      locale,
    );
    contextMenuItems.push({
      label: t(locale, 'transcription.laneHeader.displayStyle.category'),
      variant: 'category',
      children: styleItems,
    });
  }

  if (resolvedSpeakerQuickActions) {
    const { selectedCount, speakerOptions, onAssignToSelection, onClearSelection, onOpenCreateAndAssignPanel } = resolvedSpeakerQuickActions;
    const topSpeakers = speakerOptions.slice(0, 3);
    const speakerMenuItems: ContextMenuItem[] = [{
      label: selectedCount > 0
        ? tf(locale, 'transcription.laneHeader.speaker.clearWithCount', { count: String(selectedCount) })
        : t(locale, 'transcription.laneHeader.speaker.clearSelection'),
      disabled: selectedCount === 0,
      onClick: () => {
        onClearSelection();
      },
    }];
    for (const speaker of topSpeakers) {
      speakerMenuItems.push({
        label: selectedCount > 0
          ? tf(locale, 'transcription.laneHeader.speaker.assignWithCount', {
            count: String(selectedCount),
            name: speaker.name,
          })
          : tf(locale, 'transcription.laneHeader.speaker.assignToSpeaker', { name: speaker.name }),
        disabled: selectedCount === 0,
        onClick: () => {
          onAssignToSelection(speaker.id);
        },
      });
    }
    speakerMenuItems.push({
      label: selectedCount > 0
        ? t(locale, 'transcription.laneHeader.speaker.createAndAssignWithSelection')
        : t(locale, 'transcription.laneHeader.speaker.createAndAssign'),
      disabled: selectedCount === 0,
      onClick: () => {
        onOpenCreateAndAssignPanel();
      },
    });
    contextMenuItems.push({
      label: t(locale, 'transcription.laneHeader.speaker.category'),
      meta: selectedCount > 0
        ? tf(locale, 'transcription.laneHeader.speaker.metaSelected', { count: String(selectedCount) })
        : t(locale, 'transcription.laneHeader.speaker.metaNone'),
      variant: 'category',
      children: speakerMenuItems,
    });
  }

  if (resolvedTrackModeControl) {
    const selectedSpeakerNames = resolvedTrackModeControl.selectedSpeakerNames ?? [];
    const selectedSpeakerHint = selectedSpeakerNames.length > 0
      ? selectedSpeakerNames.join(locale === 'zh-CN' ? '、' : ', ')
      : t(locale, 'transcription.laneHeader.track.noSpeakerInSelectionHint');
    const lockConflictCount = resolvedTrackModeControl.lockConflictCount ?? 0;
    const hasExistingLaneLocks = (resolvedTrackModeControl.lockedSpeakerCount ?? 0) > 0;

    const trackMenuItems: ContextMenuItem[] = [
      {
        label: tf(locale, 'transcription.laneHeader.track.currentModeRow', {
          mode: formatTrackModeMenuLabel(locale, resolvedTrackModeControl.mode),
        }),
        disabled: true,
      },
    ];

    if (!resolvedTrackModeControl.onSetMode) {
      trackMenuItems.push({
        label: resolvedTrackModeControl.mode === 'single'
          ? t(locale, 'transcription.laneHeader.track.switchFromSingleToSplitAuto')
          : t(locale, 'transcription.laneHeader.track.switchToSingle'),
        onClick: () => {
          resolvedTrackModeControl.onToggle();
        },
      });
    }

    if (resolvedTrackModeControl.onSetMode) {
      trackMenuItems.push({
        label: t(locale, 'transcription.laneHeader.track.switchToSplitAuto'),
        disabled: resolvedTrackModeControl.mode === 'multi-auto',
        onClick: () => {
          resolvedTrackModeControl.onSetMode?.('multi-auto');
        },
      });
      trackMenuItems.push({
        label: hasExistingLaneLocks
          ? t(locale, 'transcription.laneHeader.track.switchToSplitLocked')
          : t(locale, 'transcription.laneHeader.track.switchToSplitLockedNeedLaneLocks'),
        disabled: resolvedTrackModeControl.mode === 'multi-locked' || !hasExistingLaneLocks,
        onClick: () => {
          resolvedTrackModeControl.onSetMode?.('multi-locked');
        },
      });
      trackMenuItems.push({
        label: t(locale, 'transcription.laneHeader.track.switchToSplitOnePerSpeaker'),
        disabled: resolvedTrackModeControl.mode === 'multi-speaker-fixed',
        onClick: () => {
          resolvedTrackModeControl.onSetMode?.('multi-speaker-fixed');
        },
      });
    }

    if (resolvedTrackModeControl.mode !== 'multi-speaker-fixed' && resolvedTrackModeControl.onLockSelectedToLane) {
      trackMenuItems.push({
        label: tf(locale, 'transcription.laneHeader.track.lockSpeakersToLane', { hint: selectedSpeakerHint }),
        disabled: selectedSpeakerNames.length === 0,
        onClick: () => {
          openLaneLockDialog(selectedSpeakerHint, 0);
        },
      });
    }

    if (resolvedTrackModeControl.mode !== 'multi-speaker-fixed' && resolvedTrackModeControl.onUnlockSelected) {
      trackMenuItems.push({
        label: tf(locale, 'transcription.laneHeader.track.unlockSelectedSpeakers', {
          count: String(resolvedTrackModeControl.lockedSpeakerCount ?? 0),
        }),
        disabled: selectedSpeakerNames.length === 0,
        onClick: () => {
          resolvedTrackModeControl.onUnlockSelected?.();
        },
      });
    }

    if (resolvedTrackModeControl.onResetAuto) {
      trackMenuItems.push({
        label: resolvedTrackModeControl.mode === 'multi-speaker-fixed'
          ? t(locale, 'transcription.laneHeader.track.resetAutoClearLaneMapping')
          : t(locale, 'transcription.laneHeader.track.resetAutoClearLocks'),
        onClick: () => {
          resolvedTrackModeControl.onResetAuto?.();
        },
      });
    }

    if (lockConflictCount > 0) {
      trackMenuItems.push({
        label: resolvedTrackModeControl.mode === 'multi-speaker-fixed'
          ? tf(locale, 'transcription.laneHeader.track.conflictOnePerSpeaker', { count: String(lockConflictCount) })
          : tf(locale, 'transcription.laneHeader.track.conflictLockedReverted', { count: String(lockConflictCount) }),
        disabled: true,
      });
    }

    contextMenuItems.push({
      label: t(locale, 'transcription.laneHeader.track.category'),
      meta: formatTrackModeMenuLabel(locale, resolvedTrackModeControl.mode),
      variant: 'category',
      children: trackMenuItems,
    });
  }

  const isDragged = dragState?.draggedLayerIds.includes(layer.id) ?? false;
  const isDropInsideDraggedBlock = dragState
    ? dropTargetIndex !== null
      && dropTargetIndex > dragState.sourceIndex
      && dropTargetIndex < dragState.sourceIndex + dragState.sourceSpan
    : false;
  const isDropAbove = !isDropInsideDraggedBlock && dropTargetIndex === layerIndex && !isDragged;
  const isDropBelow = !isDropInsideDraggedBlock && dropTargetIndex === layerIndex + 1 && !isDragged;
  const laneBundleRole = bundleRoleByLayerId.get(layer.id);

  return (
    <div className="timeline-lane-header-wrapper">
      {/* Drop indicator lines */}
      {isDropAbove && (
        <div
          className="timeline-lane-drop-indicator timeline-lane-drop-indicator-top"
        />
      )}
      {isDropBelow && (
        <div
          className="timeline-lane-drop-indicator timeline-lane-drop-indicator-bottom"
        />
      )}

      <span
        ref={headerRef}
        className={`timeline-lane-label timeline-lane-header ${isDragged ? 'timeline-lane-header-dragging' : ''}${laneBundleRole ? ` timeline-lane-label-${laneBundleRole}` : ''}`}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          if (isCollapsed) {
            onToggleCollapsed?.(layer.id);
            e.stopPropagation();
          }
          onFocusLayer(layer.id);
        }}
      >
        {/* \\u8fde\\u63a5\\u7ebf\\u5bb9\\u5668 | Connector stack */}
        {!isCollapsed && effectiveShowConnectors && rowSegments.length > 0 && (() => {
          const connectorStackWidth = getLayerLinkStackWidth(connectorLayout.maxColumns);
          return (
            <span
              className="lane-link-stack"
              aria-hidden="true"
            >
              <svg
                className="lane-link-stack-svg"
                width={connectorStackWidth}
                viewBox={`0 0 ${connectorStackWidth} 100`}
                preserveAspectRatio="none"
              >
                {rowSegments.map((segment) => renderLaneLinkConnectorSvg(segment))}
              </svg>
            </span>
          );
        })()}
        {!isCollapsed && renderLaneLabel(layer)}
        {!isCollapsed && layerIndex === 0 && activeTextTimelineMode === 'document' && (
          <span
            className="timeline-lane-timebase-badge"
            aria-label={messages.timelineModeDocumentBadgeAriaLabel}
            title={messages.timelineModeDocumentBadgeAriaLabel}
          >
            {messages.timelineModeDocumentBadge}
          </span>
        )}
        {/* Lane label width resize handle — pinned to header right edge */}
        {onLaneLabelWidthResize && (
          <div
            className="lane-label-resize-handle"
            onPointerDown={(e) => {
              e.stopPropagation();
              onLaneLabelWidthResize(e);
            }}
          />
        )}
      </span>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {laneLockDialog && (
        <ModalPanel
          isOpen={Boolean(laneLockDialog)}
          onClose={closeLaneLockDialog}
          topmost
          className="timeline-lane-lock-dialog panel-design-match panel-design-match-dialog"
          ariaLabel={t(locale, 'transcription.laneHeader.laneLock.dialogAriaLabel')}
          title={t(locale, 'transcription.laneHeader.laneLock.dialogTitle')}
          closeLabel={t(locale, 'transcription.laneHeader.laneLock.closePanel')}
            layoutStyle={{ width: laneLockDialogWidth, maxWidth: 'calc(100vw - 32px)', height: 'auto' }}
          footer={(
            <>
              <PanelButton variant="ghost" onClick={closeLaneLockDialog}>{t(locale, 'transcription.dialog.cancel')}</PanelButton>
              <PanelButton variant="primary" onClick={confirmLaneLockDialog}>{t(locale, 'transcription.laneHeader.laneLock.confirm')}</PanelButton>
            </>
          )}
        >
            <div className="speaker-rail-batch-panel">
              <PanelSummary
                className="speaker-rail-summary-card"
                description={tf(locale, 'transcription.laneHeader.laneLock.selectionSummary', {
                  speakers: laneLockDialog.selectedSpeakerHint,
                })}
                supportingText={t(locale, 'transcription.laneHeader.laneLock.supportingText')}
              />
              <PanelSection className="speaker-rail-form-section" title={t(locale, 'transcription.laneHeader.laneLock.targetLaneOrdinalTitle')}>
                <label className="speaker-rail-form-field">
                  <input
                    autoFocus
                    className="panel-input"
                    type="number"
                    min={1}
                    step={1}
                    aria-label={t(locale, 'transcription.laneHeader.laneLock.targetLaneOrdinalAria')}
                    value={laneLockValue}
                    onChange={(event) => {
                      setLaneLockValue(event.target.value);
                      if (laneLockError) setLaneLockError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        confirmLaneLockDialog();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        closeLaneLockDialog();
                      }
                    }}
                  />
                </label>
                {laneLockError && <p className="speaker-rail-form-error">{laneLockError}</p>}
              </PanelSection>
            </div>
        </ModalPanel>
      )}

    </div>
  );
}
