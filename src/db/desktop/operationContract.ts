// Renderer-safe: type imports and pure checks only. Handlers stay in the main process.
import type {
  BridgeCreate,
  LanguageEnsure,
  OrthographyCreate,
  ProjectBridge,
  ProjectLanguage,
  ProjectOrthography,
} from './catalog';
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
};

export type DesktopOperations = typeof desktopOperations;

export function isDesktopOperation(method: string): method is keyof DesktopOperations {
  return Object.prototype.hasOwnProperty.call(desktopOperations, method);
}
