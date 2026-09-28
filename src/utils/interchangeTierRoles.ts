/**
 * Tier-role prompt for TextGrid, flextext, and Toolbox.
 * EAF keeps its own metadata key. These three share `interchangeTierRoles`.
 */
import type { EafImportToken, EafTranscriptionTier } from '../services/EafService';
import type { FlexImportResult } from '../services/FlexService';
import type { TextGridImportResult } from '../services/TextGridService';
import type { ToolboxImportResult } from '../services/ToolboxService';
import {
  EafTierRolesRequiredError,
  parseEafTierRole,
  proposeEafTierRoles,
  type EafTierRole,
} from './eafTierRole';

export const INTERCHANGE_TIER_ROLES_METADATA_KEY = 'interchangeTierRoles';

export type TierRoleGateOptions = {
  promptForEafTierRoles?: boolean;
  tierRolesAcknowledged?: boolean;
  tierRoles?: Readonly<Record<string, EafTierRole>>;
};

export type InterchangeNoteSegment = {
  startTime: number;
  endTime: number;
  text: string;
  annotationRef?: string;
};

type NormSegment = {
  startTime: number;
  endTime: number;
  text: string;
  annotationId?: string;
  phraseId?: string;
  tokens?: EafImportToken[];
};

type NormTier = {
  id: string;
  segments: NormSegment[];
};

type ReshapeResult = {
  passthrough: boolean;
  primary?: NormTier;
  translations: Map<string, NormSegment[]>;
  extras: NormTier[];
  notes: InterchangeNoteSegment[];
};

export function readInterchangeTierRoles(
  metadata: Record<string, unknown> | undefined,
): Record<string, EafTierRole> | undefined {
  const raw = metadata?.[INTERCHANGE_TIER_ROLES_METADATA_KEY];
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const roles: Record<string, EafTierRole> = {};
  for (const [tierId, value] of Object.entries(raw)) {
    const role = parseEafTierRole(value);
    const id = tierId.trim();
    if (role === undefined || id.length === 0) continue;
    roles[id] = role;
  }
  return Object.keys(roles).length > 0 ? roles : undefined;
}

export function mergeInterchangeTierRoles(
  metadata: Record<string, unknown>,
  roles: Readonly<Record<string, EafTierRole>>,
): Record<string, unknown> {
  return {
    ...metadata,
    [INTERCHANGE_TIER_ROLES_METADATA_KEY]: { ...roles },
  };
}

function tierIdOrFallback(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : fallback;
}

async function resolveTierRoles(
  fileName: string,
  tierIds: readonly string[],
  options: TierRoleGateOptions | undefined,
  readMetadata: () => Promise<Record<string, unknown> | undefined>,
): Promise<Readonly<Record<string, EafTierRole>> | undefined> {
  if (options?.tierRoles && Object.keys(options.tierRoles).length > 0) return options.tierRoles;
  if (options?.promptForEafTierRoles !== true) return undefined;
  if (tierIds.length < 2) return undefined;
  const saved = readInterchangeTierRoles(await readMetadata());
  if (saved) return saved;
  if (options.tierRolesAcknowledged === true) return undefined;
  const prompt = proposeEafTierRoles(tierIds.map((tierId) => ({ tierId })));
  if (prompt) throw new EafTierRolesRequiredError(fileName, prompt);
  return undefined;
}

function defaultRole(index: number): EafTierRole {
  return index === 0 ? 'transcription' : 'translation';
}

