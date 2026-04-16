import React, { useState, useCallback, useMemo } from 'react';
import type { LayerLinkDocType, LayerDocType, LayerDisplaySettings, OrthographyDocType } from '../db';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import { buildLayerBundles } from '../services/LayerOrderingService';
import { buildLayerLinkConnectorLayout, getLayerLinkStackWidth } from '../utils/layerLinkConnector';
import { useLocale } from '../i18n';
import { getTimelineLaneHeaderMessages } from '../i18n/timelineLaneHeaderMessages';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { buildLayerStyleMenuItems } from './LayerStyleSubmenu';
import { decodeEscapedUnicode } from '../utils/decodeEscapedUnicode';
import { computeAdaptivePanelWidth } from '../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../hooks/useViewportWidth';
import { useTimelineLaneHeaderDrag } from './useTimelineLaneHeaderDrag';
import { ModalPanel, PanelButton, PanelSection, PanelSummary } from './ui';

type LayerActionType =
  | 'create-transcription'
  | 'create-translation'
  | 'edit-transcription-metadata'
  | 'edit-translation-metadata'
  | 'delete';

interface TimelineLaneHeaderProps {
  layer: LayerDocType;
  layerIndex: number;
  allLayers: LayerDocType[];
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
  deletableLayers: LayerDocType[];
  onFocusLayer: (layerId: string) => void;
  renderLaneLabel: (layer: LayerDocType) => React.ReactNode;
  onLayerAction: (action: LayerActionType, layerId: string) => void;
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

function formatTrackModeMenuLabel(mode: TranscriptionTrackDisplayMode): string {
  switch (mode) {
    case 'single':
      return decodeEscapedUnicode('\\u5355\\u8f68');
    case 'multi-auto':
      return decodeEscapedUnicode('\\u591a\\u8f68·\\u81ea\\u52a8');
    case 'multi-locked':
      return decodeEscapedUnicode('\\u591a\\u8f68·\\u9501\\u5b9a');
    case 'multi-speaker-fixed':
      return decodeEscapedUnicode('\\u591a\\u8f68·\\u4e00\\u4eba\\u4e00\\u8f68');
    default:
      return mode;
  }
}

export function TimelineLaneHeader({
  layer,
  layerIndex,
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
}: TimelineLaneHeaderProps) {
  const locale = useLocale();
  const { uiTextDirection, uiFontScale } = useUiFontScaleRuntime(locale);
  const viewportWidth = useViewportWidth();
  const laneLockDialogWidth = useMemo(
    () => computeAdaptivePanelWidth({
      baseWidth: 360,
      locale,
      direction: uiTextDirection,
      uiFontScale,
      density: 'standard',
      minWidth: 300,
      maxWidth: 620,
      ...(viewportWidth !== undefined ? { viewportWidth } : {}),
    }),
    [locale, uiFontScale, uiTextDirection, viewportWidth],
  );
  const messages = getTimelineLaneHeaderMessages(locale);
  const connectorLayerLinks = useMemo(
    () => layerLinks.map((link) => ({ transcriptionLayerKey: link.transcriptionLayerKey, targetLayerId: link.layerId })),
    [layerLinks],
  );
  const connectorLayout = useMemo(
    () => buildLayerLinkConnectorLayout(allLayers, connectorLayerLinks),
    [allLayers, connectorLayerLinks],
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
    for (const bundle of buildLayerBundles(allLayers)) {
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
  }, [allLayers]);

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
    if (!trackModeControl?.onLockSelectedToLane) return;
    const laneIndex = Number.parseInt(laneLockValue.trim(), 10);
    if (!Number.isFinite(laneIndex) || laneIndex < 1) {
      setLaneLockError(messages.laneLockErrorMin);
      return;
    }
    trackModeControl.onLockSelectedToLane(laneIndex - 1);
    closeLaneLockDialog();
  }, [closeLaneLockDialog, laneLockValue, messages.laneLockErrorMin, trackModeControl]);

  const viewMenuItems: ContextMenuItem[] = [
    {
      label: isCollapsed ? decodeEscapedUnicode('\\u5c55\\u5f00\\u8be5\\u5c42') : decodeEscapedUnicode('\\u6298\\u53e0\\u8be5\\u5c42'),
      onClick: () => {
        onToggleCollapsed?.(layer.id);
      },
    },
    {
      label: effectiveShowConnectors
        ? decodeEscapedUnicode('\\u9690\\u85cf\\u5c42\\u7ea7\\u5173\\u7cfb')
        : (hasResolvableConnectorData ? decodeEscapedUnicode('\\u663e\\u793a\\u5c42\\u7ea7\\u5173\\u7cfb') : decodeEscapedUnicode('\\u663e\\u793a\\u5c42\\u7ea7\\u5173\\u7cfb（\\u6682\\u65e0\\u53ef\\u7528\\u94fe\\u63a5）')),
      disabled: !hasResolvableConnectorData,
      onClick: () => {
        onToggleConnectors?.();
      },
    },
  ];

  const layerOperationMenuItems: ContextMenuItem[] = [
    {
      label: layer.layerType === 'translation'
        ? decodeEscapedUnicode('\u7f16\u8f91\u7ffb\u8bd1\u5c42\u5143\u4fe1\u606f')
        : decodeEscapedUnicode('\u7f16\u8f91\u8f6c\u5199\u5c42\u5143\u4fe1\u606f'),
      onClick: () => {
        onLayerAction(layer.layerType === 'translation' ? 'edit-translation-metadata' : 'edit-transcription-metadata', layer.id);
      },
    },
    {
      label: decodeEscapedUnicode('\\u65b0\\u5efa\\u8f6c\\u5199\\u5c42'),
      onClick: () => {
        onLayerAction('create-transcription', layer.id);
      },
    },
    {
      label: decodeEscapedUnicode('\\u65b0\\u5efa\\u7ffb\\u8bd1\\u5c42'),
      disabled: !canOpenTranslationCreate,
      onClick: () => {
        onLayerAction('create-translation', layer.id);
      },
    },
    {
      label: decodeEscapedUnicode('\\u5220\\u9664\\u5f53\\u524d\\u5c42'),
      danger: true,
      disabled: !deletableLayers.some((l) => l.id === layer.id),
      onClick: () => {
        onLayerAction('delete', layer.id);
      },
    },
  ];

  const contextMenuItems: ContextMenuItem[] = [
    ...layerOperationMenuItems,
    {
      label: decodeEscapedUnicode('\\u89c6\\u56fe'),
      meta: `${isCollapsed ? decodeEscapedUnicode('\\u6298\\u53e0') : decodeEscapedUnicode('\\u5c55\\u5f00')} · ${effectiveShowConnectors ? decodeEscapedUnicode('\\u8fde\\u7ebf') : decodeEscapedUnicode('\\u65e0\\u7ebf')}`,
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
      label: decodeEscapedUnicode('\\u663e\\u793a\\u6837\\u5f0f'),
      variant: 'category',
      children: styleItems,
    });
  }

  if (speakerQuickActions) {
    const { selectedCount, speakerOptions, onAssignToSelection, onClearSelection, onOpenCreateAndAssignPanel } = speakerQuickActions;
    const topSpeakers = speakerOptions.slice(0, 3);
    const speakerMenuItems: ContextMenuItem[] = [{
      label: selectedCount > 0 ? decodeEscapedUnicode(`\\u6e05\\u7a7a ${selectedCount} \\u4e2a\\u9009\\u4e2d\\u53e5\\u6bb5\\u7684\\u8bf4\\u8bdd\\u4eba`) : decodeEscapedUnicode('\\u6e05\\u7a7a\\u9009\\u4e2d\\u53e5\\u6bb5\\u8bf4\\u8bdd\\u4eba'),
      disabled: selectedCount === 0,
      onClick: () => {
        onClearSelection();
      },
    }];
    for (const speaker of topSpeakers) {
      speakerMenuItems.push({
        label: selectedCount > 0
          ? decodeEscapedUnicode(`\\u6307\\u6d3e ${selectedCount} \\u4e2a\\u9009\\u4e2d\\u53e5\\u6bb5 → ${speaker.name}`)
          : decodeEscapedUnicode(`\\u6307\\u6d3e\\u9009\\u4e2d\\u53e5\\u6bb5 → ${speaker.name}`),
        disabled: selectedCount === 0,
        onClick: () => {
          onAssignToSelection(speaker.id);
        },
      });
    }
    speakerMenuItems.push({
      label: selectedCount > 0 ? decodeEscapedUnicode('\\u65b0\\u5efa\\u8bf4\\u8bdd\\u4eba\\u5e76\\u6307\\u6d3e\\u5230\\u9009\\u4e2d\\u53e5\\u6bb5…') : decodeEscapedUnicode('\\u65b0\\u5efa\\u8bf4\\u8bdd\\u4eba\\u5e76\\u6307\\u6d3e…'),
      disabled: selectedCount === 0,
      onClick: () => {
        onOpenCreateAndAssignPanel();
      },
    });
    contextMenuItems.push({
      label: decodeEscapedUnicode('\\u8bf4\\u8bdd\\u4eba'),
      meta: selectedCount > 0 ? decodeEscapedUnicode(`\\u5df2\\u9009 ${selectedCount}`) : decodeEscapedUnicode('\\u672a\\u9009'),
      variant: 'category',
      children: speakerMenuItems,
    });
  }

  if (trackModeControl) {
    const selectedSpeakerNames = trackModeControl.selectedSpeakerNames ?? [];
    const selectedSpeakerHint = selectedSpeakerNames.length > 0
      ? selectedSpeakerNames.join('、')
      : decodeEscapedUnicode('\\u5f53\\u524d\\u672a\\u9009\\u4e2d\\u5e26\\u8bf4\\u8bdd\\u4eba\\u7684\\u53e5\\u6bb5');
    const lockConflictCount = trackModeControl.lockConflictCount ?? 0;
    const hasExistingLaneLocks = (trackModeControl.lockedSpeakerCount ?? 0) > 0;

    const trackMenuItems: ContextMenuItem[] = [
      {
        label: decodeEscapedUnicode(`\\u5f53\\u524d\\u6a21\\u5f0f：${formatTrackModeMenuLabel(trackModeControl.mode)}`),
        disabled: true,
      },
    ];

    if (!trackModeControl.onSetMode) {
      trackMenuItems.push({
        label: trackModeControl.mode === 'single' ? decodeEscapedUnicode('\\u5207\\u6362\\u5230\\u591a\\u8f68\\u6a21\\u5f0f（\\u81ea\\u52a8）') : decodeEscapedUnicode('\\u5207\\u6362\\u5230\\u5355\\u8f68\\u6a21\\u5f0f'),
        onClick: () => {
          trackModeControl.onToggle();
        },
      });
    }

    if (trackModeControl.onSetMode) {
      trackMenuItems.push({
        label: decodeEscapedUnicode('\\u5207\\u6362\\u5230\\u591a\\u8f68\\u6a21\\u5f0f（\\u81ea\\u52a8）'),
        disabled: trackModeControl.mode === 'multi-auto',
        onClick: () => {
          trackModeControl.onSetMode?.('multi-auto');
        },
      });
      trackMenuItems.push({
        label: hasExistingLaneLocks ? decodeEscapedUnicode('\\u5207\\u6362\\u5230\\u591a\\u8f68\\u6a21\\u5f0f（\\u9501\\u5b9a）') : decodeEscapedUnicode('\\u5207\\u6362\\u5230\\u591a\\u8f68\\u6a21\\u5f0f（\\u9501\\u5b9a，\\u9700\\u5148\\u9501\\u5b9a\\u8bf4\\u8bdd\\u4eba）'),
        disabled: trackModeControl.mode === 'multi-locked' || !hasExistingLaneLocks,
        onClick: () => {
          trackModeControl.onSetMode?.('multi-locked');
        },
      });
      trackMenuItems.push({
        label: decodeEscapedUnicode('\\u5207\\u6362\\u5230\\u591a\\u8f68\\u6a21\\u5f0f（\\u4e00\\u4eba\\u4e00\\u8f68）'),
        disabled: trackModeControl.mode === 'multi-speaker-fixed',
        onClick: () => {
          trackModeControl.onSetMode?.('multi-speaker-fixed');
        },
      });
    }

    if (trackModeControl.mode !== 'multi-speaker-fixed' && trackModeControl.onLockSelectedToLane) {
      trackMenuItems.push({
        label: decodeEscapedUnicode(`\\u9501\\u5b9a\\u9009\\u4e2d\\u8bf4\\u8bdd\\u4eba\\u5230\\u8f68\\u9053…（${selectedSpeakerHint}）`),
        disabled: selectedSpeakerNames.length === 0,
        onClick: () => {
          openLaneLockDialog(selectedSpeakerHint, 0);
        },
      });
    }

    if (trackModeControl.mode !== 'multi-speaker-fixed' && trackModeControl.onUnlockSelected) {
      trackMenuItems.push({
        label: decodeEscapedUnicode(`\\u89e3\\u9501\\u9009\\u4e2d\\u8bf4\\u8bdd\\u4eba（\\u5f53\\u524d\\u5df2\\u9501 ${trackModeControl.lockedSpeakerCount ?? 0}）`),
        disabled: selectedSpeakerNames.length === 0,
        onClick: () => {
          trackModeControl.onUnlockSelected?.();
        },
      });
    }

    if (trackModeControl.onResetAuto) {
      trackMenuItems.push({
        label: trackModeControl.mode === 'multi-speaker-fixed' ? decodeEscapedUnicode('\\u6062\\u590d\\u81ea\\u52a8\\u5206\\u8f68\\u5e76\\u6e05\\u7a7a\\u8f68\\u9053\\u6620\\u5c04') : decodeEscapedUnicode('\\u6062\\u590d\\u81ea\\u52a8\\u5206\\u8f68\\u5e76\\u6e05\\u7a7a\\u9501\\u5b9a'),
        onClick: () => {
          trackModeControl.onResetAuto?.();
        },
      });
    }

    if (lockConflictCount > 0) {
      trackMenuItems.push({
        label: trackModeControl.mode === 'multi-speaker-fixed'
          ? decodeEscapedUnicode(`\\u4e00\\u4eba\\u4e00\\u8f68\\u51b2\\u7a81 ${lockConflictCount} \\u9879（\\u8bf7\\u4fee\\u6b63\\u5207\\u5206\\u6216\\u8bf4\\u8bdd\\u4eba\\u6807\\u6ce8）`)
          : decodeEscapedUnicode(`\\u9501\\u5b9a\\u51b2\\u7a81 ${lockConflictCount} \\u9879（\\u5df2\\u56de\\u9000\\u81ea\\u52a8\\u5206\\u914d）`),
        disabled: true,
      });
    }

    contextMenuItems.push({
      label: decodeEscapedUnicode('\\u8f68\\u9053'),
      meta: formatTrackModeMenuLabel(trackModeControl.mode),
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
          ariaLabel={decodeEscapedUnicode('\\u9501\\u5b9a\\u8bf4\\u8bdd\\u4eba\\u5230\\u8f68\\u9053')}
          title={decodeEscapedUnicode('\\u9501\\u5b9a\\u8bf4\\u8bdd\\u4eba\\u5230\\u8f68\\u9053')}
          closeLabel={decodeEscapedUnicode('\\u5173\\u95ed\\u9501\\u5b9a\\u8f68\\u9053\\u9762\\u677f')}
            layoutStyle={{ width: laneLockDialogWidth, maxWidth: 'calc(100vw - 32px)', height: 'auto' }}
          footer={(
            <>
              <PanelButton variant="ghost" onClick={closeLaneLockDialog}>{decodeEscapedUnicode('\\u53d6\\u6d88')}</PanelButton>
              <PanelButton variant="primary" onClick={confirmLaneLockDialog}>{decodeEscapedUnicode('\\u786e\\u8ba4\\u9501\\u5b9a')}</PanelButton>
            </>
          )}
        >
            <div className="speaker-rail-batch-panel">
              <PanelSummary
                className="speaker-rail-summary-card"
                description={`${decodeEscapedUnicode('\\u9009\\u4e2d\\u8bf4\\u8bdd\\u4eba：')}${laneLockDialog.selectedSpeakerHint}`}
                supportingText={decodeEscapedUnicode('\\u8f93\\u5165\\u4ece 1 \\u5f00\\u59cb\\u7684\\u8f68\\u9053\\u7f16\\u53f7，\\u786e\\u8ba4\\u540e\\u4f1a\\u540c\\u65f6\\u8fdb\\u5165\\u591a\\u8f68\\u9501\\u5b9a\\u6a21\\u5f0f。')}
              />
              <PanelSection className="speaker-rail-form-section" title={decodeEscapedUnicode('\\u76ee\\u6807\\u8f68\\u9053\\u5e8f\\u53f7')}>
                <label className="speaker-rail-form-field">
                  <input
                    autoFocus
                    className="panel-input"
                    type="number"
                    min={1}
                    step={1}
                    aria-label={decodeEscapedUnicode('\\u76ee\\u6807\\u8f68\\u9053\\u5e8f\\u53f7')}
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
