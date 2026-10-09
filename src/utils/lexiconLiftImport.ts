/**
 * LIFT 0.13 → DMLex JSON projection. Unmapped FLEx fields become diagnostics.
 */
import { getDb } from '../db';
import { withTransaction } from '../db/withTransaction';
import { LinguisticService } from '../services/LinguisticService';
import { DMLEX_HOMOGRAPH, DMLEX_SUBSENSE } from '../db/dmlexTypes';
import type { LexemeDocType, LexemeEntryDoc, LexemeResourceDoc } from '../db/types';
import type { DmlexRelation } from '../db/dmlexTypes';
import { isLexemeEntry } from '../db/lexemeNestedIds';
import { newId } from './transcriptionFormatters';
import { applyLexiconEntryFields, emptyDmlexResource, type LexiconSenseDraft } from './dmlexEntry';
import { LIFT_VERSION } from './lexiconLiftExport';
import type { InterchangeLoss } from './interchangeLossReport';

export type LexiconLiftDiagnosticCode =
  | 'extra-headword'
  | 'morph-type'
  | 'note'
  | 'reversal'
  | 'import-residue'
  | 'scientific-name'
  | 'variant-with-sense';

export type LexiconLiftDiagnostic = {
  code: LexiconLiftDiagnosticCode;
  entryId: string;
};

export type LexiconLiftImportReason =
  | 'invalid-xml'
  | 'unsupported-version'
  | 'empty'
  | 'save-failed';

export type LexiconLiftParseResult =
  | {
      ok: true;
      lexemes: LexemeEntryDoc[];
      resource: LexemeResourceDoc;
      diagnostics: LexiconLiftDiagnostic[];
      losses: InterchangeLoss[];
      /** 每个词条 lexical-unit 的语言（按解析出的词条 id）| Headword language per parsed entry id */
      headwordLangs: ReadonlyMap<string, string>;
    }
  | { ok: false; reason: Exclude<LexiconLiftImportReason, 'save-failed'> };

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
};

/** 默认依赖：所有读写都显式带上项目 | Default deps: every read/write names the project */
export function defaultLiftImportDeps(textId: string): LexiconLiftImportDeps {
  return {
    save: (doc) => LinguisticService.lexemes.save(doc),
    list: () => LinguisticService.lexemes.list(textId),
    loadResource: () => LinguisticService.lexemes.getResource(textId),
    saveResource: (doc) => LinguisticService.lexemes.save(doc),
    listForeignIds: async (ids) => {
      const db = await getDb();
      const rows = await db.dexie.lexemes.bulkGet(ids);
      return new Set(
        rows.flatMap((row) => (row !== undefined && row.textId !== textId ? [row.id] : [])),
      );
    },
    runAtomic: async (work) => {
      const db = await getDb();
      return withTransaction(db, 'rw', [db.dexie.lexemes], work, { label: 'lift-import' });
    },
  };
}

/**
 * 跨项目导入（JY-07）：文件里的词条 id 已被本机另一个项目占用时，换成新 id，义项 id 一并换新，
 * DMLex 关系里的引用按同一张映射表改写。目标项目自己的同 id 词条仍按 id 覆盖。
 * Cross-project import (JY-07): entry ids already owned by another local project get new ids
 * (their sense ids too), and DMLex relation refs are rewritten through the same map. Same-id
 * entries of the target project are still replaced by id.
 */
function regenerateForeignIds(
  parsed: Extract<LexiconLiftParseResult, { ok: true }>,
  foreignIds: ReadonlySet<string>,
): { lexemes: LexemeEntryDoc[]; resource: LexemeResourceDoc; regenerated: number } {
  if (foreignIds.size === 0) {
    return { lexemes: parsed.lexemes, resource: parsed.resource, regenerated: 0 };
  }
  const idMap = new Map<string, string>();
  for (const lexeme of parsed.lexemes) {
    if (!foreignIds.has(lexeme.id)) continue;
    idMap.set(lexeme.id, newId('lex'));
    for (const sense of lexeme.entry.senses ?? []) {
      if (typeof sense.id === 'string' && sense.id.length > 0) idMap.set(sense.id, newId('sense'));
    }
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
  return { lexemes, resource, regenerated: foreignIds.size };
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
      ...(relations.length > 0 ? { relations } : {}),
      ...(relationTypes.length > 0 ? { relationTypes } : {}),
    },
    updatedAt: imported.updatedAt,
  };
}

