import { Link } from 'react-router-dom';
import { t, tf, useLocale } from '../../i18n';
import type { AnnotationIgtRow, AnnotationIgtToken } from '../useAnnotationWorkspaceController';
import type { AnnotationMorphologyController } from '../useAnnotationMorphologyController';
import { readAnalysisGraphView } from '../../annotation/analysisGraphView';
import { UD_POS_TAGS } from '../../annotation/udPosTags';
import type { AnnotationRelationMark } from '../useAnnotationRelationController';
import { buildAnnotationUtteranceGraph } from './buildAnnotationUtteranceGraph';
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
  onApplyPosByForm?: (unitId: string, tokenId: string, pos: string) => void;
  onMarkRelation?: (unitId: string, mark: AnnotationRelationMark) => void;
  onSelectAlternative?: (unitId: string, relationId: string) => void;
  relationError?: '' | 'dirty' | 'failed';
  alternativeError?: '' | 'dirty' | 'failed';
  posError?: '' | 'dirty' | 'failed';
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
  onApplyPosByForm,
  onMarkRelation,
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
  onApplyPosByForm?: Props['onApplyPosByForm'];
  onMarkRelation?: Props['onMarkRelation'];
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
            list={`annotation-pos-list-${token.id}`}
            value={fields.pos}
            onClick={(event) => event.stopPropagation()}
            onFocus={() => onFocusInput(unitId)}
            onChange={(event) => onTokenDraftChange(unitId, token.id, 'pos', event.target.value)}
          />
          <datalist id={`annotation-pos-list-${token.id}`}>
            {UD_POS_TAGS.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          {onApplyPosByForm && fields.pos.trim().length > 0 ? (
            <button
              type="button"
              className="annotation-igt-action"
              data-testid={`annotation-igt-pos-apply-${token.id}`}
              onClick={(event) => {
                event.stopPropagation();
                onApplyPosByForm(unitId, token.id, fields.pos.trim());
              }}
            >
              {t(locale, 'workspace.annotation.applyPosByForm')}
            </button>
          ) : null}
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
                      {onMarkRelation && morphs.indexOf(morph) > 0 ? (
                        <button
                          type="button"
                          className="annotation-igt-action"
                          data-testid={`annotation-igt-redup-${morph.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            const stem = morphs[morphs.indexOf(morph) - 1];
                            if (stem === undefined) return;
                            onMarkRelation(unitId, {
                              kind: 'reduplicates',
                              tokenId: token.id,
                              reduplicantId: morph.id,
                              stemId: stem.id,
                            });
                          }}
                        >
                          {t(locale, 'workspace.annotation.copiesPrevious')}
                        </button>
                      ) : null}
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
          {onMarkRelation ? (
            <span className="annotation-igt-actions">
              {link && link.brokenCode === undefined && link.lemma.trim().length > 0 ? (
                <button
                  type="button"
                  className="annotation-igt-action"
                  data-testid={`annotation-igt-suppletion-${token.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMarkRelation(unitId, {
                      kind: 'suppletes',
                      tokenId: token.id,
                      underlying: link.lemma,
                    });
                  }}
                >
                  {t(locale, 'workspace.annotation.markSuppletion')}
                </button>
              ) : null}
              {(
                [
                  ['substitutesSegment', 'workspace.annotation.markSubstitution'],
                  ['deletesSegment', 'workspace.annotation.markDeletion'],
                  ['overwritesTone', 'workspace.annotation.markTone'],
                ] as const
              ).map(([kind, key]) => (
                <button
                  key={kind}
                  type="button"
                  className="annotation-igt-action"
                  data-testid={`annotation-igt-${kind}-${token.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMarkRelation(unitId, { kind, tokenId: token.id });
                  }}
                >
                  {t(locale, key)}
                </button>
              ))}
            </span>
          ) : null}
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

function AnalysisGraphReadout({
  row,
  drafts,
  morphology,
  onSelectAlternative,
}: {
  row: AnnotationIgtRow;
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
  morphology: AnnotationMorphologyController;
  onSelectAlternative?: (unitId: string, relationId: string) => void;
}) {
  const locale = useLocale();
  const projected = buildAnnotationUtteranceGraph({
    row: {
      ...row,
      tokens: row.tokens.map((token) => {
        const fields = displayedAnnotationTokenFields(token, drafts);
        return { ...token, gloss: fields.gloss, pos: fields.pos };
      }),
    },
    morphsByTokenId: morphology.morphsByTokenId,
    linksByTokenId: morphology.linksByTokenId,
  });
  const view = readAnalysisGraphView(projected);
  const hasContent =
    view.multiwordExpressions.length > 0 ||
    view.features.length > 0 ||
    view.links.length > 0 ||
    view.notices.length > 0 ||
    view.alternatives.length > 0;
  if (!hasContent) return null;
  return (
    <div className="annotation-igt-graph" data-testid={`annotation-igt-graph-${row.id}`}>
      {view.multiwordExpressions.length > 0 ? (
        <div className="annotation-igt-graph-chips">
          <span className="annotation-igt-label">{t(locale, 'workspace.annotation.graphMwe')}</span>
          {view.multiwordExpressions.map((group) => (
            <span
              key={group.id}
              className="annotation-igt-graph-chip"
              data-testid={`annotation-igt-graph-mwe-${group.id}`}
            >
              {group.label}
            </span>
          ))}
        </div>
      ) : null}
      {view.features.length > 0 ? (
        <div className="annotation-igt-graph-chips">
          <span className="annotation-igt-label">
            {t(locale, 'workspace.annotation.graphFeatures')}
          </span>
          {view.features.map((feature) => (
            <span
              key={feature.ownerId}
              className="annotation-igt-graph-chip"
              data-testid={`annotation-igt-graph-feature-${feature.ownerId}`}
            >
              {`${feature.ownerLabel}: ${feature.features.map((item) => `${item.key}=${item.value}`).join(', ')}`}
            </span>
          ))}
        </div>
      ) : null}
      {view.links.length > 0 ? (
        <div className="annotation-igt-graph-chips">
          <span className="annotation-igt-label">
            {t(locale, 'workspace.annotation.graphRelations')}
          </span>
          {view.links.map((link) => (
            <span
              key={link.id}
              className="annotation-igt-graph-chip"
              data-testid={`annotation-igt-graph-link-${link.id}`}
            >
              {link.kind === 'reduplicates'
                ? tf(locale, 'workspace.annotation.relationReduplicates', {
                    source: link.source,
                    target: link.target,
                  })
                : link.kind === 'suppletes'
                  ? tf(locale, 'workspace.annotation.relationSuppletes', {
                      source: link.source,
                      target: link.target,
                    })
                  : tf(
                      locale,
                      link.kind === 'deletesSegment'
                        ? 'workspace.annotation.relationDeletes'
                        : link.kind === 'overwritesTone'
                          ? 'workspace.annotation.relationTone'
                          : 'workspace.annotation.relationSubstitutes',
                      { source: link.source },
                    )}
            </span>
          ))}
        </div>
      ) : null}
      {view.alternatives.length > 0 ? (
        <div className="annotation-igt-graph-chips">
          <span className="annotation-igt-label">
            {t(locale, 'workspace.annotation.graphAlternatives')}
          </span>
          {view.alternatives.map((choice) => (
            <span
              key={choice.relationId}
              className="annotation-igt-graph-chip"
              data-testid={`annotation-igt-graph-alt-${choice.relationId}`}
              data-role={choice.role}
            >
              {tf(locale, 'workspace.annotation.alternativeChoice', {
                source: choice.sourceLabel,
                target: choice.targetLabel,
                role: t(
                  locale,
                  choice.role === 'accepted'
                    ? 'workspace.annotation.alternativeRole.accepted'
                    : choice.role === 'rejected'
                      ? 'workspace.annotation.alternativeRole.rejected'
                      : 'workspace.annotation.alternativeRole.pending',
                ),
              })}
              {onSelectAlternative && choice.selectable && choice.role !== 'accepted' ? (
                <button
                  type="button"
                  className="annotation-igt-action"
                  data-testid={`annotation-igt-alt-select-${choice.relationId}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectAlternative(row.id, choice.relationId);
                  }}
                >
                  {t(locale, 'workspace.annotation.selectAlternative')}
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      {view.notices.length > 0 ? (
        <div className="annotation-igt-graph-chips">
          <span className="annotation-igt-label">
            {t(locale, 'workspace.annotation.graphNotices')}
          </span>
          {view.notices.map((notice) => (
            <span key={`${notice.status}:${notice.message}`} className="annotation-igt-graph-chip">
              {notice.message}
            </span>
          ))}
        </div>
      ) : null}
    </div>
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
  onApplyPosByForm,
  onMarkRelation,
  relationError = '',
  onSelectAlternative,
  alternativeError = '',
  posError = '',
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
              {...(onApplyPosByForm ? { onApplyPosByForm } : {})}
              {...(focused && onMarkRelation ? { onMarkRelation } : {})}
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
      {focused ? (
        <AnalysisGraphReadout
          row={row}
          drafts={drafts}
          morphology={morphology}
          {...(onSelectAlternative ? { onSelectAlternative } : {})}
        />
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
      {focused && relationError.length > 0 ? (
        <p className="annotation-igt-label" data-testid={`annotation-igt-relation-error-${row.id}`}>
          {relationError === 'dirty'
            ? t(locale, 'workspace.annotation.mweDirty')
            : t(locale, 'workspace.annotation.relationFailed')}
        </p>
      ) : null}
      {focused && alternativeError.length > 0 ? (
        <p
          className="annotation-igt-label"
          data-testid={`annotation-igt-alternative-error-${row.id}`}
        >
          {alternativeError === 'dirty'
            ? t(locale, 'workspace.annotation.mweDirty')
            : t(locale, 'workspace.annotation.relationFailed')}
        </p>
      ) : null}
      {focused && posError.length > 0 ? (
        <p className="annotation-igt-label" data-testid={`annotation-igt-pos-error-${row.id}`}>
          {posError === 'dirty'
            ? t(locale, 'workspace.annotation.mweDirty')
            : t(locale, 'workspace.annotation.posFailed')}
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
