import { Bot, CheckCircle2, WandSparkles } from 'lucide-react';
import { formatTime } from '../utils/transcriptionFormatters';
import type { UtteranceDocType } from '../../db';

interface AiAnalysisPanelProps {
  isCollapsed: boolean;
  dbName: string;
  utteranceCount: number;
  translationLayerCount: number;
  aiConfidenceAvg: number | null;
  selectedUtterance: UtteranceDocType | null;
  selectedRowMeta: { rowNumber: number; start: number; end: number } | null;
  selectedAiWarning: boolean;
  lexemeMatches: Array<{ id: string; lemma: Record<string, string> }>;
}

export function AiAnalysisPanel({
  isCollapsed,
  dbName,
  utteranceCount,
  translationLayerCount,
  aiConfidenceAvg,
  selectedUtterance,
  selectedRowMeta,
  selectedAiWarning,
  lexemeMatches,
}: AiAnalysisPanelProps) {
  return (
    <aside className={`transcription-ai-panel ${isCollapsed ? 'transcription-ai-panel-collapsed' : ''}`}>
      <div className="transcription-ai-header">
        <Bot size={16} />
        <h3>Analysis</h3>
      </div>

      <div className="transcription-ai-stats-panel">
        <span className="toolbar-chip small-chip">DB {dbName}</span>
        <span className="toolbar-chip small-chip">句子 {utteranceCount}</span>
        <span className="toolbar-chip small-chip">翻译层 {translationLayerCount}</span>
        <span className="toolbar-chip small-chip">
          <WandSparkles size={12} />
          AI {aiConfidenceAvg === null ? '--' : `${(aiConfidenceAvg * 100).toFixed(1)}%`}
        </span>
      </div>

      {selectedUtterance ? (
        <>
          <div className="transcription-ai-card">
            <div className="transcription-ai-card-head">
              <span>Generation Status</span>
              <span className="transcription-ai-tag">Live</span>
            </div>
            <div
              className={`transcription-ai-status ${selectedUtterance.isVerified ? 'transcription-ai-status-verified' : 'transcription-ai-status-generated'}`}
              title={selectedUtterance.isVerified ? '人工确认' : 'AI 生成'}
            >
              {selectedUtterance.isVerified ? <CheckCircle2 size={16} /> : <Bot size={16} />}
              <strong>{selectedUtterance.isVerified ? '人工确认' : 'AI 生成'}</strong>
              <span>
                Row {selectedRowMeta?.rowNumber ?? '--'} · {formatTime(selectedUtterance.startTime)} -{' '}
                {formatTime(selectedUtterance.endTime)}
              </span>
            </div>
          </div>

          <div className="transcription-ai-card">
            <div className="transcription-ai-card-head">
              <span>Context Analysis</span>
              <span className="transcription-ai-tag">New</span>
            </div>
            <p>
              区间 {formatTime(selectedUtterance.startTime)} - {formatTime(selectedUtterance.endTime)}。
              {selectedUtterance.ai_metadata?.model
                ? ` 模型 ${selectedUtterance.ai_metadata.model} 给出当前段落建议。`
                : ' 暂无模型信息。'}
              {typeof selectedUtterance.ai_metadata?.confidence === 'number'
                ? ` 置信度 ${(selectedUtterance.ai_metadata.confidence * 100).toFixed(1)}%。`
                : ''}
            </p>
            {selectedAiWarning && <p className="inspector-warning">⚠ 词库未命中，建议人工复核。</p>}
          </div>

          <div className="transcription-ai-card">
            <span className="transcription-ai-caption">Dictionary Matches</span>
            {lexemeMatches.length === 0 ? (
              <p className="small-text">无匹配条目。</p>
            ) : (
              lexemeMatches.map((item) => (
                <div key={item.id} className="transcription-match-row">
                  <span>{Object.values(item.lemma)[0] ?? item.id}</span>
                  <em>{item.id}</em>
                </div>
              ))
            )}
          </div>

          <div className="transcription-ai-card">
            <span className="transcription-ai-caption">Phoneme Consistency</span>
            <div className="transcription-meter-row">
              <span>/p/</span>
              <div><i style={{ width: '75%' }} /></div>
              <strong>75%</strong>
            </div>
            <div className="transcription-meter-row">
              <span>/t/</span>
              <div><i style={{ width: '100%' }} /></div>
              <strong>100%</strong>
            </div>
            <div className="transcription-meter-row">
              <span>/k/</span>
              <div><i style={{ width: '22%' }} /></div>
              <strong>22%</strong>
            </div>
          </div>
        </>
      ) : (
        <p className="small-text">请先选中一行转写。</p>
      )}
    </aside>
  );
}
