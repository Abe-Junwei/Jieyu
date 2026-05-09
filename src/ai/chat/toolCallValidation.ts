/**
 * toolCallValidation — Tool argument validators
 * Extracted from toolCallHelpers.ts to reduce orchestrator size.
 */

import { decodeEscapedUnicode } from '../../utils/decodeEscapedUnicode';
import type { AiChatToolName } from './chatDomain.types';

const AMBIGUOUS_LANGUAGE_TARGET_PATTERN = /^(und|unknown|auto|default)$/i;

export function isAmbiguousLanguageTarget(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return AMBIGUOUS_LANGUAGE_TARGET_PATTERN.test(trimmed);
}

export function requiresConcreteLanguageTarget(callName: AiChatToolName): boolean {
  return callName === 'create_transcription_layer' || callName === 'create_translation_layer';
}

export function getFirstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '';
}

export function getNormalizedIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function getDeleteTargetIds(args: Record<string, unknown>): string[] {
  const ids = [
    ...getNormalizedIdList(args.segmentIds),
    ...(() => {
      const segmentId = getFirstNonEmptyString(args.segmentId);
      return segmentId ? [segmentId] : [];
    })(),
  ];
  return Array.from(new Set(ids));
}

export function hasDeleteAllSegmentsScope(args: Record<string, unknown>): boolean {
  return args.allSegments === true;
}

export function hasSegmentSelector(args: Record<string, unknown>): boolean {
  const segmentIndex = args.segmentIndex;
  if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) {
    return true;
  }
  return typeof args.segmentPosition === 'string' && args.segmentPosition.length > 0;
}

export function segmentSelectorNeedsAnchor(args: Record<string, unknown>): boolean {
  return args.segmentPosition === 'previous' || args.segmentPosition === 'next';
}

const TOOL_ARG_MAX_ID_LENGTH = 128;
const TOOL_ARG_MAX_TEXT_LENGTH = 5000;