/**
 * LIFT 原文直接写进词条：词头、变体形式、发音原样保留（不 trim、不按逗号拆分），
 * 发音语言与词头不同时记成 DMLex transcription scheme（如 `seh-fonipa`）。
 * Write LIFT text straight into the entry: headword, variant forms and pronunciation are kept as is
 * (no trim, no comma split); a pronunciation language other than the headword's becomes the DMLex
 * transcription scheme (e.g. `seh-fonipa`).
 */
function withLiftForms(
  doc: LexemeEntryDoc,
  forms: {
    headword: string;
    variantForms: readonly string[];
    pronunciation: string;
    pronunciationScheme: string;
  },
): LexemeEntryDoc {
  const { inflectedForms: _dropped, pronunciations: _replaced, ...rest } = doc.entry;
  const entry: LexemeEntryDoc['entry'] = {
    ...rest,
    headword: forms.headword,
    ...(forms.pronunciation.length > 0
      ? {
          pronunciations: [
            {
              transcriptions: [
                {
                  text: forms.pronunciation,
                  ...(forms.pronunciationScheme.length > 0
                    ? { scheme: forms.pronunciationScheme }
                    : {}),
                },
              ],
            },
          ],
        }
      : {}),
    ...(forms.variantForms.length > 0
      ? { inflectedForms: forms.variantForms.map((text) => ({ text })) }
      : {}),
  };
  return { ...doc, entry };
}

