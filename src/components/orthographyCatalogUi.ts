import type { OrthographyDocType } from '../db';
import type { Locale } from '../i18n';
import { getOrthographyCatalogGroupLabel } from '../i18n/messages';
import { resolveOrthographyCatalogGroupKey } from '../hooks/useOrthographyPicker';

export function getOrthographyCatalogBadgeInfo(locale: Locale, orthography: Pick<OrthographyDocType, 'catalogMetadata'>) {
  const groupKey = resolveOrthographyCatalogGroupKey(orthography);
  const className = groupKey === 'reviewed-primary'
    ? 'panel-chip panel-chip--success'
    : groupKey === 'needs-review' || groupKey === 'experimental'
    ? 'panel-chip panel-chip--warning'
    : 'panel-chip';

  return {
    groupKey,
    className,
    label: getOrthographyCatalogGroupLabel(locale, groupKey),
  };
}