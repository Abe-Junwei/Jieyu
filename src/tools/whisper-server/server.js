/**
 * whisper-server — OpenAI-compatible whisper.cpp HTTP wrapper
 *
 * Exposes POST /v1/audio/transcriptions (OpenAI Audio API compatible)
 * and GET /v1/models for health checks.
 *
 * Usage:
 *   node server.js [--model <path>] [--host <addr>] [--port <port>] [--language <lang>]
 *
 * Environment variables (alternative to flags):
 *   WHISPER_MODEL   - Path to GGML model file (default: ~/.whisper-models/<modelFile from whisperModelDefaults.json>)
 *   WHISPER_PORT    - HTTP port (default: 3040)
 *   WHISPER_HOST    - Bind address (127.0.0.1 only). Non-loopback binding is rejected.
 *   WHISPER_LANG    - Default language code e.g. 'zh' (default: 'auto')
 *   WHISPER_CLI     - Path to whisper-cli binary (default: whisper-cli on PATH)
 */

import { createServer } from 'http';
import { spawn } from 'child_process';
import { unlink, writeFile } from 'fs/promises';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { buildTranscriptionResponse } from './whisperCliJson.js';
import { runWhisper } from './whisperProcess.js';
import { isLocalWhisperRequest, whisperV1Handler } from './whisperV1.js';

// ── Defaults ─────────────────────────────────────────────────────────────────

// 与浏览器端共用同一份默认配置 | Same defaults file as the browser app (src/services/stt/localWhisperDefaults.ts)
const MODEL_DEFAULTS = JSON.parse(
  readFileSync(new URL('./whisperModelDefaults.json', import.meta.url), 'utf8'),
);
const DEFAULT_MODEL = path.join(
  process.env.HOME ?? tmpdir(),
  '.whisper-models',
  MODEL_DEFAULTS.modelFile,
);
const DEFAULT_PORT = Number(new URL(MODEL_DEFAULTS.baseUrl).port) || 3040;
const DEFAULT_LANG = 'auto';

// ── CLI args ──────────────────────────────────────────────────────────────────

const cliArgs = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? true];
  })
);

const CONFIG = {
  model: cliArgs.model ?? process.env.WHISPER_MODEL ?? DEFAULT_MODEL,
  host: cliArgs.host ?? process.env.WHISPER_HOST ?? '127.0.0.1',
  port: parseInt(cliArgs.port ?? process.env.WHISPER_PORT ?? String(DEFAULT_PORT), 10),
  defaultLang: cliArgs.language ?? process.env.WHISPER_LANG ?? DEFAULT_LANG,
  whisperCli: cliArgs['whisper-cli'] ?? process.env.WHISPER_CLI ?? '/opt/homebrew/bin/whisper-cli',
  threads: parseInt(cliArgs.threads ?? '4', 10),
  maxBodyBytes: parseInt(cliArgs['max-body-bytes'] ?? process.env.WHISPER_MAX_BODY_BYTES ?? String(25 * 1024 * 1024), 10),
};

function logInfo(...args) {
  process.stdout.write(`${args.map((item) => String(item)).join(' ')}\n`);
}

