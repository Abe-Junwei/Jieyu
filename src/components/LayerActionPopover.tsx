import type { CSSProperties } from 'react';
import { memo } from 'react';
import ReactDOM from 'react-dom';
import { MaterialSymbol } from './ui/MaterialSymbol';
import { JIEYU_MATERIAL_PANEL_CLOSE_LG, JIEYU_MATERIAL_WAVE_MD } from '../utils/jieyuMaterialIcon';
import { DialogOverlay, DialogShell } from './ui';
import type { LayerActionPopoverProps } from './layerActionPopover/LayerActionPopoverTypes';
import { useLayerActionPopoverFormState } from './layerActionPopover/useLayerActionPopoverFormState';
import { useLayerActionPopoverFormSyncEffects } from './layerActionPopover/useLayerActionPopoverFormSyncEffects';
import { useLayerActionPopoverActions } from './layerActionPopover/useLayerActionPopoverActions';
import {
  buildLayerActionPopoverCreateGuardBundle,
  buildLayerActionPopoverTitleLabel,
} from './layerActionPopover/layerActionPopoverCreateGuardDerivations';
import {
  LayerActionPopoverBuilderBreadcrumbTitle,
  LayerActionPopoverBuilderFooter,
  LayerActionPopoverCreateFooter,
  LayerActionPopoverDeleteFooter,
  LayerActionPopoverEditFooter,
} from './layerActionPopover/LayerActionPopoverFooters';
import { LayerActionPopoverDialogContent } from './layerActionPopover/LayerActionPopoverDialogContent';

export const LayerActionPopover = memo(function LayerActionPopover(props: LayerActionPopoverProps) {
  const { action, deletableLayers, layerId, onClose, updateLayerMetadata } = props;
  const form = useLayerActionPopoverFormState(props);
  useLayerActionPopoverFormSyncEffects(props, form);
  const actions = useLayerActionPopoverActions(props, form);

  const {
    locale,
    actionMessages,
    uiTextDirection,
    panelMinWidth,
    dialogAutoWidth,
    orthographyPicker,
    alias,
    modality,
    constraint,
    independentParentLayers,
    translationHostIds,
    preferredTranslationHostId,
    resolvedLanguageId,
    resolvedTranscriptionParentLayerId,
    isLoading,
    customLanguageError,
    orthographySelectionError,
    createFailureMessage,
    deleteConfirm,
    deleteLayerId,
    isEditMetadataAction,
  } = form;

  const {
    toggleTranslationHost,
    handleCreate,
    handleDelete,
    handleConfirmDelete,
    handleCancelDelete,
    handleSaveMetadata,
    handleResetForm,
  } = actions;

  const label = buildLayerActionPopoverTitleLabel(action, actionMessages);
  const guards = buildLayerActionPopoverCreateGuardBundle({
    action,
    deletableLayers,
    resolvedLanguageId,
    alias,
    modality,
    constraint,
    translationHostIds,
    preferredTranslationHostId,
    independentParentLayers,
    resolvedTranscriptionParentLayerId,
    messages: actionMessages,
    createFailureMessage,
  });

  const footer =
    action === 'delete' ? (
      <LayerActionPopoverDeleteFooter
        deleteConfirm={deleteConfirm}
        isLoading={isLoading}
        deleteLayerId={deleteLayerId}
        actionMessages={actionMessages}
        onClose={onClose}
        onCancelDelete={handleCancelDelete}
        onConfirmDelete={handleConfirmDelete}
        onDelete={handleDelete}
      />
    ) : isEditMetadataAction ? (
      <LayerActionPopoverEditFooter
        isLoading={isLoading}
        layerId={layerId}
        {...(updateLayerMetadata !== undefined ? { updateLayerMetadata } : {})}
        actionMessages={actionMessages}
        onClose={onClose}
        onSaveMetadata={handleSaveMetadata}
      />
    ) : orthographyPicker.isCreating ? (
      <LayerActionPopoverBuilderFooter locale={locale} orthographyPicker={orthographyPicker} />
    ) : (
      <LayerActionPopoverCreateFooter
        action={action}
        label={label}
        isLoading={isLoading}
        orthographyPicker={orthographyPicker}
        hasValidLanguage={guards.hasValidLanguage}
        customLanguageError={customLanguageError}
        orthographySelectionError={orthographySelectionError}
        translationCreateDisabledReason={guards.translationCreateDisabledReason}
        transcriptionCreateDisabledReason={guards.transcriptionCreateDisabledReason}
        onCreate={handleCreate}
      />
    );

  const popover = (
    <DialogOverlay onClose={onClose} topmost closeOn="mousedown">
      <DialogShell
        className={`layer-action-dialog${orthographyPicker.isCreating ? ' orthography-builder-dialog-host' : ''}`}
        layoutStyle={
          {
            '--dialog-auto-width': orthographyPicker.isCreating
              ? '540px'
              : `${Math.max(panelMinWidth, dialogAutoWidth)}px`,
          } as CSSProperties
        }
        bodyClassName="layer-action-dialog-body"
        title={
          orthographyPicker.isCreating ? (
            <LayerActionPopoverBuilderBreadcrumbTitle
              locale={locale}
              label={label}
              orthographyPicker={orthographyPicker}
            />
          ) : (
            label
          )
        }
        headerClassName="layer-action-dialog-header"
        actions={
          <>
            {action !== 'delete' && !orthographyPicker.isCreating && (
              <button
                type="button"
                className="icon-btn"
                onClick={handleResetForm}
                aria-label={actionMessages.resetForm}
                title={actionMessages.resetForm}
              >
                <MaterialSymbol name="restart_alt" className={JIEYU_MATERIAL_WAVE_MD} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label={`${label} ${actionMessages.cancel}`}
              title={`${label} ${actionMessages.cancel}`}
            >
              <MaterialSymbol name="close" className={JIEYU_MATERIAL_PANEL_CLOSE_LG} />
            </button>
          </>
        }
        footer={footer}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        dir={uiTextDirection}
      >
        <LayerActionPopoverDialogContent
          action={action}
          isEditMetadataAction={isEditMetadataAction}
          deletableLayers={deletableLayers}
          form={form}
          guards={guards}
          label={label}
          toggleTranslationHost={toggleTranslationHost}
        />
      </DialogShell>
    </DialogOverlay>
  );

  return ReactDOM.createPortal(popover, document.body);
});
