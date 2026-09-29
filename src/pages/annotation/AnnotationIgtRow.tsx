import { Link } from 'react-router-dom';
import { t, tf, useLocale } from '../../i18n';
import type { AnnotationIgtRow, AnnotationIgtToken } from '../useAnnotationWorkspaceController';
import type { AnnotationMorphologyController } from '../useAnnotationMorphologyController';
import { annotationGlossHasLeipzigIssue } from './annotationLeipzigGloss';
import { displayedAnnotationMorphemeFields } from './annotationMorphemeDrafts';
import { displayedAnnotationTokenFields, type AnnotationTokenDraft } from './annotationTokenDrafts';
import { AnnotationIgtUnitExtras } from './AnnotationIgtUnitExtras';
import type { AnnotationUnitMetaController } from '../useAnnotationUnitMetaController';
import type { AnnotationAutoGlossController } from '../useAnnotationAutoGlossController';
import type { AnnotationRetokenizeController } from '../useAnnotationRetokenizeController';
import type { AnnotationValidatorPanelController } from '../useAnnotationValidatorPanelController';

type Props = {
  row: AnnotationIgtRow;
  focused: boolean;
  inputFocused: boolean;
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
  morphology: AnnotationMorphologyController;
  unitMeta?: AnnotationUnitMetaController;
  autoGloss?: AnnotationAutoGlossController;
  retokenize?: AnnotationRetokenizeController;
  validator?: AnnotationValidatorPanelController;
  playing?: boolean;
  onPlay?: (unitId: string) => void;
  onFocusRow: (unitId: string) => void;
  onFocusInput: (unitId: string) => void;
  onTokenDraftChange: (
    unitId: string,
    tokenId: string,
    field: keyof AnnotationTokenDraft,
    value: string,
  ) => void;
  mweSelectedIds?: readonly string[];
  mweError?: '' | 'dirty' | 'contiguous' | 'failed';
  onToggleMweToken?: (unitId: string, tokenId: string) => void;
  onConfirmMwe?: (unitId: string) => void;
  onExportAnalysis?: (unitId: string, kind: 'cldf' | 'conllu' | 'ligt') => void;
};

function lexemeLinkLabel(
  locale: ReturnType<typeof useLocale>,
  link: NonNullable<AnnotationMorphologyController['linksByTokenId'][string]>,
): string {
  if (link.brokenCode) return t(locale, 'workspace.annotation.lexemeBroken');
  return tf(locale, 'workspace.annotation.lexemeLinked', { lemma: link.lemma });
}

