import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { t, tf, useLocale } from '../../i18n';
import { UD_POS_TAGS } from '../../annotation/udPosTags';
import type { AnnotationIgtRow, AnnotationIgtToken } from '../useAnnotationWorkspaceController';
import type { AnnotationMorphologyController } from '../useAnnotationMorphologyController';
import type { AnnotationTokenDraft } from './annotationTokenDrafts';
import { displayedAnnotationTokenFields } from './annotationTokenDrafts';
import { displayedAnnotationMorphemeFields } from './annotationMorphemeDrafts';
import {
  annotationGlossHasLeipzigIssue,
  annotationUnknownGlossAbbreviation,
} from './annotationLeipzigGloss';
import {
  annotationLineAlignsToWords,
  annotationLineBand,
  annotationLineKind,
  annotationLineLanguage,
} from './annotationIgtLines';
import { annotationLanguageLineLabel } from './annotationIgtMenus';
import { lexemeLinkLabel } from './AnnotationIgtTokenEditor';
import { AnnotationSentenceAcousticFigure } from './AnnotationSentenceAcousticFigure';
import type { AnnotationSentenceAcoustic } from '../useAnnotationSentenceAcoustic';

export type AnnotationActiveCell = {
  tokenId: string;
  line: 'gloss' | 'pos' | 'morphForm' | 'lemma';
};

export function AnnotationMoreButton({
  className,
  testId,
  label,
  onClick,
}: {
  className?: string;
  testId?: string;
  label: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className={className ? `annotation-igt-more ${className}` : 'annotation-igt-more'}
      {...(testId ? { 'data-testid': testId } : {})}
      aria-label={label}
      draggable={false}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick(event);
      }}
    >
      <span />
      <span />
      <span />
    </button>
  );
}

