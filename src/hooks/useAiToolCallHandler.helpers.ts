import type { LayerDocType } from '../db';
import { t, type Locale } from '../i18n';
import { resolveLanguageQuery, SUPPORTED_VOICE_LANGS } from '../utils/langMapping';
import { listUniqueNonEmptyMultiLangLabels } from '../utils/multiLangLabels';

export function normalizeAiToolCallText(value: string): string {
  return value.trim().toLowerCase();
}

export function buildAiToolLanguageTokens(query: string): string[] {
  const normalizedQuery = normalizeAiToolCallText(query);
  const tokens = new Set<string>([normalizedQuery]);
  const code = resolveLanguageQuery(query);
  if (code) {
    tokens.add(code);
    const entry = SUPPORTED_VOICE_LANGS.flatMap((group) => group.langs).find((lang) => lang.code === code);
    if (entry) {
      entry.label.split(/\s*\/\s*/).forEach((part) => tokens.add(normalizeAiToolCallText(part)));
    }
  }
  return Array.from(tokens).filter((token) => token.length > 0);
}

export function parseLayerHintFromOpaqueId(value: string): { layerType: 'translation' | 'transcription'; languageQuery: string } | null {
  const normalized = normalizeAiToolCallText(value);
  if (!normalized) return null;
  const layerType = /translation|译|翻译/.test(normalized)
    ? 'translation'
    : (/transcription|转写|转录|听写/.test(normalized) ? 'transcription' : null);
  if (!layerType) return null;
  const languageFragment = normalized
    .replace(/translation|transcription|layer|tier|译|翻译|转写|转录|听写|层|_/g, '')
    .trim();
  if (!languageFragment) return null;
  const code = resolveLanguageQuery(languageFragment);
  if (!code) return null;
  return { layerType, languageQuery: code };
}

export function layerMatchesLanguage(layer: LayerDocType, languageQuery: string): boolean {
  const fields = [layer.languageId, layer.key, ...listUniqueNonEmptyMultiLangLabels(layer.name)]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => normalizeAiToolCallText(value));
  const tokens = buildAiToolLanguageTokens(languageQuery).map((token) => normalizeAiToolCallText(token));
  return tokens.some((token) => fields.some((field) => field.includes(token) || token.includes(field)));
}

export function formatVoiceLayerKinds(layerKinds: Array<'transcription' | 'translation' | 'gloss'>, locale: Locale): string {
  const keyByLayerKind = {
    transcription: 'transcription.aiTool.layerKind.transcription',
    translation: 'transcription.aiTool.layerKind.translation',
    gloss: 'transcription.aiTool.layerKind.gloss',
  } as const;
  return layerKinds.map((kind) => t(locale, keyByLayerKind[kind])).join(' / ');
}

export function formatVoiceHistoryActorLabel(intentType: string, locale: Locale): string {
  return intentType === 'chat'
    ? t(locale, 'transcription.aiTool.voice.historyActorUser')
    : t(locale, 'transcription.aiTool.voice.historyActorAssistant');
}

export function formatLayerTypeLabel(layerType: 'transcription' | 'translation', locale: Locale): string {
  return layerType === 'translation'
    ? t(locale, 'transcription.aiTool.layer.typeTranslation')
    : t(locale, 'transcription.aiTool.layer.typeTranscription');
}

export function normalizeRequestedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  ));
}
