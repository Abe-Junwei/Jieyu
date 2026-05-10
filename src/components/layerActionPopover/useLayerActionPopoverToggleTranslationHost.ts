import { useCallback } from 'react';
import type { LayerActionPopoverFormState } from './useLayerActionPopoverFormState';

export function useLayerActionPopoverToggleTranslationHost(form: LayerActionPopoverFormState) {
  const { independentParentLayers, setTranslationHostIds } = form;

  const toggleTranslationHost = useCallback(
    (hostId: string, checked: boolean) => {
      const order = independentParentLayers.map((layer) => layer.id);
      setTranslationHostIds((prev) => {
        const nextIds = new Set(checked ? [...prev, hostId] : prev.filter((id) => id !== hostId));
        return order.filter((id) => nextIds.has(id));
      });
    },
    [independentParentLayers, setTranslationHostIds],
  );

  return { toggleTranslationHost };
}
