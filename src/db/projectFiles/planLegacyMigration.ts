/**
 * 把一份合成的旧库快照规划成音频文件和 .jyd。
 * 不读、不写 IndexedDB。一份文稿挂着多条录音时，未经确认不产出文件。
 * 层、词和词素会跟着文稿写进 `.jyd`。项目行和说话人进项目库，不进 `.jyd`。定义副本还没写。
 */
import { createHash } from 'node:crypto';
import { unitAudioIds } from './manuscriptAudio';
import { crossManuscriptParentLinks } from './manuscriptParents';

export interface LegacyDocument {
  id: string;
  name: string;
}

export interface LegacyLayer {
  id: string;
  documentId: string;
  key?: string;
}

export interface LegacyUnit {
  id: string;
  layerId: string;
  mediaId?: string;
  parentUnitId?: string;
}

export interface LegacyToken {
  id: string;
  unitId: string;
  tokenIndex: number;
  form: string;
}

export interface LegacyMorpheme {
  id: string;
  unitId: string;
  tokenId: string;
  morphemeIndex: number;
  form: string;
}

export interface LegacyProject {
  id: string;
  name: string;
}

export interface LegacySpeaker {
  id: string;
  textId: string;
  name: string;
}

export interface LegacyAudio {
  id: string;
  filename: string;
  bytes: Uint8Array;
}

export interface LegacyLibrary {
  documents: readonly LegacyDocument[];
  layers: readonly LegacyLayer[];
  units: readonly LegacyUnit[];
  audios: readonly LegacyAudio[];
  tokens?: readonly LegacyToken[];
  morphemes?: readonly LegacyMorpheme[];
  project?: LegacyProject;
  speakers?: readonly LegacySpeaker[];
}

export interface PlannedAudio {
  audioId: string;
  fileName: string;
  sha256: string;
  bytes: Uint8Array;
}

export interface PlannedLayer {
  id: string;
  key: string;
}

export interface PlannedUnit {
  id: string;
  layerId: string;
  mediaId?: string;
  parentUnitId?: string;
}

export interface PlannedToken {
  id: string;
  unitId: string;
  tokenIndex: number;
  form: string;
}

export interface PlannedMorpheme {
  id: string;
  unitId: string;
  tokenId: string;
  morphemeIndex: number;
  form: string;
}

export interface PlannedManuscript {
  id: string;
  sourceDocumentId: string;
  fileName: string;
  audioId: string | null;
  layers: PlannedLayer[];
  units: PlannedUnit[];
  tokens: PlannedToken[];
  morphemes: PlannedMorpheme[];
}

export interface DroppedLink {
  unitId: string;
  parentUnitId: string;
}

export type LegacyMigrationPlan =
  | {
      status: 'ready';
      audios: PlannedAudio[];
      manuscripts: PlannedManuscript[];
      droppedLinks: DroppedLink[];
      droppedMorphemes: { id: string; tokenId: string }[];
      project: LegacyProject | null;
      speakers: { id: string; textId: string; name: string }[];
      droppedSpeakers: { id: string; textId: string }[];
    }
  | { status: 'needs-confirm'; documents: { documentId: string; audioIds: string[] }[] }
  | { status: 'rejected'; reason: 'cross-manuscript-parent'; links: DroppedLink[] }
  | { status: 'rejected'; reason: 'speakers-without-project' };

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function baseName(filename: string): string {
  const parts = filename.split(/[/\\]/);
  return parts[parts.length - 1] ?? filename;
}

function uniqueName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let n = 2;
  let next = `${stem} (${n})${ext}`;
  while (used.has(next)) {
    n += 1;
    next = `${stem} (${n})${ext}`;
  }
  used.add(next);
  return next;
}

function plannedSegmentation(
  tokens: readonly LegacyToken[],
  morphemes: readonly LegacyMorpheme[],
  unitIds: ReadonlySet<string>,
): {
  tokens: PlannedToken[];
  morphemes: PlannedMorpheme[];
  droppedMorphemes: { id: string; tokenId: string }[];
} {
  const keptTokens = tokens
    .filter((token) => unitIds.has(token.unitId))
    .map((token) => ({
      id: token.id,
      unitId: token.unitId,
      tokenIndex: token.tokenIndex,
      form: token.form,
    }));
  const tokenIds = new Set(keptTokens.map((token) => token.id));
  const keptMorphemes: PlannedMorpheme[] = [];
  const droppedMorphemes: { id: string; tokenId: string }[] = [];
  for (const morpheme of morphemes) {
    if (!unitIds.has(morpheme.unitId)) continue;
    if (!tokenIds.has(morpheme.tokenId)) {
      droppedMorphemes.push({ id: morpheme.id, tokenId: morpheme.tokenId });
      continue;
    }
    keptMorphemes.push({
      id: morpheme.id,
      unitId: morpheme.unitId,
      tokenId: morpheme.tokenId,
      morphemeIndex: morpheme.morphemeIndex,
      form: morpheme.form,
    });
  }
  return { tokens: keptTokens, morphemes: keptMorphemes, droppedMorphemes };
}

