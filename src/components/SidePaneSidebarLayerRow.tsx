import { memo } from 'react';
import type { LayerDocType, OrthographyDocType } from '../db';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import { useLocale } from '../i18n';
import { getLayerHeaderLanguageLine, getOrthographyHeaderLine, getLayerHeaderVarietyOrAliasLine } from '../utils/transcriptionFormatters';

type DragState = {
  draggedId: string;
  draggedLayerIds: string[];
  sourceIndex: number;
  sourceSpan: number;
  sourceType: 'transcription' | 'translation';
} | null;

type SidePaneSidebarLayerRowProps = {
  layer: LayerDocType;
  index: number;
  focusedLayerRowId: string;
  flashLayerRowId: string;
  dragState: DragState;
  dropTargetIndex: number | null;
  boundaryHighlight: 'top' | 'bottom' | null;
  bundleTargetHighlighted: boolean;
  parentLabel: string;
  orthographyById: Map<string, OrthographyDocType>;
  messages: SidePaneSidebarMessages;
  onFocusLayer: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, layerId: string) => void;
  onMouseDown: (e: React.MouseEvent, layer: LayerDocType) => void;
  onKeyboardReorder: (layerId: string, currentIndex: number, direction: 'up' | 'down') => void;
};

export const SidePaneSidebarLayerRow = memo(function SidePaneSidebarLayerRow({
  layer,
  index,
  focusedLayerRowId,
  flashLayerRowId,
  dragState,
  dropTargetIndex,
  boundaryHighlight,
  bundleTargetHighlighted,
  parentLabel,
  orthographyById,
  messages,
  onFocusLayer,
  onContextMenu,
  onMouseDown,
  onKeyboardReorder,
}: SidePaneSidebarLayerRowProps) {
  const locale = useLocale();
  const languageLine = getLayerHeaderLanguageLine(layer, locale);
  const varietyOrAliasLine = getLayerHeaderVarietyOrAliasLine(layer);
  const targetOrthography = layer.orthographyId
    ? orthographyById.get(layer.orthographyId)
    : undefined;
  const orthographyLine = getOrthographyHeaderLine(targetOrthography, locale);
  const isActiveLayer = layer.id === focusedLayerRowId;
  const isFlashLayer = layer.id === flashLayerRowId;
  const isDragged = dragState?.draggedLayerIds.includes(layer.id) ?? false;
  const showDropIndicator = dropTargetIndex === index && !isDragged;
  const isTranslationLayer = layer.layerType === 'translation';
  const hasDependency = Boolean(parentLabel);
  const effectiveConstraint = layer.constraint ?? (isTranslationLayer ? 'symbolic_association' : 'independent_boundary');
  const constraintLabel = effectiveConstraint === 'independent_boundary'
    ? messages.constraintIndependent
    : effectiveConstraint === 'time_subdivision'
      ? messages.constraintTimeSubdivision
      : messages.constraintSymbolicAssociation;
  const relationLine = parentLabel ? `${messages.inspectorParentLayer}：${parentLabel}` : '';
  const metadataParts = [orthographyLine, constraintLabel]
    .filter((part) => part.length > 0);
  const secondaryParts = hasDependency
    ? [...metadataParts, relationLine].filter((part) => part.length > 0)
    : (varietyOrAliasLine ? [varietyOrAliasLine] : []);
  const tertiaryParts = hasDependency
    ? (varietyOrAliasLine ? [varietyOrAliasLine] : [])
    : metadataParts;
  const layerLabel = [languageLine, ...secondaryParts, ...tertiaryParts]
    .filter((part) => part.length > 0)
    .join(' · ');

  return (
    <div
      key={layer.id}
      className={[
        'transcription-side-pane-item-row',
        isActiveLayer ? 'transcription-side-pane-item-row-active' : '',
        boundaryHighlight === 'top' ? 'transcription-side-pane-item-row-boundary-highlight-top' : '',
        boundaryHighlight === 'bottom' ? 'transcription-side-pane-item-row-boundary-highlight-bottom' : '',
        bundleTargetHighlighted ? 'transcription-side-pane-item-row-bundle-target' : '',
      ].filter(Boolean).join(' ')}
    >
      {showDropIndicator && (
        <div className="transcription-side-pane-drop-indicator" />
      )}
      <button
        type="button"
        className={`transcription-side-pane-item ${isFlashLayer ? 'transcription-side-pane-item-flash' : ''} ${isDragged ? 'transcription-side-pane-item-dragging' : ''} ${isTranslationLayer ? 'transcription-side-pane-item-translation' : 'transcription-side-pane-item-transcription'} ${hasDependency ? 'transcription-side-pane-item-dependent' : ''}`}
        onClick={() => !dragState && onFocusLayer(layer.id)}
        onContextMenu={(event) => onContextMenu(event, layer.id)}
        onMouseDown={(event) => !dragState && onMouseDown(event, layer)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            onKeyboardReorder(layer.id, index, event.key === 'ArrowUp' ? 'up' : 'down');
          }
        }}
        title={layerLabel}
        aria-roledescription={messages.draggableLayerRoleDesc}
      >
        <span className="transcription-side-pane-item-drag-handle" aria-hidden="true">⠇</span>
        <span className="transcription-side-pane-item-label">
          <strong className="transcription-side-pane-item-line transcription-side-pane-item-line-primary">{languageLine}</strong>
          {secondaryParts.length > 0 && (
            <span className="transcription-side-pane-item-line transcription-side-pane-item-line-secondary">
              {secondaryParts.map((part, partIndex) => (
                <span key={`secondary-${part}-${partIndex}`} className="transcription-side-pane-item-inline-text">
                  {partIndex > 0 && (
                    <span className="transcription-side-pane-item-inline-separator" aria-hidden="true">·</span>
                  )}
                  {part}
                </span>
              ))}
            </span>
          )}
          {tertiaryParts.length > 0 && (
            <span className="transcription-side-pane-item-line transcription-side-pane-item-line-tertiary">
              {tertiaryParts.map((part, partIndex) => (
                <span key={`tertiary-${part}-${partIndex}`} className="transcription-side-pane-item-inline-text">
                  {partIndex > 0 && (
                    <span className="transcription-side-pane-item-inline-separator" aria-hidden="true">·</span>
                  )}
                  {part}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
    </div>
  );
});
