// Renderer-safe: type imports and pure checks only. Handlers stay in the main process.
import type {
  AttachmentKind,
  AttachmentBytes,
  AttachmentCleanup,
  AttachmentLinkRemoval,
  AttachmentLinkView,
  AttachmentPublication,
  AttachmentPublish,
} from './attachments';
import type { CustomFieldMigrationPreview } from './customFieldMigration';
import type { CustomFieldPurgePreview } from './customFieldPurge';
import type {
  CustomFieldDefinition,
  CustomFieldHostPreview,
  CustomFieldHostValue,
  CustomFieldLocation,
  CustomFieldPreview,
  CustomFieldUnitValue,
} from './customFields';
import type {
  BridgeCreate,
  LanguageEnsure,
  OrthographyCreate,
  ProjectBridge,
  ProjectLanguage,
  ProjectOrthography,
} from './catalog';
import type { LexemeLinkCandidate, TokenLexemeLink } from './lexemeLink';
import type { JieyuAnchoredNote } from '../dmlexTypes';
import type { LexemeLinkWrite, LexemeSave, ProjectLexeme, ProjectLexemeLink } from './lexicon';
import type {
  ContentNote,
  ContentNoteAnchor,
  ContentNoteCategory,
  ContentNoteQuery,
  ContentNoteRevision,
  ContentNoteWrite,
} from './notes';
import type { CorpusQuery, CorpusQueryCursor, CorpusQueryPage } from './corpusQuery';
import type { Layer, LayerCreate } from './layers';
import type {
  AcceptableRun,
  ModelRun,
  ModelRunFinish,
  ModelRunStart,
  PreviewCandidate,
  PreviewCandidateInput,
  TranscriptionAcceptance,
} from './modelRuns';
import type { DeletionReminder, DueDeletionReminder } from './manuscriptPurge';
import type {
  Manuscript,
  ManuscriptCreate,
  ManuscriptDeletePreview,
  RecordingDeletePreview,
  RecordingDeletion,
} from './manuscripts';
import type { DeletedMedia, Media, MediaCreate } from './media';
import type { MediaCleanup } from './mediaCleanup';
import type { MediaReregistration } from './mediaReregister';
import type { ProjectIdentity } from './projectIdentity';
import type { SourceCreate, SourcePatch, SourceReading, SourceRecord } from './sourceFields';
import type { SpeakerPatch, SpeakerReading } from './speakerFields';
import type { Speaker } from './speakers';
import type { ConversationPatch, ConversationReading } from './conversationFields';
import type { Conversation, ConversationCreate } from './conversations';
import type { Message, MessageAppend } from './messages';
import type { BibliographyPatch, BibliographyReading } from './bibliographyFields';
import type { LexemeLinkReading } from './referenceState';
import type { ImportResult } from './foreignImport';
import type { AnalysisApplyResult } from './analysis';
import type { AnalysisImportResult } from './analysisImport';
import type { AnalysisCandidateRecord } from './analysisCandidates';
import type {
  AnalysisAcceptResult,
  AnalysisCredentials,
  AnalysisReadState,
  UnitMorpheme,
  UnitWord,
} from './analysisRestore';
import type { AnalysisRoot, Unit, UnitCreate } from './units';

type UndoPolicy = 'keep' | 'clear' | 'replace-on-success';

type OperationSpec<U extends UndoPolicy, I, O> = {
  readonly undo: U;
  readonly check: (input: Record<string, unknown>) => I;
  readonly output: O;
};

function spec<U extends UndoPolicy, I, O>(
  undo: U,
  check: (input: Record<string, unknown>) => I,
): OperationSpec<U, I, O> {
  return { undo, check, output: undefined as O };
}

function knownKeys(input: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new Error(`desktop call field ${key} is not supported`);
  }
}

function objectArg(args: unknown): Record<string, unknown> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new Error('desktop call args must be an object');
  }
  return args as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`desktop call ${name} must be a string`);
  }
  return value;
}

function optionalString(value: unknown, name: string): string | null {
  if (value === null) return null;
  return requiredString(value, name);
}

function requiredNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`desktop call ${name} must be a number`);
  }
  return value;
}

function stringMap(value: unknown, name: string): Record<string, string> {
  const record = objectArg(value);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== 'string') throw new Error(`desktop call ${name} values must be strings`);
    out[key] = item;
  }
  return out;
}

function fieldValueMap(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('desktop call fieldValues must be an object');
  }
  return value as Record<string, unknown>;
}

function checkLayerCreate(input: Record<string, unknown>): LayerCreate {
  knownKeys(input, [
    'manuscriptId',
    'key',
    'name',
    'tierType',
    'contentType',
    'languageId',
    'orthographyId',
    'parentId',
    'sortOrder',
    'fieldValues',
  ]);
  return {
    manuscriptId: requiredString(input.manuscriptId, 'manuscriptId'),
    key: requiredString(input.key, 'key'),
    name: stringMap(input.name, 'name'),
    tierType: requiredString(input.tierType, 'tierType'),
    contentType: requiredString(input.contentType, 'contentType'),
    ...('languageId' in input
      ? { languageId: optionalString(input.languageId, 'languageId') }
      : {}),
    ...('orthographyId' in input
      ? { orthographyId: optionalString(input.orthographyId, 'orthographyId') }
      : {}),
    ...('parentId' in input ? { parentId: optionalString(input.parentId, 'parentId') } : {}),
    ...('sortOrder' in input ? { sortOrder: requiredNumber(input.sortOrder, 'sortOrder') } : {}),
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
  };
}

function aliasInput(value: unknown): { alias: string; aliasType: string } {
  const record = objectArg(value);
  return {
    alias: requiredString(record.alias, 'alias'),
    aliasType: requiredString(record.aliasType, 'aliasType'),
  };
}

function languageEnsure(input: Record<string, unknown>): LanguageEnsure {
  const aliases = input.aliases;
  return {
    name: stringMap(input.name, 'name'),
    sourceType: requiredString(input.sourceType, 'sourceType'),
    ...(typeof input.iso6393 === 'string' ? { iso6393: input.iso6393 } : {}),
    ...(typeof input.glottocode === 'string' ? { glottocode: input.glottocode } : {}),
    ...(Array.isArray(aliases) ? { aliases: aliases.map(aliasInput) } : {}),
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
  };
}

function orthographyCreate(input: Record<string, unknown>): OrthographyCreate {
  return {
    languageId: requiredString(input.languageId, 'languageId'),
    name: stringMap(input.name, 'name'),
    scriptTag: requiredString(input.scriptTag, 'scriptTag'),
    sourceType: requiredString(input.sourceType, 'sourceType'),
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
  };
}

function bridgeRules(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('bridge rules must be an object');
  }
  return value as Record<string, unknown>;
}

function bridgeCreate(input: Record<string, unknown>): BridgeCreate {
  const sampleCases = input.sampleCases;
  return {
    sourceOrthographyId: requiredString(input.sourceOrthographyId, 'sourceOrthographyId'),
    targetOrthographyId: requiredString(input.targetOrthographyId, 'targetOrthographyId'),
    engine: requiredString(input.engine, 'engine'),
    rules: bridgeRules(input.rules),
    ...(typeof input.sampleInput === 'string' ? { sampleInput: input.sampleInput } : {}),
    ...(typeof input.sampleOutput === 'string' ? { sampleOutput: input.sampleOutput } : {}),
    ...(Array.isArray(sampleCases)
      ? {
          sampleCases: sampleCases.map((item) => {
            const record = objectArg(item);
            const expectedOutput = record.expectedOutput;
            return {
              input: requiredString(record.input, 'input'),
              ...(typeof expectedOutput === 'string' ? { expectedOutput } : {}),
            };
          }),
        }
      : {}),
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
  };
}

function senseFieldValueMap(value: unknown): Record<string, Record<string, unknown>> {
  const record = fieldValueMap(value);
  const senses: Record<string, Record<string, unknown>> = {};
  for (const [senseId, item] of Object.entries(record)) {
    senses[senseId] = fieldValueMap(item);
  }
  return senses;
}

function booleanMap(value: unknown): Record<string, boolean> {
  const record = objectArg(value);
  const tags: Record<string, boolean> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== 'boolean') throw new Error('lexeme tags are invalid');
    tags[key] = item;
  }
  return tags;
}

function accessArg(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('lexeme access is invalid');
  return value;
}

function linkWrite(value: unknown): LexemeLinkWrite {
  const record = objectArg(value);
  return {
    targetType: requiredString(record.targetType, 'targetType'),
    targetId: requiredString(record.targetId, 'targetId'),
    senseId: requiredString(record.senseId, 'senseId'),
    ...(typeof record.role === 'string' ? { role: record.role } : {}),
  };
}

