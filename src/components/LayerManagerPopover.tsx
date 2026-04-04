import { useEffect, useId, useRef, useState } from 'react';
import { AudioLines, Languages, Trash2, X } from 'lucide-react';
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
import { DialogShell } from './ui/DialogShell';
import { PanelSection } from './ui/PanelSection';
import { PanelSummary } from './ui/PanelSummary';

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
  renderMode?: 'anchored' | 'dialog';
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
  renderMode = 'anchored',
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
  const isDialogMode = renderMode === 'dialog';
  const locale = useLocale();
  const messages = getLayerManagerPopoverMessages(locale);
  const fieldIdPrefix = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
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
      const isInsidePopover = isDialogMode
        ? Boolean(panelRef.current?.contains(target))
        : Boolean(rootRef.current?.contains(target));
      if (!isInsidePopover) {
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
  }, [isDialogMode, isOpen, onClose]);

  const layerManagerSummaryMessage = message
    || transcriptionCreateError
    || translationCreateError
    || (!independentParentLayers.length ? messages.translationBoundarySource : '');
  const selectedDeleteLabel = layerPendingDelete
    ? `${getLayerDisplayName(layerPendingDelete)} · ${formatLayerLanguage(layerPendingDelete, messages.missingLanguage)}`
    : '';
  const transcriptionLanguageLabel = `${messages.createTranscriptionLayer} ${messages.selectLanguage.replace(/\u2026$/, '')}`;
  const translationLanguageLabel = `${messages.createTranslationLayer} ${messages.selectLanguage.replace(/\u2026$/, '')}`;
  const transcriptionCustomLanguageLabel = `${messages.createTranscriptionLayer} ${messages.customLanguageCodePlaceholder}`;
  const translationCustomLanguageLabel = `${messages.createTranslationLayer} ${messages.customLanguageCodePlaceholder}`;
  const transcriptionAliasLabel = `${messages.createTranscriptionLayer} ${messages.aliasShortPlaceholder}`;
  const translationAliasLabel = `${messages.createTranslationLayer} ${messages.aliasShortPlaceholder}`;
  const transcriptionParentLabel = `${messages.createTranscriptionLayer} ${messages.selectParentLayer.replace(/\u2026$/, '')}`;
  const translationParentLabel = `${messages.createTranslationLayer} ${messages.selectParentLayer.replace(/\u2026$/, '')}`;
  const translationModalityLabel = messages.translationModalityLabel;
  const deleteTargetLabel = messages.deleteTargetLabel;

  const managerCard = (
    <DialogShell
      containerRef={panelRef}
      className="transcription-layer-form transcription-layer-manager layer-manager panel-design-match panel-design-match-dialog"
      {...(isDialogMode ? {
        role: 'dialog' as const,
        'aria-modal': true,
        'aria-label': messages.layerManagement,
      } : {})}
      headerClassName="transcription-layer-manager-head"
      bodyClassName="transcription-layer-manager-body layer-manager__body"
      title={messages.layerManagement}
      actions={(
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label={messages.close}
          title={messages.close}
        >
          <X size={18} />
        </button>
      )}
      footerClassName="layer-manager__footer"
      footer={(
        <>
          <span className="dialog-hint">{messages.translationBoundarySource}</span>
          <button type="button" className="transcription-outline-btn panel-button panel-button--ghost" onClick={onClose}>
            {messages.close}
          </button>
        </>
      )}
    >
      <PanelSummary
        className="layer-manager__summary"
        title={messages.layerManagement}
        description={`${messages.createTranscriptionLayer} / ${messages.createTranslationLayer} / ${messages.deleteLayer}`}
        meta={(
          <div className="panel-meta">
            <span className="panel-chip">{messages.existingCount(transcriptionLayerCount)}</span>
            <span className="panel-chip">{messages.existingCount(translationLayerCount)}</span>
            <span className={`panel-chip${deletableLayers.length > 0 ? ' panel-chip--warning' : ''}`}>{messages.deletableCount(deletableLayers.length)}</span>
          </div>
        )}
        supportingText={layerManagerSummaryMessage || undefined}
        supportingClassName={transcriptionCreateError || translationCreateError ? 'panel-note panel-note--danger' : 'panel-note'}
      />

      <div className="layer-manager__grid">
        <PanelSection
          className="layer-manager__panel"
          title={(
            <div className="layer-manager__heading">
              <AudioLines size={14} className="layer-manager__icon" />
              <span>{messages.createTranscriptionLayer}</span>
            </div>
          )}
          description={messages.existingCount(transcriptionLayerCount)}
          meta={<span className="panel-chip">{transcriptionConstraint === 'symbolic_association' ? messages.dependentConstraint : messages.independentConstraint}</span>}
        >
          {transcriptionCreateError && (
            <div role="alert" aria-live="assertive" className="layer-manager__alert">
              {messages.createFailedPrefix}: {transcriptionCreateError}
            </div>
          )}
          <div className="layer-manager__fields">
            <select
              id={`${fieldIdPrefix}-transcription-language`}
              className="input panel-input"
              value={transcriptionForm.languageId}
              onChange={(event) => setTranscriptionForm((prev) => ({ ...prev, languageId: event.target.value }))}
              aria-label={transcriptionLanguageLabel}
            >
              <option value="">{messages.selectLanguage}</option>
              {COMMON_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label}（{lang.code}）</option>
              ))}
              <option value="__custom__">{messages.customLanguageOption}</option>
            </select>
            {transcriptionForm.languageId === '__custom__' && (
              <input
                id={`${fieldIdPrefix}-transcription-custom-language`}
                className="input panel-input"
                placeholder={messages.customLanguageCodePlaceholder}
                value={transcriptionCustomLang}
                onChange={(event) => setTranscriptionCustomLang(event.target.value)}
                aria-label={transcriptionCustomLanguageLabel}
              />
            )}
            <input
              id={`${fieldIdPrefix}-transcription-alias`}
              className="input panel-input"
              placeholder={messages.aliasPlaceholder}
              value={transcriptionForm.alias ?? ''}
              onChange={(event) => setTranscriptionForm((prev) => ({ ...prev, alias: event.target.value }))}
              aria-label={transcriptionAliasLabel}
            />
            {canConfigureTranscriptionConstraint && (
              <fieldset className="panel-fieldset">
                <legend>{messages.constraintLegend}</legend>
                <label className="panel-radio">
                  <input
                    type="radio"
                    name="manager-transcription-constraint"
                    value="symbolic_association"
                    checked={transcriptionConstraint === 'symbolic_association'}
                    disabled={!transcriptionSymbolicGuard.allowed}
                    onChange={(event) => setTranscriptionConstraint(event.target.value as LayerConstraint)}
                  />
                  <span>{messages.dependentConstraint}</span>
                </label>
                <label className="panel-radio">
                  <input
                    type="radio"
                    name="manager-transcription-constraint"
                    value="independent_boundary"
                    checked={transcriptionConstraint === 'independent_boundary'}
                    disabled={!transcriptionIndependentGuard.allowed}
                    onChange={(event) => setTranscriptionConstraint(event.target.value as LayerConstraint)}
                  />
                  <span>{messages.independentConstraint}</span>
                </label>
              </fieldset>
            )}
            {needsTranscriptionParent && independentParentLayers.length > 1 && (
              <select
                id={`${fieldIdPrefix}-transcription-parent`}
                className="input panel-input layer-parent-select"
                value={transcriptionParentLayerId}
                onChange={(event) => setTranscriptionParentLayerId(event.target.value)}
                aria-label={transcriptionParentLabel}
              >
                <option value="">{messages.selectParentLayer}</option>
                {independentParentLayers.map((layer) => (
                  <option key={layer.id} value={layer.id}>{formatParentLayerOptionLabel(layer)}</option>
                ))}
              </select>
            )}
            {needsTranscriptionParent && autoTranscriptionParentLayer && (
              <p className="panel-note">{messages.autoLinkedParent(formatParentLayerOptionLabel(autoTranscriptionParentLayer))}</p>
            )}
          </div>
          {(transcriptionCreateDisabledReason || !hasValidTranscriptionLanguage) && (
            <div className="layer-manager__feedback-stack">
              {transcriptionCreateDisabledReason && (
                <p className="layer-manager__feedback layer-manager__feedback--error">
                  {messages.transcriptionDisabledReason(transcriptionCreateDisabledReason)}
                </p>
              )}
              {!hasValidTranscriptionLanguage && (
                <p className="layer-manager__feedback layer-manager__feedback--info">
                  {messages.transcriptionLanguageRequired}
                </p>
              )}
            </div>
          )}
          <div className="action-row">
            <button
              className="btn panel-button panel-button--primary"
              disabled={!hasValidTranscriptionLanguage || transcriptionCreateDisabledReason.length > 0}
              onClick={() => fireAndForget(handleCreateTranscription())}
            >
              {messages.createTranscriptionLayer}
            </button>
          </div>
        </PanelSection>

        <PanelSection
          className="layer-manager__panel"
          title={(
            <div className="layer-manager__heading">
              <Languages size={14} className="layer-manager__icon" />
              <span>{messages.createTranslationLayer}</span>
            </div>
          )}
          description={messages.existingCount(translationLayerCount)}
          meta={<span className="panel-chip">{translationModalityOptions.find((option) => option.value === translationModality)?.label ?? messages.modalityText}</span>}
        >
          {translationCreateError && (
            <div role="alert" aria-live="assertive" className="layer-manager__alert">
              {messages.createFailedPrefix}: {translationCreateError}
            </div>
          )}
          <div className="layer-manager__fields">
            <select
              id={`${fieldIdPrefix}-translation-language`}
              className="input panel-input"
              value={translationForm.languageId}
              onChange={(event) => setTranslationForm((prev) => ({ ...prev, languageId: event.target.value }))}
              aria-label={translationLanguageLabel}
            >
              <option value="">{messages.selectLanguage}</option>
              {COMMON_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label}（{lang.code}）</option>
              ))}
              <option value="__custom__">{messages.customLanguageOption}</option>
            </select>
            {translationForm.languageId === '__custom__' && (
              <input
                id={`${fieldIdPrefix}-translation-custom-language`}
                className="input panel-input"
                placeholder={messages.customLanguageCodePlaceholder}
                value={translationCustomLang}
                onChange={(event) => setTranslationCustomLang(event.target.value)}
                aria-label={translationCustomLanguageLabel}
              />
            )}
            <input
              id={`${fieldIdPrefix}-translation-alias`}
              className="input panel-input"
              placeholder={messages.aliasPlaceholder}
              value={translationForm.alias ?? ''}
              onChange={(event) => setTranslationForm((prev) => ({ ...prev, alias: event.target.value }))}
              aria-label={translationAliasLabel}
            />
            <select
              id={`${fieldIdPrefix}-translation-modality`}
              className="input panel-input"
              value={translationModality}
              onChange={(event) => setTranslationModality(event.target.value as 'text' | 'audio' | 'mixed')}
              aria-label={translationModalityLabel}
            >
              {translationModalityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="panel-note">{messages.translationBoundarySource}</p>
            {independentParentLayers.length > 1 && (
              <select
                id={`${fieldIdPrefix}-translation-parent`}
                className="input panel-input layer-parent-select"
                value={translationParentLayerId}
                onChange={(event) => setTranslationParentLayerId(event.target.value)}
                aria-label={translationParentLabel}
              >
                <option value="">{messages.selectParentLayer}</option>
                {independentParentLayers.map((layer) => (
                  <option key={layer.id} value={layer.id}>{formatParentLayerOptionLabel(layer)}</option>
                ))}
              </select>
            )}
            {autoTranslationParentLayer && (
              <p className="panel-note">{messages.autoLinkedParent(formatParentLayerOptionLabel(autoTranslationParentLayer))}</p>
            )}
          </div>
          {(translationCreateDisabledReason || !hasValidTranslationLanguage) && (
            <div className="layer-manager__feedback-stack">
              {translationCreateDisabledReason && (
                <p className="layer-manager__feedback layer-manager__feedback--error">
                  {messages.translationDisabledReason(translationCreateDisabledReason)}
                </p>
              )}
              {!hasValidTranslationLanguage && (
                <p className="layer-manager__feedback layer-manager__feedback--info">
                  {messages.translationLanguageRequired}
                </p>
              )}
            </div>
          )}
          <div className="action-row">
            <button
              className="btn panel-button panel-button--primary"
              disabled={!hasValidTranslationLanguage || translationCreateDisabledReason.length > 0}
              onClick={() => fireAndForget(handleCreateTranslation())}
            >
              {messages.createTranslationLayer}
            </button>
          </div>
        </PanelSection>

        <PanelSection
          className="layer-manager__panel layer-manager__panel--delete"
          title={(
            <div className="layer-manager__heading">
              <Trash2 size={14} className="layer-manager__icon" />
              <span>{messages.deleteLayer}</span>
            </div>
          )}
          description={messages.deletableCount(deletableLayers.length)}
          meta={selectedDeleteLabel ? <span className="panel-chip panel-chip--danger">{selectedDeleteLabel}</span> : undefined}
        >
          <div className="layer-manager__fields">
            <select
              id={`${fieldIdPrefix}-delete-layer`}
              className="input panel-input"
              value={layerToDeleteId}
              onChange={(event) => onLayerToDeleteIdChange(event.target.value)}
              disabled={deletableLayers.length === 0}
              aria-label={deleteTargetLabel}
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

            <p className="panel-note panel-note--danger">
              {deletableLayers.length === 0
                ? messages.noDeletableLayersHint
                : messages.deleteCleanupHint}
            </p>
          </div>

          <div className="action-row">
            <button
              className="btn btn-danger panel-button panel-button--danger"
              onClick={() => fireAndForget(Promise.resolve(onDeleteLayer()))}
              disabled={deletableLayers.length === 0 || !layerPendingDelete}
            >
              {messages.confirmDelete}
            </button>
          </div>
        </PanelSection>
      </div>
    </DialogShell>
  );

  return (
    <div className="transcription-layer-popover" ref={rootRef}>
      {!isDialogMode && (
        <div className="transcription-list-toolbar transcription-list-toolbar-layer-only">
          <button className="btn" onClick={onToggle}>
            {messages.layerManagement}
          </button>
        </div>
      )}

      {shouldRenderBubble && (
        isDialogMode ? (
          <div className="dialog-overlay dialog-overlay-topmost" role="presentation" onMouseDown={onClose}>
            <div className="transcription-layer-bubble transcription-layer-bubble-dialog" onMouseDown={(event) => event.stopPropagation()}>
              {managerCard}
            </div>
          </div>
        ) : (
          <div className={`transcription-layer-bubble ${isOpen ? 'transcription-layer-bubble-open' : 'transcription-layer-bubble-closing'}`}>
            <div className="transcription-layer-bubble-arrow" />
            {managerCard}
          </div>
        )
      )}
    </div>
  );
}