function reshape(
  rows: readonly NormTier[],
  roles: Readonly<Record<string, EafTierRole>> | undefined,
): ReshapeResult {
  const empty: ReshapeResult = {
    passthrough: true,
    translations: new Map(),
    extras: [],
    notes: [],
  };
  if (!roles) return empty;
  const matchesDefault = rows.every(
    (row, index) => (roles[row.id] ?? defaultRole(index)) === defaultRole(index),
  );
  if (matchesDefault) return empty;
  const transcriptions = rows.filter(
    (row, index) => (roles[row.id] ?? defaultRole(index)) === 'transcription',
  );
  const translations = new Map<string, NormSegment[]>();
  const notes: InterchangeNoteSegment[] = [];
  for (const [index, row] of rows.entries()) {
    const role = roles[row.id] ?? defaultRole(index);
    if (role === 'transcription' || role === 'exclude') continue;
    if (role === 'notes') {
      for (const segment of row.segments) {
        if (segment.text.trim().length === 0) continue;
        notes.push({
          startTime: segment.startTime,
          endTime: segment.endTime,
          text: segment.text,
        });
      }
      continue;
    }
    translations.set(row.id, row.segments);
  }
  return {
    passthrough: false,
    ...(transcriptions[0] ? { primary: transcriptions[0] } : {}),
    translations,
    extras: transcriptions.slice(1),
    notes,
  };
}

function toExtra(rows: readonly NormTier[]): EafTranscriptionTier[] {
  return rows.map((row) => ({
    tierName: row.id,
    units: row.segments.map((segment) => ({
      startTime: segment.startTime,
      endTime: segment.endTime,
      transcription: segment.text,
      ...(segment.annotationId !== undefined && segment.annotationId.length > 0
        ? { annotationId: segment.annotationId }
        : {}),
      ...(segment.tokens && segment.tokens.length > 0 ? { tokens: segment.tokens } : {}),
    })),
  }));
}

function textGridRows(result: TextGridImportResult): NormTier[] {
  const primaryId = tierIdOrFallback(result.transcriptionTierName, 'interval');
  const rows: NormTier[] = [
    {
      id: primaryId,
      segments: result.units.map((unit) => ({
        startTime: unit.startTime,
        endTime: unit.endTime,
        text: unit.transcription,
      })),
    },
  ];
  for (const [id, segments] of result.additionalTiers) {
    rows.push({
      id,
      segments: segments.map((segment) => ({
        startTime: segment.startTime,
        endTime: segment.endTime,
        text: segment.text,
      })),
    });
  }
  return rows;
}

function flexRows(result: FlexImportResult): NormTier[] {
  const primaryId = tierIdOrFallback(result.transcriptionTierName, 'primary');
  const rows: NormTier[] = [
    {
      id: primaryId,
      segments: result.units.map((unit) => ({
        startTime: unit.startTime,
        endTime: unit.endTime,
        text: unit.transcription,
        ...(unit.phraseId !== undefined && unit.phraseId.length > 0
          ? { phraseId: unit.phraseId }
          : {}),
        ...(unit.annotationId !== undefined && unit.annotationId.length > 0
          ? { annotationId: unit.annotationId }
          : {}),
        ...(unit.tokens ? { tokens: unit.tokens } : {}),
      })),
    },
  ];
  for (const [id, segments] of result.additionalTiers) {
    rows.push({
      id,
      segments: segments.map((segment) => ({
        startTime: segment.startTime,
        endTime: segment.endTime,
        text: segment.text,
        ...(segment.tokens ? { tokens: segment.tokens } : {}),
      })),
    });
  }
  return rows;
}

function toolboxRows(result: ToolboxImportResult): NormTier[] {
  const rows: NormTier[] = [
    {
      id: 'primary',
      segments: result.units.map((unit) => ({
        startTime: unit.startTime,
        endTime: unit.endTime,
        text: unit.transcription,
        ...(unit.tokens ? { tokens: unit.tokens } : {}),
      })),
    },
  ];
  for (const [id, segments] of result.additionalTiers) {
    rows.push({
      id,
      segments: segments.map((segment) => ({
        startTime: segment.startTime,
        endTime: segment.endTime,
        text: segment.text,
        ...(segment.tokens ? { tokens: segment.tokens } : {}),
      })),
    });
  }
  return rows;
}

function additionalFrom(translations: Map<string, NormSegment[]>) {
  const additional = new Map<
    string,
    Array<{
      startTime: number;
      endTime: number;
      text: string;
      tokens?: EafImportToken[];
    }>
  >();
  for (const [id, segments] of translations) {
    additional.set(
      id,
      segments.map((segment) => ({
        startTime: segment.startTime,
        endTime: segment.endTime,
        text: segment.text,
        ...(segment.tokens && segment.tokens.length > 0 ? { tokens: segment.tokens } : {}),
      })),
    );
  }
  return additional;
}

