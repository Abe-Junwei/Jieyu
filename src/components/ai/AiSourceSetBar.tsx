import { memo, useCallback, useState } from 'react';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE_TIGHT } from '../../utils/jieyuMaterialIcon';
import { t, type Locale } from '../../i18n';
import type { SavedCorpusSourceSet, SourceSetMemberType } from '../../ai/vertical/corpusSourceSet';

interface AiSourceSetBarProps {
  sourceSets: readonly SavedCorpusSourceSet[];
  activeSourceSetId: string | null;
  locale: Locale;
  onSelectSourceSet?: ((id: string) => void) | undefined;
  onCreateSourceSet?: (() => void) | undefined;
  onAddMember?: ((setId: string, member: { id: string; type: SourceSetMemberType; label?: string }) => void) | undefined;
  onRemoveMember?: ((setId: string, memberId: string) => void) | undefined;
}

const MEMBER_TYPE_OPTIONS: SourceSetMemberType[] = [
  'segment',
  'layer',
  'note',
  'document',
  'lexeme',
  'audio_region',
];

export const AiSourceSetBar = memo(function AiSourceSetBar({
  sourceSets,
  activeSourceSetId,
  locale,
  onSelectSourceSet,
  onCreateSourceSet,
  onAddMember,
  onRemoveMember,
}: AiSourceSetBarProps) {
  const activeSet = sourceSets.find((s) => s.id === activeSourceSetId);
  const displaySets = sourceSets.filter((s) => s.status !== 'invalidated');
  const [showMembers, setShowMembers] = useState(false);
  const [newMemberId, setNewMemberId] = useState('');
  const [newMemberType, setNewMemberType] = useState<SourceSetMemberType>('segment');

  const handleAddMember = useCallback(() => {
    if (!activeSet || !onAddMember || !newMemberId.trim()) return;
    onAddMember(activeSet.id, { id: newMemberId.trim(), type: newMemberType });
    setNewMemberId('');
  }, [activeSet, onAddMember, newMemberId, newMemberType]);

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
      {activeSet && onRemoveMember && (
        <button
          type="button"
          className="ai-source-set-bar__action"
          onClick={() => setShowMembers((prev) => !prev)}
          title={showMembers ? 'Hide members' : 'Show members'}
        >
          <MaterialSymbol
            name={showMembers ? 'expand_less' : 'expand_more'}
            className={JIEYU_MATERIAL_INLINE_TIGHT}
          />
        </button>
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
      {showMembers && activeSet && (
        <div className="ai-source-set-bar__members">
          {activeSet.members.length === 0 && (
            <div className="ai-source-set-bar__members-empty">No members</div>
          )}
          {activeSet.members.map((member) => (
            <div key={member.id} className="ai-source-set-bar__member">
              <span className="ai-source-set-bar__member-type">{member.type}</span>
              <span className="ai-source-set-bar__member-label">
                {member.label ?? member.id}
              </span>
              {onRemoveMember && (
                <button
                  type="button"
                  className="ai-source-set-bar__member-remove"
                  onClick={() => onRemoveMember(activeSet.id, member.id)}
                  title="Remove member"
                >
                  <MaterialSymbol name="close" className={JIEYU_MATERIAL_INLINE_TIGHT} />
                </button>
              )}
            </div>
          ))}
          {onAddMember && (
            <div className="ai-source-set-bar__member-add">
              <input
                type="text"
                className="ai-source-set-bar__member-input"
                value={newMemberId}
                onChange={(e) => setNewMemberId(e.target.value)}
                placeholder="Member ID"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddMember();
                }}
              />
              <select
                className="ai-source-set-bar__member-type-select"
                value={newMemberType}
                onChange={(e) => setNewMemberType(e.target.value as SourceSetMemberType)}
              >
                {MEMBER_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ai-source-set-bar__member-add-btn"
                onClick={handleAddMember}
                disabled={!newMemberId.trim()}
              >
                <MaterialSymbol name="add" className={JIEYU_MATERIAL_INLINE_TIGHT} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
