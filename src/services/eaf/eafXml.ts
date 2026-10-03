import type { MediaItemDocType } from '../../db';
import type { OrthographyInteropMetadata } from '../../utils/orthographyInteropMetadata';
import { createLogger } from '../../observability/logger';
import type { TimelineInteropMetadata } from './eafTypes';

const log = createLogger('EafService');

export const JIEYU_LAYER_META_PREFIX = 'jieyu:layer-meta:';
export const JIEYU_PROJECT_META_TIMELINE = 'jieyu:project-meta:timeline';

// ── Export ───────────────────────────────────────────────────

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function readMultiLangDefault(value: Record<string, string> | undefined): string {
  if (!value) return '';
  const preferred = value.default ?? value.eng ?? value.zho;
  if (typeof preferred === 'string' && preferred.trim()) return preferred.trim();
  for (const candidate of Object.values(value)) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

/** 从层 key 解析 EAF 元数据（tierId/langLabel）| Parse EAF metadata from layer key (tierId/langLabel) */
export function parseEafMetaFromLayerKey(layerKey?: string): {
  tierId?: string;
  langLabel?: string;
} {
  if (!layerKey) return {};
  const marker = '__eafmeta_';
  const idx = layerKey.indexOf(marker);
  if (idx < 0) return {};
  const encoded = layerKey.slice(idx + marker.length);
  if (!encoded) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded)) as {
      tierId?: unknown;
      langLabel?: unknown;
    };
    return {
      ...(typeof parsed.tierId === 'string' && parsed.tierId.trim().length > 0
        ? { tierId: parsed.tierId.trim() }
        : {}),
      ...(typeof parsed.langLabel === 'string' && parsed.langLabel.trim().length > 0
        ? { langLabel: parsed.langLabel.trim() }
        : {}),
    };
  } catch (err) {
    log.error('failed to parse locale info from layerKey', { layerKey, err });
    return {};
  }
}

export function extractTimelineMetadata(
  metadata?: OrthographyInteropMetadata,
): TimelineInteropMetadata | undefined {
  if (!metadata) return undefined;
  const timelineMode = metadata.timelineMode;
  const logicalDurationSec = metadata.logicalDurationSec;
  const timebaseLabel = metadata.timebaseLabel;
  if (!timelineMode && logicalDurationSec === undefined && !timebaseLabel) return undefined;
  return {
    ...(timelineMode ? { timelineMode } : {}),
    ...(logicalDurationSec !== undefined ? { logicalDurationSec } : {}),
    ...(timebaseLabel ? { timebaseLabel } : {}),
  };
}

/** Infer ELAN MEDIA_DESCRIPTOR MIME_TYPE from media filename / details. */
export function resolveEafMediaMimeType(
  mediaItem: Pick<MediaItemDocType, 'filename' | 'details'>,
): string {
  const detailsMime =
    mediaItem.details && typeof mediaItem.details === 'object' && 'mimeType' in mediaItem.details
      ? mediaItem.details.mimeType
      : undefined;
  if (typeof detailsMime === 'string' && detailsMime.trim()) return detailsMime.trim();

  const name = mediaItem.filename.toLowerCase();
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.m4a') || name.endsWith('.mp4')) return 'audio/mp4';
  if (name.endsWith('.ogg') || name.endsWith('.oga')) return 'audio/ogg';
  if (name.endsWith('.webm')) return 'audio/webm';
  if (name.endsWith('.flac')) return 'audio/flac';
  if (name.endsWith('.aac')) return 'audio/aac';
  if (name.endsWith('.wav')) return 'audio/x-wav';
  return 'audio/x-wav';
}

export function mediaFilenameFromDescriptor(el: Element): string {
  const relUrl = el.getAttribute('RELATIVE_MEDIA_URL') ?? '';
  const mediaUrl = el.getAttribute('MEDIA_URL') ?? '';
  return relUrl.replace(/^\.\//, '') || mediaUrl.split('/').pop() || 'unknown.wav';
}

/**
 * ELAN 3 tiers point at `<LANGUAGE LANG_ID>` via `LANG_REF`.
 * `DEFAULT_LOCALE` is the editor locale, not the tier language.
 */
export function readEafTierLanguageId(tier: Element): string | undefined {
  const langRef = tier.getAttribute('LANG_REF')?.trim() ?? '';
  return langRef.length > 0 ? langRef : undefined;
}
