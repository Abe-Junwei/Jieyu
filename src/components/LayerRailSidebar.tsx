import { useState, type CSSProperties } from 'react';
import type { TranslationLayerDocType } from '../../db';
import type { useLayerActionPanel } from '../hooks/useLayerActionPanel';
import { fireAndForget } from '../utils/fireAndForget';
import { COMMON_LANGUAGES, formatLayerRailLabel } from '../utils/transcriptionFormatters';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

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
  speakerFilterOptions: Array<{ key: string; name: string; count: number; color?: string; isEntity: boolean }>;
  activeSpeakerFilterKey: string;
  onSpeakerFilterChange: (speakerKey: string) => void;
  onSelectSpeakerUtterances: (speakerKey: string) => void;
  onClearSpeakerAssignments: (speakerKey: string) => void;
  onExportSpeakerSegments: (speakerKey: string) => void;
  onRenameSpeaker: (speakerKey: string) => void;
  onMergeSpeaker: (sourceSpeakerKey: string) => void;
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
  speakerFilterOptions,
  activeSpeakerFilterKey,
  onSpeakerFilterChange,
  onSelectSpeakerUtterances,
  onClearSpeakerAssignments,
  onExportSpeakerSegments,
  onRenameSpeaker,
  onMergeSpeaker,
}: LayerRailSidebarProps) {
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
    handleCreateTranscriptionFromPanel,
    handleCreateTranslationFromPanel,
    handleDeleteLayerFromPanel,
    createLayer,
    deleteLayer,
  } = layerAction;

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layerId: string } | null>(null);

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
        fireAndForget(deleteLayer(contextMenu.layerId));
      },
    },
  ] : [];

  return (
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
        <div className="transcription-layer-rail-speaker-filter" aria-label="说话人筛选">
          <button
            type="button"
            className={`transcription-layer-rail-speaker-chip ${activeSpeakerFilterKey === 'all' ? 'transcription-layer-rail-speaker-chip-active' : ''}`}
            onClick={() => onSpeakerFilterChange('all')}
            title="显示全部说话人"
          >
            全部
          </button>
          {speakerFilterOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`transcription-layer-rail-speaker-chip ${activeSpeakerFilterKey === option.key ? 'transcription-layer-rail-speaker-chip-active' : ''}`}
              onClick={() => onSpeakerFilterChange(option.key)}
              title={`${option.name}（${option.count}）`}
              style={option.color ? ({ '--speaker-color': option.color } as CSSProperties) : undefined}
            >
              <span className="transcription-layer-rail-speaker-dot" />
              <span className="transcription-layer-rail-speaker-name">{option.name}</span>
              <span className="transcription-layer-rail-speaker-count">{option.count}</span>
            </button>
          ))}
        </div>
        {speakerFilterOptions.length > 0 && (
          <div className="transcription-layer-rail-speaker-groups" aria-label="说话人组">
            {speakerFilterOptions.map((option) => {
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
                        className={`transcription-layer-rail-speaker-mini-btn ${activeSpeakerFilterKey === option.key ? 'transcription-layer-rail-speaker-mini-btn-active' : ''}`}
                        onClick={() => onSpeakerFilterChange(option.key)}
                        title="只看该说话人"
                      >
                        聚焦
                      </button>
                      <button
                        type="button"
                        className="transcription-layer-rail-speaker-mini-btn"
                        onClick={() => onSelectSpeakerUtterances(option.key)}
                        title="选中该说话人的全部句段"
                      >
                        选中
                      </button>
                      <button
                        type="button"
                        className="transcription-layer-rail-speaker-mini-btn"
                        onClick={() => onClearSpeakerAssignments(option.key)}
                        title="清空该说话人的标签"
                      >
                        清空
                      </button>
                      <button
                        type="button"
                        className="transcription-layer-rail-speaker-mini-btn"
                        onClick={() => onExportSpeakerSegments(option.key)}
                        title="导出该说话人句段清单"
                      >
                        导出
                      </button>
                      <button
                        type="button"
                        className="transcription-layer-rail-speaker-mini-btn"
                        onClick={() => onRenameSpeaker(option.key)}
                        title={option.isEntity ? '重命名该说话人' : '仅实体说话人支持重命名'}
                        disabled={!option.isEntity}
                      >
                        改名
                      </button>
                      <button
                        type="button"
                        className="transcription-layer-rail-speaker-mini-btn"
                        onClick={() => onMergeSpeaker(option.key)}
                        title={option.isEntity ? '将该说话人合并到其他说话人' : '仅实体说话人支持合并'}
                        disabled={!option.isEntity}
                      >
                        合并
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
        {(() => {
          return layerRailRows.length > 0 ? (
          layerRailRows.map((layer, index) => {
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
                  onContextMenu={(e) => handleLayerContextMenu(e, layer.id)}
                  onMouseDown={(e) => !dragState && handleDragStart(e, layer)}
                  title={layerLabel}
                >
                  <strong>{layerLabel}</strong>
                </button>
              </div>
            );
          })
        ) : (
          <span className="transcription-layer-rail-empty">暂无层</span>
        );
      })()}
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

        {layerActionPanel === 'create-transcription' && (
          <div className="transcription-layer-rail-action-popover" role="dialog" aria-label="新建转写层">
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
          </div>
        )}

        {layerActionPanel === 'create-translation' && (
          <div className="transcription-layer-rail-action-popover" role="dialog" aria-label="新建翻译层">
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
          </div>
        )}

        {layerActionPanel === 'delete' && (
          <div className="transcription-layer-rail-action-popover" role="dialog" aria-label="删除层">
            <select
              className="input transcription-layer-rail-action-input"
              value={quickDeleteLayerId}
              onChange={(e) => setQuickDeleteLayerId(e.target.value)}
            >
              {deletableLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {(layer.name.zho ?? layer.name.zh ?? layer.name.eng ?? layer.name.en ?? layer.key)}
                </option>
              ))}
            </select>
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
          </div>
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
    </aside>
  );
}