export function AnnotationIgtLineGrid({
  row,
  lines,
  drafts,
  morphology,
  editing,
  mweSelectedIds,
  activeCell,
  onOpenWordMenu,
  onActivateCell,
  onFocusInput,
  onTokenDraftChange,
  onCommitTokenForm,
  onCommitSurface,
  onCommitTranslation,
  onCommitLanguageLine,
  onCommitGlossLanguage,
  lineTexts,
  lineLabels,
  onReorderLine,
  onOpenLineMenu,
  sentenceAcoustic,
  showWave,
  showSpectrum,
  showPitch,
  textLanguageId,
  glossLineLanguage = '',
  glossSuggestions,
  onAcceptGlossSuggestion,
  onApplyGlossByForm,
  onCommitLiteral,
  glossAbbreviations,
  posCategories,
}: {
  row: AnnotationIgtRow;
  lines: readonly string[];
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
  morphology: AnnotationMorphologyController;
  editing: boolean;
  mweSelectedIds: readonly string[];
  activeCell: AnnotationActiveCell | null;
  onOpenWordMenu: (event: ReactMouseEvent<HTMLElement>, tokenId: string) => void;
  onActivateCell: (tokenId: string, line: AnnotationActiveCell['line']) => void;
  onFocusInput: (unitId: string) => void;
  onTokenDraftChange: (
    unitId: string,
    tokenId: string,
    field: keyof AnnotationTokenDraft,
    value: string,
  ) => void;
  onCommitTokenForm?: (tokenId: string, form: string) => void;
  onCommitSurface?: (text: string) => void;
  onCommitTranslation?: (text: string) => void;
  onCommitLanguageLine?: (key: string, text: string) => void;
  onCommitGlossLanguage?: (tokenId: string, languageId: string, text: string) => void;
  lineTexts?: Readonly<Record<string, string>>;
  lineLabels?: Readonly<Record<string, string>>;
  onReorderLine?: (from: string, to: string) => void;
  onOpenLineMenu?: (event: ReactMouseEvent<HTMLElement>, lineId: string) => void;
  sentenceAcoustic?: AnnotationSentenceAcoustic;
  showWave: boolean;
  showSpectrum: boolean;
  showPitch: boolean;
  textLanguageId?: string;
  glossLineLanguage?: string;
  glossSuggestions?: Readonly<Record<string, string>>;
  onAcceptGlossSuggestion?: (unitId: string, tokenId: string, gloss: string, lang: string) => void;
  onApplyGlossByForm?: (unitId: string, tokenId: string, gloss: string) => void;
  onCommitLiteral?: (text: string) => void;
  glossAbbreviations?: ReadonlySet<string>;
  posCategories?: readonly string[];
}) {
  const [dragLine, setDragLine] = useState<string | null>(null);
  const [dropLine, setDropLine] = useState<string | null>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const lineKey = lines.join('|');
  useLayoutEffect(() => {
    const root = linesRef.current;
    if (!root) return undefined;
    const measure = () => {
      const next = Math.round(widestTextLineWidth(root));
      setContentWidth((current) => (Math.abs(current - next) < 2 ? current : next));
    };
    measure();
    const Observer = globalThis.ResizeObserver;
    if (typeof Observer !== 'function') return undefined;
    const observer = new Observer(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [lineKey, row.id, row.surface, row.tokens.length, row.translation]);
  const wordLines = lines.filter(annotationLineAlignsToWords);
  const sentenceLines = lines.filter((id) => !annotationLineAlignsToWords(id));
  const source = sentenceLines.filter((id) => annotationLineKind(id) === 'source');
  const translation = sentenceLines.filter((id) => annotationLineKind(id) !== 'source');
  return (
    <div ref={linesRef} className="annotation-igt-lines">
      {sentenceAcoustic ? (
        <div className="annotation-igt-line">
          <span />
          <AnnotationSentenceAcousticFigure
            figure={sentenceAcoustic.figure}
            audioUrl={sentenceAcoustic.audioUrl}
            status={sentenceAcoustic.status}
            contentWidth={contentWidth}
            showWave={showWave}
            showSpectrum={showSpectrum}
            showPitch={showPitch}
          />
        </div>
      ) : null}
      {source.map((id) => (
        <SentenceLine
          key={id}
          lineId={id}
          unitId={row.id}
          {...(lineLabels?.[id] ? { label: lineLabels[id] } : {})}
          text={id === 'source' ? row.surface : (lineTexts?.[id] ?? '')}
          testId={
            id === 'source'
              ? `annotation-igt-surface-${row.id}`
              : `annotation-igt-surface-${row.id}-${annotationLineLanguage(id)}`
          }
          {...(id === 'source'
            ? onCommitSurface
              ? { onCommit: onCommitSurface }
              : {}
            : onCommitLanguageLine
              ? { onCommit: (text: string) => onCommitLanguageLine(id, text) }
              : {})}
          dragLine={dragLine}
          dropLine={dropLine}
          onDragLine={setDragLine}
          onDropLine={setDropLine}
          {...(onReorderLine ? { onReorderLine } : {})}
          {...(onOpenLineMenu ? { onOpenLineMenu } : {})}
        />
      ))}
      {wordLines.length > 0 ? (
        <div
          className="annotation-igt-sheet"
          style={{ '--igt-lines': wordLines.length } as CSSProperties}
        >
          <div className="annotation-igt-sheet-labels">
            {wordLines.map((id) => (
              <LineLabel
                key={id}
                lineId={id}
                {...(lineLabels?.[id] ? { label: lineLabels[id] } : {})}
                testId={`annotation-igt-line-${id}-${row.id}`}
                dragLine={dragLine}
                dropLine={dropLine}
                onDragLine={setDragLine}
                onDropLine={setDropLine}
                {...(onReorderLine ? { onReorderLine } : {})}
                {...(onOpenLineMenu ? { onOpenLineMenu } : {})}
              />
            ))}
          </div>
          <div className="annotation-igt-aligned-words">
            {row.tokens.map((token) => (
              <WordCells
                key={token.id}
                token={token}
                unitId={row.id}
                lines={wordLines}
                drafts={drafts}
                morphology={morphology}
                editing={editing}
                cellActive={activeCell?.tokenId === token.id ? activeCell.line : null}
                mweSelected={mweSelectedIds.includes(token.id)}
                onOpenWordMenu={onOpenWordMenu}
                onActivateCell={onActivateCell}
                onFocusInput={onFocusInput}
                onTokenDraftChange={onTokenDraftChange}
                {...(onCommitTokenForm ? { onCommitTokenForm } : {})}
                {...(onReorderLine ? { onReorderLine } : {})}
                glossSuggestion={glossSuggestions?.[token.id] ?? ''}
                {...(onCommitTokenForm ? { onCommitTokenForm } : {})}
                textLanguageId={textLanguageId ?? ''}
                glossLineLanguage={glossLineLanguage}
                {...(glossAbbreviations ? { glossAbbreviations } : {})}
                {...(posCategories ? { posCategories } : {})}
                {...(onAcceptGlossSuggestion ? { onAcceptGlossSuggestion } : {})}
                {...(onApplyGlossByForm ? { onApplyGlossByForm } : {})}
                {...(onCommitGlossLanguage ? { onCommitGlossLanguage } : {})}
              />
            ))}
          </div>
        </div>
      ) : null}
      {translation.map((id) => (
        <SentenceLine
          key={id}
          lineId={id}
          unitId={row.id}
          {...(lineLabels?.[id] ? { label: lineLabels[id] } : {})}
          text={
            id === 'translation'
              ? row.translation
              : id === 'literal'
                ? (lineTexts?.literal ?? '')
                : (lineTexts?.[id] ?? '')
          }
          testId={
            id === 'translation'
              ? `annotation-igt-translation-${row.id}`
              : id === 'literal'
                ? `annotation-igt-literal-${row.id}`
                : `annotation-igt-translation-${row.id}-${annotationLineLanguage(id)}`
          }
          {...(id === 'translation'
            ? onCommitTranslation
              ? { onCommit: onCommitTranslation }
              : {}
            : id === 'literal'
              ? onCommitLiteral
                ? { onCommit: onCommitLiteral }
                : {}
              : onCommitLanguageLine
                ? { onCommit: (text: string) => onCommitLanguageLine(id, text) }
                : {})}
          dragLine={dragLine}
          dropLine={dropLine}
          onDragLine={setDragLine}
          onDropLine={setDropLine}
          {...(onReorderLine ? { onReorderLine } : {})}
          {...(onOpenLineMenu ? { onOpenLineMenu } : {})}
        />
      ))}
    </div>
  );
}

export function widestTextLineWidth(root: HTMLElement): number {
  let max = 0;
  root.querySelectorAll('.annotation-igt-line-sentence').forEach((node) => {
    max = Math.max(max, node.getBoundingClientRect().width);
  });
  const rows = new Map<number, { left: number; right: number }>();
  root.querySelectorAll('.annotation-igt-word').forEach((node) => {
    const box = node.getBoundingClientRect();
    const key = Math.round(box.top);
    const row = rows.get(key) ?? { left: box.left, right: box.right };
    row.left = Math.min(row.left, box.left);
    row.right = Math.max(row.right, box.right);
    rows.set(key, row);
  });
  for (const row of rows.values()) max = Math.max(max, row.right - row.left);
  return max;
}

function LineLabel({
  lineId,
  label,
  testId,
  dragLine,
  dropLine,
  onDragLine,
  onDropLine,
  onReorderLine,
  onOpenLineMenu,
}: {
  lineId: string;
  label?: string;
  testId?: string;
  dragLine: string | null;
  dropLine: string | null;
  onDragLine: (lineId: string | null) => void;
  onDropLine: (lineId: string | null) => void;
  onReorderLine?: (from: string, to: string) => void;
  onOpenLineMenu?: (event: ReactMouseEvent<HTMLElement>, lineId: string) => void;
}) {
  const locale = useLocale();
  const dragging = dragLine === lineId;
  const showDrop = dropLine === lineId && dragLine !== null && dragLine !== lineId;
  return (
    <span
      className={
        dragging
          ? 'annotation-igt-line-label annotation-igt-line-label-dragging'
          : 'annotation-igt-line-label'
      }
      {...(testId ? { 'data-testid': testId } : {})}
      draggable={onReorderLine !== undefined}
      onDragStart={(event: ReactDragEvent<HTMLElement>) => {
        event.dataTransfer.setData('text/annotation-line', lineId);
        event.dataTransfer.effectAllowed = 'move';
        onDragLine(lineId);
      }}
      onDragOver={(event: ReactDragEvent<HTMLElement>) => {
        if (
          !onReorderLine ||
          dragLine === null ||
          dragLine === lineId ||
          annotationLineBand(dragLine) !== annotationLineBand(lineId)
        ) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (dropLine !== lineId) onDropLine(lineId);
      }}
      onDrop={(event: ReactDragEvent<HTMLElement>) => {
        event.preventDefault();
        const from = event.dataTransfer.getData('text/annotation-line');
        if (from.length > 0) onReorderLine?.(from, lineId);
        onDragLine(null);
        onDropLine(null);
      }}
      onDragEnd={() => {
        onDragLine(null);
        onDropLine(null);
      }}
      onContextMenu={(event) => {
        if (!onOpenLineMenu) return;
        event.preventDefault();
        event.stopPropagation();
        onOpenLineMenu(event, lineId);
      }}
    >
      {showDrop ? <span className="annotation-igt-line-drop" /> : null}
      {label ?? annotationLanguageLineLabel(locale, lineId)}
      <AnnotationMoreButton
        className="annotation-igt-line-actions-button"
        {...(testId ? { testId: `${testId}-actions` } : {})}
        label={t(locale, 'workspace.annotation.lineActions')}
        onClick={(event) => onOpenLineMenu?.(event, lineId)}
      />
    </span>
  );
}

function SentenceLine({
  lineId,
  unitId,
  text,
  label,
  testId,
  onCommit,
  dragLine,
  dropLine,
  onDragLine,
  onDropLine,
  onReorderLine,
  onOpenLineMenu,
}: {
  lineId: string;
  unitId: string;
  text: string;
  label?: string;
  testId?: string;
  onCommit?: (text: string) => void;
  dragLine: string | null;
  dropLine: string | null;
  onDragLine: (lineId: string | null) => void;
  onDropLine: (lineId: string | null) => void;
  onReorderLine?: (from: string, to: string) => void;
  onOpenLineMenu?: (event: ReactMouseEvent<HTMLElement>, lineId: string) => void;
}) {
  const locale = useLocale();
  return (
    <div className={`annotation-igt-line annotation-igt-line-${annotationLineKind(lineId)}`}>
      <LineLabel
        lineId={lineId}
        {...(label ? { label } : {})}
        testId={`annotation-igt-line-${lineId}-${unitId}`}
        dragLine={dragLine}
        dropLine={dropLine}
        onDragLine={onDragLine}
        onDropLine={onDropLine}
        {...(onReorderLine ? { onReorderLine } : {})}
        {...(onOpenLineMenu ? { onOpenLineMenu } : {})}
      />
      {onCommit ? (
        <input
          className="annotation-igt-field annotation-igt-inline annotation-igt-sentence-input"
          {...(testId ? { 'data-testid': testId } : {})}
          aria-label={label ?? annotationLanguageLineLabel(locale, lineId)}
          defaultValue={text}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => onCommit(event.target.value)}
        />
      ) : (
        <span
          className="annotation-igt-line-sentence"
          {...(testId ? { 'data-testid': testId } : {})}
        >
          {text}
        </span>
      )}
    </div>
  );
}

function WordCells({
  token,
  unitId,
  lines,
  drafts,
  morphology,
  editing,
  cellActive,
  mweSelected,
  onOpenWordMenu,
  onActivateCell,
  onFocusInput,
  onTokenDraftChange,
  onCommitTokenForm,
  glossSuggestion = '',
  textLanguageId = '',
  glossLineLanguage = '',
  onAcceptGlossSuggestion,
  onApplyGlossByForm,
  onCommitGlossLanguage,
  glossAbbreviations,
  posCategories,
}: {
  token: AnnotationIgtToken;
  unitId: string;
  lines: readonly string[];
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
  morphology: AnnotationMorphologyController;
  editing: boolean;
  cellActive: AnnotationActiveCell['line'] | null;
  mweSelected: boolean;
  onOpenWordMenu: (event: ReactMouseEvent<HTMLElement>, tokenId: string) => void;
  onActivateCell: (tokenId: string, line: AnnotationActiveCell['line']) => void;
  onFocusInput: (unitId: string) => void;
  onTokenDraftChange: (
    unitId: string,
    tokenId: string,
    field: keyof AnnotationTokenDraft,
    value: string,
  ) => void;
  onCommitTokenForm?: (tokenId: string, form: string) => void;
  glossSuggestion?: string;
  textLanguageId?: string;
  glossLineLanguage?: string;
  onAcceptGlossSuggestion?: (unitId: string, tokenId: string, gloss: string, lang: string) => void;
  onApplyGlossByForm?: (unitId: string, tokenId: string, gloss: string) => void;
  onCommitGlossLanguage?: (tokenId: string, languageId: string, text: string) => void;
  glossAbbreviations?: ReadonlySet<string>;
  posCategories?: readonly string[];
}) {
  const locale = useLocale();
  const fields = displayedAnnotationTokenFields(token, drafts);
  const morphs = morphology.morphsByTokenId[token.id] ?? [];
  const morphFields = morphs.map((morph) =>
    displayedAnnotationMorphemeFields(morph, morphology.drafts),
  );
  const link = morphology.linksByTokenId[token.id];
  const glossInvalid = annotationGlossHasLeipzigIssue(fields.gloss, glossAbbreviations);
  return (
    <span
      className={
        mweSelected ? 'annotation-igt-word annotation-igt-word-selected' : 'annotation-igt-word'
      }
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenWordMenu(event, token.id);
      }}
    >
      {lines.map((id) => {
        const kind = annotationLineKind(id);
        const lineLanguage = annotationLineLanguage(id);
        if (kind === 'gloss' && lineLanguage.length > 0) {
          return (
            <input
              key={id}
              className="annotation-igt-field annotation-igt-inline"
              data-testid={`annotation-igt-gloss-${token.id}-${lineLanguage}`}
              aria-label={annotationLanguageLineLabel(locale, id)}
              defaultValue={token.glossByLanguage?.[lineLanguage] ?? ''}
              onClick={(event) => event.stopPropagation()}
              onFocus={() => onFocusInput(unitId)}
              onBlur={(event) =>
                onCommitGlossLanguage?.(token.id, lineLanguage, event.target.value)
              }
            />
          );
        }
        if (id === 'word') {
          return (
            <span key={id} className="annotation-igt-form">
              <input
                className="annotation-igt-field annotation-igt-inline"
                data-testid={`annotation-igt-form-${token.id}`}
                aria-label={t(locale, 'workspace.annotation.lineWord')}
                defaultValue={token.form}
                onClick={(event) => event.stopPropagation()}
                onFocus={() => onFocusInput(unitId)}
                onBlur={(event) => onCommitTokenForm?.(token.id, event.target.value)}
              />
              {token.languageId && token.languageId !== textLanguageId ? (
                <sub
                  className="annotation-igt-lang"
                  data-testid={`annotation-igt-lang-${token.id}`}
                >
                  {token.languageId}
                </sub>
              ) : null}
              {(morphology.senseChoicesByTokenId[token.id] ?? []).map((choice) => (
                <button
                  key={choice.senseId}
                  type="button"
                  className="annotation-igt-action"
                  data-testid={`annotation-igt-sense-${token.id}-${choice.senseId}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    morphology.onChooseLexemeSense(token.id, choice.senseId);
                  }}
                >
                  {tf(locale, 'workspace.annotation.chooseSense', { label: choice.label })}
                </button>
              ))}
              <AnnotationMoreButton
                className="annotation-igt-word-actions"
                testId={`annotation-igt-word-actions-${token.id}`}
                label={t(locale, 'workspace.annotation.wordActions')}
                onClick={(event) => onOpenWordMenu(event, token.id)}
              />
            </span>
          );
        }
        if (kind === 'morphForm' && morphs.length === 0) {
          return (
            <input
              key={id}
              className="annotation-igt-field annotation-igt-inline"
              data-testid={`annotation-igt-morph-line-${token.id}`}
              aria-label={t(locale, 'workspace.annotation.lineMorph')}
              onClick={(event) => event.stopPropagation()}
              onFocus={() => onFocusInput(unitId)}
              onBlur={(event) => morphology.onCommitMorphLine(unitId, token.id, event.target.value)}
            />
          );
        }
        if (id === 'morphForm' && cellActive === 'morphForm' && morphs.length > 0) {
          return (
            <span key={id} className="annotation-igt-gloss">
              {morphs.map((morph) => {
                const morphFieldsForInput = displayedAnnotationMorphemeFields(
                  morph,
                  morphology.drafts,
                );
                return (
                  <input
                    key={morph.id}
                    className="annotation-igt-field"
                    data-testid={`annotation-igt-morph-form-${morph.id}`}
                    aria-label={t(locale, 'workspace.annotation.morphemeFormLabel')}
                    value={morphFieldsForInput.form}
                    autoFocus
                    onClick={(event) => event.stopPropagation()}
                    onFocus={() => onFocusInput(unitId)}
                    onChange={(event) =>
                      morphology.onMorphDraftChange(morph.id, 'form', event.target.value)
                    }
                    onBlur={() => morphology.onSaveMorphemes(unitId, token.id)}
                  />
                );
              })}
            </span>
          );
        }
        if (id === 'morphForm') {
          return (
            <button
              key={id}
              type="button"
              className="annotation-igt-cell"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onActivateCell(token.id, 'morphForm');
              }}
            >
              {morphFields
                .map((field) => field.form)
                .filter((form) => form.length > 0)
                .join('-')}
            </button>
          );
        }
        if (id === 'gloss') {
          const morphGloss = morphFields
            .map((field) => field.gloss)
            .filter((gloss) => gloss.length > 0);
          if (!editing && cellActive !== 'gloss' && morphGloss.length > 0) {
            return (
              <button
                key={id}
                type="button"
                className="annotation-igt-cell"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onActivateCell(token.id, 'gloss');
                }}
              >
                {morphGloss.join('-')}
              </button>
            );
          }
          if (cellActive === 'gloss' && morphs.length > 0 && morphGloss.length > 0) {
            return (
              <span key={id}>
                {morphs.map((morph, index) => {
                  const morphFieldsForInput = displayedAnnotationMorphemeFields(
                    morph,
                    morphology.drafts,
                  );
                  const morphInvalid = annotationGlossHasLeipzigIssue(
                    morphFieldsForInput.gloss,
                    glossAbbreviations,
                  );
                  return (
                    <input
                      key={morph.id}
                      className={
                        morphInvalid
                          ? 'annotation-igt-field annotation-igt-inline annotation-igt-field-invalid'
                          : 'annotation-igt-field annotation-igt-inline'
                      }
                      data-testid={`annotation-igt-morph-gloss-${morph.id}`}
                      aria-label={t(locale, 'workspace.annotation.morphemeGlossLabel')}
                      value={morphFieldsForInput.gloss}
                      autoFocus={index === 0}
                      onClick={(event) => event.stopPropagation()}
                      onFocus={() => onFocusInput(unitId)}
                      onChange={(event) =>
                        morphology.onMorphDraftChange(morph.id, 'gloss', event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        event.stopPropagation();
                        morphology.onSaveMorphemes(unitId, token.id);
                      }}
                    />
                  );
                })}
              </span>
            );
          }
          const unknownAbbr = glossInvalid
            ? annotationUnknownGlossAbbreviation(fields.gloss, glossAbbreviations)
            : null;
          return (
            <span key={id} className="annotation-igt-gloss-cell">
              <input
                className={
                  glossInvalid
                    ? 'annotation-igt-field annotation-igt-inline annotation-igt-field-invalid'
                    : 'annotation-igt-field annotation-igt-inline'
                }
                data-testid={`annotation-igt-gloss-${token.id}`}
                aria-label={t(locale, 'workspace.annotation.glossLabel')}
                aria-invalid={glossInvalid}
                value={fields.gloss}
                title={t(locale, 'workspace.annotation.keyboardHint')}
                {...(fields.gloss.trim().length === 0 && glossSuggestion
                  ? { placeholder: glossSuggestion }
                  : {})}
                onClick={(event) => event.stopPropagation()}
                onFocus={() => onFocusInput(unitId)}
                onKeyDown={(event) => {
                  if (
                    event.key !== 'Enter' ||
                    event.currentTarget.value.trim() ||
                    !glossSuggestion
                  ) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  onAcceptGlossSuggestion?.(unitId, token.id, glossSuggestion, token.glossLang);
                }}
                onChange={(event) =>
                  onTokenDraftChange(unitId, token.id, 'gloss', event.target.value)
                }
                onBlur={(event) => {
                  if (glossLineLanguage.length === 0) return;
                  onCommitGlossLanguage?.(token.id, glossLineLanguage, event.target.value);
                }}
              />
              {onApplyGlossByForm && fields.gloss.trim().length > 0 ? (
                <button
                  type="button"
                  className="annotation-igt-action"
                  data-testid={`annotation-igt-gloss-apply-${token.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onApplyGlossByForm(unitId, token.id, fields.gloss.trim());
                  }}
                >
                  {t(locale, 'workspace.annotation.applyGlossByForm')}
                </button>
              ) : null}
              {glossInvalid ? (
                <Link
                  className="annotation-igt-abbr-link"
                  to={`/assets/structural-profiles?section=abbreviations${
                    unknownAbbr ? `&abbr=${encodeURIComponent(unknownAbbr)}` : ''
                  }`}
                  onClick={(event) => event.stopPropagation()}
                >
                  {t(locale, 'workspace.annotation.editAbbreviation')}
                </Link>
              ) : null}
            </span>
          );
        }
        if (id === 'pos') {
          return (
            <span key={id}>
              <input
                className="annotation-igt-field annotation-igt-inline"
                data-testid={`annotation-igt-pos-${token.id}`}
                aria-label={t(locale, 'workspace.annotation.posLabel')}
                list={`annotation-pos-list-${token.id}`}
                value={fields.pos}
                onClick={(event) => event.stopPropagation()}
                onFocus={() => onFocusInput(unitId)}
                onChange={(event) =>
                  onTokenDraftChange(unitId, token.id, 'pos', event.target.value)
                }
              />
              <datalist id={`annotation-pos-list-${token.id}`}>
                {(posCategories ?? UD_POS_TAGS).map((tag) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
            </span>
          );
        }
        if (id === 'lemma' && (cellActive === 'lemma' || link === undefined)) {
          return (
            <input
              key={id}
              className="annotation-igt-field annotation-igt-inline"
              data-testid={`annotation-igt-lexeme-${token.id}`}
              aria-label={t(locale, 'workspace.annotation.lexemeLinkLabel')}
              defaultValue={morphology.linkQueries[token.id] ?? ''}
              autoFocus={cellActive === 'lemma'}
              onClick={(event) => event.stopPropagation()}
              onFocus={() => onFocusInput(unitId)}
              onChange={(event) => morphology.onLinkQueryChange(token.id, event.target.value)}
              onBlur={(event) => {
                const query = event.target.value.trim();
                if (query.length === 0) return;
                morphology.onLinkLexeme(token.id, query);
              }}
            />
          );
        }
        if (id === 'lemma') {
          return (
            <button
              key={id}
              type="button"
              className="annotation-igt-cell"
              {...(link
                ? {
                    'data-testid': link.brokenCode
                      ? `annotation-igt-lexeme-broken-${token.id}`
                      : `annotation-igt-lexeme-linked-${token.id}`,
                  }
                : {})}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onActivateCell(token.id, 'lemma');
              }}
            >
              {link ? lexemeLinkLabel(locale, link) : ''}
            </button>
          );
        }
        return <span key={id} className="annotation-igt-gloss" />;
      })}
    </span>
  );
}
