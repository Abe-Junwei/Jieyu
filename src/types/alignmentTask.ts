type AlignmentProviderKind = 'webmaus' | 'whisperx' | 'mfa' | (string & {});

type AlignmentTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface AlignmentInterval {
  text: string;
  startTime: number;
  endTime: number;
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