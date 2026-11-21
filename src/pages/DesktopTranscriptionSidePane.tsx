import type { Locale } from '../i18n';
import { DesktopTranscriptionContextColumn } from './DesktopTranscriptionContextColumn';
import type { DesktopPlaybackUnit } from './useDesktopTranscriptionMediaController';
import type { useDesktopTranscriptionLayerController } from './useDesktopTranscriptionLayerController';

interface SideLayer {
  id: string;
  name: Record<string, string>;
  contentType: string;
  tierType?: string;
  parentId: string | null;
  sortOrder?: number;
  units: readonly { layerId: string; textId: string | null }[];
}

interface SideModel {
  manuscripts: readonly { id: string; title: Record<string, string> }[];
  manuscriptId: string | null;
  layerId: string | null;
  layers: readonly SideLayer[];
  links: readonly {
    layerId: string;
    hostLayerId: string;
    isPreferred: boolean;
    sortOrder: number;
    linkType?: 'direct' | 'free' | 'literal' | 'pedagogical';
  }[];
}

/** Context column for one manuscript: the layer list calls the layer controller. */
export function DesktopTranscriptionSidePane(props: {
  locale: Locale;
  model: SideModel | null;
  units: readonly DesktopPlaybackUnit[];
  durationLabel: string | null;
  speakerCount: number;
  selectedUnitId: string | null;
  actions: ReturnType<typeof useDesktopTranscriptionLayerController>;
  onOpen: (manuscriptId: string, layerId?: string) => void;
  onSelectUnit: (unitId: string) => void;
}) {
  const model = props.model;
  return (
    <DesktopTranscriptionContextColumn
      locale={props.locale}
      manuscripts={model?.manuscripts ?? []}
      manuscriptId={model?.manuscriptId ?? null}
      layerId={model?.layerId ?? null}
      layers={(model?.layers ?? []).map((layer) => ({
        id: layer.id,
        name: layer.name,
        contentType: layer.contentType,
        tierType: layer.tierType,
        parentId: layer.parentId,
        ...(layer.sortOrder === undefined ? {} : { sortOrder: layer.sortOrder }),
        // A translation layer lists its host's units; only its own units or stored texts are content.
        contentCount: layer.units.filter(
          (unit) => unit.layerId === layer.id || unit.textId !== null,
        ).length,
      }))}
      links={(model?.links ?? []).map((link) => ({
        layerId: link.layerId,
        hostLayerId: link.hostLayerId,
        isPreferred: link.isPreferred,
        sortOrder: link.sortOrder,
        ...(link.linkType === undefined ? {} : { linkType: link.linkType }),
      }))}
      layerError={props.actions.error}
      onCreateLayer={(kind, label) => props.actions.create(kind, label)}
      onCreatePair={(kind, audioName, textName) =>
        props.actions.createPair(kind, audioName, textName)
      }
      onRenameLayer={(layerId, name) => props.actions.rename(layerId, name)}
      onMoveLayer={(layerId, direction) => props.actions.move(layerId, direction)}
      onDeleteLayer={(layerId, mode, targetLayerId) =>
        props.actions.remove(layerId, mode, targetLayerId)
      }
      onPreviewHosts={(input) => props.actions.previewHosts(input)}
      onSetHosts={(input) => props.actions.setHosts(input)}
      onClearLayerError={props.actions.clearError}
      onSelectLayer={(layerId) => {
        if (model?.manuscriptId) props.onOpen(model.manuscriptId, layerId);
      }}
      units={props.units}
      durationLabel={props.durationLabel}
      speakerCount={props.speakerCount}
      selectedUnitId={props.selectedUnitId}
      onSelectManuscript={(manuscriptId) => props.onOpen(manuscriptId)}
      onSelectUnit={props.onSelectUnit}
    />
  );
}
