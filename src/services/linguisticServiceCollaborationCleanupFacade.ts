import {
  deleteAudioPreserveTimeline,
  deleteProjectCascade,
  removeUnitCascade,
  removeUnitsBatchCascade,
} from './LinguisticService.cleanup';
import { dispatchWorkspaceUnitUpdated } from '../utils/workspaceEvents';

export async function deleteProject(textId: string): Promise<void> {
  await deleteProjectCascade(textId);
}

export async function deleteAudio(mediaId: string): Promise<void> {
  await deleteAudioPreserveTimeline(mediaId);
}

export async function removeUnit(unitId: string): Promise<void> {
  await removeUnitCascade(unitId);
  dispatchWorkspaceUnitUpdated({ unitId });
}

export async function removeUnitsBatch(unitIds: readonly string[]): Promise<void> {
  await removeUnitsBatchCascade(unitIds);
  for (const unitId of unitIds) {
    dispatchWorkspaceUnitUpdated({ unitId });
  }
}
