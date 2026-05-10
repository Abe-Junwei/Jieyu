import { FormField, PanelSection } from '../ui';
import type { LayerActionPopoverMessages } from '../../i18n/messages';
import type { LayerActionPopoverEditMetadataFieldIds } from './layerActionPopoverEditMetadataFieldIds';

export interface LayerActionPopoverEditMetadataGovernanceSectionProps {
  actionMessages: LayerActionPopoverMessages;
  fieldIds: LayerActionPopoverEditMetadataFieldIds;
  bridgeId: string;
  setBridgeId: (v: string) => void;
  accessRights: 'open' | 'restricted' | 'confidential';
  setAccessRights: (v: 'open' | 'restricted' | 'confidential') => void;
  isDefaultLayer: boolean;
  setIsDefaultLayer: (v: boolean) => void;
}

export function LayerActionPopoverEditMetadataGovernanceSection(
  props: LayerActionPopoverEditMetadataGovernanceSectionProps,
) {
  const {
    actionMessages,
    fieldIds,
    bridgeId,
    setBridgeId,
    accessRights,
    setAccessRights,
    isDefaultLayer,
    setIsDefaultLayer,
  } = props;

  return (
    <PanelSection
      className="layer-action-dialog-section"
      title={actionMessages.metadataGovernanceSectionTitle}
    >
      <FormField htmlFor={fieldIds.bridgeId} label={actionMessages.bridgeIdLabel}>
        <input
          id={fieldIds.bridgeId}
          className="input panel-input layer-action-dialog-input"
          placeholder={actionMessages.bridgeIdPlaceholder}
          value={bridgeId}
          onChange={(e) => setBridgeId(e.target.value)}
        />
      </FormField>
      <FormField htmlFor={fieldIds.accessRights} label={actionMessages.accessRightsLabel}>
        <select
          id={fieldIds.accessRights}
          className="input panel-input layer-action-dialog-input"
          value={accessRights}
          onChange={(e) =>
            setAccessRights(e.target.value as 'open' | 'restricted' | 'confidential')
          }
        >
          <option value="open">{actionMessages.accessRightsOpen}</option>
          <option value="restricted">{actionMessages.accessRightsRestricted}</option>
          <option value="confidential">{actionMessages.accessRightsConfidential}</option>
        </select>
      </FormField>
      <label
        className="panel-checkbox layer-action-dialog-checkbox-option"
        htmlFor={fieldIds.isDefault}
      >
        <input
          id={fieldIds.isDefault}
          type="checkbox"
          checked={isDefaultLayer}
          onChange={(e) => setIsDefaultLayer(e.target.checked)}
        />
        <span>{actionMessages.isDefaultLabel}</span>
      </label>
    </PanelSection>
  );
}
