/**
 * FLEx (.flextext) import/export service.
 *
 * This is a pragmatic baseline implementation that supports:
 * - phrase-level transcription (item[type=txt])
 * - phrase-level translation/gloss (item[type=gls])
 * - word-level segmentation (word/item[type=txt])
 * - morpheme-level form + gloss (morph/item[type=txt|gls])
 */

import type {
  LayerDocType,
  LayerSegmentViewDocType,
  LayerUnitContentDocType,
  LayerUnitContentViewDocType,
  LayerUnitDocType,
  UnitTokenDocType,
  UnitMorphemeDocType,
  OrthographyDocType,
} from '../db';
import type { InterchangeLoss } from '../utils/interchangeLossReport';
import type { OrthographyInteropMetadata } from '../utils/orthographyInteropMetadata';
import { resolveOrthographyRenderPolicy } from '../utils/layerDisplayStyle';
import {
  stripPlainTextBidiIsolation,
  wrapPlainTextWithBidiIsolation,
} from '../utils/bidiPlainText';
import { readEnglishFallbackMultiLangLabel } from '../utils/multiLangLabels';

type TimelineInteropMetadata = Pick<
  OrthographyInteropMetadata,
  'timelineMode' | 'logicalDurationSec' | 'timebaseLabel'
>;

// ── Types ───────────────────────────────────────────────────

export interface FlexExportInput {
  units: LayerUnitDocType[];
  layers: LayerDocType[];
  translations: LayerUnitContentViewDocType[];
  orthographies?: OrthographyDocType[];
  tokens?: UnitTokenDocType[];
  morphemes?: UnitMorphemeDocType[];
  languageTag?: string;
  /** 逻辑时间元数据（文献项目导出声明）| Logical timeline metadata for document-mode export */
  timelineMetadata?: TimelineInteropMetadata;
  /** 独立层 segment 数据 | Independent layer segment data */
  segmentsByLayer?: Map<string, LayerSegmentViewDocType[]>;
  /** segment 内容按 layerId → segmentId 索引 | Segment content indexed by layerId → segmentId */
  segmentContents?: Map<string, Map<string, LayerUnitContentDocType>>;
}

