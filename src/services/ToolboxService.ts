/**
 * Toolbox marker-stream (.txt) import/export service.
 *
 * Baseline marker mapping (MDF-like):
 * - \ref: record id
 * - \ts / \te: start / end time (seconds)
 * - \tx: transcription text
 * - \mb: morpheme break line (word-level tokens, morphemes separated by '-' or '=')
 * - \ge: morpheme gloss line aligned with \mb
 * - \ps: morpheme POS line aligned with \mb
 * - \ft: free translation
 */

import type {
  UtteranceDocType,
  LayerDocType,
  UtteranceTextDocType,
  UtteranceTokenDocType,
  UtteranceMorphemeDocType,
  LayerSegmentDocType,
  LayerSegmentContentDocType,
  OrthographyDocType,
} from '../db';
import { resolveOrthographyRenderPolicy } from '../utils/layerDisplayStyle';
import { stripPlainTextBidiIsolation, wrapPlainTextWithBidiIsolation } from '../utils/bidiPlainText';
import { readEnglishFallbackMultiLangLabel } from '../utils/multiLangLabels';

export interface ToolboxExportInput {
  utterances: UtteranceDocType[];
  layers: LayerDocType[];
  translations: UtteranceTextDocType[];
  orthographies?: OrthographyDocType[];
  tokens?: UtteranceTokenDocType[];
  morphemes?: UtteranceMorphemeDocType[];
  /** 独立层 segment 数据 | Independent layer segment data */
  segmentsByLayer?: Map<string, LayerSegmentDocType[]>;
  /** segment 内容按 layerId → segmentId 索引 | Segment content indexed by layerId → segmentId */
  segmentContents?: Map<string, Map<string, LayerSegmentContentDocType>>;
}

export interface ToolboxImportResult {
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
  additionalTiers: Map<string, Array<{
    startTime: number;
    endTime: number;
    text: string;
  }>>;
}

type RawRecord = {
  ref?: string;
  ts?: string;
  te?: string;
  tx?: string;
  mb?: string;
  ge?: string;
  ps?: string;
  ft?: string;
};

function splitTokens(line: string | undefined): string[] {
  if (!line) return [];
  return line.trim().split(/\s+/).filter(Boolean);
}

function parseTime(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
}

function splitMorphemes(wordToken: string): string[] {
  return wordToken.split(/[-=]/).map((s) => s.trim()).filter(Boolean);
}

function parseWords(tx?: string, mb?: string, ge?: string, ps?: string): Array<{
  form: Record<string, string>;
  gloss?: Record<string, string>;
  morphemes?: Array<{ form: Record<string, string>; gloss?: Record<string, string>; pos?: string }>;
}> {
  const txTokens = splitTokens(tx);
  const mbTokens = splitTokens(mb);
  const geTokens = splitTokens(ge);
  const psTokens = splitTokens(ps);

  if (mbTokens.length === 0) return [];

  return mbTokens.map((mbWord, wi) => {
    const morphForms = splitMorphemes(mbWord);
    const morphGlosses = splitMorphemes(geTokens[wi] ?? '');
    const morphPos = splitMorphemes(psTokens[wi] ?? '');

    const morphemes = morphForms.map((m, mi) => ({
      form: { default: m },
      ...(morphGlosses[mi] ? { gloss: { eng: morphGlosses[mi] } } : {}),
      ...(morphPos[mi] ? { pos: morphPos[mi] } : {}),
    }));

    return {
      form: { default: txTokens[wi] ?? mbWord },
      ...(geTokens[wi] ? { gloss: { eng: geTokens[wi] } } : {}),
      ...(morphemes.length > 0 ? { morphemes } : {}),
    };
  });
}

export function importFromToolbox(content: string): ToolboxImportResult {
  const normalized = content.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');

  const rawRecords: RawRecord[] = [];
  let current: RawRecord = {};
  let lastMarker: keyof RawRecord | null = null;

  const finalizeCurrent = () => {
    const hasContent = Object.values(current).some((v) => (v ?? '').trim().length > 0);
    if (!hasContent) return;
    rawRecords.push(current);
    current = {};
    lastMarker = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (lastMarker) lastMarker = null;
      continue;
    }

    if (trimmed.startsWith('\\')) {
      const match = /^\\([^\s]+)\s*(.*)$/.exec(trimmed);
      if (!match) continue;
      const marker = match[1]!.toLowerCase();
      const value = match[2] ?? '';

      if (marker === 'ref' && Object.keys(current).length > 0) {
        finalizeCurrent();
      }

      if (marker === 'ref' || marker === 'ts' || marker === 'te' || marker === 'tx' || marker === 'mb' || marker === 'ge' || marker === 'ps' || marker === 'ft') {
        const key = marker as keyof RawRecord;
        const prev = current[key];
        current[key] = prev ? `${prev} ${value}`.trim() : value.trim();
        lastMarker = key;
      } else {
        lastMarker = null;
      }
      continue;
    }

    if (lastMarker) {
      const prev = current[lastMarker] ?? '';
      current[lastMarker] = `${prev} ${trimmed}`.trim();
    }
  }

  finalizeCurrent();

  const utterances: ToolboxImportResult['utterances'] = [];
  const freeTranslations: Array<{ startTime: number; endTime: number; text: string }> = [];

  rawRecords.forEach((rec, i) => {
    const startTime = parseTime(rec.ts, i);
    const endTime = parseTime(rec.te, startTime + 1);
    const transcription = stripPlainTextBidiIsolation((rec.tx ?? '').trim());

    if (!transcription) return;

    const tokens = parseWords(rec.tx, rec.mb, rec.ge, rec.ps);
    utterances.push({
      startTime,
      endTime,
      transcription,
      ...(tokens.length > 0 ? { tokens } : {}),
    });

    const ft = stripPlainTextBidiIsolation((rec.ft ?? '').trim());
    if (ft) {
      freeTranslations.push({ startTime, endTime, text: ft });
    }
  });

  const additionalTiers = new Map<string, Array<{ startTime: number; endTime: number; text: string }>>();
  if (freeTranslations.length > 0) additionalTiers.set('Toolbox Free Translation', freeTranslations);

  return { utterances, additionalTiers };
}

