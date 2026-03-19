/**
 * GroundingContext — AI 决策上下文面板
 *
 * 显示 AI 做出决策时所依赖的上下文信息，
 * 提升 AI 决策透明度，让用户了解"AI 为什么这样做"。
 *
 * 显示内容：
 *  - 当前句段信息（文本、翻译、标注状态）
 *  - 用户画像摘要（操作习惯、当前阶段）
 *  - 任务上下文（当前阶段、注意力热点）
 *  - 相关语料（RAG 检索结果）
 *
 * @see 解语-语音智能体架构设计方案 v2.5 §阶段2
 */

import { memo, useState } from 'react';
import { ChevronDown, ChevronRight, Brain, User, Layers, AlertTriangle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GroundingContextData {
  /** 当前句段 */
  currentSegment: {
    id: string;
    index: number;
    text: string;
    translation: string | null;
    gloss: string | null;
    isMarked: boolean;
    durationSeconds: number;
  } | null;
  /** 选中的句段 ID 列表 */
  selectedSegmentIds: string[];
  /** 总句段数 */
  totalSegments: number;
  /** 用户画像摘要 */
  userProfile: {
    preferredMode: string;
    mostUsedAction: string | null;
    fatigueScore: number; // 0-1
    confirmationPreference: 'always' | 'destructive-only' | 'never';
  };
  /** 当前任务阶段 */
  currentPhase: string;
  /** 困难句段列表（分数 ≥ 0.65） */
  attentionHotspots: Array<{ segmentId: string; index: number; score: number }>;
  /** RAG 检索结果 */
  relevantCorpus: Array<{
    segmentId: string;
    text: string;
    translation: string | null;
    score: number;
    source: 'transcription' | 'translation' | 'gloss' | 'document';
  }>;
  /** AI 采纳率（近期） */
  aiAdoptionRate: number | null; // 0-1, null = 无数据
  /** 上下文构建时间 */
  contextBuiltAt: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function FatigueBadge({ score }: { score: number }) {
  if (score < 0.3) return <span className="gc-fatigue gc-fatigue-low">轻松</span>;
  if (score < 0.6) return <span className="gc-fatigue gc-fatigue-mid">一般</span>;
  if (score < 0.8) return <span className="gc-fatigue gc-fatigue-high">疲劳</span>;
  return <span className="gc-fatigue gc-fatigue-critical">过劳</span>;
}

function PhaseTag({ phase }: { phase: string }) {
  const map: Record<string, string> = {
    importing: '导入',
    transcribing: '转写',
    annotating: '标注',
    translating: '翻译',
    reviewing: '审校',
    exporting: '导出',
  };
  return <span className="gc-phase-tag">{map[phase] ?? phase}</span>;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const SegmentCard = memo(function SegmentCard({ seg }: { seg: NonNullable<GroundingContextData['currentSegment']> }) {
  return (
    <div className="gc-card gc-segment-card">
      <div className="gc-card-header">
        <Layers size={12} />
        <span>当前句段 #{seg.index}</span>
        {seg.isMarked && <span className="gc-marked-badge">已标记</span>}
      </div>
      <div className="gc-segment-text" title={seg.text}>
        {seg.text.length > 80 ? `${seg.text.slice(0, 80)}…` : seg.text}
      </div>
      {seg.translation && (
        <div className="gc-segment-translation" title={seg.translation}>
          → {seg.translation.length > 60 ? `${seg.translation.slice(0, 60)}…` : seg.translation}
        </div>
      )}
      {seg.gloss && (
        <div className="gc-segment-gloss" title={seg.gloss}>
          ✦ {seg.gloss.length > 60 ? `${seg.gloss.slice(0, 60)}…` : seg.gloss}
        </div>
      )}
      <div className="gc-segment-meta">
        <span>{seg.durationSeconds.toFixed(1)}s</span>
        <span>ID: {seg.id.slice(0, 8)}…</span>
      </div>
    </div>
  );
});

const UserProfileCard = memo(function UserProfileCard({ profile }: { profile: GroundingContextData['userProfile'] }) {
  return (
    <div className="gc-card gc-profile-card">
      <div className="gc-card-header">
        <User size={12} />
        <span>用户画像</span>
        <FatigueBadge score={profile.fatigueScore} />
      </div>
      <div className="gc-profile-row">
        <span className="gc-profile-label">常用模式</span>
        <span className="gc-profile-value">{profile.preferredMode === 'command' ? '指令' : profile.preferredMode === 'dictation' ? '听写' : '分析'}</span>
      </div>
      {profile.mostUsedAction && (
        <div className="gc-profile-row">
          <span className="gc-profile-label">高频操作</span>
          <span className="gc-profile-value">{profile.mostUsedAction}</span>
        </div>
      )}
      <div className="gc-profile-row">
        <span className="gc-profile-label">确认偏好</span>
        <span className="gc-profile-value">
          {profile.confirmationPreference === 'always' ? '始终确认' : profile.confirmationPreference === 'destructive-only' ? '仅危险操作' : '无需确认'}
        </span>
      </div>
      {profile.fatigueScore > 0.6 && (
        <div className="gc-profile-warning">
          <AlertTriangle size={11} />
          <span>疲劳度较高，AI 将减少打扰性建议</span>
        </div>
      )}
    </div>
  );
});

const HotspotsCard = memo(function HotspotsCard({ hotspots }: { hotspots: GroundingContextData['attentionHotspots'] }) {
  if (hotspots.length === 0) return null;
  return (
    <div className="gc-card gc-hotspots-card">
      <div className="gc-card-header">
        <AlertTriangle size={12} />
        <span>注意力热点</span>
        <span className="gc-badge-count">{hotspots.length}</span>
      </div>
      <div className="gc-hotspots-list">
        {hotspots.slice(0, 5).map((h) => (
          <div key={h.segmentId} className="gc-hotspot-item">
            <span className="gc-hotspot-idx">#{h.index}</span>
            <div className="gc-hotspot-bar-bg">
              <div className="gc-hotspot-bar-fill" style={{ width: `${h.score * 100}%` }} />
            </div>
            <span className="gc-hotspot-score">{(h.score * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
});

const CorpusCard = memo(function CorpusCard({ corpus }: { corpus: GroundingContextData['relevantCorpus'] }) {
  if (corpus.length === 0) return null;
  return (
    <div className="gc-card gc-corpus-card">
      <div className="gc-card-header">
        <Brain size={12} />
        <span>相关语料</span>
        <span className="gc-badge-count">{corpus.length}</span>
      </div>
      <div className="gc-corpus-list">
        {corpus.slice(0, 4).map((c, i) => (
          <div key={`${c.segmentId}-${i}`} className="gc-corpus-item">
            <div className="gc-corpus-source-badge" data-source={c.source}>
              {c.source === 'document' ? '文档' : c.source === 'transcription' ? '转写' : c.source === 'translation' ? '翻译' : '标注'}
            </div>
            <div className="gc-corpus-text" title={c.text}>
              {c.text.length > 60 ? `${c.text.slice(0, 60)}…` : c.text}
            </div>
            {c.translation && (
              <div className="gc-corpus-translation">
                → {c.translation.length > 40 ? `${c.translation.slice(0, 40)}…` : c.translation}
              </div>
            )}
            <div className="gc-corpus-score">相关度 {Math.round(c.score * 100)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ── Main Component ─────────────────────────────────────────────────────────────

export const GroundingContext = memo(function GroundingContext({
  data,
  visible,
  onToggle,
}: {
  data: GroundingContextData | null;
  visible: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (!data) {
    return (
      <div className="grounding-context grounding-context-empty">
        <button type="button" className="gc-toggle" onClick={onToggle} aria-expanded={visible}>
          <Brain size={13} />
          <span>AI 上下文</span>
        </button>
      </div>
    );
  }

  const ageMs = Date.now() - data.contextBuiltAt;
  const ageLabel = ageMs < 5000 ? '刚刚' : ageMs < 60000 ? `${Math.floor(ageMs / 1000)}s前` : `${Math.floor(ageMs / 60000)}m前`;

  return (
    <div className={`grounding-context ${visible ? 'grounding-context-visible' : ''}`}>
      <button
        type="button"
        className="gc-toggle"
        onClick={onToggle}
        aria-expanded={visible}
        title="显示/隐藏 AI 决策上下文"
      >
        <Brain size={13} />
        <span>AI 上下文</span>
        {data.aiAdoptionRate !== null && (
          <span className="gc-adoption-rate" title="AI 采纳率">
            {(data.aiAdoptionRate * 100).toFixed(0)}%
          </span>
        )}
      </button>

      {visible && (
        <div className="gc-panel">
          <div className="gc-panel-header">
            <button
              type="button"
              className="gc-expand-btn"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            <span className="gc-panel-title">AI 决策上下文</span>
            <span className="gc-panel-age">更新于 {ageLabel}</span>
          </div>

          {expanded && (
            <div className="gc-panel-body">
              <div className="gc-phase-row">
                <PhaseTag phase={data.currentPhase} />
                <span className="gc-total-segments">{data.totalSegments} 句段</span>
                {data.selectedSegmentIds.length > 0 && (
                  <span className="gc-selected-count">{data.selectedSegmentIds.length} 已选</span>
                )}
              </div>

              {data.currentSegment && <SegmentCard seg={data.currentSegment} />}
              <UserProfileCard profile={data.userProfile} />
              <HotspotsCard hotspots={data.attentionHotspots} />
              <CorpusCard corpus={data.relevantCorpus} />
            </div>
          )}
        </div>
      )}
    </div>
  );
});