export async function shapeTextGridForTierRoles(
  result: TextGridImportResult,
  fileName: string,
  options: TierRoleGateOptions | undefined,
  readMetadata: () => Promise<Record<string, unknown> | undefined>,
): Promise<{
  result: TextGridImportResult;
  extraTranscriptionTiers: EafTranscriptionTier[];
  noteSegments: InterchangeNoteSegment[];
}> {
  const rows = textGridRows(result);
  const roles = await resolveTierRoles(
    fileName,
    rows.map((row) => row.id),
    options,
    readMetadata,
  );
  const shaped = reshape(rows, roles);
  if (shaped.passthrough) {
    return { result, extraTranscriptionTiers: [], noteSegments: [] };
  }
  return {
    result: {
      ...result,
      ...(shaped.primary ? { transcriptionTierName: shaped.primary.id } : {}),
      units: (shaped.primary?.segments ?? []).map((segment) => ({
        startTime: segment.startTime,
        endTime: segment.endTime,
        transcription: segment.text,
      })),
      additionalTiers: additionalFrom(shaped.translations),
    },
    extraTranscriptionTiers: toExtra(shaped.extras),
    noteSegments: shaped.notes,
  };
}

export async function shapeFlexForTierRoles(
  result: FlexImportResult,
  fileName: string,
  options: TierRoleGateOptions | undefined,
  readMetadata: () => Promise<Record<string, unknown> | undefined>,
): Promise<{
  result: FlexImportResult;
  extraTranscriptionTiers: EafTranscriptionTier[];
  noteSegments: InterchangeNoteSegment[];
}> {
  const rows = flexRows(result);
  const roles = await resolveTierRoles(
    fileName,
    rows.map((row) => row.id),
    options,
    readMetadata,
  );
  const shaped = reshape(rows, roles);
  if (shaped.passthrough) {
    return { result, extraTranscriptionTiers: [], noteSegments: [] };
  }
  return {
    result: {
      ...result,
      ...(shaped.primary ? { transcriptionTierName: shaped.primary.id } : {}),
      units: (shaped.primary?.segments ?? []).map((segment) => ({
        startTime: segment.startTime,
        endTime: segment.endTime,
        transcription: segment.text,
        ...(segment.phraseId !== undefined && segment.phraseId.length > 0
          ? { phraseId: segment.phraseId }
          : {}),
        ...(segment.annotationId !== undefined && segment.annotationId.length > 0
          ? { annotationId: segment.annotationId }
          : {}),
        ...(segment.tokens ? { tokens: segment.tokens } : {}),
      })),
      additionalTiers: additionalFrom(shaped.translations),
    },
    extraTranscriptionTiers: toExtra(shaped.extras),
    noteSegments: shaped.notes,
  };
}

export async function shapeToolboxForTierRoles(
  result: ToolboxImportResult,
  fileName: string,
  options: TierRoleGateOptions | undefined,
  readMetadata: () => Promise<Record<string, unknown> | undefined>,
): Promise<{
  result: ToolboxImportResult;
  extraTranscriptionTiers: EafTranscriptionTier[];
  noteSegments: InterchangeNoteSegment[];
}> {
  const rows = toolboxRows(result);
  const roles = await resolveTierRoles(
    fileName,
    rows.map((row) => row.id),
    options,
    readMetadata,
  );
  const shaped = reshape(rows, roles);
  if (shaped.passthrough) {
    return { result, extraTranscriptionTiers: [], noteSegments: [] };
  }
  return {
    result: {
      ...result,
      units: (shaped.primary?.segments ?? []).map((segment) => ({
        startTime: segment.startTime,
        endTime: segment.endTime,
        transcription: segment.text,
        ...(segment.tokens ? { tokens: segment.tokens } : {}),
      })),
      additionalTiers: additionalFrom(shaped.translations),
    },
    extraTranscriptionTiers: toExtra(shaped.extras),
    noteSegments: shaped.notes,
  };
}
