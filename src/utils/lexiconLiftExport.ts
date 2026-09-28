/**
 * LIFT 0.13 projection of DMLex entries. Lossy: one headword string, entry POS
 * copied onto each sense, subsenses nested from `subsense` relations.
 */
import type { DmlexRelation, DmlexSense } from '../db/dmlexTypes';
import { DMLEX_SUBSENSE } from '../db/dmlexTypes';
import type { LexemeEntryDoc } from '../db/types';

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

function langOrUnd(langCode: string | undefined): string {
  const trimmed = langCode?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : 'und';
}

function xmlForm(lang: string, text: string): string {
  return `<form lang="${escapeXml(lang)}"><text>${escapeXml(text)}</text></form>`;
}

function childrenOf(senseId: string, relations: readonly DmlexRelation[]): string[] {
  return relations.flatMap((relation) => {
    if (relation.type !== DMLEX_SUBSENSE || relation.members.length < 2) return [];
    if (relation.members[0]?.ref !== senseId) return [];
    const child = relation.members[1]?.ref ?? '';
    return child.length > 0 ? [child] : [];
  });
}

function senseXml(
  sense: DmlexSense,
  senses: readonly DmlexSense[],
  relations: readonly DmlexRelation[],
  pos: string,
  tag: 'sense' | 'subsense',
): string {
  const id = sense.id ?? '';
  const glosses = (sense.headwordTranslations ?? [])
    .map((item) => {
      const lang = langOrUnd(item.langCode);
      return `<gloss lang="${escapeXml(lang)}"><text>${escapeXml(item.text)}</text></gloss>`;
    })
    .join('');
  const definitions = (sense.definitions ?? [])
    .map((item) => `<definition>${xmlForm('und', item.text)}</definition>`)
    .join('');
  const explanations = (sense.headwordExplanations ?? [])
    .map((item) => {
      const lang = langOrUnd(item.langCode);
      return `<definition>${xmlForm(lang, item.text)}</definition>`;
    })
    .join('');
  const examples = (sense.examples ?? [])
    .map((example) => {
      const translations = (example.exampleTranslations ?? [])
        .map((item) => {
          const lang = langOrUnd(item.langCode);
          return `<translation>${xmlForm(lang, item.text)}</translation>`;
        })
        .join('');
      return `<example>${xmlForm('und', example.text)}${translations}</example>`;
    })
    .join('');
  const labels = (sense.labels ?? [])
    .map((label) => `<trait name="semantic-domain-ddp4" value="${escapeXml(label)}"/>`)
    .join('');
  const grammatical = pos.length > 0 ? `<grammatical-info value="${escapeXml(pos)}"/>` : '';
  const nested = childrenOf(id, relations)
    .map((childId) => senses.find((row) => row.id === childId))
    .filter((row): row is DmlexSense => Boolean(row))
    .map((row) => senseXml(row, senses, relations, pos, 'subsense'))
    .join('');
  const idAttr = id.length > 0 ? ` id="${escapeXml(id)}"` : '';
  return `<${tag}${idAttr}>${grammatical}${glosses}${definitions}${explanations}${examples}${labels}${nested}</${tag}>`;
}

export function serializeLexemesToLift(
  lexemes: readonly LexemeEntryDoc[],
  relations: readonly DmlexRelation[] = [],
): string {
  const entries = lexemes
    .map((lexeme) => {
      const entry = lexeme.entry;
      const senses = entry.senses ?? [];
      const childIds = new Set(
        relations.flatMap((relation) =>
          relation.type === DMLEX_SUBSENSE && relation.members.length >= 2
            ? [relation.members[1]?.ref ?? '']
            : [],
        ),
      );
      const roots = senses.filter((sense) => {
        const senseId = sense.id ?? '';
        return senseId.length === 0 || !childIds.has(senseId);
      });
      const pos = entry.partsOfSpeech?.[0] ?? '';
      const senseBody = (roots.length > 0 ? roots : senses)
        .map((sense) => senseXml(sense, senses, relations, pos, 'sense'))
        .join('');
      const variants = (entry.inflectedForms ?? [])
        .map((form) => `<variant>${xmlForm('und', form.text)}</variant>`)
        .join('');
      const pronunciation = entry.pronunciations?.[0]?.transcriptions?.[0]?.text ?? '';
      const pronunciationXml =
        pronunciation.length > 0
          ? `<pronunciation>${xmlForm('und', pronunciation)}</pronunciation>`
          : '';
      const etymon = entry.etymologies?.[0]?.etymons?.[0];
      const etymonText = etymon?.etymonUnits?.[0]?.text ?? '';
      const etymonLang = etymon?.etymonUnits?.[0]?.langCode ?? 'und';
      const etymologyXml =
        etymonText.length > 0
          ? `<etymology type="proto" source="${escapeXml(etymonLang)}">${xmlForm(etymonLang, etymonText)}</etymology>`
          : '';
      return `<entry id="${escapeXml(lexeme.id)}"><lexical-unit>${xmlForm('und', entry.headword)}</lexical-unit>${variants}${pronunciationXml}${etymologyXml}${senseBody}</entry>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<lift version="${LIFT_VERSION}" producer="${LIFT_PRODUCER}">${entries}</lift>\n`;
}

export function downloadLexiconLift(xml: string): LexiconLiftExportResult {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return { ok: false, reason: 'download-unavailable' };
  }
  const blob = new Blob([xml], { type: LIFT_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = LIFT_FILENAME;
  link.click();
  URL.revokeObjectURL(url);
  return { ok: true, xml };
}

export function exportLexemesAsLift(
  lexemes: readonly LexemeEntryDoc[],
  relations: readonly DmlexRelation[] = [],
): LexiconLiftExportResult {
  if (lexemes.length === 0) return { ok: false, reason: 'empty' };
  return downloadLexiconLift(serializeLexemesToLift(lexemes, relations));
}
