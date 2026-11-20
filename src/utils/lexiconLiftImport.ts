/**
 * LIFT 0.13 → DMLex JSON projection. Unmapped FLEx fields become diagnostics.
 */
import { listForeignLexemeIds, runLiftLexemeTransaction } from '../db/storagePortImportLexicon';
import { LinguisticService } from '../services/LinguisticService';
import { DMLEX_HOMOGRAPH, DMLEX_SUBSENSE } from '../db/dmlexTypes';
import type { LexemeDocType, LexemeEntryDoc, LexemeResourceDoc } from '../db/types';
import type { DmlexRelation } from '../db/dmlexTypes';
import { isLexemeEntry } from '../db/lexemeNestedIds';
import { dispatchWorkspaceLexemeUpdated } from './workspaceEvents';
import type { InterchangeLoss } from './interchangeLossReport';
import {
  parseLiftXml,
  type LexiconLiftDiagnostic,
  type LexiconLiftDiagnosticCode,
  type LexiconLiftImportReason,
  type LexiconLiftParseResult,
} from './lexiconLiftParse';

export {
  parseLiftXml,
  type LexiconLiftDiagnostic,
  type LexiconLiftDiagnosticCode,
  type LexiconLiftImportReason,
  type LexiconLiftParseResult,
};

export type LexiconLiftImportResult =
  | {
      ok: true;
      savedCount: number;
      readback: LexemeEntryDoc[];
      diagnostics: LexiconLiftDiagnostic[];
      losses: InterchangeLoss[];
    }
  | { ok: false; reason: LexiconLiftImportReason };

export type LexiconLiftImportDeps = {
  save: (doc: LexemeDocType) => Promise<string>;
  list: () => Promise<LexemeEntryDoc[]>;
  loadResource: () => Promise<LexemeResourceDoc | null>;
  saveResource: (doc: LexemeResourceDoc) => Promise<string>;
  /** 给定 id 中已被其它项目占用的那些 | Ids among these already owned by another project */
  listForeignIds?: (ids: string[]) => Promise<Set<string>>;
  /** 整次导入在一个读写事务里完成 | Run the whole import in one read-write transaction */
  runAtomic?: <T>(work: () => Promise<T>) => Promise<T>;
  /**
   * 导入提交之后广播保存过的 id；save / saveResource 本身不广播（GAP-3）。
   * Announce the saved ids once the import committed; save / saveResource stay silent (GAP-3).
   */
  announce?: (ids: readonly string[]) => void;
};

/** 默认依赖：所有读写都显式带上项目 | Default deps: every read/write names the project */
export function defaultLiftImportDeps(textId: string): LexiconLiftImportDeps {
  return {
    save: (doc) => LinguisticService.lexemes.save(doc, { announce: false }),
    list: () => LinguisticService.lexemes.list(textId),
    loadResource: () => LinguisticService.lexemes.getResource(textId),
    saveResource: (doc) => LinguisticService.lexemes.save(doc, { announce: false }),
    announce: (ids) => {
      for (const lexemeId of ids) dispatchWorkspaceLexemeUpdated({ lexemeId });
    },
    listForeignIds: (ids) => listForeignLexemeIds(textId, ids),
    runAtomic: (work) => runLiftLexemeTransaction(work),
  };
}

/**
 * 128 位确定性哈希（四路 FNV-1a，按 UTF-16 码元），只用于生成稳定 id，不用于安全场景。
 * **D14 冻结（ADR-0045 / P3）：算法不得更换**；已写入用户数据的副本 id 依赖本实现。
 * 128-bit deterministic hash (four FNV-1a lanes over UTF-16 code units); for stable ids only,
 * not for security. **Frozen at D14 (ADR-0045 / P3): do not replace**; copy ids in user data
 * depend on this exact implementation.
 */
function stableHash128(input: string): string {
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  return seeds
    .map((seed, lane) => {
      let hash = (seed ^ Math.imul(lane + 1, 0x27d4eb2d)) >>> 0;
      for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
        hash = (hash ^ (hash >>> (13 + lane))) >>> 0;
      }
      return hash.toString(16).padStart(8, '0');
    })
    .join('');
}

/**
 * 外来词条在目标项目里的副本 id：由（目标项目, 类型, 文件里的 id）确定，同一文件重复导入同一项目
 * 得到同一批 id，于是按 id 覆盖而不是翻倍（GAP-4）。
 * Copy id of a foreign entry in the target project: derived from (target project, kind, file id),
 * so importing the same file into the same project again yields the same ids and replaces by id
 * instead of doubling (GAP-4).
 */
