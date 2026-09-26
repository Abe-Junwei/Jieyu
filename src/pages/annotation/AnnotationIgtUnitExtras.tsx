import { t, tf, useLocale } from '../../i18n';
import { UNIT_SELF_CERTAINTY_VALUES } from '../../utils/unitSelfCertainty';
import type { AutoGlossPreviewMatch } from '../../ai/autoGlossPreview';
import { pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';
import type { AnnotationUnitMetaController } from '../useAnnotationUnitMetaController';
import type { AnnotationAutoGlossController } from '../useAnnotationAutoGlossController';
import type { AnnotationRetokenizeController } from '../useAnnotationRetokenizeController';
import type { AnnotationValidatorPanelController } from '../useAnnotationValidatorPanelController';

type Props = {
  unitId: string;
  playing: boolean;
  matches: readonly AutoGlossPreviewMatch[];
  unitMeta: AnnotationUnitMetaController;
  autoGloss: AnnotationAutoGlossController;
  retokenize: AnnotationRetokenizeController;
  validator: AnnotationValidatorPanelController;
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
  retokenize,
  validator,
  onPlay,
  onFocusInput,
}: Props) {
  const locale = useLocale();
  const retokenizePreviewActive = retokenize.previewUnitId === unitId;
  const retokenizeApplyDisabled =
    !retokenizePreviewActive || retokenize.unchanged || retokenize.proposedForms.length === 0;
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
        <button
          type="button"
          className="annotation-igt-action"
          data-testid={`annotation-igt-retokenize-preview-${unitId}`}
          onClick={(event) => {
            event.stopPropagation();
            retokenize.onPreview(unitId);
          }}
        >
          {t(locale, 'workspace.annotation.retokenizePreview')}
        </button>
        <button
          type="button"
          className="annotation-igt-action"
          data-testid={`annotation-igt-retokenize-apply-${unitId}`}
          disabled={retokenizeApplyDisabled}
          onClick={(event) => {
            event.stopPropagation();
            retokenize.onApply(unitId);
          }}
        >
          {t(locale, 'workspace.annotation.retokenizeApply')}
        </button>
        {retokenize.forceUnitId === unitId ? (
          <button
            type="button"
            className="annotation-igt-action"
            data-testid={`annotation-igt-retokenize-overwrite-${unitId}`}
            onClick={(event) => {
              event.stopPropagation();
              retokenize.onOverwrite(unitId);
            }}
          >
            {t(locale, 'workspace.annotation.retokenizeOverwrite')}
          </button>
        ) : null}
        {retokenize.snapshotUnitId === unitId ? (
          <button
            type="button"
            className="annotation-igt-action"
            data-testid={`annotation-igt-retokenize-restore-${unitId}`}
            onClick={(event) => {
              event.stopPropagation();
              retokenize.onRestore(unitId);
            }}
          >
            {t(locale, 'workspace.annotation.retokenizeRestore')}
          </button>
        ) : null}
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
      {validator.unitId === unitId ? (
        <div className="annotation-igt-autogloss" data-testid={`annotation-validator-${unitId}`}>
          <p>{t(locale, 'workspace.annotation.validatorPanelTitle')}</p>
          {validator.pending ? (
            <p>{t(locale, 'workspace.annotation.validatorPanelPending')}</p>
          ) : null}
          {validator.errorMessage.length > 0 ? (
            <p>
              {tf(locale, 'workspace.annotation.validatorPanelFailed', {
                message: validator.errorMessage,
              })}
            </p>
          ) : null}
          {validator.items.length === 0 &&
          !validator.pending &&
          validator.errorMessage.length === 0 ? (
            <p>{t(locale, 'workspace.annotation.validatorPanelEmpty')}</p>
          ) : null}
          {validator.items.map((item) => (
            <p key={item.tokenId} data-testid={`annotation-validator-token-${item.tokenId}`}>
              {item.form}: {item.gloss}
              {item.segments.length > 0
                ? ` · ${tf(locale, 'workspace.annotation.validatorPanelSegments', {
                    segments: item.segments.join(' · '),
                  })}`
                : ''}
              {` · ${
                item.needsReview
                  ? t(locale, 'workspace.annotation.validatorPanelReview')
                  : t(locale, 'workspace.annotation.validatorPanelReady')
              }`}
              {item.leipzigInvalid
                ? ` · ${t(locale, 'workspace.annotation.validatorPanelLeipzig')}`
                : ''}
              {item.warnings.length > 0 ? ` · ${item.warnings.join(' · ')}` : ''}
            </p>
          ))}
        </div>
      ) : null}
      <p className="annotation-igt-autogloss" data-testid={`annotation-igt-retokenize-${unitId}`}>
        {!retokenizePreviewActive || retokenize.proposedForms.length === 0
          ? t(locale, 'workspace.annotation.retokenizeEmpty')
          : tf(locale, 'workspace.annotation.retokenizeProposal', {
              forms: retokenize.proposedForms.join(' · '),
            })}
      </p>
    </div>
  );
}