function buildWordMarkers(
  words: UtteranceTokenDocType[],
  morphemesByTokenId: Map<string, UtteranceMorphemeDocType[]>,
): { mb?: string; ge?: string; ps?: string } {
  const mbWords: string[] = [];
  const geWords: string[] = [];
  const psWords: string[] = [];

  words.forEach((word) => {
    const morphs = morphemesByTokenId.get(word.id) ?? [];
    if (morphs.length === 0) {
      const base = word.form.default ?? Object.values(word.form)[0] ?? '';
      if (base) mbWords.push(base);
      const wGloss = word.gloss?.eng ?? Object.values(word.gloss ?? {})[0] ?? '';
      if (wGloss) geWords.push(wGloss);
      return;
    }

    mbWords.push(morphs.map((m) => m.form.default ?? Object.values(m.form)[0] ?? '').join('-'));
    geWords.push(morphs.map((m) => m.gloss?.eng ?? Object.values(m.gloss ?? {})[0] ?? '').join('-'));
    psWords.push(morphs.map((m) => m.pos ?? '').join('-'));
  });

  return {
    ...(mbWords.some(Boolean) ? { mb: mbWords.join(' ') } : {}),
    ...(geWords.some(Boolean) ? { ge: geWords.join(' ') } : {}),
    ...(psWords.some((w) => w.trim().length > 0) ? { ps: psWords.join(' ') } : {}),
  };
}

export function exportToToolbox(input: ToolboxExportInput): string {
  const { utterances, layers, translations, orthographies, tokens = [], morphemes = [], segmentsByLayer, segmentContents } = input;
  const sorted = [...utterances].sort((a, b) => a.startTime - b.startTime);
  const defaultTranscriptionLayer = layers.find((l) => l.layerType === 'transcription' && l.isDefault)
    ?? layers.find((l) => l.layerType === 'transcription');
  const firstTranslationLayer = layers.find((l) => l.layerType === 'translation');
  const wrapLayerText = (text: string, layer?: LayerDocType) => {
    if (!layer?.languageId) return text;
    const renderPolicy = resolveOrthographyRenderPolicy(layer.languageId, orthographies, layer.orthographyId);
    return wrapPlainTextWithBidiIsolation(text, renderPolicy);
  };

  const tokensByUtteranceId = new Map<string, UtteranceTokenDocType[]>();
  for (const token of tokens) {
    const list = tokensByUtteranceId.get(token.unitId) ?? [];
    list.push(token);
    tokensByUtteranceId.set(token.unitId, list);
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
      if (t.layerId === defaultTranscriptionLayerId && t.modality === 'text' && typeof t.text === 'string') {
        transcriptionByUtteranceId.set(t.utteranceId, t.text);
      }
    }
  }

  const firstTranslationLayerId = layers.find((l) => l.layerType === 'translation')?.id;

  const lines: string[] = [];

  sorted.forEach((u, i) => {
    const ref = u.id || `r${i + 1}`;
    const tx = wrapLayerText(transcriptionByUtteranceId.get(u.id) ?? u.transcription?.default ?? '', defaultTranscriptionLayer);
    const utteranceTokens = tokensByUtteranceId.get(u.id) ?? [];
    const markers = buildWordMarkers(utteranceTokens, morphemesByTokenId);
    const ft = firstTranslationLayerId
      ? translations.find((t) => t.utteranceId === u.id && t.layerId === firstTranslationLayerId && t.modality === 'text')?.text ?? ''
      : '';
    const wrappedFt = wrapLayerText(ft, firstTranslationLayer);

    lines.push(`\\ref ${ref}`);
    lines.push(`\\ts ${u.startTime.toFixed(3)}`);
    lines.push(`\\te ${u.endTime.toFixed(3)}`);
    lines.push(`\\tx ${tx}`);
    if (markers.mb) lines.push(`\\mb ${markers.mb}`);
    if (markers.ge) lines.push(`\\ge ${markers.ge}`);
    if (markers.ps) lines.push(`\\ps ${markers.ps}`);
    if (wrappedFt) lines.push(`\\ft ${wrappedFt}`);
    lines.push('');
  });

  // 附加含 segment 数据的层记录（不分层类型）| Append segment records for any layer present in segmentsByLayer
  if (segmentsByLayer) {
    for (const [layerId, segs] of segmentsByLayer) {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) continue;
      const tierName = readEnglishFallbackMultiLangLabel(layer.name) ?? layer.key;
      const sortedSegs = [...segs].sort((a, b) => a.startTime - b.startTime);
      const contentMap = segmentContents?.get(layerId);
      lines.push(`\\_sh v3.0 400  ${tierName}`);
      for (const seg of sortedSegs) {
        lines.push(`\\ref ${seg.id}`);
        lines.push(`\\ts ${seg.startTime.toFixed(3)}`);
        lines.push(`\\te ${seg.endTime.toFixed(3)}`);
        lines.push(`\\tx ${wrapLayerText(contentMap?.get(seg.id)?.text ?? '', layer)}`);
        lines.push('');
      }
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function downloadToolbox(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.txt') ? filename : `${filename}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
