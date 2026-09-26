/**
 * Lexicon outbound: SIL LIFT 0.13 XML.
 *
 * Research: FLEx/WeSay still use 0.13 (not 0.15). lexical-unit = lemma;
 * sense gloss/definition; entry-level variant = allomorph (not a variant-entry).
 * Outbound only — never write back. No attachments, no DMLex, no flextext mix-in.
 */
import type { LexemeDocType, MultiLangString } from '../types/jieyuDbDocTypes';
import { liftSenseChildren, liftSenseRoots, readSenseId } from './lexemeSenseTree';

export const LIFT_VERSION = '0.13';
export const LIFT_PRODUCER = 'Jieyu';
export const LIFT_MIME = 'application/xml';
export const LIFT_FILENAME = 'jieyu-lexicon.lift';

export type LexiconLiftExportResult =
  | { ok: true; xml: string }
  | { ok: false; reason: 'empty' | 'download-unavailable' };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function vernacularLang(lexeme: LexemeDocType): string {
  const language = lexeme.language?.trim() ?? '';
  return language.length > 0 ? language : 'und';
}

function liftLang(key: string, vernacular: string): string {
  const trimmed = key.trim();
  if (trimmed.length === 0 || trimmed === 'default') return vernacular;
  return trimmed;
}

function formsFromMultiLang(
  record: MultiLangString | undefined,
  vernacular: string,
): Array<{ lang: string; text: string }> {
  if (!record) return [];
  const seen = new Set<string>();
  const out: Array<{ lang: string; text: string }> = [];
  const entries = Object.entries(record);
  const ordered = [
    ...entries.filter(([key]) => key !== 'default'),
    ...entries.filter(([key]) => key === 'default'),
  ];
  for (const [key, raw] of ordered) {
    const text = raw.trim();
    if (text.length === 0) continue;
    const lang = liftLang(key, vernacular);
    if (seen.has(lang)) continue;
    seen.add(lang);
    out.push({ lang, text });
  }
  return out;
}

function xmlForm(lang: string, text: string): string {
  return `<form lang="${escapeXml(lang)}"><text>${escapeXml(text)}</text></form>`;
}

function xmlGloss(lang: string, text: string): string {
  return `<gloss lang="${escapeXml(lang)}"><text>${escapeXml(text)}</text></gloss>`;
}

function xmlFormList(forms: Array<{ lang: string; text: string }>): string {
  return forms.map((form) => xmlForm(form.lang, form.text)).join('');
}

function serializeSenseNode(
  tag: 'sense' | 'subsense',
  lexemeId: string,
  sense: LexemeDocType['senses'][number],
  siblingIndex: number,
  vernacular: string,
  all: LexemeDocType['senses'],
): string {
  const storedId = readSenseId(sense);
  const senseId = storedId.length > 0 ? storedId : `${lexemeId}-sense-${siblingIndex}`;
  const glosses = formsFromMultiLang(sense.gloss, vernacular)
    .map((form) => xmlGloss(form.lang, form.text))
    .join('');
  const definitionForms = formsFromMultiLang(sense.definition, vernacular);
  const definition =
    definitionForms.length > 0 ? `<definition>${xmlFormList(definitionForms)}</definition>` : '';
  const category = sense.category?.trim() ?? '';
  const grammaticalInfo =
    category.length > 0 ? `<grammatical-info value="${escapeXml(category)}"/>` : '';
  const examples = (sense.examples ?? [])
    .flatMap((example) => {
      const source = example.source.trim();
      if (source.length === 0) return [];
      const translation = example.translation?.trim() ?? '';
      const translationXml =
        translation.length > 0
          ? `<translation>${xmlForm(vernacular, translation)}</translation>`
          : '';
      return [`<example>${xmlForm(vernacular, source)}${translationXml}</example>`];
    })
    .join('');
  const scientificName = sense.scientificName?.trim() ?? '';
  const scientificNameXml =
    scientificName.length > 0
      ? `<field type="scientific-name">${xmlForm('und', scientificName)}</field>`
      : '';
  const nested = liftSenseChildren(all, senseId)
    .map((child, index) => serializeSenseNode('subsense', lexemeId, child, index, vernacular, all))
    .join('');
  return `<${tag} id="${escapeXml(senseId)}" order="${siblingIndex}">${grammaticalInfo}${glosses}${definition}${examples}${scientificNameXml}${nested}</${tag}>`;
}

