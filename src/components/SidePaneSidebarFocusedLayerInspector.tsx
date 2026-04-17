import type { LayerDocType, OrthographyDocType } from '../db';
import { useLocale } from '../i18n';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import { formatSidePaneLayerLabel, getLayerHeaderLanguageLine, getOrthographyHeaderLine, getLayerHeaderVarietyOrAliasLine, getLayerLabelParts } from '../utils/transcriptionFormatters';
import { formatConstraintLabel } from './SidePaneSidebar.shared';
import { CloseIcon } from './SvgIcons';
import { getOrthographyCatalogBadgeInfo } from './orthographyCatalogUi';

type SidePaneSidebarFocusedLayerInspectorProps = {
  focusedLayer: LayerDocType | null;
  messages: SidePaneSidebarMessages;
  deletableLayers: LayerDocType[];
  focusedLayerParentKey: string;
  independentRootLayers: LayerDocType[];
  orthographyById: Map<string, OrthographyDocType>;
  onOpenDeletePanel: (layerId: string) => void;
  onChangeLayerParent: (transcriptionKey: string, translationId: string) => void;
};

export function SidePaneSidebarFocusedLayerInspector({
  focusedLayer,
  messages,
  deletableLayers,
  focusedLayerParentKey,
  independentRootLayers,
  orthographyById,
  onOpenDeletePanel,
  onChangeLayerParent,
}: SidePaneSidebarFocusedLayerInspectorProps) {
  const locale = useLocale();

  if (!focusedLayer) {
    return (
      <section className="transcription-side-pane-inspector" aria-label={messages.inspectorAria}>
        <div className="transcription-side-pane-inspector-empty">{messages.inspectorEmpty}</div>
      </section>
    );
  }

  const labelParts = getLayerLabelParts(focusedLayer, locale);
  const canDeleteFocusedLayer = deletableLayers.some((layer) => layer.id === focusedLayer.id);
  const canEditFocusedLayerParent = focusedLayer.layerType === 'translation'
    && independentRootLayers.length > 0;
  const hasValidFocusedParent = Boolean(focusedLayerParentKey)
    && independentRootLayers.some((candidateLayer) => candidateLayer.key === focusedLayerParentKey);
  const targetOrthography = focusedLayer.orthographyId
    ? orthographyById.get(focusedLayer.orthographyId)
    : undefined;
  const languageLine = getLayerHeaderLanguageLine(focusedLayer, locale);
  const varietyOrAliasLine = getLayerHeaderVarietyOrAliasLine(focusedLayer);
  const orthographyLine = getOrthographyHeaderLine(targetOrthography, locale);
  const targetOrthographyBadge = targetOrthography ? getOrthographyCatalogBadgeInfo(locale, targetOrthography) : null;

  return (
    <section className="transcription-side-pane-inspector" aria-label={messages.inspectorAria}>
      <div className="transcription-side-pane-inspector-header">
        <span className="transcription-side-pane-inspector-title-stack">
          <span className="transcription-side-pane-inspector-title transcription-side-pane-inspector-title-primary">{languageLine}</span>
          <span className="transcription-side-pane-inspector-title transcription-side-pane-inspector-title-secondary">{varietyOrAliasLine}</span>
          <span className="transcription-side-pane-inspector-title transcription-side-pane-inspector-title-tertiary">{orthographyLine}</span>
        </span>
        <button
          type="button"
          className="transcription-side-pane-inspector-del-btn"
          disabled={!canDeleteFocusedLayer}
          onClick={() => onOpenDeletePanel(focusedLayer.id)}
          title={messages.inspectorDeleteCurrentLayerTitle}
          aria-label={messages.inspectorDeleteCurrentLayerAria}
        >
          <CloseIcon className="transcription-side-pane-inspector-del-icon" />
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
              <span>{getOrthographyHeaderLine(targetOrthography, locale)}</span>
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
    </section>
  );
}
