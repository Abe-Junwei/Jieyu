import { lookup } from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_SEGMENTS = 10_000;
const DEFAULT_TIMEOUT_SEC = 120;

const SERVER_CODES = [
  'bad_request',
  'unauthorized',
  'unsupported_capability',
  'unsupported_language',
  'bad_audio',
  'too_long',
  'timeout',
  'cancelled',
  'internal',
] as const;

export type ModelErrorCode = (typeof SERVER_CODES)[number] | 'bad_response' | 'unreachable';

export interface ModelCallResult {
  status: 'ok' | 'error';
  code?: ModelErrorCode;
  warnings: string[];
  segments?: { start: number; end: number; text: string }[];
}

interface ModelDeclaration {
  id: string;
  version: string;
  license: string;
  maxAudioSec: number;
  timeoutSec: number;
  baseUrl: string;
  accept: { format: string; sampleRate: number; channels: number }[];
}

interface CallInput {
  declarationPath: string;
  audio: Uint8Array;
  format: string;
  sampleRate: number;
  channels: number;
  range: { start: number; end: number };
  requestId: string;
  token?: string;
  language?: string;
}

const calls = new Map<string, AbortController>();

export function cancelModelTranscribe(requestId: string): void {
  calls.get(requestId)?.abort();
}

export function runModelTranscribe(input: unknown): Promise<ModelCallResult> {
  const requestId = requestIdOf(input);
  const controller = new AbortController();
  if (requestId.length > 0) calls.set(requestId, controller);
  return transcribeModel(input, controller.signal).finally(() => {
    if (requestId.length > 0) calls.delete(requestId);
  });
}

export function planAudioChunks(
  start: number,
  end: number,
  maxAudioSec: number,
): { start: number; end: number }[] {
  if (!(maxAudioSec > 0) || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error('model range is invalid');
  }
  if (end === start) return [{ start, end }];
  const chunks: { start: number; end: number }[] = [];
  let cursor = start;
  while (cursor < end) {
    const next = Math.min(end, cursor + maxAudioSec);
    chunks.push({ start: cursor, end: next });
    cursor = next;
  }
  return chunks;
}

export async function transcribeModel(
  input: unknown,
  signal?: AbortSignal,
): Promise<ModelCallResult> {
  const call = readCall(input);
  if (call === null) return { status: 'error', code: 'bad_request', warnings: [] };
  let declaration: ModelDeclaration;
  try {
    declaration = readDeclaration(readFileSync(call.declarationPath, 'utf8'));
  } catch (error) {
    if (error instanceof Error && error.message === 'model declaration is invalid') {
      return { status: 'error', code: 'bad_request', warnings: [] };
    }
    throw error;
  }
  const warnings = declarationWarnings(declaration, call.token);
  if (!acceptedAudio(declaration, call)) {
    return { status: 'error', code: 'bad_request', warnings };
  }
  if (call.range.end - call.range.start > declaration.maxAudioSec) {
    return { status: 'error', code: 'too_long', warnings };
  }
  let base: URL;
  try {
    base = await assertLoopbackUrl(declaration.baseUrl);
  } catch (error) {
    if (error instanceof Error && error.message === 'model address is remote') throw error;
    return { status: 'error', code: 'unreachable', warnings };
  }
  const timeout = AbortSignal.timeout(declaration.timeoutSec * 1000);
  const stop = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  try {
    const health = await fetch(new URL('/health', base), { signal: stop, redirect: 'error' });
    const healthText = await readCappedBody(health, MAX_BODY_BYTES);
    if (!health.ok || healthText === 'too_large' || !healthOk(healthText, declaration)) {
      return { status: 'error', code: 'bad_response', warnings };
    }
    const copy = new ArrayBuffer(call.audio.byteLength);
    new Uint8Array(copy).set(call.audio);
    const form = new FormData();
    form.set('audio', new Blob([copy]), 'audio.bin');
    form.set(
      'request',
      JSON.stringify({
        jieyu: '1',
        requestId: call.requestId,
        capability: 'transcribe',
        range: call.range,
        ...(call.language === undefined ? {} : { params: { language: call.language } }),
      }),
    );
    const headers = new Headers();
    if (call.token !== undefined) headers.set('Authorization', `Bearer ${call.token}`);
    const response = await fetch(new URL('/transcribe', base), {
      method: 'POST',
      body: form,
      headers,
      signal: stop,
      redirect: 'error',
    });
    const text = await readCappedBody(response, MAX_BODY_BYTES);
    if (text === 'too_large') return { status: 'error', code: 'bad_response', warnings };
    return finishResponse(response.ok, text, call, declaration, warnings);
  } catch (error) {
    return { status: 'error', code: failureCode(error, signal, timeout), warnings };
  }
}

