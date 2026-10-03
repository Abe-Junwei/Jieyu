import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { t, useLocale } from '../../i18n';
import type { AnnotationIgtRow } from '../useAnnotationWorkspaceController';
import type { AnnotationMorphologyController } from '../useAnnotationMorphologyController';
import type { AnnotationTokenDraft } from './annotationTokenDrafts';
import {
  annotationLineAlignsToWords,
  annotationLineBand,
  annotationLineKind,
  annotationLineLanguage,
} from './annotationIgtLines';
import { annotationLanguageLineLabel } from './annotationIgtMenus';
import { AnnotationSentenceAcousticFigure } from './AnnotationSentenceAcousticFigure';
import type { AnnotationSentenceAcoustic } from '../useAnnotationSentenceAcoustic';
import {
  AnnotationIgtWordCells,
  AnnotationMoreButton,
  type AnnotationActiveCell,
} from './AnnotationIgtWordCells';

export { AnnotationMoreButton };
export type { AnnotationActiveCell };

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
              <AnnotationIgtWordCells
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
