/**
 * 数据库集合适配器与桥接层 | Database collection adapters and bridge layer
 *
 * DexieCollectionAdapter: 通用 Dexie → CollectionAdapter 包装
 * TierBackedLayerCollectionAdapter: 层定义的 tier 桥接适配器
 * Bridge helpers: tier ↔ layer 双向转换工具
 */
import type { Table } from 'dexie';
import {
  guardNonIndexedScan,
  isDexieIndexedQueryFallbackError,
  reportDexieIndexedQueryFallback,
  reportUnexpectedDexieQueryError,
} from './adapterDexieQueryErrors';
import type {
  JieyuDoc,
  Selector,
  CollectionAdapter,
  LayerDocType,
  TierDefinitionDocType,
  TierType,
  LayerConstraint,
  TranscriptionLayerDocType,
} from './types';
import { layerTranscriptionTreeParentId } from './types';

function wrapDoc<T extends { id: string }>(value: T): JieyuDoc<T> {
  return {
    ...value,
    primary: value.id,
    toJSON: () => ({ ...value }),
  };
}

export class DexieCollectionAdapter<T extends { id: string }> {
  constructor(
    private readonly table: Table<T, string>,
    private readonly validate?: (doc: T) => void,
  ) {}

  find() {
    return {
      exec: async (): Promise<Array<JieyuDoc<T>>> => {
        const rows = await this.table.toArray();
        return rows.map((row) => wrapDoc(row));
      },
    };
  }

  /**
   * 选择器能用上的索引：主键、单字段索引，或字段全在选择器里的复合索引。
   * Usable index for the selector: primary key, a single-field index, or a fully covered compound one.
   */
  private pickIndex(
    selector: Record<string, unknown>,
  ): { index: string; value: string | number | Array<string | number> } | null {
    const isKey = (value: unknown): value is string | number =>
      typeof value === 'string' || typeof value === 'number';
    const primKey = this.table.schema.primKey;
    for (const [key, value] of Object.entries(selector)) {
      if (!isKey(value)) continue;
      if (key === 'id' || key === primKey.keyPath) return { index: ':id', value };
      const idx = this.table.schema.idxByName[key];
      if (idx !== undefined && idx.compound !== true) return { index: key, value };
    }
    for (const idx of this.table.schema.indexes) {
      const paths = Array.isArray(idx.keyPath) ? idx.keyPath : null;
      if (idx.compound !== true || paths === null) continue;
      const values = paths.map((path) => selector[path]);
      if (values.every(isKey)) return { index: idx.name, value: values };
    }
    return null;
  }

  /**
   * 先按索引收窄，再在内存里核对其余字段；空选择器是显式的“全部”；其余走 guardNonIndexedScan（P2-3）。
   * Narrow by an index, then check the remaining fields; an empty selector means "all" explicitly;
   * anything else goes through guardNonIndexedScan (P2-3).
   */
  private selectCollection(selector: Selector<T>, context: string) {
    const entries = Object.entries(selector) as Array<[keyof T, unknown]>;
    if (entries.length === 0) return this.table.toCollection();
    const matches = (row: T) => entries.every(([key, expected]) => row[key] === expected);
    const indexed = this.pickIndex(selector as Record<string, unknown>);
    if (!indexed) {
      guardNonIndexedScan(
        `${this.table.name}.${context}`,
        entries.map(([key]) => String(key)),
      );
      return this.table.filter(matches);
    }
    return this.table.where(indexed.index).equals(indexed.value).filter(matches);
  }

  findOne(args: { selector: Selector<T> }) {
    return {
      exec: async (): Promise<JieyuDoc<T> | null> => {
        const found = await this.selectCollection(args.selector, 'findOne').first();
        return found ? wrapDoc(found) : null;
      },
    };
  }

  async findByIndex(indexName: string, value: string | number): Promise<Array<JieyuDoc<T>>> {
    const rows = await this.table.where(indexName).equals(value).toArray();
    return rows.map((row) => wrapDoc(row));
  }

  async findByIndexAnyOf(
    indexName: string,
    values: readonly (string | number)[],
  ): Promise<Array<JieyuDoc<T>>> {
    const rows = await this.table
      .where(indexName)
      .anyOf([...values])
      .toArray();
    return rows.map((row) => wrapDoc(row));
  }

