import { useEffect, useRef, useState } from 'react';
import { AudioLines, Languages, Trash2 } from 'lucide-react';
import type { LayerConstraint, LayerDocType } from '../db';
import type { LayerCreateInput } from '../hooks/useTranscriptionData';
import { COMMON_LANGUAGES } from '../utils/transcriptionFormatters';
import { fireAndForget } from '../utils/fireAndForget';
import { getLayerCreateGuard } from '../services/LayerConstraintService';

const BUBBLE_ANIMATION_MS = 180;

function resolveCreateFailureText(message: string, fallback: string): string {
  const text = message.trim().replace(/^创建失败[:：]\s*/u, '');
  if (!text) return fallback;
  if (text.startsWith('已创建')) return fallback;
  return text;
}

function getCreateFallbackMessage(layerType: 'transcription' | 'translation'): string {
  if (layerType === 'translation') {
    return '无法创建翻译层：请先确保存在转写层；同语言翻译层需填写别名，且翻译层不能与转写层同语言。';
  }
  return '无法创建转写层：同语言转写层需填写别名，且转写层不能与翻译层同语言。';
}

function getLayerDisplayName(layer: LayerDocType): string {
  return layer.name.zho
    ?? layer.name.zh
    ?? layer.name.cmn
    ?? layer.name.eng
    ?? layer.name.en
    ?? Object.values(layer.name).find((value) => Boolean(value?.trim()))
    ?? layer.key;
}

function formatLayerLanguage(layer: LayerDocType): string {
  const code = (layer.languageId ?? '').trim().toLowerCase();
  if (!code) {
    return '未设置语言';
  }
  const matched = COMMON_LANGUAGES.find((item) => item.code === code);
  return matched ? `${matched.label} ${code}` : code;
}

