import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { invertTextTimeMapping } from '../../services/LinguisticService.timeMapping';
import { getManuscript } from './manuscripts';
import { assertUnitTextRoleFree } from './units';

type SqliteDatabase = InstanceType<typeof Database>;

export type ModelRunStatus = 'running' | 'ok' | 'error' | 'cancelled' | 'interrupted';

export interface ModelRun {
  id: string;
  manuscriptId: string;
  mediaId: string;
  layerId: string;
  lifecycleGeneration: number;
  modelId: string;
  modelVersion: string;
  manifestSha256: string;
  capability: 'transcribe';
  params: Record<string, unknown>;
  rangeStart: number;
  rangeEnd: number;
  startedAt: string;
  finishedAt: string | null;
  status: ModelRunStatus;
  errorCode: string | null;
  chunkCount: number;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;
  abandonedCount: number;
}

export interface ModelRunStart {
  manuscriptId: string;
  layerId: string;
  modelId: string;
  modelVersion: string;
  manifestSha256: string;
  params: Record<string, unknown>;
  rangeStart: number;
  rangeEnd: number;
}

export type ModelRunFinish =
  | { runId: string; status: 'ok' | 'cancelled'; chunkCount: number }
  | { runId: string; status: 'error'; chunkCount: number; errorCode: string };

export interface PreviewCandidateInput {
  chunkIndex: number;
  segmentIndex: number;
  mediaStart: number;
  mediaEnd: number;
}

export interface PreviewCandidate {
  candidateId: string;
  chunkIndex: number;
  segmentIndex: number;
  mediaStart: number;
  mediaEnd: number;
  manuscriptStart: number;
  manuscriptEnd: number;
  targetFingerprint: string;
  occupied: boolean;
}

export interface TranscriptionAcceptance {
  operationId: string;
  runId: string;
  candidateId: string;
  unitId: string;
  text: string;
  startTime: number;
  endTime: number;
  modelRunId: string;
}

interface RunRow {
  id: string;
  manuscript_id: string;
  media_id: string;
  layer_id: string;
  lifecycle_generation: number;
  model_id: string;
  model_version: string;
  manifest_sha256: string;
  capability: 'transcribe';
  params_json: string;
  range_start: number;
  range_end: number;
  started_at: string;
  finished_at: string | null;
  status: ModelRunStatus;
  error_code: string | null;
  chunk_count: number;
  accepted_count: number;
  rejected_count: number;
  pending_count: number;
  abandoned_count: number;
}

interface OverlapRow {
  id: string;
  start_time: number;
  end_time: number;
  body: string;
}

const RUN_COLUMNS = `id, manuscript_id, media_id, layer_id, lifecycle_generation, model_id, model_version,
  manifest_sha256, capability, params_json, range_start, range_end, started_at, finished_at, status,
  error_code, chunk_count, accepted_count, rejected_count, pending_count, abandoned_count`;

