/**
 * Lexicon inbound: SIL LIFT 0.13 XML (B3e subset inverse).
 *
 * Research: FLEx/WeSay merge by entry/sense guid; no guid → new row.
 * Conflict policy = FLEx option 2 (overwrite mapped fields). Fields LIFT
 * does not carry stay on the existing row. No attachments / relations / sense tree.
 */
import type { LexemeDocType, MultiLangString } from '../types/jieyuDbDocTypes';
import { LinguisticService } from '../services/LinguisticService';
import { newId } from './transcriptionFormatters';
import { LIFT_VERSION } from './lexiconLiftExport';

export type LexiconLiftImportReason =
  | 'invalid-xml'
  | 'unsupported-version'
  | 'empty'
  | 'save-failed';

export type LexiconLiftParseResult =
  | { ok: true; lexemes: LexemeDocType[] }
  | { ok: false; reason: Exclude<LexiconLiftImportReason, 'save-failed'> };

export type LexiconLiftImportResult =
  | { ok: true; savedCount: number; readback: LexemeDocType[] }
  | { ok: false; reason: LexiconLiftImportReason };

export type LexiconLiftImportDeps = {
  save: (doc: LexemeDocType) => Promise<string>;
  list: () => Promise<LexemeDocType[]>;
};

const defaultDeps: LexiconLiftImportDeps = {
  save: (doc) => LinguisticService.lexemes.save(doc),
  list: () => LinguisticService.lexemes.list(),
};

function directChildren(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

/** FLEx sense `order` starts at 0. Missing order keeps document order. */
function sortByLiftOrder(elements: Element[]): Element[] {
  return elements
    .map((element, index) => {
      const raw = attr(element, 'order');
      const parsed = Number(raw);
      const order = raw.length > 0 && Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
      return { element, index, order };
    })
    .sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.index - right.index;
    })
    .map((row) => row.element);
}

function attr(el: Element, name: string): string {
  return (el.getAttribute(name) ?? '').trim();
}

function formPairs(parent: Element): Array<{ lang: string; text: string }> {
  const seen = new Set<string>();
  const out: Array<{ lang: string; text: string }> = [];
  for (const form of directChildren(parent, 'form')) {
    const lang = attr(form, 'lang');
    if (lang.length === 0 || seen.has(lang)) continue;
    const textEl = directChildren(form, 'text')[0];
    const text = (textEl?.textContent ?? '').trim();
    if (text.length === 0) continue;
    seen.add(lang);
    out.push({ lang, text });
  }
  return out;
}

function multiLangFromForms(parent: Element | undefined): MultiLangString | undefined {
  if (!parent) return undefined;
  const pairs = formPairs(parent);
  if (pairs.length === 0) return undefined;
  const record: MultiLangString = {};
  for (const pair of pairs) record[pair.lang] = pair.text;
  const first = pairs[0];
  if (first) record.default = first.text;
  return record;
}

function glossRecord(sense: Element, vernacular: string): MultiLangString | undefined {
  const seen = new Set<string>();
  const record: MultiLangString = {};
  for (const gloss of directChildren(sense, 'gloss')) {
    const glossLang = attr(gloss, 'lang');
    const lang = glossLang.length > 0 ? glossLang : vernacular;
    if (seen.has(lang)) continue;
    const textEl = directChildren(gloss, 'text')[0];
    const text = (textEl?.textContent ?? '').trim();
    if (text.length === 0) continue;
    seen.add(lang);
    record[lang] = text;
  }
  const langs = Object.keys(record);
  if (langs.length === 0) return undefined;
  if ((record.default ?? '').length === 0) {
    const first = record[langs[0]!];
    if (first !== undefined && first.length > 0) record.default = first;
  }
  return record;
}

function parseExamples(sense: Element): Array<{ source: string; translation?: string }> {
  return directChildren(sense, 'example').flatMap((example) => {
    const source = formPairs(example)[0]?.text ?? '';
    if (source.length === 0) return [];
    const translationParent = directChildren(example, 'translation')[0];
    const translation = translationParent ? (formPairs(translationParent)[0]?.text ?? '') : '';
    return translation.length > 0 ? [{ source, translation }] : [{ source }];
  });
}

function parseSense(
  sense: Element,
  index: number,
  lexemeId: string,
  vernacular: string,
): LexemeDocType['senses'][number] | null {
  const gloss = glossRecord(sense, vernacular);
  if (!gloss) return null;
  const storedId = attr(sense, 'id');
  const definitionParent = directChildren(sense, 'definition')[0];
  const definition = multiLangFromForms(definitionParent);
  const grammatical = directChildren(sense, 'grammatical-info')[0];
  const category = grammatical ? attr(grammatical, 'value') : '';
  const examples = parseExamples(sense);
  return {
    id: storedId.length > 0 ? storedId : `${lexemeId}-sense-${index}`,
    gloss,
    ...(definition ? { definition } : {}),
    ...(category.length > 0 ? { category } : {}),
    ...(examples.length > 0 ? { examples } : {}),
  };
}

