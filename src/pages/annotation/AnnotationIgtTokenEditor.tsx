import { useState } from 'react';
import { t, tf, useLocale } from '../../i18n';
import { UD_POS_TAGS } from '../../annotation/udPosTags';
import type { AnnotationIgtToken } from '../useAnnotationWorkspaceController';
import type { AnnotationMorphologyController } from '../useAnnotationMorphologyController';
import type { AnnotationTokenDraft } from './annotationTokenDrafts';
import { displayedAnnotationTokenFields } from './annotationTokenDrafts';
import { displayedAnnotationMorphemeFields } from './annotationMorphemeDrafts';
import { annotationGlossHasLeipzigIssue } from './annotationLeipzigGloss';

export function lexemeLinkLabel(
  locale: ReturnType<typeof useLocale>,
  link: NonNullable<AnnotationMorphologyController['linksByTokenId'][string]>,
): string {
  if (link.brokenCode) return t(locale, 'workspace.annotation.lexemeBroken');
  return tf(locale, 'workspace.annotation.lexemeLinked', { lemma: link.lemma });
}

export function AnnotationIgtTokenEditor({
  token,
  unitId,
  drafts,
  morphology,
  onFocusInput,
  onTokenDraftChange,
  onSaveTokenLanguage,
  onApplyPosByForm,
  onAddAlternative,
  onMarkRootPattern,
  onSplit,
  onMerge,
  onCite,
  glossSuggestion = '',
  onAcceptGlossSuggestion,
}: {
  token: AnnotationIgtToken;
  unitId: string;
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
  morphology: AnnotationMorphologyController;
  onFocusInput: (unitId: string) => void;
  onTokenDraftChange: (
    unitId: string,
    tokenId: string,
    field: keyof AnnotationTokenDraft,
    value: string,
  ) => void;
  onSaveTokenLanguage?: (unitId: string, tokenId: string, languageId: string) => void;
  onApplyPosByForm?: (unitId: string, tokenId: string, pos: string) => void;
  onAddAlternative?: (unitId: string, tokenId: string, pos: string) => void;
  onMarkRootPattern?: (unitId: string, tokenId: string, root: string, pattern: string) => void;
  onSplit?: () => void;
  onMerge?: () => void;
  onCite?: () => void;
  glossSuggestion?: string;
  onAcceptGlossSuggestion?: (unitId: string, tokenId: string, gloss: string, lang: string) => void;
}) {
  const locale = useLocale();
  const [rootLabel, setRootLabel] = useState('');
  const [patternLabel, setPatternLabel] = useState('');
  const [showRoot, setShowRoot] = useState(false);
  const fields = displayedAnnotationTokenFields(token, drafts);
  const morphs = morphology.morphsByTokenId[token.id] ?? [];
  const link = morphology.linksByTokenId[token.id];
  const glossInvalid = annotationGlossHasLeipzigIssue(fields.gloss);
  return (
    <div
      className="annotation-igt-editor"
      data-testid={`annotation-igt-editor-${token.id}`}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="annotation-igt-editor-word">{token.form}</p>
      <div className="annotation-igt-editor-fields">
        <label className="annotation-igt-editor-field">
          <span>{t(locale, 'workspace.annotation.tokenLanguage')}</span>
          <input
            className="annotation-igt-field"
            data-testid={`annotation-igt-language-${token.id}`}
            aria-label={t(locale, 'workspace.annotation.tokenLanguage')}
            defaultValue={token.languageId ?? ''}
            onFocus={() => onFocusInput(unitId)}
            onBlur={(event) => onSaveTokenLanguage?.(unitId, token.id, event.target.value)}
          />
        </label>
        <label className="annotation-igt-editor-field">
          <span>{t(locale, 'workspace.annotation.posLabel')}</span>
          <input
            className="annotation-igt-field"
            data-testid={`annotation-igt-pos-${token.id}`}
            aria-label={t(locale, 'workspace.annotation.posLabel')}
            list={`annotation-pos-list-${token.id}`}
            value={fields.pos}
            onFocus={() => onFocusInput(unitId)}
            onChange={(event) => onTokenDraftChange(unitId, token.id, 'pos', event.target.value)}
          />
          <datalist id={`annotation-pos-list-${token.id}`}>
            {UD_POS_TAGS.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </label>
        <label className="annotation-igt-editor-field">
          <span>{t(locale, 'workspace.annotation.lineGloss')}</span>
          <input
            className={
              glossInvalid
                ? 'annotation-igt-field annotation-igt-field-invalid'
                : 'annotation-igt-field'
            }
            data-testid={`annotation-igt-gloss-${token.id}`}
            aria-label={t(locale, 'workspace.annotation.glossLabel')}
            aria-invalid={glossInvalid}
            value={fields.gloss}
            title={t(locale, 'workspace.annotation.keyboardHint')}
            {...(fields.gloss.trim().length === 0 && glossSuggestion
              ? { placeholder: glossSuggestion }
              : {})}
            onFocus={() => onFocusInput(unitId)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.currentTarget.value.trim() || !glossSuggestion) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              onAcceptGlossSuggestion?.(unitId, token.id, glossSuggestion, token.glossLang);
            }}
            onChange={(event) => onTokenDraftChange(unitId, token.id, 'gloss', event.target.value)}
          />
        </label>
      </div>
      {onApplyPosByForm && fields.pos.trim().length > 0 ? (
        <button
          type="button"
          className="annotation-igt-action"
          data-testid={`annotation-igt-pos-apply-${token.id}`}
          onClick={() => onApplyPosByForm(unitId, token.id, fields.pos.trim())}
        >
          {t(locale, 'workspace.annotation.applyPosByForm')}
        </button>
      ) : null}
      {onAddAlternative && token.pos.trim().length > 0 && fields.pos.trim() !== token.pos.trim() ? (
        <button
          type="button"
          className="annotation-igt-action"
          data-testid={`annotation-igt-alt-add-${token.id}`}
          onClick={() => onAddAlternative(unitId, token.id, fields.pos.trim())}
        >
          {t(locale, 'workspace.annotation.addAlternative')}
        </button>
      ) : null}
      <span className="annotation-igt-actions">
        {onSplit ? (
          <button
            type="button"
            className="annotation-igt-action"
            data-testid={`annotation-igt-split-${token.id}`}
            onClick={onSplit}
          >
            {t(locale, 'workspace.annotation.tokenSplit')}
          </button>
        ) : null}
        {onMerge ? (
          <button
            type="button"
            className="annotation-igt-action"
            data-testid={`annotation-igt-merge-${token.id}`}
            onClick={onMerge}
          >
            {t(locale, 'workspace.annotation.tokenMerge')}
          </button>
        ) : null}
        {onCite ? (
          <button
            type="button"
            className="annotation-igt-action"
            data-testid={`annotation-igt-cite-${token.id}`}
            onClick={onCite}
          >
            {t(locale, 'workspace.annotation.citeExample')}
          </button>
        ) : null}
      </span>
      {morphs.length > 0 ? (
        <span className="annotation-igt-morphs">
          {morphs.map((morph) => {
            const morphFields = displayedAnnotationMorphemeFields(morph, morphology.drafts);
            const morphInvalid = annotationGlossHasLeipzigIssue(morphFields.gloss);
            return (
              <span key={morph.id} className="annotation-igt-morph">
                <label className="annotation-igt-editor-field">
                  <span>{t(locale, 'workspace.annotation.morphemeFormLabel')}</span>
                  <input
                    className="annotation-igt-field"
                    data-testid={`annotation-igt-morph-form-${morph.id}`}
                    aria-label={t(locale, 'workspace.annotation.morphemeFormLabel')}
                    value={morphFields.form}
                    onFocus={() => onFocusInput(unitId)}
                    onChange={(event) =>
                      morphology.onMorphDraftChange(morph.id, 'form', event.target.value)
                    }
                  />
                </label>
                <label className="annotation-igt-editor-field">
                  <span>{t(locale, 'workspace.annotation.morphemeGlossLabel')}</span>
                  <input
                    className={
                      morphInvalid
                        ? 'annotation-igt-field annotation-igt-field-invalid'
                        : 'annotation-igt-field'
                    }
                    data-testid={`annotation-igt-morph-gloss-${morph.id}`}
                    aria-label={t(locale, 'workspace.annotation.morphemeGlossLabel')}
                    aria-invalid={morphInvalid}
                    value={morphFields.gloss}
                    onFocus={() => onFocusInput(unitId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.stopPropagation();
                        morphology.onSaveMorphemes(unitId, token.id);
                      }
                    }}
                    onChange={(event) =>
                      morphology.onMorphDraftChange(morph.id, 'gloss', event.target.value)
                    }
                  />
                </label>
                <label className="annotation-igt-editor-field">
                  <span>{t(locale, 'workspace.annotation.spanLabel')}</span>
                  <input
                    className="annotation-igt-field"
                    data-testid={`annotation-igt-morph-spans-${morph.id}`}
                    aria-label={t(locale, 'workspace.annotation.spanLabel')}
                    value={morphFields.spans}
                    onFocus={() => onFocusInput(unitId)}
                    onChange={(event) =>
                      morphology.onMorphDraftChange(morph.id, 'spans', event.target.value)
                    }
                  />
                </label>
              </span>
            );
          })}
          <button
            type="button"
            className="annotation-igt-action"
            data-testid={`annotation-igt-save-morph-${token.id}`}
            onClick={() => morphology.onSaveMorphemes(unitId, token.id)}
          >
            {t(locale, 'workspace.annotation.morphemeSave')}
          </button>
        </span>
      ) : null}
      <label className="annotation-igt-lexeme">
        <span>{t(locale, 'workspace.annotation.lexemeLinkLabel')}</span>
        <input
          className="annotation-igt-field"
          data-testid={`annotation-igt-lexeme-${token.id}`}
          value={morphology.linkQueries[token.id] ?? ''}
          onFocus={() => onFocusInput(unitId)}
          onChange={(event) => morphology.onLinkQueryChange(token.id, event.target.value)}
        />
        <button
          type="button"
          className="annotation-igt-action"
          data-testid={`annotation-igt-link-${token.id}`}
          onClick={() => morphology.onLinkLexeme(token.id)}
        >
          {t(locale, 'workspace.annotation.lexemeLink')}
        </button>
        {link ? (
          <button
            type="button"
            className="annotation-igt-action"
            data-testid={`annotation-igt-unlink-${token.id}`}
            onClick={() => morphology.onUnlinkLexeme(token.id)}
          >
            {lexemeLinkLabel(locale, link)}
          </button>
        ) : null}
        {(morphology.senseChoicesByTokenId[token.id] ?? []).map((choice) => (
          <button
            key={choice.senseId}
            type="button"
            className="annotation-igt-action"
            data-testid={`annotation-igt-sense-${token.id}-${choice.senseId}`}
            onClick={() => morphology.onChooseLexemeSense(token.id, choice.senseId)}
          >
            {tf(locale, 'workspace.annotation.chooseSense', { label: choice.label })}
          </button>
        ))}
        {link?.senseGloss && link.senseGloss.trim() !== fields.gloss.trim() ? (
          <span
            className="annotation-igt-hint"
            data-testid={`annotation-igt-sense-gloss-${token.id}`}
          >
            {tf(locale, 'workspace.annotation.senseGlossHint', { gloss: link.senseGloss })}
          </span>
        ) : null}
      </label>
      {onMarkRootPattern ? (
        showRoot ? (
          <span className="annotation-igt-editor-fields">
            <label className="annotation-igt-editor-field">
              <span>{t(locale, 'workspace.annotation.rootLabel')}</span>
              <input
                className="annotation-igt-field"
                data-testid={`annotation-igt-root-${token.id}`}
                aria-label={t(locale, 'workspace.annotation.rootLabel')}
                value={rootLabel}
                onChange={(event) => setRootLabel(event.target.value)}
              />
            </label>
            <label className="annotation-igt-editor-field">
              <span>{t(locale, 'workspace.annotation.patternLabel')}</span>
              <input
                className="annotation-igt-field"
                data-testid={`annotation-igt-pattern-${token.id}`}
                aria-label={t(locale, 'workspace.annotation.patternLabel')}
                value={patternLabel}
                onChange={(event) => setPatternLabel(event.target.value)}
              />
            </label>
            {rootLabel.trim().length > 0 && patternLabel.trim().length > 0 ? (
              <button
                type="button"
                className="annotation-igt-action"
                data-testid={`annotation-igt-root-pattern-${token.id}`}
                onClick={() => {
                  onMarkRootPattern(unitId, token.id, rootLabel.trim(), patternLabel.trim());
                }}
              >
                {t(locale, 'workspace.annotation.markRootPattern')}
              </button>
            ) : null}
          </span>
        ) : (
          <button
            type="button"
            className="annotation-igt-action"
            data-testid={`annotation-igt-root-open-${token.id}`}
            onClick={() => setShowRoot(true)}
          >
            {t(locale, 'workspace.annotation.markRootPattern')}
          </button>
        )
      ) : null}
    </div>
  );
}