export function startModelRun(db: SqliteDatabase, input: ModelRunStart): ModelRun {
  if (!orderedRange(input.rangeStart, input.rangeEnd)) {
    throw new Error('transcription range is invalid');
  }
  const now = new Date().toISOString();
  const id = randomUUID();
  const write = db.transaction(() => {
    const manuscript = db
      .prepare(
        `SELECT media_id AS mediaId, lifecycle_generation AS lifecycleGeneration,
                deleted_at AS deletedAt
         FROM manuscripts WHERE id = ?`,
      )
      .get(input.manuscriptId) as
      { mediaId: string; lifecycleGeneration: number; deletedAt: string | null } | undefined;
    if (!manuscript) throw new Error('transcription manuscript is missing');
    if (manuscript.deletedAt !== null) throw new Error('manuscript is deleted');
    const layer = db
      .prepare(
        'SELECT manuscript_id AS manuscriptId, content_type AS contentType FROM layers WHERE id = ?',
      )
      .get(input.layerId) as { manuscriptId: string; contentType: string } | undefined;
    if (!layer) throw new Error('transcription layer is missing');
    if (layer.manuscriptId !== input.manuscriptId || layer.contentType !== 'transcription') {
      throw new Error('transcription target layer is invalid');
    }
    db.prepare(
      `INSERT INTO model_runs (
        id, manuscript_id, media_id, layer_id, lifecycle_generation, model_id, model_version,
        manifest_sha256, capability, params_json, range_start, range_end, started_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'transcribe', ?, ?, ?, ?, 'running')`,
    ).run(
      id,
      input.manuscriptId,
      manuscript.mediaId,
      input.layerId,
      manuscript.lifecycleGeneration,
      input.modelId,
      input.modelVersion,
      input.manifestSha256,
      JSON.stringify(input.params),
      input.rangeStart,
      input.rangeEnd,
      now,
    );
    const run = getModelRun(db, id);
    if (
      !run ||
      run.status !== 'running' ||
      run.lifecycleGeneration !== manuscript.lifecycleGeneration
    ) {
      throw new Error('transcription run readback failed');
    }
    return run;
  });
  return write();
}

export function finishModelRun(db: SqliteDatabase, input: ModelRunFinish): ModelRun {
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    const current = requireRun(db, input.runId);
    if (current.status !== 'running') throw new Error('transcription run is not running');
    requireCurrentLifecycle(db, current);
    const errorCode = input.status === 'error' ? input.errorCode : null;
    db.prepare(
      `UPDATE model_runs
       SET status = ?, finished_at = ?, chunk_count = ?, error_code = ?
       WHERE id = ? AND status = 'running'`,
    ).run(input.status, now, input.chunkCount, errorCode, input.runId);
    const run = getModelRun(db, input.runId);
    if (
      !run ||
      run.status !== input.status ||
      run.finishedAt === null ||
      run.chunkCount !== input.chunkCount
    ) {
      throw new Error('transcription run readback failed');
    }
    return run;
  });
  return write();
}

export interface AcceptableRun {
  id: string;
  rangeStart: number;
  rangeEnd: number;
}

export function listAcceptableRuns(db: SqliteDatabase, manuscriptId: string): AcceptableRun[] {
  return db
    .prepare(
      `SELECT id, range_start AS rangeStart, range_end AS rangeEnd
       FROM model_runs
       WHERE manuscript_id = ? AND status = 'ok'
       ORDER BY started_at, id`,
    )
    .all(manuscriptId) as AcceptableRun[];
}

export function previewModelRun(
  db: SqliteDatabase,
  input: { runId: string; candidates: PreviewCandidateInput[] },
): { pendingCount: number; timeMappingRevision: number; candidates: PreviewCandidate[] } {
  const write = db.transaction(() => {
    const run = requireRun(db, input.runId);
    if (run.status !== 'running' && run.status !== 'ok') {
      throw new Error('transcription run is not open');
    }
    requireCurrentLifecycle(db, run);
    const seen = new Set<string>();
    for (const candidate of input.candidates) {
      const candidateId = candidateIdentity(candidate.chunkIndex, candidate.segmentIndex);
      if (seen.has(candidateId)) throw new Error('transcription candidate is duplicated');
      seen.add(candidateId);
      if (!orderedRange(candidate.mediaStart, candidate.mediaEnd)) {
        throw new Error('transcription range is invalid');
      }
    }
    const duration = mediaDuration(db, run.mediaId);
    for (const candidate of input.candidates) {
      if (candidate.mediaStart < 0 || candidate.mediaEnd > duration) {
        throw new Error('transcription time is invalid');
      }
    }
    const placed = input.candidates.map((candidate) => placeCandidate(db, run, candidate));
    db.prepare('UPDATE model_runs SET pending_count = ? WHERE id = ?').run(placed.length, run.id);
    const stored = getModelRun(db, run.id);
    if (
      !stored ||
      stored.pendingCount !== placed.length ||
      stored.abandonedCount !== run.abandonedCount
    ) {
      throw new Error('transcription run readback failed');
    }
    return {
      pendingCount: stored.pendingCount,
      timeMappingRevision: mappingOf(db, run.manuscriptId).revision,
      candidates: placed,
    };
  });
  const preview = write();
  for (const key of [...previews.keys()]) {
    if (key.startsWith(`${input.runId}\0`)) previews.delete(key);
  }
  for (const candidate of preview.candidates) rememberPreview(input.runId, candidate);
  return preview;
}

