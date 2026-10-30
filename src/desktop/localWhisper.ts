import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { access, copyFile, mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stopWhisperProcesses } from '../tools/whisper-server/whisperProcess.js';
import { createWhisperServer } from '../tools/whisper-server/whisperV1.js';
import models from '../tools/whisper-server/desktopWhisperModels.json';
import { requireDesktopSession } from '../db/desktop/projectSession';
import { grantTranscriptionModel } from './projectTranscription';
import type { TranscriptionModel } from './transcriptionTypes';

let generation = 0;
const closingServices = new Set<Promise<void>>();
let active: { close: () => Promise<void> } | undefined;

export function stopLocalWhisper(): Promise<void> {
  generation += 1;
  stopWhisperProcesses();
  void active?.close();
  active = undefined;
  return Promise.all([...closingServices]).then(() => {});
}

/** Native chooser + main-configured executable only; use a private verified weight snapshot. */
export async function startLocalWhisper(
  sessionId: string,
  model: string,
  whisperCli: string,
): Promise<TranscriptionModel> {
  requireDesktopSession(sessionId);
  const ticket = generation;
  await access(whisperCli, constants.X_OK);
  const info = await stat(model);
  if (!info.isFile() || !models.some((row) => row.sizeBytes === info.size))
    throw new Error('unsupported whisper model');
  const dir = await mkdtemp(join(tmpdir(), 'jieyu-local-whisper-'));
  let server: ReturnType<typeof createWhisperServer> | undefined;
  let closing: Promise<void> | undefined;
  const close = () => {
    if (closing !== undefined) return closing;
    const task = (async () => {
      await server?.shutdown();
      await rm(dir, { recursive: true, force: true });
    })().catch(() => {});
    closing = task;
    closingServices.add(task);
    void task.then(() => closingServices.delete(task));
    return task;
  };
  try {
    const snapshot = join(dir, 'model.bin');
    await copyFile(model, snapshot, constants.COPYFILE_FICLONE);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(snapshot)) hash.update(chunk);
    const sha256 = hash.digest('hex');
    const selected = models.find((row) => row.sha256 === sha256);
    if (selected === undefined) throw new Error('whisper model checksum mismatch');
    requireDesktopSession(sessionId);
    if (ticket !== generation) throw new Error('model selection expired');
    const modelId = `app.jieyu.whisper.${selected.name}`;
    const version = `1.0.0+${sha256}`;
    server = createWhisperServer({
      model: snapshot,
      whisperCli,
      modelId,
      modelVersion: version,
      maxAudioSec: 30,
    });
    const listening = server;
    await new Promise<void>((resolve, reject) => {
      listening.once('error', reject);
      listening.listen(0, '127.0.0.1', resolve);
    });
    requireDesktopSession(sessionId);
    if (ticket !== generation) throw new Error('model selection expired');
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('whisper service unavailable');
    const declaration = join(dir, 'jieyu-model.json');
    await writeFile(
      declaration,
      JSON.stringify({
        jieyu: '1',
        name: `Whisper ${selected.name}`,
        id: modelId,
        version,
        minJieyuProtocol: '1',
        license: selected.license,
        weightsSha256: sha256,
        capabilities: { transcribe: { wordTimestamps: false, maxAudioSec: 30 } },
        audio: { accept: [{ format: 'wav-pcm16', sampleRate: 16000, channels: 1 }] },
        transport: {
          kind: 'http',
          baseUrl: `http://127.0.0.1:${address.port}`,
          timeoutSecPerChunk: 120,
        },
      }),
    );
    requireDesktopSession(sessionId);
    if (ticket !== generation) throw new Error('model selection expired');
    const grant = grantTranscriptionModel(sessionId, declaration);
    void active?.close();
    generation += 1;
    active = { close };
    return grant;
  } catch (error) {
    await close();
    throw error;
  }
}
