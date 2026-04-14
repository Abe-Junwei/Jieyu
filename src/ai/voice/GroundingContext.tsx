/**
 * GroundingContext - AI decision context panel.
 *
 * Shows the context used by the AI when making decisions so users can
 * understand why the AI chose a given action.
 */

import { memo, useId, useState } from 'react';
import { ChevronDown, ChevronRight, Brain, User, Layers, AlertTriangle } from 'lucide-react';
import { JIEYU_LUCIDE_INLINE_TIGHT, JIEYU_LUCIDE_MICRO, JIEYU_LUCIDE_MICRO_XS } from '../../utils/jieyuLucideIcon';
import type { GroundingContextData } from '../../services/VoiceAgentGroundingContext';

// ── Types ─────────────────────────────────────────────────────────────────────

// ── Helpers ────────────────────────────────────────────────────────────────────

function FatigueBadge({ score }: { score: number }) {
  if (score < 0.3) return <span className="gc-fatigue gc-fatigue-low">{'\u8f7b\u677e'}</span>;
  if (score < 0.6) return <span className="gc-fatigue gc-fatigue-mid">{'\u4e00\u822c'}</span>;
  if (score < 0.8) return <span className="gc-fatigue gc-fatigue-high">{'\u75b2\u52b3'}</span>;
  return <span className="gc-fatigue gc-fatigue-critical">{'\u8fc7\u52b3'}</span>;
}