const previews = new Map<string, { mediaStart: number; mediaEnd: number }>();

function previewKey(runId: string, candidateId: string): string {
  return `${runId}\0${candidateId}`;
}

function rememberPreview(runId: string, candidate: PreviewCandidate): void {
  previews.set(previewKey(runId, candidate.candidateId), {
    mediaStart: candidate.mediaStart,
    mediaEnd: candidate.mediaEnd,
  });
}

function previewedRange(
  runId: string,
  candidateId: string,
): { mediaStart: number; mediaEnd: number } | undefined {
  return previews.get(previewKey(runId, candidateId));
}

function mediaDuration(db: SqliteDatabase, mediaId: string): number {
  const row = db.prepare('SELECT duration FROM media WHERE id = ?').get(mediaId) as
    { duration: number } | undefined;
  if (row === undefined || !Number.isFinite(row.duration) || row.duration < 0) {
    throw new Error('transcription time is invalid');
  }
  return row.duration;
}

export function acceptTranscriptionCandidate(
  db: SqliteDatabase,
  input: {
    operationId: string;
    runId: string;
    chunkIndex: number;
    segmentIndex: number;
    mediaStart: number;
    mediaEnd: number;
    timeMappingRevision: number;
    targetFingerprint: string;
    text: string;
  },
): TranscriptionAcceptance {
  if (input.text.length === 0) throw new Error('transcription text is empty');
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    const run = requireRun(db, input.runId);
    if (run.status !== 'ok') throw new Error('transcription run is not acceptable');
    if (run.pendingCount < 1) throw new Error('transcription run has no pending candidate');
    requireCurrentLifecycle(db, run);
    const mapping = mappingOf(db, run.manuscriptId);
    if (mapping.revision !== input.timeMappingRevision)
      throw new Error('transcription preview is stale');
    const manuscriptStart = invertTextTimeMapping(input.mediaStart, mapping);
    const manuscriptEnd = invertTextTimeMapping(input.mediaEnd, mapping);
    if (!(manuscriptEnd > manuscriptStart)) throw new Error('transcription time is invalid');
    const overlaps = overlappingTexts(db, run.layerId, manuscriptStart, manuscriptEnd);
    if (overlaps.length > 0) throw new Error('transcription target is occupied');
    if (targetFingerprint(overlaps) !== input.targetFingerprint) {
      throw new Error('transcription preview is stale');
    }
    const candidateId = candidateIdentity(input.chunkIndex, input.segmentIndex);
    const operationTaken = db
      .prepare('SELECT 1 AS ok FROM transcription_acceptances WHERE operation_id = ?')
      .get(input.operationId);
    if (operationTaken !== undefined) throw new Error('transcription operation is already used');
    const preview = previewedRange(input.runId, candidateId);
    if (
      preview === undefined ||
      preview.mediaStart !== input.mediaStart ||
      preview.mediaEnd !== input.mediaEnd
    ) {
      throw new Error('transcription preview is stale');
    }
    const duration = mediaDuration(db, run.mediaId);
    if (input.mediaStart < 0 || input.mediaEnd > duration) {
      throw new Error('transcription time is invalid');
    }
    const unitId = randomUUID();
    assertUnitTextRoleFree(db, unitId, 'transcription');
    db.prepare(
      `INSERT INTO units (
        id, layer_id, start_time, end_time, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(unitId, run.layerId, manuscriptStart, manuscriptEnd, now, now);
    db.prepare(
      `INSERT INTO unit_texts (id, unit_id, role, body, provenance_json, updated_at)
       VALUES (?, ?, 'transcription', ?, ?, ?)`,
    ).run(randomUUID(), unitId, input.text, provenanceJson(run, now), now);
    try {
      db.prepare(
        `INSERT INTO transcription_acceptances (
          id, operation_id, run_id, candidate_id, unit_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), input.operationId, run.id, candidateId, unitId, now);
    } catch (error) {
      const unique = uniqueFailure(error);
      if (unique === 'operation') throw new Error('transcription operation is already used');
      if (unique === 'candidate') throw new Error('transcription candidate is already accepted');
      throw error;
    }
    db.prepare(
      `UPDATE model_runs
       SET accepted_count = accepted_count + 1, pending_count = pending_count - 1
       WHERE id = ? AND pending_count > 0`,
    ).run(run.id);
    const acceptance = readTranscriptionAcceptance(db, input.operationId);
    const stored = getModelRun(db, run.id);
    if (
      !acceptance ||
      acceptance.unitId !== unitId ||
      acceptance.text !== input.text ||
      acceptance.modelRunId !== run.id ||
      !stored ||
      stored.acceptedCount !== run.acceptedCount + 1 ||
      stored.pendingCount !== run.pendingCount - 1
    ) {
      throw new Error('transcription run readback failed');
    }
    return acceptance;
  });
  return write();
}

