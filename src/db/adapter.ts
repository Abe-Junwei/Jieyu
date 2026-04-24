/**
 * 数据库集合适配器与桥接层 | Database collection adapters and bridge layer
 *
 * DexieCollectionAdapter: 通用 Dexie → CollectionAdapter 包装
 * TierBackedLayerCollectionAdapter: 层定义的 tier 桥接适配器
 * Bridge helpers: tier ↔ layer 双向转换工具
 */
import type { Table } from 'dexie';
import { isDexieIndexedQueryFallbackError, reportUnexpectedDexieQueryError } from './adapterDexieQueryErrors';
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

export function wrapDoc<T extends { id: string }>(value: T): JieyuDoc<T> {
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

  findOne(args: { selector: Selector<T> }) {
    return {
      exec: async (): Promise<JieyuDoc<T> | null> => {
        const entries = Object.entries(args.selector) as Array<[keyof T, unknown]>;
        if (entries.length === 1) {
          const [key, expected] = entries[0]!;
          try {
            const indexed = await this.table.where(String(key)).equals(expected as string | number).first();
            return indexed ? wrapDoc(indexed) : null;
          } catch (err) {
            if (!isDexieIndexedQueryFallbackError(err)) {
              reportUnexpectedDexieQueryError('findOne:where', err);
            }
            // Fall through to generic filter path for non-indexed fields.
          }
        }
        const found = await this.table
          .filter((row) => entries.every(([key, expected]) => row[key] === expected))
          .first();
        return found ? wrapDoc(found) : null;
      },
    };
  }

  async findByIndex(indexName: string, value: string | number): Promise<Array<JieyuDoc<T>>> {
    const rows = await this.table.where(indexName).equals(value).toArray();
    return rows.map((row) => wrapDoc(row));
  }

  async findByIndexAnyOf(indexName: string, values: readonly (string | number)[]): Promise<Array<JieyuDoc<T>>> {
    const rows = await this.table.where(indexName).anyOf([...values]).toArray();
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
    const entries = Object.entries(selector) as Array<[keyof T, unknown]>;
    let keys: string[] = [];

    // 优先使用任一可索引字段先收窄候选，再做内存二次过滤 | Narrow candidates via indexed field first, then in-memory refine.
    const firstIndexedEntry = entries.find(([rawKey, rawExpected]) => {
      const key = String(rawKey);
      const expected = rawExpected;
      const isPrimitive = typeof expected === 'string' || typeof expected === 'number' || typeof expected === 'boolean';
      const hasIndex = key === 'id' || key in this.table.schema.idxByName;
      return isPrimitive && hasIndex;
    });

    if (firstIndexedEntry) {
      const [rawKey, rawExpected] = firstIndexedEntry;
      const key = String(rawKey);
      const expected = rawExpected as string | number;
      try {
        const indexedKeys = (await this.table.where(key).equals(expected).primaryKeys()) as string[];
        if (entries.length === 1) {
          keys = indexedKeys;
        } else if (indexedKeys.length > 0) {
          const indexedRows = await this.table.bulkGet(indexedKeys);
          keys = indexedRows
            .filter((row): row is T => Boolean(row))
            .filter((row) => entries.every(([entryKey, entryExpected]) => row[entryKey] === entryExpected))
            .map((row) => row.id);
        }
      } catch (err) {
        if (!isDexieIndexedQueryFallbackError(err)) {
          reportUnexpectedDexieQueryError('removeBySelector:indexed', err);
        }
        // 非索引或不支持 equals 的字段，回退 filter 扫描 | Fall back to filter scan for unsupported selectors.
      }
    }

    if (keys.length === 0) {
      keys = (await this.table
        .filter((row) => entries.every(([key, expected]) => row[key] === expected))
        .primaryKeys()) as string[];
    }

    if (keys.length === 0) {
      return 0;
    }

    await this.table.bulkDelete(keys);
    return keys.length;
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    await this.table.where(':id').equals(id).modify((row) => {
      Object.assign(row, changes);
    });
  }
}

export const BRIDGE_TIER_PREFIX = 'bridge_';
const TREE_PARENT_LAYER_INDEX = 'parentLayerId';

