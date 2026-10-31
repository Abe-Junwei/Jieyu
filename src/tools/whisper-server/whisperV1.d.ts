import type { IncomingMessage, ServerResponse, Server } from 'node:http';
export interface WhisperServerConfig {
  model: string;
  whisperCli: string;
  modelId: string;
  modelVersion: string;
  maxAudioSec: number;
}
export function whisperV1Handler(
  config: WhisperServerConfig,
): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
export function createWhisperServer(
  config: WhisperServerConfig,
): Server & { shutdown(): Promise<void> };
export function isLocalWhisperRequest(req: IncomingMessage): boolean;