export interface FlexImportResult {
  /** 项目级逻辑时间元数据 | Project-level logical timeline metadata */
  timelineMetadata?: TimelineInteropMetadata;
  units: Array<{
    startTime: number;
    endTime: number;
    transcription: string;
    /** FLEx phrase guid used to align phraseGlosses (not index order). */
    phraseId?: string;
    /** Present only when phrase@guid is non-empty. Synthetic pN keys are not stable ids. */
    annotationId?: string;
    tokens?: Array<{
      form: Record<string, string>;
      gloss?: Record<string, string>;
      pos?: string;
      morphemes?: Array<{
        form: Record<string, string>;
        gloss?: Record<string, string>;
        pos?: string;
      }>;
    }>;
  }>;
  /** phrase-level gls items keyed by phrase guid (from primary interlinear-text) */
  phraseGlosses: Map<string, string>;
  /**
   * Phrase gls rows after the first writing system, plus every lit row.
   * The first gls language stays in phraseGlosses so the import handler can keep the name `FLEx Gloss`.
   */
  translationTiers?: Map<
    string,
    Array<{ startTime: number; endTime: number; text: string; annotationRef?: string }>
  >;
  /** phrase@speaker values, excluding a blank speaker and `***`. */
  participants?: string[];
  /** interlinear-text title items, keyed by item@lang. */
  documentTitle?: Record<string, string>;
  userNotes?: Array<{
    startTime: number;
    endTime: number;
    text: string;
    annotationRef?: string;
    targetType?: 'unit' | 'text';
    category?: 'comment' | 'fieldwork';
  }>;
  /**
   * Additional `<interlinear-text>` blocks after the first, keyed by title/guid.
   * Prevents flattening secondary layers into primary units.
   */
  additionalTiers: Map<
    string,
    Array<{
      startTime: number;
      endTime: number;
      text: string;
      tokens?: FlexImportResult['units'][number]['tokens'];
    }>
  >;
  /** Source language tag extracted from item[@type=txt]@lang | 从 txt 元素提取的源语言 */
  sourceLanguage?: string;
  /** Title of the first interlinear-text. Word and morph rows are not tiers. */
  transcriptionTierName?: string;
  /** Gloss language tag extracted from item[@type=gls]@lang | 从 gls 元素提取的翻译语言 */
  glossLanguage?: string;
  /** Losses known at parse time. */
  losses?: InterchangeLoss[];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getText(el: Element | null | undefined): string {
  return el?.textContent?.trim() ?? '';
}

const FLEX_OMIT_ITEM_TYPES = new Set(['cf', 'hn', 'varianttypes', 'text-is-translation']);

function flexTimeToSeconds(raw: string | null): number {
  const value = parseFloat(raw ?? '');
  if (!Number.isFinite(value)) return 0;
  return value / 1000;
}

function flexOffsetMs(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0';
  return String(Math.round(seconds * 1000));
}

function itemLang(el: Element | undefined): string {
  const lang = el?.getAttribute('lang')?.trim() ?? '';
  return lang.length > 0 ? lang : 'und';
}

function glossRecord(el: Element | undefined, text: string): Record<string, string> | undefined {
  if (text.length === 0) return undefined;
  return { [itemLang(el)]: text };
}

function glossExport(
  gloss: Record<string, string> | undefined,
): { lang: string; text: string } | undefined {
  if (!gloss) return undefined;
  for (const [lang, text] of Object.entries(gloss)) {
    if (text.trim().length > 0) return { lang, text };
  }
  return undefined;
}

function itemsOf(parent: Element): Element[] {
  return Array.from(parent.querySelectorAll(':scope > item'));
}

function buildTimelineAttributeFragment(timelineMetadata?: TimelineInteropMetadata): string {
  if (!timelineMetadata) return '';
  return [
    timelineMetadata.timelineMode
      ? ` jieyu_timeline_mode="${escapeXml(timelineMetadata.timelineMode)}"`
      : '',
    timelineMetadata.logicalDurationSec !== undefined
      ? ` jieyu_logical_duration_sec="${escapeXml(String(timelineMetadata.logicalDurationSec))}"`
      : '',
    timelineMetadata.timebaseLabel
      ? ` jieyu_timebase_label="${escapeXml(timelineMetadata.timebaseLabel)}"`
      : '',
  ].join('');
}

function readTimelineMetadataFromAttributes(
  element: Element | null,
): TimelineInteropMetadata | undefined {
  if (!element) return undefined;
  const timelineModeAttr = element.getAttribute('jieyu_timeline_mode');
  const timelineMode =
    timelineModeAttr === 'document' || timelineModeAttr === 'media' ? timelineModeAttr : undefined;
  const logicalDurationRaw = element.getAttribute('jieyu_logical_duration_sec');
  const logicalDurationSec =
    logicalDurationRaw !== null && Number.isFinite(Number(logicalDurationRaw))
      ? Number(logicalDurationRaw)
      : undefined;
  const timebaseLabel = element.getAttribute('jieyu_timebase_label')?.trim() || undefined;
  if (!timelineMode && logicalDurationSec === undefined && !timebaseLabel) return undefined;
  return {
    ...(timelineMode ? { timelineMode } : {}),
    ...(logicalDurationSec !== undefined ? { logicalDurationSec } : {}),
    ...(timebaseLabel ? { timebaseLabel } : {}),
  };
}

// ── Export ───────────────────────────────────────────────────

export function exportToFlextext(input: FlexExportInput): string {
  const {
    units,
    layers,
    translations,
    orthographies,
    tokens = [],
    morphemes = [],
    languageTag = 'und',
    timelineMetadata,
    segmentsByLayer,
    segmentContents,
  } = input;
  const sorted = [...units].sort((a, b) => a.startTime - b.startTime);
  const defaultTranscriptionLayer =
    layers.find((l) => l.layerType === 'transcription' && l.isDefault) ??
    layers.find((l) => l.layerType === 'transcription');
  const firstTranslationLayer = layers.find((l) => l.layerType === 'translation');
  const wrapLayerText = (text: string, layer?: LayerDocType) => {
    if (!layer?.languageId) return text;
    const renderPolicy = resolveOrthographyRenderPolicy(
      layer.languageId,
      orthographies,
      layer.orthographyId,
    );
    return wrapPlainTextWithBidiIsolation(text, renderPolicy);
  };

  const tokensByUnitId = new Map<string, UnitTokenDocType[]>();
  for (const token of tokens) {
    const list = tokensByUnitId.get(token.unitId) ?? [];
    list.push(token);
    tokensByUnitId.set(token.unitId, list);
  }
  for (const list of tokensByUnitId.values()) {
    list.sort((a, b) => a.tokenIndex - b.tokenIndex);
  }

  const morphemesByTokenId = new Map<string, UnitMorphemeDocType[]>();
  for (const morph of morphemes) {
    const list = morphemesByTokenId.get(morph.tokenId) ?? [];
    list.push(morph);
    morphemesByTokenId.set(morph.tokenId, list);
  }
  for (const list of morphemesByTokenId.values()) {
    list.sort((a, b) => a.morphemeIndex - b.morphemeIndex);
  }

  const defaultTranscriptionLayerId = defaultTranscriptionLayer?.id;

  const transcriptionByUnitId = new Map<string, string>();
  if (defaultTranscriptionLayerId) {
    for (const t of translations) {
      const unitId = t.unitId?.trim();
      if (
        unitId &&
        t.layerId === defaultTranscriptionLayerId &&
        t.modality === 'text' &&
        typeof t.text === 'string'
      ) {
        transcriptionByUnitId.set(unitId, t.text);
      }
    }
  }

  // Pick first translation layer as phrase-level gls export target
  const firstTranslationLayerId = firstTranslationLayer?.id;

  const phraseXml = sorted
    .map((u, i) => {
      const phraseId = `p${i + 1}`;
      const txt = wrapLayerText(
        transcriptionByUnitId.get(u.id) ?? u.transcription?.default ?? '',
        defaultTranscriptionLayer,
      );
      const gls = firstTranslationLayerId
        ? (translations.find(
            (t) =>
              t.unitId === u.id && t.layerId === firstTranslationLayerId && t.modality === 'text',
          )?.text ?? '')
        : '';
      const wrappedGls = wrapLayerText(gls, firstTranslationLayer);

      const unitTokens = tokensByUnitId.get(u.id) ?? [];
      const wordsXml =
        unitTokens.length > 0
          ? `\n              <words>\n${unitTokens
              .map((w, wi) => {
                const wordId = `${phraseId}_w${wi + 1}`;
                const wordTxt = w.form.default ?? Object.values(w.form)[0] ?? '';
                const wordGloss = glossExport(w.gloss);
                const morphs = morphemesByTokenId.get(w.id) ?? [];
                const morphXml =
                  morphs.length > 0
                    ? `\n                  <morphemes>\n${morphs
                        .map((m, mi) => {
                          const morphId = `${wordId}_m${mi + 1}`;
                          const mTxt = m.form.default ?? Object.values(m.form)[0] ?? '';
                          const morphGloss = glossExport(m.gloss);
                          return `                    <morph guid="${morphId}">\n                      <item type="txt" lang="${escapeXml(languageTag)}">${escapeXml(mTxt)}</item>${morphGloss ? `\n                      <item type="gls" lang="${escapeXml(morphGloss.lang)}">${escapeXml(morphGloss.text)}</item>` : ''}${m.pos ? `\n                      <item type="msa">${escapeXml(m.pos)}</item>` : ''}\n                    </morph>`;
                        })
                        .join('\n')}\n                  </morphemes>`
                    : '';
                return `                <word guid="${wordId}">\n                  <item type="txt" lang="${escapeXml(languageTag)}">${escapeXml(wordTxt)}</item>${wordGloss ? `\n                  <item type="gls" lang="${escapeXml(wordGloss.lang)}">${escapeXml(wordGloss.text)}</item>` : ''}${w.pos ? `\n                  <item type="pos">${escapeXml(w.pos)}</item>` : ''}${morphXml}\n                </word>`;
              })
              .join('\n')}\n              </words>`
          : '';

      return `            <phrase guid="${phraseId}" begin-time-offset="${flexOffsetMs(u.startTime)}" end-time-offset="${flexOffsetMs(u.endTime)}">\n              <item type="txt" lang="${escapeXml(languageTag)}">${escapeXml(txt)}</item>${wrappedGls ? `\n              <item type="gls" lang="en">${escapeXml(wrappedGls)}</item>` : ''}${wordsXml}\n            </phrase>`;
    })
    .join('\n');

  // 所有含 segment 数据的附加层：每层生成一个额外的 interlinear-text | All additional layers with segment data: one extra interlinear-text per layer
  const additionalIts: string[] = [];
  if (segmentsByLayer) {
    for (const layer of layers) {
      if (layer.id === layers.find((l) => l.layerType === 'transcription' && l.isDefault)?.id)
        continue;
      const segs = segmentsByLayer.get(layer.id);
      if (!segs || segs.length === 0) continue;
      const contentMap = segmentContents?.get(layer.id);
      const tierName = readEnglishFallbackMultiLangLabel(layer.name) ?? layer.key;
      const sortedSegs = [...segs].sort((a, b) => a.startTime - b.startTime);
      const segPhrasesXml = sortedSegs
        .map((seg, i) => {
          const txt = wrapLayerText(contentMap?.get(seg.id)?.text ?? '', layer);
          const phraseId = `${layer.id}_p${i + 1}`;
          const segTokens = tokensByUnitId.get(seg.id) ?? [];
          const wordsXml =
            segTokens.length > 0
              ? `\n              <words>\n${segTokens
                  .map((w, wi) => {
                    const wordId = `${phraseId}_w${wi + 1}`;
                    const wordTxt = w.form.default ?? Object.values(w.form)[0] ?? '';
                    const wordGloss = glossExport(w.gloss);
                    const morphs = morphemesByTokenId.get(w.id) ?? [];
                    const morphXml =
                      morphs.length > 0
                        ? `\n                  <morphemes>\n${morphs
                            .map((m, mi) => {
                              const morphId = `${wordId}_m${mi + 1}`;
                              const mTxt = m.form.default ?? Object.values(m.form)[0] ?? '';
                              const morphGloss = glossExport(m.gloss);
                              return `                    <morph guid="${morphId}">\n                      <item type="txt" lang="${escapeXml(languageTag)}">${escapeXml(mTxt)}</item>${morphGloss ? `\n                      <item type="gls" lang="${escapeXml(morphGloss.lang)}">${escapeXml(morphGloss.text)}</item>` : ''}${m.pos ? `\n                      <item type="msa">${escapeXml(m.pos)}</item>` : ''}\n                    </morph>`;
                            })
                            .join('\n')}\n                  </morphemes>`
                        : '';
                    return `                <word guid="${wordId}">\n                  <item type="txt" lang="${escapeXml(languageTag)}">${escapeXml(wordTxt)}</item>${wordGloss ? `\n                  <item type="gls" lang="${escapeXml(wordGloss.lang)}">${escapeXml(wordGloss.text)}</item>` : ''}${w.pos ? `\n                  <item type="pos">${escapeXml(w.pos)}</item>` : ''}${morphXml}\n                </word>`;
                  })
                  .join('\n')}\n              </words>`
              : '';
          return `            <phrase guid="${escapeXml(phraseId)}" begin-time-offset="${flexOffsetMs(seg.startTime)}" end-time-offset="${flexOffsetMs(seg.endTime)}">\n              <item type="txt" lang="${escapeXml(languageTag)}">${escapeXml(txt)}</item>${wordsXml}\n            </phrase>`;
        })
        .join('\n');
      additionalIts.push(
        `  <interlinear-text guid="${escapeXml(layer.id)}">\n    <item type="title" lang="en">${escapeXml(tierName)}</item>\n    <paragraphs>\n      <paragraph guid="pg_${escapeXml(layer.id)}">\n        <phrases>\n${segPhrasesXml}\n        </phrases>\n      </paragraph>\n    </paragraphs>\n  </interlinear-text>`,
      );
    }
  }

  const additionalItsXml = additionalIts.length > 0 ? `\n${additionalIts.join('\n')}` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<document version="2"${buildTimelineAttributeFragment(timelineMetadata)}>
  <interlinear-text guid="it1">
    <item type="title" lang="en">Jieyu Export</item>
    <paragraphs>
      <paragraph guid="pg1">
        <phrases>
${phraseXml}
        </phrases>
      </paragraph>
    </paragraphs>
  </interlinear-text>${additionalItsXml}
</document>
`;
}

// ── Import ───────────────────────────────────────────────────

function parseFlexPhrase(
  phrase: Element,
  index: number,
): {
  phraseId: string;
  stableGuid?: string;
  startTime: number;
  endTime: number;
  transcription: string;
  phraseGloss: string;
  sourceLang?: string;
  glossLang?: string;
  extraGlosses: Array<{ lang: string; text: string }>;
  literals: Array<{ lang: string; text: string }>;
  notes: Array<{ lang: string; text: string }>;
  speaker?: string;
  unmapped: string[];
  tokens?: FlexImportResult['units'][number]['tokens'];
} {
  const stableGuid = (phrase.getAttribute('guid') ?? '').trim();
  const phraseId = stableGuid.length > 0 ? stableGuid : `p${index + 1}`;
  const startTime = flexTimeToSeconds(phrase.getAttribute('begin-time-offset'));
  const endRaw = phrase.getAttribute('end-time-offset');
  const endTime = endRaw === null ? startTime : flexTimeToSeconds(endRaw);
  const speakerRaw = phrase.getAttribute('speaker')?.trim() ?? '';
  const speaker = speakerRaw.length > 0 && speakerRaw !== '***' ? speakerRaw : undefined;
  const phraseItems = itemsOf(phrase);
  const txtItem = phraseItems.find((el) => el.getAttribute('type') === 'txt');
  const glsItems = phraseItems.filter((el) => el.getAttribute('type') === 'gls');
  const sourceLang = txtItem?.getAttribute('lang') ?? undefined;
  const firstGloss = glsItems[0];
  const glossLang = firstGloss?.getAttribute('lang') ?? undefined;
  const transcription = stripPlainTextBidiIsolation(getText(txtItem));
  const phraseGloss = stripPlainTextBidiIsolation(getText(firstGloss));
  const extraGlosses = glsItems.slice(1).flatMap((el) => {
    const text = stripPlainTextBidiIsolation(getText(el));
    return text.length > 0 ? [{ lang: itemLang(el), text }] : [];
  });
  const literals = phraseItems.flatMap((el) => {
    if (el.getAttribute('type') !== 'lit') return [];
    const text = stripPlainTextBidiIsolation(getText(el));
    return text.length > 0 ? [{ lang: itemLang(el), text }] : [];
  });
  const notes = phraseItems.flatMap((el) => {
    if (el.getAttribute('type') !== 'note') return [];
    const text = stripPlainTextBidiIsolation(getText(el));
    return text.length > 0 ? [{ lang: itemLang(el), text }] : [];
  });
  const unmapped = phraseItems.flatMap((el) => {
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    if (!FLEX_OMIT_ITEM_TYPES.has(type) || getText(el).length === 0) return [];
    return [type];
  });

  const words: Array<{
    form: Record<string, string>;
    gloss?: Record<string, string>;
    pos?: string;
    morphemes?: Array<{
      form: Record<string, string>;
      gloss?: Record<string, string>;
      pos?: string;
    }>;
  }> = [];
  let pendingPunct = '';
  phrase.querySelectorAll(':scope > words > word').forEach((wordEl) => {
    const wordItems = itemsOf(wordEl);
    const wordTxtItem = wordItems.find((el) => el.getAttribute('type') === 'txt');
    const wordGlsItem = wordItems.find((el) => el.getAttribute('type') === 'gls');
    const wordPosItem =
      wordItems.find((el) => el.getAttribute('type') === 'pos') ??
      wordItems.find((el) => el.getAttribute('type') === 'ps');
    const wordText = stripPlainTextBidiIsolation(getText(wordTxtItem));
    const wordGloss = glossRecord(wordGlsItem, stripPlainTextBidiIsolation(getText(wordGlsItem)));
    const wordPos = getText(wordPosItem);
    const wordPunct = wordItems
      .filter((el) => el.getAttribute('type') === 'punct')
      .map((el) => getText(el))
      .join('');
    for (const el of wordItems) {
      const type = (el.getAttribute('type') ?? '').toLowerCase();
      if (FLEX_OMIT_ITEM_TYPES.has(type) && getText(el).length > 0) unmapped.push(type);
    }
    if (wordText.length === 0 && wordPunct.length > 0 && !wordGloss && wordPos.length === 0) {
      const previous = words[words.length - 1];
      if (previous) previous.form.default = `${previous.form.default ?? ''}${wordPunct}`;
      else pendingPunct += wordPunct;
      return;
    }

    const morphemes = Array.from(wordEl.querySelectorAll(':scope > morphemes > morph')).map(
      (morphEl) => {
        const morphItems = itemsOf(morphEl);
        const morphTxtItem = morphItems.find((el) => el.getAttribute('type') === 'txt');
        const morphGlsItem = morphItems.find((el) => el.getAttribute('type') === 'gls');
        const morphPosItem =
          morphItems.find((el) => el.getAttribute('type') === 'msa') ??
          morphItems.find((el) => el.getAttribute('type') === 'pos') ??
          morphItems.find((el) => el.getAttribute('type') === 'ps');
        const mTxt = stripPlainTextBidiIsolation(getText(morphTxtItem));
        const mGls = glossRecord(morphGlsItem, stripPlainTextBidiIsolation(getText(morphGlsItem)));
        const mPos = getText(morphPosItem);
        for (const el of morphItems) {
          const type = (el.getAttribute('type') ?? '').toLowerCase();
          if (FLEX_OMIT_ITEM_TYPES.has(type) && getText(el).length > 0) unmapped.push(type);
        }
        return {
          form: { default: mTxt },
          ...(mGls ? { gloss: mGls } : {}),
          ...(mPos.length > 0 ? { pos: mPos } : {}),
        };
      },
    );

    const formText = `${pendingPunct}${wordText}${wordPunct}`;
    pendingPunct = '';
    words.push({
      form: { default: formText },
      ...(wordGloss ? { gloss: wordGloss } : {}),
      ...(wordPos.length > 0 ? { pos: wordPos } : {}),
      ...(morphemes.length > 0 ? { morphemes } : {}),
    });
  });

  const tokens =
    words.length > 0
      ? words.map((word) => ({
          form: word.form,
          ...(word.gloss ? { gloss: word.gloss } : {}),
          ...(word.pos ? { pos: word.pos } : {}),
          ...(Array.isArray(word.morphemes)
            ? {
                morphemes: word.morphemes.map((morph) => ({
                  form: morph.form,
                  ...(morph.gloss ? { gloss: morph.gloss } : {}),
                  ...(morph.pos ? { pos: morph.pos } : {}),
                })),
              }
            : {}),
        }))
      : undefined;

  return {
    phraseId,
    ...(stableGuid.length > 0 ? { stableGuid } : {}),
    startTime,
    endTime,
    transcription,
    phraseGloss,
    extraGlosses,
    literals,
    notes,
    ...(speaker ? { speaker } : {}),
    unmapped,
    ...(sourceLang ? { sourceLang } : {}),
    ...(glossLang ? { glossLang } : {}),
    ...(tokens && tokens.length > 0 ? { tokens } : {}),
  };
}

export function importFromFlextext(xmlString: string): FlexImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`flextext XML parse failed: ${parseError.textContent}`);
  }

  const units: FlexImportResult['units'] = [];
  const phraseGlosses = new Map<string, string>();
  const translationTiers: NonNullable<FlexImportResult['translationTiers']> = new Map();
  const userNotes: NonNullable<FlexImportResult['userNotes']> = [];
  const participantSet = new Set<string>();
  const documentTitle: Record<string, string> = {};
  const unmapped = new Set<string>();
  const additionalTiers = new Map<
    string,
    Array<{
      startTime: number;
      endTime: number;
      text: string;
      tokens?: FlexImportResult['units'][number]['tokens'];
    }>
  >();
  const timelineMetadata = readTimelineMetadataFromAttributes(doc.documentElement);
  let sourceLanguage: string | undefined;
  let glossLanguage: string | undefined;
  let transcriptionTierName: string | undefined;

  const pushTranslation = (
    tierName: string,
    row: { startTime: number; endTime: number; text: string; annotationRef?: string },
  ) => {
    const list = translationTiers.get(tierName) ?? [];
    list.push(row);
    translationTiers.set(tierName, list);
  };
  const recordPhrase = (parsed: ReturnType<typeof parseFlexPhrase>) => {
    if (parsed.speaker) participantSet.add(parsed.speaker);
    for (const name of parsed.unmapped) unmapped.add(name);
    const annotationRef = parsed.stableGuid;
    for (const gloss of parsed.extraGlosses) {
      pushTranslation(`FLEx Gloss (${gloss.lang})`, {
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        text: gloss.text,
        ...(annotationRef ? { annotationRef } : {}),
      });
    }
    for (const literal of parsed.literals) {
      pushTranslation(`FLEx Literal (${literal.lang})`, {
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        text: literal.text,
        ...(annotationRef ? { annotationRef } : {}),
      });
    }
    for (const note of parsed.notes) {
      userNotes.push({
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        text: note.text,
        targetType: 'unit',
        category: 'comment',
        ...(annotationRef ? { annotationRef } : {}),
      });
    }
  };

  const interlinearTexts = Array.from(doc.querySelectorAll('interlinear-text'));
  const phraseRoots =
    interlinearTexts.length > 0
      ? interlinearTexts
      : ([doc.documentElement].filter(Boolean) as Element[]);

  phraseRoots.forEach((root, rootIndex) => {
    const headerItems = itemsOf(root);
    const titleItem = headerItems.find((el) => el.getAttribute('type') === 'title');
    if (rootIndex === 0) {
      for (const el of headerItems) {
        if (el.getAttribute('type') !== 'title') continue;
        const text = getText(el);
        if (text.length === 0) continue;
        const lang = itemLang(el);
        if (!documentTitle[lang]) documentTitle[lang] = text;
      }
    }
    for (const el of headerItems) {
      const type = (el.getAttribute('type') ?? '').toLowerCase();
      const text = getText(el);
      if (text.length === 0) continue;
      if (type === 'source') {
        userNotes.push({
          startTime: 0,
          endTime: 0,
          text,
          targetType: 'text',
          category: 'fieldwork',
        });
      } else if (type === 'comment' || type === 'description' || type === 'title-abbreviation') {
        userNotes.push({ startTime: 0, endTime: 0, text, targetType: 'text', category: 'comment' });
      } else if (FLEX_OMIT_ITEM_TYPES.has(type)) {
        unmapped.add(type);
      }
    }
    const tierName =
      getText(titleItem) ||
      root.getAttribute('guid') ||
      (rootIndex === 0 ? 'primary' : `interlinear_${rootIndex + 1}`);
    const phrases = Array.from(root.querySelectorAll('phrase'));

    if (rootIndex === 0) {
      transcriptionTierName = tierName;
      phrases.forEach((phrase, index) => {
        const parsed = parseFlexPhrase(phrase, index);
        recordPhrase(parsed);
        if (!sourceLanguage && parsed.sourceLang) sourceLanguage = parsed.sourceLang;
        if (!glossLanguage && parsed.glossLang) glossLanguage = parsed.glossLang;
        if (parsed.phraseGloss) phraseGlosses.set(parsed.phraseId, parsed.phraseGloss);
        units.push({
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          transcription: parsed.transcription,
          phraseId: parsed.phraseId,
          ...(parsed.stableGuid ? { annotationId: parsed.stableGuid } : {}),
          ...(parsed.tokens ? { tokens: parsed.tokens } : {}),
        });
      });
      return;
    }

    const segments = phrases
      .map((phrase, index) => {
        const parsed = parseFlexPhrase(phrase, index);
        recordPhrase(parsed);
        return {
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          text: parsed.transcription,
          ...(parsed.tokens ? { tokens: parsed.tokens } : {}),
        };
      })
      .filter((segment) => segment.text.trim().length > 0);
    if (segments.length > 0) additionalTiers.set(tierName, segments);
  });

  const losses =
    unmapped.size > 0
      ? [{ code: 'unmapped-field' as const, name: [...unmapped].join(', ') }]
      : undefined;
  return {
    units,
    phraseGlosses,
    additionalTiers,
    ...(translationTiers.size > 0 ? { translationTiers } : {}),
    ...(participantSet.size > 0 ? { participants: [...participantSet] } : {}),
    ...(Object.keys(documentTitle).length > 0 ? { documentTitle } : {}),
    ...(userNotes.length > 0 ? { userNotes } : {}),
    ...(timelineMetadata ? { timelineMetadata } : {}),
    ...(transcriptionTierName ? { transcriptionTierName } : {}),
    ...(sourceLanguage !== undefined && { sourceLanguage }),
    ...(glossLanguage !== undefined && { glossLanguage }),
    ...(losses ? { losses } : {}),
  };
}

// ── File helper ──────────────────────────────────────────────

export function downloadFlextext(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.flextext') ? filename : `${filename}.flextext`;
  a.click();
  URL.revokeObjectURL(url);
}