export function resolveBridgeId(value: { bridgeId?: unknown } | null | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value.bridgeId === 'string' && value.bridgeId.trim()) return value.bridgeId.trim();
  return undefined;
}

export function isBridgeLayerTier(tier: TierDefinitionDocType): boolean {
  return tier.key.startsWith(BRIDGE_TIER_PREFIX)
    && (tier.contentType === 'transcription' || tier.contentType === 'translation');
}

/** tier.tierType → LayerConstraint 映射 | Map TierType to LayerConstraint */
export function tierTypeToConstraint(tierType: TierType): LayerConstraint | undefined {
  switch (tierType) {
    case 'symbolic-association': return 'symbolic_association';
    case 'time-subdivision': return 'time_subdivision';
    case 'time-aligned': return 'independent_boundary';
    default: return undefined;
  }
}

/** LayerConstraint → TierType 映射 | Map LayerConstraint to TierType */
export function constraintToTierType(constraint: LayerConstraint | undefined): TierType {
  switch (constraint) {
    case 'independent_boundary': return 'time-aligned';
    case 'time_subdivision': return 'time-subdivision';
    case 'symbolic_association': return 'symbolic-association';
    default: return 'time-aligned';
  }
}

export function bridgeTierToLayer(tier: TierDefinitionDocType): LayerDocType | null {
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
    ...(tier.parentTierId !== undefined && tier.contentType === 'transcription' ? { parentLayerId: tier.parentTierId } : {}),
    ...(tier.accessRights !== undefined && { accessRights: tier.accessRights }),
    createdAt: tier.createdAt,
    updatedAt: tier.updatedAt,
  };
}

export function layerToBridgeTier(layer: LayerDocType): TierDefinitionDocType {
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

  findOne(args: { selector: Selector<LayerDocType> }) {
    return {
      exec: async (): Promise<JieyuDoc<LayerDocType> | null> => {
        const rows = await this.loadLayers();
        const entries = Object.entries(args.selector) as Array<[keyof LayerDocType, unknown]>;
        const found = rows.find((row) => entries.every(([key, expected]) => row[key] === expected));
        return found ? wrapDoc(found) : null;
      },
    };
  }

  async findByIndex(indexName: string, value: string | number): Promise<Array<JieyuDoc<LayerDocType>>> {
    const mapRows = (raw: TierDefinitionDocType[]) =>
      raw
        .map((row) => bridgeTierToLayer(row))
        .filter((row): row is LayerDocType => Boolean(row))
        .map((row) => wrapDoc(row));

    if (indexName === 'textId' || indexName === 'key' || indexName === TREE_PARENT_LAYER_INDEX || indexName === 'layerType') {
      try {
        if (indexName === 'textId') {
          return mapRows(await this.tierTable.where('textId').equals(String(value)).toArray());
        }
        if (indexName === 'key') {
          return mapRows(await this.tierTable.where('key').equals(`${BRIDGE_TIER_PREFIX}${String(value)}`).toArray());
        }
        if (indexName === TREE_PARENT_LAYER_INDEX) {
          return mapRows(await this.tierTable.where('parentTierId').equals(String(value)).toArray());
        }
        return mapRows(await this.tierTable.where('contentType').equals(String(value)).toArray());
      } catch (err) {
        if (!isDexieIndexedQueryFallbackError(err)) {
          reportUnexpectedDexieQueryError('TierBackedLayerCollectionAdapter:findByIndex', err);
        }
      }
    }

    const rows = await this.loadLayers();
    return rows
      .filter((row) => (row as unknown as Record<string, unknown>)[indexName] === value)
      .map((row) => wrapDoc(row));
  }

  async findByIndexAnyOf(indexName: string, values: readonly (string | number)[]): Promise<Array<JieyuDoc<LayerDocType>>> {
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
    const rows = await this.loadLayers();
    const entries = Object.entries(selector) as Array<[keyof LayerDocType, unknown]>;
    const ids = rows
      .filter((row) => entries.every(([key, expected]) => row[key] === expected))
      .map((row) => row.id);
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
      ...(changes.constraint !== undefined ? { tierType: constraintToTierType(changes.constraint) } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (existingTier.contentType === 'transcription' && 'parentLayerId' in (changes as Partial<TranscriptionLayerDocType>)) {
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

