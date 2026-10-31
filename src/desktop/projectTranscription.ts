import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { mediaRelpath, getMedia } from '../db/desktop/media';
import {
  abandonPending,
  startModelRun,
  finishModelRun,
  previewModelRun,
  getModelRun,
  modelRunTarget,
  interruptUnfinishedRuns,
} from '../db/desktop/modelRuns';
import { requireDesktopSession, desktopSessionFolder } from '../db/desktop/projectSession';
import { loadModelDeclaration, runModelTranscribe, cancelModelTranscribe } from './modelHost';
import { pcmWav } from './transcriptionAudio';
import type {
  TranscriptionModel,
  ProjectTranscriptionInput,
  ProjectTranscriptionResult,
} from './transcriptionTypes';

const grants = new Map<
  string,
  { sessionId: string; file: string; manifest: ReturnType<typeof loadModelDeclaration> }
>();
const jobs = new Map<string, { sessionId: string; cancelled: boolean; hostRequest: string }>();

export function grantTranscriptionModel(sessionId: string, file: string): TranscriptionModel {
  requireDesktopSession(sessionId);
  const manifest = loadModelDeclaration(file);
  // One selection per live session; stale selections must not accumulate across project switches.
  grants.clear();
  const id = randomUUID();
  grants.set(id, { sessionId, file, manifest });
  return { id, modelId: manifest.id, version: manifest.version, maxAudioSec: manifest.maxAudioSec };
}

export function cancelProjectTranscription(sessionId: string, requestId: string): void {
  requireDesktopSession(sessionId);
  const job = jobs.get(`${sessionId}:${requestId}`);
  if (!job) return;
  job.cancelled = true;
  cancelModelTranscribe(job.hostRequest);
}

export function resetProjectTranscriptions(): void {
  grants.clear();
  for (const job of jobs.values()) {
    job.cancelled = true;
    cancelModelTranscribe(job.hostRequest);
  }
}

/** Called only after a real desktop session is opened; no candidate body is recovered. */
export function recoverProjectTranscriptions(sessionId: string): void {
  const db = requireDesktopSession(sessionId).db;
  interruptUnfinishedRuns(db);
  const orphaned = db
    .prepare(
      "SELECT model_runs.id FROM model_runs JOIN manuscripts ON manuscripts.id=model_runs.manuscript_id WHERE model_runs.status='ok' AND model_runs.pending_count>0 AND manuscripts.deleted_at IS NULL AND manuscripts.lifecycle_generation=model_runs.lifecycle_generation",
    )
    .all() as { id: string }[];
  for (const run of orphaned) abandonPending(db, run.id);
}

