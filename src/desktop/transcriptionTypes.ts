import type { PreviewCandidate } from '../db/desktop/modelRuns';
export interface TranscriptionModel {
  id: string;
  modelId: string;
  version: string;
  maxAudioSec: number;
}
export interface ProjectTranscriptionInput {
  modelId: string;
  manuscriptId: string;
  layerId: string;
  start: number;
  end: number;
  requestId: string;
}
export interface ModelCandidate extends PreviewCandidate {
  text: string;
}
export interface ProjectTranscriptionResult {
  runId: string;
  status: 'ok' | 'error' | 'cancelled' | 'interrupted';
  code?: string;
  warnings: string[];
  timeMappingRevision: number;
  candidates: ModelCandidate[];
}
