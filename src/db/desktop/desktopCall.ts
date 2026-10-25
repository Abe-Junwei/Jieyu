import { createLayer, listLayers, type LayerCreate } from './layers';
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
  'units.create',
  'units.get',
  'units.list',
  'units.updateText',
  'units.updateBoundary',
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
  return {
    manuscriptId: requiredString(input.manuscriptId, 'manuscriptId'),
    key: requiredString(input.key, 'key'),
    name: stringMap(input.name, 'name'),
    tierType: requiredString(input.tierType, 'tierType'),
    contentType: requiredString(input.contentType, 'contentType'),
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

function unitCreate(input: Record<string, unknown>): UnitCreate {
  return {
    layerId: requiredString(input.layerId, 'layerId'),
    startTime: requiredNumber(input.startTime, 'startTime'),
    endTime: requiredNumber(input.endTime, 'endTime'),
    text: requiredString(input.text, 'text'),
  };
}