export async function transcribeProject(
  sessionId: string,
  input: ProjectTranscriptionInput,
): Promise<ProjectTranscriptionResult> {
  const db = requireDesktopSession(sessionId).db;
  if (
    !input ||
    typeof input !== 'object' ||
    Object.keys(input).some(
      (key) => !['modelId', 'manuscriptId', 'layerId', 'start', 'end', 'requestId'].includes(key),
    ) ||
    typeof input.modelId !== 'string' ||
    typeof input.manuscriptId !== 'string' ||
    typeof input.layerId !== 'string' ||
    typeof input.requestId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(input.requestId) ||
    !Number.isFinite(input.start) ||
    !Number.isFinite(input.end) ||
    input.start < 0 ||
    input.end <= input.start
  )
    throw new Error('transcription input is invalid');
  const grant = grants.get(input.modelId);
  if (!grant || grant.sessionId !== sessionId) throw new Error('model is not granted');
  const manifest = loadModelDeclaration(grant.file);
  if (manifest.manifestSha256 !== grant.manifest.manifestSha256)
    throw new Error('model declaration changed');
  const key = `${sessionId}:${input.requestId}`;
  if (jobs.has(key) || [...jobs.values()].some((job) => job.sessionId === sessionId))
    throw new Error('transcription is already running');
  const source = db
    .prepare(
      'SELECT manuscripts.media_id FROM manuscripts JOIN media ON media.id = manuscripts.media_id WHERE manuscripts.id = ? AND manuscripts.deleted_at IS NULL AND media.deleted_at IS NULL',
    )
    .get(input.manuscriptId) as { media_id: string } | undefined;
  if (!source) throw new Error('manuscript is missing');
  const media = getMedia(db, source.media_id);
  if (!media) throw new Error('media is missing');
  if (input.end > media.duration) throw new Error('transcription range is invalid');
  const started = db.transaction(() => {
    const run = startModelRun(db, {
      manuscriptId: input.manuscriptId,
      layerId: input.layerId,
      modelId: manifest.id,
      modelVersion: manifest.version,
      manifestSha256: manifest.manifestSha256,
      params: {},
      rangeStart: input.start,
      rangeEnd: input.end,
    });
    return { run, target: modelRunTarget(db, run.id) };
  })();
  const job = { sessionId, cancelled: false, hostRequest: '' };
  jobs.set(key, job);
  const segments: {
    chunkIndex: number;
    segmentIndex: number;
    mediaStart: number;
    mediaEnd: number;
    text: string;
  }[] = [];
  const warnings = new Set<string>();
  let candidateBytes = 0;
  let chunkCount = 0;
  let failure: string | undefined;
  try {
    const file = resolve(
      desktopSessionFolder(sessionId),
      mediaRelpath(desktopSessionFolder(sessionId), media.relpath),
    );
    // shortcut: PCM16 input is capped at 64 MiB; real-engine conversion/streaming is a later slice.
    if (statSync(file).size > 64 * 1024 * 1024) throw new Error('transcription audio is too large');
    const bytes = readFileSync(file);
    if (createHash('sha256').update(bytes).digest('hex') !== media.sha256)
      throw new Error('media hash does not match');
    const audio = pcmWav(bytes);
    if (
      input.end > audio.duration ||
      input.end > media.duration ||
      !manifest.accept.some(
        (item) =>
          item.format === 'wav-pcm16' &&
          item.sampleRate === audio.sampleRate &&
          item.channels === audio.channels,
      )
    )
      throw new Error('unsupported transcription audio');
    for (let start = input.start; start < input.end;) {
      if (job.cancelled) break;
      const end = Math.min(input.end, start + manifest.maxAudioSec);
      if (end <= start || chunkCount >= 10_000) throw new Error('too many chunks');
      if (loadModelDeclaration(grant.file).manifestSha256 !== manifest.manifestSha256) {
        failure = 'model_changed';
        break;
      }
      job.hostRequest = `${key}-${chunkCount}`;
      const result = await runModelTranscribe({
        declarationPath: grant.file,
        audio: audio.slice(start, end),
        format: 'wav-pcm16',
        sampleRate: audio.sampleRate,
        channels: audio.channels,
        range: { start: 0, end: end - start },
        requestId: job.hostRequest,
      });
      for (const warning of result.warnings) warnings.add(warning);
      if (result.status !== 'ok') {
        if (result.code === 'cancelled') job.cancelled = true;
        else failure = result.code ?? 'internal';
        break;
      }
      for (const [index, segment] of (result.segments ?? []).entries()) {
        if (segment.end <= segment.start || segment.text.trim().length === 0) continue;
        candidateBytes += Buffer.byteLength(segment.text);
        if (segments.length >= 10_000 || candidateBytes > 8 * 1024 * 1024)
          throw new Error('too many candidates');
        segments.push({
          chunkIndex: chunkCount,
          segmentIndex: index,
          mediaStart: start + segment.start,
          mediaEnd: start + segment.end,
          text: segment.text,
        });
      }
      chunkCount += 1;
      start = end;
    }
  } catch {
    failure = 'internal';
  } finally {
    jobs.delete(key);
  }
  const live = requireDesktopSession(sessionId).db;
  const run = getModelRun(live, started.run.id);
  const empty = {
    runId: started.run.id,
    timeMappingRevision: started.target.revision,
    warnings: [...warnings],
    candidates: [],
  };
  if (run?.status !== 'running') return { ...empty, status: 'interrupted' };
  let stale = false;
  try {
    const target = modelRunTarget(live, run.id);
    stale =
      target.revision !== started.target.revision ||
      target.fingerprint !== started.target.fingerprint;
  } catch {
    return { ...empty, status: 'interrupted' };
  }
  if (stale) failure = 'stale_target';
  return live.transaction((): ProjectTranscriptionResult => {
    const status = job.cancelled ? 'cancelled' : failure ? 'error' : 'ok';
    finishModelRun(
      live,
      failure && status === 'error'
        ? { runId: run.id, status: 'error', errorCode: failure, chunkCount }
        : { runId: run.id, status: status === 'cancelled' ? 'cancelled' : 'ok', chunkCount },
    );
    if (status !== 'ok') return { ...empty, status, ...(failure ? { code: failure } : {}) };
    const preview = previewModelRun(live, { runId: run.id, candidates: segments });
    return {
      ...empty,
      status: 'ok' as const,
      timeMappingRevision: preview.timeMappingRevision,
      candidates: preview.candidates.map((candidate, index) => ({
        ...candidate,
        text: segments[index]!.text,
      })),
    };
  })();
}
