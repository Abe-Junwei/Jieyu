import type { PointerEvent, KeyboardEvent, SyntheticEvent } from 'react';
import { useAppSidePaneRegistrationSnapshot } from '../contexts/AppSidePaneContext';
import { t, type Locale } from '../i18n';
import type { DesktopNavItem } from './desktopShellNav';

export function DesktopShellSidePane({
  locale,
  activeNavItem,
  isTranscriptionRoute,
  isSidePaneCollapsed,
  sidePaneWidth,
  minWidth,
  maxWidth,
  handleSidePaneResizeStart,
  handleSidePaneResizeKeyDown,
  handleSidePaneResizeReset,
  handleSidePaneToggle,
}: {
  locale: Locale;
  activeNavItem: DesktopNavItem | undefined;
  isTranscriptionRoute: boolean;
  isSidePaneCollapsed: boolean;
  sidePaneWidth: number;
  minWidth: number;
  maxWidth: number;
  handleSidePaneResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  handleSidePaneResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  handleSidePaneResizeReset: () => void;
  handleSidePaneToggle: (event?: SyntheticEvent<HTMLElement>) => void;
}) {
  const sidePaneRegistration = useAppSidePaneRegistrationSnapshot();
  const sidePaneTitle =
    sidePaneRegistration?.title ?? activeNavItem?.label ?? t(locale, 'app.sidePane.defaultTitle');
  const sidePaneSubtitle =
    sidePaneRegistration?.subtitle ??
    activeNavItem?.summary ??
    t(locale, 'app.sidePane.defaultSubtitle');
  const sidePaneBody =
    sidePaneRegistration == null ? (
      <div className="app-side-pane-empty-state entry-card entry-card--dashed entry-card--compact">
        <strong>{sidePaneTitle}</strong>
        <span>{sidePaneSubtitle}</span>
        <p>{t(locale, 'app.sidePane.emptyDesc')}</p>
      </div>
    ) : (
      sidePaneRegistration.content
    );

  return (
    <>
      <aside
        className={`app-side-pane ${isTranscriptionRoute ? 'app-side-pane-transcription' : ''} ${isSidePaneCollapsed ? 'app-side-pane-collapsed' : ''}`}
        aria-label={t(locale, 'app.sidePane.aria.panel')}
      >
        <div className="app-side-pane-header">
          <p className="app-side-pane-title">{sidePaneTitle}</p>
          {sidePaneSubtitle.length > 0 ? (
            <p className="app-side-pane-subtitle">{sidePaneSubtitle}</p>
          ) : null}
        </div>
        <div className="app-side-pane-body">
          <div
            id="app-side-pane-body-slot"
            className="app-side-pane-body-slot"
            role="group"
            aria-label={t(locale, 'app.sidePane.aria.content')}
          >
            {sidePaneBody}
          </div>
        </div>
      </aside>
      <div
        className={`app-side-pane-handle-cluster ${isTranscriptionRoute ? 'app-side-pane-handle-cluster-transcription' : ''}`}
        role="region"
        aria-label={t(locale, 'app.sidePane.aria.controls')}
      >
        <div
          className="app-side-pane-resizer sidebar-handle-resizer"
          onPointerDown={handleSidePaneResizeStart}
          onKeyDown={handleSidePaneResizeKeyDown}
          onDoubleClick={handleSidePaneResizeReset}
          role="separator"
          tabIndex={isSidePaneCollapsed ? -1 : 0}
          aria-orientation="vertical"
          aria-valuemin={minWidth}
          aria-valuemax={maxWidth}
          aria-valuenow={sidePaneWidth}
          aria-label={t(locale, 'app.sidePane.aria.resize')}
        />
        <button
          type="button"
          className="app-side-pane-collapse-toggle sidebar-handle-toggle is-left"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={handleSidePaneToggle}
          aria-expanded={!isSidePaneCollapsed}
          aria-label={
            isSidePaneCollapsed
              ? t(locale, 'app.sidePane.expand')
              : t(locale, 'app.sidePane.collapse')
          }
          title={
            isSidePaneCollapsed
              ? t(locale, 'app.sidePane.expand')
              : t(locale, 'app.sidePane.collapse')
          }
        />
      </div>
    </>
  );
}
