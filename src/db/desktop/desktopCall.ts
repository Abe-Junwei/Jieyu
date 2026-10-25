import { applyAnalysis } from './analysis';
import { importAnalysis } from './analysisImport';
import {
  acceptAnalysis,
  mergeAnalysisNodes,
  restoreAnalysis,
  splitAnalysisNode,
  submitAnalysis,
  type AnalysisCredentials,
} from './analysisRestore';
import {
  createBridge,
  createOrthography,
  ensureProjectLanguage,
  getBridge,
  getProjectLanguage,
  type BridgeCreate,
  type LanguageEnsure,
  type OrthographyCreate,
} from './catalog';
import {
  CUSTOM_FIELD_DEFINITION_KEYS,
  CUSTOM_FIELD_UPDATE_KEYS,
  addOption,
  createDefinition,
  importDefinition,
  missingUnitFields,
  previewUnitValue,
  removeUnitValue,
  setUnitValue,
  updateDefinition,
  updateOptionLabel,
} from './customFields';
import { createLayer, listLayers, type LayerCreate } from './layers';
import {
  linkSense,
  removeSense,
  saveLexemeEntry,
  getLexemeEntry,
  type LexemeLinkWrite,
  type LexemeSave,
} from './lexicon';
import { createMedia, type MediaCreate } from './media';
import {
  createManuscript,
  listManuscripts,
  rollbackManuscriptTimeMapping,
  setManuscriptTimeMapping,
  type ManuscriptCreate,
} from './manuscripts';
import {
  desktopSessionFolder,
  reopenDesktopSession,
  requireDesktopSession,
} from './projectSession';
import {
  createUnit,
  getUnit,
  listUnits,
  updateBoundary,
  updateUnitText,
  type UnitCreate,
} from './units';

const METHODS = [
  'media.create',
  'manuscripts.create',
  'manuscripts.list',
  'manuscripts.setTimeMapping',
  'manuscripts.rollbackTimeMapping',
  'layers.create',
  'layers.list',
  'catalog.ensureProjectDefinition',
  'catalog.getLanguage',
  'orthographies.create',
  'bridges.create',
  'bridges.get',
  'lexicon.saveEntry',
  'lexicon.getEntry',
  'lexicon.linkSense',
  'lexicon.removeSense',
  'units.create',
  'units.get',
  'units.list',
  'units.updateText',
  'units.updateBoundary',
  'customFields.createDefinition',
  'customFields.updateDefinition',
  'customFields.addOption',
  'customFields.updateOptionLabel',
  'customFields.importDefinition',
  'customFields.previewUnitValue',
  'customFields.setUnitValue',
  'customFields.removeUnitValue',
  'customFields.missingUnitFields',
  'analysis.apply',
  'analysis.import',
  'analysis.submit',
  'analysis.accept',
  'analysis.restore',
  'analysis.split',
  'analysis.merge',
  'reopen',
] as const;

type DesktopMethod = (typeof METHODS)[number];

