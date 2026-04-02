import type { LayerDocType } from '../db';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import { formatSidePaneLayerLabel, getLayerLabelParts } from '../utils/transcriptionFormatters';
import { formatConstraintLabel } from './SidePaneSidebar.shared';

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
