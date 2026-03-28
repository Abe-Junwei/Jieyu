import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { LayerLinkDocType, LayerDocType } from '../db';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import { fireAndForget } from '../utils/fireAndForget';
import { buildLayerLinkConnectorLayout, getLayerLinkConnectorColors, getLayerLinkStackWidth } from '../utils/layerLinkConnector';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

type LayerActionType = 'create-transcription' | 'create-translation' | 'delete';

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
  onToggleCollapsed?: () => void;
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
}

interface LaneLockDialogState {
  initialLaneIndex: number;
  selectedSpeakerHint: string;
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
}: TimelineLaneHeaderProps) {
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

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [laneLockDialog, setLaneLockDialog] = useState<LaneLockDialogState | null>(null);
  const [laneLockValue, setLaneLockValue] = useState('1');
  const [laneLockError, setLaneLockError] = useState('');

  // ── Drag-and-drop state ──
  const [dragState, setDragState] = useState<{
    draggedId: string;
    sourceIndex: number;
    sourceType: 'transcription' | 'translation';
  } | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerRef = useRef<HTMLSpanElement | null>(null);
  const dragStateRef = useRef<typeof dragState>(null);
  const dropTargetIndexRef = useRef<number | null>(null);
  const laneRowRef = useRef<HTMLElement | null>(null);
  const dragStartClientYRef = useRef<number | null>(null);
  const dragVisualRafRef = useRef<number | null>(null);
  const dragVisualCurrentOffsetRef = useRef(0);
  const dragVisualTargetOffsetRef = useRef(0);

  const clearSiblingShiftVisual = useCallback(() => {
    const container = headerRef.current?.closest<HTMLElement>('.timeline-content');
    if (!container) return;
    const lanes = container.querySelectorAll<HTMLElement>('.timeline-lane');
    lanes.forEach((lane) => {
      lane.classList.remove('timeline-lane-row-shift');
      lane.style.removeProperty('--timeline-lane-shift-offset');
    });
  }, []);

  const updateSiblingShiftVisual = useCallback((sourceIndex: number, dropIndex: number) => {
    const container = headerRef.current?.closest<HTMLElement>('.timeline-content');
    if (!container) return;

    clearSiblingShiftVisual();

    const lanes = Array.from(container.querySelectorAll<HTMLElement>('.timeline-lane'));
    if (lanes.length === 0) return;

    const insertionIndex = Math.max(0, Math.min(dropIndex, lanes.length));
    if (insertionIndex === sourceIndex || insertionIndex === sourceIndex + 1) return;

    const laneHeight = laneRowRef.current?.getBoundingClientRect().height ?? 54;

    if (insertionIndex > sourceIndex) {
      for (let i = sourceIndex + 1; i < insertionIndex; i++) {
        const lane = lanes[i];
        if (!lane) continue;
        lane.classList.add('timeline-lane-row-shift');
        lane.style.setProperty('--timeline-lane-shift-offset', `${-laneHeight}px`);
      }
      return;
    }

    for (let i = insertionIndex; i < sourceIndex; i++) {
      const lane = lanes[i];
      if (!lane) continue;
      lane.classList.add('timeline-lane-row-shift');
      lane.style.setProperty('--timeline-lane-shift-offset', `${laneHeight}px`);
    }
  }, [clearSiblingShiftVisual]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
    onFocusLayer(layer.id);
  }, [layer.id, onFocusLayer]);

  const clearLaneDragVisual = useCallback(() => {
    if (dragVisualRafRef.current !== null) {
      cancelAnimationFrame(dragVisualRafRef.current);
      dragVisualRafRef.current = null;
    }
    dragVisualCurrentOffsetRef.current = 0;
    dragVisualTargetOffsetRef.current = 0;
    const lane = laneRowRef.current;
    if (!lane) return;
    lane.classList.remove('timeline-lane-row-dragging');
    lane.style.removeProperty('--timeline-lane-drag-offset');
  }, []);

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
      setLaneLockError('请输入大于等于 1 的轨道序号');
      return;
    }
    trackModeControl.onLockSelectedToLane(laneIndex - 1);
    closeLaneLockDialog();
  }, [closeLaneLockDialog, laneLockValue, trackModeControl]);

  const startLaneDragVisualAnimation = useCallback(() => {
    if (dragVisualRafRef.current !== null) return;

    const animate = () => {
      const lane = laneRowRef.current;
      if (!lane) {
        dragVisualRafRef.current = null;
        return;
      }

      const target = dragVisualTargetOffsetRef.current;
      const current = dragVisualCurrentOffsetRef.current;
      const next = current + (target - current) * 0.28;

      dragVisualCurrentOffsetRef.current = next;
      lane.classList.add('timeline-lane-row-dragging');
      lane.style.setProperty('--timeline-lane-drag-offset', `${next}px`);

      const diff = Math.abs(target - next);
      if (!dragStateRef.current && diff < 0.2) {
        dragVisualRafRef.current = null;
        return;
      }

      dragVisualRafRef.current = requestAnimationFrame(animate);
    };

    dragVisualRafRef.current = requestAnimationFrame(animate);
  }, []);

  const updateLaneDragVisual = useCallback((clientY: number) => {
    const lane = laneRowRef.current;
    const startY = dragStartClientYRef.current;
    if (!lane || startY === null) return;
    const deltaY = clientY - startY;
    dragVisualTargetOffsetRef.current = deltaY;
    startLaneDragVisualAnimation();
  }, [startLaneDragVisualAnimation]);

  const resolveDropTargetIndex = useCallback((clientY: number): number | null => {
    const container = headerRef.current?.closest<HTMLElement>('.timeline-content');
    if (!container) return null;

    const laneLabels = container.querySelectorAll<HTMLElement>('.timeline-lane-header');
    if (laneLabels.length === 0) return null;

    let targetIndex = -1;
    for (let i = 0; i < laneLabels.length; i++) {
      const rect = laneLabels[i]!.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) {
        targetIndex = i;
        break;
      }
      targetIndex = i + 1;
    }

    if (targetIndex > allLayers.length) targetIndex = allLayers.length;

    return targetIndex;
  }, [allLayers.length]);

  // Long press (500ms) to start drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    dragStartClientYRef.current = e.clientY;
    laneRowRef.current = headerRef.current?.closest<HTMLElement>('.timeline-lane') ?? null;
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }

    const idx = allLayers.findIndex((l) => l.id === layer.id);

    const cancelPendingDragStart = () => {
      if (dragTimerRef.current) {
        clearTimeout(dragTimerRef.current);
        dragTimerRef.current = null;
      }
      dragStartClientYRef.current = null;
      laneRowRef.current = null;
      document.removeEventListener('mouseup', cancelPendingDragStart);
    };

    dragTimerRef.current = setTimeout(() => {
      dragTimerRef.current = null;
      setDragState({
        draggedId: layer.id,
        sourceIndex: idx,
        sourceType: layer.layerType,
      });
      setDropTargetIndex(idx);
      updateLaneDragVisual(e.clientY);
      document.removeEventListener('mouseup', cancelPendingDragStart);
    }, 500);
    document.addEventListener('mouseup', cancelPendingDragStart);
  }, [allLayers, layer.id, layer.layerType, updateLaneDragVisual]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    dropTargetIndexRef.current = dropTargetIndex;
  }, [dropTargetIndex]);

  const commitDragReorder = useCallback((clientY?: number) => {
    const activeDrag = dragStateRef.current;
    if (typeof clientY === 'number') {
      updateLaneDragVisual(clientY);
    }
    if (!activeDrag) {
      clearLaneDragVisual();
      clearSiblingShiftVisual();
      dragStartClientYRef.current = null;
      laneRowRef.current = null;
      setDragState(null);
      setDropTargetIndex(null);
      return;
    }

    const resolvedTarget = typeof clientY === 'number'
      ? resolveDropTargetIndex(clientY)
      : null;
    const finalTarget = resolvedTarget ?? dropTargetIndexRef.current;

    if (finalTarget !== null) {
      if (finalTarget !== activeDrag.sourceIndex) {
        fireAndForget(onReorderLayers(activeDrag.draggedId, finalTarget));
      }
    }

    clearLaneDragVisual();
    clearSiblingShiftVisual();
    dragStartClientYRef.current = null;
    laneRowRef.current = null;
    setDragState(null);
    setDropTargetIndex(null);
  }, [clearLaneDragVisual, clearSiblingShiftVisual, onReorderLayers, resolveDropTargetIndex, updateLaneDragVisual]);

  useEffect(() => {
    if (!dragState) return;

    const handleDocumentMouseMove = (e: MouseEvent) => {
      updateLaneDragVisual(e.clientY);
      const next = resolveDropTargetIndex(e.clientY);
      if (next !== null) {
        setDropTargetIndex(next);
        updateSiblingShiftVisual(dragState.sourceIndex, next);
      }
    };

    const handleDocumentMouseUp = (e: MouseEvent) => {
      commitDragReorder(e.clientY);
    };

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);

    return () => {
      clearLaneDragVisual();
      clearSiblingShiftVisual();
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [clearLaneDragVisual, clearSiblingShiftVisual, commitDragReorder, dragState, resolveDropTargetIndex, updateLaneDragVisual, updateSiblingShiftVisual]);

  useEffect(() => () => {
    clearLaneDragVisual();
    clearSiblingShiftVisual();
    dragStartClientYRef.current = null;
    laneRowRef.current = null;
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
  }, [clearLaneDragVisual, clearSiblingShiftVisual]);

  // Context menu items
  const contextMenuItems: ContextMenuItem[] = [
    {
      label: isCollapsed ? '展开该层' : '折叠该层',
      onClick: () => {
        setContextMenu(null);
        onToggleCollapsed?.();
      },
    },
    {
      label: showConnectors
        ? '隐藏层级关系'
        : (hasResolvableConnectorData ? '显示层级关系' : '显示层级关系（暂无可用链接）'),
      disabled: !hasResolvableConnectorData,
      onClick: () => {
        setContextMenu(null);
        onToggleConnectors?.();
      },
    },
    {
      label: '新建转写层',
      onClick: () => {
        setContextMenu(null);
        onLayerAction('create-transcription', layer.id);
      },
    },
    {
      label: '新建翻译层',
      disabled: !canOpenTranslationCreate,
      onClick: () => {
        setContextMenu(null);
        onLayerAction('create-translation', layer.id);
      },
    },
    {
      label: '删除当前层',
      danger: true,
      disabled: !deletableLayers.some((l) => l.id === layer.id),
      onClick: () => {
        setContextMenu(null);
        onLayerAction('delete', layer.id);
      },
    },
  ];

  if (speakerQuickActions) {
    const { selectedCount, speakerOptions, onAssignToSelection, onClearSelection, onOpenCreateAndAssignPanel } = speakerQuickActions;
    const topSpeakers = speakerOptions.slice(0, 3);
    contextMenuItems.push({
      label: selectedCount > 0 ? `清空 ${selectedCount} 个选中句段的说话人` : '清空选中句段说话人',
      disabled: selectedCount === 0,
      onClick: () => {
        onClearSelection();
      },
    });
    for (const speaker of topSpeakers) {
      contextMenuItems.push({
        label: selectedCount > 0
          ? `指派 ${selectedCount} 个选中句段 → ${speaker.name}`
          : `指派选中句段 → ${speaker.name}`,
        disabled: selectedCount === 0,
        onClick: () => {
          onAssignToSelection(speaker.id);
        },
      });
    }
    contextMenuItems.push({
      label: selectedCount > 0 ? '新建说话人并指派到选中句段…' : '新建说话人并指派…',
      disabled: selectedCount === 0,
      onClick: () => {
        onOpenCreateAndAssignPanel();
      },
    });
  }

  if (trackModeControl) {
    const selectedSpeakerNames = trackModeControl.selectedSpeakerNames ?? [];
    const selectedSpeakerHint = selectedSpeakerNames.length > 0
      ? selectedSpeakerNames.join('、')
      : '当前未选中带说话人的句段';
    const lockConflictCount = trackModeControl.lockConflictCount ?? 0;
    const hasExistingLaneLocks = (trackModeControl.lockedSpeakerCount ?? 0) > 0;

    contextMenuItems.push({
      label: trackModeControl.mode === 'single' ? '切换为多轨模式（自动）' : '切换为单轨模式',
      onClick: () => {
        trackModeControl.onToggle();
      },
    });

    if (trackModeControl.onSetMode) {
      contextMenuItems.push({
        label: '切换为多轨模式（自动）',
        disabled: trackModeControl.mode === 'multi-auto',
        onClick: () => {
          trackModeControl.onSetMode?.('multi-auto');
        },
      });
      contextMenuItems.push({
        label: hasExistingLaneLocks ? '切换为多轨模式（锁定）' : '切换为多轨模式（锁定，需先锁定说话人）',
        disabled: trackModeControl.mode === 'multi-locked' || !hasExistingLaneLocks,
        onClick: () => {
          trackModeControl.onSetMode?.('multi-locked');
        },
      });
      contextMenuItems.push({
        label: '切换为多轨模式（一人一轨）',
        disabled: trackModeControl.mode === 'multi-speaker-fixed',
        onClick: () => {
          trackModeControl.onSetMode?.('multi-speaker-fixed');
        },
      });
    }

    if (trackModeControl.mode !== 'multi-speaker-fixed' && trackModeControl.onLockSelectedToLane) {
      contextMenuItems.push({
        label: `锁定选中说话人到轨道…（${selectedSpeakerHint}）`,
        disabled: selectedSpeakerNames.length === 0,
        onClick: () => {
          setContextMenu(null);
          openLaneLockDialog(selectedSpeakerHint, 0);
        },
      });
    }

    if (trackModeControl.mode !== 'multi-speaker-fixed' && trackModeControl.onUnlockSelected) {
      contextMenuItems.push({
        label: `解锁选中说话人（当前已锁 ${trackModeControl.lockedSpeakerCount ?? 0}）`,
        disabled: selectedSpeakerNames.length === 0,
        onClick: () => {
          trackModeControl.onUnlockSelected?.();
        },
      });
    }

    if (trackModeControl.onResetAuto) {
      contextMenuItems.push({
        label: trackModeControl.mode === 'multi-speaker-fixed' ? '恢复自动分轨并清空轨道映射' : '恢复自动分轨并清空锁定',
        onClick: () => {
          trackModeControl.onResetAuto?.();
        },
      });
    }

    if (lockConflictCount > 0) {
      contextMenuItems.push({
        label: trackModeControl.mode === 'multi-speaker-fixed'
          ? `一人一轨冲突 ${lockConflictCount} 项（请修正切分或说话人标注）`
          : `锁定冲突 ${lockConflictCount} 项（已回退自动分配）`,
        disabled: true,
      });
    }
  }

  const isDragged = dragState?.draggedId === layer.id;
  const isDropAbove = dropTargetIndex === layerIndex && !isDragged;
  const isDropBelow = dropTargetIndex === layerIndex + 1 && !isDragged;

  return (
    <div style={{ position: 'relative', display: 'contents' }}>
      {/* Drop indicator lines */}
      {isDropAbove && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            backgroundColor: 'var(--color-primary, #3b82f6)',
            zIndex: 10,
          }}
        />
      )}
      {isDropBelow && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '2px',
            backgroundColor: 'var(--color-primary, #3b82f6)',
            zIndex: 10,
          }}
        />
      )}

      <span
        ref={headerRef}
        className={`timeline-lane-label timeline-lane-header ${isDragged ? 'timeline-lane-header-dragging' : ''}`}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          if (isCollapsed) {
            onToggleCollapsed?.();
            e.stopPropagation();
          }
          onFocusLayer(layer.id);
        }}
      >
        {/* 连接线容器 | Connector stack */}
        {!isCollapsed && showConnectors && hasResolvableConnectorData && rowSegments.length > 0 && (() => {
          const connectorStackWidth = getLayerLinkStackWidth(connectorLayout.maxColumns);
          return (
            <span className="lane-link-stack" aria-hidden="true" style={{ width: connectorStackWidth }}>
              {rowSegments.map((segment) => (
                (() => {
                  const colors = getLayerLinkConnectorColors(segment.colorIndex);
                  return (
                <span
                  key={`${segment.column}-${segment.role}-${segment.colorIndex}`}
                  className={[
                    'lane-link-connector',
                    segment.role === 'bus-start' ? 'lane-link-connector--bus-start' : '',
                    segment.role === 'bus-middle' ? 'lane-link-connector--bus-middle' : '',
                    segment.role === 'bus-end' ? 'lane-link-connector--bus-end' : '',
                    segment.role === 'bus-single' ? 'lane-link-connector--bus-single' : '',
                    segment.role === 'tap-parent' ? 'lane-link-connector--tap' : '',
                    segment.role === 'tap-child' ? 'lane-link-connector--tap lane-link-connector--tap-child' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    '--lane-link-column': segment.column,
                    '--lane-link-color': colors.base,
                    '--lane-link-color-active': colors.active,
                  } as React.CSSProperties}
                />
                  );
                })()
              ))}
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
        <div
          className="layer-action-popover-backdrop"
          onClick={closeLaneLockDialog}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          role="presentation"
        >
          <div
            className="transcription-layer-rail-action-popover transcription-layer-rail-action-popover-centered floating-panel"
            role="dialog"
            aria-modal="true"
            aria-label="锁定说话人到轨道"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            style={{ width: 360, maxWidth: 'calc(100vw - 32px)', height: 'auto' }}
          >
            <div className="transcription-layer-rail-action-popover-title floating-panel-title-row">
              <span>锁定说话人到轨道</span>
              <button
                type="button"
                className="floating-panel-reset-btn"
                onClick={closeLaneLockDialog}
                aria-label="关闭锁定轨道面板"
                title="关闭"
              >
                ×
              </button>
            </div>
            <div className="transcription-layer-rail-action-popover-body">
              <div className="speaker-rail-batch-panel">
                <p className="speaker-rail-summary">选中说话人：{laneLockDialog.selectedSpeakerHint}</p>
                <label className="speaker-rail-form-field">
                  <span>目标轨道序号</span>
                  <input
                    autoFocus
                    type="number"
                    min={1}
                    step={1}
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
                <p className="speaker-rail-form-hint">输入从 1 开始的轨道编号，确认后会同时进入多轨锁定模式。</p>
                {laneLockError && <p className="speaker-rail-form-error">{laneLockError}</p>}
                <div className="speaker-rail-actions">
                  <button type="button" className="btn btn-sm" onClick={closeLaneLockDialog}>取消</button>
                  <button type="button" className="btn btn-sm btn-primary" onClick={confirmLaneLockDialog}>确认锁定</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
