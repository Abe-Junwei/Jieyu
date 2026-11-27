import { useMemo, useRef } from 'react';
import { featureFlags } from '../ai/config/featureFlags';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import type { Locale } from '../i18n';
import { DesktopTranscriptionSidePane } from './DesktopTranscriptionSidePane';
import type { LayerListRequest } from './DesktopTranscriptionLayerList';
import { formatManuscriptDuration } from './DesktopTranscriptionWorkspaceControls';
import {
  clearSpeakerFilter,
  speakerFilterRevision,
  toggleSpeakerFilterId,
  toggleUnassignedFilter,
  type SpeakerFilterState,
} from './desktopTranscriptionSpeakerFilter';
import type { DesktopPlaybackUnit } from './useDesktopTranscriptionMediaController';

type SideOpen = (manuscriptId: string, layerId?: string) => void;

/** Side pane content registration for the desktop transcription workspace. */
export function DesktopTranscriptionWorkspaceSidePaneMount(props: {
  locale: Locale;
  hasAudio: boolean;
  playbackDuration: number;
  speakerCount: number;
  units: readonly DesktopPlaybackUnit[];
  sourceUnits: readonly { speakerId?: string | null }[];
  readModel: React.ComponentProps<typeof DesktopTranscriptionSidePane>['model'];
  selectedUnitId: string | null;
  layerActions: React.ComponentProps<typeof DesktopTranscriptionSidePane>['actions'];
  layerRequest: LayerListRequest | null;
  speakers: NonNullable<React.ComponentProps<typeof DesktopTranscriptionSidePane>['speakers']>;
  speakerFilter: SpeakerFilterState;
  setSpeakerFilter: (
    value: SpeakerFilterState | ((state: SpeakerFilterState) => SpeakerFilterState),
  ) => void;
  setCreateAssignName: (name: string) => void;
  setCreateAssignRevision: (revision: string) => void;
  setCreateAssignOpen: (open: boolean) => void;
  onRetimeAsk: () => void;
  leaveThen: (go: () => void) => void;
  onOpenManuscript: SideOpen;
  selectPlaybackUnit: (unit: DesktopPlaybackUnit) => void;
}) {
  const {
    locale,
    hasAudio,
    playbackDuration,
    speakerCount,
    units,
    sourceUnits,
    readModel,
    selectedUnitId,
    layerActions,
    layerRequest,
    speakers,
    speakerFilter,
    setSpeakerFilter,
    setCreateAssignName,
    setCreateAssignRevision,
    setCreateAssignOpen,
  } = props;
  const selectRef = useRef(props.selectPlaybackUnit);
  selectRef.current = props.selectPlaybackUnit;
  const openRef = useRef(props.onOpenManuscript);
  openRef.current = props.onOpenManuscript;
  const leaveRef = useRef(props.leaveThen);
  leaveRef.current = props.leaveThen;
  const retimeRef = useRef(props.onRetimeAsk);
  retimeRef.current = props.onRetimeAsk;

  const manuscriptList = useMemo(
    () => (
      <DesktopTranscriptionSidePane
        locale={locale}
        model={readModel}
        units={units}
        durationLabel={
          hasAudio && playbackDuration > 0 ? formatManuscriptDuration(playbackDuration) : null
        }
        speakerCount={speakerCount}
        selectedUnitId={selectedUnitId}
        actions={layerActions}
        layerRequest={layerRequest}
        speakers={speakers}
        speakerUnits={sourceUnits}
        speakerFilter={speakerFilter}
        onToggleSpeakerFilter={(speakerId) =>
          setSpeakerFilter((state) => toggleSpeakerFilterId(state, speakerId))
        }
        onToggleUnassignedFilter={() => setSpeakerFilter((state) => toggleUnassignedFilter(state))}
        onClearSpeakerFilter={() => setSpeakerFilter(clearSpeakerFilter())}
        onCreateAndAssignSpeaker={() => {
          setCreateAssignName('');
          setCreateAssignRevision(speakerFilterRevision(speakerFilter));
          setCreateAssignOpen(true);
        }}
        {...(featureFlags.desktopTranscriptionBatchEditingEnabled
          ? { onRetimeManuscript: () => retimeRef.current() }
          : {})}
        onOpen={(manuscriptId, layerId) =>
          leaveRef.current(() => openRef.current(manuscriptId, layerId))
        }
        onSelectUnit={(unitId) => {
          const unit = units.find((item) => item.id === unitId);
          if (unit) selectRef.current(unit);
        }}
      />
    ),
    [
      hasAudio,
      layerActions,
      layerRequest,
      locale,
      playbackDuration,
      readModel,
      selectedUnitId,
      setCreateAssignName,
      setCreateAssignOpen,
      setCreateAssignRevision,
      setSpeakerFilter,
      sourceUnits,
      speakerCount,
      speakerFilter,
      speakers,
      units,
    ],
  );

  useRegisterAppSidePane({
    subtitle: '',
    content: manuscriptList,
    enabled: hasAudio || units.length > 0,
  });

  return null;
}
