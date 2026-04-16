/**
 * FLEx (.flextext) import/export service.
 *
 * This is a pragmatic baseline implementation that supports:
 * - phrase-level transcription (item[type=txt])
 * - phrase-level translation/gloss (item[type=gls])
 * - word-level segmentation (word/item[type=txt])
 * - morpheme-level form + gloss (morph/item[type=txt|gls])
 */

import type { LayerDocType, LayerSegmentViewDocType, LayerUnitContentDocType, LayerUnitContentViewDocType, LayerUnitDocType, UnitTokenDocType, UnitMorphemeDocType, OrthographyDocType } from '../db';
import { resolveOrthographyRenderPolicy } from '../utils/layerDisplayStyle';
import { stripPlainTextBidiIsolation, wrapPlainTextWithBidiIsolation } from '../utils/bidiPlainText';
import { readEnglishFallbackMultiLangLabel } from '../utils/multiLangLabels';

// ── Types ───────────────────────────────────────────────────

export interface FlexExportInput {
  units: LayerUnitDocType[];
  layers: LayerDocType[];
  translations: LayerUnitContentViewDocType[];
  orthographies?: OrthographyDocType[];
  tokens?: UnitTokenDocType[];
  morphemes?: UnitMorphemeDocType[];
  languageTag?: string;
  /** 独立层 segment 数据 | Independent layer segment data */
  segmentsByLayer?: Map<string, LayerSegmentViewDocType[]>;
  /** segment 内容按 layerId → segmentId 索引 | Segment content indexed by layerId → segmentId */
  segmentContents?: Map<string, Map<string, LayerUnitContentDocType>>;
}