function lexemeSave(input: Record<string, unknown>): LexemeSave {
  const tags = input.tags;
  const link = input.link;
  return {
    ...(typeof input.id === 'string' ? { id: input.id } : {}),
    entry: objectArg(input.entry),
    ...(input.jieyu === undefined ? {} : { jieyu: objectArg(input.jieyu) }),
    ...(tags === undefined ? {} : { tags: booleanMap(tags) }),
    ...('accessRights' in input ? { accessRights: accessArg(input.accessRights) } : {}),
    ...(link === undefined ? {} : { link: linkWrite(link) }),
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
    ...('senseFieldValues' in input
      ? { senseFieldValues: senseFieldValueMap(input.senseFieldValues) }
      : {}),
  };
}

function lexemeLink(input: Record<string, unknown>): LexemeLinkWrite & { lexemeId: string } {
  return {
    lexemeId: requiredString(input.lexemeId, 'lexemeId'),
    ...linkWrite(input),
  };
}

const NOTE_KINDS = [
  'project',
  'manuscript',
  'layer',
  'unit',
  'unit_text',
  'token',
  'morpheme',
  'analysis_node',
] as const;

const NOTE_VIEWS = ['timeline', 'waveform'] as const;

const NOTE_CATEGORIES = [
  'comment',
  'question',
  'todo',
  'linguistic',
  'fieldwork',
  'correction',
  'topic',
] as const;

function noteKind(value: unknown): ContentNoteAnchor['kind'] {
  if (typeof value !== 'string') throw new Error('note anchor is invalid');
  const found = NOTE_KINDS.find((kind) => kind === value);
  if (found === undefined) throw new Error('note anchor is invalid');
  return found;
}

function noteView(value: unknown): 'timeline' | 'waveform' {
  if (typeof value !== 'string') throw new Error('note anchor is invalid');
  const found = NOTE_VIEWS.find((view) => view === value);
  if (found === undefined) throw new Error('note anchor is invalid');
  return found;
}

function noteCategory(value: unknown): ContentNoteCategory | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('note category is invalid');
  const found = NOTE_CATEGORIES.find((item) => item === value);
  if (found === undefined) throw new Error('note category is invalid');
  return found;
}

function noteAttachment(value: unknown): 'active' | 'detached' | 'any' {
  if (value === 'active' || value === 'detached' || value === 'any') return value;
  throw new Error('note attachment is invalid');
}

function noteAnchor(value: unknown): ContentNoteAnchor {
  const anchor = objectArg(value);
  const kind = noteKind(anchor.kind);
  switch (kind) {
    case 'project':
      knownKeys(anchor, ['kind']);
      return { kind };
    case 'manuscript':
      knownKeys(anchor, ['kind', 'manuscriptId']);
      return { kind, manuscriptId: requiredString(anchor.manuscriptId, 'manuscriptId') };
    case 'layer':
      knownKeys(anchor, ['kind', 'layerId']);
      return { kind, layerId: requiredString(anchor.layerId, 'layerId') };
    case 'unit':
      knownKeys(anchor, ['kind', 'unitId', 'view']);
      return {
        kind,
        unitId: requiredString(anchor.unitId, 'unitId'),
        ...('view' in anchor ? { view: noteView(anchor.view) } : {}),
      };
    case 'unit_text':
      knownKeys(anchor, ['kind', 'unitTextId']);
      return { kind, unitTextId: requiredString(anchor.unitTextId, 'unitTextId') };
    case 'token':
      knownKeys(anchor, ['kind', 'unitId', 'tokenId']);
      return {
        kind,
        unitId: requiredString(anchor.unitId, 'unitId'),
        tokenId: requiredString(anchor.tokenId, 'tokenId'),
      };
    case 'morpheme':
      knownKeys(anchor, ['kind', 'unitId', 'morphemeId']);
      return {
        kind,
        unitId: requiredString(anchor.unitId, 'unitId'),
        morphemeId: requiredString(anchor.morphemeId, 'morphemeId'),
      };
    case 'analysis_node':
      knownKeys(anchor, ['kind', 'unitId', 'nodeId']);
      return {
        kind,
        unitId: requiredString(anchor.unitId, 'unitId'),
        nodeId: requiredString(anchor.nodeId, 'nodeId'),
      };
    default: {
      const unreachable: never = kind;
      throw new Error(`note anchor is invalid: ${String(unreachable)}`);
    }
  }
}

function noteCreate(input: Record<string, unknown>): ContentNoteWrite {
  knownKeys(input, ['id', 'anchor', 'content', 'category', 'provenance', 'fieldValues']);
  return {
    ...(input.id === undefined ? {} : { id: requiredString(input.id, 'id') }),
    anchor: noteAnchor(input.anchor),
    content: stringMap(input.content, 'content'),
    ...('category' in input ? { category: noteCategory(input.category) } : {}),
    ...('provenance' in input ? { provenance: input.provenance } : {}),
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
  };
}

function noteRevise(input: Record<string, unknown>): ContentNoteRevision {
  knownKeys(input, ['id', 'content', 'category']);
  if (!('content' in input) && !('category' in input)) throw new Error('note revision is empty');
  return {
    id: requiredString(input.id, 'id'),
    ...('content' in input ? { content: stringMap(input.content, 'content') } : {}),
    ...('category' in input ? { category: noteCategory(input.category) } : {}),
  };
}

function noteList(input: Record<string, unknown>): ContentNoteQuery {
  knownKeys(input, ['anchorKind', 'manuscriptId', 'unitId', 'nodeId', 'layerId', 'attachment']);
  return {
    ...('anchorKind' in input ? { anchorKind: noteKind(input.anchorKind) } : {}),
    ...('manuscriptId' in input
      ? { manuscriptId: requiredString(input.manuscriptId, 'manuscriptId') }
      : {}),
    ...('unitId' in input ? { unitId: requiredString(input.unitId, 'unitId') } : {}),
    ...('nodeId' in input ? { nodeId: requiredString(input.nodeId, 'nodeId') } : {}),
    ...('layerId' in input ? { layerId: requiredString(input.layerId, 'layerId') } : {}),
    ...('attachment' in input ? { attachment: noteAttachment(input.attachment) } : {}),
  };
}

function lexemeNoteSave(input: Record<string, unknown>): {
  lexemeId: string;
  id?: string;
  senseId?: string;
  content: Record<string, string>;
  category?: ContentNoteCategory | null;
  provenance?: unknown;
} {
  knownKeys(input, ['lexemeId', 'id', 'senseId', 'content', 'category', 'provenance']);
  return {
    lexemeId: requiredString(input.lexemeId, 'lexemeId'),
    ...(input.id === undefined ? {} : { id: requiredString(input.id, 'id') }),
    ...(input.senseId === undefined ? {} : { senseId: requiredString(input.senseId, 'senseId') }),
    content: stringMap(input.content, 'content'),
    ...('category' in input ? { category: noteCategory(input.category) } : {}),
    ...('provenance' in input ? { provenance: input.provenance } : {}),
  };
}

function requiredIndex(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`desktop call ${name} must be an index`);
  }
  return value;
}

function modelRunStart(input: Record<string, unknown>): ModelRunStart {
  knownKeys(input, [
    'manuscriptId',
    'layerId',
    'modelId',
    'modelVersion',
    'manifestSha256',
    'params',
    'rangeStart',
    'rangeEnd',
  ]);
  return {
    manuscriptId: requiredString(input.manuscriptId, 'manuscriptId'),
    layerId: requiredString(input.layerId, 'layerId'),
    modelId: requiredString(input.modelId, 'modelId'),
    modelVersion: requiredString(input.modelVersion, 'modelVersion'),
    manifestSha256: requiredString(input.manifestSha256, 'manifestSha256'),
    params: objectArg(input.params),
    rangeStart: requiredNumber(input.rangeStart, 'rangeStart'),
    rangeEnd: requiredNumber(input.rangeEnd, 'rangeEnd'),
  };
}

function modelRunFinish(input: Record<string, unknown>): ModelRunFinish {
  const status = requiredString(input.status, 'status');
  const runId = requiredString(input.runId, 'runId');
  const chunkCount = requiredIndex(input.chunkCount, 'chunkCount');
  if (status === 'error') {
    knownKeys(input, ['runId', 'status', 'chunkCount', 'errorCode']);
    return {
      runId,
      status,
      chunkCount,
      errorCode: requiredString(input.errorCode, 'errorCode'),
    };
  }
  if (status === 'ok' || status === 'cancelled') {
    knownKeys(input, ['runId', 'status', 'chunkCount']);
    return { runId, status, chunkCount };
  }
  throw new Error('desktop call status must be a run status');
}

