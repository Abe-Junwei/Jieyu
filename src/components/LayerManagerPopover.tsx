import { useEffect, useRef, useState } from 'react';
import { AudioLines, Languages, Trash2 } from 'lucide-react';
import type { LayerConstraint, LayerDocType } from '../db';
import type { LayerCreateInput } from '../hooks/useTranscriptionData';
import { useLocale } from '../i18n';
import { getLayerManagerPopoverMessages } from '../i18n/layerManagerPopoverMessages';
import { COMMON_LANGUAGES, getLayerLabelParts } from '../utils/transcriptionFormatters';
import { fireAndForget } from '../utils/fireAndForget';
import {
  getLayerCreateGuard,
  listIndependentBoundaryTranscriptionLayers,
} from '../services/LayerConstraintService';

const BUBBLE_ANIMATION_MS = 180;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveCreateFailureText(message: string, fallback: string, prefix: string): string {
  const text = message.trim().replace(new RegExp(`^${escapeRegExp(prefix)}[:\uff1a]\\s*`, 'u'), '');
  if (!text) return fallback;
  if (text.startsWith('\u5df2\u521b\u5efa') || text.startsWith('Created ')) return fallback;
  return text;
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

function formatLayerLanguage(layer: LayerDocType, missingLanguage: string): string {
  const code = (layer.languageId ?? '').trim().toLowerCase();
  if (!code) {
    return missingLanguage;
  }
  const matched = COMMON_LANGUAGES.find((item) => item.code === code);
  return matched ? `${matched.label} ${code}` : code;
}

function formatParentLayerOptionLabel(layer: LayerDocType): string {
  const { type, lang, alias } = getLayerLabelParts(layer);
  return alias ? `${type} · ${lang} · ${alias}` : `${type} · ${lang}`;
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
  const locale = useLocale();
  const messages = getLayerManagerPopoverMessages(locale);
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
  const [transcriptionParentLayerId, setTranscriptionParentLayerId] = useState('');
  const [translationParentLayerId, setTranslationParentLayerId] = useState('');
  const [transcriptionCreateError, setTranscriptionCreateError] = useState('');
  const [translationCreateError, setTranslationCreateError] = useState('');

  const translationModalityOptions = [
    { value: 'text', label: messages.modalityText },
    { value: 'audio', label: messages.modalityAudio },
    { value: 'mixed', label: messages.modalityMixed },
  ] as const;

  const transcriptionLayerCount = allLayers.filter((layer) => layer.layerType === 'transcription').length;
  const translationLayerCount = allLayers.filter((layer) => layer.layerType === 'translation').length;
  const canConfigureTranscriptionConstraint = transcriptionLayerCount > 0;
  const independentParentLayers = listIndependentBoundaryTranscriptionLayers(allLayers);
  const autoTranslationParentLayer = independentParentLayers.length === 1 ? independentParentLayers[0] : undefined;
  const needsTranscriptionParent = canConfigureTranscriptionConstraint && transcriptionConstraint === 'symbolic_association';
  const autoTranscriptionParentLayer = needsTranscriptionParent && independentParentLayers.length === 1 ? independentParentLayers[0] : undefined;
  const resolvedTranslationParentLayerId = autoTranslationParentLayer?.id ?? translationParentLayerId;
  const resolvedTranscriptionParentLayerId = needsTranscriptionParent
    ? (autoTranscriptionParentLayer?.id ?? transcriptionParentLayerId)
    : '';
  const resolvedTranslationLang = (translationForm.languageId === '__custom__' ? translationCustomLang : translationForm.languageId).trim();
  const hasValidTranslationLanguage = resolvedTranslationLang.length > 0;
  const translationAliasTrimmed = (translationForm.alias ?? '').trim();
  const resolvedTranscriptionLang = (transcriptionForm.languageId === '__custom__' ? transcriptionCustomLang : transcriptionForm.languageId).trim();
  const hasValidTranscriptionLanguage = resolvedTranscriptionLang.length > 0;
  const transcriptionAliasTrimmed = (transcriptionForm.alias ?? '').trim();
  const translationGuard = getLayerCreateGuard(allLayers, 'translation', {
    languageId: resolvedTranslationLang,
    ...(translationAliasTrimmed !== '' ? { alias: translationAliasTrimmed } : {}),
    constraint: 'symbolic_association',
    ...(resolvedTranslationParentLayerId ? { parentLayerId: resolvedTranslationParentLayerId } : {}),
    hasSupportedParent: independentParentLayers.length > 0,
  });
  const translationCreateDisabledReason = translationGuard.allowed
    ? ''
    : (translationGuard.reasonShort ?? messages.translationCreateUnavailable);
  const transcriptionGuard = getLayerCreateGuard(allLayers, 'transcription', {
    languageId: resolvedTranscriptionLang,
    ...(transcriptionAliasTrimmed !== '' ? { alias: transcriptionAliasTrimmed } : {}),
    ...(canConfigureTranscriptionConstraint ? { constraint: transcriptionConstraint } : {}),
    ...(resolvedTranscriptionParentLayerId ? { parentLayerId: resolvedTranscriptionParentLayerId } : {}),
    hasSupportedParent: independentParentLayers.length > 0,
  });
  const transcriptionCreateDisabledReason = transcriptionGuard.allowed
    ? ''
    : (transcriptionGuard.reasonShort ?? messages.transcriptionCreateUnavailable);
  const transcriptionSymbolicGuard = getLayerCreateGuard(allLayers, 'transcription', {
    languageId: resolvedTranscriptionLang,
    ...(transcriptionAliasTrimmed !== '' ? { alias: transcriptionAliasTrimmed } : {}),
    constraint: 'symbolic_association',
    ...(resolvedTranscriptionParentLayerId
      ? { parentLayerId: resolvedTranscriptionParentLayerId }
      : independentParentLayers[0]?.id
        ? { parentLayerId: independentParentLayers[0].id }
        : {}),
    hasSupportedParent: independentParentLayers.length > 0,
  });
  const transcriptionIndependentGuard = getLayerCreateGuard(allLayers, 'transcription', {
    languageId: resolvedTranscriptionLang,
    ...(transcriptionAliasTrimmed !== '' ? { alias: transcriptionAliasTrimmed } : {}),
    constraint: 'independent_boundary',
    hasSupportedParent: independentParentLayers.length > 0,
  });

  useEffect(() => {
    if (autoTranslationParentLayer) {
      if (translationParentLayerId !== autoTranslationParentLayer.id) {
        setTranslationParentLayerId(autoTranslationParentLayer.id);
      }
      return;
    }
    if (translationParentLayerId && independentParentLayers.some((layer) => layer.id === translationParentLayerId)) {
      return;
    }
    if (translationParentLayerId) setTranslationParentLayerId('');
  }, [autoTranslationParentLayer, independentParentLayers, translationParentLayerId]);

  useEffect(() => {
    if (!needsTranscriptionParent) {
      if (transcriptionParentLayerId) setTranscriptionParentLayerId('');
      return;
    }
    if (autoTranscriptionParentLayer) {
      if (transcriptionParentLayerId !== autoTranscriptionParentLayer.id) {
        setTranscriptionParentLayerId(autoTranscriptionParentLayer.id);
      }
      return;
    }
    if (transcriptionParentLayerId && independentParentLayers.some((layer) => layer.id === transcriptionParentLayerId)) {
      return;
    }
    if (transcriptionParentLayerId) setTranscriptionParentLayerId('');
  }, [autoTranscriptionParentLayer, independentParentLayers, needsTranscriptionParent, transcriptionParentLayerId]);

  const handleCreateTranscription = async () => {
    const langId = transcriptionForm.languageId === '__custom__' ? transcriptionCustomLang.trim() : transcriptionForm.languageId;
    const alias = (transcriptionForm.alias ?? '').trim();
    const immediateGuard = getLayerCreateGuard(allLayers, 'transcription', {
      languageId: langId,
      ...(alias !== '' ? { alias } : {}),
      ...(canConfigureTranscriptionConstraint ? { constraint: transcriptionConstraint } : {}),
      ...(resolvedTranscriptionParentLayerId ? { parentLayerId: resolvedTranscriptionParentLayerId } : {}),
      hasSupportedParent: independentParentLayers.length > 0,
    });
    setTranscriptionCreateError('');
    const success = await onCreateTranscriptionLayer({
      languageId: langId,
      alias: transcriptionForm.alias,
      ...(canConfigureTranscriptionConstraint ? { constraint: transcriptionConstraint } : {}),
      ...(resolvedTranscriptionParentLayerId ? { parentLayerId: resolvedTranscriptionParentLayerId } : {}),
    });
    if (success) {
      setTranscriptionForm({ languageId: '' });
      setTranscriptionCustomLang('');
      setTranscriptionConstraint('symbolic_association');
      setTranscriptionParentLayerId('');
      return;
    }
    setTranscriptionCreateError(resolveCreateFailureText(
      immediateGuard.reason ?? message,
      messages.transcriptionCreateFallback,
      messages.createFailedPrefix,
    ));
  };

  const handleCreateTranslation = async () => {
    const langId = translationForm.languageId === '__custom__' ? translationCustomLang.trim() : translationForm.languageId;
    const alias = (translationForm.alias ?? '').trim();
    const immediateGuard = getLayerCreateGuard(allLayers, 'translation', {
      languageId: langId,
      ...(alias !== '' ? { alias } : {}),
      constraint: 'symbolic_association',
      ...(resolvedTranslationParentLayerId ? { parentLayerId: resolvedTranslationParentLayerId } : {}),
      hasSupportedParent: independentParentLayers.length > 0,
    });
    setTranslationCreateError('');
    const success = await onCreateTranslationLayer({
      languageId: langId,
      alias: translationForm.alias,
      constraint: 'symbolic_association',
      ...(resolvedTranslationParentLayerId ? { parentLayerId: resolvedTranslationParentLayerId } : {}),
      modality: translationModality,
    });
    if (success) {
      setTranslationForm({ languageId: '' });
      setTranslationCustomLang('');
      setTranslationModality('text');
      setTranslationParentLayerId('');
      return;
    }
    setTranslationCreateError(resolveCreateFailureText(
      immediateGuard.reason ?? message,
      messages.translationCreateFallback,
      messages.createFailedPrefix,
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
          {messages.layerManagement}
        </button>
      </div>

      {shouldRenderBubble && (
        <div className={`transcription-layer-bubble ${isOpen ? 'transcription-layer-bubble-open' : 'transcription-layer-bubble-closing'}`}>
          <div className="transcription-layer-bubble-arrow" />
          <div className="transcription-layer-form transcription-layer-manager">
            <div className="transcription-layer-manager-head">
              <div className="transcription-layer-form-title">{messages.layerManagement}</div>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>{messages.close}</button>
            </div>

            <div className="transcription-layer-columns">
              <div className="transcription-layer-section transcription-layer-section-transcription">
                <div className="transcription-layer-section-head-row">
                  <div className="transcription-layer-section-head">
                    <AudioLines size={14} />
                    <span>{messages.createTranscriptionLayer}</span>
                  </div>
                  <span className="toolbar-chip small-chip transcription-layer-count-chip">{messages.existingCount(transcriptionLayerCount)}</span>
                </div>
                {transcriptionCreateError && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    style={{
                      border: '1px solid var(--state-danger-border)',
                      background: 'var(--state-danger-bg)',
                      color: 'var(--state-danger-text)',
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontSize: 13,
                      fontWeight: 600,
                      lineHeight: 1.45,
                    }}
                  >
                    {messages.createFailedPrefix}\uff1a{transcriptionCreateError}
                  </div>
                )}
                <div className="transcription-layer-column-fields">
                  <select
                    className="input"
                    value={transcriptionForm.languageId}
                    onChange={(event) => setTranscriptionForm((prev) => ({ ...prev, languageId: event.target.value }))}
                  >
                    <option value="">{messages.selectLanguage}</option>
                    {COMMON_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.label}（{lang.code}）</option>
                    ))}
                    <option value="__custom__">{messages.customLanguageOption}</option>
                  </select>
                  {transcriptionForm.languageId === '__custom__' && (
                    <input
                      className="input"
                      placeholder={messages.customLanguageCodePlaceholder}
                      value={transcriptionCustomLang}
                      onChange={(event) => setTranscriptionCustomLang(event.target.value)}
                    />
                  )}
                  <input
                    className="input"
                    placeholder={messages.aliasPlaceholder}
                    value={transcriptionForm.alias ?? ''}
                    onChange={(event) => setTranscriptionForm((prev) => ({ ...prev, alias: event.target.value }))}
                  />
                  {canConfigureTranscriptionConstraint && (
                    <fieldset style={{ margin: '8px 0', padding: '8px', border: '1px solid var(--border-soft)', borderRadius: '4px' }}>
                      <legend style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', paddingBottom: 4 }}>{messages.constraintLegend}</legend>
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
                        {messages.dependentConstraint}
                      </label>
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
                          {messages.independentConstraint}
                        </label>
                    </fieldset>
                  )}
                    {needsTranscriptionParent && independentParentLayers.length > 1 && (
                      <select
                        className="input layer-parent-select"
                        value={transcriptionParentLayerId}
                        onChange={(event) => setTranscriptionParentLayerId(event.target.value)}
                      >
                        <option value="">{messages.selectParentLayer}</option>
                        {independentParentLayers.map((layer) => (
                          <option key={layer.id} value={layer.id}>{formatParentLayerOptionLabel(layer)}</option>
                        ))}
                      </select>
                    )}
                    {needsTranscriptionParent && autoTranscriptionParentLayer && (
                      <p className="layer-parent-auto-note">{messages.autoLinkedParent(formatParentLayerOptionLabel(autoTranscriptionParentLayer))}</p>
                    )}
                </div>
                <div className="action-row">
                  <button
                    className="btn"
                    disabled={!hasValidTranscriptionLanguage || transcriptionCreateDisabledReason.length > 0}
                    onClick={() => fireAndForget(handleCreateTranscription())}
                  >
                    {messages.createTranscriptionLayer}
                  </button>
                </div>
                {(transcriptionCreateDisabledReason || !hasValidTranscriptionLanguage) && (
                  <div className="layer-create-feedback-stack">
                    {transcriptionCreateDisabledReason && (
                      <p className="layer-create-feedback layer-create-feedback-error">
                        {messages.transcriptionDisabledReason(transcriptionCreateDisabledReason)}
                      </p>
                    )}
                    {!hasValidTranscriptionLanguage && (
                      <p className="layer-create-feedback layer-create-feedback-info">
                        {messages.transcriptionLanguageRequired}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="transcription-layer-section transcription-layer-section-translation">
                <div className="transcription-layer-section-head-row">
                  <div className="transcription-layer-section-head">
                    <Languages size={14} />
                    <span>{messages.createTranslationLayer}</span>
                  </div>
                  <span className="toolbar-chip small-chip transcription-layer-count-chip">{messages.existingCount(translationLayerCount)}</span>
                </div>
                {translationCreateError && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    style={{
                      border: '1px solid var(--state-danger-border)',
                      background: 'var(--state-danger-bg)',
                      color: 'var(--state-danger-text)',
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontSize: 13,
                      fontWeight: 600,
                      lineHeight: 1.45,
                    }}
                  >
                    {messages.createFailedPrefix}\uff1a{translationCreateError}
                  </div>
                )}
                <div className="transcription-layer-column-fields">
                  <select
                    className="input"
                    value={translationForm.languageId}
                    onChange={(event) => setTranslationForm((prev) => ({ ...prev, languageId: event.target.value }))}
                  >
                    <option value="">{messages.selectLanguage}</option>
                    {COMMON_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.label}（{lang.code}）</option>
                    ))}
                    <option value="__custom__">{messages.customLanguageOption}</option>
                  </select>
                  {translationForm.languageId === '__custom__' && (
                    <input
                      className="input"
                      placeholder={messages.customLanguageCodePlaceholder}
                      value={translationCustomLang}
                      onChange={(event) => setTranslationCustomLang(event.target.value)}
                    />
                  )}
                  <input
                    className="input"
                    placeholder={messages.aliasPlaceholder}
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
                  <div className="layer-parent-guidance-note">
                    {messages.translationBoundarySource}
                  </div>
                  {independentParentLayers.length > 1 && (
                    <select
                      className="input layer-parent-select"
                      value={translationParentLayerId}
                      onChange={(event) => setTranslationParentLayerId(event.target.value)}
                    >
                      <option value="">{messages.selectParentLayer}</option>
                      {independentParentLayers.map((layer) => (
                        <option key={layer.id} value={layer.id}>{formatParentLayerOptionLabel(layer)}</option>
                      ))}
                    </select>
                  )}
                  {autoTranslationParentLayer && (
                    <p className="layer-parent-auto-note">{messages.autoLinkedParent(formatParentLayerOptionLabel(autoTranslationParentLayer))}</p>
                  )}
                </div>
                <div className="action-row">
                  <button
                    className="btn"
                    disabled={!hasValidTranslationLanguage || translationCreateDisabledReason.length > 0}
                    onClick={() => fireAndForget(handleCreateTranslation())}
                  >
                    {messages.createTranslationLayer}
                  </button>
                </div>
                {(translationCreateDisabledReason || !hasValidTranslationLanguage) && (
                  <div className="layer-create-feedback-stack">
                    {translationCreateDisabledReason && (
                      <p className="layer-create-feedback layer-create-feedback-error">
                        {messages.translationDisabledReason(translationCreateDisabledReason)}
                      </p>
                    )}
                    {!hasValidTranslationLanguage && (
                      <p className="layer-create-feedback layer-create-feedback-info">
                        {messages.translationLanguageRequired}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="transcription-layer-section transcription-layer-section-delete">
                <div className="transcription-layer-section-head-row">
                  <div className="transcription-layer-section-head">
                    <Trash2 size={14} />
                    <span>{messages.deleteLayer}</span>
                  </div>
                  <span className="toolbar-chip small-chip transcription-layer-count-chip">{messages.deletableCount(deletableLayers.length)}</span>
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
                          {layer.layerType === 'translation' ? messages.translationLayerType : messages.transcriptionLayerType}
                          {' · '}
                          {getLayerDisplayName(layer)}
                          {' · '}
                          {formatLayerLanguage(layer, messages.missingLanguage)}
                        </option>
                      ))
                    ) : (
                      <option value="">{messages.noDeletableLayers}</option>
                    )}
                  </select>

                  <p className="small-text">
                    {deletableLayers.length === 0
                      ? messages.noDeletableLayersHint
                      : messages.deleteCleanupHint}
                  </p>
                </div>

                <div className="action-row">
                  <button
                    className="btn btn-danger"
                    onClick={() => fireAndForget(Promise.resolve(onDeleteLayer()))}
                    disabled={deletableLayers.length === 0 || !layerPendingDelete}
                  >
                    {messages.confirmDelete}
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
