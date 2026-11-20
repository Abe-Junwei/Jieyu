import { lazy, Suspense, useMemo, type SyntheticEvent } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { featureFlags } from './ai/config/featureFlags';
import { ToastProvider } from './contexts/ToastContext';
import { AppGlobalToastHost } from './components/AppGlobalToastHost';
import { AppOfflineStatusBanner } from './components/AppOfflineStatusBanner';
import { WorkspaceReturnBanner } from './components/WorkspaceReturnBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DevErrorAggregationPanel } from './components/DevErrorAggregationPanel';
import { DesktopRoute } from './components/DesktopRoute';
import { JieyuIcon } from './components/ui/JieyuIcon';
import { AiPanelProvider } from './contexts/AiPanelContext';
import { AppSidePaneProvider } from './contexts/AppSidePaneContext';
import { AssetPanelProvider, type AssetPanelContextValue } from './contexts/AssetPanelContext';
import { LocaleProvider, t } from './i18n';
import { JIEYU_ICON_NAV } from './utils/jieyuIcon';
import { DesktopSettingsDialog } from './pages/DesktopSettingsDialog';
import { DesktopShellSidePane } from './pages/DesktopShellSidePane';
import {
  activeDesktopNav,
  desktopPrimaryNav,
  desktopSecondaryNav,
  resolveDesktopNavTo,
} from './pages/desktopShellNav';
import { useDesktopShellPreferences } from './pages/useDesktopShellPreferences';
import { useDesktopShellSidePane } from './pages/useDesktopShellSidePane';

const DesktopProjectReadPage = lazy(() =>
  import('./pages/DesktopProjectReadPage').then((m) => ({ default: m.DesktopProjectReadPage })),
);
const DesktopTranscriptionWorkspacePage = lazy(() =>
  import('./pages/DesktopTranscriptionWorkspacePage').then((m) => ({
    default: m.DesktopTranscriptionWorkspacePage,
  })),
);
const DesktopCorpusPage = lazy(() =>
  import('./pages/DesktopCorpusPage').then((m) => ({ default: m.DesktopCorpusPage })),
);
const DesktopAnnotationPage = lazy(() =>
  import('./pages/DesktopAnnotationPage').then((m) => ({ default: m.DesktopAnnotationPage })),
);
const DesktopLexiconPage = lazy(() =>
  import('./pages/DesktopLexiconPage').then((m) => ({ default: m.DesktopLexiconPage })),
);
const DesktopCatalogPage = lazy(() =>
  import('./pages/DesktopCatalogPage').then((m) => ({ default: m.DesktopCatalogPage })),
);
const DesktopAnalysisPage = lazy(() =>
  import('./pages/DesktopAnalysisPage').then((m) => ({ default: m.DesktopAnalysisPage })),
);

function DesktopNotFound({
  locale,
}: {
  locale: ReturnType<typeof useDesktopShellPreferences>['locale'];
}) {
  return (
    <section className="panel">
      <h2>{t(locale, 'app.notFound.title')}</h2>
      <p>{t(locale, 'app.notFound.desc')}</p>
    </section>
  );
}