function previewCandidate(value: unknown, index: number): PreviewCandidateInput {
  const candidate = objectArg(value);
  knownKeys(candidate, ['chunkIndex', 'segmentIndex', 'mediaStart', 'mediaEnd']);
  return {
    chunkIndex: requiredIndex(candidate.chunkIndex, `candidates.${index}.chunkIndex`),
    segmentIndex: requiredIndex(candidate.segmentIndex, `candidates.${index}.segmentIndex`),
    mediaStart: requiredNumber(candidate.mediaStart, `candidates.${index}.mediaStart`),
    mediaEnd: requiredNumber(candidate.mediaEnd, `candidates.${index}.mediaEnd`),
  };
}

function modelRunPreview(input: Record<string, unknown>): {
  runId: string;
  candidates: PreviewCandidateInput[];
} {
  knownKeys(input, ['runId', 'candidates']);
  if (!Array.isArray(input.candidates)) throw new Error('desktop call candidates must be an array');
  return {
    runId: requiredString(input.runId, 'runId'),
    candidates: input.candidates.map((item, index) => previewCandidate(item, index)),
  };
}

function modelRunAccept(input: Record<string, unknown>): {
  operationId: string;
  runId: string;
  chunkIndex: number;
  segmentIndex: number;
  mediaStart: number;
  mediaEnd: number;
  timeMappingRevision: number;
  targetFingerprint: string;
  text: string;
} {
  knownKeys(input, [
    'operationId',
    'runId',
    'chunkIndex',
    'segmentIndex',
    'mediaStart',
    'mediaEnd',
    'timeMappingRevision',
    'targetFingerprint',
    'text',
  ]);
  return {
    operationId: requiredString(input.operationId, 'operationId'),
    runId: requiredString(input.runId, 'runId'),
    chunkIndex: requiredIndex(input.chunkIndex, 'chunkIndex'),
    segmentIndex: requiredIndex(input.segmentIndex, 'segmentIndex'),
    mediaStart: requiredNumber(input.mediaStart, 'mediaStart'),
    mediaEnd: requiredNumber(input.mediaEnd, 'mediaEnd'),
    timeMappingRevision: requiredIndex(input.timeMappingRevision, 'timeMappingRevision'),
    targetFingerprint: requiredString(input.targetFingerprint, 'targetFingerprint'),
    text: requiredString(input.text, 'text'),
  };
}

function optionalQueryString(input: Record<string, unknown>, name: string): string | null {
  if (!(name in input) || input[name] === null) return null;
  if (typeof input[name] !== 'string') throw new Error(`desktop call ${name} must be a string`);
  return input[name];
}

function requiredLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('desktop call limit must be a positive integer');
  }
  return value;
}

function corpusCursor(value: unknown): CorpusQueryCursor | null {
  if (value === undefined || value === null) return null;
  const cursor = objectArg(value);
  knownKeys(cursor, ['manuscriptId', 'layerId', 'startTime', 'unitId']);
  return {
    manuscriptId: requiredString(cursor.manuscriptId, 'manuscriptId'),
    layerId: requiredString(cursor.layerId, 'layerId'),
    startTime: requiredNumber(cursor.startTime, 'startTime'),
    unitId: requiredString(cursor.unitId, 'unitId'),
  };
}

function corpusQuery(input: Record<string, unknown>): CorpusQuery {
  knownKeys(input, [
    'manuscriptId',
    'text',
    'form',
    'gloss',
    'pos',
    'lexemeId',
    'senseId',
    'limit',
    'cursor',
  ]);
  const lexemeId = optionalQueryString(input, 'lexemeId');
  const senseId = optionalQueryString(input, 'senseId');
  if ((lexemeId === null) !== (senseId === null)) {
    throw new Error('sense query needs lexemeId and senseId');
  }
  return {
    manuscriptId: optionalQueryString(input, 'manuscriptId'),
    text: optionalQueryString(input, 'text'),
    form: optionalQueryString(input, 'form'),
    gloss: optionalQueryString(input, 'gloss'),
    pos: optionalQueryString(input, 'pos'),
    lexemeId,
    senseId,
    limit: requiredLimit(input.limit),
    cursor: corpusCursor(input.cursor),
  };
}

function unitCreate(input: Record<string, unknown>): UnitCreate {
  knownKeys(input, [
    'layerId',
    'startTime',
    'endTime',
    'text',
    'speakerId',
    'parentUnitId',
    'fieldValues',
  ]);
  return {
    layerId: requiredString(input.layerId, 'layerId'),
    startTime: requiredNumber(input.startTime, 'startTime'),
    endTime: requiredNumber(input.endTime, 'endTime'),
    text: requiredString(input.text, 'text'),
    ...('speakerId' in input ? { speakerId: optionalString(input.speakerId, 'speakerId') } : {}),
    ...('parentUnitId' in input
      ? { parentUnitId: optionalString(input.parentUnitId, 'parentUnitId') }
      : {}),
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
  };
}

function unitSplit(input: Record<string, unknown>): { unitId: string; time: number } {
  return {
    unitId: requiredString(input.unitId, 'unitId'),
    time: requiredNumber(input.time, 'time'),
  };
}

function unitMerge(input: Record<string, unknown>): { keepId: string; removeId: string } {
  return {
    keepId: requiredString(input.keepId, 'keepId'),
    removeId: requiredString(input.removeId, 'removeId'),
  };
}

function unitBoundary(input: Record<string, unknown>): {
  leftId: string;
  rightId: string;
  time: number;
} {
  return {
    leftId: requiredString(input.leftId, 'leftId'),
    rightId: requiredString(input.rightId, 'rightId'),
    time: requiredNumber(input.time, 'time'),
  };
}

function attachmentKind(value: unknown): AttachmentKind {
  if (value === 'image' || value === 'audio' || value === 'document') return value;
  throw new Error('attachment kind is invalid');
}

function attachmentBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  throw new Error('attachment bytes are invalid');
}

function attachmentPublish(input: Record<string, unknown>): AttachmentPublish {
  knownKeys(input, ['lexemeId', 'displayName', 'kind', 'mimeType', 'bytes', 'operationId']);
  return {
    lexemeId: requiredString(input.lexemeId, 'lexemeId'),
    displayName: requiredString(input.displayName, 'displayName'),
    kind: attachmentKind(input.kind),
    mimeType: requiredString(input.mimeType, 'mimeType'),
    bytes: attachmentBytes(input.bytes),
    operationId: requiredString(input.operationId, 'operationId'),
  };
}

const CUSTOM_FIELD_DEFINITION_KEYS = [
  'targetType',
  'name',
  'description',
  'placeholder',
  'helpText',
  'fieldType',
  'required',
  'defaultValue',
  'pattern',
  'minValue',
  'maxValue',
  'targetTypes',
  'cardinality',
  'minItems',
  'maxItems',
  'sortOrder',
  'options',
] as const;

const CUSTOM_FIELD_UPDATE_KEYS = [
  'id',
  'expectedRevision',
  'name',
  'description',
  'placeholder',
  'helpText',
  'fieldType',
  'required',
  'defaultValue',
  'pattern',
  'minValue',
  'maxValue',
  'targetTypes',
  'cardinality',
  'minItems',
  'maxItems',
  'sortOrder',
] as const;

function allow(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  knownKeys(input, keys);
  return input;
}

function sourceField(
  value: unknown,
  name: 'label' | 'externalId',
): { expectedRevision: number; value: string } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const expectedRevision = requiredNumber(record.expectedRevision, `${name}.expectedRevision`);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error(`desktop call ${name}.expectedRevision must be a revision`);
  }
  return { expectedRevision, value: requiredString(record.value, `${name}.value`) };
}

function sourceCreate(input: Record<string, unknown>): SourceCreate {
  knownKeys(input, ['label', 'externalId', 'mediaId', 'fieldValues']);
  const mediaId = input.mediaId === undefined ? null : optionalString(input.mediaId, 'mediaId');
  return {
    label: requiredString(input.label, 'label'),
    externalId: requiredString(input.externalId, 'externalId'),
    mediaId,
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
  };
}

function sourcePatch(input: Record<string, unknown>): SourcePatch {
  knownKeys(input, ['operationId', 'id', 'label', 'externalId']);
  const label = sourceField(input.label, 'label');
  const externalId = sourceField(input.externalId, 'externalId');
  if (label === undefined && externalId === undefined) throw new Error('source patch is empty');
  return {
    operationId: requiredString(input.operationId, 'operationId'),
    id: requiredString(input.id, 'id'),
    ...(label === undefined ? {} : { label }),
    ...(externalId === undefined ? {} : { externalId }),
  };
}

function definitionIdOf(input: Record<string, unknown>): { definitionId: string } {
  knownKeys(input, ['definitionId']);
  return { definitionId: requiredString(input.definitionId, 'definitionId') };
}

