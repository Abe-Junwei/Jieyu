import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isAllowedHostHeader } from './hostGuard.js';
import { runWhisper } from './whisperProcess.js';
import { buildTranscriptionResponse } from './whisperCliJson.js';
import { pcmWav } from '../../desktop/transcriptionAudio.js';

export function isLocalWhisperRequest(req) {
  const address = req.socket.remoteAddress;
  if (!(address === '::1' || /^127\./.test(address ?? '') || /^::ffff:127\./.test(address ?? '')))
    return false;
  if (!isAllowedHostHeader(req.headers.host)) return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === origin &&
      isAllowedHostHeader(url.host)
    );
  } catch {
    return false;
  }
}

export function whisperV1Handler(config) {
  let busy = false;
  return async (req, res) => {
    const send = (status, body) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    let requestId = '';
    const fail = (status, code) =>
      send(status, { jieyu: '1', requestId, status: 'error', error: { code, message: code } });
    if (!isLocalWhisperRequest(req)) return fail(403, 'unauthorized');
    if (req.method === 'GET' && req.url === '/health')
      return send(200, {
        jieyu: '1',
        status: 'ok',
        model: { id: config.modelId, version: config.modelVersion },
      });
    if (req.method !== 'POST' || req.url !== '/transcribe') return fail(404, 'bad_request');
    if (busy) return fail(429, 'internal');
    busy = true;
    const controller = new AbortController();
    const abort = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once('close', abort);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 120_000);
    let dir;
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 8 * 1024 * 1024) {
          req.resume();
          return fail(413, 'too_long');
        }
        chunks.push(chunk);
      }
      const type = req.headers['content-type'];
      if (typeof type !== 'string' || !type.startsWith('multipart/form-data;'))
        return fail(400, 'bad_request');
      let form, input;
      try {
        form = await new Response(Buffer.concat(chunks), {
          headers: { 'Content-Type': type },
        }).formData();
        input = JSON.parse(String(form.get('request')));
      } catch {
        return fail(400, 'bad_request');
      }
      if (
        !input ||
        typeof input.requestId !== 'string' ||
        !/^[\w:.-]{1,200}$/.test(input.requestId)
      )
        return fail(400, 'bad_request');
      requestId = input.requestId;
      if (input.jieyu !== '1' || input.capability !== 'transcribe')
        return fail(400, 'unsupported_capability');
      const range = input.range;
      if (
        !range ||
        !Number.isFinite(range.start) ||
        !Number.isFinite(range.end) ||
        range.start < 0 ||
        range.end <= range.start
      )
        return fail(400, 'bad_request');
      if (range.end - range.start > config.maxAudioSec) return fail(413, 'too_long');
      const language = input.params?.language ?? 'auto';
      if (typeof language !== 'string' || (!/^[a-z]{2,3}$/.test(language) && language !== 'auto'))
        return fail(422, 'unsupported_language');
      const blob = form.get('audio');
      if (!(blob instanceof Blob)) return fail(422, 'bad_audio');
      const bytes = Buffer.from(await blob.arrayBuffer());
      let wav;
      try {
        wav = pcmWav(bytes);
      } catch {
        return fail(422, 'bad_audio');
      }
      if (
        wav.sampleRate !== 16000 ||
        wav.channels !== 1 ||
        Math.abs(wav.duration - (range.end - range.start)) > 1 / 16000
      )
        return fail(422, 'bad_audio');
      controller.signal.throwIfAborted();
      dir = await mkdtemp(path.join(tmpdir(), 'jieyu-whisper-input-'));
      const audioPath = path.join(dir, 'audio.wav');
      await writeFile(audioPath, bytes);
      const raw = await runWhisper({
        audioPath,
        model: config.model,
        language,
        signal: controller.signal,
        whisperCli: config.whisperCli,
      });
      if (!Array.isArray(raw?.transcription)) return fail(500, 'internal');
      const parsed = buildTranscriptionResponse(raw, language);
      const segments = parsed.segments
        .filter((row) => row.text.trim() !== '')
        .map((row) => ({
          start: row.start + range.start,
          end: row.end + range.start,
          text: row.text,
        }));
      if (
        segments.length > 10_000 ||
        segments.some(
          (row) =>
            !Number.isFinite(row.start) ||
            !Number.isFinite(row.end) ||
            row.start < range.start ||
            row.end > range.end ||
            row.end < row.start,
        )
      )
        return fail(500, 'internal');
      const body = {
        jieyu: '1',
        requestId,
        status: 'ok',
        model: { id: config.modelId, version: config.modelVersion },
        result: { segments },
        warnings: [],
      };
      if (Buffer.byteLength(JSON.stringify(body)) > 8 * 1024 * 1024) return fail(500, 'internal');
      send(200, body);
    } catch {
      fail(
        timedOut ? 504 : controller.signal.aborted ? 499 : 500,
        timedOut ? 'timeout' : controller.signal.aborted ? 'cancelled' : 'internal',
      );
    } finally {
      clearTimeout(timeout);
      res.removeListener('close', abort);
      if (dir !== undefined) await rm(dir, { recursive: true, force: true });
      busy = false;
    }
  };
}

export function createWhisperServer(config) {
  const handle = whisperV1Handler(config);
  const pending = new Set();
  const server = createServer((req, res) => {
    const task = handle(req, res);
    pending.add(task);
    void task.finally(() => pending.delete(task)).catch(() => res.destroy());
  });
  server.shutdown = async () => {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closed;
    await Promise.allSettled([...pending]);
  };
  return server;
}
