import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { importFromEaf } from '../../services/eaf/eafImport';
import { importFromFlextext } from '../../services/FlexService';
import { importFromTextGrid } from '../../services/TextGridService';
import { importFromToolbox } from '../../services/ToolboxService';
import { ensureDomParser } from '../../utils/ensureDomParser';
import { parseLiftXml } from '../../utils/lexiconLiftImport';
import { readAnalysisMaterial } from './analysisCandidates';
import { writeGraph } from './analysisRestore';
import { publishAttachment } from './attachments';
import { listDefinitions } from './customFields';
import { createLayer } from './layers';
import { saveLexemeEntry } from './lexicon';
import { createMedia } from './media';
import { createManuscript } from './manuscripts';
import { openProject } from './openProject';
import { assertZipBounded } from './zipBounds';
import { createSpeaker } from './speakers';
import { createUnit } from './units';

const ROLE_WORD = {
  转写: 'transcription',
  译文: 'translation',
  备注: 'note',
  排除: 'exclude',
} as const;

type Role = (typeof ROLE_WORD)[keyof typeof ROLE_WORD];
type ProjectedRole = 'transcription' | 'translation' | 'note';

type Word = {
  form: string;
  gloss?: Record<string, string>;
  pos?: string;
  morphemes?: Word[];
};

type Interval = {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  words?: Word[];
};

type Tier = {
  name: string;
  fileRole?: Role | undefined;
  intervals: Interval[];
};

type SourceFile = { relpath: string; sha256: string; format: string };

export interface ImportNotice {
  name: string;
  reason: string;
}

export interface ImportResult {
  paths: string[];
  written: number;
  unprojected: ImportNotice[];
}

type Sqlite = ReturnType<typeof openProject>['db'];

const EXTENSIONS = new Set(['.eaf', '.flextext', '.textgrid', '.toolbox', '.lift', '.jyb']);
const CONTENT_TYPES = new Set(['transcription', 'translation', 'gloss', 'pos', 'note', 'custom']);
const TIER_TYPES = new Set([
  'time-aligned',
  'time-subdivision',
  'symbolic-subdivision',
  'symbolic-association',
]);
const MEDIA_KEYS = new Set(['id', 'filename', 'duration', 'contentSha256']);
const TEXT_KEYS = new Set(['id', 'title']);
const TIER_KEYS = new Set(['id', 'key', 'name', 'contentType', 'tierType', 'textId']);
const UNIT_KEYS = new Set(['id', 'mediaId', 'layerId', 'startTime', 'endTime', 'text']);
const JYB_TABLES = new Set(['media_items', 'texts', 'tier_definitions', 'layer_units']);

export function importForeignFile(input: {
  folder: string;
  file: string;
  roles?: string;
  db?: Sqlite;
}): ImportResult {
  ensureDomParser();
  const extension = path.extname(input.file).toLowerCase();
  if (!EXTENSIONS.has(extension)) throw new Error('import extension is unsupported');
  const bytes = readFileSync(input.file);
  if (extension === '.jyb') {
    if (input.db !== undefined) throw new Error('import extension is unsupported');
    return importJyb(input.folder, bytes);
  }
  if (!existsSync(path.join(input.folder, 'project.sqlite'))) {
    throw new Error('project library is missing');
  }
  const beside = path.join(path.dirname(input.file), 'roles.txt');
  const rolesFile = input.roles ?? (existsSync(beside) ? beside : undefined);
  const roles = rolesFile === undefined ? undefined : readRoleList(readFileSync(rolesFile, 'utf8'));
  const text = bytes.toString('utf8');
  if (extension === '.lift') return importLift(input.folder, input.file, bytes, text, input.db);
  const parsed =
    extension === '.eaf'
      ? eafTiers(text, input.file)
      : extension === '.flextext'
        ? flexTiers(text, input.file)
        : extension === '.textgrid'
          ? textGridTiers(text, input.file)
          : toolboxTiers(text, input.file);
  assertRoleConflicts(parsed.tiers, roles);
  return writeAnnotation(
    input.folder,
    path.dirname(input.file),
    input.file,
    bytes,
    parsed,
    roles,
    input.db,
  );
}

function readRoleList(text: string): Map<string, Role> {
  const roles = new Map<string, Role>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const match = /^(.+?)\s+(转写|译文|备注|排除)$/.exec(trimmed);
    if (match === null) throw new Error('tier role is invalid');
    const name = match[1] ?? '';
    const role = ROLE_WORD[match[2] as keyof typeof ROLE_WORD];
    const previous = roles.get(name);
    if (previous !== undefined && previous !== role) throw new Error('tier role conflicts');
    roles.set(name, role);
  }
  return roles;
}

function assertRoleConflicts(tiers: Tier[], roles: Map<string, Role> | undefined): void {
  for (const tier of tiers) {
    const listed = roles?.get(tier.name);
    if (tier.fileRole !== undefined && listed !== undefined && listed !== tier.fileRole) {
      throw new Error('tier role conflicts');
    }
  }
}

function resolvedRole(tier: Tier, roles: Map<string, Role> | undefined): Role | undefined {
  return tier.fileRole ?? roles?.get(tier.name);
}

function openOrReuse(folder: string, db: Sqlite | undefined): { db: Sqlite; release: () => void } {
  if (db !== undefined) return { db, release: () => undefined };
  const opened = openProject(folder);
  return { db: opened.db, release: () => opened.close() };
}