function speakerPatch(input: Record<string, unknown>): SpeakerPatch {
  knownKeys(input, [
    'operationId',
    'id',
    'name',
    'pseudonym',
    'gender',
    'birthYear',
    'languageIds',
    'dialect',
    'accent',
    'role',
    'consentStatus',
    'accessRights',
    'address',
    'notes',
  ]);
  const patch: SpeakerPatch = {
    operationId: requiredString(input.operationId, 'operationId'),
    id: requiredString(input.id, 'id'),
  };
  const name = speakerText(input.name, 'name', false);
  const pseudonym = speakerText(input.pseudonym, 'pseudonym', true);
  const gender = speakerText(input.gender, 'gender', true);
  const dialect = speakerText(input.dialect, 'dialect', true);
  const accent = speakerText(input.accent, 'accent', true);
  const address = speakerText(input.address, 'address', true);
  const birthYear = speakerBirthYear(input.birthYear);
  const languageIds = speakerLanguageIds(input.languageIds);
  const role = speakerEnum(input.role, 'role', [
    'speaker',
    'translator',
    'annotator',
    'researcher',
  ]);
  const consentStatus = speakerEnum(input.consentStatus, 'consentStatus', [
    'granted',
    'restricted',
    'anonymous',
  ]);
  const accessRights = speakerEnum(input.accessRights, 'accessRights', [
    'open',
    'restricted',
    'confidential',
  ]);
  const notes = speakerNotes(input.notes);
  if (name !== undefined) {
    if (typeof name.value !== 'string') throw new Error('desktop call name.value must be a string');
    patch.name = { expectedRevision: name.expectedRevision, value: name.value };
  }
  if (pseudonym !== undefined) patch.pseudonym = pseudonym;
  if (gender !== undefined) patch.gender = gender;
  if (birthYear !== undefined) patch.birthYear = birthYear;
  if (languageIds !== undefined) patch.languageIds = languageIds;
  if (dialect !== undefined) patch.dialect = dialect;
  if (accent !== undefined) patch.accent = accent;
  if (role !== undefined) patch.role = role;
  if (consentStatus !== undefined) patch.consentStatus = consentStatus;
  if (accessRights !== undefined) patch.accessRights = accessRights;
  if (address !== undefined) patch.address = address;
  if (notes !== undefined) patch.notes = notes;
  if (Object.keys(patch).length === 2) throw new Error('speaker patch is empty');
  return patch;
}

export function speakerText(
  value: unknown,
  name: string,
  nullable: boolean,
): { expectedRevision: number; value: string | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const text = record.value;
  if (text === null && nullable) {
    return { expectedRevision: revisionOf(record.expectedRevision, name), value: null };
  }
  return {
    expectedRevision: revisionOf(record.expectedRevision, name),
    value: requiredString(text, `${name}.value`),
  };
}

function speakerBirthYear(
  value: unknown,
): { expectedRevision: number; value: number | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const year = record.value;
  if (year !== null && (typeof year !== 'number' || !Number.isInteger(year))) {
    throw new Error('desktop call birthYear.value must be a year');
  }
  return { expectedRevision: revisionOf(record.expectedRevision, 'birthYear'), value: year };
}

function speakerLanguageIds(
  value: unknown,
): { expectedRevision: number; value: string[] | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const ids = record.value;
  if (ids === null) {
    return { expectedRevision: revisionOf(record.expectedRevision, 'languageIds'), value: null };
  }
  if (!Array.isArray(ids) || ids.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error('desktop call languageIds.value must be language ids');
  }
  if (new Set(ids).size !== ids.length)
    throw new Error('desktop call languageIds.value must be language ids');
  return {
    expectedRevision: revisionOf(record.expectedRevision, 'languageIds'),
    value: ids as string[],
  };
}

export function speakerEnum<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
): { expectedRevision: number; value: T | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const item = record.value;
  if (item === null)
    return { expectedRevision: revisionOf(record.expectedRevision, name), value: null };
  if (typeof item !== 'string' || !allowed.includes(item as T)) {
    throw new Error(`desktop call ${name}.value is invalid`);
  }
  return { expectedRevision: revisionOf(record.expectedRevision, name), value: item as T };
}

export function speakerNotes(
  value: unknown,
): { expectedRevision: number; value: Record<string, string> | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  if (record.value === null) {
    return { expectedRevision: revisionOf(record.expectedRevision, 'notes'), value: null };
  }
  return {
    expectedRevision: revisionOf(record.expectedRevision, 'notes'),
    value: stringMap(record.value, 'notes.value'),
  };
}

export function revisionOf(value: unknown, name: string): number {
  const revision = requiredNumber(value, `${name}.expectedRevision`);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error(`desktop call ${name}.expectedRevision must be a revision`);
  }
  return revision;
}

function stringIds(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`desktop call ${name} must be a list`);
  if (value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`desktop call ${name} must be a list`);
  }
  return value as string[];
}

function speakerAssign(input: Record<string, unknown>): { speakerId: string; unitIds: string[] } {
  knownKeys(input, ['speakerId', 'unitIds']);
  return {
    speakerId: requiredString(input.speakerId, 'speakerId'),
    unitIds: stringIds(input.unitIds, 'unitIds'),
  };
}

function conversationPatch(input: Record<string, unknown>): ConversationPatch {
  knownKeys(input, [
    'operationId',
    'id',
    'title',
    'mode',
    'providerId',
    'model',
    'archived',
    'clearedAt',
  ]);
  const title = speakerText(input.title, 'title', false);
  const providerId = speakerText(input.providerId, 'providerId', true);
  const model = speakerText(input.model, 'model', true);
  const clearedAt = speakerText(input.clearedAt, 'clearedAt', true);
  const mode = speakerEnum(input.mode, 'mode', ['assistant', 'analysis', 'review']);
  const archived = conversationArchived(input.archived);
  const patch: ConversationPatch = {
    operationId: requiredString(input.operationId, 'operationId'),
    id: requiredString(input.id, 'id'),
  };
  if (title !== undefined) {
    if (typeof title.value !== 'string')
      throw new Error('desktop call title.value must be a string');
    patch.title = { expectedRevision: title.expectedRevision, value: title.value };
  }
  if (mode !== undefined) patch.mode = mode;
  if (providerId !== undefined) patch.providerId = providerId;
  if (model !== undefined) patch.model = model;
  if (archived !== undefined) patch.archived = archived;
  if (clearedAt !== undefined) patch.clearedAt = clearedAt;
  if (Object.keys(patch).length === 2) throw new Error('conversation patch is empty');
  return patch;
}

function conversationArchived(
  value: unknown,
): { expectedRevision: number; value: boolean | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const archived = record.value;
  if (archived !== null && typeof archived !== 'boolean') {
    throw new Error('desktop call archived.value must be a boolean');
  }
  return { expectedRevision: revisionOf(record.expectedRevision, 'archived'), value: archived };
}

function conversationCreate(input: Record<string, unknown>): ConversationCreate {
  knownKeys(input, ['title', 'fieldValues']);
  return {
    title: requiredString(input.title, 'title'),
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
  };
}

function messageAppend(input: Record<string, unknown>): MessageAppend {
  knownKeys(input, ['id', 'conversationId', 'role', 'body', 'fieldValues']);
  return {
    ...(input.id === undefined ? {} : { id: requiredString(input.id, 'id') }),
    conversationId: requiredString(input.conversationId, 'conversationId'),
    role: messageRole(input.role),
    body: requiredString(input.body, 'body'),
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
  };
}

function messageRole(value: unknown): MessageAppend['role'] {
  if (value === 'system' || value === 'user' || value === 'assistant' || value === 'tool') {
    return value;
  }
  throw new Error('desktop call role must be a message role');
}

function bibliographyPatch(input: Record<string, unknown>): BibliographyPatch {
  knownKeys(input, [
    'operationId',
    'id',
    'title',
    'authors',
    'year',
    'publisher',
    'doi',
    'url',
    'citationKey',
    'sourceType',
    'notes',
    'accessRights',
  ]);
  const title = speakerText(input.title, 'title', false);
  const publisher = speakerText(input.publisher, 'publisher', true);
  const doi = speakerText(input.doi, 'doi', true);
  const url = speakerText(input.url, 'url', true);
  const citationKey = speakerText(input.citationKey, 'citationKey', true);
  const year = bibliographyYear(input.year);
  const authors = bibliographyAuthors(input.authors);
  const sourceType = speakerEnum(input.sourceType, 'sourceType', [
    'book',
    'article',
    'thesis',
    'fieldnotes',
    'grammar',
    'other',
  ]);
  const accessRights = speakerEnum(input.accessRights, 'accessRights', [
    'open',
    'restricted',
    'confidential',
  ]);
  const notes = speakerNotes(input.notes);
  const patch: BibliographyPatch = {
    operationId: requiredString(input.operationId, 'operationId'),
    id: requiredString(input.id, 'id'),
  };
  if (title !== undefined) {
    if (typeof title.value !== 'string')
      throw new Error('desktop call title.value must be a string');
    patch.title = { expectedRevision: title.expectedRevision, value: title.value };
  }
  if (authors !== undefined) patch.authors = authors;
  if (year !== undefined) patch.year = year;
  if (publisher !== undefined) patch.publisher = publisher;
  if (doi !== undefined) patch.doi = doi;
  if (url !== undefined) patch.url = url;
  if (citationKey !== undefined) patch.citationKey = citationKey;
  if (sourceType !== undefined) patch.sourceType = sourceType;
  if (notes !== undefined) patch.notes = orderedNotes(notes);
  if (accessRights !== undefined) patch.accessRights = accessRights;
  if (Object.keys(patch).length === 2) throw new Error('bibliography patch is empty');
  return patch;
}

