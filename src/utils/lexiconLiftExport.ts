/**
 * LIFT 0.13 projection of DMLex entries. Lossy: one headword string, entry POS
 * copied onto each sense, subsenses nested from `subsense` relations.
 */
import type { DmlexRelation, DmlexSense } from '../db/dmlexTypes';
import { DMLEX_SUBSENSE } from '../db/dmlexTypes';
import type { LexemeEntryDoc } from '../db/types';
import { escapeXml, finalizeXmlExport, type XmlSanitizeReport } from './xmlSafeText';

export const LIFT_VERSION = '0.13';
export const LIFT_PRODUCER = 'Jieyu';
export const LIFT_MIME = 'application/xml';
export const LIFT_FILENAME = 'jieyu-lexicon.lift';

export type LexiconLiftExportResult =
  | { ok: true; xml: string; xmlSanitized: XmlSanitizeReport | null }
  | { ok: false; reason: 'empty' | 'download-unavailable' };

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
  objectLang: string,
): string {
  const id = sense.id ?? '';
  const glosses = (sense.headwordTranslations ?? [])
    .map((item) => {
      const lang = langOrUnd(item.langCode);
      return `<gloss lang="${escapeXml(lang)}"><text>${escapeXml(item.text)}</text></gloss>`;
    })
    .join('');
  const definitions = (sense.definitions ?? [])
    .map((item) => `<definition>${xmlForm(objectLang, item.text)}</definition>`)
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
      return `<example>${xmlForm(objectLang, example.text)}${translations}</example>`;
    })
    .join('');
  const labels = (sense.labels ?? [])
    .map((label) => `<trait name="semantic-domain-ddp4" value="${escapeXml(label)}"/>`)
    .join('');
  const grammatical = pos.length > 0 ? `<grammatical-info value="${escapeXml(pos)}"/>` : '';
  const nested = childrenOf(id, relations)
    .map((childId) => senses.find((row) => row.id === childId))
    .filter((row): row is DmlexSense => Boolean(row))
    .map((row) => senseXml(row, senses, relations, pos, 'subsense', objectLang))
    .join('');
  const idAttr = id.length > 0 ? ` id="${escapeXml(id)}"` : '';
  return `<${tag}${idAttr}>${grammatical}${glosses}${definitions}${explanations}${examples}${labels}${nested}</${tag}>`;
}

/**
 * LIFT 对象语言：先用词典自己的语言，未知时用项目语言，都没有才是 'und'（JY-09）
 * LIFT object language: the dictionary's own language, else the project language, else 'und' (JY-09)
 */
export function resolveLiftObjectLang(
  resourceLang: string | undefined,
  projectLang: string | undefined,
): string {
  for (const candidate of [resourceLang, projectLang]) {
    const trimmed = candidate?.trim() ?? '';
    if (trimmed.length > 0 && trimmed !== 'und') return trimmed;
  }
  return 'und';
}

export type LiftSerializeOptions = {
  /**
   * 词典对象语言（DMLex resource.langCode），写到词头、变体、释义、例句和发音上；缺省才写 'und'（JY-09）
   * Dictionary object language (DMLex resource.langCode) for headwords, variants, definitions,
   * examples and pronunciations; 'und' only when unknown (JY-09)
   */
  langCode?: string;
  /** 删除 / 替换了 XML 非法字符时回调（JY-08）| Called when XML-illegal characters were replaced (JY-08) */
  onXmlSanitized?: (report: XmlSanitizeReport) => void;
};

export function serializeLexemesToLift(
  lexemes: readonly LexemeEntryDoc[],
  relations: readonly DmlexRelation[] = [],
  options: LiftSerializeOptions = {},
): string {
  const objectLang = langOrUnd(options.langCode);
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
        .map((sense) => senseXml(sense, senses, relations, pos, 'sense', objectLang))
        .join('');
      const variants = (entry.inflectedForms ?? [])
        .map((form) => `<variant>${xmlForm(objectLang, form.text)}</variant>`)
        .join('');
      const transcription = entry.pronunciations?.[0]?.transcriptions?.[0];
      const pronunciation = transcription?.text ?? '';
      const pronunciationLang = langOrUnd(transcription?.scheme ?? objectLang);
      const pronunciationXml =
        pronunciation.length > 0
          ? `<pronunciation>${xmlForm(pronunciationLang, pronunciation)}</pronunciation>`
          : '';
      const etymon = entry.etymologies?.[0]?.etymons?.[0];
      const etymonText = etymon?.etymonUnits?.[0]?.text ?? '';
      const etymonLang = etymon?.etymonUnits?.[0]?.langCode ?? 'und';
      const etymologyXml =
        etymonText.length > 0
          ? `<etymology type="proto" source="${escapeXml(etymonLang)}">${xmlForm(etymonLang, etymonText)}</etymology>`
          : '';
      return `<entry id="${escapeXml(lexeme.id)}"><lexical-unit>${xmlForm(objectLang, entry.headword)}</lexical-unit>${variants}${pronunciationXml}${etymologyXml}${senseBody}</entry>`;
    })
    .join('');
  return finalizeXmlExport(
    `<?xml version="1.0" encoding="UTF-8"?>\n<lift version="${LIFT_VERSION}" producer="${LIFT_PRODUCER}">${entries}</lift>\n`,
    options.onXmlSanitized,
  );
}

export function downloadLexiconLift(
  xml: string,
  xmlSanitized: XmlSanitizeReport | null = null,
): LexiconLiftExportResult {
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
  return { ok: true, xml, xmlSanitized };
}

export function exportLexemesAsLift(
  lexemes: readonly LexemeEntryDoc[],
  relations: readonly DmlexRelation[] = [],
  langCode?: string,
): LexiconLiftExportResult {
  if (lexemes.length === 0) return { ok: false, reason: 'empty' };
  let xmlSanitized: XmlSanitizeReport | null = null;
  const xml = serializeLexemesToLift(lexemes, relations, {
    ...(langCode !== undefined ? { langCode } : {}),
    onXmlSanitized: (report) => {
      xmlSanitized = report;
    },
  });
  return downloadLexiconLift(xml, xmlSanitized);
}
