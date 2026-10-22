/**
 * 跨文件说话人分配（ADR-0071）。
 * 项目库和每一份 `.jyd` 各自一次事务。提交后再读回，读回失败不撤销。
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { CatalogOwnershipMismatchError } from '../services/projectCatalogScope';
import { newId } from '../utils/transcriptionFormatters';
import { StorageReadbackError } from './storageReadbackError';
import type { MixedSpeakerSelectionResult, MixedSpeakerSelectionWrite } from './storagePort';
import type { SpeakerDocType } from './types';

type SqliteDatabase = InstanceType<typeof Database>;

export const PROJECT_APPLICATION_ID = 0x4a59504a;
export const MANUSCRIPT_APPLICATION_ID = 0x4a594443;

const OPERATION = 'assignSpeakerToMixedSelection';

interface SpeakerSql {
  id: string;
  text_id: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
}

interface LocatedUnit {
  id: string;
  unitType: 'segment' | 'unit';
  file: string;
}

function applicationId(db: SqliteDatabase): number {
  const row: unknown = db.prepare('PRAGMA application_id').get();
  if (typeof row !== 'object' || row === null) return 0;
  const value = (row as { application_id?: unknown }).application_id;
  return typeof value === 'number' ? value : 0;
}

function speakerSql(value: unknown): SpeakerSql | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    typeof row.text_id !== 'string' ||
    typeof row.name !== 'string'
  ) {
    return undefined;
  }
  const createdAt = row.created_at;
  const updatedAt = row.updated_at;
  if (
    (createdAt !== null && typeof createdAt !== 'string') ||
    (updatedAt !== null && typeof updatedAt !== 'string')
  ) {
    return undefined;
  }
  return {
    id: row.id,
    text_id: row.text_id,
    name: row.name,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function speakerDoc(row: SpeakerSql): SpeakerDocType {
  return {
    id: row.id,
    name: row.name,
    textId: row.text_id,
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  };
}

function foldName(name: string): string {
  return name.trim().toLocaleLowerCase('zh-Hans-CN');
}

function readRoster(json: string | null): string[] {
  if (json === null) return [];
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('project speaker roster is not a string array');
  }
  return value;
}

function mergeId(roster: readonly string[], speakerId: string): string[] {
  return roster.includes(speakerId) ? [...roster] : [...roster, speakerId];
}

function manuscriptFiles(projectDir: string): string[] {
  return readdirSync(projectDir)
    .filter((name) => name.endsWith('.jyd'))
    .sort()
    .map((name) => path.join(projectDir, name));
}

function locateUnits(
  projectDir: string,
  touched: readonly { id: string; unitType: 'segment' | 'unit' }[],
): LocatedUnit[] {
  const found = new Map<string, { file: string; unitType: string | null }>();
  for (const file of manuscriptFiles(projectDir)) {
    const db = new Database(file);
    try {
      db.exec('PRAGMA journal_mode = DELETE');
      if (applicationId(db) !== MANUSCRIPT_APPLICATION_ID) {
        throw new Error(`${path.basename(file)} application_id is not a Jieyu manuscript`);
      }
      const rows = db.prepare('SELECT id, unit_type FROM units').all();
      for (const value of rows) {
        if (typeof value !== 'object' || value === null) {
          throw new Error('mixed speaker selection changed before writing');
        }
        const row = value as { id?: unknown; unit_type?: unknown };
        if (typeof row.id !== 'string')
          throw new Error('mixed speaker selection changed before writing');
        if (found.has(row.id)) throw new Error(`duplicate unit ${row.id} in project folder`);
        const unitType = row.unit_type;
        found.set(row.id, {
          file,
          unitType: unitType === null ? null : typeof unitType === 'string' ? unitType : null,
        });
      }
    } finally {
      db.close();
    }
  }
  return touched.map((unit) => {
    const row = found.get(unit.id);
    if (row === undefined || row.unitType !== unit.unitType) {
      throw new Error('mixed speaker selection changed before writing');
    }
    return { id: unit.id, unitType: unit.unitType, file: row.file };
  });
}

function readSpeaker(project: SqliteDatabase, id: string): SpeakerDocType | undefined {
  const row = speakerSql(
    project
      .prepare('SELECT id, text_id, name, created_at, updated_at FROM speakers WHERE id = ?')
      .get(id),
  );
  return row === undefined ? undefined : speakerDoc(row);
}

function speakersInProject(project: SqliteDatabase, textId: string): SpeakerDocType[] {
  return project
    .prepare(
      'SELECT id, text_id, name, created_at, updated_at FROM speakers WHERE text_id = ? ORDER BY id',
    )
    .all(textId)
    .map((value) => {
      const row = speakerSql(value);
      if (row === undefined) throw new Error('speaker row is missing id, project, or name');
      return speakerDoc(row);
    });
}

function refreshSpeakerCopy(manuscript: SqliteDatabase, project: SqliteDatabase): void {
  const used = manuscript
    .prepare(
      "SELECT DISTINCT speaker_id FROM units WHERE speaker_id IS NOT NULL AND speaker_id != '' ORDER BY speaker_id",
    )
    .all()
    .map((value) => {
      if (typeof value !== 'object' || value === null) return '';
      const id = (value as { speaker_id?: unknown }).speaker_id;
      return typeof id === 'string' ? id : '';
    })
    .filter((id) => id.length > 0);
  manuscript.prepare('DELETE FROM speakers').run();
  const insert = manuscript.prepare('INSERT INTO speakers (id, name) VALUES (?, ?)');
  for (const id of used) {
    const speaker = readSpeaker(project, id);
    if (speaker === undefined) throw new Error(`speaker not found: ${id}`);
    insert.run(speaker.id, speaker.name);
  }
}

function speakerIdOf(value: unknown): string | null | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const id = (value as { speaker_id?: unknown }).speaker_id;
  if (id === null) return null;
  return typeof id === 'string' ? id : undefined;
}

function writeManuscript(
  file: string,
  project: SqliteDatabase,
  units: readonly LocatedUnit[],
  speaker: SpeakerDocType | undefined,
): void {
  const db = new Database(file);
  try {
    db.exec('PRAGMA journal_mode = DELETE');
    const speakerId = speaker?.id ?? null;
    const commit = db.transaction(() => {
      const update = db.prepare('UPDATE units SET speaker_id = ? WHERE id = ?');
      for (const unit of units) update.run(speakerId, unit.id);
      refreshSpeakerCopy(db, project);
    });
    commit();
    for (const unit of units) {
      if (
        speakerIdOf(db.prepare('SELECT speaker_id FROM units WHERE id = ?').get(unit.id)) !==
        speakerId
      ) {
        throw new StorageReadbackError(OPERATION);
      }
    }
    if (speaker !== undefined) {
      const copy: unknown = db.prepare('SELECT name FROM speakers WHERE id = ?').get(speaker.id);
      const name =
        typeof copy === 'object' && copy !== null ? (copy as { name?: unknown }).name : undefined;
      if (name !== speaker.name) throw new StorageReadbackError(OPERATION);
    }
  } finally {
    db.close();
  }
}

export function assignSpeakerInProject(
  project: SqliteDatabase,
  projectDir: string,
  write: MixedSpeakerSelectionWrite,
): MixedSpeakerSelectionResult {
  const projectId = write.textId.trim();
  if (projectId === '') throw new Error('mixed speaker selection requires a project');
  const requestedSpeakerId = write.speakerId?.trim() ?? '';
  const segmentIds = [
    ...new Set(write.segmentIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  const unitIds = [...new Set(write.unitIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  if (segmentIds.some((id) => unitIds.includes(id))) {
    throw new Error('mixed speaker selection overlaps');
  }
  if (requestedSpeakerId !== '' && write.createSpeaker !== undefined) {
    throw new Error('choose an existing speaker or create one');
  }
  if (segmentIds.length === 0 && unitIds.length === 0) return { segments: 0, units: 0 };

  const projectRow: unknown = project
    .prepare('SELECT id, speaker_ids_json FROM project WHERE id = ?')
    .get(projectId);
  if (typeof projectRow !== 'object' || projectRow === null) {
    throw new Error(`project not found: ${projectId}`);
  }
  const rosterJson = (projectRow as { speaker_ids_json?: unknown }).speaker_ids_json;
  if (rosterJson !== null && typeof rosterJson !== 'string') {
    throw new Error('project speaker roster is not a string array');
  }
  const roster = readRoster(rosterJson);

  const located = locateUnits(projectDir, [
    ...segmentIds.map((id) => ({ id, unitType: 'segment' as const })),
    ...unitIds.map((id) => ({ id, unitType: 'unit' as const })),
  ]);

  let speaker = requestedSpeakerId === '' ? undefined : readSpeaker(project, requestedSpeakerId);
  let created = false;
  if (requestedSpeakerId !== '' && speaker === undefined) {
    throw new Error(`speaker not found: ${requestedSpeakerId}`);
  }
  if (write.createSpeaker !== undefined) {
    const name = write.createSpeaker.name.trim();
    const textId = write.createSpeaker.textId.trim();
    if (name === '' || textId === '') throw new Error('speaker name and project are required');
    if (project.prepare('SELECT id FROM project WHERE id = ?').get(textId) === undefined) {
      throw new Error(`project not found: ${textId}`);
    }
    speaker = speakersInProject(project, textId).find(
      (row) => foldName(row.name) === foldName(name),
    );
    if (speaker === undefined) {
      const now = new Date().toISOString();
      speaker = { id: newId('speaker'), name, textId, createdAt: now, updatedAt: now };
      created = true;
    }
  }
  if (speaker !== undefined && speaker.textId !== projectId) {
    throw new CatalogOwnershipMismatchError('speakers', speaker.id, speaker.textId, projectId);
  }

  if (created && speaker !== undefined) {
    const createdSpeaker = speaker;
    const insert = project.transaction(() => {
      project
        .prepare(
          'INSERT INTO speakers (id, text_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          createdSpeaker.id,
          createdSpeaker.textId,
          createdSpeaker.name,
          createdSpeaker.createdAt,
          createdSpeaker.updatedAt,
        );
    });
    insert();
  }

  const byFile = new Map<string, LocatedUnit[]>();
  for (const unit of located) {
    const group = byFile.get(unit.file) ?? [];
    group.push(unit);
    byFile.set(unit.file, group);
  }
  for (const [file, units] of byFile) writeManuscript(file, project, units, speaker);

  if (speaker !== undefined) {
    const nextRoster = mergeId(roster, speaker.id);
    const json = JSON.stringify(nextRoster);
    const commitRoster = project.transaction(() => {
      project.prepare('UPDATE project SET speaker_ids_json = ? WHERE id = ?').run(json, projectId);
    });
    commitRoster();
    const stored: unknown = project
      .prepare('SELECT speaker_ids_json FROM project WHERE id = ?')
      .get(projectId);
    const storedJson =
      typeof stored === 'object' && stored !== null
        ? (stored as { speaker_ids_json?: unknown }).speaker_ids_json
        : undefined;
    if (storedJson !== json) throw new StorageReadbackError(OPERATION);
    const storedSpeaker = readSpeaker(project, speaker.id);
    if (
      storedSpeaker === undefined ||
      storedSpeaker.name !== speaker.name ||
      storedSpeaker.textId !== speaker.textId
    ) {
      throw new StorageReadbackError(OPERATION);
    }
    speaker = storedSpeaker;
  }

  return {
    segments: segmentIds.length,
    units: unitIds.length,
    ...(speaker !== undefined ? { speaker } : {}),
    ...(created ? { created: true } : {}),
  };
}