function writeAnnotation(
  folder: string,
  sourceDir: string,
  file: string,
  bytes: Buffer,
  parsed: { tiers: Tier[]; audio: string[]; unprojected: ImportNotice[] },
  roles: Map<string, Role> | undefined,
  db?: Sqlite,
): ImportResult {
  const unprojected = [...parsed.unprojected];
  const created: string[] = [];
  let release = (): void => undefined;
  try {
    const source = remember(
      folder,
      `sources/${digestOf(bytes)}${path.extname(file).toLowerCase()}`,
      bytes,
      created,
    );
    const chosen = chooseIntervals(parsed.tiers, roles, unprojected);
    const held = openOrReuse(folder, db);
    release = held.release;
    let written = 0;
    if (chosen.length > 0) {
      const audio = findAudio(sourceDir, parsed.audio);
      const audioDigest = digestOf(audio.bytes);
      const audioExt = extensionOf(audio.name);
      const relpath = `media/${audioDigest}${audioExt}`;
      const duration = Math.max(
        0,
        ...chosen.flatMap((tier) => tier.intervals.map((row) => row.end)),
      );
      written = held.db.transaction(() => {
        if (blocked(held.db, 'manuscript')) {
          for (const tier of chosen) {
            unprojected.push({ name: tier.name, reason: 'manuscript is missing a required field' });
          }
          return 0;
        }
        const mediaId = readyMedia(
          held.db,
          folder,
          relpath,
          audio.bytes,
          audioDigest,
          duration,
          created,
        );
        if (mediaId === undefined) {
          for (const tier of chosen) {
            unprojected.push({ name: tier.name, reason: 'media is missing a required field' });
          }
          return 0;
        }
        return writeTiers(held.db, mediaId, file, source, chosen, unprojected);
      })();
    }
    release();
    release = () => undefined;
    return { paths: [folder], written, unprojected };
  } catch (error) {
    release();
    for (const copied of created) rmSync(copied, { force: true });
    throw error;
  }
}

function chooseIntervals(
  tiers: Tier[],
  roles: Map<string, Role> | undefined,
  unprojected: ImportNotice[],
): Array<Tier & { role: ProjectedRole }> {
  const chosen: Array<Tier & { role: ProjectedRole }> = [];
  for (const tier of tiers) {
    const role = resolvedRole(tier, roles);
    if (role === undefined) {
      unprojected.push({ name: tier.name, reason: 'tier role is missing' });
      continue;
    }
    if (role === 'exclude') {
      unprojected.push({ name: tier.name, reason: 'exclude' });
      continue;
    }
    const intervals: Interval[] = [];
    for (const row of tier.intervals) {
      if (!Number.isFinite(row.start) || !Number.isFinite(row.end) || row.end < row.start) {
        unprojected.push({ name: named(row.text, tier.name), reason: 'import field does not fit' });
        continue;
      }
      intervals.push(row);
    }
    if (intervals.length > 0) chosen.push({ ...tier, role, intervals });
  }
  return chosen;
}

function writeTiers(
  db: Sqlite,
  mediaId: string,
  file: string,
  source: SourceFile,
  tiers: Array<Tier & { role: ProjectedRole }>,
  unprojected: ImportNotice[],
): number {
  const manuscript = createManuscript(db, {
    title: { und: path.basename(file, path.extname(file)) },
    mediaId,
  });
  const speakers = new Map<string, string>();
  let written = 0;
  tiers.forEach((tier, index) => {
    if (blocked(db, 'layer')) {
      unprojected.push({ name: tier.name, reason: 'layer is missing a required field' });
      return;
    }
    const layer = createLayer(db, {
      manuscriptId: manuscript.id,
      key: `tier-${index}`,
      name: { und: tier.name },
      tierType: 'time-aligned',
      contentType: tier.role,
      sortOrder: index,
    });
    for (const row of tier.intervals) {
      if (blocked(db, 'unit')) {
        unprojected.push({
          name: named(row.text, tier.name),
          reason: 'unit is missing a required field',
        });
        continue;
      }
      const speakerId = speakerFor(db, speakers, row.speaker, unprojected);
      const unit = createUnit(db, {
        layerId: layer.id,
        startTime: row.start,
        endTime: row.end,
        text: row.text,
        ...(speakerId === undefined ? {} : { speakerId }),
      });
      stampUnit(db, unit.id, source);
      if (row.words !== undefined && row.words.length > 0) {
        projectWords(db, unit.id, row.text, row.words, unprojected);
      }
      written += 1;
    }
  });
  return written;
}

function readyMedia(
  db: Sqlite,
  folder: string,
  relpath: string,
  bytes: Buffer,
  digest: string,
  duration: number,
  created: string[],
): string | undefined {
  const absolute = path.join(folder, relpath);
  const row = db
    .prepare('SELECT id, sha256, deleted_at FROM media WHERE relpath = ?')
    .get(relpath) as { id: string; sha256: string; deleted_at: string | null } | undefined;
  if (row !== undefined) {
    if (!existsSync(absolute)) throw new Error('media file is missing');
    if (row.sha256 !== digest || digestOf(readFileSync(absolute)) !== digest) {
      throw new Error('media hash does not match');
    }
    if (row.deleted_at !== null) throw new Error('media file is missing');
    return row.id;
  }
  if (blocked(db, 'media')) return undefined;
  remember(folder, relpath, bytes, created);
  return createMedia(db, folder, { relpath, sha256: digest, duration }).id;
}

