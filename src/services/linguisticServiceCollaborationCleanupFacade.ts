import {
  deleteAudioPreserveTimeline,
  deleteProjectCascade,
  removeUnitCascade,
  removeUnitsBatchCascade,
} from './LinguisticService.cleanup';

export async function deleteProject(textId: string): Promise<void> {
  await deleteProjectCascade(textId);
}

export async function deleteAudio(mediaId: string): Promise<void> {
  await deleteAudioPreserveTimeline(mediaId);
}

export async function removeUnit(unitId: string): Promise<void> {
  await removeUnitCascade(unitId);
}

export async function removeUnitsBatch(unitIds: readonly string[]): Promise<void> {
  await removeUnitsBatchCascade(unitIds);
}