export async function assertLoopbackUrl(baseUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('model address is remote');
  }
  if (url.protocol !== 'http:' || url.username.length > 0 || url.password.length > 0) {
    throw new Error('model address is remote');
  }
  if (isLoopbackIp(url.hostname)) return url;
  if (url.hostname.includes(':')) throw new Error('model address is remote');
  const found = await lookup(url.hostname, { all: true, verbatim: true });
  if (found.length === 0 || found.some((row) => !isLoopbackIp(row.address))) {
    throw new Error('model address is remote');
  }
  return url;
}

export function parseTranscribeBody(
  text: string,
  expected: {
    requestId: string;
    id: string;
    version: string;
    range: { start: number; end: number };
  },
  maxSegments = MAX_SEGMENTS,
): ModelCallResult {
  return finishResponse(
    true,
    text,
    expected,
    { id: expected.id, version: expected.version },
    [],
    maxSegments,
  );
}

function finishResponse(
  ok: boolean,
  text: string,
  expected: { requestId: string; range: { start: number; end: number } },
  declaration: { id: string; version: string },
  warnings: string[],
  maxSegments = MAX_SEGMENTS,
): ModelCallResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { status: 'error', code: 'bad_response', warnings };
  }
  if (!ok) {
    const code = errorCode(parsed, expected.requestId);
    return { status: 'error', code, warnings };
  }
  const body = okSchema.safeParse(parsed);
  if (!body.success || major(body.data.jieyu) !== '1') {
    return { status: 'error', code: 'bad_response', warnings };
  }
  if (
    body.data.requestId !== expected.requestId ||
    body.data.model.id !== declaration.id ||
    body.data.model.version !== declaration.version ||
    body.data.result.segments.length > maxSegments
  ) {
    return { status: 'error', code: 'bad_response', warnings };
  }
  const segments: { start: number; end: number; text: string }[] = [];
  for (const segment of body.data.result.segments) {
    if (!timeFits(segment.start, segment.end, expected.range)) {
      return { status: 'error', code: 'bad_response', warnings };
    }
    for (const word of segment.words ?? []) {
      if (!timeFits(word.start, word.end, expected.range)) {
        return { status: 'error', code: 'bad_response', warnings };
      }
    }
    segments.push({ start: segment.start, end: segment.end, text: segment.text });
  }
  const extra = body.data.warnings ?? [];
  return { status: 'ok', warnings: [...warnings, ...extra], segments };
}

async function readCappedBody(response: Response, maxBytes: number): Promise<string | 'too_large'> {
  const declared = response.headers.get('content-length');
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isInteger(size) || size < 0 || size > maxBytes) return 'too_large';
  }
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return 'too_large';
    }
    chunks.push(step.value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function failureCode(
  error: unknown,
  signal: AbortSignal | undefined,
  timeout: AbortSignal,
): ModelErrorCode {
  if (signal?.aborted === true) return 'cancelled';
  if (timeout.aborted === true) return 'timeout';
  if (error instanceof Error && /redirect/i.test(error.message)) return 'bad_response';
  return 'unreachable';
}

function healthOk(text: string | 'too_large', declaration: ModelDeclaration): boolean {
  if (text === 'too_large') return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return false;
  }
  const body = healthSchema.safeParse(parsed);
  return (
    body.success &&
    major(body.data.jieyu) === '1' &&
    body.data.status === 'ok' &&
    body.data.model.id === declaration.id &&
    body.data.model.version === declaration.version
  );
}

function errorCode(parsed: unknown, requestId: string): ModelErrorCode {
  const body = errorSchema.safeParse(parsed);
  if (!body.success || major(body.data.jieyu) !== '1' || body.data.requestId !== requestId) {
    return 'bad_response';
  }
  const code = body.data.error.code;
  if ((SERVER_CODES as readonly string[]).includes(code)) return code as ModelErrorCode;
  return 'internal';
}

function readDeclaration(text: string): ModelDeclaration {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('model declaration is invalid');
  }
  const body = declarationSchema.safeParse(parsed);
  if (!body.success || major(body.data.minJieyuProtocol) !== '1') {
    throw new Error('model declaration is invalid');
  }
  if (!reverseDomain(body.data.id) || body.data.audio.accept.length === 0) {
    throw new Error('model declaration is invalid');
  }
  const timeout = body.data.transport.timeoutSecPerChunk ?? DEFAULT_TIMEOUT_SEC;
  if (!(timeout > 0)) throw new Error('model declaration is invalid');
  return {
    id: body.data.id,
    version: body.data.version,
    license: body.data.license,
    maxAudioSec: body.data.capabilities.transcribe.maxAudioSec,
    timeoutSec: timeout,
    baseUrl: body.data.transport.baseUrl,
    accept: body.data.audio.accept,
  };
}