export function abandonPending(db: SqliteDatabase, runId: string): ModelRun {
  const write = db.transaction(() => {
    const current = requireRun(db, runId);
    if (current.status !== 'ok') throw new Error('transcription run is not acceptable');
    requireCurrentLifecycle(db, current);
    db.prepare(
      `UPDATE model_runs
       SET abandoned_count = abandoned_count + pending_count, pending_count = 0
       WHERE id = ?`,
    ).run(runId);
    const run = getModelRun(db, runId);
    if (
      !run ||
      run.pendingCount !== 0 ||
      run.abandonedCount !== current.abandonedCount + current.pendingCount ||
      run.rejectedCount !== current.rejectedCount ||
      run.status !== 'ok'
    ) {
      throw new Error('transcription run readback failed');
    }
    return run;
  });
  return write();
}

export function interruptUnfinishedRuns(db: SqliteDatabase): ModelRun[] {
  return interruptRunning(db, '');
}

export function stopManuscriptTasks(db: SqliteDatabase, manuscriptId: string): ModelRun[] {
  const manuscript = db
    .prepare('SELECT deleted_at AS deletedAt FROM manuscripts WHERE id = ?')
    .get(manuscriptId) as { deletedAt: string | null } | undefined;
  if (!manuscript) throw new Error('manuscript is missing');
  if (manuscript.deletedAt !== null) throw new Error('manuscript is deleted');
  return interruptRunning(db, ' AND manuscript_id = ?', manuscriptId);
}

export function stopRecordingTasks(db: SqliteDatabase, mediaId: string): ModelRun[] {
  const media = db
    .prepare('SELECT deleted_at AS deletedAt FROM media WHERE id = ?')
    .get(mediaId) as { deletedAt: string | null } | undefined;
  if (!media) throw new Error('media is missing');
  if (media.deletedAt !== null) throw new Error('media is deleted');
  return interruptRunning(db, ' AND media_id = ?', mediaId);
}