export interface FlexImportResult {
  units: Array<{
    startTime: number;
    endTime: number;
    transcription: string;
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
  /** phrase-level gls items keyed by generated phrase id */
  phraseGlosses: Map<string, string>;
  /** Source language tag extracted from item[@type=txt]@lang | 从 txt 元素提取的源语言 */
  sourceLanguage?: string;
  /** Gloss language tag extracted from item[@type=gls]@lang | 从 gls 元素提取的翻译语言 */
  glossLanguage?: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getText(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

// ── Export ───────────────────────────────────────────────────

export function exportToFlextext(input: FlexExportInput): string {
  const { units, layers, translations, orthographies, tokens = [], morphemes = [], languageTag = 'und', segmentsByLayer, segmentContents } = input;
  const sorted = [...units].sort((a, b) => a.startTime - b.startTime);
  const defaultTranscriptionLayer = layers.find((l) => l.layerType === 'transcription' && l.isDefault)
    ?? layers.find((l) => l.layerType === 'transcription');
  const firstTranslationLayer = layers.find((l) => l.layerType === 'translation');
  const wrapLayerText = (text: string, layer?: LayerDocType) => {
    if (!layer?.languageId) return text;
    const renderPolicy = resolveOrthographyRenderPolicy(layer.languageId, orthographies, layer.orthographyId);
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
      if (unitId && t.layerId === defaultTranscriptionLayerId && t.modality === 'text' && typeof t.text === 'string') {
        transcriptionByUnitId.set(unitId, t.text);
      }
    }
  }

  // Pick first translation layer as phrase-level gls export target
  const firstTranslationLayerId = firstTranslationLayer?.id;

  const phraseXml = sorted
    .map((u, i) => {
      const phraseId = `p${i + 1}`;
      const txt = wrapLayerText(transcriptionByUnitId.get(u.id) ?? u.transcription?.default ?? '', defaultTranscriptionLayer);
      const gls = firstTranslationLayerId
        ? translations.find((t) => t.unitId === u.id && t.layerId === firstTranslationLayerId && t.modality === 'text')?.text ?? ''
        : '';
      const wrappedGls = wrapLayerText(gls, firstTranslationLayer);

      const unitTokens = tokensByUnitId.get(u.id) ?? [];
      const wordsXml = unitTokens.length > 0
        ? `\n              <words>\n${unitTokens.map((w, wi) => {
            const wordId = `${phraseId}_w${wi + 1}`;
            const wordTxt = w.form.default ?? Object.values(w.form)[0] ?? '';
            const morphs = morphemesByTokenId.get(w.id) ?? [];
            const morphXml = morphs.length > 0
              ? `\n                  <morphemes>\n${morphs.map((m, mi) => {
                  const morphId = `${wordId}_m${mi + 1}`;
                  const mTxt = m.form.default ?? Object.values(m.form)[0] ?? '';
                  const mGls = m.gloss?.eng ?? Object.values(m.gloss ?? {})[0] ?? '';
                  return `                    <morph guid="${morphId}">\n                      <item type="txt" lang="${escapeXml(languageTag)}">${escapeXml(mTxt)}</item>${mGls ? `\n                      <item type="gls" lang="en">${escapeXml(mGls)}</item>` : ''}\n                    </morph>`;
                }).join('\n')}\n                  </morphemes>`
              : '';
            return `                <word guid="${wordId}">\n                  <item type="txt" lang="${escapeXml(languageTag)}">${escapeXml(wordTxt)}</item>${morphXml}\n                </word>`;
          }).join('\n')}\n              </words>`
        : '';

      return `            <phrase guid="${phraseId}" begin-time-offset="${u.startTime}" end-time-offset="${u.endTime}">\n              <item type="txt" lang="${escapeXml(languageTag)}">${escapeXml(txt)}</item>${wrappedGls ? `\n              <item type="gls" lang="en">${escapeXml(wrappedGls)}</item>` : ''}${wordsXml}\n            </phrase>`;
    })
    .join('\n');

  // 所有含 segment 数据的附加层：每层生成一个额外的 interlinear-text | All additional layers with segment data: one extra interlinear-text per layer
  const additionalIts: string[] = [];
  if (segmentsByLayer) {
    for (const layer of layers) {
      if (layer.id === layers.find((l) => l.layerType === 'transcription' && l.isDefault)?.id) continue;
      const segs = segmentsByLayer.get(layer.id);
      if (!segs || segs.length === 0) continue;
      const contentMap = segmentContents?.get(layer.id);
      const tierName = readEnglishFallbackMultiLangLabel(layer.name) ?? layer.key;
      const sortedSegs = [...segs].sort((a, b) => a.startTime - b.startTime);
      const segPhrasesXml = sortedSegs.map((seg, i) => {
        const txt = wrapLayerText(contentMap?.get(seg.id)?.text ?? '', layer);
        return `            <phrase guid="${escapeXml(layer.id)}_p${i + 1}" begin-time-offset="${seg.startTime}" end-time-offset="${seg.endTime}">\n              <item type="txt" lang="${escapeXml(languageTag)}">${escapeXml(txt)}</item>\n            </phrase>`;
      }).join('\n');
      additionalIts.push(`  <interlinear-text guid="${escapeXml(layer.id)}">\n    <item type="title" lang="en">${escapeXml(tierName)}</item>\n    <paragraphs>\n      <paragraph guid="pg_${escapeXml(layer.id)}">\n        <phrases>\n${segPhrasesXml}\n        </phrases>\n      </paragraph>\n    </paragraphs>\n  </interlinear-text>`);
    }
  }

  const additionalItsXml = additionalIts.length > 0 ? `\n${additionalIts.join('\n')}` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<document version="2">
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

export function importFromFlextext(xmlString: string): FlexImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`flextext XML parse failed: ${parseError.textContent}`);
  }

  const units: FlexImportResult['units'] = [];
  const phraseGlosses = new Map<string, string>();
  let sourceLanguage: string | undefined;
  let glossLanguage: string | undefined;

