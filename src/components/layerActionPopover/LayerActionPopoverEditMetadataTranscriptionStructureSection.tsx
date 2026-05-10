import { FormField, PanelNote, PanelSection } from '../ui';
import type { LayerConstraint, LayerDocType } from '../../db';
import { formatParentLayerOptionLabel } from '../layerActionPopoverHelpers';
import type { LayerActionPopoverMessages } from '../../i18n/messages';
import type { LayerActionPopoverEditMetadataFieldIds } from './layerActionPopoverEditMetadataFieldIds';

export interface LayerActionPopoverEditMetadataTranscriptionStructureSectionProps {
  actionMessages: LayerActionPopoverMessages;
  fieldIds: LayerActionPopoverEditMetadataFieldIds;
  constraint: LayerConstraint;
  setConstraint: (v: LayerConstraint) => void;
  independentParentLayers: LayerDocType[];
  selectedParentLayerId: string;
  setSelectedParentLayerId: (v: string) => void;
  autoTranscriptionParentLayer: LayerDocType | undefined;
}

export function LayerActionPopoverEditMetadataTranscriptionStructureSection(
  props: LayerActionPopoverEditMetadataTranscriptionStructureSectionProps,
) {
  const {
    actionMessages,
    fieldIds,
    constraint,
    setConstraint,
    independentParentLayers,
    selectedParentLayerId,
    setSelectedParentLayerId,
    autoTranscriptionParentLayer,
  } = props;

  return (
    <PanelSection
      className="layer-action-dialog-section"
      title={actionMessages.metadataStructureSectionTitle}
    >
      <FormField htmlFor={fieldIds.constraint} label={actionMessages.constraintLegend}>
        <select
          id={fieldIds.constraint}
          className="input panel-input layer-action-dialog-input"
          value={constraint}
          onChange={(e) => setConstraint(e.target.value as LayerConstraint)}
        >
          <option value="symbolic_association">{actionMessages.dependentConstraint}</option>
          <option value="independent_boundary">{actionMessages.independentConstraint}</option>
        </select>
      </FormField>
      {constraint === 'symbolic_association' && independentParentLayers.length > 1 && (
        <FormField
          htmlFor={fieldIds.transcriptionParentLayer}
          label={actionMessages.selectParentLayer}
        >
          <select
            id={fieldIds.transcriptionParentLayer}
            className="input panel-input layer-action-dialog-input"
            value={selectedParentLayerId}
            onChange={(e) => setSelectedParentLayerId(e.target.value)}
          >
            <option value="">{actionMessages.selectParentLayer}</option>
            {independentParentLayers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {formatParentLayerOptionLabel(layer)}
              </option>
            ))}
          </select>
        </FormField>
      )}
      {constraint === 'symbolic_association' && autoTranscriptionParentLayer && (
        <PanelNote className="layer-action-dialog-meta-note layer-action-dialog-auto-linked-hint">
          {actionMessages.autoLinkedParent(
            formatParentLayerOptionLabel(autoTranscriptionParentLayer),
          )}
        </PanelNote>
      )}
    </PanelSection>
  );
}
