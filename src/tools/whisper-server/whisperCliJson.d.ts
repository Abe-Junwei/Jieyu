export interface WhisperWord {
  word: string;
  start: number;
  end: number;
  probability: number;
}

export interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  avg_logprob: number;
  words: WhisperWord[];
}

export interface WhisperTranscriptionResponse {
  text: string;
  language: string | null;
  duration: number;
  segments: WhisperSegment[];
  words: WhisperWord[];
}

export function buildWhisperCliArgs(options: {
  model: string;
  language: string;
  audioPath: string;
  outputBase: string;
  threads: number;
}): string[];

export function parseWhisperCliJson(raw: string): unknown;

export function buildTranscriptionResponse(
  cliJson: unknown,
  requestedLanguage: string,
): WhisperTranscriptionResponse;