  async insert(doc: T): Promise<JieyuDoc<T>> {
    if (this.validate) {
      this.validate(doc);
    }
    await this.table.put(doc);
    return wrapDoc(doc);
  }

  async remove(id: string): Promise<void> {
    await this.table.delete(id);
  }

  async bulkInsert(docs: T[]): Promise<void> {
    if (this.validate) {
      for (const doc of docs) this.validate(doc);
    }
    await this.table.bulkPut(docs);
  }

  async removeBySelector(selector: Selector<T>): Promise<number> {
    const keys = (await this.selectCollection(
      selector,
      'removeBySelector',
    ).primaryKeys()) as string[];
    if (keys.length === 0) return 0;
    await this.table.bulkDelete(keys);
    return keys.length;
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    await this.table
      .where(':id')
      .equals(id)
      .modify((row) => {
        Object.assign(row, changes);
      });
  }
}

export const BRIDGE_TIER_PREFIX = 'bridge_';
const TREE_PARENT_LAYER_INDEX = 'parentLayerId';

export function resolveBridgeId(
  value: { bridgeId?: unknown } | null | undefined,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value.bridgeId === 'string' && value.bridgeId.trim().length > 0)
    return value.bridgeId.trim();
  return undefined;
}

function isBridgeLayerTier(tier: TierDefinitionDocType): boolean {
  return (
    tier.key.startsWith(BRIDGE_TIER_PREFIX) &&
    (tier.contentType === 'transcription' || tier.contentType === 'translation')
  );
}

/** tier.tierType → LayerConstraint 映射 | Map TierType to LayerConstraint */
function tierTypeToConstraint(tierType: TierType): LayerConstraint | undefined {
  switch (tierType) {
    case 'symbolic-association':
      return 'symbolic_association';
    case 'time-subdivision':
      return 'time_subdivision';
    case 'time-aligned':
      return 'independent_boundary';
    default:
      return undefined;
  }
}

/** LayerConstraint → TierType 映射 | Map LayerConstraint to TierType */
function constraintToTierType(constraint: LayerConstraint | undefined): TierType {
  switch (constraint) {
    case 'independent_boundary':
      return 'time-aligned';
    case 'time_subdivision':
      return 'time-subdivision';
    case 'symbolic_association':
      return 'symbolic-association';
    default:
      return 'time-aligned';
  }
}

function bridgeTierToLayer(tier: TierDefinitionDocType): LayerDocType | null {
  if (!isBridgeLayerTier(tier)) return null;
  const constraint = tierTypeToConstraint(tier.tierType);
  const bridgeId = resolveBridgeId(tier);
  return {
    id: tier.id,
    textId: tier.textId,
    key: tier.key.slice(BRIDGE_TIER_PREFIX.length),
    name: tier.name,
    layerType: tier.contentType as 'transcription' | 'translation',
    languageId: tier.languageId ?? '',
    ...(tier.orthographyId !== undefined && { orthographyId: tier.orthographyId }),
    ...(bridgeId !== undefined && { bridgeId }),
    modality: tier.modality ?? 'text',
    ...(tier.acceptsAudio !== undefined && { acceptsAudio: tier.acceptsAudio }),
    ...(tier.isDefault !== undefined && { isDefault: tier.isDefault }),
    ...(tier.sortOrder !== undefined && { sortOrder: tier.sortOrder }),
    ...(constraint !== undefined && { constraint }),
    ...(tier.parentTierId !== undefined && tier.contentType === 'transcription'
      ? { parentLayerId: tier.parentTierId }
      : {}),
    ...(tier.accessRights !== undefined && { accessRights: tier.accessRights }),
    ...(tier.documentId !== undefined && { documentId: tier.documentId }),
    ...(tier.dialect !== undefined && { dialect: tier.dialect }),
    ...(tier.vernacular !== undefined && { vernacular: tier.vernacular }),
    ...(tier.displaySettings !== undefined && { displaySettings: { ...tier.displaySettings } }),
    createdAt: tier.createdAt,
    updatedAt: tier.updatedAt,
  };
}