export function validateArgId(
  args: Record<string, unknown>,
  key: string,
  required: boolean,
): string | null {
  if (!(key in args)) return required ? decodeEscapedUnicode(`\\u7f3a\\u5c11 ${key}。`) : null;
  const value = args[key];
  if (typeof value !== 'string')
    return decodeEscapedUnicode(`${key} \\u5fc5\\u987b\\u662f\\u5b57\\u7b26\\u4e32。`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return decodeEscapedUnicode(`${key} \\u4e0d\\u80fd\\u4e3a\\u7a7a。`);
  if (trimmed.length > TOOL_ARG_MAX_ID_LENGTH)
    return decodeEscapedUnicode(
      `${key} \\u957f\\u5ea6\\u4e0d\\u80fd\\u8d85\\u8fc7 ${TOOL_ARG_MAX_ID_LENGTH}。`,
    );
  return null;
}

export function validateArgIdList(
  args: Record<string, unknown>,
  key: string,
  required: boolean,
): string | null {
  if (!(key in args)) return required ? decodeEscapedUnicode(`\\u7f3a\\u5c11 ${key}。`) : null;
  const value = args[key];
  if (!Array.isArray(value))
    return decodeEscapedUnicode(`${key} \\u5fc5\\u987b\\u662f ID \\u6570\\u7ec4。`);
  if (value.length === 0)
    return decodeEscapedUnicode(`${key} \\u81f3\\u5c11\\u9700\\u8981 1 \\u4e2a ID。`);
  for (const item of value) {
    if (typeof item !== 'string')
      return decodeEscapedUnicode(`${key} \\u5fc5\\u987b\\u662f ID \\u6570\\u7ec4。`);
    const trimmed = item.trim();
    if (trimmed.length === 0)
      return decodeEscapedUnicode(`${key} \\u4e0d\\u80fd\\u5305\\u542b\\u7a7a ID。`);
    if (trimmed.length > TOOL_ARG_MAX_ID_LENGTH) {
      return decodeEscapedUnicode(
        `${key} \\u4e2d\\u7684 ID \\u957f\\u5ea6\\u4e0d\\u80fd\\u8d85\\u8fc7 ${TOOL_ARG_MAX_ID_LENGTH}。`,
      );
    }
  }
  return null;
}

export function validateDeleteSegmentArgs(args: Record<string, unknown>): string | null {
  if (hasDeleteAllSegmentsScope(args)) {
    return null;
  }

  if (hasSegmentSelector(args)) {
    return null;
  }

  const listValidation = validateArgIdList(args, 'segmentIds', false);
  if (listValidation) return listValidation;

  if (getNormalizedIdList(args.segmentIds).length > 0) {
    return null;
  }

  const segmentId = getFirstNonEmptyString(args.segmentId);
  if (segmentId) return validateArgId(args, 'segmentId', false);

  return decodeEscapedUnicode('\u7f3a\u5c11 segmentId/segmentIds/allSegments。');
}

export function validateSegmentTargetArgs(args: Record<string, unknown>): string | null {
  if (hasSegmentSelector(args)) {
    return null;
  }
  return validateArgId(args, 'segmentId', true);
}

export function validateOptionalSegmentTargetArgs(args: Record<string, unknown>): string | null {
  if (hasSegmentSelector(args)) {
    return null;
  }
  return validateArgId(args, 'segmentId', false);
}

/** \\u6570\\u503c\\u53c2\\u6570\\u6821\\u9a8c（\\u517c\\u5bb9 Zod number schema） | Numeric arg validator (compatible with Zod number schemas) */
export function validateArgNumeric(
  args: Record<string, unknown>,
  key: string,
  required: boolean,
): string | null {
  if (!(key in args)) return required ? decodeEscapedUnicode(`\\u7f3a\\u5c11 ${key}。`) : null;
  const value = args[key];
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(num))
    return decodeEscapedUnicode(`${key} \\u5fc5\\u987b\\u662f\\u6709\\u6548\\u6570\\u5b57。`);
  return null;
}

export function validateArgText(args: Record<string, unknown>): string | null {
  const value = args.text;
  if (typeof value !== 'string')
    return decodeEscapedUnicode('text \\u5fc5\\u987b\\u662f\\u5b57\\u7b26\\u4e32。');
  const trimmed = value.trim();
  if (trimmed.length === 0) return decodeEscapedUnicode('text \\u4e0d\\u80fd\\u4e3a\\u7a7a。');
  if (trimmed.length > TOOL_ARG_MAX_TEXT_LENGTH)
    return decodeEscapedUnicode(
      `text \\u957f\\u5ea6\\u4e0d\\u80fd\\u8d85\\u8fc7 ${TOOL_ARG_MAX_TEXT_LENGTH}。`,
    );
  return null;
}

export function validateSplitSegmentArgs(args: Record<string, unknown>): string | null {
  let idValidation: string | null = null;
  if (!hasSegmentSelector(args)) {
    idValidation = validateArgId(args, 'segmentId', true);
  }
  if (idValidation) return idValidation;

  if (!('splitTime' in args)) return null;
  const splitTime = args.splitTime;
  if (typeof splitTime !== 'number' || !Number.isFinite(splitTime)) {
    return decodeEscapedUnicode('splitTime \\u5fc5\\u987b\\u662f\\u6570\\u503c（\\u79d2）。');
  }
  if (splitTime < 0) {
    return decodeEscapedUnicode('splitTime \\u4e0d\\u80fd\\u4e3a\\u8d1f\\u6570。');
  }
  return null;
}