function TokenStack({
  token,
  unitId,
  inputFocused,
  drafts,
  morphology,
  onFocusInput,
  onTokenDraftChange,
  mweSelected = false,
  onToggleMweToken,
}: {
  token: AnnotationIgtToken;
  unitId: string;
  inputFocused: boolean;
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
  morphology: AnnotationMorphologyController;
  onFocusInput: (unitId: string) => void;
  onTokenDraftChange: Props['onTokenDraftChange'];
  mweSelected?: boolean;
  onToggleMweToken?: (unitId: string, tokenId: string) => void;
}) {
  const locale = useLocale();
  const fields = displayedAnnotationTokenFields(token, drafts);
  const morphs = morphology.morphsByTokenId[token.id] ?? [];
  const link = morphology.linksByTokenId[token.id];
  const glossInvalid = annotationGlossHasLeipzigIssue(fields.gloss);
  return (
    <span className="annotation-igt-stack">
      {onToggleMweToken ? (
        <input
          type="checkbox"
          data-testid={`annotation-igt-mwe-${token.id}`}
          checked={mweSelected}
          aria-label={t(locale, 'workspace.annotation.markMwe')}
          onClick={(event) => event.stopPropagation()}
          onChange={() => onToggleMweToken(unitId, token.id)}
        />
      ) : null}
      <span className="annotation-igt-form">{token.form}</span>
      {inputFocused ? (
        <>
          <input
            className="annotation-igt-field"
            data-testid={`annotation-igt-pos-${token.id}`}
            aria-label={t(locale, 'workspace.annotation.posLabel')}
            value={fields.pos}
            onClick={(event) => event.stopPropagation()}
            onFocus={() => onFocusInput(unitId)}
            onChange={(event) => onTokenDraftChange(unitId, token.id, 'pos', event.target.value)}
          />
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
            onClick={(event) => event.stopPropagation()}
            onFocus={() => onFocusInput(unitId)}
            onChange={(event) => onTokenDraftChange(unitId, token.id, 'gloss', event.target.value)}
          />
          <span className="annotation-igt-actions">
            <button
              type="button"
              className="annotation-igt-action"
              data-testid={`annotation-igt-split-${token.id}`}
              onClick={(event) => {
                event.stopPropagation();
                morphology.onSplitToken(unitId, token.id);
              }}
            >
              {t(locale, 'workspace.annotation.tokenSplit')}
            </button>
            <button
              type="button"
              className="annotation-igt-action"
              data-testid={`annotation-igt-merge-${token.id}`}
              onClick={(event) => {
                event.stopPropagation();
                morphology.onMergeToken(unitId, token.id);
              }}
            >
              {t(locale, 'workspace.annotation.tokenMerge')}
            </button>
          </span>
          <span className="annotation-igt-morphs">
            {morphs.length === 0 ? (
              <button
                type="button"
                className="annotation-igt-action"
                data-testid={`annotation-igt-seed-morph-${token.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  morphology.onSeedMorphemes(unitId, token.id, token.form);
                }}
              >
                {t(locale, 'workspace.annotation.morphemeSeed')}
              </button>
            ) : (
              <>
                {morphs.map((morph) => {
                  const morphFields = displayedAnnotationMorphemeFields(morph, morphology.drafts);
                  const morphInvalid = annotationGlossHasLeipzigIssue(morphFields.gloss);
                  return (
                    <span key={morph.id} className="annotation-igt-morph">
                      <input
                        className="annotation-igt-field"
                        data-testid={`annotation-igt-morph-form-${morph.id}`}
                        aria-label={t(locale, 'workspace.annotation.morphemeFormLabel')}
                        value={morphFields.form}
                        onClick={(event) => event.stopPropagation()}
                        onFocus={() => onFocusInput(unitId)}
                        onChange={(event) =>
                          morphology.onMorphDraftChange(morph.id, 'form', event.target.value)
                        }
                      />
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
                        onClick={(event) => event.stopPropagation()}
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
                    </span>
                  );
                })}
                <button
                  type="button"
                  className="annotation-igt-action"
                  data-testid={`annotation-igt-save-morph-${token.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    morphology.onSaveMorphemes(unitId, token.id);
                  }}
                >
                  {t(locale, 'workspace.annotation.morphemeSave')}
                </button>
              </>
            )}
          </span>
          <label className="annotation-igt-lexeme">
            <span>{t(locale, 'workspace.annotation.lexemeLinkLabel')}</span>
            <input
              className="annotation-igt-field"
              data-testid={`annotation-igt-lexeme-${token.id}`}
              value={morphology.linkQueries[token.id] ?? ''}
              onClick={(event) => event.stopPropagation()}
              onFocus={() => onFocusInput(unitId)}
              onChange={(event) => morphology.onLinkQueryChange(token.id, event.target.value)}
            />
            <button
              type="button"
              className="annotation-igt-action"
              data-testid={`annotation-igt-link-${token.id}`}
              onClick={(event) => {
                event.stopPropagation();
                morphology.onLinkLexeme(token.id);
              }}
            >
              {t(locale, 'workspace.annotation.lexemeLink')}
            </button>
            {link ? (
              <button
                type="button"
                className="annotation-igt-action"
                data-testid={`annotation-igt-unlink-${token.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  morphology.onUnlinkLexeme(token.id);
                }}
              >
                {lexemeLinkLabel(locale, link)}
              </button>
            ) : null}
          </label>
        </>
      ) : (
        <>
          <span className="annotation-igt-pos">{fields.pos}</span>
          <span className="annotation-igt-gloss">{fields.gloss}</span>
          {morphs.length > 0 ? (
            <span className="annotation-igt-gloss">
              {morphs.map((morph) => morph.form).join('-')}
            </span>
          ) : null}
          {link ? (
            <span
              className="annotation-igt-gloss"
              data-testid={
                link.brokenCode
                  ? `annotation-igt-lexeme-broken-${token.id}`
                  : `annotation-igt-lexeme-linked-${token.id}`
              }
            >
              {lexemeLinkLabel(locale, link)}
            </span>
          ) : null}
        </>
      )}
    </span>
  );
}

export function AnnotationIgtRowView({
  row,
  focused,
  inputFocused,
  drafts,
  morphology,
  unitMeta,
  autoGloss,
  retokenize,
  validator,
  playing = false,
  onPlay,
  onFocusRow,
  onFocusInput,
  onTokenDraftChange,
  mweSelectedIds,
  mweError = '',
  onToggleMweToken,
  onConfirmMwe,
  onExportAnalysis,
}: Props) {
  const locale = useLocale();
  return (
    <li
      className={focused ? 'annotation-igt-row annotation-igt-row-focused' : 'annotation-igt-row'}
      data-testid={`annotation-igt-row-${row.id}`}
      onClick={() => onFocusRow(row.id)}
    >
      <div className="annotation-igt-meta">
        <span className="annotation-igt-time">{row.timeLabel}</span>
        <Link className="annotation-igt-link" to={row.transcriptionHref}>
          {t(locale, 'workspace.annotation.openInTranscription')}
        </Link>
      </div>
      <p className="annotation-igt-label">{t(locale, 'workspace.annotation.surfaceLabel')}</p>
      <div className="annotation-igt-tokens">
        {row.tokens.length > 0 ? (
          row.tokens.map((token) => (
            <TokenStack
              key={token.id}
              token={token}
              unitId={row.id}
              inputFocused={focused && inputFocused}
              drafts={drafts}
              morphology={morphology}
              onFocusInput={onFocusInput}
              onTokenDraftChange={onTokenDraftChange}
              mweSelected={mweSelectedIds?.includes(token.id) ?? false}
              {...(focused && onToggleMweToken ? { onToggleMweToken } : {})}
            />
          ))
        ) : (
          <span className="annotation-igt-stack">
            <span className="annotation-igt-form">
              {row.surface.length > 0 ? row.surface : row.id}
            </span>
            <span className="annotation-igt-gloss"> </span>
          </span>
        )}
      </div>
      {focused && onConfirmMwe && (mweSelectedIds?.length ?? 0) >= 2 ? (
        <button
          type="button"
          className="annotation-igt-action"
          data-testid={`annotation-igt-mwe-confirm-${row.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onConfirmMwe(row.id);
          }}
        >
          {t(locale, 'workspace.annotation.markMwe')}
        </button>
      ) : null}
      {focused && mweError.length > 0 ? (
        <p className="annotation-igt-label" data-testid={`annotation-igt-mwe-error-${row.id}`}>
          {mweError === 'dirty'
            ? t(locale, 'workspace.annotation.mweDirty')
            : mweError === 'contiguous'
              ? t(locale, 'workspace.annotation.mweContiguous')
              : t(locale, 'workspace.annotation.mweFailed')}
        </p>
      ) : null}
      {focused && onExportAnalysis ? (
        <div className="annotation-igt-extras-actions">
          {(['cldf', 'conllu', 'ligt'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className="annotation-igt-action"
              data-testid={`annotation-igt-export-${kind}-${row.id}`}
              onClick={(event) => {
                event.stopPropagation();
                onExportAnalysis(row.id, kind);
              }}
            >
              {t(
                locale,
                kind === 'cldf'
                  ? 'workspace.annotation.exportCldf'
                  : kind === 'conllu'
                    ? 'workspace.annotation.exportConllu'
                    : 'workspace.annotation.exportLigt',
              )}
            </button>
          ))}
        </div>
      ) : null}
      <p className="annotation-igt-label">{t(locale, 'workspace.annotation.translationLabel')}</p>
      <p className="annotation-igt-translation">
        {row.translation.length > 0
          ? row.translation
          : t(locale, 'workspace.annotation.translationEmpty')}
      </p>
      {focused && unitMeta && autoGloss && retokenize && validator && onPlay ? (
        <AnnotationIgtUnitExtras
          unitId={row.id}
          playing={playing}
          matches={autoGloss.previewUnitId === row.id ? autoGloss.matches : []}
          unitMeta={unitMeta}
          autoGloss={autoGloss}
          retokenize={retokenize}
          validator={validator}
          onPlay={onPlay}
          onFocusInput={onFocusInput}
        />
      ) : null}
    </li>
  );
}
