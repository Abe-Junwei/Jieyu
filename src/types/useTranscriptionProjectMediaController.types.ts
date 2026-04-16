import type { LayerDocType, MediaItemDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import type { Locale } from '../i18n';
import type { SearchableItem } from '../utils/searchReplaceUtils';

export interface UseTranscriptionProjectMediaControllerInput {
  activeTextId: string | null;
  getActiveTextId: () => Promise<string | null>;
  setActiveTextId: (id: string | null) => void;
  setShowAudioImport: (visible: boolean) => void;
  addMediaItem: (item: MediaItemDocType) => void;
  setSaveState: (state: SaveState) => void;
  selectedMediaUrl: string | null;
  selectedTimelineMedia: MediaItemDocType | null;
  unitsOnCurrentMedia: LayerUnitDocType[];
  createUnitFromSelectionRouted: (start: number, end: number) => Promise<void>;
  loadSnapshot: () => Promise<void>;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  locale: Locale;
  tfB: (key: string, opts?: Record<string, unknown>) => string;
  transcriptionLayers: Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>;
  translationLayers: Array<Pick<LayerDocType, 'id' | 'languageId' | 'orthographyId'>>;
  translationTextByLayer: ReadonlyMap<string, Map<string, LayerUnitContentDocType>>;
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
}

export interface UseTranscriptionProjectMediaControllerResult {
  mediaFileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  handleDirectMediaImport: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  audioDeleteConfirm: { filename: string } | null;
  projectDeleteConfirm: boolean;
  autoSegmentBusy: boolean;
  handleAutoSegment: () => void;
  handleDeleteCurrentAudio: () => void;
  handleConfirmAudioDelete: () => void;
  handleDeleteCurrentProject: () => void;
  handleConfirmProjectDelete: () => void;
  handleProjectSetupSubmit: (input: { primaryTitle: string; englishFallbackTitle: string; primaryLanguageId: string; primaryOrthographyId?: string }) => Promise<void>;
  handleAudioImport: (file: File, duration: number) => Promise<void>;
  searchableItems: SearchableItem[];
  setAudioDeleteConfirm: React.Dispatch<React.SetStateAction<{ filename: string } | null>>;
  setProjectDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
}