function serializeEntry(lexeme: LexemeDocType): string | null {
  const vernacular = vernacularLang(lexeme);
  const lemmaForms = formsFromMultiLang(lexeme.lemma, vernacular);
  if (lemmaForms.length === 0) return null;
  const attrs = [`id="${escapeXml(lexeme.id)}"`];
  const created = lexeme.createdAt.trim();
  const updated = lexeme.updatedAt.trim();
  if (created.length > 0) attrs.push(`dateCreated="${escapeXml(created)}"`);
  if (updated.length > 0) attrs.push(`dateModified="${escapeXml(updated)}"`);
  const citation = lexeme.citationForm?.trim() ?? '';
  const citationXml =
    citation.length > 0 ? `<citation>${xmlForm(vernacular, citation)}</citation>` : '';
  const pronunciation = lexeme.pronunciation?.trim() ?? '';
  const pronunciationXml =
    pronunciation.length > 0
      ? `<pronunciation>${xmlForm('und-fonipa', pronunciation)}</pronunciation>`
      : '';
  const etymologyForm = lexeme.etymology?.form.trim() ?? '';
  const etymologyGloss = lexeme.etymology?.gloss?.trim() ?? '';
  const etymologySource = lexeme.etymology?.sourceLanguage?.trim() ?? '';
  const etymologyTrait =
    etymologySource.length > 0
      ? `<trait name="languages" value="${escapeXml(etymologySource)}"/>`
      : '';
  const etymologyGlossXml = etymologyGloss.length > 0 ? xmlGloss('und', etymologyGloss) : '';
  const etymologyXml =
    etymologyForm.length > 0
      ? `<etymology>${etymologyTrait}${xmlForm('und', etymologyForm)}${etymologyGlossXml}</etymology>`
      : '';
  const literalMeaning = lexeme.literalMeaning?.trim() ?? '';
  const literalMeaningXml =
    literalMeaning.length > 0
      ? `<field type="literal-meaning">${xmlForm('und', literalMeaning)}</field>`
      : '';
  const summaryDefinition = lexeme.summaryDefinition?.trim() ?? '';
  const summaryDefinitionXml =
    summaryDefinition.length > 0
      ? `<field type="summary-definition">${xmlForm('und', summaryDefinition)}</field>`
      : '';
  const morphType = (lexeme.morphemeType ?? lexeme.lexemeType)?.trim() ?? '';
  const morphTrait =
    morphType.length > 0 ? `<trait name="morph-type" value="${escapeXml(morphType)}"/>` : '';
  const notes = formsFromMultiLang(lexeme.notes, vernacular);
  const noteXml = notes.length > 0 ? `<note>${xmlFormList(notes)}</note>` : '';
  const bibliography = lexeme.bibliography?.trim() ?? '';
  const bibliographyXml =
    bibliography.length > 0
      ? `<note type="bibliography">${xmlForm('und', bibliography)}</note>`
      : '';
  const restrictions = lexeme.restrictions?.trim() ?? '';
  const restrictionsXml =
    restrictions.length > 0
      ? `<note type="restrictions">${xmlForm('und', restrictions)}</note>`
      : '';
  const senses = liftSenseRoots(lexeme.senses)
    .map((sense, index) =>
      serializeSenseNode('sense', lexeme.id, sense, index, vernacular, lexeme.senses),
    )
    .join('');
  const variants = (lexeme.forms ?? [])
    .flatMap((form) => {
      const formRows = formsFromMultiLang(
        form.transcription as MultiLangString | undefined,
        vernacular,
      );
      if (formRows.length === 0) return [];
      return [`<variant>${xmlFormList(formRows)}</variant>`];
    })
    .join('');
  return `<entry ${attrs.join(' ')}><lexical-unit>${xmlFormList(lemmaForms)}</lexical-unit>${citationXml}${pronunciationXml}${etymologyXml}${literalMeaningXml}${summaryDefinitionXml}${morphTrait}${noteXml}${bibliographyXml}${restrictionsXml}${senses}${variants}</entry>`;
}

export function serializeLexemesToLift(lexemes: LexemeDocType[]): string | null {
  const entries = lexemes
    .map((lexeme) => serializeEntry(lexeme))
    .filter((entry): entry is string => entry !== null);
  if (entries.length === 0) return null;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<lift version="${LIFT_VERSION}" producer="${LIFT_PRODUCER}">${entries.join('')}</lift>\n`;
}

export function downloadLexiconLift(xml: string): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return false;
  }
  const blob = new Blob([xml], { type: LIFT_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = LIFT_FILENAME;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}

export function exportLexemesAsLift(lexemes: LexemeDocType[]): LexiconLiftExportResult {
  const xml = serializeLexemesToLift(lexemes);
  if (xml === null) return { ok: false, reason: 'empty' };
  if (!downloadLexiconLift(xml)) return { ok: false, reason: 'download-unavailable' };
  return { ok: true, xml };
}
