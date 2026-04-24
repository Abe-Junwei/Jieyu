import { LinguisticService } from '../services/LinguisticService';

export async function getTranscriptionTextById(textId: string) {
  return LinguisticService.getTextById(textId);
}
