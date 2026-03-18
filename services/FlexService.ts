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
  UtteranceDocType,
  TranslationLayerDocType,
  UtteranceTextDocType,
  UtteranceTokenDocType,
  UtteranceMorphemeDocType,
} from '../db';

// ── Types ───────────────────────────────────────────────────

export interface FlexExportInput {
  utterances: UtteranceDocType[];
  layers: TranslationLayerDocType[];
  translations: UtteranceTextDocType[];
  tokens?: UtteranceTokenDocType[];
  morphemes?: UtteranceMorphemeDocType[];
  languageTag?: string;
}

export interface FlexImportResult {
  utterances: Array<{
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
  const { utterances, layers, translations, tokens = [], morphemes = [], languageTag = 'und' } = input;
  const sorted = [...utterances].sort((a, b) => a.startTime - b.startTime);

  const tokensByUtteranceId = new Map<string, UtteranceTokenDocType[]>();
  for (const token of tokens) {
    const list = tokensByUtteranceId.get(token.utteranceId) ?? [];
    list.push(token);
    tokensByUtteranceId.set(token.utteranceId, list);
  }
  for (const list of tokensByUtteranceId.values()) {
    list.sort((a, b) => a.tokenIndex - b.tokenIndex);
  }

  const morphemesByTokenId = new Map<string, UtteranceMorphemeDocType[]>();
  for (const morph of morphemes) {
    const list = morphemesByTokenId.get(morph.tokenId) ?? [];
    list.push(morph);
    morphemesByTokenId.set(morph.tokenId, list);
  }
  for (const list of morphemesByTokenId.values()) {
    list.sort((a, b) => a.morphemeIndex - b.morphemeIndex);
  }

  const defaultTranscriptionLayerId = layers.find((l) => l.layerType === 'transcription' && l.isDefault)?.id
    ?? layers.find((l) => l.layerType === 'transcription')?.id;

  const transcriptionByUtteranceId = new Map<string, string>();
  if (defaultTranscriptionLayerId) {
    for (const t of translations) {
      if (t.tierId === defaultTranscriptionLayerId && t.modality === 'text' && typeof t.text === 'string') {
        transcriptionByUtteranceId.set(t.utteranceId, t.text);
      }
    }
  }

  // Pick first translation layer as phrase-level gls export target
  const firstTranslationLayerId = layers.find((l) => l.layerType === 'translation')?.id;

  const phraseXml = sorted
    .map((u, i) => {
      const phraseId = `p${i + 1}`;
      const txt = transcriptionByUtteranceId.get(u.id) ?? u.transcription?.default ?? '';
      const gls = firstTranslationLayerId
        ? translations.find((t) => t.utteranceId === u.id && t.tierId === firstTranslationLayerId && t.modality === 'text')?.text ?? ''
        : '';

      const utteranceTokens = tokensByUtteranceId.get(u.id) ?? [];
      const wordsXml = utteranceTokens.length > 0
        ? `\n              <words>\n${utteranceTokens.map((w, wi) => {
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

      return `            <phrase guid="${phraseId}" begin-time-offset="${u.startTime}" end-time-offset="${u.endTime}">\n              <item type="txt" lang="${escapeXml(languageTag)}">${escapeXml(txt)}</item>${gls ? `\n              <item type="gls" lang="en">${escapeXml(gls)}</item>` : ''}${wordsXml}\n            </phrase>`;
    })
    .join('\n');

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
  </interlinear-text>
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

  const utterances: FlexImportResult['utterances'] = [];
  const phraseGlosses = new Map<string, string>();

  doc.querySelectorAll('phrase').forEach((phrase, index) => {
    const phraseId = phrase.getAttribute('guid') ?? `p${index + 1}`;

    const startTime = parseFloat(phrase.getAttribute('begin-time-offset') ?? '0');
    const endTime = parseFloat(phrase.getAttribute('end-time-offset') ?? '0');

    const phraseItems = phrase.querySelectorAll(':scope > item');
    const txtItem = Array.from(phraseItems).find((el) => el.getAttribute('type') === 'txt');
    const glsItem = Array.from(phraseItems).find((el) => el.getAttribute('type') === 'gls');

    const transcription = getText(txtItem ?? null);
    const phraseGloss = getText(glsItem ?? null);
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

      const wordText = getText(wordTxtItem ?? null);
      const wordGloss = getText(wordGlsItem ?? null);

      const morphemes = Array.from(wordEl.querySelectorAll(':scope > morphemes > morph')).map((morphEl) => {
        const morphItems = morphEl.querySelectorAll(':scope > item');
        const morphTxtItem = Array.from(morphItems).find((el) => el.getAttribute('type') === 'txt');
        const morphGlsItem = Array.from(morphItems).find((el) => el.getAttribute('type') === 'gls');
        const mTxt = getText(morphTxtItem ?? null);
        const mGls = getText(morphGlsItem ?? null);
        return {
          form: { default: mTxt },
          ...(mGls && { gloss: { eng: mGls } }),
        };
      });

      words.push({
        form: { default: wordText },
        ...(wordGloss && { gloss: { eng: wordGloss } }),
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

    utterances.push({
      startTime: Number.isFinite(startTime) ? startTime : 0,
      endTime: Number.isFinite(endTime) ? endTime : (Number.isFinite(startTime) ? startTime : 0),
      transcription,
      ...(tokens && tokens.length > 0 && { tokens }),
    });
  });

  return { utterances, phraseGlosses };
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