function projectWords(
  db: Sqlite,
  unitId: string,
  text: string,
  words: Word[],
  unprojected: ImportNotice[],
): void {
  const now = new Date().toISOString();
  const nodes: Array<Record<string, unknown>> = [];
  const relations: Array<Record<string, unknown>> = [];
  let tokenIndex = 0;
  for (const word of words) {
    if (word.form.length === 0) {
      unprojected.push({ name: text, reason: 'import field does not fit' });
      continue;
    }
    const tokenId = randomUUID();
    nodes.push(wordNode(tokenId, 'token', word, tokenIndex, now));
    tokenIndex += 1;
    word.morphemes?.forEach((morpheme, index) => {
      if (morpheme.form.length === 0) {
        unprojected.push({ name: word.form, reason: 'import field does not fit' });
        return;
      }
      const morphemeId = randomUUID();
      nodes.push(wordNode(morphemeId, 'morpheme', morpheme, index, now));
      relations.push({
        id: randomUUID(),
        type: 'hasPart',
        sourceId: tokenId,
        targetId: morphemeId,
      });
    });
  }
  if (nodes.length === 0) return;
  const material = readAnalysisMaterial(db, unitId);
  try {
    db.transaction(() => {
      writeGraph(db, material, {
        payloadVersion: 1,
        id: randomUUID(),
        text,
        nodes,
        relations,
      });
    })();
  } catch (error) {
    unprojected.push({
      name: text,
      reason: error instanceof Error ? error.message : 'import field does not fit',
    });
  }
}

function wordNode(
  id: string,
  type: 'token' | 'morpheme',
  word: Word,
  index: number,
  now: string,
): Record<string, unknown> {
  const gloss = word.gloss === undefined ? undefined : stringMap(word.gloss);
  return {
    id,
    type,
    label: word.form.slice(0, 256),
    domain: {
      form: { default: word.form },
      index,
      createdAt: now,
      updatedAt: now,
      ...(gloss === undefined || Object.keys(gloss).length === 0 ? {} : { gloss }),
      ...(word.pos === undefined || word.pos.length === 0 ? {} : { pos: word.pos }),
      provenance: { actorType: 'importer', method: 'import', createdAt: now },
    },
  };
}

function speakerFor(
  db: Sqlite,
  speakers: Map<string, string>,
  name: string | undefined,
  unprojected: ImportNotice[],
): string | undefined {
  if (name === undefined || name.length === 0) return undefined;
  const existing = speakers.get(name);
  if (existing !== undefined) return existing;
  if (blocked(db, 'speaker')) {
    unprojected.push({ name, reason: 'speaker is missing a required field' });
    return undefined;
  }
  const created = createSpeaker(db, { name });
  speakers.set(name, created.id);
  return created.id;
}

function stampUnit(db: Sqlite, unitId: string, source: SourceFile): void {
  db.prepare('UPDATE unit_texts SET provenance_json = ? WHERE unit_id = ?').run(
    JSON.stringify(source),
    unitId,
  );
}

function blocked(db: Sqlite, targetType: string): boolean {
  return listDefinitions(db).some(
    (definition) => definition.required && definition.targetType === targetType,
  );
}

function remember(folder: string, relpath: string, bytes: Buffer, created: string[]): SourceFile {
  const digest = digestOf(bytes);
  const absolute = insideProject(folder, relpath);
  if (existsSync(absolute)) {
    if (!statSync(absolute).isFile() || digestOf(readFileSync(absolute)) !== digest) {
      throw new Error('media hash does not match');
    }
    return { relpath, sha256: digest, format: path.extname(relpath).slice(1) };
  }
  mkdirSync(path.dirname(absolute), { recursive: true });
  const partial = `${absolute}.partial`;
  created.push(partial);
  writeFileSync(partial, bytes);
  if (digestOf(readFileSync(partial)) !== digest) throw new Error('media hash does not match');
  renameSync(partial, absolute);
  created.splice(created.indexOf(partial), 1);
  created.push(absolute);
  return { relpath, sha256: digest, format: path.extname(relpath).slice(1) };
}

function insideProject(folder: string, relpath: string): string {
  if (relpath.length === 0 || relpath.includes('\0') || path.isAbsolute(relpath)) {
    throw new Error('media path escapes the project folder');
  }
  const parts = relpath.split('\\').join('/').split('/');
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
    throw new Error('media path escapes the project folder');
  }
  const root = realpathSync(path.resolve(folder));
  const parent = path.resolve(root, ...parts.slice(0, -1));
  mkdirSync(parent, { recursive: true });
  const realParent = realpathSync(parent);
  if (realParent !== root && !realParent.startsWith(`${root}${path.sep}`)) {
    throw new Error('media path escapes the project folder');
  }
  const target = path.join(realParent, parts[parts.length - 1] ?? '');
  if (existsSync(target) && (lstatSync(target).isSymbolicLink() || !statSync(target).isFile())) {
    throw new Error('media path escapes the project folder');
  }
  return target;
}

function named(text: string, fallback: string): string {
  return text.length > 0 ? text : fallback;
}

function extensionOf(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return ext.length > 0 ? ext : '.wav';
}