function bibliographyYear(
  value: unknown,
): { expectedRevision: number; value: number | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const year = record.value;
  if (year !== null && (typeof year !== 'number' || !Number.isInteger(year))) {
    throw new Error('desktop call year.value must be a year');
  }
  return { expectedRevision: revisionOf(record.expectedRevision, 'year'), value: year };
}

function bibliographyAuthors(
  value: unknown,
): { expectedRevision: number; value: string[] | null } | undefined {
  if (value === undefined) return undefined;
  const record = objectArg(value);
  knownKeys(record, ['expectedRevision', 'value']);
  const authors = record.value;
  if (authors === null) {
    return { expectedRevision: revisionOf(record.expectedRevision, 'authors'), value: null };
  }
  if (
    !Array.isArray(authors) ||
    authors.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error('desktop call authors.value must be author names');
  }
  return {
    expectedRevision: revisionOf(record.expectedRevision, 'authors'),
    value: authors as string[],
  };
}

function orderedNotes(patch: { expectedRevision: number; value: Record<string, string> | null }): {
  expectedRevision: number;
  value: Record<string, string> | null;
} {
  if (patch.value === null) return patch;
  const keys = Object.keys(patch.value).sort();
  if (keys.length === 0 || keys.some((key) => patch.value?.[key]?.length === 0)) {
    throw new Error('desktop call notes.value must be notes');
  }
  const ordered: Record<string, string> = {};
  for (const key of keys) ordered[key] = patch.value[key] ?? '';
  return { expectedRevision: patch.expectedRevision, value: ordered };
}

function fingerprintString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('desktop call graphFingerprint must be a string');
  return value;
}

function analysisCredentials(input: Record<string, unknown>): AnalysisCredentials {
  const expected = objectArg(input.expected);
  knownKeys(expected, ['manuscriptGeneration', 'analysisGeneration', 'graphFingerprint']);
  return {
    manuscriptGeneration: requiredNumber(expected.manuscriptGeneration, 'manuscriptGeneration'),
    analysisGeneration: requiredNumber(expected.analysisGeneration, 'analysisGeneration'),
    graphFingerprint: fingerprintString(expected.graphFingerprint),
  };
}

function analysisImport(input: Record<string, unknown>): {
  unitId: string;
  expected: AnalysisCredentials;
  nodes: unknown[];
  relations: unknown[];
  removeNodes: unknown[];
  removeRelations: unknown[];
} {
  knownKeys(input, ['unitId', 'expected', 'nodes', 'relations', 'removeNodes', 'removeRelations']);
  return {
    unitId: requiredString(input.unitId, 'unitId'),
    expected: analysisCredentials(input),
    nodes: listArg(input.nodes, 'nodes'),
    relations: listArg(input.relations, 'relations'),
    removeNodes: listArg(input.removeNodes, 'removeNodes'),
    removeRelations: listArg(input.removeRelations, 'removeRelations'),
  };
}

function listArg(value: unknown, name: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`desktop call ${name} must be a list`);
  return value;
}

function analysisSubmit(input: Record<string, unknown>): {
  unitId: string;
  graph: unknown;
  expected: AnalysisCredentials;
  definitionRevisions: { definitionId: string; revision: number }[];
} {
  knownKeys(input, ['unitId', 'graph', 'expected', 'definitionRevisions']);
  return {
    unitId: requiredString(input.unitId, 'unitId'),
    graph: input.graph,
    expected: analysisCredentials(input),
    definitionRevisions: revisionBasis(input.definitionRevisions),
  };
}

function revisionBasis(value: unknown): { definitionId: string; revision: number }[] {
  if (!Array.isArray(value)) throw new Error('custom field revision does not match');
  return value.map((item) => {
    const record = objectArg(item);
    knownKeys(record, ['definitionId', 'revision']);
    return {
      definitionId: requiredString(record.definitionId, 'definitionId'),
      revision: requiredNumber(record.revision, 'revision'),
    };
  });
}

function analysisCandidate(input: Record<string, unknown>): {
  candidateId: string;
  expected: AnalysisCredentials;
} {
  knownKeys(input, ['candidateId', 'expected']);
  return {
    candidateId: requiredString(input.candidateId, 'candidateId'),
    expected: analysisCredentials(input),
  };
}

function analysisRestore(input: Record<string, unknown>): {
  candidateId: string;
  expected: AnalysisCredentials;
  conversions?: unknown[];
} {
  knownKeys(input, ['candidateId', 'expected', 'conversions']);
  return {
    candidateId: requiredString(input.candidateId, 'candidateId'),
    expected: analysisCredentials(input),
    ...(input.conversions === undefined
      ? {}
      : { conversions: listArg(input.conversions, 'conversions') }),
  };
}

function analysisSplit(input: Record<string, unknown>): {
  unitId: string;
  nodeId: string;
  into: [unknown, unknown];
  expected: AnalysisCredentials;
} {
  knownKeys(input, ['unitId', 'nodeId', 'into', 'expected']);
  if (!Array.isArray(input.into) || input.into.length !== 2) {
    throw new Error('desktop call into must be a pair');
  }
  return {
    unitId: requiredString(input.unitId, 'unitId'),
    nodeId: requiredString(input.nodeId, 'nodeId'),
    into: [input.into[0], input.into[1]],
    expected: analysisCredentials(input),
  };
}

function analysisMerge(input: Record<string, unknown>): {
  unitId: string;
  nodeIds: [string, string];
  into: unknown;
  expected: AnalysisCredentials;
} {
  knownKeys(input, ['unitId', 'nodeIds', 'into', 'expected']);
  if (!Array.isArray(input.nodeIds) || input.nodeIds.length !== 2) {
    throw new Error('desktop call nodeIds must be a pair');
  }
  return {
    unitId: requiredString(input.unitId, 'unitId'),
    nodeIds: [
      requiredString(input.nodeIds[0], 'nodeIds'),
      requiredString(input.nodeIds[1], 'nodeIds'),
    ],
    into: input.into,
    expected: analysisCredentials(input),
  };
}

function analysisApply(input: Record<string, unknown>): {
  unitId: string;
  expected: { manuscriptGeneration: number; analysisGeneration: number; graphFingerprint: string };
  changes: unknown[];
} {
  knownKeys(input, ['unitId', 'expected', 'changes']);
  const expected = objectArg(input.expected);
  knownKeys(expected, ['manuscriptGeneration', 'analysisGeneration', 'graphFingerprint']);
  if (!Array.isArray(input.changes)) throw new Error('desktop call changes must be a list');
  return {
    unitId: requiredString(input.unitId, 'unitId'),
    expected: {
      manuscriptGeneration: requiredNumber(expected.manuscriptGeneration, 'manuscriptGeneration'),
      analysisGeneration: requiredNumber(expected.analysisGeneration, 'analysisGeneration'),
      graphFingerprint: requiredString(expected.graphFingerprint, 'graphFingerprint'),
    },
    changes: input.changes,
  };
}

function unitIdOf(input: Record<string, unknown>): { unitId: string } {
  knownKeys(input, ['unitId']);
  return { unitId: requiredString(input.unitId, 'unitId') };
}

function exportFile(input: Record<string, unknown>): string {
  knownKeys(input, ['file']);
  return requiredString(input.file, 'file');
}

function exportManuscript(input: Record<string, unknown>): { file: string; manuscriptId: string } {
  knownKeys(input, ['file', 'manuscriptId']);
  return {
    file: requiredString(input.file, 'file'),
    manuscriptId: requiredString(input.manuscriptId, 'manuscriptId'),
  };
}

function exchangeImport(input: Record<string, unknown>): { file: string; roles?: string } {
  knownKeys(input, ['file', 'roles']);
  const roles = input.roles === undefined ? undefined : requiredString(input.roles, 'roles');
  return {
    file: requiredString(input.file, 'file'),
    ...(roles === undefined ? {} : { roles }),
  };
}