function layerToBridgeTier(layer: LayerDocType): TierDefinitionDocType {
  const bridgeId = resolveBridgeId(layer);
  const treeParent = layerTranscriptionTreeParentId(layer);
  const tier: TierDefinitionDocType = {
    id: layer.id,
    textId: layer.textId,
    key: `${BRIDGE_TIER_PREFIX}${layer.key}`,
    name: layer.name,
    tierType: constraintToTierType(layer.constraint),
    languageId: layer.languageId,
    ...(layer.orthographyId !== undefined && { orthographyId: layer.orthographyId }),
    ...(bridgeId !== undefined && { bridgeId }),
    contentType: layer.layerType,
    modality: layer.modality,
    ...(layer.acceptsAudio !== undefined && { acceptsAudio: layer.acceptsAudio }),
    ...(layer.isDefault !== undefined && { isDefault: layer.isDefault }),
    ...(layer.accessRights !== undefined && { accessRights: layer.accessRights }),
    ...(layer.sortOrder !== undefined && { sortOrder: layer.sortOrder }),
    ...(layer.documentId !== undefined && { documentId: layer.documentId }),
    ...(layer.dialect !== undefined && { dialect: layer.dialect }),
    ...(layer.vernacular !== undefined && { vernacular: layer.vernacular }),
    ...(layer.displaySettings !== undefined && { displaySettings: { ...layer.displaySettings } }),
    createdAt: layer.createdAt,
    updatedAt: layer.updatedAt,
  };
  if (treeParent !== undefined && treeParent.trim() !== '') {
    tier.parentTierId = treeParent;
  }
  return tier;
}

export class TierBackedLayerCollectionAdapter implements CollectionAdapter<LayerDocType> {
  constructor(
    private readonly tierTable: Table<TierDefinitionDocType, string>,
    private readonly validate?: (doc: LayerDocType) => void,
  ) {}

  private async loadLayers(): Promise<LayerDocType[]> {
    const tiers = await this.tierTable.toArray();
    return tiers
      .map((tier) => bridgeTierToLayer(tier))
      .filter((layer): layer is LayerDocType => Boolean(layer));
  }

  find() {
    return {
      exec: async (): Promise<Array<JieyuDoc<LayerDocType>>> => {
        const rows = await this.loadLayers();
        return rows.map((row) => wrapDoc(row));
      },
    };
  }

  /**
   * P2-3：按 id 或 textId 走索引取候选层，再核对其余字段；都没有就整表（开发和测试里抛错）。
   * P2-3: candidates via the id or textId index, then match the rest; otherwise a guarded full scan.
   */
  private async selectLayers(
    selector: Selector<LayerDocType>,
    context: string,
  ): Promise<LayerDocType[]> {
    const entries = Object.entries(selector) as Array<[keyof LayerDocType, unknown]>;
    const id = selector.id;
    const textId = selector.textId;
    let candidates: LayerDocType[];
    if (typeof id === 'string') {
      const tier = await this.tierTable.get(id);
      const layer = tier ? bridgeTierToLayer(tier) : null;
      candidates = layer ? [layer] : [];
    } else if (typeof textId === 'string') {
      candidates = (await this.findByIndex('textId', textId)).map((doc) => doc.toJSON());
    } else if (entries.length === 0) {
      // 空选择器是显式的“全部” | An empty selector means "all" explicitly
      candidates = await this.loadLayers();
    } else {
      guardNonIndexedScan(
        `layers.${context}`,
        entries.map(([key]) => String(key)),
      );
      candidates = await this.loadLayers();
    }
    return candidates.filter((row) => entries.every(([key, expected]) => row[key] === expected));
  }

  findOne(args: { selector: Selector<LayerDocType> }) {
    return {
      exec: async (): Promise<JieyuDoc<LayerDocType> | null> => {
        const [found] = await this.selectLayers(args.selector, 'findOne');
        return found ? wrapDoc(found) : null;
      },
    };
  }