function parseSenseTree(
  sense: Element,
  index: number,
  lexemeId: string,
  vernacular: string,
  parentId: string | undefined,
): LexemeDocType['senses'] {
  const parsed = parseSense(sense, index, lexemeId, vernacular);
  if (!parsed) return [];
  const withParent =
    parentId !== undefined && parentId.length > 0 ? { ...parsed, parentId } : parsed;
  const children = sortByLiftOrder(directChildren(sense, 'subsense')).flatMap((child, childIndex) =>
    parseSenseTree(child, childIndex, lexemeId, vernacular, parsed.id),
  );
  return [withParent, ...children];
}

function firstGlossText(parent: Element): string {
  for (const gloss of directChildren(parent, 'gloss')) {
    const text = (directChildren(gloss, 'text')[0]?.textContent ?? '').trim();
    if (text.length > 0) return text;
  }
  return '';
}

function parseEtymology(entry: Element): LexemeDocType['etymology'] {
  for (const block of directChildren(entry, 'etymology')) {
    const form = formPairs(block)[0]?.text ?? '';
    if (form.length === 0) continue;
    const gloss = firstGlossText(block);
    const sourceTrait =
      directChildren(block, 'trait').find((trait) => attr(trait, 'name') === 'languages') ?? null;
    const sourceLanguage = sourceTrait ? attr(sourceTrait, 'value') : '';
    return {
      form,
      ...(gloss.length > 0 ? { gloss } : {}),
      ...(sourceLanguage.length > 0 ? { sourceLanguage } : {}),
    };
  }
  return undefined;
}

function entryNote(entry: Element, type: string): Element | undefined {
  return directChildren(entry, 'note').find((note) => attr(note, 'type') === type);
}

function parseTypedNote(entry: Element, type: string): string {
  const note = entryNote(entry, type);
  if (!note) return '';
  return formPairs(note)[0]?.text ?? '';
}

function parseBibliography(entry: Element): string {
  return parseTypedNote(entry, 'bibliography');
}

function parseRestrictions(entry: Element): string {
  return parseTypedNote(entry, 'restrictions');
}

function parseFieldText(entry: Element, type: string): string {
  for (const field of directChildren(entry, 'field')) {
    if (attr(field, 'type') !== type) continue;
    const text = formPairs(field)[0]?.text ?? '';
    if (text.length > 0) return text;
  }
  return '';
}

function parseLiteralMeaning(entry: Element): string {
  return parseFieldText(entry, 'literal-meaning');
}

function parseSummaryDefinition(entry: Element): string {
  return parseFieldText(entry, 'summary-definition');
}

function parsePronunciation(entry: Element): string {
  for (const block of directChildren(entry, 'pronunciation')) {
    const text = formPairs(block)[0]?.text ?? '';
    if (text.length > 0) return text;
  }
  return '';
}

function parseEntry(entry: Element, now: string): LexemeDocType | null {
  const lexicalUnit = directChildren(entry, 'lexical-unit')[0];
  if (!lexicalUnit) return null;
  const lemma = multiLangFromForms(lexicalUnit);
  if (!lemma) return null;
  const entryId = attr(entry, 'id');
  const id = entryId.length > 0 ? entryId : newId('lex');
  const firstLang = formPairs(lexicalUnit)[0]?.lang ?? '';
  const language = firstLang.length > 0 ? firstLang : 'und';
  const citationParent = directChildren(entry, 'citation')[0];
  const citation = citationParent ? (formPairs(citationParent)[0]?.text ?? '') : '';
  const notesParent = entryNote(entry, '');
  const notes = multiLangFromForms(notesParent);
  const morphType =
    directChildren(entry, 'trait').find((trait) => attr(trait, 'name') === 'morph-type') ?? null;
  const lexemeType = morphType ? attr(morphType, 'value') : '';
  const pronunciation = parsePronunciation(entry);
  const etymology = parseEtymology(entry);
  const literalMeaning = parseLiteralMeaning(entry);
  const summaryDefinition = parseSummaryDefinition(entry);
  const bibliography = parseBibliography(entry);
  const restrictions = parseRestrictions(entry);
  const senses = sortByLiftOrder(directChildren(entry, 'sense')).flatMap((sense, index) =>
    parseSenseTree(sense, index, id, language, undefined),
  );
  const forms = directChildren(entry, 'variant').flatMap((variant) => {
    const transcription = multiLangFromForms(variant);
    if (!transcription) return [];
    return [{ transcription }];
  });
  const createdAttr = attr(entry, 'dateCreated');
  const updatedAttr = attr(entry, 'dateModified');
  const createdAt = createdAttr.length > 0 ? createdAttr : now;
  const updatedAt = updatedAttr.length > 0 ? updatedAttr : now;
  return {
    id,
    lemma,
    language,
    senses,
    createdAt,
    updatedAt,
    ...(citation.length > 0 ? { citationForm: citation } : {}),
    ...(lexemeType.length > 0 ? { lexemeType } : {}),
    ...(pronunciation.length > 0 ? { pronunciation } : {}),
    ...(etymology ? { etymology } : {}),
    ...(literalMeaning.length > 0 ? { literalMeaning } : {}),
    ...(summaryDefinition.length > 0 ? { summaryDefinition } : {}),
    ...(bibliography.length > 0 ? { bibliography } : {}),
    ...(restrictions.length > 0 ? { restrictions } : {}),
    ...(notes ? { notes } : {}),
    ...(forms.length > 0 ? { forms } : {}),
  };
}

