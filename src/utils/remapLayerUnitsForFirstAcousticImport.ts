import type { AnchorDocType, JieyuDatabase, LayerUnitDocType } from '../db';
import { bulkUpsertLayerUnits } from '../services/LayerUnitSegmentWritePrimitives';

const EPS = 1e-6;
const MIN_SPAN_SEC = 0.05;

export type FirstAcousticImportRemapResult = {
  didRemap: boolean;
  /** Max `endTime` among `layer_units` on `mediaId` after any updates (for metadata). */
  maxUnitEnd: number;
};

function roundTimeSec(t: number): number {
  return Number(t.toFixed(3));
}

/**
 * 占位首次绑定真实声学且「逻辑跨度 L」大于文件时长时：对同一 `mediaId` 下
 * `layer_units` 与 `anchors` 的绝对秒做 scale + 平移，使内容落入 `[0, duration]`（右端钳制）。
 */
export async function remapLayerUnitsAndAnchorsForFirstAcousticImport(input: {
  db: JieyuDatabase;
  textId: string;
  mediaId: string;
  acousticDurationSec: number;
  now: string;
}): Promise<FirstAcousticImportRemapResult> {
  const { db, textId, mediaId, acousticDurationSec, now } = input;
  const duration = acousticDurationSec;
  if (!(duration > EPS)) {
    const units = await db.dexie.layer_units.where('mediaId').equals(mediaId).toArray();
    const maxEnd = units.reduce((m, u) => Math.max(m, typeof u.endTime === 'number' && Number.isFinite(u.endTime) ? u.endTime : 0), 0);
    return { didRemap: false, maxUnitEnd: maxEnd };
  }

  const textRow = await db.dexie.texts.get(textId);
  const rowMeta = (textRow?.metadata as Record<string, unknown> | undefined) ?? {};
  const logicalSec = typeof rowMeta.logicalDurationSec === 'number' && Number.isFinite(rowMeta.logicalDurationSec)
    ? rowMeta.logicalDurationSec
    : 0;

  const units = await db.dexie.layer_units.where('mediaId').equals(mediaId).toArray();
  let maxEnd = 0;
  for (const u of units) {
    const e = typeof u.endTime === 'number' && Number.isFinite(u.endTime) ? u.endTime : 0;
    maxEnd = Math.max(maxEnd, e);
  }
  const L = Math.max(maxEnd, logicalSec);
  if (!(L > duration + EPS)) {
    return { didRemap: false, maxUnitEnd: maxEnd };
  }

  const scale = duration / L;
  const mappedStarts = units.map((u) => {
    const st = typeof u.startTime === 'number' && Number.isFinite(u.startTime) ? u.startTime : 0;
    return st * scale;
  });
  const minMappedStart = mappedStarts.length > 0 ? Math.min(...mappedStarts) : 0;
  const shift = -minMappedStart;

  const updatedUnits: LayerUnitDocType[] = units.map((u) => {
    const st = typeof u.startTime === 'number' && Number.isFinite(u.startTime) ? u.startTime : 0;
    const en = typeof u.endTime === 'number' && Number.isFinite(u.endTime) ? u.endTime : 0;
    let ns = roundTimeSec(st * scale + shift);
    let ne = roundTimeSec(en * scale + shift);
    if (ne > duration) {
      ne = roundTimeSec(duration);
    }
    if (ns > ne) {
      ns = roundTimeSec(Math.max(0, ne - MIN_SPAN_SEC));
    }
    if (ne - ns < MIN_SPAN_SEC && ne <= duration) {
      ns = roundTimeSec(Math.max(0, ne - MIN_SPAN_SEC));
    }
    return {
      ...u,
      startTime: ns,
      endTime: ne,
      updatedAt: now,
    };
  });

  if (updatedUnits.length > 0) {
    await bulkUpsertLayerUnits(db, updatedUnits);
  }

  const anchors = await db.dexie.anchors.where('mediaId').equals(mediaId).toArray();
  if (anchors.length > 0) {
    const updatedAnchors: AnchorDocType[] = anchors.map((a) => {
      const t = typeof a.time === 'number' && Number.isFinite(a.time) ? a.time : 0;
      let nt = roundTimeSec(t * scale + shift);
      if (nt < 0) nt = 0;
      if (nt > duration) nt = roundTimeSec(duration);
      return { ...a, time: nt };
    });
    await db.dexie.anchors.bulkPut(updatedAnchors);
  }

  let maxAfter = 0;
  for (const u of updatedUnits) {
    const e = typeof u.endTime === 'number' && Number.isFinite(u.endTime) ? u.endTime : 0;
    maxAfter = Math.max(maxAfter, e);
  }

  return { didRemap: true, maxUnitEnd: maxAfter };
}
