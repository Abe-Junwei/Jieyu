import { Link } from 'react-router-dom';
import { t, useLocale } from '../../i18n';
import type { AnnotationIgtRow, AnnotationIgtToken } from '../useAnnotationWorkspaceController';
import { displayedAnnotationTokenFields, type AnnotationTokenDraft } from './annotationTokenDrafts';

type Props = {
  row: AnnotationIgtRow;
  focused: boolean;
  inputFocused: boolean;
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
  onFocusRow: (unitId: string) => void;
  onFocusInput: (unitId: string) => void;
  onTokenDraftChange: (
    unitId: string,
    tokenId: string,
    field: keyof AnnotationTokenDraft,
    value: string,
  ) => void;
};

function TokenStack({
  token,
  unitId,
  inputFocused,
  drafts,
  onFocusInput,
  onTokenDraftChange,
}: {
  token: AnnotationIgtToken;
  unitId: string;
  inputFocused: boolean;
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
  onFocusInput: (unitId: string) => void;
  onTokenDraftChange: Props['onTokenDraftChange'];
}) {
  const locale = useLocale();
  const fields = displayedAnnotationTokenFields(token, drafts);
  return (
    <span className="annotation-igt-stack">
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
            className="annotation-igt-field"
            data-testid={`annotation-igt-gloss-${token.id}`}
            aria-label={t(locale, 'workspace.annotation.glossLabel')}
            value={fields.gloss}
            onClick={(event) => event.stopPropagation()}
            onFocus={() => onFocusInput(unitId)}
            onChange={(event) => onTokenDraftChange(unitId, token.id, 'gloss', event.target.value)}
          />
        </>
      ) : (
        <>
          <span className="annotation-igt-pos">{fields.pos}</span>
          <span className="annotation-igt-gloss">{fields.gloss}</span>
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
  onFocusRow,
  onFocusInput,
  onTokenDraftChange,
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
              onFocusInput={onFocusInput}
              onTokenDraftChange={onTokenDraftChange}
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
      <p className="annotation-igt-label">{t(locale, 'workspace.annotation.translationLabel')}</p>
      <p className="annotation-igt-translation">
        {row.translation.length > 0
          ? row.translation
          : t(locale, 'workspace.annotation.translationEmpty')}
      </p>
    </li>
  );
}
