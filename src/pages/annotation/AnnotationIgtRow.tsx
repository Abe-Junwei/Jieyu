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
import type { AnnotationActiveCell } from './AnnotationIgtLineGrid';
import { AnnotationIgtLineGrid } from './AnnotationIgtLineGrid';
import {
  arrangeAnnotationLines,
  placeAnnotationLine,
  reconcileAnnotationLineOrder,
  visibleAnnotationLines,
  moveAnnotationLine,
  type AnnotationLineId,
} from './annotationIgtLines';
import {
  buildAnnotationLineMenuItems,
  buildAnnotationRowMenuItems,
  buildAnnotationTokenMenuItems,
  type AnnotationLanguageLineOption,
} from './annotationIgtMenus';
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
  lineOrder?: readonly AnnotationLineId[];
  onReorderLine?: (from: AnnotationLineId, to: AnnotationLineId) => void;
  languageLines?: readonly (AnnotationLanguageLineOption & { text: string })[];
  primaryGlossLanguage?: string;
  onCommitLanguageLine?: (unitId: string, key: string, text: string) => void;
  onCommitGlossLanguage?: (
    unitId: string,
    tokenId: string,
    languageId: string,
    text: string,
  ) => void;
  onCommitSurface?: (unitId: string, text: string) => void;
  onCommitTranslation?: (unitId: string, text: string) => void;
  onCommitTokenForm?: (unitId: string, tokenId: string, form: string) => void;
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
  lineOrder,
  onReorderLine,
  languageLines = [],
  primaryGlossLanguage = '',
  onCommitLanguageLine,
  onCommitGlossLanguage,
  onCommitSurface,
  onCommitTranslation,
  onCommitTokenForm,
  mweSelectedIds,
  mweError = '',
  onToggleMweToken,
  onWriteFormsToSurface,
  onMarkRelation,
  relationError = '',
  onSelectAlternative,
  alternativeError = '',
  posError = '',
  onAddAlternative,
  onApplyPosByForm,
}: Props) {
  const locale = useLocale();
  const navigate = useNavigate();
  const [addedLines, setAddedLines] = useState<AnnotationLineId[]>([]);
  const [addedLanguageKeys, setAddedLanguageKeys] = useState<string[]>([]);
  const [keyOrder, setKeyOrder] = useState<string[] | null>(null);
  const [glossLanguageDraft, setGlossLanguageDraft] = useState('');
  const [hiddenLines, setHiddenLines] = useState<AnnotationLineId[]>([]);
  const [activeCell, setActiveCell] = useState<AnnotationActiveCell | null>(null);
  const [languageDraft, setLanguageDraft] = useState<string | null>(null);
  const [menu, setMenu] = useState<
    | { kind: 'unit'; x: number; y: number }
    | { kind: 'token'; tokenId: string; x: number; y: number }
    | { kind: 'line'; lineId: string; x: number; y: number }
    | null
  >(null);
  const editing = focused && inputFocused && activeCell === null;
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
  const baseLines = arrangeAnnotationLines(
    visibleAnnotationLines({
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
    }),
    lineOrder ?? [],
  );
  const derivedLines = addedLanguageKeys.reduce<string[]>(
    (current, key) => placeAnnotationLine(current, key),
    [...baseLines],
  );
  const lines = reconcileAnnotationLineOrder(keyOrder, derivedLines);
  const lineTexts = Object.fromEntries(languageLines.map((line) => [line.key, line.text]));
  function moveLine(from: string, to: string) {
    setKeyOrder(moveAnnotationLine(lines, from, to));
    if (!from.includes(':') && !to.includes(':') && onReorderLine) {
      onReorderLine(from as AnnotationLineId, to as AnnotationLineId);
    }
  }
  const menuToken =
    menu?.kind === 'token' ? row.tokens.find((token) => token.id === menu.tokenId) : undefined;
  const menuLink = menuToken ? morphology.linksByTokenId[menuToken.id] : undefined;
  const suppletionLemma =
    menuLink !== undefined && menuLink.brokenCode === undefined
      ? (menuLink.lemma ?? '').trim()
      : '';
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
      className={[
        'annotation-igt-row',
        focused ? 'annotation-igt-row-focused' : '',
        playing ? 'annotation-igt-row-playing' : '',
      ]
        .filter((name) => name.length > 0)
        .join(' ')}
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
        activeCell={activeCell}
        onOpenWordMenu={(event, tokenId) => {
          setLanguageDraft(null);
          openMenu(event, { kind: 'token', tokenId });
        }}
        onActivateCell={(tokenId, line) => {
          onFocusRow(row.id);
          setActiveCell({ tokenId, line });
        }}
        onFocusInput={onFocusInput}
        onTokenDraftChange={onTokenDraftChange}
        {...(onCommitTokenForm
          ? {
              onCommitTokenForm: (tokenId: string, form: string) =>
                onCommitTokenForm(row.id, tokenId, form),
            }
          : {})}
        {...(onCommitSurface
          ? { onCommitSurface: (text: string) => onCommitSurface(row.id, text) }
          : {})}
        {...(onCommitTranslation
          ? { onCommitTranslation: (text: string) => onCommitTranslation(row.id, text) }
          : {})}
        {...(onCommitLanguageLine
          ? {
              onCommitLanguageLine: (key: string, text: string) =>
                onCommitLanguageLine(row.id, key, text),
            }
          : {})}
        {...(onCommitGlossLanguage
          ? {
              onCommitGlossLanguage: (tokenId: string, languageId: string, text: string) =>
                onCommitGlossLanguage(row.id, tokenId, languageId, text),
            }
          : {})}
        lineTexts={lineTexts}
        lineLabels={Object.fromEntries(languageLines.map((line) => [line.key, line.label]))}
        onReorderLine={moveLine}
        onOpenLineMenu={(event, lineId) => {
          event.preventDefault();
          event.stopPropagation();
          onFocusRow(row.id);
          setMenu({ kind: 'line', lineId, x: event.clientX, y: event.clientY });
        }}
        {...(focused && sentenceAcoustic ? { sentenceAcoustic } : {})}
        showWave={acousticLayers.showWave}
        showSpectrum={acousticLayers.showSpectrum}
        showPitch={acousticLayers.showPitch}
        textLanguageId={textLanguageId}
        {...(glossSuggestions ? { glossSuggestions } : {})}
        {...(onAcceptGlossSuggestion ? { onAcceptGlossSuggestion } : {})}
      />
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
                ]
              : menu.kind === 'line'
                ? buildAnnotationLineMenuItems({
                    locale,
                    unitId: row.id,
                    lineId: menu.lineId,
                    lines,
                    glossLanguageDraft,
                    onGlossLanguageDraft: setGlossLanguageDraft,
                    languageLines,
                    primaryGlossLanguage,
                    onMove: moveLine,
                    onRemove: (lineId) => {
                      if (lineId.includes(':')) {
                        setAddedLanguageKeys((current) => current.filter((key) => key !== lineId));
                        return;
                      }
                      const kind = lineId as AnnotationLineId;
                      setAddedLines((current) => current.filter((added) => added !== kind));
                      setHiddenLines((current) =>
                        current.includes(kind) ? current : [...current, kind],
                      );
                    },
                    onAdd: (lineId) => {
                      if (lineId.includes(':')) {
                        setAddedLanguageKeys((current) =>
                          current.includes(lineId) ? current : [...current, lineId],
                        );
                        setGlossLanguageDraft('');
                        return;
                      }
                      const kind = lineId as AnnotationLineId;
                      setHiddenLines((current) => current.filter((hidden) => hidden !== kind));
                      setAddedLines((current) =>
                        current.includes(kind) ? current : [...current, kind],
                      );
                    },
                  })
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
                      onSplit: () => morphology.onSplitToken(row.id, menuToken.id),
                      onMerge: () => morphology.onMergeToken(row.id, menuToken.id),
                      onSeed: () =>
                        morphology.onSeedMorphemes(row.id, menuToken.id, menuToken.form),
                      onLink: () => morphology.onLinkLexeme(menuToken.id),
                      ...(menuLink
                        ? { onUnlink: () => morphology.onUnlinkLexeme(menuToken.id) }
                        : {}),
                      ...(onCiteOccurrence && menuLink?.senseId
                        ? { onCite: () => onCiteOccurrence(row.id, menuToken.id) }
                        : {}),
                      languageValue: languageDraft ?? menuToken.languageId ?? '',
                      onLanguageChange: setLanguageDraft,
                      ...(onSaveTokenLanguage
                        ? {
                            onLanguageBlur: (value: string) =>
                              onSaveTokenLanguage(row.id, menuToken.id, value),
                          }
                        : {}),
                      ...(onToggleMweToken
                        ? { onToggleMwe: () => onToggleMweToken(row.id, menuToken.id) }
                        : {}),
                      ...(onMarkRelation
                        ? { onMarkRelation: (mark) => onMarkRelation(row.id, mark) }
                        : {}),
                      pos: displayedAnnotationTokenFields(menuToken, drafts).pos,
                      storedPos: menuToken.pos,
                      ...(onApplyPosByForm
                        ? {
                            onApplyPosByForm: (pos: string) =>
                              onApplyPosByForm(row.id, menuToken.id, pos),
                          }
                        : {}),
                      ...(onAddAlternative
                        ? {
                            onAddAlternative: (pos: string) =>
                              onAddAlternative(row.id, menuToken.id, pos),
                          }
                        : {}),
                    })
                  : []
          }
        />
      ) : null}
    </li>
  );
}
