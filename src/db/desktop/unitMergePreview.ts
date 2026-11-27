import { createHash } from 'node:crypto';
import { audiosOfText } from './unitTextAudios';
import {
  betweenIds,
  childrenOf,
  clipsOf,
  draftsOf,
  fieldMap,
  noteCountOf,
  orderedSources,
  textsOf,
  type MergeClip,
  type MergePreview,
  type MergeTextPreview,
  type Side,
  type SqliteDatabase,
} from './unitMergeShared';

export type { MergeClip, MergePreview, MergeTextPreview };

export function mergePreview(
  db: SqliteDatabase,
  input: { keepId: string; removeId: string; unitIds?: string[]; discardAudioIds?: string[] },
): MergePreview {
  const sources = orderedSources(db, input);
  const earlier = sources[0]!;
  const later = sources[sources.length - 1]!;

  return {
    unitIds: sources.map((side) => side.unit.id),
    keepId: earlier.unit.id,
    removeId: later.unit.id,
    gapMs: sources
      .slice(1)
      .reduce((gap, side, i) => gap + side.unit.start_ms! - sources[i]!.unit.end_ms!, 0),
    noteCount: sources.reduce((n, side) => n + noteCountOf(db, side.unit.id, side.unit.id), 0),
    separator: ' ',
    baseline: mergeBaseline(db, input),
    texts: previewTexts(db, sources),
    earlier: clipsOf(db, earlier.unit.id),
    later: sources.slice(1).flatMap((side) => clipsOf(db, side.unit.id)),
  };
}

function previewTexts(db: SqliteDatabase, sources: Side[]): MergeTextPreview[] {
  const drafts = sources.flatMap((side) => draftsOf(db, side.unit.id, side.unit.id));
  const layerIds = new Set(
    [...sources.flatMap((side) => side.texts), ...drafts].map((row) => row.layer_id),
  );
  const join = (values: string[]) => values.filter((value) => value !== '').join(' ');
  return [...layerIds].map((layerId) => {
    const official = sources.map(
      (side) => side.texts.find((row) => row.layer_id === layerId)?.body ?? '',
    );
    const pending = sources.map(
      (side, i) =>
        drafts.find((row) => row.unit_id === side.unit.id && row.layer_id === layerId)?.raw_input ??
        official[i]!,
    );
    const name = db.prepare('SELECT name_json FROM layers WHERE id = ?').get(layerId) as {
      name_json: string;
    };
    return {
      layerId,
      name: JSON.parse(name.name_json),
      official: join(official),
      draft: drafts.some((row) => row.layer_id === layerId) ? join(pending) : null,
      result: join(pending),
    };
  });
}

export function mergeBaseline(
  db: SqliteDatabase,
  input: { keepId: string; removeId: string; unitIds?: string[]; discardAudioIds?: string[] },
): string {
  const sources = orderedSources(db, input);
  const children = sources.flatMap((side) => childrenOf(db, side.unit.id, side.unit.id));
  const payload = {
    ids: sources.map((side) => side.unit.id),
    units: sources
      .map((side) => side.unit)
      .map((unit) => ({
        speaker: unit.speaker_id,
        start: unit.start_ms,
        end: unit.end_ms,
        parent: unit.parent_unit_id,
        fingerprint: unit.graph_fingerprint,
      })),
    between: sources.slice(1).flatMap((side, i) => betweenIds(db, sources[i]!, side)),
    children: children.map((child) => ({
      id: child.id,
      parent: child.parent_unit_id,
      start: child.start_ms,
      end: child.end_ms,
      texts: textsOf(db, child.id),
    })),
    texts: sources.map((side) =>
      side.texts.map((row) => ({
        id: row.id,
        layer: row.layer_id,
        body: row.body,
        selfCertainty: row.self_certainty,
        provenance: row.provenance_json,
      })),
    ),
    drafts: sources.flatMap((side) => draftsOf(db, side.unit.id, side.unit.id)),
    fields: sources.map((side) => fieldMap(db, side.unit.id)),
    clips: sources.map((side) =>
      side.texts.map((row) => audiosOfText(db, row.id).map((clip) => clip.id)),
    ),
    discard: [...(input.discardAudioIds ?? [])].sort(),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