function digestOf(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function findAudio(sourceDir: string, names: string[]): { name: string; bytes: Buffer } {
  for (const name of names) {
    const candidate = path.join(sourceDir, name);
    if (!existsSync(candidate)) continue;
    try {
      if (!statSync(candidate).isFile()) continue;
    } catch {
      continue;
    }
    return { name, bytes: readFileSync(candidate) };
  }
  throw new Error('media file is missing');
}

function sameStemWav(file: string): string {
  return `${path.basename(file, path.extname(file))}.wav`;
}

function storedRole(value: string | undefined): Role | undefined {
  if (value === 'notes') return 'note';
  if (
    value === 'transcription' ||
    value === 'translation' ||
    value === 'note' ||
    value === 'exclude'
  ) {
    return value;
  }
  if (value === undefined) return undefined;
  throw new Error('tier role is invalid');
}

function lossNotices(losses: Array<{ code: string; name?: string }> | undefined): ImportNotice[] {
  return (losses ?? []).map((loss) => ({
    name: loss.name ?? loss.code,
    reason: loss.code,
  }));
}

function asWords(tokens: unknown): Word[] {
  if (!Array.isArray(tokens)) return [];
  return tokens.flatMap((token) => {
    const word = oneWord(token);
    return word === undefined ? [] : [word];
  });
}

function oneWord(token: unknown): Word | undefined {
  if (typeof token !== 'object' || token === null) return undefined;
  const row = token as {
    form?: Record<string, string> | string;
    gloss?: Record<string, string>;
    pos?: string;
    morphemes?: unknown;
  };
  const form = typeof row.form === 'string' ? row.form : row.form?.default;
  if (typeof form !== 'string' || form.length === 0) return undefined;
  const morphemes = asWords(row.morphemes);
  return {
    form,
    ...(row.gloss === undefined ? {} : { gloss: stringMap(row.gloss) }),
    ...(typeof row.pos === 'string' && row.pos.length > 0 ? { pos: row.pos } : {}),
    ...(morphemes.length > 0 ? { morphemes } : {}),
  };
}

function stringMap(value: Record<string, string>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [key, text] of Object.entries(value)) {
    if (key.length > 0 && typeof text === 'string') map[key] = text;
  }
  return map;
}

function eafTiers(
  xml: string,
  file: string,
): { tiers: Tier[]; audio: string[]; unprojected: ImportNotice[] } {
  const parsed = importFromEaf(xml);
  const unprojected = lossNotices(parsed.losses);
  for (const media of parsed.secondaryMedia ?? []) {
    unprojected.push({ name: media.filename, reason: 'import field does not fit' });
  }
  if (parsed.unrecognizedTimeUnit === true) {
    unprojected.push({ name: 'time', reason: 'unrecognized time unit' });
    return { tiers: [], audio: audioName(file, parsed.mediaFilename), unprojected };
  }
  const tiers: Tier[] = [];
  if (parsed.transcriptionTierName !== undefined) {
    tiers.push({
      name: parsed.transcriptionTierName,
      fileRole:
        storedRole(parsed.tierMetadata.get(parsed.transcriptionTierName)?.role) ?? 'transcription',
      intervals: parsed.units.map((unit) => ({
        start: unit.startTime,
        end: unit.endTime,
        text: unit.transcription,
        ...(unit.speakerId === undefined ? {} : { speaker: unit.speakerId }),
        ...(unit.tokens === undefined ? {} : { words: asWords(unit.tokens) }),
      })),
    });
  }
  for (const extra of parsed.extraTranscriptionTiers ?? []) {
    tiers.push({
      name: extra.tierName,
      fileRole: storedRole(parsed.tierMetadata.get(extra.tierName)?.role) ?? 'transcription',
      intervals: extra.units.map((unit) => ({
        start: unit.startTime,
        end: unit.endTime,
        text: unit.transcription,
        ...(unit.tokens === undefined ? {} : { words: asWords(unit.tokens) }),
      })),
    });
  }
  for (const [name, rows] of parsed.translationTiers) {
    tiers.push({
      name,
      fileRole: storedRole(parsed.tierMetadata.get(name)?.role) ?? 'translation',
      intervals: rows.map((row) => ({ start: row.startTime, end: row.endTime, text: row.text })),
    });
  }
  if ((parsed.userNotes?.length ?? 0) > 0) {
    tiers.push({
      name: 'notes',
      fileRole: 'note',
      intervals: (parsed.userNotes ?? []).map((row) => ({
        start: row.startTime,
        end: row.endTime,
        text: row.text,
      })),
    });
  }
  return { tiers, audio: audioName(file, parsed.mediaFilename), unprojected };
}

function flexTiers(
  xml: string,
  file: string,
): { tiers: Tier[]; audio: string[]; unprojected: ImportNotice[] } {
  const missing = phrasesMissingEnd(xml);
  const parsed = importFromFlextext(xml);
  const unprojected = lossNotices(parsed.losses);
  const units = parsed.units.filter((unit) => {
    if (unit.phraseId !== undefined && missing.has(unit.phraseId)) {
      unprojected.push({
        name: named(unit.transcription, unit.phraseId),
        reason: 'import field does not fit',
      });
      return false;
    }
    return true;
  });
  const tiers: Tier[] = [];
  if (parsed.transcriptionTierName !== undefined) {
    tiers.push({
      name: parsed.transcriptionTierName,
      fileRole: 'transcription',
      intervals: units.map((unit) => ({
        start: unit.startTime,
        end: unit.endTime,
        text: unit.transcription,
        ...(unit.speakerId === undefined ? {} : { speaker: unit.speakerId }),
        ...(unit.tokens === undefined ? {} : { words: asWords(unit.tokens) }),
      })),
    });
  }
  if (parsed.phraseGlosses.size > 0) {
    tiers.push({
      name: 'FLEx Gloss',
      fileRole: 'translation',
      intervals: units.flatMap((unit) => {
        const text =
          unit.phraseId === undefined ? undefined : parsed.phraseGlosses.get(unit.phraseId);
        return text === undefined ? [] : [{ start: unit.startTime, end: unit.endTime, text }];
      }),
    });
  }
  for (const [name, rows] of parsed.translationTiers ?? []) {
    tiers.push({
      name,
      fileRole: 'translation',
      intervals: rows.map((row) => ({ start: row.startTime, end: row.endTime, text: row.text })),
    });
  }
  if ((parsed.userNotes?.length ?? 0) > 0) {
    tiers.push({
      name: 'FLEx Note',
      fileRole: 'note',
      intervals: (parsed.userNotes ?? []).map((row) => ({
        start: row.startTime,
        end: row.endTime,
        text: row.text,
      })),
    });
  }
  for (const [name, rows] of parsed.additionalTiers) {
    tiers.push({
      name,
      intervals: rows.map((row) => ({
        start: row.startTime,
        end: row.endTime,
        text: row.text,
        ...(row.tokens === undefined ? {} : { words: asWords(row.tokens) }),
      })),
    });
  }
  return { tiers, audio: audioName(file), unprojected };
}