export function validateArgLayerCreate(
  args: Record<string, unknown>,
  allowModality: boolean,
): string | null {
  const languageId = args.languageId;
  const languageQuery = args.languageQuery;
  const effectiveLang =
    typeof languageId === 'string' && languageId.trim().length > 0
      ? languageId.trim()
      : typeof languageQuery === 'string' && languageQuery.trim().length > 0
        ? languageQuery.trim()
        : '';
  if (effectiveLang.length === 0) {
    return decodeEscapedUnicode(
      'languageId \\u5fc5\\u987b\\u662f\\u975e\\u7a7a\\u5b57\\u7b26\\u4e32。',
    );
  }
  if (isAmbiguousLanguageTarget(effectiveLang)) {
    return decodeEscapedUnicode(
      'languageId \\u4e0d\\u80fd\\u662f und/unknown/auto/default，\\u8bf7\\u63d0\\u4f9b\\u660e\\u786e\\u8bed\\u8a00。',
    );
  }
  if (effectiveLang.length > 32)
    return decodeEscapedUnicode(
      'languageId/languageQuery \\u957f\\u5ea6\\u4e0d\\u80fd\\u8d85\\u8fc7 32。',
    );
  if ('alias' in args) {
    const alias = args.alias;
    if (typeof alias !== 'string')
      return decodeEscapedUnicode('alias \\u5fc5\\u987b\\u662f\\u5b57\\u7b26\\u4e32。');
    if (alias.trim().length > 64)
      return decodeEscapedUnicode('alias \\u957f\\u5ea6\\u4e0d\\u80fd\\u8d85\\u8fc7 64。');
  }
  if (allowModality && 'modality' in args) {
    const modality = args.modality;
    if (typeof modality !== 'string')
      return decodeEscapedUnicode('modality \\u5fc5\\u987b\\u662f\\u5b57\\u7b26\\u4e32。');
    if (!['text', 'audio', 'mixed'].includes(modality.trim().toLowerCase())) {
      return decodeEscapedUnicode(
        'modality \\u5fc5\\u987b\\u662f text/audio/mixed \\u4e4b\\u4e00。',
      );
    }
  }
  return null;
}

export function validateDeleteLayerArgs(args: Record<string, unknown>): string | null {
  const layerIdValidation = validateArgId(args, 'layerId', false);
  if (layerIdValidation) return layerIdValidation;
  const hasLayerId = typeof args.layerId === 'string' && args.layerId.trim().length > 0;
  if (hasLayerId) return null;
  const layerType = args.layerType;
  if (layerType !== 'translation' && layerType !== 'transcription') {
    return decodeEscapedUnicode(
      '\\u7f3a\\u5c11 layerId，\\u4e14 layerType \\u5fc5\\u987b\\u662f translation/transcription \\u4e4b\\u4e00。',
    );
  }
  const languageQuery = args.languageQuery;
  if (typeof languageQuery !== 'string' || languageQuery.trim().length === 0) {
    return decodeEscapedUnicode(
      '\\u7f3a\\u5c11 layerId \\u65f6\\u5fc5\\u987b\\u63d0\\u4f9b languageQuery。',
    );
  }
  if (languageQuery.trim().length > 32)
    return decodeEscapedUnicode('languageQuery \\u957f\\u5ea6\\u4e0d\\u80fd\\u8d85\\u8fc7 32。');
  return null;
}

export function validateLinkLayerArgs(args: Record<string, unknown>): string | null {
  if (!('transcriptionLayerId' in args) && !('transcriptionLayerKey' in args)) {
    return decodeEscapedUnicode(
      '\\u7f3a\\u5c11 transcriptionLayerId（\\u517c\\u5bb9\\u5b57\\u6bb5\\uff1atranscriptionLayerKey）。',
    );
  }
  if (!('translationLayerId' in args) && !('layerId' in args)) {
    return decodeEscapedUnicode('\\u7f3a\\u5c11 translationLayerId/layerId。');
  }
  return (
    validateArgId(args, 'transcriptionLayerId', false) ??
    validateArgId(args, 'transcriptionLayerKey', false) ??
    validateArgId(args, 'translationLayerId', false) ??
    validateArgId(args, 'layerId', false)
  );
}
