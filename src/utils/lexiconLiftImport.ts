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
  return {
    id: storedId.length > 0 ? storedId : `${lexemeId}-sense-${index}`,
    gloss,
    ...(definition ? { definition } : {}),
    ...(category.length > 0 ? { category } : {}),
  };
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
  const notesParent = directChildren(entry, 'note')[0];
  const notes = multiLangFromForms(notesParent);
  const morphType =
    directChildren(entry, 'trait').find((trait) => attr(trait, 'name') === 'morph-type') ?? null;
  const lexemeType = morphType ? attr(morphType, 'value') : '';
  const senses = directChildren(entry, 'sense')
    .map((sense, index) => parseSense(sense, index, id, language))
    .filter((sense): sense is NonNullable<typeof sense> => sense !== null);
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
