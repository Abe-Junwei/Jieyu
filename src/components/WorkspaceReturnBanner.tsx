import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { t, type Locale } from '../i18n';
import {
  buildLexiconWorkspaceHref,
  readLexiconReturnParam,
} from '../utils/workspaceReturnDeepLink';

export function WorkspaceReturnBanner({ locale }: { locale: Locale }): ReactNode {
  const location = useLocation();
  if (location.pathname === '/lexicon') return null;
  const lexemeId = readLexiconReturnParam(new URLSearchParams(location.search));
  if (lexemeId.length === 0) return null;

  return (
    <div
      className="app-workspace-return"
      role="status"
      data-testid="app-workspace-return"
      data-lexicon-return={lexemeId}
    >
      <Link className="app-workspace-return-link" to={buildLexiconWorkspaceHref()}>
        {t(locale, 'app.workspaceReturn.backToLexicon')}
      </Link>
    </div>
  );
}
