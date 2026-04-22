export interface CanDeleteCurrentAudioInput {
  hasSelectedTimelineMedia: boolean;
  selectedMediaUrl: string | null | undefined;
}

export function hasSelectedMediaUrl(selectedMediaUrl: string | null | undefined): boolean {
  return typeof selectedMediaUrl === 'string' && selectedMediaUrl.trim().length > 0;
}

export function canDeleteCurrentAudio(input: CanDeleteCurrentAudioInput): boolean {
  return input.hasSelectedTimelineMedia && hasSelectedMediaUrl(input.selectedMediaUrl);
}
