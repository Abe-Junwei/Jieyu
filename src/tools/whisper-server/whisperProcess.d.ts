export function runWhisper(options: {
  audioPath: string;
  model: string;
  language: string;
  signal?: AbortSignal;
  whisperCli: string;
  threads?: number;
}): Promise<unknown>;

export function stopWhisperProcesses(): void;
