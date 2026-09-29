import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ContextMenu } from '../../components/ContextMenu';
import { t, tf, useLocale } from '../../i18n';
import type { AnnotationIgtRow } from '../useAnnotationWorkspaceController';
import type { AnnotationMorphologyController } from '../useAnnotationMorphologyController';
import type { AnnotationRelationMark } from '../useAnnotationRelationController';
import { readAnalysisGraphView } from '../../annotation/analysisGraphView';
import { buildAnnotationUtteranceGraph } from './buildAnnotationUtteranceGraph';
import { displayedAnnotationMorphemeFields } from './annotationMorphemeDrafts';
import { displayedAnnotationTokenFields, type AnnotationTokenDraft } from './annotationTokenDrafts';
import { AnnotationIgtTokenEditor } from './AnnotationIgtTokenEditor';
import { AnnotationIgtLineGrid } from './AnnotationIgtLineGrid';
import {
  ANNOTATION_ADDABLE_LINES,
  annotationLineLabelKey,
  visibleAnnotationLines,
  type AnnotationLineId,
} from './annotationIgtLines';
import { buildAnnotationRowMenuItems, buildAnnotationTokenMenuItems } from './annotationIgtMenus';
import type { AnnotationSentenceAcoustic } from '../useAnnotationSentenceAcoustic';
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
  sentenceAcoustic?: AnnotationSentenceAcoustic;
  textLanguageId?: string;
  glossSuggestions?: Readonly<Record<string, string>>;
  onAcceptGlossSuggestion?: (unitId: string, tokenId: string, gloss: string, lang: string) => void;
  onSaveTokenLanguage?: (unitId: string, tokenId: string, languageId: string) => void;
  onCiteOccurrence?: (unitId: string, tokenId: string) => void;
  acousticLayers: {
    showWave: boolean;
    showSpectrum: boolean;
    showPitch: boolean;
  };
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
  onWriteFormsToSurface?: (unitId: string) => void;
  onAddAlternative?: (unitId: string, tokenId: string, pos: string) => void;
  onApplyPosByForm?: (unitId: string, tokenId: string, pos: string) => void;
  onMarkRelation?: (unitId: string, mark: AnnotationRelationMark) => void;
  onSelectAlternative?: (unitId: string, relationId: string) => void;
  relationError?: '' | 'dirty' | 'failed';
  alternativeError?: '' | 'dirty' | 'failed';
  posError?: '' | 'dirty' | 'failed';
};

