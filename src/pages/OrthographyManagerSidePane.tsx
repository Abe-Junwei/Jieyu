import { Link } from 'react-router-dom';
import { getOrthographyCatalogBadgeInfo } from '../components/orthographyCatalogUi';
import { formatOrthographyOptionLabel } from '~/hooks/orthography/useOrthographyPicker';
import { t, type Locale } from '../i18n';
import type { OrthographyDocType } from '../types/jieyuDbDocTypes';
import { buildTranscriptionWorkspaceReturnHref } from '../utils/transcriptionUrlDeepLink';

export interface OrthographyManagerSidePaneProps {
  locale: Locale;
  selectedOrthography: OrthographyDocType | null;
  bridgeWorkspaceHref: string;
  onBeforeOpenBridge: () => boolean;
}

export function OrthographyManagerSidePane({
  locale,
  selectedOrthography,
  bridgeWorkspaceHref,
  onBeforeOpenBridge,
}: OrthographyManagerSidePaneProps) {
  const selectedBadge = selectedOrthography
    ? getOrthographyCatalogBadgeInfo(locale, selectedOrthography)
    : null;

  return (
    <div className="app-side-pane-feature-stack">
      <section
        className="app-side-pane-group"
        aria-label={t(locale, 'workspace.orthography.sidePaneCurrent')}
      >
        <div
          className="app-side-pane-group-toggle app-side-pane-group-toggle-static"
          role="presentation"
        >
          <span className="app-side-pane-section-title">
            {t(locale, 'workspace.orthography.sidePaneCurrent')}
          </span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          {selectedOrthography ? (
            <>
              <span className="app-side-pane-feature-badge">
                {selectedBadge?.label ?? t(locale, 'workspace.orthography.notSet')}
              </span>
              <p className="app-side-pane-feature-summary">
                {formatOrthographyOptionLabel(selectedOrthography, locale)}
              </p>
              <p className="app-side-pane-feature-note">
                {t(locale, 'workspace.orthography.sidePaneSelectedHint')}
              </p>
            </>
          ) : (
            <p className="app-side-pane-feature-note">
              {t(locale, 'workspace.orthography.sidePaneEmpty')}
            </p>
          )}
        </div>
      </section>

      <section
        className="app-side-pane-group"
        aria-label={t(locale, 'workspace.orthography.sidePaneQuickAccess')}
      >
        <div
          className="app-side-pane-group-toggle app-side-pane-group-toggle-static"
          role="presentation"
        >
          <span className="app-side-pane-section-title">
            {t(locale, 'workspace.orthography.sidePaneQuickAccess')}
          </span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          <Link
            to={buildTranscriptionWorkspaceReturnHref()}
            className="side-pane-nav-link app-side-pane-feature-link"
            onClick={(event) => {
              if (!onBeforeOpenBridge()) {
                event.preventDefault();
              }
            }}
          >
            {t(locale, 'app.featureAvailability.backToTranscription')}
          </Link>
          <Link
            to={bridgeWorkspaceHref}
            className="side-pane-nav-link app-side-pane-feature-link"
            onClick={(event) => {
              if (!onBeforeOpenBridge()) {
                event.preventDefault();
              }
            }}
          >
            {t(locale, 'workspace.orthography.openBridgeWorkspace')}
          </Link>
        </div>
      </section>
    </div>
  );
}
