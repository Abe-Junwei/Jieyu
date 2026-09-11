import { t, tf, useLocale } from '../../i18n';
import { UNIT_SELF_CERTAINTY_VALUES } from '../../utils/unitSelfCertainty';
import type { AutoGlossPreviewMatch } from '../../ai/autoGlossPreview';
import { pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';
import type { AnnotationUnitMetaController } from '../useAnnotationUnitMetaController';
import type { AnnotationAutoGlossController } from '../useAnnotationAutoGlossController';

type Props = {
  unitId: string;
  playing: boolean;
  matches: readonly AutoGlossPreviewMatch[];
  unitMeta: AnnotationUnitMetaController;
  autoGloss: AnnotationAutoGlossController;
  onPlay: (unitId: string) => void;
  onFocusInput: (unitId: string) => void;
};

function noteCategoryLabel(
  locale: ReturnType<typeof useLocale>,
  category: AnnotationUnitMetaController['noteCategory'],
): string {
  switch (category) {
    case 'question':
      return t(locale, 'workspace.annotation.noteCategory.question');
    case 'todo':
      return t(locale, 'workspace.annotation.noteCategory.todo');
    case 'linguistic':
      return t(locale, 'workspace.annotation.noteCategory.linguistic');
    case 'fieldwork':
      return t(locale, 'workspace.annotation.noteCategory.fieldwork');
    case 'correction':
      return t(locale, 'workspace.annotation.noteCategory.correction');
    default:
      return t(locale, 'workspace.annotation.noteCategory.comment');
  }
}

function certaintyLabel(
  locale: ReturnType<typeof useLocale>,
  value: (typeof UNIT_SELF_CERTAINTY_VALUES)[number],
): string {
  if (value === 'not_understood')
    return t(locale, 'workspace.annotation.selfCertainty.notUnderstood');
  if (value === 'uncertain') return t(locale, 'workspace.annotation.selfCertainty.uncertain');
  return t(locale, 'workspace.annotation.selfCertainty.certain');
}

export function AnnotationIgtUnitExtras({
  unitId,
  playing,
  matches,
  unitMeta,
  autoGloss,
  onPlay,
  onFocusInput,
}: Props) {
  const locale = useLocale();
  return (
    <div className="annotation-igt-extras">
      <div className="annotation-igt-extras-actions">
        <button
          type="button"
          className="annotation-igt-action"
          data-testid={`annotation-igt-play-${unitId}`}
          onClick={(event) => {
            event.stopPropagation();
            onPlay(unitId);
          }}
        >
          {playing
            ? t(locale, 'workspace.annotation.playing')
            : t(locale, 'workspace.annotation.play')}
        </button>
        <button
          type="button"
          className="annotation-igt-action"
          data-testid={`annotation-igt-autogloss-preview-${unitId}`}
          onClick={(event) => {
            event.stopPropagation();
            autoGloss.onPreview(unitId);
          }}
        >
          {t(locale, 'workspace.annotation.autoGlossPreview')}
        </button>
        <button
          type="button"
          className="annotation-igt-action"
          data-testid={`annotation-igt-autogloss-apply-${unitId}`}
          disabled={matches.length === 0}
          onClick={(event) => {
            event.stopPropagation();
            autoGloss.onApply(unitId);
          }}
        >
          {t(locale, 'workspace.annotation.autoGlossApply')}
        </button>
      </div>
      <label className="annotation-igt-extra-field">
        <span>{t(locale, 'workspace.annotation.noteLabel')}</span>
        <textarea
          className="annotation-igt-note"
          data-testid={`annotation-igt-note-${unitId}`}
          value={unitMeta.noteText}
          onClick={(event) => event.stopPropagation()}
          onFocus={() => onFocusInput(unitId)}
          onChange={(event) => unitMeta.onNoteTextChange(event.target.value)}
        />
      </label>
      <label className="annotation-igt-extra-field">
        <span>{t(locale, 'workspace.annotation.tagLabel')}</span>
        <select
          className="annotation-igt-field"
          data-testid={`annotation-igt-note-category-${unitId}`}
          value={unitMeta.noteCategory}
          onClick={(event) => event.stopPropagation()}
          onFocus={() => onFocusInput(unitId)}
          onChange={(event) =>
            unitMeta.onNoteCategoryChange(
              event.target.value as AnnotationUnitMetaController['noteCategory'],
            )
          }
        >
          {unitMeta.noteCategories.map((category) => (
            <option key={category} value={category}>
              {noteCategoryLabel(locale, category)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="annotation-igt-action"
          data-testid={`annotation-igt-note-save-${unitId}`}
          onClick={(event) => {
            event.stopPropagation();
            unitMeta.onSaveNote();
          }}
        >
          {t(locale, 'workspace.annotation.noteSave')}
        </button>
      </label>
      <label className="annotation-igt-extra-field">
        <span>{t(locale, 'workspace.annotation.selfCertaintyLabel')}</span>
        <select
          className="annotation-igt-field"
          data-testid={`annotation-igt-self-certainty-${unitId}`}
          value={unitMeta.selfCertainty}
          onClick={(event) => event.stopPropagation()}
          onFocus={() => onFocusInput(unitId)}
          onChange={(event) =>
            unitMeta.onSelfCertaintyChange(
              event.target.value as (typeof UNIT_SELF_CERTAINTY_VALUES)[number] | '',
            )
          }
        >
          <option value="">{t(locale, 'workspace.annotation.selfCertaintyNone')}</option>
          {UNIT_SELF_CERTAINTY_VALUES.map((value) => (
            <option key={value} value={value}>
              {certaintyLabel(locale, value)}
            </option>
          ))}
        </select>
      </label>
      <p className="annotation-igt-autogloss" data-testid={`annotation-igt-autogloss-${unitId}`}>
        {matches.length === 0
          ? t(locale, 'workspace.annotation.autoGlossEmpty')
          : matches
              .map((match) =>
                tf(locale, 'workspace.annotation.autoGlossMatch', {
                  form: pickDefaultTranscriptionText(match.tokenForm),
                  gloss: pickDefaultTranscriptionText(match.gloss),
                }),
              )
              .join(' · ')}
      </p>
    </div>
  );
}