function phrasesMissingEnd(xml: string): Set<string> {
  const missing = new Set<string>();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const phrases = [...doc.getElementsByTagName('phrase')];
  phrases.forEach((phrase, index) => {
    if (phrase.getAttribute('end-time-offset') !== null) return;
    const guid = phrase.getAttribute('guid')?.trim() ?? '';
    missing.add(guid.length > 0 ? guid : `p${index + 1}`);
  });
  return missing;
}

function textGridTiers(
  text: string,
  file: string,
): { tiers: Tier[]; audio: string[]; unprojected: ImportNotice[] } {
  const parsed = importFromTextGrid(text);
  const tiers: Tier[] = [];
  if (parsed.transcriptionTierName !== undefined) {
    tiers.push({
      name: parsed.transcriptionTierName,
      fileRole:
        storedRole(parsed.tierMetadata.get(parsed.transcriptionTierName)?.role) ?? 'transcription',
      intervals: parsed.units.map((unit) => ({
        start: unit.startTime,
        end: unit.endTime,
        text: unit.transcription,
      })),
    });
  }
  for (const [name, rows] of parsed.additionalTiers) {
    tiers.push({
      name,
      fileRole: storedRole(parsed.tierMetadata.get(name)?.role),
      intervals: rows.map((row) => ({ start: row.startTime, end: row.endTime, text: row.text })),
    });
  }
  return { tiers, audio: audioName(file), unprojected: lossNotices(parsed.losses) };
}

function toolboxTiers(
  text: string,
  file: string,
): { tiers: Tier[]; audio: string[]; unprojected: ImportNotice[] } {
  const parsed = importFromToolbox(text);
  const unprojected = lossNotices(parsed.losses);
  if (parsed.timelineMetadata !== undefined) {
    unprojected.push({ name: 'timeline', reason: 'import field does not fit' });
  }
  const missing = toolboxMissingEnd(text);
  const aligned = missing.length === parsed.units.length;
  const intervals: Interval[] = [];
  if (!aligned && missing.some(Boolean)) {
    unprojected.push({ name: 'tx', reason: 'import field does not fit' });
  } else {
    parsed.units.forEach((unit, index) => {
      if (aligned && missing[index] === true) {
        unprojected.push({
          name: named(unit.transcription, 'tx'),
          reason: 'import field does not fit',
        });
        return;
      }
      intervals.push({
        start: unit.startTime,
        end: unit.endTime,
        text: unit.transcription,
        ...(unit.tokens === undefined ? {} : { words: asWords(unit.tokens) }),
      });
    });
  }
  const tiers: Tier[] = [{ name: 'tx', fileRole: 'transcription', intervals }];
  for (const [name, rows] of parsed.additionalTiers) {
    const tierName = name === 'Toolbox Free Translation' ? 'ft' : name;
    tiers.push({
      name: tierName,
      ...(tierName === 'ft' ? { fileRole: 'translation' as const } : {}),
      intervals: rows.map((row) => ({
        start: row.startTime,
        end: row.endTime,
        text: row.text,
        ...(row.tokens === undefined ? {} : { words: asWords(row.tokens) }),
      })),
    });
  }
  return { tiers, audio: audioName(file), unprojected };
}

function toolboxMissingEnd(text: string): boolean[] {
  const records: Array<{ tx: boolean; te: boolean }> = [];
  let current = { tx: false, te: false, used: false };
  const flush = (): void => {
    if (!current.used) return;
    records.push({ tx: current.tx, te: current.te });
    current = { tx: false, te: false, used: false };
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const match = /^\\([^\s]+)/.exec(line.trim());
    if (match === null) continue;
    const marker = match[1]?.toLowerCase();
    if (marker === 'ref' && current.used) flush();
    if (marker === 'tx') {
      current.tx = true;
      current.used = true;
    }
    if (marker === 'te') {
      current.te = true;
      current.used = true;
    }
  }
  flush();
  return records.filter((record) => record.tx).map((record) => !record.te);
}

function audioName(file: string, named?: string): string[] {
  if (named !== undefined && named.length > 0 && named !== 'unknown.wav')
    return [path.basename(named)];
  return [sameStemWav(file)];
}

