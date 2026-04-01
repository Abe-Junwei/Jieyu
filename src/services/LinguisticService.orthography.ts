import {
  getDb,
  type MultiLangString,
  type OrthographyDocType,
  type OrthographyTransformDocType,
} from '../db';
import { newId } from '../utils/transcriptionFormatters';
import { previewOrthographyTransform } from '../utils/orthographyTransforms';

export interface CreateOrthographyInput {
  languageId: string;
  name: MultiLangString;
  abbreviation?: string;
  type?: OrthographyDocType['type'];
  scriptTag?: string;
  localeTag?: string;
  regionTag?: string;
  variantTag?: string;
  direction?: OrthographyDocType['direction'];
  exemplarCharacters?: OrthographyDocType['exemplarCharacters'];
  normalization?: OrthographyDocType['normalization'];
  collation?: OrthographyDocType['collation'];
  fontPreferences?: OrthographyDocType['fontPreferences'];
  inputHints?: OrthographyDocType['inputHints'];
  bidiPolicy?: OrthographyDocType['bidiPolicy'];
  conversionRules?: Record<string, unknown>;
  notes?: MultiLangString;
}

export interface CloneOrthographyToLanguageInput extends Omit<CreateOrthographyInput, 'languageId' | 'name'> {
  sourceOrthographyId: string;
  targetLanguageId: string;
  name?: MultiLangString;
}

export interface CreateOrthographyTransformInput {
  sourceOrthographyId: string;
  targetOrthographyId: string;
  engine: OrthographyTransformDocType['engine'];
  rules: OrthographyTransformDocType['rules'];
  name?: MultiLangString;
  sampleInput?: string;
  sampleOutput?: string;
  sampleCases?: OrthographyTransformDocType['sampleCases'];
  isReversible?: boolean;
  status?: OrthographyTransformDocType['status'];
  notes?: MultiLangString;
}

export interface ListOrthographyTransformsSelector {
  sourceOrthographyId?: string;
  targetOrthographyId?: string;
}

export interface UpdateOrthographyTransformInput {
  id: string;
  sourceOrthographyId?: string;
  targetOrthographyId?: string;
  name?: MultiLangString | null;
  engine?: OrthographyTransformDocType['engine'];
  rules?: OrthographyTransformDocType['rules'];
  sampleInput?: string | null;
  sampleOutput?: string | null;
  sampleCases?: OrthographyTransformDocType['sampleCases'] | null;
  isReversible?: boolean | null;
  status?: OrthographyTransformDocType['status'] | null;
  notes?: MultiLangString | null;
}

export interface GetActiveOrthographyTransformInput {
  sourceOrthographyId: string;
  targetOrthographyId: string;
}

export interface ApplyOrthographyTransformInput extends GetActiveOrthographyTransformInput {
  text: string;
}

export interface PreviewOrthographyTransformInput {
  engine: OrthographyTransformDocType['engine'];
  rules: OrthographyTransformDocType['rules'];
  text: string;
}

function rankOrthographyTransformStatus(status: OrthographyTransformDocType['status']): number {
  if (status === 'active') return 0;
  if (status === 'draft' || status === undefined) return 1;
  return 2;
}