function interruptRunning(db: SqliteDatabase, clause: string, param?: string): ModelRun[] {
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    const ids = db
      .prepare(
        `SELECT id FROM model_runs WHERE status = 'running'${clause} ORDER BY started_at, id`,
      )
      .all(...(param === undefined ? [] : [param])) as { id: string }[];
    const update = db.prepare(
      `UPDATE model_runs
       SET status = 'interrupted',
           abandoned_count = abandoned_count + pending_count,
           pending_count = 0,
           finished_at = ?
       WHERE id = ? AND status = 'running'`,
    );
    return ids.map((row) => {
      const before = requireRun(db, row.id);
      update.run(now, row.id);
      const run = getModelRun(db, row.id);
      if (
        !run ||
        run.status !== 'interrupted' ||
        run.pendingCount !== 0 ||
        run.abandonedCount !== before.abandonedCount + before.pendingCount ||
        run.rejectedCount !== before.rejectedCount ||
        run.finishedAt === null
      ) {
        throw new Error('transcription run readback failed');
      }
      return run;
    });
  });
  return write();
}

export function getModelRun(db: SqliteDatabase, id: string): ModelRun | null {
  const row = db.prepare(`SELECT ${RUN_COLUMNS} FROM model_runs WHERE id = ?`).get(id) as
    RunRow | undefined;
  if (!row) return null;
  const params: unknown = JSON.parse(row.params_json);
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    throw new Error('transcription run readback failed');
  }
  return {
    id: row.id,
    manuscriptId: row.manuscript_id,
    mediaId: row.media_id,
    layerId: row.layer_id,
    lifecycleGeneration: row.lifecycle_generation,
    modelId: row.model_id,
    modelVersion: row.model_version,
    manifestSha256: row.manifest_sha256,
    capability: row.capability,
    params: params as Record<string, unknown>,
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    errorCode: row.error_code,
    chunkCount: row.chunk_count,
    acceptedCount: row.accepted_count,
    rejectedCount: row.rejected_count,
    pendingCount: row.pending_count,
    abandonedCount: row.abandoned_count,
  };
}

export function readTranscriptionAcceptance(
  db: SqliteDatabase,
  operationId: string,
): TranscriptionAcceptance | null {
  const row = db
    .prepare(
      `SELECT transcription_acceptances.operation_id AS operationId,
              transcription_acceptances.run_id AS runId,
              transcription_acceptances.candidate_id AS candidateId,
              transcription_acceptances.unit_id AS unitId,
              unit_texts.body AS text,
              units.start_time AS startTime,
              units.end_time AS endTime,
              unit_texts.provenance_json AS provenanceJson
       FROM transcription_acceptances
       JOIN units ON units.id = transcription_acceptances.unit_id
       JOIN unit_texts ON unit_texts.unit_id = units.id AND unit_texts.role = 'transcription'
       WHERE transcription_acceptances.operation_id = ?`,
    )
    .get(operationId) as
    | {
        operationId: string;
        runId: string;
        candidateId: string;
        unitId: string;
        text: string;
        startTime: number;
        endTime: number;
        provenanceJson: string | null;
      }
    | undefined;
  if (row === undefined || row.provenanceJson === null || row.provenanceJson.length === 0)
    return null;
  const provenance: unknown = JSON.parse(row.provenanceJson);
  const modelRunId = modelRunIdOf(provenance);
  if (modelRunId === null) return null;
  return {
    operationId: row.operationId,
    runId: row.runId,
    candidateId: row.candidateId,
    unitId: row.unitId,
    text: row.text,
    startTime: row.startTime,
    endTime: row.endTime,
    modelRunId,
  };
}

function requireRun(db: SqliteDatabase, id: string): ModelRun {
  const run = getModelRun(db, id);
  if (!run) throw new Error('transcription run is missing');
  return run;
}

function requireCurrentLifecycle(db: SqliteDatabase, run: ModelRun): void {
  const manuscript = db
    .prepare('SELECT lifecycle_generation AS lifecycleGeneration FROM manuscripts WHERE id = ?')
    .get(run.manuscriptId) as { lifecycleGeneration: number } | undefined;
  if (!manuscript) throw new Error('transcription manuscript is missing');
  if (manuscript.lifecycleGeneration !== run.lifecycleGeneration) {
    throw new Error('transcription run is stale');
  }
}

