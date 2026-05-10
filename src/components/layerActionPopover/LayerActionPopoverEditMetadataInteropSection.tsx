import { FormField, PanelSection } from '../ui';
import type { LayerActionPopoverMessages } from '../../i18n/messages';
import type { LayerActionPopoverEditMetadataFieldIds } from './layerActionPopoverEditMetadataFieldIds';

export interface LayerActionPopoverEditMetadataInteropSectionProps {
  actionMessages: LayerActionPopoverMessages;
  fieldIds: LayerActionPopoverEditMetadataFieldIds;
  participantId: string;
  setParticipantId: (v: string) => void;
  dataCategory: string;
  setDataCategory: (v: string) => void;
  sortOrderInput: string;
  setSortOrderInput: (v: string) => void;
  delimiter: string;
  setDelimiter: (v: string) => void;
}

export function LayerActionPopoverEditMetadataInteropSection(
  props: LayerActionPopoverEditMetadataInteropSectionProps,
) {
  const {
    actionMessages,
    fieldIds,
    participantId,
    setParticipantId,
    dataCategory,
    setDataCategory,
    sortOrderInput,
    setSortOrderInput,
    delimiter,
    setDelimiter,
  } = props;

  return (
    <PanelSection
      className="layer-action-dialog-section"
      title={actionMessages.metadataInteropSectionTitle}
    >
      <div className="layer-action-dialog-triple-row">
        <FormField htmlFor={fieldIds.participantId} label={actionMessages.participantIdLabel}>
          <input
            id={fieldIds.participantId}
            className="input panel-input layer-action-dialog-input"
            placeholder={actionMessages.participantIdPlaceholder}
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
          />
        </FormField>
        <FormField htmlFor={fieldIds.dataCategory} label={actionMessages.dataCategoryLabel}>
          <input
            id={fieldIds.dataCategory}
            className="input panel-input layer-action-dialog-input"
            placeholder={actionMessages.dataCategoryPlaceholder}
            value={dataCategory}
            onChange={(e) => setDataCategory(e.target.value)}
          />
        </FormField>
        <FormField htmlFor={fieldIds.sortOrder} label={actionMessages.sortOrderLabel}>
          <input
            id={fieldIds.sortOrder}
            type="number"
            min="0"
            step="1"
            className="input panel-input layer-action-dialog-input"
            placeholder={actionMessages.sortOrderPlaceholder}
            value={sortOrderInput}
            onChange={(e) => setSortOrderInput(e.target.value)}
          />
        </FormField>
      </div>
      <FormField htmlFor={fieldIds.delimiter} label={actionMessages.delimiterLabel}>
        <input
          id={fieldIds.delimiter}
          className="input panel-input layer-action-dialog-input"
          placeholder={actionMessages.delimiterPlaceholder}
          value={delimiter}
          onChange={(e) => setDelimiter(e.target.value)}
        />
      </FormField>
    </PanelSection>
  );
}