  doc.querySelectorAll('phrase').forEach((phrase, index) => {
    const phraseId = phrase.getAttribute('guid') ?? `p${index + 1}`;

    const startTime = parseFloat(phrase.getAttribute('begin-time-offset') ?? '0');
    const endTime = parseFloat(phrase.getAttribute('end-time-offset') ?? '0');

    const phraseItems = phrase.querySelectorAll(':scope > item');
    const txtItem = Array.from(phraseItems).find((el) => el.getAttribute('type') === 'txt');
    const glsItem = Array.from(phraseItems).find((el) => el.getAttribute('type') === 'gls');

    // 提取源语言与翻译语言标签 | Extract source & gloss language tags
    if (!sourceLanguage && txtItem) {
      const lang = txtItem.getAttribute('lang');
      if (lang) sourceLanguage = lang;
    }
    if (!glossLanguage && glsItem) {
      const lang = glsItem.getAttribute('lang');
      if (lang) glossLanguage = lang;
    }

    const transcription = stripPlainTextBidiIsolation(getText(txtItem ?? null));
    const phraseGloss = stripPlainTextBidiIsolation(getText(glsItem ?? null));
    if (phraseGloss) phraseGlosses.set(phraseId, phraseGloss);

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
    phrase.querySelectorAll(':scope > words > word').forEach((wordEl) => {
      const wordItems = wordEl.querySelectorAll(':scope > item');
      const wordTxtItem = Array.from(wordItems).find((el) => el.getAttribute('type') === 'txt');
      const wordGlsItem = Array.from(wordItems).find((el) => el.getAttribute('type') === 'gls');
      const wordPsItem = Array.from(wordItems).find((el) => el.getAttribute('type') === 'ps');

      const wordText = stripPlainTextBidiIsolation(getText(wordTxtItem ?? null));
      const wordGloss = stripPlainTextBidiIsolation(getText(wordGlsItem ?? null));
      const wordPos = getText(wordPsItem ?? null);

      const morphemes = Array.from(wordEl.querySelectorAll(':scope > morphemes > morph')).map((morphEl) => {
        const morphItems = morphEl.querySelectorAll(':scope > item');
        const morphTxtItem = Array.from(morphItems).find((el) => el.getAttribute('type') === 'txt');
        const morphGlsItem = Array.from(morphItems).find((el) => el.getAttribute('type') === 'gls');
        const morphPsItem = Array.from(morphItems).find((el) => el.getAttribute('type') === 'ps');
        const mTxt = stripPlainTextBidiIsolation(getText(morphTxtItem ?? null));
        const mGls = stripPlainTextBidiIsolation(getText(morphGlsItem ?? null));
        const mPos = getText(morphPsItem ?? null);
        return {
          form: { default: mTxt },
          ...(mGls && { gloss: { eng: mGls } }),
          ...(mPos && { pos: mPos }),
        };
      });

      words.push({
        form: { default: wordText },
        ...(wordGloss && { gloss: { eng: wordGloss } }),
        ...(wordPos && { pos: wordPos }),
        ...(morphemes.length > 0 && { morphemes }),
      });
    });

    const tokens = words.length > 0
      ? words.map((word) => ({
        form: word.form,
        ...(word.gloss ? { gloss: word.gloss } : {}),
        ...(word.pos ? { pos: word.pos } : {}),
        ...(Array.isArray(word.morphemes) ? {
          morphemes: word.morphemes.map((m) => ({
            form: m.form,
            ...(m.gloss ? { gloss: m.gloss } : {}),
            ...(m.pos ? { pos: m.pos } : {}),
          })),
        } : {}),
      }))
      : undefined;

    units.push({
      startTime: Number.isFinite(startTime) ? startTime : 0,
      endTime: Number.isFinite(endTime) ? endTime : (Number.isFinite(startTime) ? startTime : 0),
      transcription,
      ...(tokens && tokens.length > 0 && { tokens }),
    });
  });

  return {
    units,
    phraseGlosses,
    ...(sourceLanguage !== undefined && { sourceLanguage }),
    ...(glossLanguage !== undefined && { glossLanguage }),
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