export function liftCopyId(kind: 'lex' | 'sense', textId: string, sourceId: string): string {
  return `${kind}_${stableHash128(`${textId}\u0000${kind}\u0000${sourceId}`)}`;
}

/**
 * 跨项目导入（JY-07）：文件里的词条 id 已被本机另一个项目占用时，换成确定性的副本 id（GAP-4），
 * 义项 id 一并换，DMLex 关系里的引用按同一张映射表改写。目标项目里已有该副本时（例如源项目后来
 * 删了这条）也继续用副本 id。目标项目自己的同 id 词条仍按 id 覆盖。
 * Cross-project import (JY-07): entry ids already owned by another local project get deterministic
 * copy ids (GAP-4), their sense ids too, and DMLex relation refs are rewritten through the same map.
 * An entry whose copy already exists in the target (e.g. the source project later dropped it)
 * keeps using the copy id. Same-id entries of the target project are still replaced by id.
 */
function regenerateForeignIds(
  parsed: Extract<LexiconLiftParseResult, { ok: true }>,
  textId: string,
  foreignIds: ReadonlySet<string>,
  existingIds: ReadonlySet<string>,
): { lexemes: LexemeEntryDoc[]; resource: LexemeResourceDoc; regenerated: number } {
  const idMap = new Map<string, string>();
  let regenerated = 0;
  for (const lexeme of parsed.lexemes) {
    const copyId = liftCopyId('lex', textId, lexeme.id);
    if (!foreignIds.has(lexeme.id) && !existingIds.has(copyId)) continue;
    regenerated += 1;
    idMap.set(lexeme.id, copyId);
    for (const sense of lexeme.entry.senses ?? []) {
      if (typeof sense.id === 'string' && sense.id.length > 0) {
        idMap.set(sense.id, liftCopyId('sense', textId, sense.id));
      }
    }
  }
  if (idMap.size === 0) {
    return { lexemes: parsed.lexemes, resource: parsed.resource, regenerated: 0 };
  }
  const mapId = (id: string): string => idMap.get(id) ?? id;
  const lexemes = parsed.lexemes.map((lexeme) => {
    if (!idMap.has(lexeme.id)) return lexeme;
    const id = mapId(lexeme.id);
    const senses = lexeme.entry.senses?.map((sense) =>
      typeof sense.id === 'string' ? { ...sense, id: mapId(sense.id) } : sense,
    );
    return { ...lexeme, id, entry: { ...lexeme.entry, id, ...(senses ? { senses } : {}) } };
  });
  const relations = parsed.resource.resource.relations?.map((relation) => ({
    ...relation,
    members: relation.members.map((member) => ({ ...member, ref: mapId(member.ref) })),
  }));
  const resource: LexemeResourceDoc = {
    ...parsed.resource,
    resource: { ...parsed.resource.resource, ...(relations ? { relations } : {}) },
  };
  return { lexemes, resource, regenerated };
}

function relationKey(relation: DmlexRelation): string {
  return `${relation.type}\u0000${relation.members.map((member) => member.ref).join('\u0000')}`;
}

/**
 * 把文件里的关系并入项目已有的词典资源，整次导入只算一次。
 * 只替换被导入词条（及其被覆盖的旧版本）拥有的 subsense / homograph 关系；项目里其他词条的关系、
 * 文件里每一条词条的关系都保留（以前逐条循环时，后一条会把前面几条的 subsense 关系删掉）。
 * Merge the file's relations into the project's resource once per import. Only subsense /
 * homograph relations owned by the imported entries (and the versions they replace) are replaced;
 * relations of other project entries and of every entry in the file are kept (the per-entry loop
 * used to drop earlier entries' subsense relations).
 */