export function callDesktopSession(sessionId: string, method: string, args: unknown): unknown {
  const parsed = parseMethod(method);
  if (parsed === 'reopen') {
    reopenDesktopSession(sessionId);
    return { reopened: true };
  }
  const project = requireDesktopSession(sessionId);
  const input = objectArg(args);
  switch (parsed) {
    case 'media.create':
      return createMedia(project.db, desktopSessionFolder(sessionId), mediaCreate(input));
    case 'manuscripts.create':
      return createManuscript(project.db, manuscriptCreate(input));
    case 'manuscripts.list':
      return listManuscripts(project.db);
    case 'manuscripts.setTimeMapping':
      return setManuscriptTimeMapping(project.db, timeMappingSet(input));
    case 'manuscripts.rollbackTimeMapping':
      return rollbackManuscriptTimeMapping(project.db, {
        manuscriptId: requiredString(input.manuscriptId, 'manuscriptId'),
        expectedRevision: requiredNumber(input.expectedRevision, 'expectedRevision'),
      });
    case 'layers.create':
      return createLayer(project.db, layerCreate(input));
    case 'layers.list':
      return listLayers(project.db, requiredString(input.manuscriptId, 'manuscriptId'));
    case 'catalog.ensureProjectDefinition':
      return ensureProjectLanguage(project.db, languageEnsure(input));
    case 'catalog.getLanguage':
      return getProjectLanguage(project.db, requiredString(input.id, 'id'));
    case 'orthographies.create':
      return createOrthography(project.db, orthographyCreate(input));
    case 'bridges.create':
      return createBridge(project.db, bridgeCreate(input));
    case 'bridges.get':
      return getBridge(project.db, requiredString(input.id, 'id'));
    case 'lexicon.saveEntry':
      return saveLexemeEntry(project.db, lexemeSave(input));
    case 'lexicon.getEntry':
      return getLexemeEntry(project.db, requiredString(input.id, 'id'));
    case 'lexicon.linkSense':
      return linkSense(project.db, lexemeLink(input));
    case 'lexicon.removeSense':
      return removeSense(project.db, {
        lexemeId: requiredString(input.lexemeId, 'lexemeId'),
        senseId: requiredString(input.senseId, 'senseId'),
      });
    case 'units.create':
      return createUnit(project.db, unitCreate(input));
    case 'units.get':
      return getUnit(project.db, requiredString(input.id, 'id'));
    case 'units.list':
      return listUnits(project.db, requiredString(input.layerId, 'layerId'));
    case 'units.updateText':
      return updateUnitText(project.db, {
        unitId: requiredString(input.unitId, 'unitId'),
        text: requiredString(input.text, 'text'),
      });
    case 'units.updateBoundary':
      return updateBoundary(project.db, {
        leftId: requiredString(input.leftId, 'leftId'),
        rightId: requiredString(input.rightId, 'rightId'),
        time: requiredNumber(input.time, 'time'),
      });
    case 'customFields.createDefinition':
      knownKeys(input, CUSTOM_FIELD_DEFINITION_KEYS);
      return createDefinition(project.db, input);
    case 'customFields.updateDefinition':
      knownKeys(input, CUSTOM_FIELD_UPDATE_KEYS);
      return updateDefinition(project.db, input);
    case 'customFields.addOption':
      knownKeys(input, ['definitionId', 'expectedRevision', 'label', 'sortOrder']);
      return addOption(project.db, input);
    case 'customFields.updateOptionLabel':
      knownKeys(input, ['definitionId', 'optionId', 'expectedRevision', 'label']);
      return updateOptionLabel(project.db, input);
    case 'customFields.importDefinition':
      knownKeys(input, ['mode', 'definition']);
      return importDefinition(project.db, input);
    case 'customFields.previewUnitValue':
      knownKeys(input, ['definitionId', 'unitId', 'value']);
      return previewUnitValue(project.db, input);
    case 'customFields.setUnitValue':
      knownKeys(input, ['definitionId', 'unitId', 'value', 'expectedRevision']);
      return setUnitValue(project.db, input);
    case 'customFields.removeUnitValue':
      knownKeys(input, ['definitionId', 'unitId']);
      return removeUnitValue(project.db, input);
    case 'customFields.missingUnitFields':
      knownKeys(input, ['unitId']);
      return missingUnitFields(project.db, requiredString(input.unitId, 'unitId'));
    case 'analysis.apply':
      return applyAnalysis(project.db, analysisApply(input));
    case 'analysis.import':
      return importAnalysis(project.db, analysisImport(input));
    case 'analysis.submit':
      return submitAnalysis(project.db, analysisSubmit(input));
    case 'analysis.accept':
      return acceptAnalysis(project.db, analysisCandidate(input));
    case 'analysis.restore':
      return restoreAnalysis(project.db, analysisCandidate(input));
    case 'analysis.split':
      return splitAnalysisNode(project.db, analysisSplit(input));
    case 'analysis.merge':
      return mergeAnalysisNodes(project.db, analysisMerge(input));
    default: {
      const unreachable: never = parsed;
      return unreachable;
    }
  }
}

