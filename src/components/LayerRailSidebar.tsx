import { useState, useCallback, useEffect, useMemo, useRef, memo, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { TranslationLayerDocType } from '../db';
import type { useLayerActionPanel } from '../hooks/useLayerActionPanel';
import { fireAndForget } from '../utils/fireAndForget';
import { COMMON_LANGUAGES, formatLayerRailLabel } from '../utils/transcriptionFormatters';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { DeleteLayerConfirmDialog } from './DeleteLayerConfirmDialog';
import { useSpeakerRailContext } from '../contexts/SpeakerRailContext';
import { LayerRailProvider } from '../contexts/LayerRailContext';
import { useLayerDeleteConfirm } from '../hooks/useLayerDeleteConfirm';

type LayerActionResult = ReturnType<typeof useLayerActionPanel>;

interface LayerRailSidebarProps {
  isCollapsed: boolean;
  layerRailTab: 'layers' | 'links';
  onTabChange: (tab: 'layers' | 'links') => void;
  layerRailRows: TranslationLayerDocType[];
  focusedLayerRowId: string;
  flashLayerRowId: string;
  onFocusLayer: (id: string) => void;
  transcriptionLayers: TranslationLayerDocType[];
  translationLayers: TranslationLayerDocType[];
  layerLinks: Array<{ transcriptionLayerKey: string; tierId: string }>;
  toggleLayerLink: (transcriptionKey: string, translationId: string) => Promise<void>;
  deletableLayers: TranslationLayerDocType[];
  layerCreateMessage: string;
  layerAction: LayerActionResult;
  onReorderLayers: (draggedLayerId: string, targetIndex: number) => Promise<void>;
}

interface LayerRailActionModalProps {
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}

function LayerRailActionModal({ ariaLabel, children, onClose, className }: LayerRailActionModalProps) {
  const isSpeakerModal = Boolean(className?.includes('transcription-layer-rail-action-popover-speaker-centered'));
  const defaultSize = useMemo(
    () => (isSpeakerModal ? { width: 560, height: 560 } : { width: 340, height: 200 }),
    [isSpeakerModal],
  );
  const minSize = useMemo(
    () => (isSpeakerModal ? { width: 420, height: 320 } : { width: 280, height: 160 }),
    [isSpeakerModal],
  );

  const clampSize = useCallback((raw: { width: number; height: number }) => {
    const viewportPadding = 16;
    const maxWidth = Math.max(minSize.width, window.innerWidth - viewportPadding * 2);
    const maxHeight = Math.max(minSize.height, window.innerHeight - viewportPadding * 2);
    return {
      width: Math.min(Math.max(raw.width, minSize.width), maxWidth),
      height: Math.min(Math.max(raw.height, minSize.height), maxHeight),
    };
  }, [minSize.height, minSize.width]);

  const centerPosition = useCallback((panelSize: { width: number; height: number }) => ({
    x: Math.max(16, Math.round((window.innerWidth - panelSize.width) / 2)),
    y: Math.max(16, Math.round((window.innerHeight - panelSize.height) / 2)),
  }), []);

  const clampPosition = useCallback((raw: { x: number; y: number }, panelSize: { width: number; height: number }) => {
    const viewportPadding = 16;
    const maxX = Math.max(viewportPadding, window.innerWidth - panelSize.width - viewportPadding);
    const maxY = Math.max(viewportPadding, window.innerHeight - panelSize.height - viewportPadding);
    return {
      x: Math.min(Math.max(raw.x, viewportPadding), maxX),
      y: Math.min(Math.max(raw.y, viewportPadding), maxY),
    };
  }, []);

  const [size, setSize] = useState(() => clampSize(defaultSize));
  const [position, setPosition] = useState(() => centerPosition(clampSize(defaultSize)));
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);

  useEffect(() => {
    const safeSize = clampSize(defaultSize);
    setSize(safeSize);
    setPosition(centerPosition(safeSize));
  }, [ariaLabel, centerPosition, clampSize, defaultSize]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (dragRef.current) {
        const next = {
          x: dragRef.current.startLeft + (event.clientX - dragRef.current.startX),
          y: dragRef.current.startTop + (event.clientY - dragRef.current.startY),
        };
        setPosition(clampPosition(next, size));
      }

      if (resizeRef.current) {
        const nextSize = clampSize({
          width: resizeRef.current.startWidth + (event.clientX - resizeRef.current.startX),
          height: resizeRef.current.startHeight + (event.clientY - resizeRef.current.startY),
        });
        setSize(nextSize);
        setPosition((prev) => clampPosition(prev, nextSize));
      }
    };

    const onPointerUp = () => {
      if (!dragRef.current && !resizeRef.current) return;
      dragRef.current = null;
      resizeRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [clampPosition, clampSize, size]);

  useEffect(() => {
    const onResize = () => {
      setSize((prev) => {
        const safe = clampSize(prev);
        setPosition((old) => clampPosition(old, safe));
        return safe;
      });
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampPosition, clampSize]);

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: position.x,
      startTop: position.y,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'move';
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: size.width,
      startHeight: size.height,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
  };

  const handleResetLayout = (event?: React.MouseEvent<HTMLElement>) => {
    event?.stopPropagation();
    const safe = clampSize(defaultSize);
    setSize(safe);
    setPosition(centerPosition(safe));
  };

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="layer-action-popover-backdrop" onClick={onClose} role="presentation">
      <div
        className={className ?? 'transcription-layer-rail-action-popover transcription-layer-rail-action-popover-centered floating-panel'}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          transform: 'none',
        }}
      >
        <div
          className="transcription-layer-rail-action-popover-title floating-panel-title-row floating-panel-drag-handle"
          onPointerDown={handleDragStart}
          onDoubleClick={() => handleResetLayout()}
          title="拖动移动，双击回中并重置尺寸"
        >
          <span>{ariaLabel}</span>
          <button
            type="button"
            className="floating-panel-reset-btn"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleResetLayout}
            aria-label="重置位置与尺寸"
            title="重置位置与尺寸"
          >
            ↺
          </button>
        </div>
        <div className="transcription-layer-rail-action-popover-body">
          {children}
        </div>
        <div className="floating-panel-resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
      </div>
    </div>,
    document.body,
  );
}