export function DesktopApp() {
  const prefs = useDesktopShellPreferences();
  const pane = useDesktopShellSidePane();
  const primaryNav = desktopPrimaryNav(prefs.locale);
  const secondaryNav = desktopSecondaryNav(prefs.locale);
  const navItems = [...primaryNav, ...secondaryNav];
  const activeNavItem = activeDesktopNav(navItems, pane.location.pathname);
  const assetPanelCtx = useMemo<AssetPanelContextValue>(() => ({ openPanel() {} }), []);
  const shellStyleProps = { style: pane.shellStyle };
  const handleSidePaneToggle = (event?: SyntheticEvent<HTMLElement>) => {
    event?.stopPropagation();
    pane.setIsSidePaneCollapsed((prev) => !prev);
  };

  return (
    <ErrorBoundary>
      <LocaleProvider locale={prefs.locale}>
        <ToastProvider>
          <AppSidePaneProvider>
            <div
              className={`app-shell ${pane.location.pathname === '/' ? 'app-shell-home' : ''} ${pane.isTranscriptionRoute ? 'app-shell-transcription' : ''} ${pane.desktopContextPane ? 'app-shell-desktop-transcription' : ''} ${pane.isSidePaneCollapsed ? 'app-shell-side-pane-collapsed' : ''}`}
              {...shellStyleProps}
            >
              <div role="region" aria-label={t(prefs.locale, 'app.shell.aria.notices')}>
                <AppOfflineStatusBanner locale={prefs.locale} />
                <WorkspaceReturnBanner locale={prefs.locale} />
              </div>
              <div ref={pane.shellBodyRef} className="app-shell-body">
                <aside
                  className="app-left-rail"
                  aria-label={t(prefs.locale, 'app.leftRail.aria.navigation')}
                >
                  <nav
                    className="app-left-rail-group app-left-rail-primary"
                    aria-label={t(prefs.locale, 'app.navGroup.core')}
                  >
                    {primaryNav.map((item) => (
                      <NavLink
                        key={item.to}
                        to={resolveDesktopNavTo(item.to)}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                          isActive ? 'left-rail-btn left-rail-btn-active' : 'left-rail-btn'
                        }
                        title={item.label}
                        aria-label={item.label}
                      >
                        <JieyuIcon name={item.icon} aria-hidden className={JIEYU_ICON_NAV} />
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </nav>
                  <div
                    className="app-left-rail-footer"
                    aria-label={t(prefs.locale, 'app.leftRail.aria.footer')}
                  >
                    <button
                      type="button"
                      className="left-rail-btn left-rail-btn-utility"
                      aria-label={t(prefs.locale, 'transcription.voiceWidget.settings.button')}
                      title={t(prefs.locale, 'transcription.voiceWidget.settings.button')}
                      onClick={prefs.openSettings}
                    >
                      <JieyuIcon name="Settings" aria-hidden className={JIEYU_ICON_NAV} />
                    </button>
                  </div>
                </aside>
                {pane.hideSidePane ? null : (
                  <DesktopShellSidePane
                    locale={prefs.locale}
                    activeNavItem={activeNavItem}
                    isTranscriptionRoute={pane.isTranscriptionRoute}
                    isSidePaneCollapsed={pane.isSidePaneCollapsed}
                    sidePaneWidth={pane.sidePaneWidth}
                    minWidth={pane.minWidth}
                    maxWidth={pane.maxWidth}
                    handleSidePaneResizeStart={pane.handleSidePaneResizeStart}
                    handleSidePaneResizeKeyDown={pane.handleSidePaneResizeKeyDown}
                    handleSidePaneResizeReset={pane.handleSidePaneResizeReset}
                    handleSidePaneToggle={handleSidePaneToggle}
                  />
                )}
                <main
                  className={`app-main ${pane.isTranscriptionRoute ? 'app-main-transcription' : ''}`}
                >
                  <h1 className="app-main-screen-reader-heading">{activeNavItem?.label}</h1>
                  <AiPanelProvider>
                    <AssetPanelProvider value={assetPanelCtx}>
                      <Suspense fallback={<div className="app-route-loading" aria-busy="true" />}>
                        <Routes location={pane.location}>
                          <Route
                            path="/"
                            element={
                              <DesktopRoute folder desktop={() => <DesktopProjectReadPage />} />
                            }
                          />
                          <Route
                            path="/desktop-project"
                            element={
                              <DesktopRoute folder desktop={() => <DesktopProjectReadPage />} />
                            }
                          />
                          <Route
                            path="/transcription"
                            element={
                              <DesktopRoute
                                desktop={() =>
                                  featureFlags.desktopTranscriptionWorkspaceEnabled ? (
                                    <DesktopTranscriptionWorkspacePage />
                                  ) : (
                                    <DesktopProjectReadPage />
                                  )
                                }
                              />
                            }
                          />
                          <Route
                            path="/assets/language-metadata"
                            element={
                              <DesktopRoute
                                desktop={(host) => (
                                  <DesktopCatalogPage host={host} section="language" />
                                )}
                              />
                            }
                          />
                          <Route
                            path="/assets/structural-profiles"
                            element={
                              <DesktopRoute
                                desktop={(host) => (
                                  <DesktopCatalogPage host={host} section="structure" />
                                )}
                              />
                            }
                          />
                          <Route
                            path="/assets/orthographies"
                            element={
                              <DesktopRoute
                                desktop={(host) => (
                                  <DesktopCatalogPage host={host} section="orthography" />
                                )}
                              />
                            }
                          />
                          <Route
                            path="/assets/orthography-bridges"
                            element={
                              <DesktopRoute
                                desktop={(host) => (
                                  <DesktopCatalogPage host={host} section="bridge" />
                                )}
                              />
                            }
                          />
                          <Route
                            path="/annotation"
                            element={
                              <DesktopRoute
                                desktop={(host) => <DesktopAnnotationPage host={host} />}
                              />
                            }
                          />
                          <Route
                            path="/analysis"
                            element={
                              <DesktopRoute
                                desktop={(host) => <DesktopAnalysisPage host={host} />}
                              />
                            }
                          />
                          <Route path="/writing" element={<Navigate to="/corpus" replace />} />
                          <Route
                            path="/corpus"
                            element={<DesktopRoute desktop={() => <DesktopCorpusPage />} />}
                          />
                          <Route
                            path="/lexicon"
                            element={
                              <DesktopRoute
                                desktop={(host) => <DesktopLexiconPage host={host} />}
                              />
                            }
                          />
                          <Route path="*" element={<DesktopNotFound locale={prefs.locale} />} />
                        </Routes>
                      </Suspense>
                    </AssetPanelProvider>
                  </AiPanelProvider>
                </main>
              </div>
              {import.meta.env.DEV ? <DevErrorAggregationPanel /> : null}
              <AppGlobalToastHost />
              <DesktopSettingsDialog
                isOpen={prefs.isSettingsOpen}
                onClose={prefs.closeSettings}
                locale={prefs.locale}
                themeMode={prefs.themeMode}
                onThemeChange={prefs.setThemeMode}
                onLocaleChange={prefs.handleLocaleChange}
                fontScale={prefs.uiFontScale}
                fontScaleMode={prefs.uiFontScaleMode}
                onFontScaleChange={prefs.handleFontScaleChange}
                onFontScaleModeChange={prefs.handleFontScaleModeChange}
              />
            </div>
          </AppSidePaneProvider>
        </ToastProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}
