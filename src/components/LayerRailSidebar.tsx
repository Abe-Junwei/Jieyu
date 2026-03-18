import type { TranslationLayerDocType } from '../../db';
import type { useLayerActionPanel } from '../hooks/useLayerActionPanel';
import { fireAndForget } from '../utils/fireAndForget';
import { COMMON_LANGUAGES, formatLayerRailLabel } from '../utils/transcriptionFormatters';

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
  } = layerAction;

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
      <div className="transcription-layer-rail-overview">
        {layerRailRows.length > 0 ? (
          layerRailRows.map((layer) => {
            const layerLabel = formatLayerRailLabel(layer);
            const isActiveLayer = layer.id === focusedLayerRowId;
            const isFlashLayer = layer.id === flashLayerRowId;
            return (
              <button
                key={layer.id}
                type="button"
                className={`transcription-layer-rail-item ${isActiveLayer ? 'transcription-layer-rail-item-active' : ''} ${isFlashLayer ? 'transcription-layer-rail-item-flash' : ''}`}
                onClick={() => onFocusLayer(layer.id)}
              >
                <strong>{layerLabel}</strong>
              </button>
            );
          })
        ) : (
          <span className="transcription-layer-rail-empty">暂无层</span>
        )}
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
    </aside>
  );
}
