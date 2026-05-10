import { useCallback } from 'react';
import { readAnyMultiLangLabel } from '../../utils/multiLangLabels';
import type { LayerActionPopoverProps } from './LayerActionPopoverTypes';
import type { LayerActionPopoverFormState } from './useLayerActionPopoverFormState';

export function useLayerActionPopoverDeleteActions(
  props: LayerActionPopoverProps,
  form: LayerActionPopoverFormState,
) {
  const { deletableLayers, deleteLayer, deleteLayerWithoutConfirm, checkLayerHasContent, onClose } =
    props;

  const { deleteLayerId, deleteConfirm, setDeleteConfirm, setIsLoading } = form;

  const handleDelete = useCallback(async () => {
    if (!deleteLayerId) return;
    const layer = deletableLayers.find((l) => l.id === deleteLayerId);
    const layerName =
      (layer ? readAnyMultiLangLabel(layer.name) : undefined) ?? layer?.key ?? deleteLayerId;

    const textCount = checkLayerHasContent ? await checkLayerHasContent(deleteLayerId) : 0;

    if (textCount === 0) {
      setIsLoading(true);
      try {
        await (deleteLayerWithoutConfirm ?? deleteLayer)(deleteLayerId);
        onClose();
      } finally {
        setIsLoading(false);
      }
    } else {
      setDeleteConfirm({ layerId: deleteLayerId, layerName, textCount });
    }
  }, [
    deleteLayerId,
    deletableLayers,
    checkLayerHasContent,
    deleteLayerWithoutConfirm,
    deleteLayer,
    onClose,
    setDeleteConfirm,
    setIsLoading,
  ]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setIsLoading(true);
    try {
      await (deleteLayerWithoutConfirm ?? deleteLayer)(deleteConfirm.layerId);
      setDeleteConfirm(null);
      onClose();
    } finally {
      setIsLoading(false);
    }
  }, [
    deleteConfirm,
    deleteLayerWithoutConfirm,
    deleteLayer,
    onClose,
    setDeleteConfirm,
    setIsLoading,
  ]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirm(null);
  }, [setDeleteConfirm]);

  return { handleDelete, handleConfirmDelete, handleCancelDelete };
}
