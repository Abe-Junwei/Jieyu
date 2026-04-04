import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OrthographyDocType } from '../db';
import { useOptionalLocale } from '../i18n';
import { getSearchReplaceOverlayMessages } from '../i18n/searchReplaceOverlayMessages';
import {
  analyzeSearchPattern,
  buildReplacePlan,
  findSearchMatches,
  type SearchMatch,
  type SearchableItem,
  type SearchReplaceOptions,
} from '../utils/searchReplaceUtils';
import type { AppShellSearchScope } from '../utils/appShellEvents';
import { buildOrthographyPreviewTextProps, resolveOrthographyRenderPolicy } from '../utils/layerDisplayStyle';
import { DialogShell } from './ui/DialogShell';

interface SearchReplaceOverlayProps {
  /** All searchable items: { id, text, layerId?, layerKind? } */
  items: SearchableItem[];
  orthographies?: OrthographyDocType[];
  currentLayerId?: string | undefined;
  currentUtteranceId?: string | undefined;
  initialQuery?: string;
  initialScope?: AppShellSearchScope;
  initialLayerKinds?: Array<'transcription' | 'translation' | 'gloss'>;
  onNavigate: (utteranceId: string) => void;
  onReplace: (utteranceId: string, layerId: string | undefined, oldText: string, newText: string) => void;
  onClose: () => void;
}

type SearchScope = 'current-layer' | 'current-utterance' | 'global';