export function parseLiftXml(xml: string): LexiconLiftParseResult {
  if (typeof DOMParser === 'undefined') return { ok: false, reason: 'invalid-xml' };
  const trimmed = xml.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  const doc = new DOMParser().parseFromString(trimmed, 'application/xml');
  if (doc.querySelector('parsererror')) return { ok: false, reason: 'invalid-xml' };
  const lift = doc.documentElement;
  if (lift.localName !== 'lift') return { ok: false, reason: 'invalid-xml' };
  const version = attr(lift, 'version');
  if (version !== LIFT_VERSION) return { ok: false, reason: 'unsupported-version' };
  const now = new Date().toISOString();
  const lexemes = directChildren(lift, 'entry')
    .map((entry) => parseEntry(entry, now))
    .filter((entry): entry is LexemeDocType => entry !== null);
  if (lexemes.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, lexemes };
}

function mergeParsed(
  parsed: LexemeDocType,
  existing: LexemeDocType | undefined,
  now: string,
): LexemeDocType {
  if (!existing) {
    const createdAt = parsed.createdAt.length > 0 ? parsed.createdAt : now;
    return { ...parsed, updatedAt: now, createdAt };
  }
  const citationForm = parsed.citationForm ?? existing.citationForm;
  const lexemeType = parsed.lexemeType ?? existing.lexemeType;
  const pronunciation = parsed.pronunciation ?? existing.pronunciation;
  const etymology = parsed.etymology ?? existing.etymology;
  const literalMeaning = parsed.literalMeaning ?? existing.literalMeaning;
  const summaryDefinition = parsed.summaryDefinition ?? existing.summaryDefinition;
  const bibliography = parsed.bibliography ?? existing.bibliography;
  const restrictions = parsed.restrictions ?? existing.restrictions;
  const notes = parsed.notes ?? existing.notes;
  const forms = parsed.forms ?? existing.forms;
  return {
    ...existing,
    lemma: parsed.lemma,
    language: parsed.language ?? existing.language ?? 'und',
    senses: parsed.senses,
    updatedAt: now,
    createdAt: existing.createdAt,
    ...(citationForm !== undefined ? { citationForm } : {}),
    ...(lexemeType !== undefined && lexemeType.length > 0 ? { lexemeType } : {}),
    ...(pronunciation !== undefined && pronunciation.length > 0 ? { pronunciation } : {}),
    ...(etymology !== undefined && etymology.form.length > 0 ? { etymology } : {}),
    ...(literalMeaning !== undefined && literalMeaning.length > 0 ? { literalMeaning } : {}),
    ...(summaryDefinition !== undefined && summaryDefinition.length > 0
      ? { summaryDefinition }
      : {}),
    ...(bibliography !== undefined && bibliography.length > 0 ? { bibliography } : {}),
    ...(restrictions !== undefined && restrictions.length > 0 ? { restrictions } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(forms !== undefined ? { forms } : {}),
  };
}

export async function importLexemesFromLiftXml(
  xml: string,
  deps: LexiconLiftImportDeps = defaultDeps,
  now: string = new Date().toISOString(),
): Promise<LexiconLiftImportResult> {
  const parsed = parseLiftXml(xml);
  if (!parsed.ok) return parsed;
  try {
    const existing = await deps.list();
    const byId = new Map(existing.map((row) => [row.id, row]));
    for (const lexeme of parsed.lexemes) {
      await deps.save(mergeParsed(lexeme, byId.get(lexeme.id), now));
    }
    const readback = await deps.list();
    return { ok: true, savedCount: parsed.lexemes.length, readback };
  } catch {
    return { ok: false, reason: 'save-failed' };
  }
}

export async function importLexemesFromLiftFile(
  file: File,
  deps: LexiconLiftImportDeps = defaultDeps,
): Promise<LexiconLiftImportResult> {
  const xml = await file.text();
  return importLexemesFromLiftXml(xml, deps);
}
