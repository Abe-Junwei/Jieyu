import '../styles/pages/feature-availability.css';
import '../styles/pages/lexicon-workspace.css';
import { useEffect, useDeferredValue, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { OrthographyPanelLink } from '../components/OrthographyPanelLink';
import { PanelSection } from '../components/ui/PanelSection';
import { PanelSummary } from '../components/ui/PanelSummary';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import type { LexemeDocType, MultiLangString } from '../types/jieyuDbDocTypes';
import { useLexiconSearch } from '~/hooks/lexicon/useLexiconSearch';
import { t, tf, useLocale } from '../i18n';
import { featureFlags } from '../ai/config/featureFlags';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { useWorkspaceEventRefresh } from '../hooks/useWorkspaceEventRefresh';
import {
  buildTranscriptionDeepLinkHref,
  buildTranscriptionWorkspaceReturnHref,
} from '../utils/transcriptionUrlDeepLink';
import { readOptionalListScrollTop } from '../utils/workspaceReturnDeepLink';
import { LexiconAttachmentSection } from './LexiconAttachmentSection';
import { LexiconEntryEditForm } from './lexicon/LexiconEntryEditForm';
import { mergeLexemeIntoList } from './lexicon/saveLexiconEntry';
import { useLexiconEntryEditController } from './useLexiconEntryEditController';
import { exportLexemesAsLift } from '../utils/lexiconLiftExport';
import { importLexemesFromLiftFile } from '../utils/lexiconLiftImport';
import { readSenseId, senseDepth } from '../utils/lexemeSenseTree';

const LEXICON_LIST_STATE_KEY = 'lexiconListState';

type LexiconListState = {
  searchText?: string;
  selectedLexemeId?: string;
  listScrollTop?: number;
};

function readFirstValue(record: Record<string, string> | undefined, fallback: string): string {
  const firstValue = record
    ? Object.values(record).find((value) => value.trim().length > 0)
    : undefined;
  return firstValue ?? fallback;
}

function formatMultilang(record: MultiLangString | undefined): string {
  if (!record) return '';
  return Object.values(record)
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' / ');
}

function readLexemeLabel(lexeme: LexemeDocType): string {
  return readFirstValue(lexeme.lemma, lexeme.id);
}

function readLexemePrimaryGloss(lexeme: LexemeDocType, fallback: string): string {
  const firstSense = lexeme.senses[0];
  return formatMultilang(firstSense?.gloss) || fallback;
}

function readLexiconListState(): LexiconListState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(LEXICON_LIST_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const searchText = String((parsed as LexiconListState).searchText ?? '');
    const selectedLexemeId = String((parsed as LexiconListState).selectedLexemeId ?? '');
    const listScrollTop = readOptionalListScrollTop((parsed as LexiconListState).listScrollTop);
    return {
      ...(searchText ? { searchText } : {}),
      ...(selectedLexemeId ? { selectedLexemeId } : {}),
      ...(listScrollTop ? { listScrollTop } : {}),
    };
  } catch {
    return {};
  }
}

