import { memo, type ReactNode } from 'react';
import type { LayerDocType } from '../../db';
import { readAnyMultiLangLabel } from '../../utils/multiLangLabels';
import type { LayerActionPopoverMessages } from '../../i18n/messages';
import { FormField, PanelSection, PanelSummary } from '../ui';

export const LayerActionPopoverDeleteContent = memo(function LayerActionPopoverDeleteContent({
  actionMessages,
  deleteConfirm,
  deleteLayerFieldId,
  deleteLayerId,
  setDeleteLayerId,
  deletableLayers,
  summaryMeta,
}: {
  actionMessages: LayerActionPopoverMessages;
  deleteConfirm: { layerId: string; layerName: string; textCount: number } | null;
  deleteLayerFieldId: string;
  deleteLayerId: string;
  setDeleteLayerId: (value: string) => void;
  deletableLayers: LayerDocType[];
  summaryMeta: ReactNode;
}) {
  return (
    <>
      <PanelSummary
        className="layer-action-dialog-summary"
        description={
          deleteConfirm
            ? actionMessages.deleteLayerConfirmMessage(
                deleteConfirm.layerName,
                deleteConfirm.textCount,
              )
            : actionMessages.deleteLayer
        }
        meta={summaryMeta}
      />
      <PanelSection className="layer-action-dialog-section">
        {deleteConfirm ? (
          <p className="layer-action-dialog-copy">
            {actionMessages.deleteLayerConfirmMessage(
              deleteConfirm.layerName,
              deleteConfirm.textCount,
            )}
          </p>
        ) : (
          <FormField htmlFor={deleteLayerFieldId} label={actionMessages.deleteLayer}>
            <select
              id={deleteLayerFieldId}
              className="input panel-input layer-action-dialog-input"
              value={deleteLayerId}
              onChange={(e) => setDeleteLayerId(e.target.value)}
            >
              {deletableLayers.map((l) => (
                <option key={l.id} value={l.id}>
                  {readAnyMultiLangLabel(l.name) ?? l.key}
                </option>
              ))}
            </select>
          </FormField>
        )}
      </PanelSection>
    </>
  );
});
