import { memo } from 'react';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE_TIGHT } from '../../utils/jieyuMaterialIcon';
import { t, type Locale } from '../../i18n';
import type { SavedCorpusSourceSet } from '../../ai/vertical/corpusSourceSet';

interface AiSourceSetBarProps {
  sourceSets: readonly SavedCorpusSourceSet[];
  activeSourceSetId: string | null;
  locale: Locale;
  onSelectSourceSet?: ((id: string) => void) | undefined;
  onCreateSourceSet?: (() => void) | undefined;
}

export const AiSourceSetBar = memo(function AiSourceSetBar({
  sourceSets,
  activeSourceSetId,
  locale,
  onSelectSourceSet,
  onCreateSourceSet,
}: AiSourceSetBarProps) {
  const activeSet = sourceSets.find((s) => s.id === activeSourceSetId);
  const displaySets = sourceSets.filter((s) => s.status !== 'invalidated');

  if (displaySets.length === 0 && !activeSet) {
    return (
      <div className="ai-source-set-bar ai-source-set-bar--empty">
        <MaterialSymbol name="folder_open" className={JIEYU_MATERIAL_INLINE_TIGHT} />
        <span className="ai-source-set-bar__label">
          {t(locale, 'msg.aiChat.sourceSet.projectScope')}
        </span>
        {onCreateSourceSet && (
          <button
            type="button"
            className="ai-source-set-bar__action"
            onClick={onCreateSourceSet}
            title={t(locale, 'msg.aiChat.sourceSet.create')}
          >
            <MaterialSymbol name="add" className={JIEYU_MATERIAL_INLINE_TIGHT} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="ai-source-set-bar">
      <MaterialSymbol name="library_books" className={JIEYU_MATERIAL_INLINE_TIGHT} />
      <span className="ai-source-set-bar__label">
        {activeSet
          ? activeSet.name
          : t(locale, 'msg.aiChat.sourceSet.projectScope')}
      </span>
      {activeSet && (
        <span className="ai-source-set-bar__meta">
          {activeSet.scope}
          {activeSet.members.length > 0 && ` · ${activeSet.members.length}`}
        </span>
      )}
      {displaySets.length > 0 && onSelectSourceSet && (
        <div className="ai-source-set-bar__dropdown">
          <select
            className="ai-source-set-bar__select"
            value={activeSourceSetId ?? ''}
            onChange={(e) => onSelectSourceSet(e.target.value)}
            aria-label={t(locale, 'msg.aiChat.sourceSet.select')}
          >
            <option value="">{t(locale, 'msg.aiChat.sourceSet.projectScope')}</option>
            {displaySets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name} ({set.scope})
              </option>
            ))}
          </select>
        </div>
      )}
      {onCreateSourceSet && (
        <button
          type="button"
          className="ai-source-set-bar__action"
          onClick={onCreateSourceSet}
          title={t(locale, 'msg.aiChat.sourceSet.create')}
        >
          <MaterialSymbol name="add" className={JIEYU_MATERIAL_INLINE_TIGHT} />
        </button>
      )}
    </div>
  );
});
