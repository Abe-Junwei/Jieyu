import { useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { t, useLocale } from '../../i18n';
import { UD_POS_TAGS } from '../../annotation/udPosTags';
import type { AnnotationIgtRow, AnnotationIgtToken } from '../useAnnotationWorkspaceController';
import type { AnnotationMorphologyController } from '../useAnnotationMorphologyController';
import type { AnnotationTokenDraft } from './annotationTokenDrafts';
import { displayedAnnotationTokenFields } from './annotationTokenDrafts';
import { displayedAnnotationMorphemeFields } from './annotationMorphemeDrafts';
import { annotationGlossHasLeipzigIssue } from './annotationLeipzigGloss';
import {
  annotationGlossCell,
  annotationLineAlignsToWords,
  annotationLineLabelKey,
  type AnnotationLineId,
} from './annotationIgtLines';
import { lexemeLinkLabel } from './AnnotationIgtTokenEditor';
import { AnnotationSentenceAcousticFigure } from './AnnotationSentenceAcousticFigure';
import type { AnnotationSentenceAcoustic } from '../useAnnotationSentenceAcoustic';

export function AnnotationIgtLineGrid({
  row,
  lines,
  drafts,
  morphology,
  editing,
  mweSelectedIds,
  onOpenWordMenu,
  onSelectWord,
  onFocusInput,
  onTokenDraftChange,
  sentenceAcoustic,
  showWave,
  showSpectrum,
  showPitch,
  textLanguageId,
  glossSuggestions,
  onAcceptGlossSuggestion,
}: {
  row: AnnotationIgtRow;
  lines: readonly AnnotationLineId[];
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
  morphology: AnnotationMorphologyController;
  editing: boolean;
  mweSelectedIds: readonly string[];
  onOpenWordMenu: (event: ReactMouseEvent<HTMLElement>, tokenId: string) => void;
  onSelectWord: (tokenId: string) => void;
  onFocusInput: (unitId: string) => void;
  onTokenDraftChange: (
    unitId: string,
    tokenId: string,
    field: keyof AnnotationTokenDraft,
    value: string,
  ) => void;
  sentenceAcoustic?: AnnotationSentenceAcoustic;
  showWave: boolean;
  showSpectrum: boolean;
  showPitch: boolean;
  textLanguageId?: string;
  glossSuggestions?: Readonly<Record<string, string>>;
  onAcceptGlossSuggestion?: (unitId: string, tokenId: string, gloss: string, lang: string) => void;
}) {
  const locale = useLocale();
  const linesRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  useLayoutEffect(() => {
    const root = linesRef.current;
    if (!root) return undefined;
    const measure = () => setContentWidth(widestTextLineWidth(root));
    measure();
    const Observer = globalThis.ResizeObserver;
    if (typeof Observer !== 'function') return undefined;
    const observer = new Observer(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [row.surface, row.translation, row.id, lines, row.tokens.length]);
  const wordLines = lines.filter(annotationLineAlignsToWords);
  const sentenceLines = lines.filter((id) => !annotationLineAlignsToWords(id));
  const source = sentenceLines.filter((id) => id === 'source');
  const translation = sentenceLines.filter((id) => id === 'translation');
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
          text={
            row.surface.length > 0 ? row.surface : t(locale, 'workspace.annotation.surfaceEmpty')
          }
          testId={`annotation-igt-surface-${row.id}`}
        />
      ))}
      {wordLines.length > 0 && row.tokens.length > 0 ? (
        <div className="annotation-igt-aligned">
          <div className="annotation-igt-aligned-labels">
            {wordLines.map((id) => (
              <span
                key={id}
                className="annotation-igt-line-label"
                data-testid={`annotation-igt-line-${id}-${row.id}`}
              >
                {t(locale, annotationLineLabelKey(id))}
              </span>
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
                mweSelected={mweSelectedIds.includes(token.id)}
                onOpenWordMenu={onOpenWordMenu}
                onSelectWord={onSelectWord}
                onFocusInput={onFocusInput}
                onTokenDraftChange={onTokenDraftChange}
                glossSuggestion={glossSuggestions?.[token.id] ?? ''}
                textLanguageId={textLanguageId ?? ''}
                {...(onAcceptGlossSuggestion ? { onAcceptGlossSuggestion } : {})}
              />
            ))}
          </div>
        </div>
      ) : null}
      {translation.map((id) => (
        <SentenceLine key={id} lineId={id} text={row.translation} />
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

function SentenceLine({
  lineId,
  text,
  testId,
}: {
  lineId: AnnotationLineId;
  text: string;
  testId?: string;
}) {
  const locale = useLocale();
  return (
    <div className="annotation-igt-line">
      <span className="annotation-igt-line-label">{t(locale, annotationLineLabelKey(lineId))}</span>
      <span className="annotation-igt-line-sentence" {...(testId ? { 'data-testid': testId } : {})}>
        {text}
      </span>
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
  mweSelected,
  onOpenWordMenu,
  onSelectWord,
  onFocusInput,
  onTokenDraftChange,
  glossSuggestion = '',
  textLanguageId = '',
  onAcceptGlossSuggestion,
}: {
  token: AnnotationIgtToken;
  unitId: string;
  lines: readonly AnnotationLineId[];
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
  morphology: AnnotationMorphologyController;
  editing: boolean;
  mweSelected: boolean;
  onOpenWordMenu: (event: ReactMouseEvent<HTMLElement>, tokenId: string) => void;
  onSelectWord: (tokenId: string) => void;
  onFocusInput: (unitId: string) => void;
  onTokenDraftChange: (
    unitId: string,
    tokenId: string,
    field: keyof AnnotationTokenDraft,
    value: string,
  ) => void;
  glossSuggestion?: string;
  textLanguageId?: string;
  onAcceptGlossSuggestion?: (unitId: string, tokenId: string, gloss: string, lang: string) => void;
}) {
  const locale = useLocale();
  const fields = displayedAnnotationTokenFields(token, drafts);
  const morphs = morphology.morphsByTokenId[token.id] ?? [];
  const morphFields = morphs.map((morph) =>
    displayedAnnotationMorphemeFields(morph, morphology.drafts),
  );
  const link = morphology.linksByTokenId[token.id];
  const glossInvalid = annotationGlossHasLeipzigIssue(fields.gloss);
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
        if (id === 'word') {
          return (
            <span key={id} className="annotation-igt-form">
              <button
                type="button"
                className="annotation-igt-form-select"
                data-testid={`annotation-igt-select-${token.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectWord(token.id);
                }}
              >
                {token.form}
              </button>
              {token.languageId && token.languageId !== textLanguageId ? (
                <sub
                  className="annotation-igt-lang"
                  data-testid={`annotation-igt-lang-${token.id}`}
                >
                  {token.languageId}
                </sub>
              ) : null}
              <button
                type="button"
                className="annotation-igt-word-actions"
                data-testid={`annotation-igt-word-actions-${token.id}`}
                aria-label={t(locale, 'workspace.annotation.wordActions')}
                onClick={(event) => onOpenWordMenu(event, token.id)}
              >
                ⋯
              </button>
            </span>
          );
        }
        if (id === 'morphForm') {
          return (
            <span key={id} className="annotation-igt-gloss">
              {morphFields
                .map((field) => field.form)
                .filter((form) => form.length > 0)
                .join('-')}
            </span>
          );
        }
        if (id === 'gloss' && editing) {
          return (
            <input
              key={id}
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
              onClick={(event) => event.stopPropagation()}
              onFocus={() => onFocusInput(unitId)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.currentTarget.value.trim() || !glossSuggestion) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                onAcceptGlossSuggestion?.(unitId, token.id, glossSuggestion, token.glossLang);
              }}
              onChange={(event) =>
                onTokenDraftChange(unitId, token.id, 'gloss', event.target.value)
              }
            />
          );
        }
        if (id === 'gloss') {
          return (
            <span key={id} className="annotation-igt-gloss">
              {annotationGlossCell(
                fields.gloss,
                morphFields.map((field) => field.gloss),
              )}
            </span>
          );
        }
        if (id === 'pos' && editing) {
          return (
            <span key={id}>
              <input
                className="annotation-igt-field"
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
                {UD_POS_TAGS.map((tag) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
            </span>
          );
        }
        if (id === 'pos') {
          return (
            <span key={id} className="annotation-igt-pos">
              {fields.pos}
            </span>
          );
        }
        if (id === 'lemma') {
          return (
            <span
              key={id}
              className="annotation-igt-gloss"
              {...(link
                ? {
                    'data-testid': link.brokenCode
                      ? `annotation-igt-lexeme-broken-${token.id}`
                      : `annotation-igt-lexeme-linked-${token.id}`,
                  }
                : {})}
            >
              {link ? lexemeLinkLabel(locale, link) : ''}
            </span>
          );
        }
        return <span key={id} className="annotation-igt-gloss" />;
      })}
    </span>
  );
}