function relationChipText(
  locale: ReturnType<typeof useLocale>,
  link: { kind: string; source: string; target: string },
): string {
  if (link.kind === 'reduplicates') {
    return tf(locale, 'workspace.annotation.relationReduplicates', {
      source: link.source,
      target: link.target,
    });
  }
  if (link.kind === 'suppletes') {
    return tf(locale, 'workspace.annotation.relationSuppletes', {
      source: link.source,
      target: link.target,
    });
  }
  if (link.kind === 'hasAllomorph') {
    return tf(locale, 'workspace.annotation.relationAllomorph', {
      source: link.source,
      target: link.target,
    });
  }
  if (link.kind === 'rootPattern') {
    return tf(locale, 'workspace.annotation.relationRoot', {
      source: link.source,
      target: link.target,
    });
  }
  if (link.kind === 'incorporation') {
    return tf(locale, 'workspace.annotation.relationIncorporated', { source: link.source });
  }
  if (link.kind === 'deletesSegment') {
    return tf(locale, 'workspace.annotation.relationDeletes', { source: link.source });
  }
  if (link.kind === 'overwritesTone') {
    return tf(locale, 'workspace.annotation.relationTone', { source: link.source });
  }
  return tf(locale, 'workspace.annotation.relationSubstitutes', { source: link.source });
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
  if (projected === undefined) return null;
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
              {relationChipText(locale, link)}
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
  sentenceAcoustic,
  textLanguageId = '',
  glossSuggestions,
  onAcceptGlossSuggestion,
  onSaveTokenLanguage,
  onCiteOccurrence,
  acousticLayers,
  onPlay,
  onFocusRow,
  onFocusInput,
  onTokenDraftChange,
  mweSelectedIds,
  mweError = '',
  onToggleMweToken,
  onWriteFormsToSurface,
  onApplyPosByForm,
  onMarkRelation,
  onAddAlternative,
  relationError = '',
  onSelectAlternative,
  alternativeError = '',
  posError = '',
}: Props) {
  const locale = useLocale();
  const navigate = useNavigate();
  const [addedLines, setAddedLines] = useState<AnnotationLineId[]>([]);
  const [hiddenLines, setHiddenLines] = useState<AnnotationLineId[]>([]);
  const [panel, setPanel] = useState<{ kind: 'token'; tokenId: string } | null>(null);
  const [menu, setMenu] = useState<
    | { kind: 'unit'; x: number; y: number }
    | { kind: 'token'; tokenId: string; x: number; y: number }
    | null
  >(null);
  const editorToken =
    focused && panel?.kind === 'token'
      ? row.tokens.find((token) => token.id === panel.tokenId)
      : undefined;
  const editing = focused && inputFocused && panel === null;
  const hasGloss = row.tokens.some((token) => {
    const fields = displayedAnnotationTokenFields(token, drafts);
    if (fields.gloss.trim().length > 0) return true;
    return (morphology.morphsByTokenId[token.id] ?? []).some(
      (morph) =>
        displayedAnnotationMorphemeFields(morph, morphology.drafts).gloss.trim().length > 0,
    );
  });
  const hasPos = row.tokens.some(
    (token) => displayedAnnotationTokenFields(token, drafts).pos.trim().length > 0,
  );
  const hasMorphForms = row.tokens.some((token) =>
    (morphology.morphsByTokenId[token.id] ?? []).some(
      (morph) => displayedAnnotationMorphemeFields(morph, morphology.drafts).form.trim().length > 0,
    ),
  );
  const hasLemma = row.tokens.some((token) => morphology.linksByTokenId[token.id] !== undefined);
  const lines = visibleAnnotationLines({
    hasSurface: true,
    hasTokens: row.tokens.length > 0,
    hasMorphForms,
    hasGloss,
    hasPos,
    hasLemma,
    hasTranslation: row.translation.length > 0,
    editing,
    added: addedLines,
    hidden: hiddenLines,
  });
  const menuToken =
    menu?.kind === 'token' ? row.tokens.find((token) => token.id === menu.tokenId) : undefined;
  const menuLink = menuToken ? morphology.linksByTokenId[menuToken.id] : undefined;
  const suppletionLemma =
    menuLink !== undefined && menuLink.brokenCode === undefined ? menuLink.lemma.trim() : '';
  function openMenu(
    event: ReactMouseEvent<HTMLElement>,
    next: { kind: 'unit' } | { kind: 'token'; tokenId: string },
  ) {
    event.preventDefault();
    event.stopPropagation();
    onFocusRow(row.id);
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ ...next, x: rect.left, y: rect.bottom });
  }

  return (
    <li
      className={focused ? 'annotation-igt-row annotation-igt-row-focused' : 'annotation-igt-row'}
      data-testid={`annotation-igt-row-${row.id}`}
      onClick={() => {
        setMenu(null);
        onFocusRow(row.id);
      }}
      onContextMenu={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('.annotation-igt-word') !== null) return;
        event.preventDefault();
        onFocusRow(row.id);
        setMenu({ kind: 'unit', x: event.clientX, y: event.clientY });
      }}
    >
      <div className="annotation-igt-meta">
        <span className="annotation-igt-time">
          {row.timeLabel}
          {row.speakerName ? (
            <span
              className="annotation-igt-speaker"
              data-testid={`annotation-igt-speaker-${row.id}`}
            >
              {row.speakerName}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          className="annotation-igt-row-actions"
          data-testid={`annotation-igt-actions-${row.id}`}
          aria-label={t(locale, 'workspace.annotation.rowActions')}
          onClick={(event) => openMenu(event, { kind: 'unit' })}
        >
          ⋯
        </button>
      </div>
      <AnnotationIgtLineGrid
        row={row}
        lines={lines}
        drafts={drafts}
        morphology={morphology}
        editing={editing}
        mweSelectedIds={mweSelectedIds ?? []}
        onOpenWordMenu={(event, tokenId) => openMenu(event, { kind: 'token', tokenId })}
        onSelectWord={(tokenId) => {
          onFocusRow(row.id);
          onFocusInput(row.id);
          setPanel({ kind: 'token', tokenId });
        }}
        onFocusInput={onFocusInput}
        onTokenDraftChange={onTokenDraftChange}
        {...(focused && sentenceAcoustic ? { sentenceAcoustic } : {})}
        showWave={acousticLayers.showWave}
        showSpectrum={acousticLayers.showSpectrum}
        showPitch={acousticLayers.showPitch}
        textLanguageId={textLanguageId}
        {...(glossSuggestions ? { glossSuggestions } : {})}
        {...(onAcceptGlossSuggestion ? { onAcceptGlossSuggestion } : {})}
      />
      {editorToken ? (
        <AnnotationIgtTokenEditor
          token={editorToken}
          unitId={row.id}
          drafts={drafts}
          morphology={morphology}
          onFocusInput={onFocusInput}
          onTokenDraftChange={onTokenDraftChange}
          {...(onSaveTokenLanguage ? { onSaveTokenLanguage } : {})}
          onSplit={() => morphology.onSplitToken(row.id, editorToken.id)}
          onMerge={() => morphology.onMergeToken(row.id, editorToken.id)}
          {...(onCiteOccurrence && morphology.linksByTokenId[editorToken.id]?.senseId
            ? { onCite: () => onCiteOccurrence(row.id, editorToken.id) }
            : {})}
          {...(glossSuggestions?.[editorToken.id]
            ? { glossSuggestion: glossSuggestions[editorToken.id] }
            : {})}
          {...(onAcceptGlossSuggestion ? { onAcceptGlossSuggestion } : {})}
          {...(onApplyPosByForm ? { onApplyPosByForm } : {})}
          {...(onAddAlternative ? { onAddAlternative } : {})}
          {...(onMarkRelation
            ? {
                onMarkRootPattern: (
                  unitId: string,
                  tokenId: string,
                  root: string,
                  pattern: string,
                ) => onMarkRelation(unitId, { kind: 'rootPattern', tokenId, root, pattern }),
              }
            : {})}
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
      {focused ? (
        <AnalysisGraphReadout
          row={row}
          drafts={drafts}
          morphology={morphology}
          {...(onSelectAlternative ? { onSelectAlternative } : {})}
        />
      ) : null}
      {focused && unitMeta && retokenize && validator ? (
        <AnnotationIgtUnitExtras
          unitId={row.id}
          matches={autoGloss && autoGloss.previewUnitId === row.id ? autoGloss.matches : []}
          unitMeta={unitMeta}
          retokenize={retokenize}
          validator={validator}
          onFocusInput={onFocusInput}
          turn={{
            ...(row.addressee ? { addressee: row.addressee } : {}),
            ...(row.ungrammatical ? { ungrammatical: row.ungrammatical } : {}),
            ...(row.actualForm ? { actualForm: row.actualForm } : {}),
            ...(row.targetForm ? { targetForm: row.targetForm } : {}),
          }}
          showNote={false}
          showCertainty={false}
        />
      ) : null}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={
            menu.kind === 'unit'
              ? [
                  ...buildAnnotationRowMenuItems({
                    locale,
                    unitId: row.id,
                    hasTokens: row.tokens.length > 0,
                    playing,
                    ...(onPlay ? { onPlay } : {}),
                    ...(onWriteFormsToSurface
                      ? {
                          onWriteFormsToSurface,
                          tokenForms: row.tokens.map((token) => token.form),
                        }
                      : {}),
                    onOpenTranscription: () => {
                      void navigate(row.transcriptionHref);
                    },
                  }),
                  ...(row.tokens.length > 0
                    ? [
                        {
                          label: t(locale, 'workspace.annotation.addLine'),
                          separatorBefore: true,
                          children: ANNOTATION_ADDABLE_LINES.map((lineId) => ({
                            testId: `annotation-igt-line-toggle-${lineId}-${row.id}`,
                            label: t(locale, annotationLineLabelKey(lineId)),
                            selectionState: lines.includes(lineId)
                              ? ('selected' as const)
                              : ('unselected' as const),
                            selectionVariant: 'check' as const,
                            keepOpen: true,
                            onClick: () => {
                              if (lines.includes(lineId)) {
                                setAddedLines((current) =>
                                  current.filter((added) => added !== lineId),
                                );
                                setHiddenLines((current) =>
                                  current.includes(lineId) ? current : [...current, lineId],
                                );
                                return;
                              }
                              setHiddenLines((current) =>
                                current.filter((hidden) => hidden !== lineId),
                              );
                              setAddedLines((current) =>
                                current.includes(lineId) ? current : [...current, lineId],
                              );
                            },
                          })),
                        },
                      ]
                    : []),
                ]
              : menuToken
                ? buildAnnotationTokenMenuItems({
                    locale,
                    tokenId: menuToken.id,
                    mweSelected: mweSelectedIds?.includes(menuToken.id) ?? false,
                    morphs: (morphology.morphsByTokenId[menuToken.id] ?? []).map((morph) => ({
                      id: morph.id,
                      form: displayedAnnotationMorphemeFields(morph, morphology.drafts).form,
                    })),
                    suppletionLemma,
                    canAllomorph: suppletionLemma.length > 0,
                    onSeed: () => morphology.onSeedMorphemes(row.id, menuToken.id, menuToken.form),
                    ...(onToggleMweToken
                      ? { onToggleMwe: () => onToggleMweToken(row.id, menuToken.id) }
                      : {}),
                    ...(onMarkRelation
                      ? { onMarkRelation: (mark) => onMarkRelation(row.id, mark) }
                      : {}),
                  })
                : []
          }
        />
      ) : null}
    </li>
  );
}
