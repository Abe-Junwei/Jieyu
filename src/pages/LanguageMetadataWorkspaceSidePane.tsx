import { t } from '../i18n';
import type { LanguageCatalogEntry } from '../types/linguisticCatalogSurface.types';
import { LanguageAssetRouteLink } from '../components/LanguageAssetRouteLink';
import { OrthographyPanelLink } from '../components/OrthographyPanelLink';
import { readEntryKindLabel, type WorkspaceLocale } from './languageMetadataWorkspace.shared';

export interface LanguageMetadataWorkspaceSidePaneProps {
  locale: WorkspaceLocale;
  selectedEntry: LanguageCatalogEntry | null;
}

export function LanguageMetadataWorkspaceSidePane({
  locale,
  selectedEntry,
}: LanguageMetadataWorkspaceSidePaneProps) {
  return (
    <div className="app-side-pane-feature-stack">
      <section
        className="app-side-pane-group"
        aria-label={t(locale, 'workspace.languageMetadata.sidePaneCurrent')}
      >
        <div
          className="app-side-pane-group-toggle app-side-pane-group-toggle-static"
          role="presentation"
        >
          <span className="app-side-pane-section-title">
            {t(locale, 'workspace.languageMetadata.sidePaneCurrent')}
          </span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          {selectedEntry ? (
            <>
              <span className="app-side-pane-feature-badge">
                {readEntryKindLabel(locale, selectedEntry)}
              </span>
              <p className="app-side-pane-feature-summary">{selectedEntry.localName}</p>
              <p className="app-side-pane-feature-note">{selectedEntry.englishName}</p>
              <p className="app-side-pane-feature-note">{selectedEntry.languageCode}</p>
            </>
          ) : (
            <p className="app-side-pane-feature-note">
              {t(locale, 'workspace.languageMetadata.sidePaneEmpty')}
            </p>
          )}
        </div>
      </section>

      <section
        className="app-side-pane-group"
        aria-label={t(locale, 'workspace.languageMetadata.sidePaneQuickAccess')}
      >
        <div
          className="app-side-pane-group-toggle app-side-pane-group-toggle-static"
          role="presentation"
        >
          <span className="app-side-pane-section-title">
            {t(locale, 'workspace.languageMetadata.sidePaneQuickAccess')}
          </span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          <OrthographyPanelLink className="side-pane-nav-link app-side-pane-feature-link">
            {t(locale, 'workspace.languageMetadata.openOrthographyManager')}
          </OrthographyPanelLink>
          <LanguageAssetRouteLink
            to="/assets/structural-profiles"
            className="side-pane-nav-link app-side-pane-feature-link"
          >
            {t(locale, 'workspace.languageMetadata.openStructuralProfiles')}
          </LanguageAssetRouteLink>
          <LanguageAssetRouteLink
            to="/assets/orthography-bridges"
            className="side-pane-nav-link app-side-pane-feature-link"
          >
            {t(locale, 'workspace.languageMetadata.openBridgeWorkspace')}
          </LanguageAssetRouteLink>
        </div>
      </section>
    </div>
  );
}