function mappingOf(
  db: SqliteDatabase,
  manuscriptId: string,
): { offsetSec: number; scale: number; revision: number } {
  const manuscript = getManuscript(db, manuscriptId);
  if (!manuscript) throw new Error('transcription manuscript is missing');
  return {
    offsetSec: manuscript.timeMapping?.offsetSec ?? 0,
    scale: manuscript.timeMapping?.scale ?? 1,
    revision: manuscript.timeMappingRevision,
  };
}

function placeCandidate(
  db: SqliteDatabase,
  run: ModelRun,
  candidate: PreviewCandidateInput,
): PreviewCandidate {
  const mapping = mappingOf(db, run.manuscriptId);
  const manuscriptStart = invertTextTimeMapping(candidate.mediaStart, mapping);
  const manuscriptEnd = invertTextTimeMapping(candidate.mediaEnd, mapping);
  if (!(manuscriptEnd > manuscriptStart)) throw new Error('transcription time is invalid');
  const overlaps = overlappingTexts(db, run.layerId, manuscriptStart, manuscriptEnd);
  return {
    candidateId: candidateIdentity(candidate.chunkIndex, candidate.segmentIndex),
    chunkIndex: candidate.chunkIndex,
    segmentIndex: candidate.segmentIndex,
    mediaStart: candidate.mediaStart,
    mediaEnd: candidate.mediaEnd,
    manuscriptStart,
    manuscriptEnd,
    targetFingerprint: targetFingerprint(overlaps),
    occupied: overlaps.length > 0,
  };
}

function overlappingTexts(
  db: SqliteDatabase,
  layerId: string,
  start: number,
  end: number,
): OverlapRow[] {
  return db
    .prepare(
      `SELECT units.id, units.start_time, units.end_time, unit_texts.body
       FROM units
       JOIN unit_texts ON unit_texts.unit_id = units.id AND unit_texts.role = 'transcription'
       WHERE units.layer_id = ? AND units.start_time < ? AND units.end_time > ?
       ORDER BY units.id`,
    )
    .all(layerId, end, start) as OverlapRow[];
}

function targetFingerprint(rows: OverlapRow[]): string {
  const lines = rows
    .map((row) => `${row.id}\t${row.start_time}\t${row.end_time}\t${row.body}`)
    .join('\n');
  return createHash('sha256').update(lines).digest('hex');
}

function candidateIdentity(chunkIndex: number, segmentIndex: number): string {
  return `${chunkIndex}:${segmentIndex}`;
}

function orderedRange(start: number, end: number): boolean {
  return Number.isFinite(start) && Number.isFinite(end) && end >= start;
}

function provenanceJson(run: ModelRun, now: string): string {
  return JSON.stringify({
    actorType: 'ai',
    method: 'auto-transcription',
    model: run.modelId,
    modelVersion: run.modelVersion,
    createdAt: now,
    reviewStatus: 'confirmed',
    params: { modelRunId: run.id },
  });
}

function modelRunIdOf(provenance: unknown): string | null {
  if (typeof provenance !== 'object' || provenance === null || Array.isArray(provenance))
    return null;
  const params = (provenance as { params?: unknown }).params;
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return null;
  const modelRunId = (params as { modelRunId?: unknown }).modelRunId;
  return typeof modelRunId === 'string' && modelRunId.length > 0 ? modelRunId : null;
}

function uniqueFailure(error: unknown): 'operation' | 'candidate' | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  if ((error as { code: unknown }).code !== 'SQLITE_CONSTRAINT_UNIQUE') return null;
  const message = 'message' in error ? String((error as { message: unknown }).message) : '';
  if (message.includes('operation_id')) return 'operation';
  if (message.includes('candidate_id') || message.includes('run_id')) return 'candidate';
  return null;
}
