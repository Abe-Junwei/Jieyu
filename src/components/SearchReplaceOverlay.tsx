import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeSearchPattern,
  buildReplacePlan,
  findSearchMatches,
  type SearchMatch,
  type SearchReplaceOptions,
} from '../utils/searchReplaceUtils';

interface SearchReplaceOverlayProps {
  /** All searchable items: { id, text, layerId? } */
  items: Array<{ utteranceId: string; layerId?: string; text: string }>;
  currentLayerId?: string | undefined;
  currentUtteranceId?: string | undefined;
  onNavigate: (utteranceId: string) => void;
  onReplace: (utteranceId: string, layerId: string | undefined, oldText: string, newText: string) => void;
  onClose: () => void;
}

type SearchScope = 'current-layer' | 'current-utterance' | 'global';

export function SearchReplaceOverlay({
  items,
  currentLayerId,
  currentUtteranceId,
  onNavigate,
  onReplace,
  onClose,
}: SearchReplaceOverlayProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [showReplacePreview, setShowReplacePreview] = useState(false);
  const [scope, setScope] = useState<SearchScope>('current-layer');
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

  const patternAnalysis = useMemo(
    () => analyzeSearchPattern(debouncedQuery, options),
    [debouncedQuery, options],
  );

  // Compute matches with debounce + memo for large corpora.
  const matches: SearchMatch[] = useMemo(
    () => patternAnalysis.pattern ? findSearchMatches(scopedItems, debouncedQuery, options) : [],
    [scopedItems, debouncedQuery, options, patternAnalysis.pattern],
  );

  const replacePlan = useMemo(
    () => buildReplacePlan(scopedItems, debouncedQuery, replaceText, options),
    [scopedItems, debouncedQuery, replaceText, options],
  );

  // Clamp index
  const safeIndex = matches.length > 0 ? ((currentIndex % matches.length) + matches.length) % matches.length : -1;
  const currentMatch = safeIndex >= 0 ? matches[safeIndex] : null;

  // Navigate to current match
  useEffect(() => {
    if (currentMatch) onNavigate(currentMatch.utteranceId);
  }, [currentMatch?.utteranceId, currentMatch?.matchStart]);

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
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 200,
        background: '#fff',
        border: '1px solid #d1d5db',
        borderRadius: 12,
        boxShadow: '0 12px 28px rgba(0,0,0,.18)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 520,
        maxWidth: 'min(88vw, 760px)',
        fontSize: 14,
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Search row */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          ref={searchRef}
          type="text"
          placeholder="搜索…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCurrentIndex(0); }}
          style={{
            flex: 1,
            padding: '8px 10px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            outline: 'none',
          }}
        />
        <span style={{ whiteSpace: 'nowrap', color: '#6b7280', fontSize: 12, minWidth: 50, textAlign: 'center' }}>
          {matches.length > 0 ? `${safeIndex + 1}/${matches.length}` : debouncedQuery ? '无结果' : ''}
        </span>
        <button onClick={goPrev} disabled={matches.length === 0} style={btnStyle} title="上一个 (Shift+Enter)">▲</button>
        <button onClick={goNext} disabled={matches.length === 0} style={btnStyle} title="下一个 (Enter)">▼</button>
        <button onClick={() => setShowReplace((v) => !v)} style={btnStyle} title="替换">⇄</button>
        <button onClick={onClose} style={btnStyle} title="关闭 (Esc)">✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#4b5563', fontSize: 12 }}>
        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as SearchScope);
            setCurrentIndex(0);
          }}
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 12,
            color: '#374151',
            background: '#fff',
          }}
          title="搜索范围"
        >
          <option value="current-layer">当前层</option>
          <option value="current-utterance">当前句段</option>
          <option value="global">全局</option>
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <input
            type="checkbox"
            checked={options.caseSensitive}
            onChange={(e) => setOptions((prev) => ({ ...prev, caseSensitive: e.target.checked }))}
          />
          区分大小写
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <input
            type="checkbox"
            checked={options.wholeWord}
            onChange={(e) => setOptions((prev) => ({ ...prev, wholeWord: e.target.checked }))}
          />
          全词匹配
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <input
            type="checkbox"
            checked={options.regexMode}
            onChange={(e) => setOptions((prev) => ({ ...prev, regexMode: e.target.checked }))}
          />
          正则
        </label>
      </div>

      {(patternAnalysis.error || patternAnalysis.warning) && (
        <div style={{
          border: '1px solid #fecaca',
          background: '#fff1f2',
          borderRadius: 6,
          padding: '5px 8px',
          fontSize: 12,
          color: '#9f1239',
          lineHeight: 1.45,
        }}>
          {patternAnalysis.error ?? patternAnalysis.warning}
        </div>
      )}

      {currentMatch && (
        <div style={{
          border: '1px solid #e2e8f0',
          background: '#f8fafc',
          borderRadius: 6,
          padding: '6px 8px',
          fontSize: 12,
          color: '#334155',
          lineHeight: 1.5,
        }}>
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
                <mark style={{ background: '#fde68a', color: '#92400e', padding: '0 1px' }}>{hit}</mark>
                <span>{after}{suffix}</span>
              </span>
            );
          })()}
        </div>
      )}

      {/* Replace row */}
      {showReplace && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="替换为…"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            style={{
              flex: 1,
              padding: '4px 8px',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button onClick={handleReplaceCurrent} disabled={!currentMatch} style={btnStyle} title="替换当前">替换</button>
          <button
            onClick={() => setShowReplacePreview((v) => !v)}
            disabled={replacePlan.length === 0}
            style={btnStyle}
            title="预览全部替换"
          >
            预览
          </button>
        </div>
      )}

      {showReplace && showReplacePreview && (
        <div style={{
          border: '1px solid #cbd5e1',
          background: '#f8fafc',
          borderRadius: 6,
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
            将替换 {replacePlan.length} 条记录
          </div>
          {replacePlan.slice(0, 3).map((item, idx) => (
            <div key={`${item.utteranceId}-${item.layerId ?? 'default'}-${idx}`} style={{ fontSize: 12, color: '#475569', lineHeight: 1.45 }}>
              <div>原文: {item.oldText.slice(0, 36)}{item.oldText.length > 36 ? '…' : ''}</div>
              <div>新文: {item.newText.slice(0, 36)}{item.newText.length > 36 ? '…' : ''}</div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowReplacePreview(false)} style={btnStyle}>取消</button>
            <button onClick={handleReplaceAll} style={btnStyle} title="确认全部替换">确认替换</button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  padding: '2px 6px',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1.2,
  color: '#374151',
};
