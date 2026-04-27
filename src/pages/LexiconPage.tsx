import '../styles/pages/feature-availability.css';
import '../styles/pages/lexicon-workspace.css';
import { useEffect, useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { OrthographyPanelLink } from '../components/OrthographyPanelLink';
import { PanelSection } from '../components/ui/PanelSection';
import { PanelSummary } from '../components/ui/PanelSummary';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import type { LexemeDocType, MultiLangString } from '../types/jieyuDbDocTypes';
import { useLexiconSearch } from '../hooks/useLexiconSearch';
import { t, tf, useLocale } from '../i18n';
import { LinguisticService } from '../utils/pageLinguisticService';
import { buildTranscriptionDeepLinkHref, buildTranscriptionWorkspaceReturnHref } from '../utils/transcriptionUrlDeepLink';

const LEXICON_LIST_STATE_KEY = 'lexiconListState';

type LexiconListState = {
  searchText?: string;
  selectedLexemeId?: string;
};

function readFirstValue(record: Record<string, string> | undefined, fallback: string): string {
  const firstValue = record ? Object.values(record).find((value) => value.trim().length > 0) : undefined;
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
    return {
      ...(searchText ? { searchText } : {}),
      ...(selectedLexemeId ? { selectedLexemeId } : {}),
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

export function LexiconPage() {
  const locale = useLocale();
  const { data: lexemes = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ['lexemes'],
    queryFn: () => LinguisticService.listLexemes(),
  });
  const error = queryError instanceof Error
    ? queryError.message
    : queryError
      ? t(locale, 'workspace.lexicon.errorFallback')
      : '';
  const initialListState = useMemo(() => readLexiconListState(), []);
  const [searchText, setSearchText] = useState(initialListState.searchText ?? '');
  const [selectedLexemeId, setSelectedLexemeId] = useState(initialListState.selectedLexemeId ?? '');
  const deferredSearchText = useDeferredValue(searchText);
  const filteredLexemes = useLexiconSearch(lexemes, deferredSearchText);

  useEffect(() => {
    if (filteredLexemes.length === 0) {
      if (selectedLexemeId) setSelectedLexemeId('');
      return;
    }
    if (filteredLexemes.some((lexeme) => lexeme.id === selectedLexemeId)) {
      return;
    }
    setSelectedLexemeId(filteredLexemes[0]!.id);
  }, [filteredLexemes, selectedLexemeId]);

  useEffect(() => {
    writeLexiconListState({ searchText, selectedLexemeId });
  }, [searchText, selectedLexemeId]);

  const selectedLexeme = filteredLexemes.find((lexeme) => lexeme.id === selectedLexemeId) ?? null;
  const selectedLexemeGloss = selectedLexeme
    ? readLexemePrimaryGloss(selectedLexeme, t(locale, 'workspace.lexicon.notSet'))
    : '';

  const { data: lexemeJumpTargets = [], isFetching: jumpTargetsLoading, isError: jumpTargetsError } = useQuery({
    queryKey: ['lexemeTranscriptionJumpTargets', selectedLexemeId],
    queryFn: () => LinguisticService.listLexemeTranscriptionJumpTargets(selectedLexemeId),
    enabled: Boolean(selectedLexemeId.trim()),
  });

  const sidePaneContent = useMemo(() => (
    <div className="app-side-pane-feature-stack">
      <section className="app-side-pane-group" aria-label={t(locale, 'workspace.lexicon.sidePaneCurrent')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'workspace.lexicon.sidePaneCurrent')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          {selectedLexeme ? (
            <>
              <span className="app-side-pane-feature-badge">{t(locale, 'workspace.lexicon.badge')}</span>
              <p className="app-side-pane-feature-summary">{readLexemeLabel(selectedLexeme)}</p>
              <p className="app-side-pane-feature-note">{selectedLexemeGloss}</p>
              <p className="app-side-pane-feature-note">{t(locale, 'workspace.lexicon.sidePaneSelectedHint').replace('{count}', String(filteredLexemes.length))}</p>
            </>
          ) : (
            <p className="app-side-pane-feature-note">{t(locale, 'workspace.lexicon.sidePaneEmpty')}</p>
          )}
        </div>
      </section>

      <section className="app-side-pane-group" aria-label={t(locale, 'workspace.lexicon.sidePaneQuickAccess')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'workspace.lexicon.sidePaneQuickAccess')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          <Link to={buildTranscriptionWorkspaceReturnHref()} className="side-pane-nav-link app-side-pane-feature-link">{t(locale, 'app.featureAvailability.backToTranscription')}</Link>
          <OrthographyPanelLink className="side-pane-nav-link app-side-pane-feature-link">{t(locale, 'workspace.lexicon.openOrthographyManager')}</OrthographyPanelLink>
        </div>
      </section>
    </div>
  ), [filteredLexemes.length, locale, selectedLexeme, selectedLexemeGloss]);

  useRegisterAppSidePane({
    title: t(locale, 'workspace.lexicon.sidePaneTitle'),
    subtitle: selectedLexeme ? readLexemeLabel(selectedLexeme) : t(locale, 'workspace.lexicon.sidePaneSubtitle'),
    content: sidePaneContent,
  });

  return (
    <section className="panel lexicon-workspace" aria-labelledby="lexicon-workspace-title">
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
          meta={<span className="lexicon-workspace-list-count">{t(locale, 'workspace.lexicon.countLabel').replace('{count}', String(filteredLexemes.length))}</span>}
        >
          <input
            className="input lexicon-workspace-search"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t(locale, 'workspace.lexicon.searchPlaceholder')}
            aria-label={t(locale, 'workspace.lexicon.searchPlaceholder')}
          />

          {loading ? <p className="lexicon-workspace-state">{t(locale, 'workspace.lexicon.loading')}</p> : null}
          {!loading && error ? <p className="lexicon-workspace-state lexicon-workspace-state-error">{t(locale, 'workspace.lexicon.errorPrefix').replace('{message}', error)}</p> : null}
          {!loading && !error && filteredLexemes.length === 0 ? <p className="lexicon-workspace-state">{t(locale, 'workspace.lexicon.emptyList')}</p> : null}

          <div className="lexicon-workspace-list" role="list" aria-label={t(locale, 'workspace.lexicon.listTitle')}>
            {filteredLexemes.map((lexeme) => {
              const active = lexeme.id === selectedLexeme?.id;
              return (
                <button
                  key={lexeme.id}
                  type="button"
                  className={`lexicon-workspace-list-item${active ? ' lexicon-workspace-list-item-active' : ''}`}
                  onClick={() => setSelectedLexemeId(lexeme.id)}
                >
                  <span className="lexicon-workspace-list-label">{readLexemeLabel(lexeme)}</span>
                  <span className="lexicon-workspace-list-meta">
                    <span>{readLexemePrimaryGloss(lexeme, t(locale, 'workspace.lexicon.notSet'))}</span>
                    <span>{lexeme.language ?? t(locale, 'workspace.lexicon.notSet')}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </PanelSection>

        <div className="lexicon-workspace-detail-column">
          {selectedLexeme ? (
            <>
              <PanelSummary
                className="lexicon-workspace-summary-card"
                title={t(locale, 'workspace.lexicon.detailTitle')}
                description={readLexemeLabel(selectedLexeme)}
                meta={<span className="lexicon-workspace-summary-meta">{selectedLexemeGloss}</span>}
                supportingText={t(locale, 'workspace.lexicon.detailDescription')}
              />

              <PanelSection
                className="lexicon-workspace-detail-panel"
                title={t(locale, 'workspace.lexicon.overviewTitle')}
                description={t(locale, 'workspace.lexicon.overviewDescription')}
              >
                <dl className="lexicon-workspace-detail-grid">
                  <div><dt>{t(locale, 'workspace.lexicon.languageLabel')}</dt><dd>{selectedLexeme.language ?? t(locale, 'workspace.lexicon.notSet')}</dd></div>
                  <div><dt>{t(locale, 'workspace.lexicon.citationLabel')}</dt><dd>{selectedLexeme.citationForm ?? t(locale, 'workspace.lexicon.notSet')}</dd></div>
                  <div><dt>{t(locale, 'workspace.lexicon.lexemeTypeLabel')}</dt><dd>{selectedLexeme.lexemeType ?? t(locale, 'workspace.lexicon.notSet')}</dd></div>
                  <div><dt>{t(locale, 'workspace.lexicon.morphemeTypeLabel')}</dt><dd>{selectedLexeme.morphemeType ?? t(locale, 'workspace.lexicon.notSet')}</dd></div>
                  <div><dt>{t(locale, 'workspace.lexicon.usageCountLabel')}</dt><dd>{String(selectedLexeme.usageCount ?? 0)}</dd></div>
                  <div><dt>{t(locale, 'workspace.lexicon.updatedAtLabel')}</dt><dd>{selectedLexeme.updatedAt}</dd></div>
                </dl>
              </PanelSection>

              <PanelSection
                className="lexicon-workspace-detail-panel"
                title={t(locale, 'workspace.lexicon.hitSegmentsTitle')}
                description={t(locale, 'workspace.lexicon.hitSegmentsDescription')}
              >
                {jumpTargetsLoading ? (
                  <p className="lexicon-workspace-state">{t(locale, 'workspace.lexicon.hitSegmentsLoading')}</p>
                ) : null}
                {jumpTargetsError ? (
                  <p className="lexicon-workspace-state lexicon-workspace-state-error">
                    {t(locale, 'workspace.lexicon.hitSegmentsError')}
                  </p>
                ) : null}
                {!jumpTargetsLoading && !jumpTargetsError && lexemeJumpTargets.length === 0 ? (
                  <p className="lexicon-workspace-state">{t(locale, 'workspace.lexicon.hitSegmentsEmpty')}</p>
                ) : null}
                {!jumpTargetsLoading && !jumpTargetsError && lexemeJumpTargets.length > 0 ? (
                  <ul className="lexicon-workspace-hit-list" aria-label={t(locale, 'workspace.lexicon.hitSegmentsTitle')}>
                    {lexemeJumpTargets.map((hit) => {
                      const primaryLabel = hit.surfaceHint?.trim() || hit.unitId;
                      const href = buildTranscriptionDeepLinkHref({
                        textId: hit.textId,
                        ...(hit.mediaId ? { mediaId: hit.mediaId } : {}),
                        layerId: hit.layerId,
                        unitId: hit.unitId,
                        ...(hit.unitKind === 'segment' ? { unitKind: 'segment' } : {}),
                      });
                      return (
                        <li key={`${hit.textId}:${hit.layerId}:${hit.unitId}:${hit.unitKind}`} className="lexicon-workspace-hit-item">
                          <Link className="lexicon-workspace-hit-link" to={href} title={t(locale, 'workspace.lexicon.hitSegmentOpenTitle')}>
                            <span className="lexicon-workspace-hit-primary">{primaryLabel}</span>
                            <span className="lexicon-workspace-hit-meta">
                              {tf(locale, 'workspace.lexicon.hitSegmentMeta', {
                                textId: hit.textId,
                                unitId: hit.unitId,
                                kind: hit.unitKind === 'segment'
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

              <PanelSection className="lexicon-workspace-detail-panel" title={t(locale, 'workspace.lexicon.sensesTitle')}>
                {selectedLexeme.senses.length > 0 ? (
                  <ol className="lexicon-workspace-sense-list">
                    {selectedLexeme.senses.map((sense, index) => (
                      <li key={`${selectedLexeme.id}-sense-${index}`} className="lexicon-workspace-sense-item">
                        <strong>{formatMultilang(sense.gloss) || t(locale, 'workspace.lexicon.notSet')}</strong>
                        {formatMultilang(sense.definition) ? <p>{formatMultilang(sense.definition)}</p> : null}
                        {sense.category ? <span>{sense.category}</span> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="lexicon-workspace-state">{t(locale, 'workspace.lexicon.noSenses')}</p>
                )}
              </PanelSection>

              <PanelSection className="lexicon-workspace-detail-panel" title={t(locale, 'workspace.lexicon.formsTitle')}>
                {selectedLexeme.forms && selectedLexeme.forms.length > 0 ? (
                  <ul className="lexicon-workspace-form-list">
                    {selectedLexeme.forms.map((form, index) => (
                      <li key={`${selectedLexeme.id}-form-${index}`}>{readFirstValue(form.transcription, t(locale, 'workspace.lexicon.notSet'))}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="lexicon-workspace-state">{t(locale, 'workspace.lexicon.noForms')}</p>
                )}
              </PanelSection>

              <PanelSection className="lexicon-workspace-detail-panel" title={t(locale, 'workspace.lexicon.notesTitle')}>
                <p className="lexicon-workspace-notes">{formatMultilang(selectedLexeme.notes) || t(locale, 'workspace.lexicon.noNotes')}</p>
              </PanelSection>
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