export function LayerRailSidebar({
  isCollapsed,
  layerRailTab,
  onTabChange,
  layerRailRows,
  focusedLayerRowId,
  flashLayerRowId,
  onFocusLayer,
  transcriptionLayers,
  translationLayers,
  layerLinks,
  toggleLayerLink,
  deletableLayers,
  layerCreateMessage,
  layerAction,
  onReorderLayers,
}: LayerRailSidebarProps) {
  // ── Speaker management context ───────────────────────────────────────────────
  const speakerCtx = useSpeakerRailContext();

  const {
    layerActionPanel, setLayerActionPanel, layerActionRootRef,
    quickTranscriptionLangId, setQuickTranscriptionLangId,
    quickTranscriptionCustomLang, setQuickTranscriptionCustomLang,
    quickTranscriptionAlias, setQuickTranscriptionAlias,
    quickTranslationLangId, setQuickTranslationLangId,
    quickTranslationCustomLang, setQuickTranslationCustomLang,
    quickTranslationAlias, setQuickTranslationAlias,
    quickTranslationModality, setQuickTranslationModality,
    quickDeleteLayerId, setQuickDeleteLayerId,
    quickDeleteKeepUtterances, setQuickDeleteKeepUtterances,
    handleCreateTranscriptionFromPanel,
    handleCreateTranslationFromPanel,
    handleDeleteLayerFromPanel,
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
  } = layerAction;

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layerId: string } | null>(null);

  const {
    deleteLayerConfirm,
    deleteConfirmKeepUtterances,
    setDeleteConfirmKeepUtterances,
    requestDeleteLayer,
    cancelDeleteLayerConfirm,
    confirmDeleteLayer,
  } = useLayerDeleteConfirm({
    deletableLayers,
    checkLayerHasContent,
    deleteLayer,
    deleteLayerWithoutConfirm,
  });

  const handleLayerContextMenu = (e: React.MouseEvent, layerId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, layerId });
    onFocusLayer(layerId);
  };

  // ── Drag-and-drop state ──
  const [dragState, setDragState] = useState<{
    draggedId: string;
    sourceIndex: number;
    sourceType: 'transcription' | 'translation';
  } | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [collapsedSpeakerGroupKeys, setCollapsedSpeakerGroupKeys] = useState<Set<string>>(new Set());

  const toggleSpeakerGroupCollapsed = (speakerKey: string) => {
    setCollapsedSpeakerGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(speakerKey)) next.delete(speakerKey);
      else next.add(speakerKey);
      return next;
    });
  };

  const handleDragStart = (e: React.MouseEvent, layer: TranslationLayerDocType) => {
    // Long press (500ms) to start drag - use timer instead of mousedown/mouseup
    const timer = setTimeout(() => {
      const currentIndex = layerRailRows.findIndex((l) => l.id === layer.id);
      setDragState({
        draggedId: layer.id,
        sourceIndex: currentIndex,
        sourceType: layer.layerType,
      });
    }, 500);

    const cleanup = () => clearTimeout(timer);
    const handleMouseUp = () => {
      cleanup();
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;

    // Find which layer item the mouse is over
    const overview = (e.currentTarget as HTMLElement).closest('.transcription-layer-rail-overview');
    if (!overview) return;

    const items = Array.from(overview.querySelectorAll<HTMLElement>('.transcription-layer-rail-item'));
    let targetIndex = -1;
    for (let i = 0; i < items.length; i++) {
      const rect = items[i]!.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        targetIndex = i;
        break;
      }
      targetIndex = i + 1;
    }

    // Enforce constraint: translation layers can't go above transcription layers
    const transcriptionCount = transcriptionLayers.length;
    if (dragState.sourceType === 'transcription') {
      // Transcription layer can only drop within transcription section
      targetIndex = Math.min(targetIndex, transcriptionCount);
    } else {
      // Translation layer can only drop within translation section
      targetIndex = Math.max(transcriptionCount, targetIndex);
      if (targetIndex > layerRailRows.length) targetIndex = layerRailRows.length;
    }

    setDropTargetIndex(targetIndex);
  };

  const handleMouseUp = () => {
    if (dragState && dropTargetIndex !== null && dropTargetIndex !== dragState.sourceIndex) {
      const reorderTargetIndex = dragState.sourceType === 'translation'
        ? Math.max(0, dropTargetIndex - transcriptionLayers.length)
        : dropTargetIndex;
      fireAndForget(onReorderLayers(dragState.draggedId, reorderTargetIndex));
    }
    setDragState(null);
    setDropTargetIndex(null);
  };

  const contextMenuItems: ContextMenuItem[] = contextMenu ? [
    {
      label: '新建转写层',
      onClick: () => {
        // Use default language for quick create
        fireAndForget((async () => {
          const defaultLang = quickTranscriptionLangId || 'und';
          const alias = quickTranscriptionAlias.trim();
          await createLayer('transcription', {
            languageId: defaultLang,
            ...(alias ? { alias } : {}),
          });
        })());
      },
    },
    {
      label: '新建翻译层',
      onClick: () => {
        fireAndForget((async () => {
          const defaultLang = quickTranslationLangId || 'und';
          const alias = quickTranslationAlias.trim();
          await createLayer('translation', {
            languageId: defaultLang,
            ...(alias ? { alias } : {}),
          }, quickTranslationModality);
        })());
      },
    },
    {
      label: '删除当前层',
      danger: true,
      disabled: !deletableLayers.some((l) => l.id === contextMenu.layerId),
      onClick: () => {
        fireAndForget(requestDeleteLayer(contextMenu.layerId));
      },
    },
  ] : [];

  const renderSpeakerManagementPopover = () => (
    <LayerRailActionModal
      ariaLabel="说话人管理"
      onClose={() => setLayerActionPanel(null)}
      className="transcription-layer-rail-action-popover transcription-layer-rail-action-popover-centered transcription-layer-rail-action-popover-speaker transcription-layer-rail-action-popover-speaker-centered floating-panel"
    >
      <div className="transcription-layer-rail-speaker-panel-section transcription-layer-rail-speaker-panel-summary">
        <strong className="transcription-layer-rail-speaker-panel-title">说话人管理</strong>
        <div className="transcription-layer-rail-speaker-panel-meta">
          <span>说话人：{speakerCtx.speakerFilterOptions.length}</span>
          <span>已选句段：{speakerCtx.selectedUtteranceIds.size}</span>
        </div>
        <div className="transcription-layer-rail-speaker-panel-summary-text">{speakerCtx.selectedSpeakerSummary}</div>
      </div>

      <div className="transcription-layer-rail-speaker-panel-section">
        <strong className="transcription-layer-rail-speaker-panel-subtitle">批量分配</strong>
        <select
          className="input transcription-layer-rail-action-input"
          value={speakerCtx.batchSpeakerId}
          onChange={(e) => speakerCtx.setBatchSpeakerId(e.target.value)}
          disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0}
        >
          <option value="">删除说话人标签</option>
          {speakerCtx.speakerOptions.map((speaker) => (
            <option key={speaker.id} value={speaker.id}>{speaker.name}</option>
          ))}
        </select>
        <div className="transcription-layer-rail-action-row transcription-layer-rail-action-row-fill">
          <button
            className="btn btn-sm"
            disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0}
            onClick={() => { fireAndForget(speakerCtx.handleAssignSpeakerToSelected()); }}
          >
            应用到已选
          </button>
        </div>
        <input
          className="input transcription-layer-rail-action-input"
          placeholder="新说话人名称"
          value={speakerCtx.speakerDraftName}
          onChange={(e) => speakerCtx.setSpeakerDraftName(e.target.value)}
          disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0}
        />
        <div className="transcription-layer-rail-action-row transcription-layer-rail-action-row-fill">
          <button
            className="btn btn-sm"
            disabled={speakerCtx.speakerSaving || speakerCtx.selectedUtteranceIds.size === 0 || speakerCtx.speakerDraftName.trim().length === 0}
            onClick={() => { fireAndForget(speakerCtx.handleCreateSpeakerAndAssign()); }}
          >
            新建并分配
          </button>
        </div>
      </div>

      <div className="transcription-layer-rail-speaker-panel-section">
        <div className="transcription-layer-rail-speaker-filter" aria-label="说话人筛选">
          <button
            type="button"
            className={`transcription-layer-rail-speaker-chip ${speakerCtx.activeSpeakerFilterKey === 'all' ? 'transcription-layer-rail-speaker-chip-active' : ''}`}
            onClick={() => speakerCtx.setActiveSpeakerFilterKey('all')}
            title="显示全部说话人"
          >
            全部
          </button>
          {speakerCtx.speakerFilterOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`transcription-layer-rail-speaker-chip ${speakerCtx.activeSpeakerFilterKey === option.key ? 'transcription-layer-rail-speaker-chip-active' : ''}`}
              onClick={() => speakerCtx.setActiveSpeakerFilterKey(option.key)}
              title={`${option.name}（${option.count}）`}
              style={option.color ? ({ '--speaker-color': option.color } as CSSProperties) : undefined}
            >
              <span className="transcription-layer-rail-speaker-dot" />
              <span className="transcription-layer-rail-speaker-name">{option.name}</span>
              <span className="transcription-layer-rail-speaker-count">{option.count}</span>
            </button>
          ))}
        </div>
      </div>

      {speakerCtx.speakerFilterOptions.length > 0 && (
        <div className="transcription-layer-rail-speaker-panel-section transcription-layer-rail-speaker-groups" aria-label="说话人组">
          {speakerCtx.speakerFilterOptions.map((option) => {
            const isCollapsedGroup = collapsedSpeakerGroupKeys.has(option.key);
            return (
              <div key={`group-${option.key}`} className="transcription-layer-rail-speaker-group">
                <div className="transcription-layer-rail-speaker-group-head" style={option.color ? ({ '--speaker-color': option.color } as CSSProperties) : undefined}>
                  <button
                    type="button"
                    className="transcription-layer-rail-speaker-group-toggle"
                    onClick={() => toggleSpeakerGroupCollapsed(option.key)}
                    aria-expanded={!isCollapsedGroup}
                    title={isCollapsedGroup ? '展开说话人组' : '折叠说话人组'}
                  >
                    <span className="transcription-layer-rail-speaker-dot" />
                    <span className="transcription-layer-rail-speaker-name">{option.name}</span>
                    <span className="transcription-layer-rail-speaker-count">{option.count}</span>
                  </button>
                  <div className="transcription-layer-rail-speaker-group-actions">
                    <button
                      type="button"
                      className={`transcription-layer-rail-speaker-mini-btn ${speakerCtx.activeSpeakerFilterKey === option.key ? 'transcription-layer-rail-speaker-mini-btn-active' : ''}`}
                      onClick={() => speakerCtx.setActiveSpeakerFilterKey(option.key)}
                      title="只看该说话人"
                    >
                      聚焦
                    </button>
                    <button
                      type="button"
                      className="transcription-layer-rail-speaker-mini-btn"
                      onClick={() => speakerCtx.handleSelectSpeakerUtterances(option.key)}
                      title="选中该说话人的全部句段"
                    >
                      选中
                    </button>
                    <button
                      type="button"
                      className="transcription-layer-rail-speaker-mini-btn"
                      onClick={() => speakerCtx.handleClearSpeakerAssignments(option.key)}
                      title="删除该说话人的标签"
                    >
                      删除标签
                    </button>
                    <button
                      type="button"
                      className="transcription-layer-rail-speaker-mini-btn"
                      onClick={() => speakerCtx.handleExportSpeakerSegments(option.key)}
                      title="导出该说话人句段清单"
                    >
                      导出
                    </button>
                    <button
                      type="button"
                      className="transcription-layer-rail-speaker-mini-btn"
                      onClick={() => speakerCtx.handleRenameSpeaker(option.key)}
                      title={option.isEntity ? '重命名该说话人' : '仅实体说话人支持重命名'}
                      disabled={!option.isEntity}
                    >
                      改名
                    </button>
                    <button
                      type="button"
                      className="transcription-layer-rail-speaker-mini-btn"
                      onClick={() => speakerCtx.handleMergeSpeaker(option.key)}
                      title={option.isEntity ? '将该说话人合并到其他说话人' : '仅实体说话人支持合并'}
                      disabled={!option.isEntity}
                    >
                      合并
                    </button>
                    <button
                      type="button"
                      className="transcription-layer-rail-speaker-mini-btn transcription-layer-rail-speaker-mini-btn-danger"
                      onClick={() => speakerCtx.handleDeleteSpeaker(option.key)}
                      title={option.isEntity ? '删除该说话人实体（危险）' : '仅实体说话人支持删除'}
                      disabled={!option.isEntity}
                    >
                      删除说话人实体
                    </button>
                  </div>
                </div>
                {!isCollapsedGroup && (
                  <div className="transcription-layer-rail-speaker-group-body">
                    <span>句段数：{option.count}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </LayerRailActionModal>
  );

  // ── Layer rail items render ──────────────────────────────────────────────────
  // Memoized row component to prevent re-renders when parent re-renders
  const LayerRailItemRow = memo(function LayerRailItemRow({
    layer,
    index,
    focusedLayerRowId,
    flashLayerRowId,
    dragState,
    dropTargetIndex,
    onFocusLayer,
    onContextMenu,
    onMouseDown,
  }: {
    layer: TranslationLayerDocType;
    index: number;
    focusedLayerRowId: string;
    flashLayerRowId: string;
    dragState: { draggedId: string; sourceIndex: number; sourceType: 'transcription' | 'translation' } | null;
    dropTargetIndex: number | null;
    onFocusLayer: (id: string) => void;
    onContextMenu: (e: React.MouseEvent, layerId: string) => void;
    onMouseDown: (e: React.MouseEvent, layer: TranslationLayerDocType) => void;
  }) {
    const layerLabel = formatLayerRailLabel(layer);
    const isActiveLayer = layer.id === focusedLayerRowId;
    const isFlashLayer = layer.id === flashLayerRowId;
    const isDragged = dragState?.draggedId === layer.id;
    const showDropIndicator = dropTargetIndex === index && !isDragged;

    return (
      <div key={layer.id} style={{ position: 'relative' }}>
        {showDropIndicator && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              backgroundColor: 'var(--color-primary, #3b82f6)',
              zIndex: 1,
            }}
          />
        )}
        <button
          type="button"
          className={`transcription-layer-rail-item ${isActiveLayer ? 'transcription-layer-rail-item-active' : ''} ${isFlashLayer ? 'transcription-layer-rail-item-flash' : ''} ${isDragged ? 'transcription-layer-rail-item-dragging' : ''}`}
          onClick={() => !dragState && onFocusLayer(layer.id)}
          onContextMenu={(e) => onContextMenu(e, layer.id)}
          onMouseDown={(e) => !dragState && onMouseDown(e, layer)}
          title={layerLabel}
        >
          <strong>{layerLabel}</strong>
        </button>
      </div>
    );
  });

  const renderLayerRailItems = () => {
    if (layerRailRows.length === 0) {
      return <span className="transcription-layer-rail-empty">暂无层</span>;
    }
    return layerRailRows.map((layer, index) => (
      <LayerRailItemRow
        key={layer.id}
        layer={layer}
        index={index}
        focusedLayerRowId={focusedLayerRowId}
        flashLayerRowId={flashLayerRowId}
        dragState={dragState}
        dropTargetIndex={dropTargetIndex}
        onFocusLayer={onFocusLayer}
        onContextMenu={handleLayerContextMenu}
        onMouseDown={handleDragStart}
      />
    ));
  };

  return (
    <LayerRailProvider deletableLayers={deletableLayers} checkLayerHasContent={checkLayerHasContent} deleteLayer={deleteLayer} deleteLayerWithoutConfirm={deleteLayerWithoutConfirm}>
    <aside className={`transcription-layer-rail ${isCollapsed ? 'transcription-layer-rail-collapsed' : ''}`} aria-label="文本区层滚动栏">
      {/* Tab 切换栏 | Tab bar */}
      <div className="transcription-layer-rail-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={layerRailTab === 'layers'}
          className={`transcription-layer-rail-tab ${layerRailTab === 'layers' ? 'transcription-layer-rail-tab-active' : ''}`}
          onClick={() => onTabChange('layers')}
        >
          层列表
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={layerRailTab === 'links'}
          className={`transcription-layer-rail-tab ${layerRailTab === 'links' ? 'transcription-layer-rail-tab-active' : ''}`}
          onClick={() => onTabChange('links')}
        >
          链接
        </button>
      </div>

      {/* 层列表视图 | Layer list view */}
      {layerRailTab === 'layers' && (
      <div
        className="transcription-layer-rail-overview"
        onMouseMove={dragState ? handleMouseMove : undefined}
        onMouseUp={dragState ? handleMouseUp : undefined}
        onMouseLeave={dragState ? handleMouseUp : undefined}
      >
        {renderLayerRailItems()}
      </div>
      )}

      {/* 链接关系视图 | Links view */}
      {layerRailTab === 'links' && (
      <div className="transcription-layer-rail-overview transcription-layer-rail-links">
        {transcriptionLayers.length > 0 ? (
          transcriptionLayers.map((trc) => {
            const trcLabel = formatLayerRailLabel(trc);
            return (
              <div key={trc.id} className="transcription-layer-rail-link-group">
                <div className="transcription-layer-rail-link-header" title={trc.key}>
                  <strong>{trcLabel}</strong>
                </div>
                {translationLayers.length > 0 ? (
                  translationLayers.map((trl) => {
                    const isLinked = layerLinks.some(
                      (link) => link.transcriptionLayerKey === trc.key && link.tierId === trl.id,
                    );
                    const trlLabel = formatLayerRailLabel(trl);
                    return (
                      <label key={trl.id} className="transcription-layer-rail-link-item" title={trl.key}>
                        <input
                          type="checkbox"
                          checked={isLinked}
                          onChange={() => { fireAndForget(toggleLayerLink(trc.key, trl.id)); }}
                        />
                        <span>{trlLabel}</span>
                      </label>
                    );
                  })
                ) : (
                  <span className="transcription-layer-rail-empty">暂无翻译层</span>
                )}
              </div>
            );
          })
        ) : (
          <span className="transcription-layer-rail-empty">暂无转写层</span>
        )}
      </div>
      )}
      <div className="transcription-layer-rail-actions" aria-label="层管理快捷操作" ref={layerActionRootRef}>
        <button
          type="button"
          className={`transcription-layer-rail-action-btn ${layerActionPanel === 'speaker-management' ? 'transcription-layer-rail-action-btn-active' : ''}`}
          onClick={() => setLayerActionPanel((prev) => (prev === 'speaker-management' ? null : 'speaker-management'))}
        >
          <strong>说话人管理</strong>
        </button>
        <button
          type="button"
          className={`transcription-layer-rail-action-btn ${layerActionPanel === 'create-transcription' ? 'transcription-layer-rail-action-btn-active' : ''}`}
          onClick={() => setLayerActionPanel((prev) => (prev === 'create-transcription' ? null : 'create-transcription'))}
        >
          <strong>新建转写</strong>
        </button>
        <button
          type="button"
          className={`transcription-layer-rail-action-btn ${layerActionPanel === 'create-translation' ? 'transcription-layer-rail-action-btn-active' : ''}`}
          onClick={() => setLayerActionPanel((prev) => (prev === 'create-translation' ? null : 'create-translation'))}
        >
          <strong>新建翻译</strong>
        </button>
        <button
          type="button"
          className={`transcription-layer-rail-action-btn transcription-layer-rail-action-btn-danger ${layerActionPanel === 'delete' ? 'transcription-layer-rail-action-btn-active' : ''}`}
          disabled={!focusedLayerRowId || deletableLayers.length === 0}
          onClick={() => setLayerActionPanel((prev) => (prev === 'delete' ? null : 'delete'))}
        >
          <strong>删除</strong>
        </button>

        {layerActionPanel === 'speaker-management' && renderSpeakerManagementPopover()}

        {layerActionPanel === 'create-transcription' && (
          <LayerRailActionModal ariaLabel="新建转写层" onClose={() => setLayerActionPanel(null)}>
            <select
              className="input transcription-layer-rail-action-input"
              value={quickTranscriptionLangId}
              onChange={(e) => setQuickTranscriptionLangId(e.target.value)}
            >
              <option value="">选择语言…</option>
              {COMMON_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label}（{lang.code}）</option>
              ))}
              <option value="__custom__">其他（手动输入）</option>
            </select>
            {quickTranscriptionLangId === '__custom__' && (
              <input
                className="input transcription-layer-rail-action-input"
                placeholder="ISO 639-3 代码（如 tib）"
                value={quickTranscriptionCustomLang}
                onChange={(e) => setQuickTranscriptionCustomLang(e.target.value)}
              />
            )}
            <input
              className="input transcription-layer-rail-action-input"
              placeholder="别名（可选）"
              value={quickTranscriptionAlias}
              onChange={(e) => setQuickTranscriptionAlias(e.target.value)}
            />
            <div className="transcription-layer-rail-action-row">
              <button className="btn btn-sm" onClick={() => { fireAndForget(handleCreateTranscriptionFromPanel()); }}>创建</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setLayerActionPanel(null)}>取消</button>
            </div>
          </LayerRailActionModal>
        )}

        {layerActionPanel === 'create-translation' && (
          <LayerRailActionModal ariaLabel="新建翻译层" onClose={() => setLayerActionPanel(null)}>
            <select
              className="input transcription-layer-rail-action-input"
              value={quickTranslationLangId}
              onChange={(e) => setQuickTranslationLangId(e.target.value)}
            >
              <option value="">选择语言…</option>
              {COMMON_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label}（{lang.code}）</option>
              ))}
              <option value="__custom__">其他（手动输入）</option>
            </select>
            {quickTranslationLangId === '__custom__' && (
              <input
                className="input transcription-layer-rail-action-input"
                placeholder="ISO 639-3 代码（如 tib）"
                value={quickTranslationCustomLang}
                onChange={(e) => setQuickTranslationCustomLang(e.target.value)}
              />
            )}
            <input
              className="input transcription-layer-rail-action-input"
              placeholder="别名（可选）"
              value={quickTranslationAlias}
              onChange={(e) => setQuickTranslationAlias(e.target.value)}
            />
            <select
              className="input transcription-layer-rail-action-input"
              value={quickTranslationModality}
              onChange={(e) => setQuickTranslationModality(e.target.value as 'text' | 'audio' | 'mixed')}
            >
              <option value="text">文本（纯文字翻译）</option>
              <option value="audio">语音（口译录音）</option>
              <option value="mixed">混合（文字 + 录音）</option>
            </select>
            <div className="transcription-layer-rail-action-row">
              <button className="btn btn-sm" onClick={() => { fireAndForget(handleCreateTranslationFromPanel()); }}>创建</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setLayerActionPanel(null)}>取消</button>
            </div>
          </LayerRailActionModal>
        )}

        {layerActionPanel === 'delete' && (
          <LayerRailActionModal ariaLabel="删除层" onClose={() => setLayerActionPanel(null)}>
            <select
              className="input transcription-layer-rail-action-input"
              value={quickDeleteLayerId}
              onChange={(e) => setQuickDeleteLayerId(e.target.value)}
            >
              {deletableLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {formatLayerRailLabel(layer)}
                </option>
              ))}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={quickDeleteKeepUtterances}
                onChange={(e) => setQuickDeleteKeepUtterances(e.target.checked)}
              />
              保留现有语段区间
            </label>
            <div className="transcription-layer-rail-action-row">
              <button
                className="btn btn-sm btn-danger"
                disabled={!quickDeleteLayerId}
                onClick={() => { fireAndForget(handleDeleteLayerFromPanel()); }}
              >
                删除
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setLayerActionPanel(null)}>取消</button>
            </div>
          </LayerRailActionModal>
        )}

        {layerCreateMessage && (
          <p className="small-text" style={{ margin: 0, fontSize: '0.7rem' }}>
            {layerCreateMessage}
          </p>
        )}
      </div>

      {/* Context menu for right-click on layer items */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete layer confirmation dialog */}
      <DeleteLayerConfirmDialog
        open={deleteLayerConfirm !== null}
        layerName={deleteLayerConfirm?.layerName ?? ''}
        layerType={deleteLayerConfirm?.layerType ?? 'transcription'}
        textCount={deleteLayerConfirm?.textCount ?? 0}
        keepUtterances={deleteConfirmKeepUtterances}
        onKeepUtterancesChange={setDeleteConfirmKeepUtterances}
        onCancel={cancelDeleteLayerConfirm}
        onConfirm={() => { fireAndForget(confirmDeleteLayer()); }}
      />
    </aside>
    </LayerRailProvider>
  );
}