export async function createOrthographyRecord(input: CreateOrthographyInput): Promise<OrthographyDocType> {
  const db = await getDb();
  const now = new Date().toISOString();
  const orthography: OrthographyDocType = {
    id: newId('orth'),
    name: input.name,
    languageId: input.languageId,
    ...(input.abbreviation ? { abbreviation: input.abbreviation } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.scriptTag ? { scriptTag: input.scriptTag } : {}),
    ...(input.localeTag ? { localeTag: input.localeTag } : {}),
    ...(input.regionTag ? { regionTag: input.regionTag } : {}),
    ...(input.variantTag ? { variantTag: input.variantTag } : {}),
    ...(input.direction ? { direction: input.direction } : {}),
    ...(input.exemplarCharacters ? { exemplarCharacters: input.exemplarCharacters } : {}),
    ...(input.normalization ? { normalization: input.normalization } : {}),
    ...(input.collation ? { collation: input.collation } : {}),
    ...(input.fontPreferences ? { fontPreferences: input.fontPreferences } : {}),
    ...(input.inputHints ? { inputHints: input.inputHints } : {}),
    ...(input.bidiPolicy ? { bidiPolicy: input.bidiPolicy } : {}),
    ...(input.conversionRules ? { conversionRules: input.conversionRules } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await db.collections.orthographies.insert(orthography);
  return orthography;
}

export async function cloneOrthographyRecordToLanguage(
  input: CloneOrthographyToLanguageInput,
): Promise<OrthographyDocType> {
  const db = await getDb();
  const sourceDoc = await db.collections.orthographies.findOne({
    selector: { id: input.sourceOrthographyId },
  }).exec();
  const source = sourceDoc?.toJSON();
  if (!source) {
    throw new Error('\u6e90\u6b63\u5b57\u6cd5\u4e0d\u5b58\u5728');
  }

  return createOrthographyRecord({
    languageId: input.targetLanguageId,
    name: input.name ?? source.name,
    ...((input.abbreviation ?? source.abbreviation) !== undefined
      ? { abbreviation: input.abbreviation ?? source.abbreviation }
      : {}),
    ...((input.type ?? source.type) !== undefined ? { type: input.type ?? source.type } : {}),
    ...((input.scriptTag ?? source.scriptTag) !== undefined
      ? { scriptTag: input.scriptTag ?? source.scriptTag }
      : {}),
    ...((input.localeTag ?? source.localeTag) !== undefined
      ? { localeTag: input.localeTag ?? source.localeTag }
      : {}),
    ...((input.regionTag ?? source.regionTag) !== undefined
      ? { regionTag: input.regionTag ?? source.regionTag }
      : {}),
    ...((input.variantTag ?? source.variantTag) !== undefined
      ? { variantTag: input.variantTag ?? source.variantTag }
      : {}),
    ...((input.direction ?? source.direction) !== undefined
      ? { direction: input.direction ?? source.direction }
      : {}),
    ...((input.exemplarCharacters ?? source.exemplarCharacters) !== undefined
      ? { exemplarCharacters: input.exemplarCharacters ?? source.exemplarCharacters }
      : {}),
    ...((input.normalization ?? source.normalization) !== undefined
      ? { normalization: input.normalization ?? source.normalization }
      : {}),
    ...((input.collation ?? source.collation) !== undefined
      ? { collation: input.collation ?? source.collation }
      : {}),
    ...((input.fontPreferences ?? source.fontPreferences) !== undefined
      ? { fontPreferences: input.fontPreferences ?? source.fontPreferences }
      : {}),
    ...((input.inputHints ?? source.inputHints) !== undefined
      ? { inputHints: input.inputHints ?? source.inputHints }
      : {}),
    ...((input.bidiPolicy ?? source.bidiPolicy) !== undefined
      ? { bidiPolicy: input.bidiPolicy ?? source.bidiPolicy }
      : {}),
    ...((input.conversionRules ?? source.conversionRules) !== undefined
      ? { conversionRules: input.conversionRules ?? source.conversionRules }
      : {}),
    ...((input.notes ?? source.notes) !== undefined ? { notes: input.notes ?? source.notes } : {}),
  });
}

export async function createOrthographyTransformRecord(
  input: CreateOrthographyTransformInput,
): Promise<OrthographyTransformDocType> {
  const db = await getDb();
  const now = new Date().toISOString();
  const transform: OrthographyTransformDocType = {
    id: newId('orthxfm'),
    sourceOrthographyId: input.sourceOrthographyId,
    targetOrthographyId: input.targetOrthographyId,
    engine: input.engine,
    rules: input.rules,
    ...(input.name ? { name: input.name } : {}),
    ...(input.sampleInput ? { sampleInput: input.sampleInput } : {}),
    ...(input.sampleOutput ? { sampleOutput: input.sampleOutput } : {}),
    ...(input.sampleCases ? { sampleCases: input.sampleCases } : {}),
    ...(input.isReversible !== undefined ? { isReversible: input.isReversible } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await db.collections.orthography_transforms.insert(transform);
  return transform;
}

export async function listOrthographyTransformRecords(
  selector: ListOrthographyTransformsSelector = {},
): Promise<OrthographyTransformDocType[]> {
  const db = await getDb();
  const docs = await db.collections.orthography_transforms.find().exec();
  return docs
    .map((doc) => doc.toJSON())
    .filter((doc) => {
      if (selector.sourceOrthographyId && doc.sourceOrthographyId !== selector.sourceOrthographyId) {
        return false;
      }
      if (selector.targetOrthographyId && doc.targetOrthographyId !== selector.targetOrthographyId) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const rankDiff = rankOrthographyTransformStatus(left.status) - rankOrthographyTransformStatus(right.status);
      if (rankDiff !== 0) return rankDiff;
      return (right.updatedAt || right.createdAt).localeCompare(left.updatedAt || left.createdAt);
    });
}

export async function updateOrthographyTransformRecord(
  input: UpdateOrthographyTransformInput,
): Promise<OrthographyTransformDocType> {
  const db = await getDb();
  const existing = await db.dexie.orthography_transforms.get(input.id);
  if (!existing) {
    throw new Error('\u6b63\u5b57\u6cd5\u53d8\u6362\u4e0d\u5b58\u5728');
  }

  const next: OrthographyTransformDocType = {
    ...existing,
    ...(input.sourceOrthographyId ? { sourceOrthographyId: input.sourceOrthographyId } : {}),
    ...(input.targetOrthographyId ? { targetOrthographyId: input.targetOrthographyId } : {}),
    ...(input.engine ? { engine: input.engine } : {}),
    ...(input.rules ? { rules: input.rules } : {}),
    updatedAt: new Date().toISOString(),
  };

  if (input.name === null) {
    delete next.name;
  } else if (input.name !== undefined) {
    next.name = input.name;
  }

  if (input.sampleInput === null) {
    delete next.sampleInput;
  } else if (input.sampleInput !== undefined) {
    next.sampleInput = input.sampleInput;
  }

  if (input.sampleOutput === null) {
    delete next.sampleOutput;
  } else if (input.sampleOutput !== undefined) {
    next.sampleOutput = input.sampleOutput;
  }

  if (input.sampleCases === null) {
    delete next.sampleCases;
  } else if (input.sampleCases !== undefined) {
    next.sampleCases = input.sampleCases;
  }

  if (input.isReversible === null) {
    delete next.isReversible;
  } else if (input.isReversible !== undefined) {
    next.isReversible = input.isReversible;
  }

  if (input.status === null) {
    delete next.status;
  } else if (input.status !== undefined) {
    next.status = input.status;
  }

  if (input.notes === null) {
    delete next.notes;
  } else if (input.notes !== undefined) {
    next.notes = input.notes;
  }

  await db.collections.orthography_transforms.insert(next);
  return next;
}

export async function deleteOrthographyTransformRecord(id: string): Promise<void> {
  const db = await getDb();
  await db.collections.orthography_transforms.remove(id);
}

export async function getActiveOrthographyTransformRecord(
  input: GetActiveOrthographyTransformInput,
): Promise<OrthographyTransformDocType | null> {
  const db = await getDb();
  const candidates = await db.dexie.orthography_transforms
    .where('[sourceOrthographyId+targetOrthographyId]')
    .equals([input.sourceOrthographyId, input.targetOrthographyId])
    .toArray();

  const preferred = candidates
    .filter((doc) => doc.status !== 'deprecated')
    .sort((left, right) => {
      const rankDiff = rankOrthographyTransformStatus(left.status) - rankOrthographyTransformStatus(right.status);
      if (rankDiff !== 0) return rankDiff;
      return (right.updatedAt || right.createdAt).localeCompare(left.updatedAt || left.createdAt);
    })[0];

  return preferred ?? null;
}

export async function applyOrthographyTransformRecord(
  input: ApplyOrthographyTransformInput,
): Promise<{ text: string; transformId?: string }> {
  if (!input.text || input.sourceOrthographyId === input.targetOrthographyId) {
    return { text: input.text };
  }

  const transform = await getActiveOrthographyTransformRecord({
    sourceOrthographyId: input.sourceOrthographyId,
    targetOrthographyId: input.targetOrthographyId,
  });
  if (!transform) {
    return { text: input.text };
  }

  return {
    text: previewOrthographyTransformText({
      engine: transform.engine,
      rules: transform.rules,
      text: input.text,
    }),
    transformId: transform.id,
  };
}

export function previewOrthographyTransformText(input: PreviewOrthographyTransformInput): string {
  return previewOrthographyTransform(input);
}