function plannedUnit(unit: LegacyUnit, parentUnitId: string | undefined): PlannedUnit {
  return {
    id: unit.id,
    layerId: unit.layerId,
    ...(unit.mediaId !== undefined ? { mediaId: unit.mediaId } : {}),
    ...(parentUnitId !== undefined ? { parentUnitId } : {}),
  };
}

function plannedLayers(
  layers: readonly LegacyLayer[],
  documentId: string,
  documentUnits: readonly LegacyUnit[],
  groupUnits: readonly LegacyUnit[],
  includeEmpty: boolean,
): PlannedLayer[] {
  const usedByDocument = new Set(documentUnits.map((unit) => unit.layerId));
  const usedByGroup = new Set(groupUnits.map((unit) => unit.layerId));
  return layers
    .filter((layer) => {
      if (layer.documentId !== documentId) return false;
      if (usedByGroup.has(layer.id)) return true;
      return includeEmpty && !usedByDocument.has(layer.id);
    })
    .map((layer) => ({ id: layer.id, key: layer.key ?? layer.id }));
}

export function planLegacyMigration(
  library: LegacyLibrary,
  options: { confirmSplit?: boolean } = {},
): LegacyMigrationPlan {
  const documentOfLayer = new Map(library.layers.map((layer) => [layer.id, layer.documentId]));
  const placed = library.units.flatMap((unit) => {
    const manuscriptId = documentOfLayer.get(unit.layerId);
    return manuscriptId === undefined ? [] : [{ ...unit, manuscriptId }];
  });
  const crossed = crossManuscriptParentLinks(placed);
  if (crossed.length > 0)
    return { status: 'rejected', reason: 'cross-manuscript-parent', links: crossed };
  if ((library.speakers?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'speakers-without-project' };
  }

  const confirmSplit = options.confirmSplit === true;
  const pending: { documentId: string; audioIds: string[] }[] = [];
  const manuscripts: PlannedManuscript[] = [];
  const droppedLinks: DroppedLink[] = [];
  const droppedMorphemes: { id: string; tokenId: string }[] = [];
  const manuscriptNames = new Set<string>();

  for (const document of library.documents) {
    const units = placed.filter((unit) => unit.manuscriptId === document.id);
    const audioIds = unitAudioIds(units);
    if (audioIds.length > 1 && !confirmSplit) {
      pending.push({ documentId: document.id, audioIds });
      continue;
    }
    const groups =
      audioIds.length > 1
        ? audioIds.map((audioId) => ({
            id: `${document.id}--${audioId}`,
            audioId,
            units: units.filter((unit) => unit.mediaId === audioId),
          }))
        : [
            {
              id: document.id,
              audioId: audioIds[0] ?? null,
              units,
            },
          ];
    for (const group of groups) {
      const groupIds = new Set(group.units.map((unit) => unit.id));
      const segmentation = plannedSegmentation(
        library.tokens ?? [],
        library.morphemes ?? [],
        groupIds,
      );
      droppedMorphemes.push(...segmentation.droppedMorphemes);
      manuscripts.push({
        id: group.id,
        sourceDocumentId: document.id,
        fileName: uniqueName(manuscriptNames, `${document.name}.jyd`),
        audioId: group.audioId,
        layers: plannedLayers(
          library.layers,
          document.id,
          units,
          group.units,
          audioIds.length <= 1 || group === groups[0],
        ),
        tokens: segmentation.tokens,
        morphemes: segmentation.morphemes,
        units: group.units.map((unit) => {
          const parent = unit.parentUnitId;
          if (parent !== undefined && !groupIds.has(parent)) {
            droppedLinks.push({ unitId: unit.id, parentUnitId: parent });
            return plannedUnit(unit, undefined);
          }
          return plannedUnit(unit, parent);
        }),
      });
    }
  }

  if (pending.length > 0) return { status: 'needs-confirm', documents: pending };

  const audioNames = new Set<string>();
  const usedAudioIds = new Set(manuscripts.flatMap((manuscript) => manuscript.audioId ?? []));
  const audios = library.audios
    .filter((audio) => usedAudioIds.has(audio.id))
    .map((audio) => ({
      audioId: audio.id,
      fileName: uniqueName(audioNames, baseName(audio.filename)),
      sha256: sha256(audio.bytes),
      bytes: audio.bytes,
    }));

  const project = library.project ?? null;
  const speakers = (library.speakers ?? []).flatMap((speaker) =>
    project !== null && speaker.textId === project.id
      ? [{ id: speaker.id, textId: speaker.textId, name: speaker.name }]
      : [],
  );
  const droppedSpeakers = (library.speakers ?? [])
    .filter((speaker) => project === null || speaker.textId !== project.id)
    .map((speaker) => ({ id: speaker.id, textId: speaker.textId }));

  return {
    status: 'ready',
    audios,
    manuscripts,
    droppedLinks,
    droppedMorphemes,
    project,
    speakers,
    droppedSpeakers,
  };
}