export function SearchReplaceOverlay({
  items,
  orthographies,
  currentLayerId,
  currentUtteranceId,
  initialQuery,
  initialScope,
  initialLayerKinds,
  onNavigate,
  onReplace,
  onClose,
}: SearchReplaceOverlayProps) {
  const locale = useOptionalLocale() ?? 'zh-CN';
  const messages = getSearchReplaceOverlayMessages(locale);
  const [query, setQuery] = useState(initialQuery ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [showReplacePreview, setShowReplacePreview] = useState(false);
  const [scope, setScope] = useState<SearchScope>(initialScope ?? 'current-layer');
  const [layerKinds, setLayerKinds] = useState<Array<'transcription' | 'translation' | 'gloss'>>(initialLayerKinds ?? []);
  const [options, setOptions] = useState<SearchReplaceOptions>({
    caseSensitive: false,
    wholeWord: false,
    regexMode: false,
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (initialQuery === undefined) return;
    setQuery(initialQuery);
    setDebouncedQuery(initialQuery);
    setCurrentIndex(0);
  }, [initialQuery]);

  useEffect(() => {
    if (!initialScope) return;
    setScope(initialScope);
  }, [initialScope]);

  useEffect(() => {
    if (!initialLayerKinds) return;
    setLayerKinds(initialLayerKinds);
  }, [initialLayerKinds]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [query]);

  const scopedItems = useMemo(() => {
    if (scope === 'current-utterance' && currentUtteranceId) {
      return items.filter((item) => item.utteranceId === currentUtteranceId);
    }
    if (scope === 'current-layer' && currentLayerId) {
      return items.filter((item) => item.layerId === currentLayerId);
    }
    return items;
  }, [scope, currentUtteranceId, currentLayerId, items]);

  const filteredItems = useMemo(() => {
    if (layerKinds.length === 0) return scopedItems;
    return scopedItems.filter((item) => item.layerKind && layerKinds.includes(item.layerKind));
  }, [layerKinds, scopedItems]);

  const patternAnalysis = useMemo(
    () => analyzeSearchPattern(debouncedQuery, options),
    [debouncedQuery, options],
  );

  // Compute matches with debounce + memo for large corpora.
  const matches: SearchMatch[] = useMemo(
    () => patternAnalysis.pattern ? findSearchMatches(filteredItems, debouncedQuery, options) : [],
    [filteredItems, debouncedQuery, options, patternAnalysis.pattern],
  );

  const replacePlan = useMemo(
    () => buildReplacePlan(filteredItems, debouncedQuery, replaceText, options),
    [filteredItems, debouncedQuery, replaceText, options],
  );

  // Clamp index
  const safeIndex = matches.length > 0 ? ((currentIndex % matches.length) + matches.length) % matches.length : -1;
  const currentMatch = safeIndex >= 0 ? matches[safeIndex] : null;
  const currentMatchRenderPolicy = useMemo(() => {
    if (!currentMatch?.languageId) return undefined;
    return resolveOrthographyRenderPolicy(currentMatch.languageId, orthographies, currentMatch.orthographyId);
  }, [currentMatch?.languageId, currentMatch?.orthographyId, orthographies]);
  const currentMatchPreviewProps = useMemo(
    () => buildOrthographyPreviewTextProps(currentMatchRenderPolicy),
    [currentMatchRenderPolicy],
  );

  // Navigate to current match
  useEffect(() => {
    if (currentMatch) onNavigate(currentMatch.utteranceId);
  }, [currentMatch?.utteranceId, onNavigate]);

  const goNext = useCallback(() => setCurrentIndex((i) => i + 1), []);
  const goPrev = useCallback(() => setCurrentIndex((i) => i - 1), []);

  const handleReplaceCurrent = useCallback(() => {
    if (!currentMatch) return;
    const before = currentMatch.text.slice(0, currentMatch.matchStart);
    const after = currentMatch.text.slice(currentMatch.matchEnd);
    onReplace(currentMatch.utteranceId, currentMatch.layerId, currentMatch.text, before + replaceText + after);
  }, [currentMatch, replaceText, onReplace]);

  const handleReplaceAll = useCallback(() => {
    if (!debouncedQuery) return;
    for (const update of replacePlan) {
      onReplace(update.utteranceId, update.layerId, update.oldText, update.newText);
    }
    setShowReplacePreview(false);
  }, [debouncedQuery, replacePlan, onReplace]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        goNext();
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        goPrev();
      }
    },
    [onClose, goNext, goPrev],
  );

  return (
    <div className="dialog-overlay dialog-overlay-topmost" role="presentation" onMouseDown={onClose}>
      <DialogShell
        className="search-replace-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={messages.searchPlaceholder}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
      {/* Search row */}
      <div className="search-replace-row">
        <input
          ref={searchRef}
          type="text"
          placeholder={messages.searchPlaceholder}
          aria-label={messages.searchPlaceholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCurrentIndex(0); }}
          className="search-replace-input"
        />
        <span className="search-replace-count">
          {matches.length > 0 ? `${safeIndex + 1}/${matches.length}` : debouncedQuery ? messages.noResults : ''}
        </span>
        <button onClick={goPrev} disabled={matches.length === 0} className="search-replace-btn" title={messages.previousTitle} aria-label={messages.previousTitle}>▲</button>
        <button onClick={goNext} disabled={matches.length === 0} className="search-replace-btn" title={messages.nextTitle} aria-label={messages.nextTitle}>▼</button>
        <button onClick={() => setShowReplace((v) => !v)} className="search-replace-btn" title={messages.toggleReplaceTitle} aria-label={messages.toggleReplaceTitle}>⇄</button>
        <button onClick={onClose} className="search-replace-btn" title={messages.closeTitle} aria-label={messages.closeTitle}>✕</button>
      </div>

      <div className="search-replace-toolbar">
        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as SearchScope);
            setCurrentIndex(0);
          }}
          className="search-replace-select"
          title={messages.scopeTitle}
          aria-label={messages.scopeTitle}
        >
          <option value="current-layer">{messages.scopeCurrentLayer}</option>
          <option value="current-utterance">{messages.scopeCurrentUtterance}</option>
          <option value="global">{messages.scopeGlobal}</option>
        </select>
        <select
          value={layerKinds.length === 1 ? layerKinds[0] : 'all'}
          onChange={(e) => {
            const next = e.target.value;
            setLayerKinds(next === 'all' ? [] : [next as 'transcription' | 'translation' | 'gloss']);
            setCurrentIndex(0);
          }}
          className="search-replace-select"
          title={messages.layerKindTitle}
          aria-label={messages.layerKindTitle}
        >
          <option value="all">{messages.layerKindAll}</option>
          <option value="transcription">{messages.layerKindTranscription}</option>
          <option value="translation">{messages.layerKindTranslation}</option>
          <option value="gloss">{messages.layerKindGloss}</option>
        </select>
        <label className="search-replace-toggle">
          <input
            type="checkbox"
            checked={options.caseSensitive}
            onChange={(e) => setOptions((prev) => ({ ...prev, caseSensitive: e.target.checked }))}
          />
          {messages.caseSensitive}
        </label>
        <label className="search-replace-toggle">
          <input
            type="checkbox"
            checked={options.wholeWord}
            onChange={(e) => setOptions((prev) => ({ ...prev, wholeWord: e.target.checked }))}
          />
          {messages.wholeWord}
        </label>
        <label className="search-replace-toggle">
          <input
            type="checkbox"
            checked={options.regexMode}
            onChange={(e) => setOptions((prev) => ({ ...prev, regexMode: e.target.checked }))}
          />
          {messages.regexMode}
        </label>
      </div>

      {(patternAnalysis.error || patternAnalysis.warning) && (
        <div className="search-replace-alert">
          {patternAnalysis.error ?? patternAnalysis.warning}
        </div>
      )}

      {currentMatch && (
        <div
          className="search-replace-preview"
          data-testid="search-replace-preview"
          dir={currentMatchPreviewProps.dir}
          style={currentMatchPreviewProps.style}
        >
          {(() => {
            const contextSize = 16;
            const previewStart = Math.max(0, currentMatch.matchStart - contextSize);
            const previewEnd = Math.min(currentMatch.text.length, currentMatch.matchEnd + contextSize);
            const prefix = previewStart > 0 ? messages.clippedEllipsis : '';
            const suffix = previewEnd < currentMatch.text.length ? messages.clippedEllipsis : '';
            const before = currentMatch.text.slice(previewStart, currentMatch.matchStart);
            const hit = currentMatch.text.slice(currentMatch.matchStart, currentMatch.matchEnd);
            const after = currentMatch.text.slice(currentMatch.matchEnd, previewEnd);
            return (
              <span>
                <span>{prefix}{before}</span>
                <mark className="search-replace-mark">{hit}</mark>
                <span>{after}{suffix}</span>
              </span>
            );
          })()}
        </div>
      )}

      {/* Replace row */}
      {showReplace && (
        <div className="search-replace-row">
          <input
            type="text"
            placeholder={messages.replacePlaceholder}
            aria-label={messages.replacePlaceholder}
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            className="search-replace-input search-replace-input-compact"
          />
          <button onClick={handleReplaceCurrent} disabled={!currentMatch} className="search-replace-btn" title={messages.replaceCurrentTitle} aria-label={messages.replaceCurrentTitle}>{messages.replaceCurrent}</button>
          <button
            onClick={() => setShowReplacePreview((v) => !v)}
            disabled={replacePlan.length === 0}
            className="search-replace-btn"
            title={messages.previewAllReplaceTitle}
            aria-label={messages.previewAllReplaceTitle}
          >
            {messages.preview}
          </button>
        </div>
      )}

      {showReplace && showReplacePreview && (
        <div className="search-replace-plan">
          <div className="search-replace-plan-title">
            {messages.replacePlanTitle(replacePlan.length)}
          </div>
          {replacePlan.slice(0, 3).map((item, idx) => (
            <div key={`${item.utteranceId}-${item.layerId ?? 'default'}-${idx}`} className="search-replace-plan-item">
              <div>{messages.originalText}: {item.oldText.slice(0, 36)}{item.oldText.length > 36 ? messages.clippedEllipsis : ''}</div>
              <div>{messages.replacedText}: {item.newText.slice(0, 36)}{item.newText.length > 36 ? messages.clippedEllipsis : ''}</div>
            </div>
          ))}
          <div className="search-replace-plan-actions">
            <button onClick={() => setShowReplacePreview(false)} className="search-replace-btn" title={messages.cancelPreviewTitle} aria-label={messages.cancelPreviewTitle}>{messages.cancel}</button>
            <button onClick={handleReplaceAll} className="search-replace-btn" title={messages.confirmReplaceAllTitle} aria-label={messages.confirmReplaceAllTitle}>{messages.confirmReplace}</button>
          </div>
        </div>
      )}
      </DialogShell>
    </div>
  );
}