function writeLexiconListState(state: LexiconListState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(LEXICON_LIST_STATE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

function resolveLexiconScrollRoot(workspace: HTMLElement | null): HTMLElement | null {
  if (!workspace) return null;
  const shell = workspace.closest('.app-main');
  if (shell instanceof HTMLElement) return shell;
  const list = workspace.querySelector('.lexicon-workspace-list');
  return list instanceof HTMLElement ? list : null;
}

export function LexiconPage() {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const {
    data: lexemes = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ['lexemes'],
    queryFn: () => LinguisticService.lexemes.list(),
  });
  const error =
    queryError instanceof Error
      ? queryError.message
      : queryError
        ? t(locale, 'workspace.lexicon.errorFallback')
        : '';
  const initialListState = useMemo(() => readLexiconListState(), []);
  const [searchText, setSearchText] = useState(initialListState.searchText ?? '');
  const [selectedLexemeId, setSelectedLexemeId] = useState(initialListState.selectedLexemeId ?? '');
  const deferredSearchText = useDeferredValue(searchText);
  const filteredLexemes = useLexiconSearch(lexemes, deferredSearchText);
  const workspaceRef = useRef<HTMLElement>(null);
  const liftImportInputRef = useRef<HTMLInputElement>(null);
  const listScrollTopRef = useRef(initialListState.listScrollTop ?? 0);
  const restoredScrollRef = useRef(false);
  const [importError, setImportError] = useState('');

  useEffect(() => {
    if (filteredLexemes.some((lexeme) => lexeme.id === selectedLexemeId)) {
      return;
    }
    if (
      searchText.length === 0 &&
      selectedLexemeId.length > 0 &&
      lexemes.some((lexeme) => lexeme.id === selectedLexemeId)
    ) {
      return;
    }
    if (filteredLexemes.length === 0) {
      if (selectedLexemeId) setSelectedLexemeId('');
      return;
    }
    setSelectedLexemeId(filteredLexemes[0]!.id);
  }, [filteredLexemes, lexemes, searchText, selectedLexemeId]);

  useEffect(() => {
    writeLexiconListState({
      searchText,
      selectedLexemeId,
      ...(listScrollTopRef.current > 0 ? { listScrollTop: listScrollTopRef.current } : {}),
    });
  }, [searchText, selectedLexemeId]);

  useEffect(() => {
    const root = resolveLexiconScrollRoot(workspaceRef.current);
    if (!root) return;
    const persistScroll = () => {
      const top = Math.round(root.scrollTop);
      listScrollTopRef.current = top;
      writeLexiconListState({
        searchText,
        selectedLexemeId,
        ...(top > 0 ? { listScrollTop: top } : {}),
      });
    };
    root.addEventListener('scroll', persistScroll, { passive: true });
    if (!loading && !restoredScrollRef.current && listScrollTopRef.current > 0) {
      root.scrollTop = listScrollTopRef.current;
      restoredScrollRef.current = true;
    }
    return () => root.removeEventListener('scroll', persistScroll);
  }, [loading, filteredLexemes.length, searchText, selectedLexemeId]);

  const selectedLexeme =
    lexemes.find((lexeme) => lexeme.id === selectedLexemeId) ??
    filteredLexemes.find((lexeme) => lexeme.id === selectedLexemeId) ??
    null;
  const selectedLexemeGloss = selectedLexeme
    ? readLexemePrimaryGloss(selectedLexeme, t(locale, 'workspace.lexicon.notSet'))
    : '';
  const editor = useLexiconEntryEditController({
    selectedLexeme,
    onSaved: (stored, options) => {
      const current = queryClient.getQueryData<LexemeDocType[]>(['lexemes']) ?? [];
      const existed = current.some((row) => row.id === stored.id);
      queryClient.setQueryData(['lexemes'], mergeLexemeIntoList(current, stored));
      if (!existed) setSearchText('');
      if (options?.select !== false) setSelectedLexemeId(stored.id);
    },
    onDeleted: (lexemeId) => {
      const current = queryClient.getQueryData<LexemeDocType[]>(['lexemes']) ?? [];
      queryClient.setQueryData(
        ['lexemes'],
        current.filter((row) => row.id !== lexemeId),
      );
      void queryClient.removeQueries({ queryKey: ['lexemeTranscriptionJumpTargets', lexemeId] });
      setSelectedLexemeId((currentId) => (currentId === lexemeId ? '' : currentId));
    },
  });

  const {
    data: lexemeJumpTargets = [],
    isFetching: jumpTargetsLoading,
    isError: jumpTargetsError,
  } = useQuery({
    queryKey: ['lexemeTranscriptionJumpTargets', selectedLexemeId],
    queryFn: () => LinguisticService.lexemes.listTranscriptionJumpTargets(selectedLexemeId),
    enabled: Boolean(selectedLexemeId.trim()),
  });

  useWorkspaceEventRefresh({
    onUnitUpdated: (detail) => {
      if (!lexemeJumpTargets.some((row) => row.unitId === detail.unitId)) return;
      void queryClient.invalidateQueries({
        queryKey: ['lexemeTranscriptionJumpTargets', selectedLexemeId],
      });
    },
    onLexemeUpdated: (detail) => {
      void queryClient.invalidateQueries({ queryKey: ['lexemes'] });
      void queryClient.invalidateQueries({
        queryKey: ['lexemeTranscriptionJumpTargets', detail.lexemeId],
      });
    },
    onLexemeDeleted: (detail) => {
      const current = queryClient.getQueryData<LexemeDocType[]>(['lexemes']) ?? [];
      queryClient.setQueryData(
        ['lexemes'],
        current.filter((row) => row.id !== detail.lexemeId),
      );
      void queryClient.removeQueries({
        queryKey: ['lexemeTranscriptionJumpTargets', detail.lexemeId],
      });
      setSelectedLexemeId((currentId) => (currentId === detail.lexemeId ? '' : currentId));
    },
  });

  const sidePaneContent = useMemo(
    () => (
      <div className="app-side-pane-feature-stack">
        <section
          className="app-side-pane-group"
          aria-label={t(locale, 'workspace.lexicon.sidePaneCurrent')}
        >
          <div
            className="app-side-pane-group-toggle app-side-pane-group-toggle-static"
            role="presentation"
          >
            <span className="app-side-pane-section-title">
              {t(locale, 'workspace.lexicon.sidePaneCurrent')}
            </span>
          </div>
          <div className="app-side-pane-nav app-side-pane-feature-nav">
            {selectedLexeme ? (
              <>
                <span className="app-side-pane-feature-badge">
                  {t(locale, 'workspace.lexicon.badge')}
                </span>
                <p className="app-side-pane-feature-summary">{readLexemeLabel(selectedLexeme)}</p>
                <p className="app-side-pane-feature-note">{selectedLexemeGloss}</p>
                <p className="app-side-pane-feature-note">
                  {t(locale, 'workspace.lexicon.sidePaneSelectedHint').replace(
                    '{count}',
                    String(filteredLexemes.length),
                  )}
                </p>
              </>
            ) : (
              <p className="app-side-pane-feature-note">
                {t(locale, 'workspace.lexicon.sidePaneEmpty')}
              </p>
            )}
          </div>
        </section>

        <section
          className="app-side-pane-group"
          aria-label={t(locale, 'workspace.lexicon.sidePaneQuickAccess')}
        >
          <div
            className="app-side-pane-group-toggle app-side-pane-group-toggle-static"
            role="presentation"
          >
            <span className="app-side-pane-section-title">
              {t(locale, 'workspace.lexicon.sidePaneQuickAccess')}
            </span>
          </div>
          <div className="app-side-pane-nav app-side-pane-feature-nav">
            <Link
              to={buildTranscriptionWorkspaceReturnHref()}
              className="side-pane-nav-link app-side-pane-feature-link"
            >
              {t(locale, 'app.featureAvailability.backToTranscription')}
            </Link>
            <OrthographyPanelLink className="side-pane-nav-link app-side-pane-feature-link">
              {t(locale, 'workspace.lexicon.openOrthographyManager')}
            </OrthographyPanelLink>
          </div>
        </section>
      </div>
    ),
    [filteredLexemes.length, locale, selectedLexeme, selectedLexemeGloss],
  );

  useRegisterAppSidePane({
    title: t(locale, 'workspace.lexicon.sidePaneTitle'),
    subtitle: selectedLexeme
      ? readLexemeLabel(selectedLexeme)
      : t(locale, 'workspace.lexicon.sidePaneSubtitle'),
    content: sidePaneContent,
  });

  return (
    <section
      ref={workspaceRef}
      className="panel lexicon-workspace"
      aria-labelledby="lexicon-workspace-title"
    >
      <header className="lexicon-workspace-hero">
        <span className="lexicon-workspace-badge">{t(locale, 'workspace.lexicon.badge')}</span>
        <h2 id="lexicon-workspace-title">{t(locale, 'workspace.lexicon.title')}</h2>
        <p className="lexicon-workspace-summary">{t(locale, 'workspace.lexicon.summary')}</p>
      </header>

      <div className="lexicon-workspace-layout">
        <PanelSection
          className="lexicon-workspace-list-panel"
          title={t(locale, 'workspace.lexicon.listTitle')}
          description={t(locale, 'workspace.lexicon.listDescription')}
          meta={
            <span className="lexicon-workspace-list-count">
              {t(locale, 'workspace.lexicon.countLabel').replace(
                '{count}',
                String(filteredLexemes.length),
              )}
            </span>
          }
        >
          <input
            className="input lexicon-workspace-search"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t(locale, 'workspace.lexicon.searchPlaceholder')}
            aria-label={t(locale, 'workspace.lexicon.searchPlaceholder')}
          />
          <button
            type="button"
            className="btn lexicon-workspace-create"
            data-testid="lexicon-entry-create"
            onClick={editor.onStartCreate}
          >
            {t(locale, 'workspace.lexicon.edit.create')}
          </button>
          <button
            type="button"
            className="btn lexicon-workspace-export"
            data-testid="lexicon-lift-export"
            disabled={lexemes.length === 0}
            onClick={() => {
              exportLexemesAsLift(lexemes);
            }}
          >
            {t(locale, 'workspace.lexicon.exportLift')}
          </button>
          <input
            ref={liftImportInputRef}
            type="file"
            accept=".lift,.xml,application/xml,text/xml"
            data-testid="lexicon-lift-import-input"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              void importLexemesFromLiftFile(file).then((result) => {
                if (!result.ok) {
                  const key =
                    result.reason === 'empty'
                      ? 'workspace.lexicon.importLiftEmpty'
                      : result.reason === 'unsupported-version'
                        ? 'workspace.lexicon.importLiftUnsupported'
                        : 'workspace.lexicon.importLiftInvalid';
                  setImportError(t(locale, key));
                  return;
                }
                setImportError('');
                queryClient.setQueryData(['lexemes'], result.readback);
                const first = result.readback[0];
                if (first) setSelectedLexemeId(first.id);
              });
            }}
          />
          <button
            type="button"
            className="btn lexicon-workspace-import"
            data-testid="lexicon-lift-import"
            onClick={() => {
              liftImportInputRef.current?.click();
            }}
          >
            {t(locale, 'workspace.lexicon.importLift')}
          </button>

          {loading ? (
            <p className="lexicon-workspace-state">{t(locale, 'workspace.lexicon.loading')}</p>
          ) : null}
          {!loading && error ? (
            <p className="lexicon-workspace-state lexicon-workspace-state-error">
              {t(locale, 'workspace.lexicon.errorPrefix').replace('{message}', error)}
            </p>
          ) : null}
          {importError ? (
            <p
              className="lexicon-workspace-state lexicon-workspace-state-error"
              data-testid="lexicon-lift-import-error"
            >
              {importError}
            </p>
          ) : null}
          {!loading && !error && filteredLexemes.length === 0 ? (
            <p className="lexicon-workspace-state entry-empty">
              {t(locale, 'workspace.lexicon.emptyList')}
            </p>
          ) : null}

          <div
            className="lexicon-workspace-list"
            role="list"
            data-testid="lexicon-workspace-list"
            aria-label={t(locale, 'workspace.lexicon.listTitle')}
          >
            {filteredLexemes.map((lexeme) => {
              const active = lexeme.id === selectedLexeme?.id;
              return (
                <button
                  key={lexeme.id}
                  type="button"
                  className={`lexicon-workspace-list-item${active ? ' lexicon-workspace-list-item-active' : ''}`}
                  onClick={() => {
                    if (editor.creating) editor.onCancelCreate();
                    setSelectedLexemeId(lexeme.id);
                  }}
                >
                  <span className="lexicon-workspace-list-label">{readLexemeLabel(lexeme)}</span>
                  <span className="lexicon-workspace-list-meta">
                    <span>
                      {readLexemePrimaryGloss(lexeme, t(locale, 'workspace.lexicon.notSet'))}
                    </span>
                    <span>{lexeme.language ?? t(locale, 'workspace.lexicon.notSet')}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </PanelSection>

        <div className="lexicon-workspace-detail-column">
          {editor.creating || selectedLexeme ? (
            <>
              {selectedLexeme && !editor.creating ? (
                <PanelSummary
                  className="lexicon-workspace-summary-card"
                  title={t(locale, 'workspace.lexicon.detailTitle')}
                  description={readLexemeLabel(selectedLexeme)}
                  meta={
                    <span className="lexicon-workspace-summary-meta">{selectedLexemeGloss}</span>
                  }
                  supportingText={t(locale, 'workspace.lexicon.detailDescription')}
                />
              ) : (
                <PanelSummary
                  className="lexicon-workspace-summary-card"
                  title={t(locale, 'workspace.lexicon.edit.create')}
                  supportingText={t(locale, 'workspace.lexicon.edit.createHint')}
                />
              )}
              <PanelSection
                className="lexicon-workspace-detail-panel"
                title={t(locale, 'workspace.lexicon.edit.title')}
              >
                <LexiconEntryEditForm editor={editor} />
              </PanelSection>
              {selectedLexeme && !editor.creating ? (
                <>
                  <PanelSection
                    className="lexicon-workspace-detail-panel"
                    title={t(locale, 'workspace.lexicon.overviewTitle')}
                    description={t(locale, 'workspace.lexicon.overviewDescription')}
                  >
                    <dl className="lexicon-workspace-detail-grid">
                      <div>
                        <dt>{t(locale, 'workspace.lexicon.languageLabel')}</dt>
                        <dd>{selectedLexeme.language ?? t(locale, 'workspace.lexicon.notSet')}</dd>
                      </div>
                      <div>
                        <dt>{t(locale, 'workspace.lexicon.citationLabel')}</dt>
                        <dd>
                          {selectedLexeme.citationForm ?? t(locale, 'workspace.lexicon.notSet')}
                        </dd>
                      </div>
                      <div>
                        <dt>{t(locale, 'workspace.lexicon.pronunciationLabel')}</dt>
                        <dd data-testid="lexicon-workspace-pronunciation">
                          {selectedLexeme.pronunciation ?? t(locale, 'workspace.lexicon.notSet')}
                        </dd>
                      </div>
                      <div>
                        <dt>{t(locale, 'workspace.lexicon.etymologyLabel')}</dt>
                        <dd data-testid="lexicon-workspace-etymology">
                          {selectedLexeme.etymology
                            ? [
                                selectedLexeme.etymology.form,
                                selectedLexeme.etymology.gloss,
                                selectedLexeme.etymology.sourceLanguage,
                              ]
                                .filter((part) => (part ?? '').length > 0)
                                .join(' · ')
                            : t(locale, 'workspace.lexicon.notSet')}
                        </dd>
                      </div>
                      <div>
                        <dt>{t(locale, 'workspace.lexicon.literalMeaningLabel')}</dt>
                        <dd data-testid="lexicon-workspace-literal-meaning">
                          {selectedLexeme.literalMeaning ?? t(locale, 'workspace.lexicon.notSet')}
                        </dd>
                      </div>
                      <div>
                        <dt>{t(locale, 'workspace.lexicon.bibliographyLabel')}</dt>
                        <dd data-testid="lexicon-workspace-bibliography">
                          {selectedLexeme.bibliography ?? t(locale, 'workspace.lexicon.notSet')}
                        </dd>
                      </div>
                      <div>
                        <dt>{t(locale, 'workspace.lexicon.lexemeTypeLabel')}</dt>
                        <dd data-testid="lexicon-workspace-lexeme-type">
                          {selectedLexeme.lexemeType ?? t(locale, 'workspace.lexicon.notSet')}
                        </dd>
                      </div>
                      <div>
                        <dt>{t(locale, 'workspace.lexicon.morphemeTypeLabel')}</dt>
                        <dd>
                          {selectedLexeme.morphemeType ?? t(locale, 'workspace.lexicon.notSet')}
                        </dd>
                      </div>
                      <div>
                        <dt>{t(locale, 'workspace.lexicon.usageCountLabel')}</dt>
                        <dd>{String(selectedLexeme.usageCount ?? 0)}</dd>
                      </div>
                      <div>
                        <dt>{t(locale, 'workspace.lexicon.updatedAtLabel')}</dt>
                        <dd>{selectedLexeme.updatedAt}</dd>
                      </div>
                    </dl>
                  </PanelSection>

                  <PanelSection
                    className="lexicon-workspace-detail-panel"
                    title={t(locale, 'workspace.lexicon.hitSegmentsTitle')}
                    description={t(locale, 'workspace.lexicon.hitSegmentsDescription')}
                  >
                    {jumpTargetsLoading ? (
                      <p className="lexicon-workspace-state">
                        {t(locale, 'workspace.lexicon.hitSegmentsLoading')}
                      </p>
                    ) : null}
                    {jumpTargetsError ? (
                      <p className="lexicon-workspace-state lexicon-workspace-state-error">
                        {t(locale, 'workspace.lexicon.hitSegmentsError')}
                      </p>
                    ) : null}
                    {!jumpTargetsLoading && !jumpTargetsError && lexemeJumpTargets.length === 0 ? (
                      <p className="lexicon-workspace-state">
                        {t(locale, 'workspace.lexicon.hitSegmentsEmpty')}
                      </p>
                    ) : null}
                    {!jumpTargetsLoading && !jumpTargetsError && lexemeJumpTargets.length > 0 ? (
                      <ul
                        className="lexicon-workspace-hit-list"
                        aria-label={t(locale, 'workspace.lexicon.hitSegmentsTitle')}
                      >
                        {lexemeJumpTargets.map((hit) => {
                          const primaryLabel = hit.surfaceHint?.trim() || hit.unitId;
                          const href = buildTranscriptionDeepLinkHref({
                            textId: hit.textId,
                            ...(hit.mediaId ? { mediaId: hit.mediaId } : {}),
                            layerId: hit.layerId,
                            unitId: hit.unitId,
                            ...(hit.unitKind === 'segment' ? { unitKind: 'segment' } : {}),
                            lexiconReturn: selectedLexeme.id,
                          });
                          return (
                            <li
                              key={`${hit.textId}:${hit.layerId}:${hit.unitId}:${hit.unitKind}`}
                              className="lexicon-workspace-hit-item"
                            >
                              <Link
                                className="lexicon-workspace-hit-link"
                                to={href}
                                title={t(locale, 'workspace.lexicon.hitSegmentOpenTitle')}
                              >
                                <span className="lexicon-workspace-hit-primary">
                                  {primaryLabel}
                                </span>
                                <span className="lexicon-workspace-hit-meta">
                                  {tf(locale, 'workspace.lexicon.hitSegmentMeta', {
                                    textId: hit.textId,
                                    unitId: hit.unitId,
                                    kind:
                                      hit.unitKind === 'segment'
                                        ? t(locale, 'workspace.lexicon.hitSegmentKindSegment')
                                        : t(locale, 'workspace.lexicon.hitSegmentKindUnit'),
                                  })}
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </PanelSection>

                  <PanelSection
                    className="lexicon-workspace-detail-panel"
                    title={t(locale, 'workspace.lexicon.sensesTitle')}
                  >
                    {selectedLexeme.senses.length > 0 ? (
                      <ol className="lexicon-workspace-sense-list">
                        {selectedLexeme.senses.map((sense, index) => (
                          <li
                            key={readSenseId(sense) || `${selectedLexeme.id}-sense-${index}`}
                            className="lexicon-workspace-sense-item"
                            data-depth={senseDepth(selectedLexeme.senses, readSenseId(sense))}
                            data-testid={`lexicon-workspace-sense-${index}`}
                          >
                            <strong>
                              {formatMultilang(sense.gloss) ||
                                t(locale, 'workspace.lexicon.notSet')}
                            </strong>
                            {formatMultilang(sense.definition) ? (
                              <p>{formatMultilang(sense.definition)}</p>
                            ) : null}
                            {sense.category ? (
                              <span data-testid={`lexicon-workspace-sense-${index}-category`}>
                                {sense.category}
                              </span>
                            ) : null}
                            {(sense.examples ?? []).map((example, exampleIndex) => (
                              <span
                                key={`${readSenseId(sense)}-example-${exampleIndex}`}
                                data-testid={`lexicon-workspace-sense-${index}-example-${exampleIndex}`}
                              >
                                {example.translation
                                  ? `${example.source} / ${example.translation}`
                                  : example.source}
                              </span>
                            ))}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="lexicon-workspace-state">
                        {t(locale, 'workspace.lexicon.noSenses')}
                      </p>
                    )}
                  </PanelSection>

                  <PanelSection
                    className="lexicon-workspace-detail-panel"
                    title={t(locale, 'workspace.lexicon.formsTitle')}
                  >
                    {selectedLexeme.forms && selectedLexeme.forms.length > 0 ? (
                      <ul className="lexicon-workspace-form-list">
                        {selectedLexeme.forms.map((form, index) => (
                          <li key={`${selectedLexeme.id}-form-${index}`}>
                            {readFirstValue(
                              form.transcription,
                              t(locale, 'workspace.lexicon.notSet'),
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="lexicon-workspace-state">
                        {t(locale, 'workspace.lexicon.noForms')}
                      </p>
                    )}
                  </PanelSection>

                  <PanelSection
                    className="lexicon-workspace-detail-panel"
                    title={t(locale, 'workspace.lexicon.notesTitle')}
                  >
                    <p className="lexicon-workspace-notes">
                      {formatMultilang(selectedLexeme.notes) ||
                        t(locale, 'workspace.lexicon.noNotes')}
                    </p>
                  </PanelSection>

                  {featureFlags.lexiconAttachmentsEnabled ? (
                    <LexiconAttachmentSection lexemeId={selectedLexeme.id} />
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <PanelSummary
              className="lexicon-workspace-summary-card"
              title={t(locale, 'workspace.lexicon.detailTitle')}
              supportingText={t(locale, 'workspace.lexicon.emptySelection')}
            />
          )}
        </div>
      </div>
    </section>
  );
}
