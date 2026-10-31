import { createServer, type Server, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callDesktopSession } from '../db/desktop/desktopCall';
import { openDesktopSession, resetDesktopSessions } from '../db/desktop/projectSession';
import { grantTranscriptionModel } from '../desktop/projectTranscription';
const roots: string[] = [];
const servers: Server[] = [];
export async function disposeModelFixtures() {
  resetDesktopSessions();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
}
function wav() {
  const b = Buffer.alloc(44 + 8000 * 2 * 2);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(b.length - 44, 40);
  return b;
}
export async function seed(
  reply?: (
    request: { requestId: string; range: { start: number; end: number } },
    response: ServerResponse,
  ) => void,
) {
  const dir = mkdtempSync(join(tmpdir(), 'jieyu-model-flow-'));
  roots.push(dir);
  const bytes = wav();
  writeFileSync(join(dir, 'clip.wav'), bytes);
  const { sessionId } = openDesktopSession(dir, [dir]);
  const media = callDesktopSession(sessionId, 'media.create', {
    relpath: 'clip.wav',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    duration: 2,
  }) as { id: string };
  const ms = callDesktopSession(sessionId, 'manuscripts.create', {
    title: { und: 'Clip' },
    mediaId: media.id,
  }) as { id: string };
  const layer = callDesktopSession(sessionId, 'layers.create', {
    manuscriptId: ms.id,
    key: 'tx',
    name: { und: 'Transcript' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.end(
        JSON.stringify({
          jieyu: '1',
          status: 'ok',
          model: { id: 'org.example.mock', version: '1' },
        }),
      );
      return;
    }
    const chunks: Buffer[] = [];
    for await (const b of req) chunks.push(Buffer.from(b));
    const form = await new Response(Buffer.concat(chunks), {
      headers: { 'Content-Type': req.headers['content-type']! },
    }).formData();
    const request = JSON.parse(String(form.get('request')));
    if (reply) {
      reply(request, res);
      return;
    }
    res.end(
      JSON.stringify({
        jieyu: '1',
        requestId: request.requestId,
        status: 'ok',
        model: { id: 'org.example.mock', version: '1' },
        result: { segments: [{ start: 0, end: request.range.end, text: 'mock candidate' }] },
      }),
    );
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (address === null || typeof address === 'string') throw Error('port');
  const file = join(dir, 'jieyu-model.json');
  writeFileSync(
    file,
    JSON.stringify({
      id: 'org.example.mock',
      name: 'Mock',
      version: '1',
      minJieyuProtocol: '1',
      license: 'MIT',
      capabilities: { transcribe: { wordTimestamps: false, maxAudioSec: 1 } },
      audio: { accept: [{ format: 'wav-pcm16', sampleRate: 8000, channels: 1 }] },
      transport: {
        kind: 'http',
        baseUrl: `http://127.0.0.1:${address.port}`,
        timeoutSecPerChunk: 1,
      },
    }),
  );
  return {
    dir,
    sessionId,
    manuscriptId: ms.id,
    layerId: layer.id,
    model: grantTranscriptionModel(sessionId, file),
  };
}
