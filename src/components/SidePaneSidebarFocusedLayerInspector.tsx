import { useMemo } from 'react';
import type { LayerDocType } from '../db';
import { useOrthographies } from '../hooks/useOrthographies';
import { useLocale } from '../i18n';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import { formatOrthographyOptionLabel } from '../hooks/useOrthographyPicker';
import { formatSidePaneLayerLabel, getLayerLabelParts } from '../utils/transcriptionFormatters';
import { formatConstraintLabel } from './SidePaneSidebar.shared';
import { getOrthographyCatalogBadgeInfo } from './orthographyCatalogUi';

type SidePaneSidebarFocusedLayerInspectorProps = {
  focusedLayer: LayerDocType | null;
  messages: SidePaneSidebarMessages;
  deletableLayers: LayerDocType[];
  focusedLayerParentKey: string;
  independentRootLayers: LayerDocType[];
  onOpenDeletePanel: (layerId: string) => void;
  onChangeLayerParent: (transcriptionKey: string, translationId: string) => void;
};

export function SidePaneSidebarFocusedLayerInspector({
  focusedLayer,
  messages,
  deletableLayers,
  focusedLayerParentKey,
  independentRootLayers,
  onOpenDeletePanel,
  onChangeLayerParent,
}: SidePaneSidebarFocusedLayerInspectorProps) {
  const locale = useLocale();
  const orthographies = useOrthographies(focusedLayer?.languageId ? [focusedLayer.languageId] : []);

  if (!focusedLayer) {
    return (
      <section className="transcription-side-pane-inspector" aria-label={messages.inspectorAria}>
        <div className="transcription-side-pane-inspector-empty">{messages.inspectorEmpty}</div>
      </section>
    );
  }

  const labelParts = getLayerLabelParts(focusedLayer);
  const canDeleteFocusedLayer = deletableLayers.some((layer) => layer.id === focusedLayer.id);
  const canEditFocusedLayerParent = focusedLayer.layerType === 'translation'
    && independentRootLayers.length > 0;
  const hasValidFocusedParent = Boolean(focusedLayerParentKey)
    && independentRootLayers.some((candidateLayer) => candidateLayer.key === focusedLayerParentKey);
  const targetOrthography = focusedLayer.orthographyId
    ? orthographies.find((orthography) => orthography.id === focusedLayer.orthographyId)
    : undefined;
  const targetOrthographyBadge = targetOrthography ? getOrthographyCatalogBadgeInfo(locale, targetOrthography) : null;
  const orthographyWorkspaceHref = useMemo(() => {
    if (!targetOrthography) return '';
    const params = new URLSearchParams();
    params.set('orthographyId', targetOrthography.id);
    params.set('fromLayerId', focusedLayer.id);
    return `/lexicon/orthographies?${params.toString()}`;
  }, [focusedLayer.id, targetOrthography]);

  return (
    <section className="transcription-side-pane-inspector" aria-label={messages.inspectorAria}>
      <div className="transcription-side-pane-inspector-header">
        <span className="transcription-side-pane-inspector-chip" data-layer-type={focusedLayer.layerType}>
          {focusedLayer.layerType === 'translation' ? messages.layerTypeTranslationShort : messages.layerTypeTranscriptionShort}
        </span>
        <span className="transcription-side-pane-inspector-title">{formatSidePaneLayerLabel(focusedLayer)}</span>
        <button
          type="button"
          className="transcription-side-pane-inspector-del-btn"
          disabled={!canDeleteFocusedLayer}
          onClick={() => onOpenDeletePanel(focusedLayer.id)}
          title={messages.inspectorDeleteCurrentLayerTitle}
          aria-label={messages.inspectorDeleteCurrentLayerAria}
        >
          ✕
        </button>
      </div>
      <dl className="transcription-side-pane-inspector-props">
        <div><dt>{messages.inspectorLanguage}</dt><dd>{labelParts.lang}</dd></div>
        <div><dt>{messages.inspectorConstraint}</dt><dd>{formatConstraintLabel(focusedLayer, messages)}</dd></div>
        {labelParts.alias ? <div><dt>{messages.inspectorAlias}</dt><dd>{labelParts.alias}</dd></div> : null}
        {targetOrthography ? (
          <div>
            <dt>{messages.inspectorOrthography}</dt>
            <dd>
              <span>{formatOrthographyOptionLabel(targetOrthography, locale)}</span>
              {targetOrthographyBadge ? <span className={targetOrthographyBadge.className}>{targetOrthographyBadge.label}</span> : null}
            </dd>
          </div>
        ) : null}
        {canEditFocusedLayerParent ? (
          <div>
            <dt>{messages.inspectorParentLayer}</dt>
            <dd>
              <select
                aria-label={messages.inspectorParentLayerAria}
                className="transcription-side-pane-inspector-select"
                value={hasValidFocusedParent ? focusedLayerParentKey : ''}
                onChange={(event) => {
                  const nextParentKey = event.target.value;
                  if (!nextParentKey) return;
                  onChangeLayerParent(nextParentKey, focusedLayer.id);
                }}
              >
                <option value="" disabled>
                  {messages.inspectorSelectPlaceholder}
                </option>
                {independentRootLayers.map((transcriptionLayer) => (
                  <option key={`focused-${focusedLayer.id}-${transcriptionLayer.id}`} value={transcriptionLayer.key}>
                    {formatSidePaneLayerLabel(transcriptionLayer)}
                  </option>
                ))}
              </select>
            </dd>
          </div>
        ) : null}
      </dl>
      {focusedLayer.layerType === 'translation' && independentRootLayers.length === 0 ? (
        <div className="transcription-side-pane-inspector-note">{messages.inspectorNoIndependentLayer}</div>
      ) : null}
      {targetOrthography ? (
        <div className="transcription-side-pane-inspector-note">
          <a
            className="btn btn-ghost"
            href={orthographyWorkspaceHref}
          >
            {messages.inspectorBridgeRulesButton}
          </a>
          <div>{messages.inspectorBridgeRulesHint}</div>
        </div>
      ) : null}
    </section>
  );
}
