import '../styles/pages/orthography-workspace.css';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { OrthographyBridgeManager } from '../components/OrthographyBridgeManager';
import { getOrthographyCatalogBadgeInfo } from '../components/orthographyCatalogUi';
import { PanelSection } from '../components/ui/PanelSection';
import { PanelSummary } from '../components/ui/PanelSummary';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import type { OrthographyDocType } from '../db';
import { formatOrthographyOptionLabel } from '../hooks/useOrthographyPicker';
import { useLanguageCatalogLabelMap } from '../hooks/useLanguageCatalogLabelMap';
import { t, useLocale } from '../i18n';
import { getOrthographyBuilderMessages } from '../i18n/orthographyBuilderMessages';
import { OrthographyWorkspaceEditor } from './OrthographyWorkspaceEditor';
import {
  areDraftsEqual,
  buildOrthographyDraft,
  buildSearchText,
  parseConversionRulesJson,
  parseDraftList,
  parseOptionalNumber,
  type OrthographyDraft,
  type NormalizationForm,
} from './orthographyWorkspacePage.utils';
import { LinguisticService } from '../services/LinguisticService';
import { COMMON_LANGUAGES } from '../utils/transcriptionFormatters';
import type { LanguageIsoInputValue } from '../components/LanguageIsoInput';
import { buildPrimaryAndEnglishLabels } from '../utils/multiLangLabels';

const ORTHOGRAPHY_ID_PARAM = 'orthographyId';

