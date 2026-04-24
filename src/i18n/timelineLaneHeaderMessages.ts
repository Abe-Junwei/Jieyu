import { normalizeLocale, t, type Locale } from './index';

export type TimelineLaneHeaderMessages = {
  editLayerMetadata: string;
  laneLockErrorMin: string;
  timelineModeDocumentBadge: string;
  timelineModeDocumentBadgeAriaLabel: string;
};

export function getTimelineLaneHeaderMessages(locale: Locale): TimelineLaneHeaderMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  return {
    editLayerMetadata: t(normalizedLocale, 'transcription.timeline.laneHeader.editLayerMetadata'),
    laneLockErrorMin: t(normalizedLocale, 'transcription.timeline.laneHeader.laneLockErrorMin'),
    timelineModeDocumentBadge: t(normalizedLocale, 'transcription.timeline.laneHeader.documentBadge'),
    timelineModeDocumentBadgeAriaLabel: t(normalizedLocale, 'transcription.timeline.laneHeader.documentBadgeAriaLabel'),
  };
}
