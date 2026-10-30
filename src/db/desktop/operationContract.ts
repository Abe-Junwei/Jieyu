// Renderer-safe: type imports and pure checks only. Handlers stay in the main process.
import type { Layer, LayerCreate } from './layers';
import type { DeletionReminder } from './manuscriptPurge';
import type {
  Manuscript,
  ManuscriptCreate,
  ManuscriptDeletePreview,
  RecordingDeletePreview,
  RecordingDeletion,
} from './manuscripts';
import type { Media, MediaCreate } from './media';
import type { MediaCleanup } from './mediaCleanup';
import type { MediaReregistration } from './mediaReregister';
import type { ProjectIdentity } from './projectIdentity';
import type { Unit } from './units';

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

export const desktopOperations = {
  'project.get': spec<'keep', Record<string, never>, ProjectIdentity | null>('keep', (input) => {
    knownKeys(input, []);
    return {} as Record<string, never>;
  }),
  'layers.create': spec<'clear', LayerCreate, Layer>('clear', checkLayerCreate),
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
};

export type DesktopOperations = typeof desktopOperations;

export function isDesktopOperation(method: string): method is keyof DesktopOperations {
  return Object.prototype.hasOwnProperty.call(desktopOperations, method);
}