function mostCommonLang(langs: ReadonlyMap<string, string>): string {
  const counts = new Map<string, number>();
  for (const lang of langs.values()) {
    if (lang === 'und') continue;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  let best = 'und';
  let bestCount = 0;
  for (const [lang, count] of counts) {
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return best;
}

function directChildren(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

function attr(el: Element, name: string): string {
  return (el.getAttribute(name) ?? '').trim();
}

function formText(parent: Element | undefined): Array<{ lang: string; text: string }> {
  if (!parent) return [];
  const out: Array<{ lang: string; text: string }> = [];
  for (const form of directChildren(parent, 'form')) {
    // 文本原样保留（含首尾空白）；只有全空白才算空 | Keep the text as is; whitespace-only counts as empty
    const text = directChildren(form, 'text')[0]?.textContent ?? '';
    if (text.trim().length === 0) continue;
    const lang = attr(form, 'lang');
    out.push({ lang: lang.length > 0 ? lang : 'und', text });
  }
  return out;
}

function firstText(forms: Array<{ lang: string; text: string }>): string {
  return forms[0]?.text ?? '';
}

type ParsedSense = {
  id: string;
  parentId: string;
  draft: LexiconSenseDraft;
  pos: string;
};

function parseSense(
  sense: Element,
  parentId: string,
  entryId: string,
  headLang: string,
  diagnostics: LexiconLiftDiagnostic[],
): ParsedSense {
  const senseIdAttr = attr(sense, 'id');
  const id = senseIdAttr.length > 0 ? senseIdAttr : newId('sense');
  const glosses = directChildren(sense, 'gloss').flatMap((gloss) => {
    const text = (gloss.querySelector('text')?.textContent ?? '').trim();
    if (text.length === 0) return [];
    const lang = attr(gloss, 'lang');
    return [{ lang: lang.length > 0 ? lang : 'und', text }];
  });
  const definitions = directChildren(sense, 'definition').flatMap((definition) =>
    formText(definition),
  );
  const sameLang = definitions.find((item) => item.lang === headLang || item.lang.length === 0);
  const otherLang = definitions.find((item) => item.lang !== headLang && item.lang.length > 0);
  const example = directChildren(sense, 'example')[0];
  const exampleForms = formText(example);
  const exampleTranslationForm = example
    ? formText(directChildren(example, 'translation')[0])[0]
    : undefined;
  const exampleTranslation = exampleTranslationForm?.text ?? '';
  const labels = directChildren(sense, 'trait')
    .map((trait) => attr(trait, 'value'))
    .filter((value) => value.length > 0);
  if (directChildren(sense, 'note').length > 0) diagnostics.push({ code: 'note', entryId });
  if (directChildren(sense, 'reversal').length > 0) diagnostics.push({ code: 'reversal', entryId });
  if (sense.querySelector('field[type="import-residue"]')) {
    diagnostics.push({ code: 'import-residue', entryId });
  }
  if (sense.querySelector('field[type="scientific-name"]')) {
    diagnostics.push({ code: 'scientific-name', entryId });
  }
  const draft: LexiconSenseDraft = {
    id,
    parentId,
    indicator: '',
    translation: glosses[0]?.text ?? '',
    translationLang: glosses[0]?.lang ?? 'zh',
    explanation: otherLang?.text ?? '',
    explanationLang: otherLang?.lang ?? 'zh',
    definition: sameLang?.text ?? (otherLang ? '' : (definitions[0]?.text ?? '')),
    example: firstText(exampleForms),
    exampleTranslation,
    exampleTranslationLang:
      exampleTranslationForm && exampleTranslationForm.lang !== 'und'
        ? exampleTranslationForm.lang
        : 'zh',
    exampleSegmentId: '',
    labels: labels.join(', '),
    note: '',
  };
  return {
    id,
    parentId,
    draft,
    pos: directChildren(sense, 'grammatical-info')[0]
      ? attr(directChildren(sense, 'grammatical-info')[0]!, 'value')
      : '',
  };
}

function collectSenses(
  elements: Element[],
  parentId: string,
  entryId: string,
  headLang: string,
  diagnostics: LexiconLiftDiagnostic[],
): ParsedSense[] {
  const out: ParsedSense[] = [];
  for (const element of elements) {
    const parsed = parseSense(element, parentId, entryId, headLang, diagnostics);
    out.push(parsed);
    out.push(
      ...collectSenses(
        directChildren(element, 'subsense'),
        parsed.id,
        entryId,
        headLang,
        diagnostics,
      ),
    );
  }
  return out;
}

function blankEntry(id: string, headword: string, now: string, textId: string): LexemeEntryDoc {
  return {
    id,
    textId,
    entry: { id, headword },
    createdAt: now,
    updatedAt: now,
  };
}

export function parseLiftXml(xml: string, textId: string): LexiconLiftParseResult {
  if (typeof DOMParser === 'undefined') return { ok: false, reason: 'invalid-xml' };
  const trimmed = xml.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  const doc = new DOMParser().parseFromString(trimmed, 'application/xml');
  if (doc.querySelector('parsererror')) return { ok: false, reason: 'invalid-xml' };
  const lift = doc.documentElement;
  if (lift.localName !== 'lift') return { ok: false, reason: 'invalid-xml' };
  if (attr(lift, 'version') !== LIFT_VERSION) return { ok: false, reason: 'unsupported-version' };
  const now = new Date().toISOString();
  const diagnostics: LexiconLiftDiagnostic[] = [];
  const lexemes: LexemeEntryDoc[] = [];
  let resource = emptyDmlexResource(now, textId);
  let missingStableIds = 0;
  const headwordLangs = new Map<string, string>();
  for (const entry of directChildren(lift, 'entry')) {
    const entryIdAttr = attr(entry, 'id');
    const id = entryIdAttr.length > 0 ? entryIdAttr : newId('lex');
    if (
      attr(entry, 'morph-type').length > 0 ||
      directChildren(entry, 'trait').some((trait) => attr(trait, 'name') === 'morph-type')
    ) {
      diagnostics.push({ code: 'morph-type', entryId: id });
    }
    const forms = formText(directChildren(entry, 'lexical-unit')[0]);
    if (forms.length === 0) continue;
    if (entryIdAttr.length === 0) missingStableIds += 1;
    if (forms.length > 1) diagnostics.push({ code: 'extra-headword', entryId: id });
    const senses = collectSenses(
      directChildren(entry, 'sense'),
      '',
      id,
      forms[0]!.lang,
      diagnostics,
    );
    const posValues = [
      ...new Set(senses.map((sense) => sense.pos).filter((pos) => pos.length > 0)),
    ];
    const pronunciationForm = formText(directChildren(entry, 'pronunciation')[0])[0];
    const pronunciation = pronunciationForm?.text ?? '';
    const etymology = directChildren(entry, 'etymology')[0];
    const etymon = firstText(formText(etymology));
    const variants = directChildren(entry, 'variant');
    for (const variant of variants) {
      if (directChildren(variant, 'sense').length > 0) {
        diagnostics.push({ code: 'variant-with-sense', entryId: id });
      }
    }
    // 变体形式直接成为数组，不经过逗号分隔的表单字符串（JY-09）
    // Variant forms become the array directly, never through a comma-separated form string (JY-09)
    const variantForms = variants.flatMap((variant) => formText(variant)).map((form) => form.text);
    const groups =
      posValues.length <= 1
        ? [{ id, pos: posValues[0] ?? '', senses }]
        : posValues.map((pos, index) => ({
            id: index === 0 ? id : `${id}__${pos}`,
            pos,
            senses: senses
              .filter((sense) => sense.pos === pos)
              .map((sense) => ({ ...sense, draft: { ...sense.draft, parentId: '' } })),
          }));
    const partners = groups.map((group) => group.id);
    for (const group of groups) {
      const applied = applyLexiconEntryFields(
        blankEntry(group.id, forms[0]!.text, now, textId),
        {
          headword: forms[0]!.text,
          homographNumber: groups.length > 1 ? String(partners.indexOf(group.id) + 1) : '',
          partsOfSpeech: group.pos,
          labels: '',
          pronunciation,
          inflectedForms: '',
          etymon,
          etymonLang: etymology ? attr(etymology, 'source') : '',
          note: '',
          homographEntryId: group.id === partners[0] ? '' : (partners[0] ?? ''),
          senses: group.senses.map((sense) => sense.draft),
        },
        resource,
        now,
        textId,
      );
      lexemes.push(
        withLiftForms(applied.entry, {
          headword: forms[0]!.text,
          variantForms,
          pronunciation,
          pronunciationScheme:
            pronunciationForm &&
            pronunciationForm.lang !== 'und' &&
            pronunciationForm.lang !== forms[0]!.lang
              ? pronunciationForm.lang
              : '',
        }),
      );
      headwordLangs.set(group.id, forms[0]!.lang);
      resource = applied.resource;
    }
  }
  if (lexemes.length === 0) return { ok: false, reason: 'empty' };
  const losses: InterchangeLoss[] =
    missingStableIds > 0 ? [{ code: 'no-stable-id', count: missingStableIds }] : [];
  // 词典的对象语言取文件里最常见的词头语言（JY-09）| Dictionary language = most common headword language
  const objectLang = mostCommonLang(headwordLangs);
  resource = { ...resource, resource: { ...resource.resource, langCode: objectLang } };
  return { ok: true, lexemes, resource, diagnostics, losses, headwordLangs };
}

export async function importLexemesFromLiftXml(
  xml: string,
  textId: string,
  deps: LexiconLiftImportDeps = defaultLiftImportDeps(textId),
): Promise<LexiconLiftImportResult> {
  const parsed = parseLiftXml(xml, textId);
  if (!parsed.ok) return parsed;
  const runAtomic = deps.runAtomic ?? (<T>(work: () => Promise<T>) => work());
  try {
    return await runAtomic(async () => {
      const foreignIds =
        deps.listForeignIds !== undefined
          ? await deps.listForeignIds(parsed.lexemes.map((lexeme) => lexeme.id))
          : new Set<string>();
      const target = regenerateForeignIds(parsed, foreignIds);
      const existingRows = await deps.list();
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
        await deps.save(lexeme);
      }
      await deps.saveResource(resource);
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
}

export async function importLexemesFromLiftFile(
  file: File,
  textId: string,
  deps: LexiconLiftImportDeps = defaultLiftImportDeps(textId),
): Promise<LexiconLiftImportResult> {
  return importLexemesFromLiftXml(await file.text(), textId, deps);
}
