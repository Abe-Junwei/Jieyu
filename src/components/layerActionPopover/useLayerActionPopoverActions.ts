import type { LayerActionPopoverProps } from './LayerActionPopoverTypes';
import type { LayerActionPopoverFormState } from './useLayerActionPopoverFormState';
import { useLayerActionPopoverDeleteActions } from './useLayerActionPopoverDeleteActions';
import { useLayerActionPopoverHandleCreate } from './useLayerActionPopoverHandleCreate';
import { useLayerActionPopoverHandleResetForm } from './useLayerActionPopoverHandleResetForm';
import { useLayerActionPopoverHandleSaveMetadata } from './useLayerActionPopoverHandleSaveMetadata';
import { useLayerActionPopoverToggleTranslationHost } from './useLayerActionPopoverToggleTranslationHost';

/**
 * Aggregates layer popover action callbacks (split across sibling hooks for file size / hook-budget hygiene).
 */
export function useLayerActionPopoverActions(
  props: LayerActionPopoverProps,
  form: LayerActionPopoverFormState,
) {
  const { toggleTranslationHost } = useLayerActionPopoverToggleTranslationHost(form);
  const { handleCreate } = useLayerActionPopoverHandleCreate(props, form);
  const { handleDelete, handleConfirmDelete, handleCancelDelete } =
    useLayerActionPopoverDeleteActions(props, form);
  const { handleSaveMetadata } = useLayerActionPopoverHandleSaveMetadata(props, form);
  const { handleResetForm } = useLayerActionPopoverHandleResetForm(props, form);

  return {
    toggleTranslationHost,
    handleCreate,
    handleDelete,
    handleConfirmDelete,
    handleCancelDelete,
    handleSaveMetadata,
    handleResetForm,
  };
}