  async findByIndex(
    indexName: string,
    value: string | number,
  ): Promise<Array<JieyuDoc<LayerDocType>>> {
    const mapRows = (raw: TierDefinitionDocType[]) =>
      raw
        .map((row) => bridgeTierToLayer(row))
        .filter((row): row is LayerDocType => Boolean(row))
        .map((row) => wrapDoc(row));

    if (
      indexName === 'textId' ||
      indexName === 'key' ||
      indexName === TREE_PARENT_LAYER_INDEX ||
      indexName === 'layerType'
    ) {
      try {
        if (indexName === 'textId') {
          return mapRows(await this.tierTable.where('textId').equals(String(value)).toArray());
        }
        if (indexName === 'key') {
          return mapRows(
            await this.tierTable
              .where('key')
              .equals(`${BRIDGE_TIER_PREFIX}${String(value)}`)
              .toArray(),
          );
        }
        if (indexName === TREE_PARENT_LAYER_INDEX) {
          return mapRows(
            await this.tierTable.where('parentTierId').equals(String(value)).toArray(),
          );
        }
        return mapRows(await this.tierTable.where('contentType').equals(String(value)).toArray());
      } catch (err) {
        if (isDexieIndexedQueryFallbackError(err)) {
          reportDexieIndexedQueryFallback('TierBackedLayerCollectionAdapter:findByIndex', err);
        } else {
          // P2-3：意外错误（如事务已中止）直接抛出，不再退化成扫表 | Unexpected errors propagate
          reportUnexpectedDexieQueryError('TierBackedLayerCollectionAdapter:findByIndex', err);
          throw err;
        }
      }
    }

    guardNonIndexedScan('layers.findByIndex', [indexName]);
    const rows = await this.loadLayers();
    return rows
      .filter((row) => (row as unknown as Record<string, unknown>)[indexName] === value)
      .map((row) => wrapDoc(row));
  }

  async findByIndexAnyOf(
    indexName: string,
    values: readonly (string | number)[],
  ): Promise<Array<JieyuDoc<LayerDocType>>> {
    const collected: LayerDocType[] = [];
    for (const value of values) {
      const docs = await this.findByIndex(indexName, value);
      collected.push(...docs.map((doc) => doc.toJSON()));
    }
    const dedup = new Map(collected.map((item) => [item.id, item]));
    return [...dedup.values()].map((row) => wrapDoc(row));
  }

  async insert(doc: LayerDocType): Promise<JieyuDoc<LayerDocType>> {
    if (this.validate) this.validate(doc);
    await this.tierTable.put(layerToBridgeTier(doc));
    return wrapDoc(doc);
  }

  async remove(id: string): Promise<void> {
    await this.tierTable.delete(id);
  }

  async bulkInsert(docs: LayerDocType[]): Promise<void> {
    if (this.validate) {
      for (const doc of docs) this.validate(doc);
    }
    await this.tierTable.bulkPut(docs.map((doc) => layerToBridgeTier(doc)));
  }

  async removeBySelector(selector: Selector<LayerDocType>): Promise<number> {
    const ids = (await this.selectLayers(selector, 'removeBySelector')).map((row) => row.id);
    if (ids.length === 0) return 0;
    await this.tierTable.bulkDelete(ids);
    return ids.length;
  }

  async update(id: string, changes: Partial<LayerDocType>): Promise<void> {
    const existingTier = await this.tierTable.get(id);
    if (!existingTier) return;
    const nextBridgeId = resolveBridgeId(changes) ?? resolveBridgeId(existingTier);
    // Apply only the fields that exist in TierDefinitionDocType
    const updatedTier: TierDefinitionDocType = {
      ...existingTier,
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.languageId !== undefined ? { languageId: changes.languageId } : {}),
      ...(changes.orthographyId !== undefined ? { orthographyId: changes.orthographyId } : {}),
      ...(nextBridgeId !== undefined ? { bridgeId: nextBridgeId } : {}),
      ...(changes.modality !== undefined ? { modality: changes.modality } : {}),
      ...(changes.acceptsAudio !== undefined ? { acceptsAudio: changes.acceptsAudio } : {}),
      ...(changes.isDefault !== undefined ? { isDefault: changes.isDefault } : {}),
      ...(changes.sortOrder !== undefined ? { sortOrder: changes.sortOrder } : {}),
      ...(changes.accessRights !== undefined ? { accessRights: changes.accessRights } : {}),
      ...(changes.constraint !== undefined
        ? { tierType: constraintToTierType(changes.constraint) }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    if (
      existingTier.contentType === 'transcription' &&
      'parentLayerId' in (changes as Partial<TranscriptionLayerDocType>)
    ) {
      const pid = (changes as Partial<TranscriptionLayerDocType>).parentLayerId;
      if (pid === undefined) {
        delete updatedTier.parentTierId;
      } else {
        updatedTier.parentTierId = pid;
      }
    }
    await this.tierTable.put(updatedTier);
  }
}
