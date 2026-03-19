import { useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2 } from 'lucide-react';
import { detectLocale, t, tf } from '../../i18n';
import { formatTime } from '../../utils/transcriptionFormatters';
import { useAiPanelContext } from '../../contexts/AiPanelContext';
import type { AiPanelCardKey } from '../AiAnalysisPanel';

type Props = {
  shouldShow: (card: AiPanelCardKey) => boolean;
};

export function UtteranceAnalysisCards({ shouldShow }: Props) {
  const locale = detectLocale();
  const {
    aiConfidenceAvg,
    selectedUtterance,
    selectedRowMeta,
    selectedAiWarning,
    lexemeMatches,
    onOpenWordNote,
    onOpenMorphemeNote,
    onUpdateTokenPos,
    onBatchUpdateTokenPosByForm,
    selectedTranslationGapCount,
    onJumpToTranslationGap,
  } = useAiPanelContext();

  const [batchForm, setBatchForm] = useState('');
  const [batchPos, setBatchPos] = useState('');
  const [showOnlyUntagged, setShowOnlyUntagged] = useState(false);
  const posInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const words = selectedUtterance?.words ?? [];
  const taggedCount = useMemo(() => words.filter((word) => (word.pos ?? '').trim().length > 0).length, [words]);
  const displayedWords = useMemo(() => (showOnlyUntagged ? words.filter((word) => (word.pos ?? '').trim().length === 0) : words), [showOnlyUntagged, words]);
  const hasAiModelName = (selectedUtterance?.ai_metadata?.model ?? '').trim().length > 0;
  const hasAiConfidence = typeof selectedUtterance?.ai_metadata?.confidence === 'number';
  const hasModelInsightData = hasAiModelName || hasAiConfidence;
  const hasAnyAiSignal = aiConfidenceAvg !== null;

  const focusNextUntaggedToken = (sourceIndex: number): void => {
    for (let i = sourceIndex + 1; i < words.length; i += 1) {
      const nextWord = words[i];
      if (!nextWord || (nextWord.pos ?? '').trim().length > 0 || !nextWord.id) continue;
      const nextInput = posInputRefs.current[nextWord.id];
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
        break;
      }
    }
  };

  const commitTokenPos = (
    tokenId: string | undefined,
    nextValueRaw: string,
    prevValueRaw: string | undefined,
    sourceIndex: number,
    focusNext: boolean,
  ): void => {
    if (!tokenId || !onUpdateTokenPos) return;
    const nextPos = nextValueRaw.trim();
    const prevPos = (prevValueRaw ?? '').trim();
    if (nextPos === prevPos) {
      if (focusNext) focusNextUntaggedToken(sourceIndex);
      return;
    }

    const saveTask = onUpdateTokenPos(tokenId, nextPos.length > 0 ? nextPos : null);
    if (focusNext) {
      void Promise.resolve(saveTask).finally(() => {
        focusNextUntaggedToken(sourceIndex);
      });
    }
  };

  if (selectedUtterance) {
    return (
      <>
        {shouldShow('translation_focus') && (
          <div className="transcription-ai-card">
            <div className="transcription-ai-card-head">
              <span>{t(locale, 'ai.translation.title')}</span>
              <span className="transcription-ai-tag">{t(locale, 'ai.translation.tag')}</span>
            </div>
            <p className="small-text">{t(locale, 'ai.translation.gapCount')}{selectedTranslationGapCount ?? 0}</p>
            <button type="button" className="icon-btn" style={{ height: 26, minWidth: 96, fontSize: 12 }} disabled={!onJumpToTranslationGap || (selectedTranslationGapCount ?? 0) <= 0} onClick={() => onJumpToTranslationGap?.()}>{t(locale, 'ai.translation.jump')}</button>
          </div>
        )}

        {shouldShow('generation_status') && hasModelInsightData && (
          <div className="transcription-ai-card">
            <div className="transcription-ai-card-head">
              <span>{t(locale, 'ai.source.title')}</span>
              <span className="transcription-ai-tag">{t(locale, 'ai.source.tag')}</span>
            </div>
            <div className={`transcription-ai-status ${selectedUtterance.annotationStatus === 'verified' ? 'transcription-ai-status-verified' : 'transcription-ai-status-generated'}`} title={selectedUtterance.annotationStatus === 'verified' ? t(locale, 'ai.source.verified') : t(locale, 'ai.source.generated')}>
              {selectedUtterance.annotationStatus === 'verified' ? <CheckCircle2 size={16} /> : <Bot size={16} />}
              <strong>{selectedUtterance.annotationStatus === 'verified' ? t(locale, 'ai.source.verified') : t(locale, 'ai.source.generated')}</strong>
              <span>{tf(locale, 'ai.source.line', { rowNumber: selectedRowMeta?.rowNumber ?? '--', startTime: formatTime(selectedUtterance.startTime), endTime: formatTime(selectedUtterance.endTime) })}</span>
            </div>
          </div>
        )}

        {shouldShow('context_analysis') && hasModelInsightData && (
          <div className="transcription-ai-card">
            <div className="transcription-ai-card-head">
              <span>{t(locale, 'ai.insight.title')}</span>
              <span className="transcription-ai-tag">{t(locale, 'ai.insight.tag')}</span>
            </div>
            <p>
              {tf(locale, 'ai.insight.range', { startTime: formatTime(selectedUtterance.startTime), endTime: formatTime(selectedUtterance.endTime) })}
              {selectedUtterance.ai_metadata?.model ? tf(locale, 'ai.insight.model', { model: selectedUtterance.ai_metadata.model }) : t(locale, 'ai.insight.noModel')}
              {typeof selectedUtterance.ai_metadata?.confidence === 'number' ? tf(locale, 'ai.insight.confidence', { confidence: (selectedUtterance.ai_metadata.confidence * 100).toFixed(1) }) : ''}
            </p>
            {selectedAiWarning && <p className="inspector-warning">{t(locale, 'ai.insight.warning')}</p>}
          </div>
        )}

        {shouldShow('dictionary_matches') && (
          <div className="transcription-ai-card">
            <span className="transcription-ai-caption">{t(locale, 'ai.dict.title')}</span>
            {lexemeMatches.length === 0 ? <p className="small-text">{t(locale, 'ai.dict.noMatches')}</p> : lexemeMatches.map((item) => (
              <div key={item.id} className="transcription-match-row"><span>{Object.values(item.lemma)[0] ?? item.id}</span><em>{item.id}</em></div>
            ))}
          </div>
        )}

        {shouldShow('token_notes') && (
          <div className="transcription-ai-card">
            <span className="transcription-ai-caption">{t(locale, 'ai.notes.title')}</span>
            {!selectedUtterance.words || selectedUtterance.words.length === 0 ? <p className="small-text">{t(locale, 'ai.notes.noWords')}</p> : selectedUtterance.words.map((word, wordIndex) => {
              const wordLabel = word.form.default ?? Object.values(word.form)[0] ?? `word_${wordIndex + 1}`;
              return (
                <div key={word.id ?? `${selectedUtterance.id}-word-${wordIndex}`} className="transcription-match-row" style={{ display: 'block' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span>{wordLabel}</span>
                    {word.id && onOpenWordNote && <button type="button" className="icon-btn" style={{ height: 24, minWidth: 44, fontSize: 12 }} onClick={(event) => onOpenWordNote(selectedUtterance.id, word.id!, event)}>{t(locale, 'ai.notes.button')}</button>}
                  </div>
                  {Array.isArray(word.morphemes) && word.morphemes.length > 0 && (
                    <div style={{ marginTop: 6, paddingLeft: 10, display: 'grid', gap: 4 }}>
                      {word.morphemes.map((morpheme, morphIndex) => {
                        const morphLabel = morpheme.form.default ?? Object.values(morpheme.form)[0] ?? `morph_${morphIndex + 1}`;
                        return (
                          <div key={morpheme.id ?? `${selectedUtterance.id}-${word.id ?? wordIndex}-morph-${morphIndex}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 12, opacity: 0.9 }}>- {morphLabel}</span>
                            {word.id && morpheme.id && onOpenMorphemeNote && <button type="button" className="icon-btn" style={{ height: 22, minWidth: 44, fontSize: 12 }} onClick={(event) => onOpenMorphemeNote(selectedUtterance.id, word.id!, morpheme.id!, event)}>{t(locale, 'ai.notes.button')}</button>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {shouldShow('pos_tagging') && (
          <div className="transcription-ai-card">
            <span className="transcription-ai-caption">{t(locale, 'ai.pos.title')}</span>
            {!selectedUtterance?.words || selectedUtterance.words.length === 0 ? (
              <p className="small-text">{t(locale, 'ai.pos.noWords')}</p>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <div className="ai-card-row ai-card-row-space">
                  <span className="small-text">{tf(locale, 'ai.pos.coverage', { tagged: taggedCount, total: words.length, percent: (words.length === 0 ? '0.0' : ((taggedCount / words.length) * 100).toFixed(1)) })}</span>
                  <label className="ai-inline-checkbox"><input type="checkbox" checked={showOnlyUntagged} onChange={(e) => setShowOnlyUntagged(e.currentTarget.checked)} />{t(locale, 'ai.pos.showUntagged')}</label>
                </div>

                {displayedWords.map((word, wordIndex) => {
                  const sourceIndex = words.findIndex((item) => item.id === word.id);
                  const wordLabel = word.form.default ?? Object.values(word.form)[0] ?? `word_${wordIndex + 1}`;
                  return (
                    <label key={`pos-${word.id ?? `${selectedUtterance.id}-word-${wordIndex}`}-${word.pos ?? ''}`} className="ai-pos-row">
                      <span className="ai-pos-word-label">{wordLabel}</span>
                      <input
                        type="text"
                        defaultValue={word.pos ?? ''}
                        placeholder={t(locale, 'ai.pos.posPlaceholder')}
                        className="ai-pos-input"
                        ref={(el) => {
                          if (word.id) {
                            posInputRefs.current[word.id] = el;
                          }
                        }}
                        onBlur={(event) => commitTokenPos(word.id, event.currentTarget.value, word.pos, sourceIndex, false)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          commitTokenPos(word.id, (event.currentTarget as HTMLInputElement).value, word.pos, sourceIndex, true);
                        }}
                      />
                    </label>
                  );
                })}
                {displayedWords.length === 0 && <p className="small-text">{t(locale, 'ai.pos.noDisplayed')}</p>}
              </div>
            )}

            <div className="ai-pos-batch-wrap">
              <span className="small-text">{t(locale, 'ai.pos.batchLabel')}</span>
              <div className="ai-pos-batch-grid">
                <input type="text" placeholder={t(locale, 'ai.pos.formPlaceholder')} value={batchForm} onChange={(e) => setBatchForm(e.currentTarget.value)} className="ai-pos-input" />
                <input type="text" placeholder={t(locale, 'ai.pos.posPlaceholder')} value={batchPos} onChange={(e) => setBatchPos(e.currentTarget.value)} className="ai-pos-input" />
                <button type="button" className="icon-btn ai-btn-sm ai-btn-min-60" disabled={!onBatchUpdateTokenPosByForm || !selectedUtterance || batchForm.trim().length === 0} onClick={() => {
                  if (!selectedUtterance || !onBatchUpdateTokenPosByForm) return;
                  void onBatchUpdateTokenPosByForm(selectedUtterance.id, batchForm.trim(), batchPos.trim().length > 0 ? batchPos.trim() : null);
                }}>{t(locale, 'ai.pos.apply')}</button>
              </div>
            </div>
          </div>
        )}

        {shouldShow('phoneme_consistency') && (
          <div className="transcription-ai-card">
            <span className="transcription-ai-caption">{t(locale, 'ai.phoneme.title')}</span>
            <p className="small-text">
              {locale === 'zh-CN'
                ? '该指标将基于已标注音素自动计算，当前版本暂未启用。'
                : 'This metric will be computed from annotated phonemes and is not enabled in this build.'}
            </p>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {shouldShow('translation_focus') && <div className="transcription-ai-card transcription-ai-card-muted"><div className="transcription-ai-card-head"><span>{t(locale, 'ai.translation.title')}</span><span className="transcription-ai-tag">{t(locale, 'ai.translation.tag')}</span></div><p className="small-text">{t(locale, 'ai.translation.selectFirst')}</p></div>}
      {shouldShow('generation_status') && hasAnyAiSignal && <div className="transcription-ai-card transcription-ai-card-muted"><div className="transcription-ai-card-head"><span>{t(locale, 'ai.source.title')}</span><span className="transcription-ai-tag">{t(locale, 'ai.source.tag')}</span></div><p className="small-text">{t(locale, 'ai.source.selectFirst')}</p></div>}
      {shouldShow('context_analysis') && hasAnyAiSignal && <div className="transcription-ai-card transcription-ai-card-muted"><div className="transcription-ai-card-head"><span>{t(locale, 'ai.insight.title')}</span><span className="transcription-ai-tag">{t(locale, 'ai.insight.tag')}</span></div><p className="small-text">{t(locale, 'ai.insight.selectFirst')}</p></div>}
      {shouldShow('dictionary_matches') && <div className="transcription-ai-card transcription-ai-card-muted"><span className="transcription-ai-caption">{t(locale, 'ai.dict.title')}</span><p className="small-text">{t(locale, 'ai.dict.selectFirst')}</p></div>}
      {shouldShow('token_notes') && <div className="transcription-ai-card transcription-ai-card-muted"><span className="transcription-ai-caption">{t(locale, 'ai.notes.title')}</span><p className="small-text">{t(locale, 'ai.notes.selectFirst')}</p></div>}
      {shouldShow('pos_tagging') && <div className="transcription-ai-card transcription-ai-card-muted"><span className="transcription-ai-caption">{t(locale, 'ai.pos.title')}</span><p className="small-text">{t(locale, 'ai.pos.selectFirst')}</p></div>}
      {shouldShow('phoneme_consistency') && <div className="transcription-ai-card transcription-ai-card-muted"><span className="transcription-ai-caption">{t(locale, 'ai.phoneme.title')}</span><p className="small-text">{t(locale, 'ai.phoneme.selectFirst')}</p></div>}
    </>
  );
}
