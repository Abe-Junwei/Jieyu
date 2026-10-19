/**
 * 查询给定单元 / 图层里哪些属于另一个项目（2B-G / JY-03）。
 * Find which of the given units / layers belong to another project (2B-G / JY-03).
 */
import { storagePort } from '../db/storagePort';
import type { ForeignOwnedRow } from '../db/storagePortProjectReads';

export type { ForeignOwnedRow };

/** 已存在、且 `textId` 不是 `textId` 的单元 | Existing units whose `textId` differs */
export function listForeignOwnedUnits(
  unitIds: Iterable<string>,
  textId: string,
): Promise<ForeignOwnedRow[]> {
  return storagePort().listForeignOwnedUnits(unitIds, textId);
}

/** 已存在、且 `textId` 不是 `textId` 的图层 | Existing layers whose `textId` differs */
export function listForeignOwnedLayers(
  layerIds: Iterable<string>,
  textId: string,
): Promise<ForeignOwnedRow[]> {
  return storagePort().listForeignOwnedLayers(layerIds, textId);
}

/** 已存在、且 `textId` 不是 `textId` 的媒体（GAP-2）| Existing media whose `textId` differs (GAP-2) */
export function listForeignOwnedMedia(
  mediaIds: Iterable<string>,
  textId: string,
): Promise<ForeignOwnedRow[]> {
  return storagePort().listForeignOwnedMedia(mediaIds, textId);
}