function importLift(
  folder: string,
  file: string,
  bytes: Buffer,
  xml: string,
  db?: Sqlite,
): ImportResult {
  const parsed = parseLiftXml(xml, 'desktop');
  if (!parsed.ok) throw new Error('import field does not fit');
  const unprojected: ImportNotice[] = [
    ...parsed.diagnostics.map((row) => ({ name: row.entryId, reason: row.code })),
    ...lossNotices(parsed.losses),
  ];
  const created: string[] = [];
  let release = (): void => undefined;
  try {
    const source = remember(folder, `sources/${digestOf(bytes)}.lift`, bytes, created);
    const images = liftImages(path.dirname(file), xml);
    const held = openOrReuse(folder, db);
    release = held.release;
    const written = held.db.transaction(() => {
      if (blocked(held.db, 'lexeme') || blocked(held.db, 'lexeme-sense')) {
        for (const lexeme of parsed.lexemes) {
          unprojected.push({
            name: headwordOf(lexeme.entry),
            reason: blocked(held.db, 'lexeme')
              ? 'lexeme is missing a required field'
              : 'lexeme-sense is missing a required field',
          });
        }
        return 0;
      }
      let count = 0;
      const idMap = new Map<string, string>();
      for (const lexeme of parsed.lexemes) collectIds(lexeme.entry, idMap);
      for (const lexeme of parsed.lexemes) {
        const sourceEntryId = entryId(lexeme.entry);
        const rewritten = rewriteIds(lexeme.entry, idMap) as Record<string, unknown>;
        const saved = saveLexemeEntry(held.db, { id: String(rewritten.id), entry: rewritten });
        const senses = sensePairs(lexeme.entry, idMap);
        held.db
          .prepare('UPDATE lexemes SET provenance_json = ? WHERE id = ?')
          .run(JSON.stringify({ ...source, sourceEntryId, senses }), saved.id);
        for (const href of images.get(sourceEntryId) ?? []) {
          const image = readFileSync(href.absolute);
          const digest = digestOf(image);
          remember(folder, `attachments/objects/${digest}`, image, created);
          publishAttachment(held.db, folder, {
            operationId: `img${digest.slice(0, 16)}${count}`,
            lexemeId: saved.id,
            bytes: image,
            kind: 'image',
            mimeType: href.mimeType,
            displayName: href.name,
          });
        }
        count += 1;
      }
      return count;
    })();
    release();
    release = () => undefined;
    return { paths: [folder], written, unprojected };
  } catch (error) {
    release();
    for (const copied of created) rmSync(copied, { force: true });
    throw error;
  }
}

function headwordOf(entry: unknown): string {
  if (typeof entry !== 'object' || entry === null) return 'entry';
  const headword = (entry as { headword?: unknown }).headword;
  return typeof headword === 'string' && headword.length > 0 ? headword : 'entry';
}

function entryId(entry: unknown): string {
  if (typeof entry !== 'object' || entry === null) return '';
  const id = (entry as { id?: unknown }).id;
  return typeof id === 'string' ? id : '';
}

function collectIds(value: unknown, ids: Map<string, string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, ids);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const record = value as Record<string, unknown>;
  if (typeof record.id === 'string' && record.id.length > 0 && !ids.has(record.id)) {
    ids.set(record.id, randomUUID());
  }
  for (const child of Object.values(record)) collectIds(child, ids);
}

function rewriteIds(value: unknown, ids: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteIds(item, ids));
  if (typeof value !== 'object' || value === null) return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((key === 'id' || key.endsWith('Id')) && typeof child === 'string' && ids.has(child)) {
      next[key] = ids.get(child);
      continue;
    }
    next[key] = rewriteIds(child, ids);
  }
  return next;
}

function sensePairs(
  entry: unknown,
  ids: Map<string, string>,
): Array<{ sourceId: string; id: string }> {
  if (typeof entry !== 'object' || entry === null) return [];
  const senses = (entry as { senses?: unknown }).senses;
  if (!Array.isArray(senses)) return [];
  return senses.flatMap((sense) => {
    if (typeof sense !== 'object' || sense === null) return [];
    const sourceId = (sense as { id?: unknown }).id;
    if (typeof sourceId !== 'string') return [];
    const id = ids.get(sourceId);
    return id === undefined ? [] : [{ sourceId, id }];
  });
}

function liftImages(
  sourceDir: string,
  xml: string,
): Map<string, Array<{ absolute: string; name: string; mimeType: string }>> {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const images = new Map<string, Array<{ absolute: string; name: string; mimeType: string }>>();
  for (const entry of doc.getElementsByTagName('entry')) {
    const id = entry.getAttribute('id') ?? '';
    if (id.length === 0) continue;
    const refs: Array<{ absolute: string; name: string; mimeType: string }> = [];
    for (const illustration of entry.getElementsByTagName('illustration')) {
      const href = illustration.getAttribute('href') ?? '';
      if (
        href.length === 0 ||
        path.isAbsolute(href) ||
        href.includes('..') ||
        href.includes('\0')
      ) {
        throw new Error('media file is missing');
      }
      const absolute = path.resolve(sourceDir, href);
      if (
        !absolute.startsWith(path.resolve(sourceDir) + path.sep) &&
        absolute !== path.resolve(sourceDir)
      ) {
        throw new Error('media file is missing');
      }
      if (!existsSync(absolute) || !statSync(absolute).isFile())
        throw new Error('media file is missing');
      refs.push({ absolute, name: path.basename(href), mimeType: imageMime(href) });
    }
    if (refs.length > 0) images.set(id, refs);
  }
  return images;
}