type LayerManagerPopoverProps = {
  allLayers: LayerDocType[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onCreateTranscriptionLayer: (input: LayerCreateInput) => Promise<boolean>;
  onCreateTranslationLayer: (
    input: LayerCreateInput & { modality: 'text' | 'audio' | 'mixed' },
  ) => Promise<boolean>;
  deletableLayers: LayerDocType[];
  layerToDeleteId: string;
  onLayerToDeleteIdChange: (value: string) => void;
  layerPendingDelete: LayerDocType | undefined;
  onDeleteLayer: () => void | Promise<void>;
  message: string;
};

export function LayerManagerPopover({
  allLayers,
  isOpen,
  onToggle,
  onClose,
  onCreateTranscriptionLayer,
  onCreateTranslationLayer,
  deletableLayers,
  layerToDeleteId,
  onLayerToDeleteIdChange,
  layerPendingDelete,
  onDeleteLayer,
  message,
}: LayerManagerPopoverProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [shouldRenderBubble, setShouldRenderBubble] = useState(() => isOpen);
  const [transcriptionForm, setTranscriptionForm] = useState<LayerCreateInput>({
    languageId: '',
  });
  const [translationForm, setTranslationForm] = useState<LayerCreateInput>({
    languageId: '',
  });
  const [transcriptionCustomLang, setTranscriptionCustomLang] = useState('');
  const [translationCustomLang, setTranslationCustomLang] = useState('');
  const [translationModality, setTranslationModality] = useState<'text' | 'audio' | 'mixed'>('text');
  const [transcriptionConstraint, setTranscriptionConstraint] = useState<LayerConstraint>('symbolic_association');
  const [translationConstraint, setTranslationConstraint] = useState<LayerConstraint>('symbolic_association');
  const [transcriptionCreateError, setTranscriptionCreateError] = useState('');
  const [translationCreateError, setTranslationCreateError] = useState('');

  const translationModalityOptions = [
    { value: 'text', label: '文本（纯文字翻译）' },
    { value: 'audio', label: '语音（口译录音）' },
    { value: 'mixed', label: '混合（文字 + 录音）' },
  ] as const;

  const transcriptionLayerCount = allLayers.filter((layer) => layer.layerType === 'transcription').length;
  const translationLayerCount = allLayers.filter((layer) => layer.layerType === 'translation').length;
  const canConfigureTranscriptionConstraint = transcriptionLayerCount > 0;
  const showIndependentConstraintOption = true;
  const resolvedTranslationLang = (translationForm.languageId === '__custom__' ? translationCustomLang : translationForm.languageId).trim();
  const hasValidTranslationLanguage = resolvedTranslationLang.length > 0;
  const translationAliasTrimmed = (translationForm.alias ?? '').trim();
  const resolvedTranscriptionLang = (transcriptionForm.languageId === '__custom__' ? transcriptionCustomLang : transcriptionForm.languageId).trim();
  const hasValidTranscriptionLanguage = resolvedTranscriptionLang.length > 0;
  const transcriptionAliasTrimmed = (transcriptionForm.alias ?? '').trim();
  const translationGuard = getLayerCreateGuard(allLayers, 'translation', {
    languageId: resolvedTranslationLang,
    ...(translationAliasTrimmed !== '' ? { alias: translationAliasTrimmed } : {}),
    constraint: translationConstraint,
    hasSupportedParent: transcriptionLayerCount > 0,
  });
  const translationCreateDisabledReason = translationGuard.allowed
    ? ''
    : (translationGuard.reasonShort ?? '当前无法新建翻译');
  const transcriptionGuard = getLayerCreateGuard(allLayers, 'transcription', {
    languageId: resolvedTranscriptionLang,
    ...(transcriptionAliasTrimmed !== '' ? { alias: transcriptionAliasTrimmed } : {}),
    ...(canConfigureTranscriptionConstraint ? { constraint: transcriptionConstraint } : {}),
    hasSupportedParent: transcriptionLayerCount > 0,
  });
  const transcriptionCreateDisabledReason = transcriptionGuard.allowed
    ? ''
    : (transcriptionGuard.reasonShort ?? '当前无法新建转写');
  const transcriptionSymbolicGuard = getLayerCreateGuard(allLayers, 'transcription', {
    languageId: resolvedTranscriptionLang,
    ...(transcriptionAliasTrimmed !== '' ? { alias: transcriptionAliasTrimmed } : {}),
    constraint: 'symbolic_association',
    hasSupportedParent: transcriptionLayerCount > 0,
  });
  const transcriptionSubdivisionGuard = getLayerCreateGuard(allLayers, 'transcription', {
    languageId: resolvedTranscriptionLang,
    ...(transcriptionAliasTrimmed !== '' ? { alias: transcriptionAliasTrimmed } : {}),
    constraint: 'time_subdivision',
    hasSupportedParent: transcriptionLayerCount > 0,
  });
  const transcriptionIndependentGuard = getLayerCreateGuard(allLayers, 'transcription', {
    languageId: resolvedTranscriptionLang,
    ...(transcriptionAliasTrimmed !== '' ? { alias: transcriptionAliasTrimmed } : {}),
    constraint: 'independent_boundary',
    hasSupportedParent: transcriptionLayerCount > 0,
  });
  const translationSymbolicGuard = getLayerCreateGuard(allLayers, 'translation', {
    languageId: resolvedTranslationLang,
    ...(translationAliasTrimmed !== '' ? { alias: translationAliasTrimmed } : {}),
    constraint: 'symbolic_association',
    hasSupportedParent: transcriptionLayerCount > 0,
  });
  const translationSubdivisionGuard = getLayerCreateGuard(allLayers, 'translation', {
    languageId: resolvedTranslationLang,
    ...(translationAliasTrimmed !== '' ? { alias: translationAliasTrimmed } : {}),
    constraint: 'time_subdivision',
    hasSupportedParent: transcriptionLayerCount > 0,
  });
  const translationIndependentGuard = getLayerCreateGuard(allLayers, 'translation', {
    languageId: resolvedTranslationLang,
    ...(translationAliasTrimmed !== '' ? { alias: translationAliasTrimmed } : {}),
    constraint: 'independent_boundary',
    hasSupportedParent: transcriptionLayerCount > 0,
  });

  const handleCreateTranscription = async () => {
    const langId = transcriptionForm.languageId === '__custom__' ? transcriptionCustomLang.trim() : transcriptionForm.languageId;
    const alias = (transcriptionForm.alias ?? '').trim();
    const immediateGuard = getLayerCreateGuard(allLayers, 'transcription', {
      languageId: langId,
      ...(alias !== '' ? { alias } : {}),
      ...(canConfigureTranscriptionConstraint ? { constraint: transcriptionConstraint } : {}),
      hasSupportedParent: transcriptionLayerCount > 0,
    });
    setTranscriptionCreateError('');
    const success = await onCreateTranscriptionLayer({
      languageId: langId,
      alias: transcriptionForm.alias,
      ...(canConfigureTranscriptionConstraint ? { constraint: transcriptionConstraint } : {}),
    });
    if (success) {
      setTranscriptionForm({ languageId: '' });
      setTranscriptionCustomLang('');
      setTranscriptionConstraint('symbolic_association');
      return;
    }
    setTranscriptionCreateError(resolveCreateFailureText(
      immediateGuard.reason ?? message,
      getCreateFallbackMessage('transcription'),
    ));
  };

  const handleCreateTranslation = async () => {
    const langId = translationForm.languageId === '__custom__' ? translationCustomLang.trim() : translationForm.languageId;
    const alias = (translationForm.alias ?? '').trim();
    const immediateGuard = getLayerCreateGuard(allLayers, 'translation', {
      languageId: langId,
      ...(alias !== '' ? { alias } : {}),
      constraint: translationConstraint,
      hasSupportedParent: transcriptionLayerCount > 0,
    });
    setTranslationCreateError('');
    const success = await onCreateTranslationLayer({
      languageId: langId,
      alias: translationForm.alias,
      constraint: translationConstraint,
      modality: translationModality,
    });
    if (success) {
      setTranslationForm({ languageId: '' });
      setTranslationCustomLang('');
      setTranslationModality('text');
      setTranslationConstraint('symbolic_association');
      return;
    }
    setTranslationCreateError(resolveCreateFailureText(
      immediateGuard.reason ?? message,
      getCreateFallbackMessage('translation'),
    ));
  };

  useEffect(() => {
    if (isOpen) {
      setShouldRenderBubble(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setShouldRenderBubble(false);
    }, BUBBLE_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div className="transcription-layer-popover" ref={rootRef}>
      <div className="transcription-list-toolbar transcription-list-toolbar-layer-only">
        <button className="btn btn-sm" onClick={onToggle}>
          层管理
        </button>
      </div>

      {shouldRenderBubble && (
        <div className={`transcription-layer-bubble ${isOpen ? 'transcription-layer-bubble-open' : 'transcription-layer-bubble-closing'}`}>
          <div className="transcription-layer-bubble-arrow" />
          <div className="transcription-layer-form transcription-layer-manager">
            <div className="transcription-layer-manager-head">
              <div className="transcription-layer-form-title">层管理</div>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>关闭</button>
            </div>

            <div className="transcription-layer-columns">
              <div className="transcription-layer-section transcription-layer-section-transcription">
                <div className="transcription-layer-section-head-row">
                  <div className="transcription-layer-section-head">
                    <AudioLines size={14} />
                    <span>新建转写层</span>
                  </div>
                  <span className="toolbar-chip small-chip transcription-layer-count-chip">现有 {transcriptionLayerCount}</span>
                </div>
                {transcriptionCreateError && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    style={{
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
                    创建失败：{transcriptionCreateError}
                  </div>
                )}
                <div className="transcription-layer-column-fields">
                  <select
                    className="input"
                    value={transcriptionForm.languageId}
                    onChange={(event) => setTranscriptionForm((prev) => ({ ...prev, languageId: event.target.value }))}
                  >
                    <option value="">选择语言…</option>
                    {COMMON_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.label}（{lang.code}）</option>
                    ))}
                    <option value="__custom__">其他（手动输入）</option>
                  </select>
                  {transcriptionForm.languageId === '__custom__' && (
                    <input
                      className="input"
                      placeholder="ISO 639-3 代码（如 tib）"
                      value={transcriptionCustomLang}
                      onChange={(event) => setTranscriptionCustomLang(event.target.value)}
                    />
                  )}
                  <input
                    className="input"
                    placeholder="别名（可选，同语言多层时用于区分）"
                    value={transcriptionForm.alias ?? ''}
                    onChange={(event) => setTranscriptionForm((prev) => ({ ...prev, alias: event.target.value }))}
                  />
                  {canConfigureTranscriptionConstraint && (
                    <fieldset style={{ margin: '8px 0', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                      <legend style={{ fontSize: 12, fontWeight: 500, color: '#64748b', paddingBottom: 4 }}>层约束类型 | Layer Constraint Type</legend>
                      <label style={{ display: 'flex', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                        <input
                          type="radio"
                          name="manager-transcription-constraint"
                          value="symbolic_association"
                          checked={transcriptionConstraint === 'symbolic_association'}
                          disabled={!transcriptionSymbolicGuard.allowed}
                          onChange={(event) => setTranscriptionConstraint(event.target.value as LayerConstraint)}
                          style={{ marginRight: 6 }}
                        />
                        依赖边界（跟随主转写层）| Dependent
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                        <input
                          type="radio"
                          name="manager-transcription-constraint"
                          value="time_subdivision"
                          checked={transcriptionConstraint === 'time_subdivision'}
                          disabled={!transcriptionSubdivisionGuard.allowed}
                          onChange={(event) => setTranscriptionConstraint(event.target.value as LayerConstraint)}
                          style={{ marginRight: 6 }}
                        />
                        时间细分（父层内自由切分）| Time Subdivision
                      </label>
                      {showIndependentConstraintOption && (
                        <label style={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
                          <input
                            type="radio"
                            name="manager-transcription-constraint"
                            value="independent_boundary"
                            checked={transcriptionConstraint === 'independent_boundary'}
                            disabled={!transcriptionIndependentGuard.allowed}
                            onChange={(event) => setTranscriptionConstraint(event.target.value as LayerConstraint)}
                            style={{ marginRight: 6 }}
                          />
                          独立边界（自由定义）| Independent
                        </label>
                      )}
                    </fieldset>
                  )}
                </div>
                <div className="action-row">
                  <button
                    className="btn"
                    disabled={!hasValidTranscriptionLanguage || transcriptionCreateDisabledReason.length > 0}
                    onClick={() => fireAndForget(handleCreateTranscription())}
                  >
                    创建转写层
                  </button>
                </div>
                {transcriptionCreateDisabledReason && (
                  <p className="small-text">无法新建转写：{transcriptionCreateDisabledReason}</p>
                )}
                {!hasValidTranscriptionLanguage && (
                  <p className="small-text">请先选择转写层语言（自定义语言需填写代码）。</p>
                )}
              </div>

              <div className="transcription-layer-section transcription-layer-section-translation">
                <div className="transcription-layer-section-head-row">
                  <div className="transcription-layer-section-head">
                    <Languages size={14} />
                    <span>新建翻译层</span>
                  </div>
                  <span className="toolbar-chip small-chip transcription-layer-count-chip">现有 {translationLayerCount}</span>
                </div>
                {translationCreateError && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    style={{
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
                    创建失败：{translationCreateError}
                  </div>
                )}
                <div className="transcription-layer-column-fields">
                  <select
                    className="input"
                    value={translationForm.languageId}
                    onChange={(event) => setTranslationForm((prev) => ({ ...prev, languageId: event.target.value }))}
                  >
                    <option value="">选择语言…</option>
                    {COMMON_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.label}（{lang.code}）</option>
                    ))}
                    <option value="__custom__">其他（手动输入）</option>
                  </select>
                  {translationForm.languageId === '__custom__' && (
                    <input
                      className="input"
                      placeholder="ISO 639-3 代码（如 tib）"
                      value={translationCustomLang}
                      onChange={(event) => setTranslationCustomLang(event.target.value)}
                    />
                  )}
                  <input
                    className="input"
                    placeholder="别名（可选，同语言多层时用于区分）"
                    value={translationForm.alias ?? ''}
                    onChange={(event) => setTranslationForm((prev) => ({ ...prev, alias: event.target.value }))}
                  />
                  <select
                    className="input"
                    value={translationModality}
                    onChange={(event) => setTranslationModality(event.target.value as 'text' | 'audio' | 'mixed')}
                  >
                    {translationModalityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <fieldset style={{ margin: '8px 0', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                    <legend style={{ fontSize: 12, fontWeight: 500, color: '#64748b', paddingBottom: 4 }}>层约束类型 | Layer Constraint Type</legend>
                    <label style={{ display: 'flex', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                      <input
                        type="radio"
                        name="manager-translation-constraint"
                        value="symbolic_association"
                        checked={translationConstraint === 'symbolic_association'}
                        disabled={!translationSymbolicGuard.allowed}
                        onChange={(event) => setTranslationConstraint(event.target.value as LayerConstraint)}
                        style={{ marginRight: 6 }}
                      />
                      依赖边界（跟随转写层）| Dependent
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                      <input
                        type="radio"
                        name="manager-translation-constraint"
                        value="time_subdivision"
                        checked={translationConstraint === 'time_subdivision'}
                        disabled={!translationSubdivisionGuard.allowed}
                        onChange={(event) => setTranslationConstraint(event.target.value as LayerConstraint)}
                        style={{ marginRight: 6 }}
                      />
                      时间细分（父层内自由切分）| Time Subdivision
                    </label>
                    {showIndependentConstraintOption && (
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
                        <input
                          type="radio"
                          name="manager-translation-constraint"
                          value="independent_boundary"
                          checked={translationConstraint === 'independent_boundary'}
                          disabled={!translationIndependentGuard.allowed}
                          onChange={(event) => setTranslationConstraint(event.target.value as LayerConstraint)}
                          style={{ marginRight: 6 }}
                        />
                        独立边界（自由定义）| Independent
                      </label>
                    )}
                  </fieldset>
                </div>
                <div className="action-row">
                  <button
                    className="btn"
                    disabled={!hasValidTranslationLanguage || translationCreateDisabledReason.length > 0}
                    onClick={() => fireAndForget(handleCreateTranslation())}
                  >
                    创建翻译层
                  </button>
                </div>
                {translationCreateDisabledReason && (
                  <p className="small-text">无法新建翻译：{translationCreateDisabledReason}</p>
                )}
                {!hasValidTranslationLanguage && (
                  <p className="small-text">请先选择翻译层语言（自定义语言需填写代码）。</p>
                )}
              </div>

              <div className="transcription-layer-section transcription-layer-section-delete">
                <div className="transcription-layer-section-head-row">
                  <div className="transcription-layer-section-head">
                    <Trash2 size={14} />
                    <span>删除层</span>
                  </div>
                  <span className="toolbar-chip small-chip transcription-layer-count-chip">可删 {deletableLayers.length}</span>
                </div>
                <div className="transcription-layer-column-fields">
                  <select
                    className="input"
                    value={layerToDeleteId}
                    onChange={(event) => onLayerToDeleteIdChange(event.target.value)}
                    disabled={deletableLayers.length === 0}
                  >
                    {deletableLayers.length > 0 ? (
                      deletableLayers.map((layer) => (
                        <option key={layer.id} value={layer.id}>
                          {layer.layerType === 'translation' ? '翻译层' : '转写层'}
                          {' · '}
                          {getLayerDisplayName(layer)}
                          {' · '}
                          {formatLayerLanguage(layer)}
                        </option>
                      ))
                    ) : (
                      <option value="">无可删除层</option>
                    )}
                  </select>

                  <p className="small-text">
                    {deletableLayers.length === 0
                      ? '当前没有可删除层。默认层会被保护，不能删除。'
                      : '删除时会同时清理该层下的文本/录音记录与关联链接。'}
                  </p>
                </div>

                <div className="action-row">
                  <button
                    className="btn btn-danger"
                    onClick={() => fireAndForget(Promise.resolve(onDeleteLayer()))}
                    disabled={deletableLayers.length === 0 || !layerPendingDelete}
                  >
                    确认删除
                  </button>
                </div>
              </div>
            </div>

            {message && <p className="small-text">{message}</p>}
          </div>
        </div>
      )}
    </div>
  );
}