import { t, tf, useLocale } from '../../i18n';
import { UNIT_SELF_CERTAINTY_VALUES } from '../../utils/unitSelfCertainty';
import type { AutoGlossPreviewMatch } from '../../ai/autoGlossPreview';
import { pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';
import type { AnnotationUnitMetaController } from '../useAnnotationUnitMetaController';
import type { AnnotationRetokenizeController } from '../useAnnotationRetokenizeController';
import type { AnnotationValidatorPanelController } from '../useAnnotationValidatorPanelController';

type Props = {
  unitId: string;
  matches: readonly AutoGlossPreviewMatch[];
  unitMeta: AnnotationUnitMetaController;
  retokenize: AnnotationRetokenizeController;
  validator: AnnotationValidatorPanelController;
  onFocusInput: (unitId: string) => void;
  showNote: boolean;
  showCertainty: boolean;
  showReadouts?: boolean;
  turn?: {
    addressee?: string;
    ungrammatical?: boolean;
    actualForm?: string;
    targetForm?: string;
  };
};

function TurnFields({
  unitId,
  unitMeta,
  turn,
  onFocusInput,
}: {
  unitId: string;
  unitMeta: AnnotationUnitMetaController;
  turn?: {
    addressee?: string;
    ungrammatical?: boolean;
    actualForm?: string;
    targetForm?: string;
  };
  onFocusInput: (unitId: string) => void;
}) {
  const locale = useLocale();
  const save = (patch: {
    ungrammatical?: boolean;
    addressee?: string;
    actualForm?: string;
    targetForm?: string;
  }) =>
    unitMeta.onSaveTurn({
      ungrammatical: patch.ungrammatical ?? turn?.ungrammatical === true,
      addressee: patch.addressee ?? turn?.addressee ?? '',
      actualForm: patch.actualForm ?? turn?.actualForm ?? '',
      targetForm: patch.targetForm ?? turn?.targetForm ?? '',
    });
  return (
    <>
      <label className="annotation-igt-extra-field">
        <span>{t(locale, 'workspace.annotation.ungrammatical')}</span>
        <input
          type="checkbox"
          data-testid={`annotation-igt-ungrammatical-input-${unitId}`}
          defaultChecked={turn?.ungrammatical === true}
          onClick={(event) => event.stopPropagation()}
          onFocus={() => onFocusInput(unitId)}
          onChange={(event) => save({ ungrammatical: event.target.checked })}
        />
      </label>
      <label className="annotation-igt-extra-field">
        <span>{t(locale, 'workspace.annotation.addressee')}</span>
        <input
          className="annotation-igt-field"
          data-testid={`annotation-igt-addressee-${unitId}`}
          defaultValue={turn?.addressee ?? ''}
          onClick={(event) => event.stopPropagation()}
          onFocus={() => onFocusInput(unitId)}
          onBlur={(event) => save({ addressee: event.target.value })}
        />
      </label>
      <label className="annotation-igt-extra-field">
        <span>{t(locale, 'workspace.annotation.actualForm')}</span>
        <input
          className="annotation-igt-field"
          defaultValue={turn?.actualForm ?? ''}
          onClick={(event) => event.stopPropagation()}
          onFocus={() => onFocusInput(unitId)}
          onBlur={(event) => save({ actualForm: event.target.value })}
        />
      </label>
      <label className="annotation-igt-extra-field">
        <span>{t(locale, 'workspace.annotation.targetForm')}</span>
        <input
          className="annotation-igt-field"
          defaultValue={turn?.targetForm ?? ''}
          onClick={(event) => event.stopPropagation()}
          onFocus={() => onFocusInput(unitId)}
          onBlur={(event) => save({ targetForm: event.target.value })}
        />
      </label>
    </>
  );
}

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
  matches,
  unitMeta,
  retokenize,
  validator,
  onFocusInput,
  showNote,
  showCertainty,
  showReadouts = true,
  turn,
}: Props) {
  const locale = useLocale();
  const retokenizePreviewActive = retokenize.previewUnitId === unitId;
  const showValidator =
    showReadouts &&
    validator.unitId === unitId &&
    (validator.pending || validator.errorMessage.length > 0 || validator.items.length > 0);
  const showProposal =
    showReadouts && retokenizePreviewActive && retokenize.proposedForms.length > 0;
  const showMatches = showReadouts && matches.length > 0;
  if (!showNote && !showCertainty && !showMatches && !showValidator && !showProposal) {
    return null;
  }
  return (
    <div className="annotation-igt-extras" onClick={(event) => event.stopPropagation()}>
      {showNote ? (
        <>
          <label className="annotation-igt-extra-field">
            <span>{t(locale, 'workspace.annotation.transcriptionNote')}</span>
            <textarea
              className="annotation-igt-note"
              data-testid={`annotation-igt-source-note-${unitId}`}
              defaultValue={
                unitMeta.notes.find((note) => note.category === 'comment')?.content ?? ''
              }
              onClick={(event) => event.stopPropagation()}
              onBlur={(event) => unitMeta.onSaveCategorizedNote('comment', event.target.value)}
            />
          </label>
          <label className="annotation-igt-extra-field">
            <span>{t(locale, 'workspace.annotation.translationNote')}</span>
            <textarea
              className="annotation-igt-note"
              data-testid={`annotation-igt-translation-note-${unitId}`}
              defaultValue={unitMeta.notes.find((note) => note.category === 'topic')?.content ?? ''}
              onClick={(event) => event.stopPropagation()}
              onBlur={(event) => unitMeta.onSaveCategorizedNote('topic', event.target.value)}
            />
          </label>
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
        </>
      ) : null}
      {showCertainty ? (
        <>
          <TurnFields
            unitId={unitId}
            unitMeta={unitMeta}
            {...(turn ? { turn } : {})}
            onFocusInput={onFocusInput}
          />
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
        </>
      ) : null}
      {showMatches ? (
        <p className="annotation-igt-autogloss" data-testid={`annotation-igt-autogloss-${unitId}`}>
          {matches
            .map((match) =>
              tf(locale, 'workspace.annotation.autoGlossMatch', {
                form: pickDefaultTranscriptionText(match.tokenForm),
                gloss: pickDefaultTranscriptionText(match.gloss),
              }),
            )
            .join(' · ')}
        </p>
      ) : null}
      {showValidator ? (
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
      {showProposal ? (
        <p className="annotation-igt-autogloss" data-testid={`annotation-igt-retokenize-${unitId}`}>
          {tf(locale, 'workspace.annotation.retokenizeProposal', {
            forms: retokenize.proposedForms.join(' · '),
          })}
        </p>
      ) : null}
    </div>
  );
}