function parseMethod(method: string): DesktopMethod {
  if ((METHODS as readonly string[]).includes(method)) return method as DesktopMethod;
  throw new Error('unknown desktop call');
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

function fingerprintString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('desktop call graphFingerprint must be a string');
  return value;
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

function analysisSubmit(input: Record<string, unknown>): { unitId: string; graph: unknown } {
  knownKeys(input, ['unitId', 'graph']);
  return { unitId: requiredString(input.unitId, 'unitId'), graph: input.graph };
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

function mediaCreate(input: Record<string, unknown>): MediaCreate {
  return {
    relpath: requiredString(input.relpath, 'relpath'),
    sha256: requiredString(input.sha256, 'sha256'),
    duration: requiredNumber(input.duration, 'duration'),
  };
}

function manuscriptCreate(input: Record<string, unknown>): ManuscriptCreate {
  return {
    title: stringMap(input.title, 'title'),
    mediaId: requiredString(input.mediaId, 'mediaId'),
  };
}

function layerCreate(input: Record<string, unknown>): LayerCreate {
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
  };
}

function timeMappingSet(input: Record<string, unknown>): {
  manuscriptId: string;
  expectedRevision: number;
  offsetSec: number;
  scale: number;
  sourceMediaId?: string;
} {
  const sourceMediaId = input.sourceMediaId;
  return {
    manuscriptId: requiredString(input.manuscriptId, 'manuscriptId'),
    expectedRevision: requiredNumber(input.expectedRevision, 'expectedRevision'),
    offsetSec: requiredNumber(input.offsetSec, 'offsetSec'),
    scale: requiredNumber(input.scale, 'scale'),
    ...(typeof sourceMediaId === 'string' ? { sourceMediaId } : {}),
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
  };
}

function aliasInput(value: unknown): { alias: string; aliasType: string } {
  const record = objectArg(value);
  return {
    alias: requiredString(record.alias, 'alias'),
    aliasType: requiredString(record.aliasType, 'aliasType'),
  };
}

function orthographyCreate(input: Record<string, unknown>): OrthographyCreate {
  return {
    languageId: requiredString(input.languageId, 'languageId'),
    name: stringMap(input.name, 'name'),
    scriptTag: requiredString(input.scriptTag, 'scriptTag'),
    sourceType: requiredString(input.sourceType, 'sourceType'),
  };
}

function bridgeCreate(input: Record<string, unknown>): BridgeCreate {
  const rules = input.rules;
  if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) {
    throw new Error('bridge rules must be an object');
  }
  const sampleCases = input.sampleCases;
  return {
    sourceOrthographyId: requiredString(input.sourceOrthographyId, 'sourceOrthographyId'),
    targetOrthographyId: requiredString(input.targetOrthographyId, 'targetOrthographyId'),
    engine: requiredString(input.engine, 'engine'),
    rules: rules as Record<string, unknown>,
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
    ...(typeof input.accessRights === 'string' ? { accessRights: input.accessRights } : {}),
    ...(link === undefined ? {} : { link: linkWrite(link) }),
  };
}

function lexemeLink(input: Record<string, unknown>): LexemeLinkWrite & { lexemeId: string } {
  return {
    lexemeId: requiredString(input.lexemeId, 'lexemeId'),
    ...linkWrite(input),
  };
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

function booleanMap(value: unknown): Record<string, boolean> {
  const record = objectArg(value);
  const tags: Record<string, boolean> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== 'boolean') throw new Error('lexeme tags are invalid');
    tags[key] = item;
  }
  return tags;
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

function fieldValueMap(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('desktop call fieldValues must be an object');
  }
  return value as Record<string, unknown>;
}

function knownKeys(input: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new Error(`desktop call field ${key} is not supported`);
  }
}

function optionalString(value: unknown, name: string): string | null {
  if (value === null) return null;
  return requiredString(value, name);
}