export const desktopOperations = {
  'project.get': spec<'keep', Record<string, never>, ProjectIdentity | null>('keep', (input) => {
    knownKeys(input, []);
    return {} as Record<string, never>;
  }),
  'layers.create': spec<'clear', LayerCreate, Layer>('clear', checkLayerCreate),
  'layers.list': spec<'keep', { manuscriptId: string }, Layer[]>('keep', (input) => ({
    manuscriptId: requiredString(input.manuscriptId, 'manuscriptId'),
  })),
  'units.updateText': spec<'replace-on-success', { unitId: string; text: string }, Unit>(
    'replace-on-success',
    (input) => ({
      unitId: requiredString(input.unitId, 'unitId'),
      text: requiredString(input.text, 'text'),
    }),
  ),
  'media.finishCleanup': spec<'clear', { id: string; operationId: string }, MediaCleanup>(
    'clear',
    (input) => {
      knownKeys(input, ['id', 'operationId']);
      return {
        id: requiredString(input.id, 'id'),
        operationId: requiredString(input.operationId, 'operationId'),
      };
    },
  ),
  'media.create': spec<'clear', MediaCreate, Media>('clear', (input) => ({
    relpath: requiredString(input.relpath, 'relpath'),
    sha256: requiredString(input.sha256, 'sha256'),
    duration: requiredNumber(input.duration, 'duration'),
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
  })),
  'media.delete': spec<'clear', { id: string }, RecordingDeletion>('clear', (input) => {
    knownKeys(input, ['id']);
    return { id: requiredString(input.id, 'id') };
  }),
  'media.previewDelete': spec<'keep', { id: string }, RecordingDeletePreview>('keep', (input) => {
    knownKeys(input, ['id']);
    return { id: requiredString(input.id, 'id') };
  }),
  'media.showReminder': spec<'clear', { id: string }, DeletionReminder>('clear', (input) => {
    knownKeys(input, ['id']);
    return { id: requiredString(input.id, 'id') };
  }),
  'media.reregister': spec<'clear', { relpath: string; duration: number }, MediaReregistration>(
    'clear',
    (input) => {
      knownKeys(input, ['relpath', 'duration']);
      return {
        relpath: requiredString(input.relpath, 'relpath'),
        duration: requiredNumber(input.duration, 'duration'),
      };
    },
  ),
  'media.restoreRegistered': spec<'clear', { id: string }, { id: string }>('clear', (input) => {
    knownKeys(input, ['id']);
    return { id: requiredString(input.id, 'id') };
  }),
  'media.list': spec<'keep', Record<string, never>, Media[]>('keep', (input) => {
    knownKeys(input, []);
    return {} as Record<string, never>;
  }),
  'media.listDeleted': spec<'keep', Record<string, never>, DeletedMedia[]>('keep', (input) => {
    knownKeys(input, []);
    return {} as Record<string, never>;
  }),
  'manuscripts.create': spec<'clear', ManuscriptCreate, Manuscript>('clear', (input) => ({
    title: stringMap(input.title, 'title'),
    mediaId: requiredString(input.mediaId, 'mediaId'),
    ...('fieldValues' in input ? { fieldValues: fieldValueMap(input.fieldValues) } : {}),
  })),
  'manuscripts.list': spec<'keep', Record<string, never>, Manuscript[]>(
    'keep',
    () => ({}) as Record<string, never>,
  ),
  'manuscripts.listDeleted': spec<'keep', Record<string, never>, Manuscript[]>('keep', (input) => {
    knownKeys(input, []);
    return {} as Record<string, never>;
  }),
  'manuscripts.delete': spec<'clear', { id: string }, Manuscript>('clear', (input) => {
    knownKeys(input, ['id']);
    return { id: requiredString(input.id, 'id') };
  }),
  'manuscripts.previewDelete': spec<'keep', { id: string }, ManuscriptDeletePreview>(
    'keep',
    (input) => {
      knownKeys(input, ['id']);
      return { id: requiredString(input.id, 'id') };
    },
  ),
  'manuscripts.restore': spec<'clear', { id: string }, Manuscript>('clear', (input) => {
    knownKeys(input, ['id']);
    return { id: requiredString(input.id, 'id') };
  }),
  'manuscripts.showReminder': spec<'clear', { id: string }, DeletionReminder>('clear', (input) => {
    knownKeys(input, ['id']);
    return { id: requiredString(input.id, 'id') };
  }),
  'manuscripts.purge': spec<'clear', { id: string }, { id: string }>('clear', (input) => {
    knownKeys(input, ['id']);
    return { id: requiredString(input.id, 'id') };
  }),
  'manuscripts.setTimeMapping': spec<
    'clear',
    {
      manuscriptId: string;
      expectedRevision: number;
      offsetSec: number;
      scale: number;
      sourceMediaId?: string;
    },
    Manuscript
  >('clear', (input) => {
    const sourceMediaId = input.sourceMediaId;
    return {
      manuscriptId: requiredString(input.manuscriptId, 'manuscriptId'),
      expectedRevision: requiredNumber(input.expectedRevision, 'expectedRevision'),
      offsetSec: requiredNumber(input.offsetSec, 'offsetSec'),
      scale: requiredNumber(input.scale, 'scale'),
      ...(typeof sourceMediaId === 'string' ? { sourceMediaId } : {}),
    };
  }),
  'manuscripts.rollbackTimeMapping': spec<
    'clear',
    { manuscriptId: string; expectedRevision: number },
    Manuscript
  >('clear', (input) => ({
    manuscriptId: requiredString(input.manuscriptId, 'manuscriptId'),
    expectedRevision: requiredNumber(input.expectedRevision, 'expectedRevision'),
  })),
  'catalog.ensureProjectDefinition': spec<'clear', LanguageEnsure, ProjectLanguage>(
    'clear',
    languageEnsure,
  ),
  'catalog.getLanguage': spec<'keep', { id: string }, ProjectLanguage | null>('keep', (input) => ({
    id: requiredString(input.id, 'id'),
  })),
  'catalog.listLanguages': spec<'keep', Record<string, never>, ProjectLanguage[]>(
    'keep',
    (input) => {
      knownKeys(input, []);
      return {} as Record<string, never>;
    },
  ),
  'catalog.updateLanguage': spec<
    'clear',
    { id: string; locale: string; value: string },
    ProjectLanguage
  >('clear', (input) => {
    knownKeys(input, ['id', 'locale', 'value']);
    return {
      id: requiredString(input.id, 'id'),
      locale: requiredString(input.locale, 'locale'),
      value: requiredString(input.value, 'value'),
    };
  }),
  'orthographies.create': spec<'clear', OrthographyCreate, ProjectOrthography>(
    'clear',
    orthographyCreate,
  ),
  'orthographies.list': spec<'keep', { languageId: string }, ProjectOrthography[]>(
    'keep',
    (input) => {
      knownKeys(input, ['languageId']);
      return { languageId: requiredString(input.languageId, 'languageId') };
    },
  ),
  'orthographies.update': spec<'clear', { id: string; scriptTag: string }, ProjectOrthography>(
    'clear',
    (input) => {
      knownKeys(input, ['id', 'scriptTag']);
      return {
        id: requiredString(input.id, 'id'),
        scriptTag: requiredString(input.scriptTag, 'scriptTag'),
      };
    },
  ),
  'bridges.create': spec<'clear', BridgeCreate, ProjectBridge>('clear', bridgeCreate),
  'bridges.get': spec<'keep', { id: string }, ProjectBridge | null>('keep', (input) => ({
    id: requiredString(input.id, 'id'),
  })),
  'bridges.list': spec<'keep', Record<string, never>, ProjectBridge[]>('keep', (input) => {
    knownKeys(input, []);
    return {} as Record<string, never>;
  }),
  'bridges.update': spec<'clear', { id: string; rules: Record<string, unknown> }, ProjectBridge>(
    'clear',
    (input) => {
      knownKeys(input, ['id', 'rules']);
      return { id: requiredString(input.id, 'id'), rules: bridgeRules(input.rules) };
    },
  ),
  'lexicon.saveEntry': spec<'clear', LexemeSave, ProjectLexeme>('clear', lexemeSave),
  'lexicon.getEntry': spec<'keep', { id: string }, ProjectLexeme | null>('keep', (input) => ({
    id: requiredString(input.id, 'id'),
  })),
  'lexicon.linkSense': spec<'clear', LexemeLinkWrite & { lexemeId: string }, ProjectLexemeLink>(
    'clear',
    lexemeLink,
  ),
  'lexicon.removeSense': spec<'clear', { lexemeId: string; senseId: string }, ProjectLexeme>(
    'clear',
    (input) => ({
      lexemeId: requiredString(input.lexemeId, 'lexemeId'),
      senseId: requiredString(input.senseId, 'senseId'),
    }),
  ),
  'lexicon.listLinkCandidates': spec<'keep', Record<string, never>, LexemeLinkCandidate[]>(
    'keep',
    (input) => {
      knownKeys(input, []);
      return {} as Record<string, never>;
    },
  ),
  'lexicon.matchLink': spec<'keep', { query: string }, LexemeLinkCandidate>('keep', (input) => {
    knownKeys(input, ['query']);
    return { query: requiredString(input.query, 'query') };
  }),
  'lexicon.listTokenLinks': spec<'keep', { unitId: string }, TokenLexemeLink[]>('keep', (input) => {
    knownKeys(input, ['unitId']);
    return { unitId: requiredString(input.unitId, 'unitId') };
  }),
  'lexicon.replaceTokenLink': spec<
    'clear',
    { tokenId: string; lexemeId: string; senseId: string },
    TokenLexemeLink
  >('clear', (input) => {
    knownKeys(input, ['tokenId', 'lexemeId', 'senseId']);
    return {
      tokenId: requiredString(input.tokenId, 'tokenId'),
      lexemeId: requiredString(input.lexemeId, 'lexemeId'),
      senseId: requiredString(input.senseId, 'senseId'),
    };
  }),
  'lexicon.clearTokenLink': spec<'clear', { tokenId: string }, TokenLexemeLink[]>(
    'clear',
    (input) => {
      knownKeys(input, ['tokenId']);
      return { tokenId: requiredString(input.tokenId, 'tokenId') };
    },
  ),
  'lexicon.createLinkedEntry': spec<
    'clear',
    { targetId: string; headword: string; translation: string },
    TokenLexemeLink
  >('clear', (input) => {
    knownKeys(input, ['targetId', 'headword', 'translation']);
    return {
      targetId: requiredString(input.targetId, 'targetId'),
      headword: requiredString(input.headword, 'headword'),
      translation: requiredString(input.translation, 'translation'),
    };
  }),
  'notes.create': spec<'clear', ContentNoteWrite, ContentNote>('clear', noteCreate),
  'notes.update': spec<'clear', ContentNoteRevision, ContentNote>('clear', noteRevise),
  'notes.delete': spec<'clear', { id: string }, { id: string }>('clear', (input) => {
    knownKeys(input, ['id']);
    return { id: requiredString(input.id, 'id') };
  }),
  'notes.list': spec<'keep', ContentNoteQuery, ContentNote[]>('keep', noteList),
  'notes.saveLexeme': spec<
    'clear',
    {
      lexemeId: string;
      id?: string;
      senseId?: string;
      content: Record<string, string>;
      category?: ContentNoteCategory | null;
      provenance?: unknown;
    },
    JieyuAnchoredNote
  >('clear', lexemeNoteSave),
  'notes.listLexeme': spec<'keep', { lexemeId: string }, JieyuAnchoredNote[]>('keep', (input) => {
    knownKeys(input, ['lexemeId']);
    return { lexemeId: requiredString(input.lexemeId, 'lexemeId') };
  }),
  'modelRuns.listAcceptable': spec<'keep', { manuscriptId: string }, AcceptableRun[]>(
    'keep',
    (input) => {
      knownKeys(input, ['manuscriptId']);
      return { manuscriptId: requiredString(input.manuscriptId, 'manuscriptId') };
    },
  ),
  'modelRuns.start': spec<'clear', ModelRunStart, ModelRun>('clear', modelRunStart),
  'modelRuns.finish': spec<'clear', ModelRunFinish, ModelRun>('clear', modelRunFinish),
  'modelRuns.preview': spec<
    'clear',
    { runId: string; candidates: PreviewCandidateInput[] },
    { pendingCount: number; timeMappingRevision: number; candidates: PreviewCandidate[] }
  >('clear', modelRunPreview),
  'modelRuns.accept': spec<
    'clear',
    {
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
    TranscriptionAcceptance
  >('clear', modelRunAccept),
  'modelRuns.abandon': spec<'clear', { runId: string }, ModelRun>('clear', (input) => {
    knownKeys(input, ['runId']);
    return { runId: requiredString(input.runId, 'runId') };
  }),
  'modelRuns.interrupt': spec<'clear', Record<string, never>, ModelRun[]>('clear', (input) => {
    knownKeys(input, []);
    return {} as Record<string, never>;
  }),
  'modelRuns.stopManuscript': spec<'clear', { id: string }, ModelRun[]>('clear', (input) => {
    knownKeys(input, ['id']);
    return { id: requiredString(input.id, 'id') };
  }),
  'modelRuns.stopRecording': spec<'clear', { id: string }, ModelRun[]>('clear', (input) => {
    knownKeys(input, ['id']);
    return { id: requiredString(input.id, 'id') };
  }),
  'modelRuns.get': spec<'keep', { runId: string }, ModelRun | null>('keep', (input) => {
    knownKeys(input, ['runId']);
    return { runId: requiredString(input.runId, 'runId') };
  }),
  'modelRuns.readAcceptance': spec<'keep', { operationId: string }, TranscriptionAcceptance | null>(
    'keep',
    (input) => {
      knownKeys(input, ['operationId']);
      return { operationId: requiredString(input.operationId, 'operationId') };
    },
  ),
  'corpus.query': spec<'keep', CorpusQuery, CorpusQueryPage>('keep', corpusQuery),
  'units.create': spec<'clear', UnitCreate, Unit>('clear', unitCreate),
  'units.get': spec<'keep', { id: string }, Unit | null>('keep', (input) => ({
    id: requiredString(input.id, 'id'),
  })),
  'units.list': spec<'keep', { layerId: string }, Unit[]>('keep', (input) => ({
    layerId: requiredString(input.layerId, 'layerId'),
  })),
  'units.undoText': spec<'keep', Record<string, never>, Unit | Unit[]>(
    'keep',
    () => ({}) as Record<string, never>,
  ),
  'units.undo': spec<'keep', Record<string, never>, Unit | Unit[]>(
    'keep',
    () => ({}) as Record<string, never>,
  ),
  'units.split': spec<'keep', { unitId: string; time: number }, { left: Unit; right: Unit }>(
    'keep',
    unitSplit,
  ),
  'units.merge': spec<'clear', { keepId: string; removeId: string }, Unit>('clear', unitMerge),
  'units.updateBoundary': spec<
    'clear',
    { leftId: string; rightId: string; time: number },
    { left: Unit; right: Unit }
  >('clear', unitBoundary),
  'deletion.listDue': spec<'keep', Record<string, never>, DueDeletionReminder[]>(
    'keep',
    (input) => {
      knownKeys(input, []);
      return {} as Record<string, never>;
    },
  ),
  'attachments.publish': spec<'clear', AttachmentPublish, AttachmentPublication>(
    'clear',
    attachmentPublish,
  ),
  'attachments.removeLink': spec<'clear', { linkId: string }, AttachmentLinkRemoval>(
    'clear',
    (input) => {
      knownKeys(input, ['linkId']);
      return { linkId: requiredString(input.linkId, 'linkId') };
    },
  ),
  'attachments.list': spec<'keep', { lexemeId: string }, AttachmentLinkView[]>('keep', (input) => {
    knownKeys(input, ['lexemeId']);
    return { lexemeId: requiredString(input.lexemeId, 'lexemeId') };
  }),
  'attachments.read': spec<'keep', { linkId: string }, AttachmentBytes>('keep', (input) => {
    knownKeys(input, ['linkId']);
    return { linkId: requiredString(input.linkId, 'linkId') };
  }),
  'attachments.finishCleanup': spec<'clear', { fileId: string }, AttachmentCleanup>(
    'clear',
    (input) => {
      knownKeys(input, ['fileId']);
      return { fileId: requiredString(input.fileId, 'fileId') };
    },
  ),
  'customFields.createDefinition': spec<'clear', Record<string, unknown>, CustomFieldDefinition>(
    'clear',
    (input) => allow(input, CUSTOM_FIELD_DEFINITION_KEYS),
  ),
  'customFields.updateDefinition': spec<'clear', Record<string, unknown>, CustomFieldDefinition>(
    'clear',
    (input) => allow(input, CUSTOM_FIELD_UPDATE_KEYS),
  ),
  'customFields.addOption': spec<'clear', Record<string, unknown>, CustomFieldDefinition>(
    'clear',
    (input) => allow(input, ['definitionId', 'expectedRevision', 'label', 'sortOrder']),
  ),
  'customFields.updateOptionLabel': spec<'clear', Record<string, unknown>, CustomFieldDefinition>(
    'clear',
    (input) => allow(input, ['definitionId', 'optionId', 'expectedRevision', 'label']),
  ),
  'customFields.importDefinition': spec<'clear', Record<string, unknown>, CustomFieldDefinition>(
    'clear',
    (input) => allow(input, ['mode', 'definition']),
  ),
  'customFields.previewUnitValue': spec<'keep', Record<string, unknown>, CustomFieldPreview>(
    'keep',
    (input) => allow(input, ['definitionId', 'unitId', 'value']),
  ),
  'customFields.setUnitValue': spec<'clear', Record<string, unknown>, CustomFieldUnitValue>(
    'clear',
    (input) => allow(input, ['definitionId', 'unitId', 'value', 'expectedRevision']),
  ),
  'customFields.removeUnitValue': spec<'clear', Record<string, unknown>, void>('clear', (input) =>
    allow(input, ['definitionId', 'unitId']),
  ),
  'customFields.missingUnitFields': spec<'keep', { unitId: string }, string[]>('keep', (input) => {
    knownKeys(input, ['unitId']);
    return { unitId: requiredString(input.unitId, 'unitId') };
  }),
  'customFields.previewValue': spec<'keep', Record<string, unknown>, CustomFieldHostPreview>(
    'keep',
    (input) => allow(input, ['definitionId', 'targetType', 'targetId', 'value', 'lexemeId']),
  ),
  'customFields.setValue': spec<'clear', Record<string, unknown>, CustomFieldHostValue>(
    'clear',
    (input) =>
      allow(input, [
        'definitionId',
        'targetType',
        'targetId',
        'value',
        'expectedRevision',
        'lexemeId',
      ]),
  ),
  'customFields.removeValue': spec<'clear', Record<string, unknown>, void>('clear', (input) =>
    allow(input, ['definitionId', 'targetType', 'targetId', 'lexemeId']),
  ),
  'customFields.missingFields': spec<
    'keep',
    { targetType: string; targetId: string; lexemeId?: string },
    string[]
  >('keep', (input) => {
    knownKeys(input, ['targetType', 'targetId', 'lexemeId']);
    return {
      targetType: requiredString(input.targetType, 'targetType'),
      targetId: requiredString(input.targetId, 'targetId'),
      ...(input.lexemeId === undefined
        ? {}
        : { lexemeId: requiredString(input.lexemeId, 'lexemeId') }),
    };
  }),
  'customFields.listDefinitions': spec<'keep', Record<string, never>, CustomFieldDefinition[]>(
    'keep',
    (input) => {
      knownKeys(input, []);
      return {} as Record<string, never>;
    },
  ),
  'customFields.locateValues': spec<'keep', { definitionId: string }, CustomFieldLocation[]>(
    'keep',
    definitionIdOf,
  ),
  'customFields.previewMigration': spec<
    'keep',
    { definitionId: string },
    CustomFieldMigrationPreview
  >('keep', definitionIdOf),
  'customFields.migrateDefinition': spec<'clear', Record<string, unknown>, CustomFieldDefinition>(
    'clear',
    (input) => allow(input, ['definitionId', 'expectedRevision', 'definition', 'conversions']),
  ),
  'customFields.previewPurge': spec<'keep', { definitionId: string }, CustomFieldPurgePreview>(
    'keep',
    definitionIdOf,
  ),
  'customFields.purgeDefinition': spec<'clear', Record<string, unknown>, void>('clear', (input) =>
    allow(input, ['definitionId', 'expectedRevision', 'previewFingerprint']),
  ),
  'sources.create': spec<'clear', SourceCreate, SourceRecord>('clear', sourceCreate),
  'sources.patch': spec<'clear', SourcePatch, SourceReading>('clear', sourcePatch),
  'sources.redeliver': spec<'clear', { operationId: string }, SourceReading>('clear', (input) => {
    knownKeys(input, ['operationId']);
    return { operationId: requiredString(input.operationId, 'operationId') };
  }),
  'speakers.patch': spec<'clear', SpeakerPatch, SpeakerReading>('clear', speakerPatch),
  'speakers.redeliver': spec<'clear', { operationId: string }, SpeakerReading>('clear', (input) => {
    knownKeys(input, ['operationId']);
    return { operationId: requiredString(input.operationId, 'operationId') };
  }),
  'speakers.create': spec<'clear', { name: string }, Speaker>('clear', (input) => {
    knownKeys(input, ['name']);
    return { name: requiredString(input.name, 'name') };
  }),
  'speakers.list': spec<'keep', Record<string, never>, Speaker[]>('keep', (input) => {
    knownKeys(input, []);
    return {} as Record<string, never>;
  }),
  'speakers.assign': spec<'keep', { speakerId: string; unitIds: string[] }, Unit[]>(
    'keep',
    speakerAssign,
  ),
  'conversations.create': spec<'clear', ConversationCreate, Conversation>(
    'clear',
    conversationCreate,
  ),
  'conversations.list': spec<'keep', Record<string, never>, Conversation[]>('keep', (input) => {
    knownKeys(input, []);
    return {} as Record<string, never>;
  }),
  'conversations.patch': spec<'clear', ConversationPatch, ConversationReading>(
    'clear',
    conversationPatch,
  ),
  'conversations.redeliver': spec<'clear', { operationId: string }, ConversationReading>(
    'clear',
    (input) => {
      knownKeys(input, ['operationId']);
      return { operationId: requiredString(input.operationId, 'operationId') };
    },
  ),
  'messages.append': spec<'clear', MessageAppend, Message>('clear', messageAppend),
  'messages.update': spec<'clear', { id: string; body: string }, Message>('clear', (input) => {
    knownKeys(input, ['id', 'body']);
    return {
      id: requiredString(input.id, 'id'),
      body: requiredString(input.body, 'body'),
    };
  }),
  'messages.clear': spec<
    'clear',
    { conversationId: string },
    { conversationId: string; cleared: number }
  >('clear', (input) => {
    knownKeys(input, ['conversationId']);
    return { conversationId: requiredString(input.conversationId, 'conversationId') };
  }),
  'messages.list': spec<'keep', { conversationId: string }, Message[]>('keep', (input) => {
    knownKeys(input, ['conversationId']);
    return { conversationId: requiredString(input.conversationId, 'conversationId') };
  }),
  'bibliography.patch': spec<'clear', BibliographyPatch, BibliographyReading>(
    'clear',
    bibliographyPatch,
  ),
  'bibliography.redeliver': spec<'clear', { operationId: string }, BibliographyReading>(
    'clear',
    (input) => {
      knownKeys(input, ['operationId']);
      return { operationId: requiredString(input.operationId, 'operationId') };
    },
  ),
  'references.listLinks': spec<'keep', Record<string, never>, LexemeLinkReading[]>(
    'keep',
    (input) => {
      knownKeys(input, []);
      return {} as Record<string, never>;
    },
  ),
  'analysis.apply': spec<'clear', ReturnType<typeof analysisApply>, AnalysisApplyResult>(
    'clear',
    analysisApply,
  ),
  'analysis.readState': spec<'keep', { unitId: string }, AnalysisReadState>('keep', unitIdOf),
  'analysis.listCandidates': spec<'keep', { unitId: string }, AnalysisCandidateRecord[]>(
    'keep',
    unitIdOf,
  ),
  'analysis.listWords': spec<'keep', { unitId: string }, UnitWord[]>('keep', unitIdOf),
  'analysis.segmentWords': spec<'clear', { unitId: string }, UnitWord[]>('clear', unitIdOf),
  'analysis.listMorphemes': spec<'keep', { unitId: string }, UnitMorpheme[]>('keep', unitIdOf),
  'analysis.segmentMorphemes': spec<'clear', { unitId: string }, UnitMorpheme[]>('clear', unitIdOf),
  'analysis.import': spec<'clear', ReturnType<typeof analysisImport>, AnalysisImportResult>(
    'clear',
    analysisImport,
  ),
  'analysis.submit': spec<'clear', ReturnType<typeof analysisSubmit>, AnalysisCandidateRecord>(
    'clear',
    analysisSubmit,
  ),
  'analysis.accept': spec<'clear', ReturnType<typeof analysisCandidate>, AnalysisAcceptResult>(
    'clear',
    analysisCandidate,
  ),
  'analysis.restore': spec<'clear', ReturnType<typeof analysisRestore>, AnalysisRoot>(
    'clear',
    analysisRestore,
  ),
  'analysis.split': spec<'clear', ReturnType<typeof analysisSplit>, AnalysisRoot>(
    'clear',
    analysisSplit,
  ),
  'analysis.merge': spec<'clear', ReturnType<typeof analysisMerge>, AnalysisRoot>(
    'clear',
    analysisMerge,
  ),
  'exchange.importFile': spec<'clear', { file: string; roles?: string }, ImportResult>(
    'clear',
    exchangeImport,
  ),
  'exchange.exportJyt': spec<'keep', string, { file: string }>('keep', exportFile),
  'exchange.exportJym': spec<'keep', string, { file: string }>('keep', exportFile),
  'exchange.exportManuscript': spec<
    'keep',
    { file: string; manuscriptId: string },
    { file: string }
  >('keep', exportManuscript),
};

export type DesktopOperations = typeof desktopOperations;

export function isDesktopOperation(method: string): method is keyof DesktopOperations {
  return Object.prototype.hasOwnProperty.call(desktopOperations, method);
}
