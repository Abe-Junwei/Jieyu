import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OrthographyDocType } from '../db';
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
    <div className="search-replace-overlay-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="search-replace-overlay"
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
      {/* Search row */}
      <div className="search-replace-row">
        <input
          ref={searchRef}
          type="text"
          placeholder="搜索…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCurrentIndex(0); }}
          className="search-replace-input"
        />
        <span className="search-replace-count">
          {matches.length > 0 ? `${safeIndex + 1}/${matches.length}` : debouncedQuery ? '无结果' : ''}
        </span>
        <button onClick={goPrev} disabled={matches.length === 0} className="search-replace-btn" title="上一个 (Shift+Enter)">▲</button>
        <button onClick={goNext} disabled={matches.length === 0} className="search-replace-btn" title="下一个 (Enter)">▼</button>
        <button onClick={() => setShowReplace((v) => !v)} className="search-replace-btn" title="替换">⇄</button>
        <button onClick={onClose} className="search-replace-btn" title="关闭 (Esc)">✕</button>
      </div>

      <div className="search-replace-toolbar">
        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as SearchScope);
            setCurrentIndex(0);
          }}
          className="search-replace-select"
          title="搜索范围"
        >
          <option value="current-layer">当前层</option>
          <option value="current-utterance">当前句段</option>
          <option value="global">全局</option>
        </select>
        <select
          value={layerKinds.length === 1 ? layerKinds[0] : 'all'}
          onChange={(e) => {
            const next = e.target.value;
            setLayerKinds(next === 'all' ? [] : [next as 'transcription' | 'translation' | 'gloss']);
            setCurrentIndex(0);
          }}
          className="search-replace-select"
          title="搜索内容类型"
        >
          <option value="all">全部内容</option>
          <option value="transcription">仅转写</option>
          <option value="translation">仅翻译</option>
          <option value="gloss">仅 gloss</option>
        </select>
        <label className="search-replace-toggle">
          <input
            type="checkbox"
            checked={options.caseSensitive}
            onChange={(e) => setOptions((prev) => ({ ...prev, caseSensitive: e.target.checked }))}
          />
          区分大小写
        </label>
        <label className="search-replace-toggle">
          <input
            type="checkbox"
            checked={options.wholeWord}
            onChange={(e) => setOptions((prev) => ({ ...prev, wholeWord: e.target.checked }))}
          />
          全词匹配
        </label>
        <label className="search-replace-toggle">
          <input
            type="checkbox"
            checked={options.regexMode}
            onChange={(e) => setOptions((prev) => ({ ...prev, regexMode: e.target.checked }))}
          />
          正则
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
            const prefix = previewStart > 0 ? '…' : '';
            const suffix = previewEnd < currentMatch.text.length ? '…' : '';
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
            placeholder="替换为…"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            className="search-replace-input search-replace-input-compact"
          />
          <button onClick={handleReplaceCurrent} disabled={!currentMatch} className="search-replace-btn" title="替换当前">替换</button>
          <button
            onClick={() => setShowReplacePreview((v) => !v)}
            disabled={replacePlan.length === 0}
            className="search-replace-btn"
            title="预览全部替换"
          >
            预览
          </button>
        </div>
      )}

      {showReplace && showReplacePreview && (
        <div className="search-replace-plan">
          <div className="search-replace-plan-title">
            将替换 {replacePlan.length} 条记录
          </div>
          {replacePlan.slice(0, 3).map((item, idx) => (
            <div key={`${item.utteranceId}-${item.layerId ?? 'default'}-${idx}`} className="search-replace-plan-item">
              <div>原文: {item.oldText.slice(0, 36)}{item.oldText.length > 36 ? '…' : ''}</div>
              <div>新文: {item.newText.slice(0, 36)}{item.newText.length > 36 ? '…' : ''}</div>
            </div>
          ))}
          <div className="search-replace-plan-actions">
            <button onClick={() => setShowReplacePreview(false)} className="search-replace-btn" title="取消预览">取消</button>
            <button onClick={handleReplaceAll} className="search-replace-btn" title="确认全部替换">确认替换</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
