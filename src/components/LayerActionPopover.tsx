import React, { useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { LayerCreateInput } from '../hooks/transcriptionTypes';
import type { LayerConstraint, LayerDocType } from '../db';
import { getLayerCreateGuard } from '../services/LayerConstraintService';
import { useDraggablePanel } from '../hooks/useDraggablePanel';

type LayerActionType = 'create-transcription' | 'create-translation' | 'delete';

interface LayerActionPopoverProps {
  action: LayerActionType;
  layerId: string | undefined;
  deletableLayers: LayerDocType[];
  layerCreateMessage?: string;
  createLayer: (
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  deleteLayer: (layerId: string) => Promise<void>;
  deleteLayerWithoutConfirm?: (layerId: string) => Promise<void>;
  checkLayerHasContent?: (layerId: string) => Promise<number>;
  onClose: () => void;
}

const COMMON_LANGUAGES = [
  { code: 'cmn', label: '普通话' },
  { code: 'zho', label: '中文' },
  { code: 'yue', label: '粤语' },
  { code: 'wuu', label: '吴语' },
  { code: 'nan', label: '闽南语' },
  { code: 'hak', label: '客家话' },
  { code: 'eng', label: 'English' },
  { code: 'jpn', label: '日本語' },
  { code: 'kor', label: '한국어' },
  { code: 'fra', label: 'Français' },
  { code: 'deu', label: 'Deutsch' },
  { code: 'spa', label: 'Español' },
  { code: 'rus', label: 'Русский' },
  { code: 'ara', label: 'العربية' },
  { code: 'por', label: 'Português' },
  { code: 'hin', label: 'हिन्दी' },
  { code: 'vie', label: 'Tiếng Việt' },
  { code: 'tha', label: 'ภาษาไทย' },
  { code: 'msa', label: 'Bahasa Melayu' },
  { code: 'ind', label: 'Bahasa Indonesia' },
];

const PANEL_MIN_WIDTH = 280;
const PANEL_MIN_HEIGHT = 180;
const PANEL_MAX_WIDTH = 760;
const PANEL_MAX_HEIGHT = 560;
const PANEL_MARGIN = 8;
const PANEL_DEFAULT_SIZE: PanelSize = { width: 360, height: 240 };

type PanelPosition = { x: number; y: number };
type PanelSize = { width: number; height: number };

function resolveCreateFailureText(message: string | undefined, fallback: string): string {
  const raw = (message ?? '').trim();
  const text = raw.replace(/^创建失败[:：]\s*/u, '');
  if (!text) return fallback;
  if (text.startsWith('已创建')) return fallback;
  return text;
}

function getCreateFallbackMessage(action: LayerActionType): string {
  if (action === 'create-translation') {
    return '无法创建翻译层：请先确保存在转写层；同语言翻译层需填写别名，且翻译层不能与转写层同语言。';
  }
  if (action === 'create-transcription') {
    return '无法创建转写层：同语言转写层需填写别名，且转写层不能与翻译层同语言。';
  }
  return '操作失败，请稍后重试。';
}

export function LayerActionPopover({
  action,
  layerId,
  deletableLayers,
  layerCreateMessage,
  createLayer,
  deleteLayer,
  deleteLayerWithoutConfirm,
  checkLayerHasContent,
  onClose,
}: LayerActionPopoverProps) {
  const storageKey = `jieyu:layer-action-popover-rect:${action}`;
  const [langId, setLangId] = useState('');
  const [customLang, setCustomLang] = useState('');
  const [alias, setAlias] = useState('');
  const [modality, setModality] = useState<'text' | 'audio' | 'mixed'>('text');
  const [constraint, setConstraint] = useState<LayerConstraint>('symbolic_association');
  const [deleteLayerId, setDeleteLayerId] = useState(layerId ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [createFailureMessage, setCreateFailureMessage] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ layerId: string; layerName: string; textCount: number } | null>(null);

  const {
    position,
    size,
    handleDragStart,
    handleResizeStart,
    handleRecenter,
    handleResetPanelLayout,
  } = useDraggablePanel({
    storageKey,
    defaultSize: PANEL_DEFAULT_SIZE,
    minWidth: PANEL_MIN_WIDTH,
    minHeight: PANEL_MIN_HEIGHT,
    maxWidth: PANEL_MAX_WIDTH,
    maxHeight: PANEL_MAX_HEIGHT,
    margin: PANEL_MARGIN,
  });

  // Sync deleteLayerId when layerId changes
  useEffect(() => {
    if (layerId) setDeleteLayerId(layerId);
  }, [layerId]);

  useEffect(() => {
    setCreateFailureMessage('');
  }, [action]);

  // Keep currentPositionRef and currentSizeRef in sync with state to avoid stale closures | 保持 ref 与 state 同步，避免闭包过期

  const handleCreate = useCallback(async () => {
    const resolvedLang = langId === '__custom__' ? customLang.trim() : langId;
    if (!resolvedLang) return;
    const existingTranscriptionCount = deletableLayers.filter((layer) => layer.layerType === 'transcription').length;
    const canConfigureTranscriptionConstraint = action === 'create-transcription' && existingTranscriptionCount > 0;
    const shouldPassConstraint = action === 'create-translation' || canConfigureTranscriptionConstraint;
    const createLayerType = action === 'create-transcription' ? 'transcription' : 'translation';
    const hasSupportedParent = existingTranscriptionCount > 0;
    const immediateGuard = getLayerCreateGuard(deletableLayers, createLayerType, {
      languageId: resolvedLang,
      alias,
      ...(shouldPassConstraint ? { constraint } : {}),
      hasSupportedParent,
    });
    setCreateFailureMessage('');
    setIsLoading(true);
    try {
      const success = await createLayer(createLayerType, {
        languageId: resolvedLang,
        ...(alias.trim() ? { alias: alias.trim() } : {}),
        ...(shouldPassConstraint ? { constraint } : {}),
      }, action === 'create-translation' ? modality : undefined);
      if (success) {
        onClose();
        return;
      }
      setCreateFailureMessage(resolveCreateFailureText(
        immediateGuard.reason ?? layerCreateMessage,
        getCreateFallbackMessage(action),
      ));
    } catch (error) {
      setCreateFailureMessage(resolveCreateFailureText(
        error instanceof Error ? error.message : '',
        getCreateFallbackMessage(action),
      ));
    } finally {
      setIsLoading(false);
    }
  }, [langId, customLang, alias, modality, constraint, action, createLayer, deletableLayers, layerCreateMessage, onClose]);

  const handleDelete = useCallback(async () => {
    if (!deleteLayerId) return;
    const layer = deletableLayers.find((l) => l.id === deleteLayerId);
    const layerName = layer?.name?.zho ?? layer?.name?.zh ?? layer?.name?.eng ?? layer?.name?.en ?? layer?.key ?? deleteLayerId;

    // Check if layer has content
    const textCount = checkLayerHasContent ? await checkLayerHasContent(deleteLayerId) : 0;

    if (textCount === 0) {
      // No content - delete directly
      setIsLoading(true);
      await (deleteLayerWithoutConfirm ?? deleteLayer)(deleteLayerId);
      setIsLoading(false);
      onClose();
    } else {
      // Has content - show confirmation
      setDeleteConfirm({ layerId: deleteLayerId, layerName, textCount });
    }
  }, [deleteLayerId, deletableLayers, checkLayerHasContent, deleteLayerWithoutConfirm, deleteLayer, onClose]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setIsLoading(true);
    await (deleteLayerWithoutConfirm ?? deleteLayer)(deleteConfirm.layerId);
    setIsLoading(false);
    setDeleteConfirm(null);
    onClose();
  }, [deleteConfirm, deleteLayerWithoutConfirm, deleteLayer, onClose]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  const label = action === 'create-transcription'
    ? '新建转写层'
    : action === 'create-translation'
    ? '新建翻译层'
    : '删除层';

  const existingTranscriptionCount = deletableLayers.filter((layer) => layer.layerType === 'transcription').length;
  const resolvedLangForGuard = (langId === '__custom__' ? customLang : langId).trim();
  const hasValidLanguage = resolvedLangForGuard.length > 0;
  const showConstraintSelector = action === 'create-translation'
    || (action === 'create-transcription' && existingTranscriptionCount > 0);
  const translationGuard = action === 'create-translation'
    ? getLayerCreateGuard(deletableLayers, 'translation', {
      languageId: resolvedLangForGuard,
      alias,
      constraint,
      hasSupportedParent: existingTranscriptionCount > 0,
    })
    : { allowed: true };
  const transcriptionGuard = action === 'create-transcription'
    ? getLayerCreateGuard(deletableLayers, 'transcription', {
      languageId: resolvedLangForGuard,
      alias,
      ...(showConstraintSelector ? { constraint } : {}),
      hasSupportedParent: existingTranscriptionCount > 0,
    })
    : { allowed: true };
  const translationCreateDisabledReason = action === 'create-translation'
    ? (translationGuard.allowed ? '' : (translationGuard.reasonShort ?? '当前无法新建翻译'))
    : '';
  const transcriptionCreateDisabledReason = action === 'create-transcription'
    ? (transcriptionGuard.allowed ? '' : (transcriptionGuard.reasonShort ?? '当前无法新建转写'))
    : '';
  const createGuardByConstraint = (candidate: LayerConstraint) => {
    if (action === 'delete') return { allowed: true };
    return getLayerCreateGuard(
      deletableLayers,
      action === 'create-transcription' ? 'transcription' : 'translation',
      {
      languageId: resolvedLangForGuard,
        alias,
        constraint: candidate,
        hasSupportedParent: existingTranscriptionCount > 0,
      },
    );
  };
  const symbolicConstraintGuard = createGuardByConstraint('symbolic_association');
  const subdivisionConstraintGuard = createGuardByConstraint('time_subdivision');
  const independentConstraintGuard = createGuardByConstraint('independent_boundary');
  const showIndependentConstraintOption = true;
  const showCreateFailure = action !== 'delete' && createFailureMessage.trim().length > 0;
  const createLanguageRequiredMessage = action === 'create-translation'
    ? '请先选择翻译层语言（自定义语言需填写代码）。'
    : '请先选择转写层语言（自定义语言需填写代码）。';

  const popover = (
    <div
      className="layer-action-popover-backdrop"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="layer-action-popover-card floating-panel"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          minHeight: `${size.height}px`,
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div
          className="layer-action-popover-title floating-panel-title-row floating-panel-drag-handle"
          onPointerDown={handleDragStart}
          onDoubleClick={handleRecenter}
          title="拖动移动，双击回中"
        >
          <span>{label}</span>
          <button
            type="button"
            className="floating-panel-reset-btn"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleResetPanelLayout}
            aria-label="重置位置与尺寸"
            title="重置位置与尺寸"
          >
            ↺
          </button>
        </div>

        {showCreateFailure && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              margin: '8px 12px 0',
              border: '1px solid #fecaca',
              background: '#fef2f2',
              color: '#991b1b',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.45,
            }}
          >
            创建失败：{createFailureMessage}
          </div>
        )}

        {action === 'delete' ? (
          <>
            {deleteConfirm ? (
              // Delete confirmation view
              <>
                <p style={{ margin: '0 0 12px', color: '#334155', fontSize: 14 }}>
                  层「{deleteConfirm.layerName}」包含 {deleteConfirm.textCount} 条文本记录，删除后将无法恢复。
                </p>
                <div className="transcription-layer-rail-action-row">
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={isLoading}
                    onClick={handleConfirmDelete}
                  >
                    确认删除
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={handleCancelDelete} disabled={isLoading}>
                    取消
                  </button>
                </div>
              </>
            ) : (
              // Delete selection view
              <>
                <select
                  className="input transcription-layer-rail-action-input"
                  value={deleteLayerId}
                  onChange={(e) => setDeleteLayerId(e.target.value)}
                >
                  {deletableLayers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name?.zho ?? l.name?.zh ?? l.name?.eng ?? l.name?.en ?? l.key}
                    </option>
                  ))}
                </select>
                <div className="transcription-layer-rail-action-row">
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={!deleteLayerId || isLoading}
                    onClick={handleDelete}
                  >
                    删除
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={onClose}>
                    取消
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <select
              className="input transcription-layer-rail-action-input"
              value={langId}
              onChange={(e) => setLangId(e.target.value)}
            >
              <option value="">选择语言…</option>
              {COMMON_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}（{lang.code}）
                </option>
              ))}
              <option value="__custom__">其他（手动输入）</option>
            </select>
            {langId === '__custom__' && (
              <input
                className="input transcription-layer-rail-action-input"
                placeholder="ISO 639-3 代码（如 tib）"
                value={customLang}
                onChange={(e) => setCustomLang(e.target.value)}
              />
            )}
            <input
              className="input transcription-layer-rail-action-input"
              placeholder="别名（可选）"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
            {action === 'create-translation' && (
              <>
                <select
                  className="input transcription-layer-rail-action-input"
                  value={modality}
                  onChange={(e) => setModality(e.target.value as 'text' | 'audio' | 'mixed')}
                >
                  <option value="text">文本（纯文字翻译）</option>
                  <option value="audio">语音（口译录音）</option>
                  <option value="mixed">混合（文字 + 录音）</option>
                </select>
                <fieldset style={{ margin: '8px 0', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                  <legend style={{ fontSize: 12, fontWeight: 500, color: '#64748b', paddingBottom: 4 }}>层约束类型 | Layer Constraint Type</legend>
                  <label style={{ display: 'flex', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                    <input
                      type="radio"
                      name="constraint"
                      value="symbolic_association"
                      checked={constraint === 'symbolic_association'}
                      disabled={!symbolicConstraintGuard.allowed}
                      onChange={(e) => setConstraint(e.target.value as LayerConstraint)}
                      style={{ marginRight: 6 }}
                    />
                    依赖边界（跟随转写层）| Dependent
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                    <input
                      type="radio"
                      name="constraint"
                      value="time_subdivision"
                      checked={constraint === 'time_subdivision'}
                      disabled={!subdivisionConstraintGuard.allowed}
                      onChange={(e) => setConstraint(e.target.value as LayerConstraint)}
                      style={{ marginRight: 6 }}
                    />
                    时间细分（父层内自由切分）| Time Subdivision
                  </label>
                  {showIndependentConstraintOption && (
                    <label style={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
                      <input
                        type="radio"
                        name="constraint"
                        value="independent_boundary"
                        checked={constraint === 'independent_boundary'}
                        disabled={!independentConstraintGuard.allowed}
                        onChange={(e) => setConstraint(e.target.value as LayerConstraint)}
                        style={{ marginRight: 6 }}
                      />
                      独立边界（自由定义）| Independent
                    </label>
                  )}
                </fieldset>
              </>
            )}
            {action === 'create-transcription' && showConstraintSelector && (
              <fieldset style={{ margin: '8px 0', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                <legend style={{ fontSize: 12, fontWeight: 500, color: '#64748b', paddingBottom: 4 }}>层约束类型 | Layer Constraint Type</legend>
                <label style={{ display: 'flex', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                  <input
                    type="radio"
                    name="constraint"
                    value="symbolic_association"
                    checked={constraint === 'symbolic_association'}
                    disabled={!symbolicConstraintGuard.allowed}
                    onChange={(e) => setConstraint(e.target.value as LayerConstraint)}
                    style={{ marginRight: 6 }}
                  />
                  依赖边界（跟随主转写层）| Dependent
                </label>
                <label style={{ display: 'flex', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                  <input
                    type="radio"
                    name="constraint"
                    value="time_subdivision"
                    checked={constraint === 'time_subdivision'}
                    disabled={!subdivisionConstraintGuard.allowed}
                    onChange={(e) => setConstraint(e.target.value as LayerConstraint)}
                    style={{ marginRight: 6 }}
                  />
                  时间细分（父层内自由切分）| Time Subdivision
                </label>
                {showIndependentConstraintOption && (
                  <label style={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
                    <input
                      type="radio"
                      name="constraint"
                      value="independent_boundary"
                      checked={constraint === 'independent_boundary'}
                      disabled={!independentConstraintGuard.allowed}
                      onChange={(e) => setConstraint(e.target.value as LayerConstraint)}
                      style={{ marginRight: 6 }}
                    />
                    独立边界（自由定义）| Independent
                  </label>
                )}
              </fieldset>
            )}
            <div className="transcription-layer-rail-action-row">
              <button
                className="btn btn-sm"
                disabled={action === 'create-translation'
                  ? (isLoading || !hasValidLanguage || translationCreateDisabledReason.length > 0)
                  : (isLoading || !hasValidLanguage || transcriptionCreateDisabledReason.length > 0)}
                onClick={handleCreate}
              >
                创建
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>
                取消
              </button>
            </div>
            {translationCreateDisabledReason && (
              <p className="small-text" style={{ marginTop: 6 }}>无法新建翻译：{translationCreateDisabledReason}</p>
            )}
            {transcriptionCreateDisabledReason && (
              <p className="small-text" style={{ marginTop: 6 }}>无法新建转写：{transcriptionCreateDisabledReason}</p>
            )}
            {!hasValidLanguage && (
              <p className="small-text" style={{ marginTop: 6 }}>{createLanguageRequiredMessage}</p>
            )}
          </>
        )}
        <div className="floating-panel-resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
      </div>
    </div>
  );

  return ReactDOM.createPortal(popover, document.body);
}
