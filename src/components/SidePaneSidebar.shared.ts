import type { LayerDocType } from '../db';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';

export function getLayerEffectiveConstraint(layer: LayerDocType): NonNullable<LayerDocType['constraint']> {
  return layer.constraint ?? (layer.layerType === 'translation' ? 'symbolic_association' : 'independent_boundary');
}

export function formatConstraintLabel(layer: LayerDocType, messages: SidePaneSidebarMessages): string {
  const constraint = getLayerEffectiveConstraint(layer);
  switch (constraint) {
    case 'independent_boundary':
      return messages.constraintIndependent;
    case 'time_subdivision':
      return messages.constraintTimeSubdivision;
    case 'symbolic_association':
    default:
      return messages.constraintSymbolicAssociation;
  }
}