function mergeImportedResource(
  existing: LexemeResourceDoc | null,
  imported: LexemeResourceDoc,
  lexemes: readonly LexemeEntryDoc[],
  replaced: readonly LexemeEntryDoc[],
): LexemeResourceDoc {
  if (!existing) return imported;
  const importedEntryIds = new Set(lexemes.map((lexeme) => lexeme.id));
  const ownedSenseIds = new Set(
    [...lexemes, ...replaced].flatMap((row) =>
      (row.entry.senses ?? []).flatMap((sense) =>
        typeof sense.id === 'string' && sense.id.length > 0 ? [sense.id] : [],
      ),
    ),
  );
  const kept = (existing.resource.relations ?? []).filter((relation) => {
    if (relation.type === DMLEX_SUBSENSE) {
      return !relation.members.every((member) => ownedSenseIds.has(member.ref));
    }
    if (relation.type === DMLEX_HOMOGRAPH) {
      return !relation.members.some((member) => importedEntryIds.has(member.ref));
    }
    return true;
  });
  const relations: DmlexRelation[] = [];
  const seen = new Set<string>();
  for (const relation of [...kept, ...(imported.resource.relations ?? [])]) {
    const key = relationKey(relation);
    if (seen.has(key)) continue;
    seen.add(key);
    relations.push(relation);
  }
  const relationTypes = [...(existing.resource.relationTypes ?? [])];
  for (const type of imported.resource.relationTypes ?? []) {
    if (!relationTypes.some((row) => row.type === type.type)) relationTypes.push(type);
  }
  const translationLanguages = [
    ...new Set([
      ...existing.resource.translationLanguages,
      ...imported.resource.translationLanguages,
    ]),
  ];
  const existingLang = existing.resource.langCode.trim();
  const langCode =
    existingLang.length > 0 && existingLang !== 'und' ? existingLang : imported.resource.langCode;
  return {
    ...existing,
    resource: {
      ...existing.resource,
      langCode,
      translationLanguages,
      // Always write relations so an empty merge clears stale subsense/homograph rows (#436).
      relations,
      ...(relationTypes.length > 0 ? { relationTypes } : {}),
    },
    updatedAt: imported.updatedAt,
  };
}

export async function importLexemesFromLiftXml(
  xml: string,
  textId: string,
  deps: LexiconLiftImportDeps = defaultLiftImportDeps(textId),
): Promise<LexiconLiftImportResult> {
  const parsed = parseLiftXml(xml, textId);
  if (!parsed.ok) return parsed;
  const runAtomic = deps.runAtomic ?? (<T>(work: () => Promise<T>) => work());
  const savedIds: string[] = [];
  let result: LexiconLiftImportResult;
  try {
    result = await runAtomic(async () => {
      const foreignIds =
        deps.listForeignIds !== undefined
          ? await deps.listForeignIds(parsed.lexemes.map((lexeme) => lexeme.id))
          : new Set<string>();
      const existingRows = await deps.list();
      const target = regenerateForeignIds(
        parsed,
        textId,
        foreignIds,
        new Set(existingRows.map((row) => row.id)),
      );
      const importedIds = new Set(target.lexemes.map((lexeme) => lexeme.id));
      const replacedRows = existingRows.filter((row) => importedIds.has(row.id));
      const replacedById = replacedRows.length;
      const resource = mergeImportedResource(
        await deps.loadResource(),
        target.resource,
        target.lexemes,
        replacedRows,
      );
      for (const lexeme of target.lexemes) {
        savedIds.push(await deps.save(lexeme));
      }
      savedIds.push(await deps.saveResource(resource));
      const readback = (await deps.list()).filter(isLexemeEntry);
      const losses = [...parsed.losses];
      if (replacedById > 0) losses.push({ code: 'replaced-by-id', count: replacedById });
      if (target.regenerated > 0) {
        losses.push({ code: 'regenerated-id', count: target.regenerated });
      }
      // 词头语言与词典语言不同的词条：LIFT 每条有自己的语言，DMLex 只有一种（JY-09）
      // Entries whose headword language differs from the dictionary's: LIFT has one per entry,
      // DMLex one per dictionary (JY-09)
      const mixedLang = [...parsed.headwordLangs.values()].filter(
        (lang) => lang !== 'und' && lang !== resource.resource.langCode,
      ).length;
      if (mixedLang > 0) losses.push({ code: 'mixed-headword-lang', count: mixedLang });
      return {
        ok: true as const,
        savedCount: target.lexemes.length,
        readback,
        diagnostics: parsed.diagnostics,
        losses,
      };
    });
  } catch {
    return { ok: false, reason: 'save-failed' };
  }
  // 只在事务提交后广播，回滚时 UI 什么都收不到（GAP-3）
  // Announce only after the transaction committed; a rollback announces nothing (GAP-3)
  deps.announce?.(savedIds);
  return result;
}

export async function importLexemesFromLiftFile(
  file: File,
  textId: string,
  deps: LexiconLiftImportDeps = defaultLiftImportDeps(textId),
): Promise<LexiconLiftImportResult> {
  return importLexemesFromLiftXml(await file.text(), textId, deps);
}