function logError(...args) {
  process.stderr.write(`${args.map((item) => String(item)).join(' ')}\n`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Split a buffer by a delimiter byte sequence.
 * Returns an array of buffers (delimiter not included).
 */
function bufferSplit(buffer, delimiter) {
  const parts = [];
  let start = 0;
  for (let i = 0; i <= buffer.length - delimiter.length; i++) {
    let match = true;
    for (let j = 0; j < delimiter.length; j++) {
      if (buffer[i + j] !== delimiter[j]) { match = false; break; }
    }
    if (match) {
      parts.push(buffer.slice(start, i));
      start = i + delimiter.length;
      i += delimiter.length - 1;
    }
  }
  parts.push(buffer.slice(start));
  return parts;
}

/**
 * Trim CR/LF/SP/TAB bytes from both ends of a buffer.
 */
function bufferTrim(buf) {
  let start = 0, end = buf.length;
  while (start < end && (buf[start] === 13 || buf[start] === 10 || buf[start] === 32 || buf[start] === 9)) start++;
  while (end > start && (buf[end - 1] === 13 || buf[end - 1] === 10 || buf[end - 1] === 32 || buf[end - 1] === 9)) end--;
  return buf.slice(start, end);
}

/**
 * Find first index of byte sequence in a Buffer.
 */
function indexOfSeq(buf, seq) {
  outer:
  for (let i = 0; i <= buf.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (buf[i + j] !== seq[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Parse multipart/form-data body (ASCII headers + binary body).
 * Returns { fields: Record<string,string>, files: Record<string,{filename:string,buffer:Buffer}> }
 */
function parseMultipart(buffer, boundary) {
  const fields = {};
  const files = {};
  const delim = Buffer.from(`--${boundary}`, 'ascii');
  const crlf4 = Buffer.from([13, 10, 13, 10]);
  const parts = bufferSplit(buffer, delim);
  for (const rawPart of parts) {
    const part = bufferTrim(rawPart);
    if (!part.length) continue;
    const headerEnd = indexOfSeq(part, crlf4);
    if (headerEnd < 0) continue;
    const headerBlock = part.slice(0, headerEnd).toString('utf8');
    const body = part.slice(headerEnd + 4);
    const nameMatch = headerBlock.match(/name="([^"]+)"/);
    const filenameMatch = headerBlock.match(/filename="([^"]+)"/);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];
    if (filenameMatch) {
      files[fieldName] = { filename: filenameMatch[1], buffer: body };
    } else {
      fields[fieldName] = body.toString('utf8').trim();
    }
  }
  return { fields, files };
}

/**
 * Convert audio buffer to wav using ffmpeg.
 * whisper-cli supports: flac, mp3, ogg, wav
 * MediaRecorder produces: audio/webm
 */
async function convertToWav(inputBuffer) {
  const id = randomUUID();
  const tmpIn = path.join(tmpdir(), `whisper-in-${id}.bin`);
  const tmpOut = path.join(tmpdir(), `whisper-out-${id}.wav`);
  await writeFile(tmpIn, inputBuffer);
  try {
    // Use full paths for launchd compatibility
    const ffmpegPath = process.env.FFMPEG_PATH ?? '/opt/homebrew/bin/ffmpeg';
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-y', '-i', tmpIn,
        '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
        tmpOut,
      ], { timeout: 30000 });
      proc.on('close', (code) => (code === 0 ? resolve : reject)(new Error(`ffmpeg exited ${code}`)));
      proc.on('error', reject);
    });
    return tmpOut;
  } catch (error) {
    await unlink(tmpOut).catch(() => {});
    throw error;
  } finally {
    await unlink(tmpIn).catch(() => {});
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

const v1 = whisperV1Handler({ model: CONFIG.model, whisperCli: CONFIG.whisperCli,
  modelId: 'app.jieyu.whisper.local', modelVersion: '1', maxAudioSec: 30 });

async function handleRequest(req, res) {
  if (req.url === '/health' || req.url === '/transcribe') return v1(req, res);
  if (!isLocalWhisperRequest(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Forbidden host' } }));
    return;
  }
  const { pathname } = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

  // CORS preflight
  if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health check
  if (req.method === 'GET' && (pathname === '/health' || pathname === '/v1/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'whisper-local', object: 'model' }] }));
    return;
  }

  // OpenAI-compatible transcription endpoint
  if (req.method === 'POST' && pathname === '/v1/audio/transcriptions') {
    const abortController = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abortController.abort(); });

    try {
      const chunks = [];
      let totalBytes = 0;
      for await (const chunk of req) {
        totalBytes += chunk.length;
        if (totalBytes > CONFIG.maxBodyBytes) {
          req.resume();
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: {
              message: `Request body too large (max ${CONFIG.maxBodyBytes} bytes)`,
              type: 'invalid_request_error',
            },
          }));
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);

      const ct = req.headers['content-type'] ?? '';
      let fields = {};
      let files = {};

      if (ct.includes('multipart/form-data')) {
        const boundary = ct.split('boundary=')[1] ?? '';
        ({ fields, files } = parseMultipart(body, boundary));
      } else if (ct.includes('application/json')) {
        const json = JSON.parse(body.toString('utf8'));
        fields = json;
      }

      if (fields.model && fields.model !== path.basename(CONFIG.model) && fields.model !== 'whisper-local') {
        res.writeHead(400); res.end(JSON.stringify({ error: { message: 'Unknown model' } })); return;
      }
      const modelPath = CONFIG.model;

      const language = fields.language ?? CONFIG.defaultLang;
      const audioBuffer = files.file?.buffer ?? Buffer.from(fields.file ?? '', 'base64');

      if (!audioBuffer || audioBuffer.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'No audio data provided', type: 'invalid_request_error' } }));
        return;
      }

      // Check model exists
      if (!existsSync(modelPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `Model not found: ${modelPath}`, type: 'invalid_request_error' } }));
        return;
      }

      // Convert to wav if needed (webm from MediaRecorder)
      const tmpWav = await convertToWav(audioBuffer);

      let cliJson;
      try {
        cliJson = await runWhisper({
          audioPath: tmpWav, model: modelPath, language,
          signal: abortController.signal, whisperCli: CONFIG.whisperCli, threads: CONFIG.threads,
        });
      } finally {
        await unlink(tmpWav).catch(() => {});
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      // verbose_json 风格：text + language（向后兼容）+ segments/words（秒）| text + language (back-compat) + segments/words (seconds)
      res.end(JSON.stringify(buildTranscriptionResponse(cliJson, language)));
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('SIGTERM')) {
        res.writeHead(499, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Request cancelled', type: 'aborted' } }));
        return;
      }
      logError('[whisper-server] transcription error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: err.message, type: 'internal_error' } }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

// Validate model
if (!existsSync(CONFIG.model)) {
  logError(`[whisper-server] Model not found: ${CONFIG.model}`);
  logError('  Download a model from: https://huggingface.co/ggerganov/whisper.cpp/tree/main');
  process.exit(1);
}

const server = createServer(handleRequest);
if (CONFIG.host !== '127.0.0.1') throw new Error('whisper-server requires loopback binding');
server.listen(CONFIG.port, '127.0.0.1', () => {
  logInfo(`[whisper-server] listening on http://${CONFIG.host}:${server.address().port}`);
  logInfo(`[whisper-server] model: ${CONFIG.model}`);
  logInfo(`[whisper-server] default language: ${CONFIG.defaultLang}`);
  logInfo('[whisper-server] endpoints:');
  logInfo('  POST /v1/audio/transcriptions  (OpenAI-compatible)');
  logInfo('  GET  /v1/models                (health check)');
});

server.on('error', (err) => {
  logError('[whisper-server] server error:', err.message);
  process.exit(1);
});