function PhaseTag({ phase }: { phase: string }) {
  const map: Record<string, string> = {
    importing: '\u5bfc\u5165',
    transcribing: '\u8f6c\u5199',
    annotating: '\u6807\u6ce8',
    translating: '\u7ffb\u8bd1',
    reviewing: '\u5ba1\u6821',
    exporting: '\u5bfc\u51fa',
  };
  return <span className="gc-phase-tag">{map[phase] ?? phase}</span>;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const SegmentCard = memo(function SegmentCard({ seg }: { seg: NonNullable<GroundingContextData['currentSegment']> }) {
  return (
    <div className="gc-card gc-segment-card">
      <div className="gc-card-header">
        <Layers className={JIEYU_LUCIDE_MICRO} />
        <span>{`\u5f53\u524d\u53e5\u6bb5 #${seg.index}`}</span>
        {seg.isMarked && <span className="gc-marked-badge">{'\u5df2\u6807\u8bb0'}</span>}
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
        <User className={JIEYU_LUCIDE_MICRO} />
        <span>{'\u7528\u6237\u753b\u50cf'}</span>
        <FatigueBadge score={profile.fatigueScore} />
      </div>
      <div className="gc-profile-row">
        <span className="gc-profile-label">{'\u5e38\u7528\u6a21\u5f0f'}</span>
        <span className="gc-profile-value">{profile.preferredMode === 'command' ? '\u6307\u4ee4' : profile.preferredMode === 'dictation' ? '\u542c\u5199' : '\u5206\u6790'}</span>
      </div>
      {profile.mostUsedAction && (
        <div className="gc-profile-row">
          <span className="gc-profile-label">{'\u9ad8\u9891\u64cd\u4f5c'}</span>
          <span className="gc-profile-value">{profile.mostUsedAction}</span>
        </div>
      )}
      <div className="gc-profile-row">
        <span className="gc-profile-label">{'\u786e\u8ba4\u504f\u597d'}</span>
        <span className="gc-profile-value">
          {profile.confirmationPreference === 'always' ? '\u59cb\u7ec8\u786e\u8ba4' : profile.confirmationPreference === 'destructive-only' ? '\u4ec5\u5371\u9669\u64cd\u4f5c' : '\u65e0\u9700\u786e\u8ba4'}
        </span>
      </div>
      {profile.fatigueScore > 0.6 && (
        <div className="gc-profile-warning">
          <AlertTriangle className={JIEYU_LUCIDE_MICRO_XS} />
          <span>{'\u75b2\u52b3\u5ea6\u8f83\u9ad8\uff0cAI \u5c06\u51cf\u5c11\u6253\u6270\u6027\u5efa\u8bae'}</span>
        </div>
      )}
    </div>
  );
});

const HotspotsCard = memo(function HotspotsCard({ hotspots }: { hotspots: GroundingContextData['attentionHotspots'] }) {
  if (hotspots.length === 0) return null;
  const hotspotGradientIdPrefix = useId().replace(/:/g, '-');

  return (
    <div className="gc-card gc-hotspots-card">
      <div className="gc-card-header">
        <AlertTriangle className={JIEYU_LUCIDE_MICRO} />
        <span>{'\u6ce8\u610f\u529b\u70ed\u70b9'}</span>
        <span className="gc-badge-count">{hotspots.length}</span>
      </div>
      <div className="gc-hotspots-list">
        {hotspots.slice(0, 5).map((h, hotspotIndex) => {
          const hotspotGradientId = `${hotspotGradientIdPrefix}-${hotspotIndex}`;
          return (
          <div key={h.segmentId} className="gc-hotspot-item">
            <span className="gc-hotspot-idx">#{h.index}</span>
            <div className="gc-hotspot-bar-bg" aria-hidden="true">
              <svg className="gc-hotspot-bar-svg" viewBox="0 0 100 4" preserveAspectRatio="none" focusable="false">
                <defs>
                  <linearGradient id={hotspotGradientId} x1="0%" y1="50%" x2="100%" y2="50%">
                    <stop offset="0%" stopColor="var(--state-warning-solid)" />
                    <stop offset="100%" stopColor="var(--state-danger-solid)" />
                  </linearGradient>
                </defs>
                <rect className="gc-hotspot-bar-track" x="0" y="0" width="100" height="4" rx="2" ry="2" />
                <rect className="gc-hotspot-bar-fill" x="0" y="0" width={Math.max(0, Math.min(100, h.score * 100))} height="4" rx="2" ry="2" fill={`url(#${hotspotGradientId})`} />
              </svg>
            </div>
            <span className="gc-hotspot-score">{(h.score * 100).toFixed(0)}%</span>
          </div>
          );
        })}
      </div>
    </div>
  );
});

const CorpusCard = memo(function CorpusCard({ corpus }: { corpus: GroundingContextData['relevantCorpus'] }) {
  if (corpus.length === 0) return null;
  return (
    <div className="gc-card gc-corpus-card">
      <div className="gc-card-header">
        <Brain className={JIEYU_LUCIDE_MICRO} />
        <span>{'\u76f8\u5173\u8bed\u6599'}</span>
        <span className="gc-badge-count">{corpus.length}</span>
      </div>
      <div className="gc-corpus-list">
        {corpus.slice(0, 4).map((c, i) => (
          <div key={`${c.segmentId}-${i}`} className="gc-corpus-item">
            <div className="gc-corpus-source-badge" data-source={c.source}>
              {c.source === 'document' ? '\u6587\u6863' : c.source === 'transcription' ? '\u8f6c\u5199' : c.source === 'translation' ? '\u7ffb\u8bd1' : '\u6807\u6ce8'}
            </div>
            <div className="gc-corpus-text" title={c.text}>
              {c.text.length > 60 ? `${c.text.slice(0, 60)}…` : c.text}
            </div>
            {c.translation && (
              <div className="gc-corpus-translation">
                → {c.translation.length > 40 ? `${c.translation.slice(0, 40)}…` : c.translation}
              </div>
            )}
            <div className="gc-corpus-score">{`\u76f8\u5173\u5ea6 ${Math.round(c.score * 100)}%`}</div>
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
          <Brain className={JIEYU_LUCIDE_INLINE_TIGHT} />
          <span>{'AI \u4e0a\u4e0b\u6587'}</span>
        </button>
      </div>
    );
  }

  const ageMs = Date.now() - data.contextBuiltAt;
  const ageLabel = ageMs < 5000 ? '\u521a\u521a' : ageMs < 60000 ? `${Math.floor(ageMs / 1000)}s\u524d` : `${Math.floor(ageMs / 60000)}m\u524d`;

  return (
    <div className={`grounding-context ${visible ? 'grounding-context-visible' : ''}`}>
      <button
        type="button"
        className="gc-toggle"
        onClick={onToggle}
        aria-expanded={visible}
        title={'\u663e\u793a/\u9690\u85cf AI \u51b3\u7b56\u4e0a\u4e0b\u6587'}
      >
        <Brain className={JIEYU_LUCIDE_INLINE_TIGHT} />
        <span>{'AI \u4e0a\u4e0b\u6587'}</span>
        {data.aiAdoptionRate !== null && (
          <span className="gc-adoption-rate" title={'AI \u91c7\u7eb3\u7387'}>
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
              {expanded ? <ChevronDown className={JIEYU_LUCIDE_MICRO} /> : <ChevronRight className={JIEYU_LUCIDE_MICRO} />}
            </button>
            <span className="gc-panel-title">{'AI \u51b3\u7b56\u4e0a\u4e0b\u6587'}</span>
            <span className="gc-panel-age">{`\u66f4\u65b0\u4e8e ${ageLabel}`}</span>
          </div>

          {expanded && (
            <div className="gc-panel-body">
              <div className="gc-phase-row">
                <PhaseTag phase={data.currentPhase} />
                <span className="gc-total-segments">{`${data.totalSegments} \u53e5\u6bb5`}</span>
                {data.selectedSegmentIds.length > 0 && (
                  <span className="gc-selected-count">{`${data.selectedSegmentIds.length} \u5df2\u9009`}</span>
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
