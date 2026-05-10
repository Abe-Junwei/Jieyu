import { FormField, PanelNote, PanelSection } from '../ui';
import type { LayerDocType, LayerLinkDocType } from '../../db';
import { formatParentLayerOptionLabel } from '../layerActionPopoverHelpers';
import type { LayerActionPopoverMessages } from '../../i18n/messages';
import type { LayerActionPopoverEditMetadataFieldIds } from './layerActionPopoverEditMetadataFieldIds';

export interface LayerActionPopoverEditMetadataTranslationStructureSectionProps {
  actionMessages: LayerActionPopoverMessages;
  fieldIdPrefix: string;
  fieldIds: LayerActionPopoverEditMetadataFieldIds;
  independentParentLayers: LayerDocType[];
  translationHostIds: string[];
  toggleTranslationHost: (hostId: string, checked: boolean) => void;
  preferredTranslationHostId: string;
  setPreferredTranslationHostId: (v: string) => void;
  autoTranslationHostLayer: LayerDocType | undefined;
  translationLinkType: LayerLinkDocType['linkType'];
  setTranslationLinkType: (v: LayerLinkDocType['linkType']) => void;
}

export function LayerActionPopoverEditMetadataTranslationStructureSection(
  props: LayerActionPopoverEditMetadataTranslationStructureSectionProps,
) {
  const {
    actionMessages,
    fieldIdPrefix,
    fieldIds,
    independentParentLayers,
    translationHostIds,
    toggleTranslationHost,
    preferredTranslationHostId,
    setPreferredTranslationHostId,
    autoTranslationHostLayer,
    translationLinkType,
    setTranslationLinkType,
  } = props;

  return (
    <PanelSection
      className="layer-action-dialog-section"
      title={actionMessages.metadataStructureSectionTitle}
    >
      <div className="dialog-field">
        <div className="dialog-field-label" id={`${fieldIds.translationParentLayer}-legend`}>
          {actionMessages.translationHostLayersLabel}
        </div>
        <div
          className="layer-action-dialog-translation-host-list"
          role="group"
          aria-labelledby={`${fieldIds.translationParentLayer}-legend`}
        >
          {independentParentLayers.map((layer) => (
            <label key={layer.id} className="panel-checkbox layer-action-dialog-checkbox-option">
              <input
                id={`${fieldIds.translationParentLayer}-${layer.id}`}
                type="checkbox"
                checked={translationHostIds.includes(layer.id)}
                onChange={(event) => toggleTranslationHost(layer.id, event.target.checked)}
              />
              <span>{formatParentLayerOptionLabel(layer)}</span>
            </label>
          ))}
        </div>
        {translationHostIds.length > 1 && (
          <fieldset className="panel-fieldset layer-action-dialog-fieldset layer-action-dialog-translation-preferred-hosts">
            <legend className="layer-action-dialog-fieldset-legend">
              {actionMessages.translationPreferredHostLabel}
            </legend>
            {translationHostIds.map((hostId) => {
              const layer = independentParentLayers.find((item) => item.id === hostId);
              if (!layer) return null;
              return (
                <label key={hostId} className="panel-radio layer-action-dialog-radio-option">
                  <input
                    type="radio"
                    name={`${fieldIdPrefix}-trl-preferred-host`}
                    checked={preferredTranslationHostId === hostId}
                    onChange={() => setPreferredTranslationHostId(hostId)}
                  />
                  <span>{formatParentLayerOptionLabel(layer)}</span>
                </label>
              );
            })}
          </fieldset>
        )}
        {autoTranslationHostLayer && (
          <PanelNote className="layer-action-dialog-meta-note layer-action-dialog-auto-linked-hint">
            {actionMessages.autoLinkedParent(
              formatParentLayerOptionLabel(autoTranslationHostLayer),
            )}
          </PanelNote>
        )}
      </div>
      <FormField
        htmlFor={fieldIds.translationLinkType}
        label={actionMessages.translationLinkTypeLabel}
      >
        <select
          id={fieldIds.translationLinkType}
          className="input panel-input layer-action-dialog-input"
          value={translationLinkType}
          onChange={(e) => setTranslationLinkType(e.target.value as LayerLinkDocType['linkType'])}
        >
          <option value="direct">{actionMessages.translationLinkTypeDirect}</option>
          <option value="free">{actionMessages.translationLinkTypeFree}</option>
          <option value="literal">{actionMessages.translationLinkTypeLiteral}</option>
          <option value="pedagogical">{actionMessages.translationLinkTypePedagogical}</option>
        </select>
      </FormField>
    </PanelSection>
  );
}
