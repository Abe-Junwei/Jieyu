import '../styles/pages/language-metadata-workspace.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { JIEYU_MATERIAL_PANEL } from '../utils/jieyuMaterialIcon';
import { useSearchParams } from 'react-router-dom';
import { LanguageAssetRouteLink } from '../components/LanguageAssetRouteLink';
import { OrthographyPanelLink } from '../components/OrthographyPanelLink';
import { StructuralRuleProfileSandboxPanel } from '../components/StructuralRuleProfileSandboxPanel';
import { EmbeddedPanelShell } from '../components/ui/EmbeddedPanelShell';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import {
  loadStructuralProfileWorkspaceEntries,
  previewStructuralProfileWorkspaceRule,
  type LanguageCatalogEntry,
  type StructuralRuleProfilePreview,
} from '../hooks/structuralProfileWorkspaceRuntime';
import { useProjectLanguageIds } from '../hooks/useProjectLanguageIds';
import { t, useLocale } from '../i18n';
import { LANGUAGE_ID_PARAM, readEntryKindLabel, type WorkspaceLocale } from './languageMetadataWorkspace.shared';

const DEFAULT_GLOSS_SAMPLE = '1SG=COP dog-PL';

export function StructuralProfileWorkspacePage({
  registerSidePane = true,
  onClose,
}: {
  registerSidePane?: boolean;
  onClose?: () => void;
} = {}) {
  const locale: WorkspaceLocale = useLocale();
  const { projectLanguageIds } = useProjectLanguageIds();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<LanguageCatalogEntry[]>([]);
  const [, setLoading] = useState(true);
  const [structuralPreview, setStructuralPreview] = useState<StructuralRuleProfilePreview | null>(null);
  const [structuralPreviewPending, setStructuralPreviewPending] = useState(false);
  const [structuralPreviewError, setStructuralPreviewError] = useState('');
  const selectedLanguageId = searchParams.get(LANGUAGE_ID_PARAM) ?? '';

  const browseLanguageIds = useMemo(() => {
    const ids = new Set<string>();
    projectLanguageIds.forEach((languageId) => {
      const normalizedId = languageId.trim();
      if (normalizedId) {
        ids.add(normalizedId);
      }
    });
    const normalizedSelectedId = selectedLanguageId.trim();
    if (normalizedSelectedId) {
      ids.add(normalizedSelectedId);
    }
    return Array.from(ids);
  }, [projectLanguageIds, selectedLanguageId]);

  const selectedLanguageIdRef = useRef(selectedLanguageId);
  selectedLanguageIdRef.current = selectedLanguageId;
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const structuralPreviewRequestRef = useRef(0);

  useEffect(() => {
    setStructuralPreview(null);
    setStructuralPreviewError('');
    structuralPreviewRequestRef.current = 0;
  }, [selectedLanguageId]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const records = browseLanguageIds.length > 0
        ? await loadStructuralProfileWorkspaceEntries({
          locale,
          includeHidden: true,
          languageIds: browseLanguageIds,
        })
        : [];

      setEntries(records);
      return records;
    } catch {
      setEntries([]);
      return [] as LanguageCatalogEntry[];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void loadEntries().then((records) => {
      if (cancelled) return;
      const currentId = selectedLanguageIdRef.current;
      if (records.length === 0) return;
      if (!currentId) {
        const nextParams = new URLSearchParams(searchParamsRef.current);
        nextParams.set(LANGUAGE_ID_PARAM, records[0]!.id);
        setSearchParams(nextParams, { replace: true });
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refs avoid circular deps with search params
  }, [browseLanguageIds, locale]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedLanguageId) ?? null,
    [entries, selectedLanguageId],
  );

  const handleSelectEntry = (languageId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(LANGUAGE_ID_PARAM, languageId);
    setSearchParams(nextParams);
  };

  const handleStructuralPreview = async (glossText: string) => {
    if (!selectedEntry) return;
    const requestId = structuralPreviewRequestRef.current + 1;
    structuralPreviewRequestRef.current = requestId;
    const languageId = selectedEntry.id;
    setStructuralPreviewPending(true);
    try {
      const preview = await previewStructuralProfileWorkspaceRule({
        languageId,
        glossText,
      });
      if (structuralPreviewRequestRef.current !== requestId || selectedLanguageIdRef.current !== languageId) return;
      setStructuralPreview(preview);
      setStructuralPreviewError('');
    } catch (previewError) {
      if (structuralPreviewRequestRef.current !== requestId) return;
      setStructuralPreview(null);
      setStructuralPreviewError(
        previewError instanceof Error ? previewError.message : t(locale, 'workspace.structuralProfile.previewErrorFallback'),
      );
    } finally {
      if (structuralPreviewRequestRef.current === requestId) {
        setStructuralPreviewPending(false);
      }
    }
  };

  const sidePaneContent = useMemo(() => (
    <div className="app-side-pane-feature-stack">
      <section className="app-side-pane-group" aria-label={t(locale, 'workspace.structuralProfile.sidePaneCurrent')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'workspace.structuralProfile.sidePaneCurrent')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          {selectedEntry ? (
            <>
              <span className="app-side-pane-feature-badge">{readEntryKindLabel(locale, selectedEntry)}</span>
              <p className="app-side-pane-feature-summary">{selectedEntry.localName}</p>
              <p className="app-side-pane-feature-note">{selectedEntry.englishName}</p>
              <p className="app-side-pane-feature-note">{selectedEntry.languageCode}</p>
            </>
          ) : (
            <p className="app-side-pane-feature-note">{t(locale, 'workspace.structuralProfile.sidePaneEmpty')}</p>
          )}
        </div>
      </section>

      <section className="app-side-pane-group" aria-label={t(locale, 'workspace.structuralProfile.sidePaneQuickAccess')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'workspace.structuralProfile.sidePaneQuickAccess')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          <LanguageAssetRouteLink to="/assets/language-metadata" className="side-pane-nav-link app-side-pane-feature-link">
            {t(locale, 'workspace.structuralProfile.openLanguageMetadata')}
          </LanguageAssetRouteLink>
          <OrthographyPanelLink className="side-pane-nav-link app-side-pane-feature-link">
            {t(locale, 'workspace.structuralProfile.openOrthographyManager')}
          </OrthographyPanelLink>
          <LanguageAssetRouteLink to="/assets/orthography-bridges" className="side-pane-nav-link app-side-pane-feature-link">
            {t(locale, 'workspace.structuralProfile.openBridgeWorkspace')}
          </LanguageAssetRouteLink>
        </div>
      </section>
    </div>
  ), [locale, selectedEntry]);

  useRegisterAppSidePane({
    title: t(locale, 'workspace.structuralProfile.sidePaneTitle'),
    subtitle: selectedEntry?.localName ?? t(locale, 'workspace.structuralProfile.sidePaneSubtitle'),
    content: sidePaneContent,
    enabled: registerSidePane,
  });

  const panelActions = onClose ? (
    <button
      type="button"
      className="icon-btn"
      onClick={onClose}
      aria-label={t(locale, 'transcription.importDialog.close')}
      title={t(locale, 'transcription.importDialog.close')}
    >
      <MaterialSymbol name="close" className={JIEYU_MATERIAL_PANEL} />
    </button>
  ) : undefined;

  const panelFooter = (
    <div className="lm-footer">
      <div className="lm-footer-status">
        <p className="lm-state">{t(locale, 'workspace.structuralProfile.summary')}</p>
      </div>
    </div>
  );

  return (
    <EmbeddedPanelShell
      className="lm-shell lm-workspace la-shell"
      bodyClassName="lm-layout la-panel-stack"
      footerClassName="lm-footer"
      title={t(locale, 'workspace.structuralProfile.title')}
      actions={panelActions}
      footer={panelFooter}
      aria-label={t(locale, 'workspace.structuralProfile.title')}
    >
      {entries.length > 0 && (
        <nav className="lm-entry-list la-panel-section" aria-label={t(locale, 'workspace.structuralProfile.title')}>
          {entries.map((entry) => {
            const isSelected = entry.id === selectedLanguageId;
            return (
              <button
                key={entry.id}
                type="button"
                className={`lm-entry-item${isSelected ? ' is-selected' : ''}`}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => handleSelectEntry(entry.id)}
              >
                <span className="lm-entry-item-name">{entry.localName || entry.englishName || entry.id}</span>
                <span className="lm-entry-item-code">{entry.languageCode}</span>
              </button>
            );
          })}
        </nav>
      )}

      {selectedEntry ? (
        <StructuralRuleProfileSandboxPanel
          locale={locale}
          preview={structuralPreview}
          pending={structuralPreviewPending}
          errorMessage={structuralPreviewError}
          initialGloss={DEFAULT_GLOSS_SAMPLE}
          onPreview={handleStructuralPreview}
        />
      ) : null}
    </EmbeddedPanelShell>
  );
}