export function OrthographyWorkspacePage() {
  const locale = useLocale();
  const builderMessages = getOrthographyBuilderMessages(locale);
  const [searchParams, setSearchParams] = useSearchParams();
  const [orthographies, setOrthographies] = useState<OrthographyDocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [draft, setDraft] = useState<OrthographyDraft | null>(null);
  const [languageInput, setLanguageInput] = useState<LanguageIsoInputValue>({ languageName: '', languageCode: '' });
  const deferredSearchText = useDeferredValue(searchText);
  const { resolveLabel, resolveLanguageDisplayName } = useLanguageCatalogLabelMap(locale);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void LinguisticService.listOrthographies({ includeBuiltIns: true })
      .then((records) => {
        if (cancelled) return;
        setOrthographies(records);
        setError('');
      })
      .catch((loadError) => {
        if (cancelled) return;
        setOrthographies([]);
        setError(loadError instanceof Error ? loadError.message : t(locale, 'workspace.orthography.errorFallback'));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const normalizedSearchText = deferredSearchText.trim().toLowerCase();
  const filteredOrthographies = useMemo(() => {
    if (!normalizedSearchText) return orthographies;
    return orthographies.filter((orthography) => buildSearchText(orthography, resolveLabel(orthography.languageId)).includes(normalizedSearchText));
  }, [normalizedSearchText, orthographies, resolveLabel]);

  const selectedOrthographyId = searchParams.get(ORTHOGRAPHY_ID_PARAM) ?? '';
  const selectedOrthography = orthographies.find((orthography) => orthography.id === selectedOrthographyId) ?? null;
  const selectedBadge = selectedOrthography ? getOrthographyCatalogBadgeInfo(locale, selectedOrthography) : null;
  const fromLayerId = searchParams.get('fromLayerId');
  const baselineDraft = useMemo(
    () => (selectedOrthography ? buildOrthographyDraft(selectedOrthography) : null),
    [selectedOrthography],
  );
  const isDirty = useMemo(
    () => (draft && baselineDraft ? !areDraftsEqual(draft, baselineDraft) : false),
    [baselineDraft, draft],
  );

  useEffect(() => {
    if (!baselineDraft) {
      setDraft(null);
      setLanguageInput({ languageName: '', languageCode: '' });
      setSaveError('');
      setSaveSuccess('');
      return;
    }
    setDraft(baselineDraft);
    setLanguageInput({
      languageName: resolveLabel(baselineDraft.languageId),
      languageCode: baselineDraft.languageId,
      ...(baselineDraft.localeTag ? { localeTag: baselineDraft.localeTag } : {}),
      ...(baselineDraft.regionTag ? { regionTag: baselineDraft.regionTag } : {}),
      ...(baselineDraft.variantTag ? { variantTag: baselineDraft.variantTag } : {}),
    });
    setSaveError('');
    setSaveSuccess('');
  }, [baselineDraft]);

  useEffect(() => {
    if (!baselineDraft?.languageId) {
      return;
    }

    const nextLanguageName = resolveLabel(baselineDraft.languageId);
    setLanguageInput((prev) => {
      if (prev.languageCode.trim().toLowerCase() !== baselineDraft.languageId || prev.languageName === nextLanguageName) {
        return prev;
      }
      return {
        ...prev,
        languageName: nextLanguageName,
      };
    });
  }, [baselineDraft?.languageId, resolveLabel]);

  useEffect(() => {
    if (!isDirty || typeof window === 'undefined') {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  useEffect(() => {
    if (orthographies.length === 0) return;
    if (selectedOrthography) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(ORTHOGRAPHY_ID_PARAM, orthographies[0]!.id);
    setSearchParams(nextParams, { replace: true });
  }, [orthographies, searchParams, selectedOrthography, setSearchParams]);

  const confirmDiscardDirtyDraft = () => {
    if (!isDirty || typeof window === 'undefined') {
      return true;
    }
    return window.confirm(t(locale, 'workspace.orthography.unsavedConfirmSwitch'));
  };

  const handleSelectOrthography = (orthographyId: string) => {
    if (orthographyId === selectedOrthography?.id) {
      return;
    }
    if (!confirmDiscardDirtyDraft()) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(ORTHOGRAPHY_ID_PARAM, orthographyId);
    setSearchParams(nextParams);
  };

  const handleDraftChange = <K extends keyof OrthographyDraft>(key: K, value: OrthographyDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaveError('');
    setSaveSuccess('');
  };

  const handleLanguageInputChange = (nextValue: LanguageIsoInputValue) => {
    setLanguageInput(nextValue);
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        languageId: nextValue.languageCode.trim().toLowerCase(),
        localeTag: nextValue.localeTag ?? '',
        regionTag: nextValue.regionTag ?? '',
        variantTag: nextValue.variantTag ?? '',
      };
    });
    setSaveError('');
    setSaveSuccess('');
  };

  const handleResetDraft = () => {
    if (!baselineDraft) return;
    setDraft(baselineDraft);
    setLanguageInput({
      languageName: resolveLabel(baselineDraft.languageId),
      languageCode: baselineDraft.languageId,
      ...(baselineDraft.localeTag ? { localeTag: baselineDraft.localeTag } : {}),
      ...(baselineDraft.regionTag ? { regionTag: baselineDraft.regionTag } : {}),
      ...(baselineDraft.variantTag ? { variantTag: baselineDraft.variantTag } : {}),
    });
    setSaveError('');
    setSaveSuccess('');
  };

  const sidePaneContent = useMemo(() => (
    <div className="app-side-pane-feature-stack">
      <section className="app-side-pane-group" aria-label={t(locale, 'workspace.orthography.sidePaneCurrent')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'workspace.orthography.sidePaneCurrent')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          {selectedOrthography ? (
            <>
              <span className="app-side-pane-feature-badge">{selectedBadge?.label ?? t(locale, 'workspace.orthography.notSet')}</span>
              <p className="app-side-pane-feature-summary">{formatOrthographyOptionLabel(selectedOrthography, locale)}</p>
              <p className="app-side-pane-feature-note">{t(locale, 'workspace.orthography.sidePaneSelectedHint')}</p>
            </>
          ) : (
            <p className="app-side-pane-feature-note">{t(locale, 'workspace.orthography.sidePaneEmpty')}</p>
          )}
        </div>
      </section>

      <section className="app-side-pane-group" aria-label={t(locale, 'workspace.orthography.sidePaneQuickAccess')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'workspace.orthography.sidePaneQuickAccess')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          <Link
            to="/transcription"
            className="side-pane-nav-link app-side-pane-feature-link"
            onClick={(event) => {
              if (!confirmDiscardDirtyDraft()) {
                event.preventDefault();
              }
            }}
          >
            {t(locale, 'app.featureAvailability.backToTranscription')}
          </Link>
          <Link
            to="/assets/orthography-bridges"
            className="side-pane-nav-link app-side-pane-feature-link"
            onClick={(event) => {
              if (!confirmDiscardDirtyDraft()) {
                event.preventDefault();
              }
            }}
          >
            {t(locale, 'workspace.orthography.openBridgeWorkspace')}
          </Link>
        </div>
      </section>
    </div>
  ), [confirmDiscardDirtyDraft, locale, selectedBadge?.label, selectedOrthography]);

  useRegisterAppSidePane({
    title: t(locale, 'workspace.orthography.sidePaneTitle'),
    subtitle: selectedOrthography
      ? formatOrthographyOptionLabel(selectedOrthography, locale)
      : t(locale, 'workspace.orthography.sidePaneSubtitle'),
    content: sidePaneContent,
  });

  const handleSaveDraft = async () => {
    if (!selectedOrthography || !draft) return;

    const primaryName = draft.namePrimary.trim();
    const englishFallbackName = draft.nameEnglishFallback.trim();
    if (!primaryName && !englishFallbackName) {
      setSaveError(t(locale, 'workspace.orthography.editNameRequired'));
      setSaveSuccess('');
      return;
    }

    const primaryFonts = parseDraftList(draft.primaryFonts);
    const fallbackFonts = parseDraftList(draft.fallbackFonts);
    const monoFonts = parseDraftList(draft.monoFonts);
    const exemplarMain = parseDraftList(draft.exemplarMain);
    const exemplarAuxiliary = parseDraftList(draft.exemplarAuxiliary);
    const exemplarNumbers = parseDraftList(draft.exemplarNumbers);
    const exemplarPunctuation = parseDraftList(draft.exemplarPunctuation);
    const exemplarIndex = parseDraftList(draft.exemplarIndex);
    const deadKeys = parseDraftList(draft.deadKeys);
    const lineHeightScale = parseOptionalNumber(draft.lineHeightScale);
    const sizeAdjust = parseOptionalNumber(draft.sizeAdjust);
    const conversionRules = parseConversionRulesJson(draft.conversionRulesJson);

    if (!lineHeightScale.valid) {
      setSaveError(t(locale, 'workspace.orthography.invalidNumber').replace('{field}', t(locale, 'workspace.orthography.lineHeightScaleLabel')));
      return;
    }
    if (!sizeAdjust.valid) {
      setSaveError(t(locale, 'workspace.orthography.invalidNumber').replace('{field}', t(locale, 'workspace.orthography.sizeAdjustLabel')));
      return;
    }
    if (!conversionRules.valid) {
      setSaveError(t(locale, 'workspace.orthography.conversionRulesParseError'));
      return;
    }

    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      const updated = await LinguisticService.updateOrthography({
        id: selectedOrthography.id,
        languageId: draft.languageId.trim().toLowerCase(),
        name: {
          ...buildPrimaryAndEnglishLabels({
            primaryLabel: primaryName,
            englishFallbackLabel: englishFallbackName,
            additionalLabels: draft.localizedNameEntries,
          }),
        },
        ...(draft.abbreviation.trim() ? { abbreviation: draft.abbreviation.trim() } : {}),
        ...(draft.scriptTag.trim() ? { scriptTag: draft.scriptTag.trim() } : {}),
        type: draft.type,
        direction: draft.direction,
        ...(draft.localeTag.trim() ? { localeTag: draft.localeTag.trim() } : {}),
        ...(draft.regionTag.trim() ? { regionTag: draft.regionTag.trim() } : {}),
        ...(draft.variantTag.trim() ? { variantTag: draft.variantTag.trim() } : {}),
        ...((draft.catalogReviewStatus || draft.catalogPriority)
          ? {
            catalogMetadata: {
              ...(draft.catalogReviewStatus ? { reviewStatus: draft.catalogReviewStatus } : {}),
              ...(draft.catalogPriority ? { priority: draft.catalogPriority } : {}),
            },
          }
          : {}),
        ...((exemplarMain.length || exemplarAuxiliary.length || exemplarNumbers.length || exemplarPunctuation.length || exemplarIndex.length)
          ? {
            exemplarCharacters: {
              ...(exemplarMain.length ? { main: exemplarMain } : {}),
              ...(exemplarAuxiliary.length ? { auxiliary: exemplarAuxiliary } : {}),
              ...(exemplarNumbers.length ? { numbers: exemplarNumbers } : {}),
              ...(exemplarPunctuation.length ? { punctuation: exemplarPunctuation } : {}),
              ...(exemplarIndex.length ? { index: exemplarIndex } : {}),
            },
          }
          : {}),
        ...((draft.normalizationForm || draft.normalizationCaseSensitive || draft.normalizationStripDefaultIgnorables)
          ? {
            normalization: {
              ...(draft.normalizationForm
                ? { form: draft.normalizationForm as NormalizationForm }
                : {}),
              ...(draft.normalizationCaseSensitive ? { caseSensitive: true } : {}),
              ...(draft.normalizationStripDefaultIgnorables ? { stripDefaultIgnorables: true } : {}),
            },
          }
          : {}),
        ...((draft.collationBase.trim() || draft.collationRules.trim())
          ? {
            collation: {
              ...(draft.collationBase.trim() ? { base: draft.collationBase.trim() } : {}),
              ...(draft.collationRules.trim() ? { customRules: draft.collationRules.trim() } : {}),
            },
          }
          : {}),
        ...((primaryFonts.length || fallbackFonts.length || monoFonts.length || lineHeightScale.value !== undefined || sizeAdjust.value !== undefined)
          ? {
            fontPreferences: {
              ...(primaryFonts.length ? { primary: primaryFonts } : {}),
              ...(fallbackFonts.length ? { fallback: fallbackFonts } : {}),
              ...(monoFonts.length ? { mono: monoFonts } : {}),
              ...(lineHeightScale.value !== undefined ? { lineHeightScale: lineHeightScale.value } : {}),
              ...(sizeAdjust.value !== undefined ? { sizeAdjust: sizeAdjust.value } : {}),
            },
          }
          : {}),
        ...((draft.keyboardLayout.trim() || draft.imeId.trim() || deadKeys.length)
          ? {
            inputHints: {
              ...(draft.keyboardLayout.trim() ? { keyboardLayout: draft.keyboardLayout.trim() } : {}),
              ...(draft.imeId.trim() ? { imeId: draft.imeId.trim() } : {}),
              ...(deadKeys.length ? { deadKeys } : {}),
            },
          }
          : {}),
        bidiPolicy: {
          isolateInlineRuns: draft.bidiIsolate,
          preferDirAttribute: draft.preferDirAttribute,
        },
        ...(conversionRules.value ? { conversionRules: conversionRules.value } : {}),
        ...((draft.notesZh.trim() || draft.notesEn.trim())
          ? {
            notes: {
              ...(draft.notesZh.trim() ? { zho: draft.notesZh.trim() } : {}),
              ...(draft.notesEn.trim() ? { eng: draft.notesEn.trim() } : {}),
            },
          }
          : {}),
      });

      setOrthographies((prev) => prev.map((orthography) => (orthography.id === updated.id ? updated : orthography)));
      setDraft(buildOrthographyDraft(updated));
      setSaveSuccess(t(locale, 'workspace.orthography.saveSuccess'));
    } catch (saveDraftError) {
      setSaveError(saveDraftError instanceof Error ? saveDraftError.message : t(locale, 'workspace.orthography.saveErrorFallback'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel orthography-workspace" aria-labelledby="orthography-workspace-title">
      <header className="orthography-workspace-hero">
        <span className="orthography-workspace-badge">{t(locale, 'workspace.orthography.badge')}</span>
        <h2 id="orthography-workspace-title">{t(locale, 'workspace.orthography.title')}</h2>
        <p className="orthography-workspace-summary">{t(locale, 'workspace.orthography.summary')}</p>
        {fromLayerId ? <p className="orthography-workspace-context">{t(locale, 'workspace.orthography.fromLayerHint')}</p> : null}
      </header>

      <div className="orthography-workspace-layout">
        <PanelSection
          className="orthography-workspace-list-panel"
          title={t(locale, 'workspace.orthography.listTitle')}
          description={t(locale, 'workspace.orthography.listDescription')}
        >
          <input
            className="input orthography-workspace-search"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t(locale, 'workspace.orthography.searchPlaceholder')}
            aria-label={t(locale, 'workspace.orthography.searchPlaceholder')}
          />

          {loading ? <p className="orthography-workspace-state">{t(locale, 'workspace.orthography.loading')}</p> : null}
          {!loading && error ? <p className="orthography-workspace-state orthography-workspace-state-error">{t(locale, 'workspace.orthography.errorPrefix').replace('{message}', error)}</p> : null}
          {!loading && !error && filteredOrthographies.length === 0 ? <p className="orthography-workspace-state">{t(locale, 'workspace.orthography.emptyList')}</p> : null}

          <div className="orthography-workspace-list" role="list" aria-label={t(locale, 'workspace.orthography.listTitle')}>
            {filteredOrthographies.map((orthography) => {
              const badge = getOrthographyCatalogBadgeInfo(locale, orthography);
              const active = orthography.id === selectedOrthography?.id;
              return (
                <button
                  key={orthography.id}
                  type="button"
                  className={`orthography-workspace-list-item${active ? ' orthography-workspace-list-item-active' : ''}`}
                  onClick={() => handleSelectOrthography(orthography.id)}
                >
                  <span className="orthography-workspace-list-label">{formatOrthographyOptionLabel(orthography, locale)}</span>
                  <span className="orthography-workspace-list-meta">
                    <span>{resolveLabel(orthography.languageId)}</span>
                    <span className={badge.className}>{badge.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </PanelSection>

        <div className="orthography-workspace-detail-column">
          {selectedOrthography ? (
            <>
              <PanelSummary
                className="orthography-workspace-summary-card"
                title={t(locale, 'workspace.orthography.detailTitle')}
                description={formatOrthographyOptionLabel(selectedOrthography, locale)}
                meta={selectedBadge ? <span className={selectedBadge.className}>{selectedBadge.label}</span> : undefined}
                supportingText={t(locale, 'workspace.orthography.detailDescription')}
              />

              <OrthographyWorkspaceEditor
                locale={locale}
                builderMessages={builderMessages}
                selectedOrthography={selectedOrthography}
                {...(selectedBadge?.label ? { selectedBadgeLabel: selectedBadge.label } : {})}
                draft={draft}
                languageInput={languageInput}
                resolveLanguageDisplayName={resolveLanguageDisplayName}
                isDirty={isDirty}
                saving={saving}
                saveError={saveError}
                saveSuccess={saveSuccess}
                onDraftChange={handleDraftChange}
                onLanguageInputChange={handleLanguageInputChange}
                onResetDraft={handleResetDraft}
                onSaveDraft={() => {
                  void handleSaveDraft();
                }}
              />

              <PanelSection
                className="orthography-workspace-bridge-panel"
                title={t(locale, 'workspace.orthography.bridgeTitle')}
                description={t(locale, 'workspace.orthography.bridgeDescription')}
              >
                <OrthographyBridgeManager
                  targetOrthography={selectedOrthography}
                  languageOptions={COMMON_LANGUAGES}
                  compact
                  initialExpanded
                  hideToggleButton
                />
              </PanelSection>
            </>
          ) : (
            <PanelSummary
              className="orthography-workspace-summary-card"
              title={t(locale, 'workspace.orthography.detailTitle')}
              supportingText={t(locale, 'workspace.orthography.emptySelection')}
            />
          )}
        </div>
      </div>
    </section>
  );
}
