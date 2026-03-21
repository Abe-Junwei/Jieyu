/**
 * whisper-server — OpenAI-compatible whisper.cpp HTTP wrapper
 *
 * Exposes POST /v1/audio/transcriptions (OpenAI Audio API compatible)
 * and GET /v1/models for health checks.
 *
 * Usage:
 *   node server.js [--model <path>] [--port <port>] [--language <lang>]
 *
 * Environment variables (alternative to flags):
 *   WHISPER_MODEL   - Path to GGML model file (default: ~/.whisper-models/ggml-base.bin)
 *   WHISPER_PORT    - HTTP port (default: 3040)
 *   WHISPER_LANG    - Default language code e.g. 'zh' (default: 'auto')
 *   WHISPER_CLI     - Path to whisper-cli binary (default: whisper-cli on PATH)
 */

import { createServer } from 'http';
import { spawn } from 'child_process';
import { readFile, unlink, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { basename } from 'path';

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = path.join(
  process.env.HOME ?? tmpdir(),
  '.whisper-models',
  'ggml-small-q5_k.bin'
);
const DEFAULT_PORT = 3040;
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
  port: parseInt(cliArgs.port ?? process.env.WHISPER_PORT ?? String(DEFAULT_PORT), 10),
  defaultLang: cliArgs.language ?? process.env.WHISPER_LANG ?? DEFAULT_LANG,
  whisperCli: cliArgs['whisper-cli'] ?? process.env.WHISPER_CLI ?? '/opt/homebrew/bin/whisper-cli',
  threads: parseInt(cliArgs.threads ?? '4', 10),
};

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
 * Spawn whisper-cli and return the transcription text.
 */
function runWhisper({ audioPath, model, language, signal }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-m', model,
      '-l', language,
      '-f', audioPath,
      '-otxt',     // plain text output
      '-np',       // no prints except result
      '-t', String(CONFIG.threads),
    ];
    if (language !== 'auto') args.push('--language', language);

    const proc = spawn(CONFIG.whisperCli, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    signal?.addEventListener('abort', () => proc.kill('SIGTERM'));

    proc.on('close', (code) => {
      if (code !== 0 && !stdout) {
        return reject(new Error(`whisper-cli exited ${code}: ${stderr}`));
      }
      // whisper-cli v1.8 outputs VTT-formatted text lines:
      //   [00:00:00.000 --> 00:00:00.500]  播放
      // Strip VTT/WebVTT timestamp brackets from each line.
      const trimmed = stdout.trim();
      const vttPattern = /^\[[\d:.,\->\s]+\]\s*/;
      const text = trimmed
        .split('\n')
        .map((line) => line.replace(vttPattern, '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      resolve(text || trimmed);
    });
    proc.on('error', reject);
  });
}

/**
 * Convert audio buffer to wav using ffmpeg.
 * whisper-cli supports: flac, mp3, ogg, wav
 * MediaRecorder produces: audio/webm
 */
async function convertToWav(inputBuffer, inputMimeType) {
  const ext = inputMimeType.includes('webm') ? 'webm' : inputMimeType.split('/')[1] ?? 'webm';
  const tmpIn = path.join(tmpdir(), `whisper-in-${Date.now()}.${ext}`);
  const tmpOut = path.join(tmpdir(), `whisper-out-${Date.now()}.wav`);
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
  } finally {
    await unlink(tmpIn).catch(() => {});
  }
}

/**
 * OpenAI /v1/audio/transcriptions response shape.
 */
function buildResponse(text, language) {
  return {
    text,
    language: language !== 'auto' ? language : null,
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const { pathname } = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
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
    req.on('close', () => { if (!res.writableEnded) abortController.abort(); });

    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
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

      const modelPath = fields.model
        ? path.join(path.dirname(CONFIG.model), fields.model)
        : CONFIG.model;

      const language = fields.language ?? CONFIG.defaultLang;
      const audioBuffer = files.file?.buffer ?? Buffer.from(fields.file ?? '', 'base64');
      const inputMime = files.file?.filename ?? 'audio/webm';

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
      const tmpWav = await convertToWav(audioBuffer, inputMime);

      const text = await runWhisper({
        audioPath: tmpWav,
        model: modelPath,
        language,
        signal: abortController.signal,
      });

      await unlink(tmpWav).catch(() => {});

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buildResponse(text, language)));
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('SIGTERM')) {
        res.writeHead(499, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Request cancelled', type: 'aborted' } }));
        return;
      }
      console.error('[whisper-server] transcription error:', err.message);
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
  console.error(`[whisper-server] Model not found: ${CONFIG.model}`);
  console.error(`  Download a model from: https://huggingface.co/ggerganov/whisper.cpp/tree/main`);
  process.exit(1);
}

const server = createServer(handleRequest);
server.listen(CONFIG.port, () => {
  console.log(`[whisper-server] listening on http://localhost:${CONFIG.port}`);
  console.log(`[whisper-server] model: ${CONFIG.model}`);
  console.log(`[whisper-server] default language: ${CONFIG.defaultLang}`);
  console.log(`[whisper-server] endpoints:`);
  console.log(`  POST /v1/audio/transcriptions  (OpenAI-compatible)`);
  console.log(`  GET  /v1/models                (health check)`);
});

server.on('error', (err) => {
  console.error('[whisper-server] server error:', err.message);
  process.exit(1);
});