function declarationWarnings(declaration: ModelDeclaration, token: string | undefined): string[] {
  const warnings: string[] = [];
  if (token === undefined) warnings.push('token is missing');
  if (/(?:^|[^A-Za-z])NC(?:[^A-Za-z]|$)/.test(declaration.license)) {
    warnings.push('license is non-commercial');
  }
  return warnings;
}

function acceptedAudio(declaration: ModelDeclaration, call: CallInput): boolean {
  return declaration.accept.some(
    (item) =>
      item.format === call.format &&
      item.sampleRate === call.sampleRate &&
      item.channels === call.channels,
  );
}

function readCall(input: unknown): CallInput | null {
  if (typeof input !== 'object' || input === null) return null;
  const row = input as Record<string, unknown>;
  const range = row.range;
  if (typeof range !== 'object' || range === null) return null;
  const start = (range as { start?: unknown }).start;
  const end = (range as { end?: unknown }).end;
  if (
    typeof row.declarationPath !== 'string' ||
    row.declarationPath.length === 0 ||
    !(row.audio instanceof Uint8Array) ||
    typeof row.format !== 'string' ||
    row.format.length === 0 ||
    typeof row.sampleRate !== 'number' ||
    typeof row.channels !== 'number' ||
    typeof row.requestId !== 'string' ||
    row.requestId.length === 0 ||
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start
  ) {
    return null;
  }
  const token = row.token;
  const language = row.language;
  if (token !== undefined && typeof token !== 'string') return null;
  if (language !== undefined && typeof language !== 'string') return null;
  return {
    declarationPath: row.declarationPath,
    audio: row.audio,
    format: row.format,
    sampleRate: row.sampleRate,
    channels: row.channels,
    range: { start, end },
    requestId: row.requestId,
    ...(token === undefined ? {} : { token }),
    ...(language === undefined ? {} : { language }),
  };
}

function requestIdOf(input: unknown): string {
  if (typeof input !== 'object' || input === null) return '';
  const requestId = (input as { requestId?: unknown }).requestId;
  return typeof requestId === 'string' ? requestId : '';
}

function major(version: string): string {
  const [head] = version.split('.');
  return head ?? '';
}

function reverseDomain(id: string): boolean {
  return /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(id);
}

function isLoopbackIp(host: string): boolean {
  if (host === '::1') return true;
  const parts = host.split('.');
  if (parts.length !== 4 || parts[0] !== '127') return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value <= 255;
  });
}

function timeFits(start: number, end: number, range: { start: number; end: number }): boolean {
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start <= end &&
    start >= range.start &&
    end <= range.end
  );
}

const wordSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  confidence: z.number().optional(),
});

const okSchema = z.object({
  jieyu: z.string(),
  requestId: z.string(),
  status: z.literal('ok'),
  model: z.object({ id: z.string(), version: z.string() }),
  result: z.object({
    segments: z.array(
      z.object({
        start: z.number(),
        end: z.number(),
        text: z.string(),
        confidence: z.number().optional(),
        words: z.array(wordSchema).optional(),
      }),
    ),
  }),
  warnings: z.array(z.string()).optional(),
});

const errorSchema = z.object({
  jieyu: z.string(),
  requestId: z.string(),
  status: z.literal('error'),
  error: z.object({ code: z.string(), message: z.string() }),
});

const healthSchema = z.object({
  jieyu: z.string(),
  status: z.literal('ok'),
  model: z.object({ id: z.string(), version: z.string() }),
});

const declarationSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  version: z.string().min(1),
  minJieyuProtocol: z.string(),
  license: z.string().min(1),
  capabilities: z.object({
    transcribe: z.object({
      wordTimestamps: z.boolean(),
      maxAudioSec: z.number().positive(),
    }),
  }),
  audio: z.object({
    accept: z.array(
      z.object({
        format: z.string().min(1),
        sampleRate: z.number().positive(),
        channels: z.number().int().positive(),
      }),
    ),
  }),
  transport: z.object({
    kind: z.literal('http'),
    baseUrl: z.string().min(1),
    timeoutSecPerChunk: z.number().positive().optional(),
  }),
});