function imageMime(file: string): string {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

const JYB_MIME = 'application/vnd.jieyu.jyb';

function importJyb(parent: string, bytes: Uint8Array): ImportResult {
  assertZipBounded(bytes);
  const files = unzipSync(bytes);
  const mime = files.mimetype === undefined ? '' : strFromU8(files.mimetype).trim();
  if (mime !== JYB_MIME) throw new Error('desktop package is unreadable');
  const library = files['data/library.json'];
  if (library === undefined) throw new Error('desktop package is unreadable');
  const data = JSON.parse(strFromU8(library)) as {
    projects?: Array<{ name?: unknown; collections?: Record<string, unknown> }>;
  };
  const projects = data.projects ?? [];
  const names = projects.map((project) => projectName(project.name));
  if (new Set(names).size !== names.length) throw new Error('project name is already used');
  for (const name of names) {
    if (existsSync(path.join(parent, name))) throw new Error('project name is already used');
  }
  const plans = projects.map((project, index) =>
    planJyb(project.collections ?? {}, names[index] ?? '', files),
  );
  const created: string[] = [];
  const unprojected: ImportNotice[] = [];
  let written = 0;
  try {
    const paths = plans.map((plan) => {
      const folder = path.join(parent, plan.name);
      mkdirSync(folder);
      created.push(folder);
      const stored = writeJybProject(folder, plan, bytes, files);
      written += stored.written;
      unprojected.push(
        ...stored.unprojected.map((notice) => ({ ...notice, name: `${plan.name}/${notice.name}` })),
      );
      return folder;
    });
    return { paths, written, unprojected };
  } catch (error) {
    for (const folder of created) rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}

function projectName(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value === '.' || value === '..') {
    throw new Error('project name is invalid');
  }
  if (value.includes('/') || value.includes('\\') || value.includes('\0')) {
    throw new Error('project name is invalid');
  }
  return value;
}

type JybMedia = { sourceId: string; filename: string; duration: number; sha256: string };
type JybText = { sourceId: string; title: Record<string, string> };
type JybLayer = {
  sourceId: string;
  textId?: string | undefined;
  key: string;
  name: Record<string, string>;
  contentType: string;
  tierType: string;
};
type JybUnit = {
  sourceLayerId: string;
  sourceMediaId: string;
  start: number;
  end: number;
  text: string;
};
type JybPlan = {
  name: string;
  media: JybMedia[];
  texts: JybText[];
  layers: JybLayer[];
  units: JybUnit[];
  unprojected: ImportNotice[];
};

function planJyb(
  collections: Record<string, unknown>,
  name: string,
  files: Record<string, Uint8Array>,
): JybPlan {
  const unprojected: ImportNotice[] = [];
  for (const [table, rows] of Object.entries(collections)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    if (!JYB_TABLES.has(table))
      unprojected.push({ name: table, reason: 'import field does not fit' });
  }
  const media = takeRows(collections.media_items, MEDIA_KEYS, 'media_items', unprojected).flatMap(
    (row) => {
      const sourceId = optionalString(row.id);
      const filename = optionalString(row.filename);
      const sha = optionalString(row.contentSha256);
      const duration = optionalNumber(row.duration);
      if (
        sourceId === undefined ||
        filename === undefined ||
        sha === undefined ||
        duration === undefined
      ) {
        unprojected.push({ name: 'media_items', reason: 'import field does not fit' });
        return [];
      }
      const packed = files[`media/${sourceId}`];
      if (packed === undefined) throw new Error('media file is missing');
      if (digestOf(packed) !== sha) throw new Error('media hash does not match');
      return [{ sourceId, filename, duration, sha256: sha }];
    },
  );
  const texts = takeRows(collections.texts, TEXT_KEYS, 'texts', unprojected).flatMap((row) => {
    const sourceId = optionalString(row.id) ?? randomUUID();
    try {
      return [{ sourceId, title: titleOf(row.title) }];
    } catch {
      unprojected.push({ name: sourceId, reason: 'import field does not fit' });
      return [];
    }
  });
  const layers = takeRows(
    collections.tier_definitions,
    TIER_KEYS,
    'tier_definitions',
    unprojected,
  ).flatMap((row) => {
    const sourceId = optionalString(row.id);
    const key = optionalString(row.key);
    const contentType = optionalString(row.contentType);
    const tierType = optionalString(row.tierType) ?? 'time-aligned';
    if (
      sourceId === undefined ||
      key === undefined ||
      contentType === undefined ||
      !CONTENT_TYPES.has(contentType) ||
      !TIER_TYPES.has(tierType)
    ) {
      unprojected.push({ name: key ?? 'tier_definitions', reason: 'import field does not fit' });
      return [];
    }
    try {
      return [
        {
          sourceId,
          ...(optionalString(row.textId) === undefined
            ? {}
            : { textId: optionalString(row.textId) }),
          key,
          name: titleOf(row.name),
          contentType,
          tierType,
        },
      ];
    } catch {
      unprojected.push({ name: key, reason: 'import field does not fit' });
      return [];
    }
  });
  const units = takeRows(collections.layer_units, UNIT_KEYS, 'layer_units', unprojected).flatMap(
    (row) => {
      const sourceLayerId = optionalString(row.layerId);
      const sourceMediaId = optionalString(row.mediaId);
      const start = optionalNumber(row.startTime);
      const end = optionalNumber(row.endTime);
      const text = optionalString(row.text);
      if (
        sourceLayerId === undefined ||
        sourceMediaId === undefined ||
        start === undefined ||
        end === undefined ||
        text === undefined ||
        end < start
      ) {
        unprojected.push({ name: text ?? 'layer_units', reason: 'import field does not fit' });
        return [];
      }
      return [{ sourceLayerId, sourceMediaId, start, end, text }];
    },
  );
  return { name, media, texts, layers, units, unprojected };
}

function writeJybProject(
  folder: string,
  plan: JybPlan,
  packageBytes: Uint8Array,
  files: Record<string, Uint8Array>,
): { written: number; unprojected: ImportNotice[] } {
  const created: string[] = [];
  const unprojected = [...plan.unprojected];
  let project: ReturnType<typeof openProject> | undefined;
  try {
    const source = remember(
      folder,
      `sources/${digestOf(packageBytes)}.jyb`,
      Buffer.from(packageBytes),
      created,
    );
    const opened = openProject(folder);
    project = opened;
    const written = opened.db.transaction(() => {
      const mediaIds = new Map<string, string>();
      for (const media of plan.media) {
        const ext = extensionOf(media.filename);
        const relpath = `media/${media.sha256}${ext}`;
        const packed = files[`media/${media.sourceId}`];
        if (packed === undefined) throw new Error('media file is missing');
        const id = readyMedia(
          opened.db,
          folder,
          relpath,
          Buffer.from(packed),
          media.sha256,
          media.duration,
          created,
        );
        if (id === undefined) {
          unprojected.push({ name: media.filename, reason: 'media is missing a required field' });
          continue;
        }
        mediaIds.set(media.sourceId, id);
      }
      const layers = assignLayers(plan, unprojected);
      const layerIds = new Set(layers.map((layer) => layer.sourceId));
      for (const unit of plan.units) {
        if (layerIds.has(unit.sourceLayerId)) continue;
        unprojected.push({ name: unit.text, reason: 'import field does not fit' });
      }
      let count = 0;
      for (const text of plan.texts) {
        const textLayers = layers.filter((layer) => layer.textId === text.sourceId);
        const textUnits = plan.units.filter((unit) =>
          textLayers.some((layer) => layer.sourceId === unit.sourceLayerId),
        );
        const mediaSource = textUnits[0]?.sourceMediaId ?? plan.media[0]?.sourceId;
        const mediaId = mediaSource === undefined ? undefined : mediaIds.get(mediaSource);
        if (mediaId === undefined || blocked(opened.db, 'manuscript')) {
          unprojected.push({
            name: text.sourceId,
            reason:
              mediaId === undefined
                ? 'media file is missing'
                : 'manuscript is missing a required field',
          });
          continue;
        }
        const manuscript = createManuscript(opened.db, { title: text.title, mediaId });
        textLayers.forEach((layer, index) => {
          if (blocked(opened.db, 'layer')) {
            unprojected.push({ name: layer.key, reason: 'layer is missing a required field' });
            return;
          }
          const stored = createLayer(opened.db, {
            manuscriptId: manuscript.id,
            key: layer.key,
            name: layer.name,
            tierType: layer.tierType,
            contentType: layer.contentType,
            sortOrder: index,
          });
          for (const unit of textUnits) {
            if (unit.sourceLayerId !== layer.sourceId) continue;
            if (mediaIds.get(unit.sourceMediaId) !== mediaId) {
              unprojected.push({ name: unit.text, reason: 'import field does not fit' });
              continue;
            }
            if (blocked(opened.db, 'unit')) {
              unprojected.push({ name: unit.text, reason: 'unit is missing a required field' });
              continue;
            }
            const createdUnit = createUnit(opened.db, {
              layerId: stored.id,
              startTime: unit.start,
              endTime: unit.end,
              text: unit.text,
            });
            stampUnit(opened.db, createdUnit.id, source);
            count += 1;
          }
        });
      }
      return count;
    })();
    project.close();
    return { written, unprojected };
  } catch (error) {
    project?.close();
    for (const copied of created) rmSync(copied, { force: true });
    throw error;
  }
}

function assignLayers(plan: JybPlan, unprojected: ImportNotice[]): JybLayer[] {
  const textIds = new Set(plan.texts.map((text) => text.sourceId));
  const kept: JybLayer[] = [];
  for (const layer of plan.layers) {
    if (layer.textId === undefined && plan.texts.length === 1) {
      const only = plan.texts[0]?.sourceId;
      if (only !== undefined) kept.push({ ...layer, textId: only });
      continue;
    }
    if (layer.textId !== undefined && textIds.has(layer.textId)) {
      kept.push(layer);
      continue;
    }
    unprojected.push({ name: layer.key, reason: 'import field does not fit' });
  }
  return kept;
}

function takeRows(
  value: unknown,
  keys: Set<string>,
  table: string,
  unprojected: ImportNotice[],
): Array<Record<string, unknown>> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    unprojected.push({ name: table, reason: 'import field does not fit' });
    return [];
  }
  return value.flatMap((row) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      unprojected.push({ name: table, reason: 'import field does not fit' });
      return [];
    }
    const record = row as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!keys.has(key))
        unprojected.push({ name: `${table}.${key}`, reason: 'import field does not fit' });
    }
    return [record];
  });
}

function titleOf(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('import field does not fit');
  }
  const title: Record<string, string> = {};
  for (const [key, text] of Object.entries(value)) {
    if (typeof text !== 'string' || text.length === 0) throw new Error('import field does not fit');
    title[key] = text;
  }
  if (Object.keys(title).length === 0) throw new Error('import field does not fit');
  return title;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}
