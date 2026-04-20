import { t, type Locale } from '../i18n';
import { normalizeSingleLine } from './transcriptionFormatters';
import type { UnitSelfCertainty } from './unitSelfCertainty';

export function buildTimelineSelfCertaintyTitle(
  locale: Locale,
  value: UnitSelfCertainty,
  laneLabel?: string,
): string {
  const resolvedLabel = value === 'certain'
    ? t(locale, 'transcription.unit.selfCertainty.certain')
    : value === 'uncertain'
      ? t(locale, 'transcription.unit.selfCertainty.uncertain')
      : t(locale, 'transcription.unit.selfCertainty.notUnderstood');
  const normalizedLaneLabel = normalizeSingleLine(laneLabel ?? '').trim();
  const primaryLabel = normalizedLaneLabel.length > 0 ? normalizedLaneLabel : resolvedLabel;
  return `${primaryLabel}\n${t(locale, 'transcription.unit.selfCertainty.dimensionHint')}`;
}

export function buildTimelineSelfCertaintyAmbiguousTitle(locale: Locale): string {
  return t(locale, 'transcription.unit.selfCertainty.ambiguousSource');
}