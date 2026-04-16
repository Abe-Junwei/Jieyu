export type AlignmentProviderKind = 'webmaus' | 'whisperx' | 'mfa' | (string & {});

export type AlignmentTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface AlignmentInterval {
  text: string;
  startTime: number;
  endTime: number;
}

export interface AlignmentTaskRequest {
  provider: AlignmentProviderKind;
  mediaId?: string;
  textId?: string;
  language?: string;
  transcriptText: string;
  unitIds?: string[];
}

export interface AlignmentTaskResult {
  provider: AlignmentProviderKind;
  taskId: string;
  status: AlignmentTaskStatus;
  words: AlignmentInterval[];
  phonemes: AlignmentInterval[];
  rawPayload?: string;
  completedAt?: string;
  errorMessage?: string;
}