/**
 * ReportGenerator
 *
 * Reads from userBehaviorDB and generates structured reports.
 * Supports daily / weekly / project / custom ranges and outputs
 * Markdown / JSON / CSV / TTS summary formats.
 */

import { getActionRecordsInRange, getTaskPhaseRecordsInRange, getDifficultSegmentsInRange, type UserBehaviorProfileDoc, type ActionRecordDoc, type TaskPhaseRecordDoc, type DifficultSegmentDoc } from './userBehaviorDB';
import { globalContext } from './GlobalContextService';
import { DEFAULT_VOICE_MODE } from './voiceMode';
import type { Locale } from '../i18n';
import { getReportGeneratorMessages } from '../i18n/messages';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReportType = 'daily' | 'weekly' | 'project' | 'custom';

export interface ReportOptions {
  type: ReportType;
  /** Locale used for user-facing report content */
  locale?: Locale;
  /** Start time (ms) for custom range, ignored for daily/weekly which compute from now */
  startTime?: number;
  /** End time (ms), defaults to now */
  endTime?: number;
  /** Include difficult segments section */
  includeDifficultSegments?: boolean;
  /** Project ID for project report */
  projectId?: string;
}

export interface DailySummary {
  locale: Locale;
  date: string; // ISO date string YYYY-MM-DD
  totalActions: number;
  totalDurationMs: number;
  topActions: Array<{ actionId: string; count: number; avgDurationMs: number }>;
  phaseBreakdown: Array<{ phase: string; durationMs: number; segmentsProcessed: number }>;
  voiceConfidenceAvg: number | null;
  aiAssistanceCount: number;
  fatigueScore: number;
  sessionCount: number;
  difficultSegments: Array<{ segmentId: string; score: number; reason: string }>;
  efficiencyVsYesterday: number | null; // percentage
  ttsSummary: string; // short summary suitable for TTS
}

export interface WeeklySummary {
  locale: Locale;
  weekStart: string; // ISO date
  weekEnd: string;
  days: DailySummary[];
  weeklyTotals: {
    totalActions: number;
    totalDurationMs: number;
    avgDailyActions: number;
    avgVoiceConfidence: number | null;
    totalAiAssistance: number;
    dominantPhase: string;
    fatigueTrend: 'improving' | 'stable' | 'worsening';
    sessionsCompleted: number;
  };
  topActionsOverall: Array<{ actionId: string; count: number }>;
  phaseDistribution: Array<{ phase: string; percentage: number }>;
  difficultSegmentsOverall: Array<{ segmentId: string; score: number; day: string }>;
  weeklyTtsSummary: string;
}

export interface ProjectSummary {
  locale: Locale;
  projectId: string;
  projectName: string;
  totalSegments: number;
  annotatedSegments: number;
  translatedSegments: number;
  glossedSegments: number;
  completionRate: number; // 0-1
  totalEditingTimeMs: number;
  avgSegmentTimeMs: number;
  topDifficultSegments: Array<{ segmentId: string; score: number }>;
  phaseTimeDistribution: Array<{ phase: string; totalMs: number; sessions: number }>;
  recentActivity: Array<{ date: string; actions: number; durationMs: number }>;
  estimatedCompletionDate: string | null;
  projectTtsSummary: string;
}

export type GeneratedReport = DailySummary | WeeklySummary | ProjectSummary;

// ── Report Generator ─────────────────────────────────────────────────────────

export class ReportGenerator {
  /**
   * Generate a report for the given options.
   */
  async generate(options: ReportOptions): Promise<GeneratedReport> {
    switch (options.type) {
      case 'daily':
        return this._generateDaily(options);
      case 'weekly':
        return this._generateWeekly(options);
      case 'project':
        return this._generateProject(options);
      case 'custom':
        return this._generateDaily(options); // custom falls back to daily logic
      default:
        return this._generateDaily(options);
    }
  }

  /**
   * Generate a daily report for today (or a specific date if startTime is set).
   */
  async _generateDaily(options: ReportOptions): Promise<DailySummary> {
    const locale = this._resolveLocale(options.locale);
    const endTime = options.endTime ?? Date.now();
    const startTime = options.startTime ?? this._todayStart(endTime);

    const [actions, profile, phaseRecords, dsSegments] = await Promise.all([
      getActionRecordsInRange(startTime, endTime),
      this._getProfile(),
      this._getPhaseRecords(startTime, endTime),
      this._getDifficultSegments(startTime, endTime),
    ]);

    const yesterdayStart = startTime - 86400000;
    const yesterdayActions = await getActionRecordsInRange(yesterdayStart, startTime);

    const topActions = this._aggregateTopActions(actions, 5);
    const phaseBreakdown = this._aggregatePhaseBreakdown(phaseRecords);
    const voiceConfidenceAvg = this._computeVoiceConfidenceAvg(actions);
    const aiAssistanceCount = actions.filter((a) => a.aiAssisted).length;

    const efficiencyVsYesterday = yesterdayActions.length > 0
      ? ((actions.length - yesterdayActions.length) / yesterdayActions.length) * 100
      : null;

    const difficultSegments = dsSegments.slice(0, 5).map((d) => ({
      segmentId: d.segmentId,
      score: d.difficultyScore,
      reason: this._difficultyReason(d, locale),
    }));

    const dateStr = new Date(startTime).toISOString().split('T')[0] ?? '';

    return {
      locale,
      date: dateStr,
      totalActions: actions.length,
      totalDurationMs: actions.reduce((sum, a) => sum + a.durationMs, 0),
      topActions,
      phaseBreakdown,
      voiceConfidenceAvg,
      aiAssistanceCount,
      fatigueScore: profile.fatigueScore,
      sessionCount: this._countSessions(actions),
      difficultSegments,
      efficiencyVsYesterday,
      ttsSummary: this._buildDailyTtsSummary(actions, profile, efficiencyVsYesterday, locale),
    };
  }

  /**
   * Generate a weekly report (Mon–Sun of current week or specified week).
   */
  async _generateWeekly(options: ReportOptions): Promise<WeeklySummary> {
    const locale = this._resolveLocale(options.locale);
    const now = options.endTime ?? Date.now();
    const weekStart = options.startTime ?? this._weekStart(now);
    const weekEnd = now;

    const days: DailySummary[] = [];
    for (let d = 0; d < 7; d++) {
      const dayStart = weekStart + d * 86400000;
      const dayEnd = dayStart + 86400000;
      if (dayEnd > weekEnd) break;
      try {
        const dayReport = await this._generateDaily({ ...options, startTime: dayStart, endTime: dayEnd });
        days.push(dayReport);
      } catch (err) {
        console.debug('[ReportGenerator] skip weekly day slice:', { dayStart, dayEnd, err });
      }
    }

    const weeklyTotals = this._computeWeeklyTotals(days);
    const topActionsOverall = this._aggregateTopActionsOverall(days, 5);
    const phaseDistribution = this._computePhaseDistribution(days);
    const difficultSegmentsOverall = this._collectDifficultSegments(days);

    return {
      locale,
      weekStart: new Date(weekStart).toISOString().split('T')[0] ?? '',
      weekEnd: new Date(weekEnd).toISOString().split('T')[0] ?? '',
      days,
      weeklyTotals,
      topActionsOverall,
      phaseDistribution,
      difficultSegmentsOverall,
      weeklyTtsSummary: this._buildWeeklyTtsSummary(weeklyTotals, days.length, locale),
    };
  }

  /**
   * Generate a project summary from all available data for a project.
   */
  async _generateProject(options: ReportOptions): Promise<ProjectSummary> {
    const locale = this._resolveLocale(options.locale);
    const messages = getReportGeneratorMessages(locale);
    const projectId = options.projectId ?? 'current';
    const corpus = globalContext.getCorpusContext();
    const profile = await this._getProfile();

    const totalSegments = corpus?.segments.length ?? 0;
    const annotatedSegments = corpus?.segments.filter((s) => s.text.length > 0).length ?? 0;
    const translatedSegments = corpus?.segments.filter((s) => s.translation !== null).length ?? 0;
    const glossedSegments = corpus?.segments.filter((s) => s.glossTiers !== null && Object.keys(s.glossTiers).length > 0).length ?? 0;

    const completionRate = totalSegments > 0 ? annotatedSegments / totalSegments : 0;
    const avgSegmentTimeMs = annotatedSegments > 0
      ? Object.values(profile.actionDurationsMs).reduce((sum, d) => sum + (d ?? 0), 0) / annotatedSegments
      : 0;

    // Get recent activity (last 7 days).
    const recentActivity: Array<{ date: string; actions: number; durationMs: number }> = [];
    for (let d = 6; d >= 0; d--) {
      const dayStart = this._todayStart(Date.now() - d * 86400000);
      const dayEnd = dayStart + 86400000;
      try {
        const actions = await getActionRecordsInRange(dayStart, dayEnd);
        recentActivity.push({
          date: new Date(dayStart).toISOString().split('T')[0] ?? '',
          actions: actions.length,
          durationMs: actions.reduce((sum, a) => sum + a.durationMs, 0),
        });
      } catch (err) {
        console.debug('[ReportGenerator] daily activity query failed, using zero fallback:', { dayStart, dayEnd, err });
        recentActivity.push({ date: new Date(dayStart).toISOString().split('T')[0] ?? '', actions: 0, durationMs: 0 });
      }
    }

    // Estimate completion date based on current pace.
    const todayActions = recentActivity[recentActivity.length - 1]?.actions ?? 0;
    const remaining = totalSegments - annotatedSegments;
    const dailyPace = todayActions > 0 ? todayActions : 10;
    const daysRemaining = Math.ceil(remaining / dailyPace);
    const estimatedCompletionDate = daysRemaining > 0
      ? new Date(Date.now() + daysRemaining * 86400000).toISOString().split('T')[0] ?? null
      : null;

    return {
      locale,
      projectId,
      projectName: corpus?.projectMeta.name ?? messages.unknownProject,
      totalSegments,
      annotatedSegments,
      translatedSegments,
      glossedSegments,
      completionRate,
      totalEditingTimeMs: Object.values(profile.actionDurationsMs).reduce((sum, d) => sum + (d ?? 0), 0),
      avgSegmentTimeMs,
      topDifficultSegments: [],
      phaseTimeDistribution: [],
      recentActivity,
      estimatedCompletionDate,
      projectTtsSummary: this._buildProjectTtsSummary(totalSegments, annotatedSegments, completionRate, estimatedCompletionDate, locale),
    };
  }

  // ── Export formats ─────────────────────────────────────────────────────────

  /**
   * Export report as Markdown string.
   */
  toMarkdown(report: GeneratedReport): string {
    const locale = this._resolveLocale(report.locale);
    if ('weekStart' in report) return this._weeklyToMarkdown(report, locale);
    if ('projectName' in report) return this._projectToMarkdown(report, locale);
    return this._dailyToMarkdown(report, locale);
  }

  /**
   * Export report as JSON string.
   */
  toJSON(report: GeneratedReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export action data as CSV rows.
   */
  toCSV(report: GeneratedReport): string {
    if (!('date' in report) || 'weekStart' in report) {
      // For weekly/project, export summary rows
      return 'type,metric,value\n' +
        `summary,totalActions,${'totalActions' in report ? report.totalActions : 'N/A'}\n`;
    }
    const rows = ['actionId,count,avgDurationMs'];
    for (const a of report.topActions) {
      rows.push(`${a.actionId},${a.count},${a.avgDurationMs}`);
    }
    return rows.join('\n');
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _resolveLocale(locale?: Locale): Locale {
    return locale ?? 'zh-CN';
  }

  private async _getProfile(): Promise<UserBehaviorProfileDoc> {
    const { loadBehaviorProfile } = await import('./userBehaviorDB');
    const doc = await loadBehaviorProfile();
    if (!doc) {
      return {
        id: 'current',
        actionFrequencies: {},
        actionDurationsMs: {},
        fatigueScore: 0,
        speakingRateTrend: 'stable',
        pauseFrequencyTrend: 'stable',
        lastBreakAt: Date.now(),
        preferences: {
          preferredMode: DEFAULT_VOICE_MODE,
          safeModeDefault: false,
          wakeWordEnabled: false,
          preferredEngine: 'web-speech',
          preferredLang: null,
          confirmationThreshold: 'destructive',
        },
        taskDurationsMs: {},
        usageTimeDistribution: new Array(24).fill(0),
        totalSessions: 0,
        lastSessionAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
    return doc;
  }

  private async _getPhaseRecords(startTime: number, endTime: number): Promise<TaskPhaseRecordDoc[]> {
    return getTaskPhaseRecordsInRange(startTime, endTime);
  }

  private async _getDifficultSegments(startTime: number, endTime: number): Promise<DifficultSegmentDoc[]> {
    return getDifficultSegmentsInRange(startTime, endTime);
  }

  private _aggregateTopActions(actions: ActionRecordDoc[], limit: number) {
    const counts: Partial<Record<string, number>> = {};
    const durations: Partial<Record<string, number[]>> = {};

    for (const a of actions) {
      counts[a.actionId] = (counts[a.actionId] ?? 0) + 1;
      if (!durations[a.actionId]) durations[a.actionId] = [];
      durations[a.actionId]!.push(a.durationMs);
    }

    return Object.entries(counts)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
      .slice(0, limit)
      .map(([actionId, count]) => {
        const durs = durations[actionId] ?? [];
        const avgDurationMs = durs.length > 0
          ? durs.reduce((s, d) => s + d, 0) / durs.length
          : 0;
        return { actionId, count: count ?? 0, avgDurationMs: Math.round(avgDurationMs) };
      });
  }

  private _aggregateTopActionsOverall(days: DailySummary[], limit: number) {
    const counts: Partial<Record<string, number>> = {};
    for (const day of days) {
      for (const a of day.topActions) {
        counts[a.actionId] = (counts[a.actionId] ?? 0) + a.count;
      }
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
      .slice(0, limit)
      .map(([actionId, count]) => ({ actionId, count: count ?? 0 }));
  }

  private _aggregatePhaseBreakdown(phaseRecords: TaskPhaseRecordDoc[]) {
    const allPhases = ['importing', 'transcribing', 'annotating', 'translating', 'reviewing', 'exporting'] as const;
    const totals: Record<string, { durationMs: number; segmentsProcessed: number }> = {};

    for (const phase of allPhases) {
      totals[phase] = { durationMs: 0, segmentsProcessed: 0 };
    }

    for (const record of phaseRecords) {
      const existing = totals[record.phase];
      if (existing) {
        existing.durationMs += record.endedAt - record.startedAt;
        existing.segmentsProcessed += record.segmentsProcessed;
      }
    }

    return allPhases
      .filter((p) => {
        const t = totals[p];
        return (t?.durationMs ?? 0) > 0 || (t?.segmentsProcessed ?? 0) > 0;
      })
      .map((phase) => {
        const t = totals[phase]!;
        return {
          phase,
          durationMs: t.durationMs,
          segmentsProcessed: t.segmentsProcessed,
        };
      });
  }

  private _computeVoiceConfidenceAvg(actions: ActionRecordDoc[]): number | null {
    const withConfidence = actions.filter((a) => a.voiceConfidence !== null);
    if (withConfidence.length === 0) return null;
    const sum = withConfidence.reduce((s, a) => s + (a.voiceConfidence ?? 0), 0);
    return sum / withConfidence.length;
  }

  private _countSessions(actions: ActionRecordDoc[]): number {
    const sessions = new Set(actions.map((a) => a.sessionId));
    return sessions.size;
  }

  private _computeWeeklyTotals(days: DailySummary[]) {
    const totalActions = days.reduce((sum, d) => sum + d.totalActions, 0);
    const totalDurationMs = days.reduce((sum, d) => sum + d.totalDurationMs, 0);
    const confidences = days.filter((d) => d.voiceConfidenceAvg !== null).map((d) => d.voiceConfidenceAvg!);
    const totalAiAssistance = days.reduce((sum, d) => sum + d.aiAssistanceCount, 0);

    let dominantPhase = 'transcribing';
    const phaseTotals: Partial<Record<string, number>> = {};
    for (const day of days) {
      for (const p of day.phaseBreakdown) {
        phaseTotals[p.phase] = (phaseTotals[p.phase] ?? 0) + p.durationMs;
      }
    }
    const sorted = Object.entries(phaseTotals).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
    if (sorted.length > 0) dominantPhase = sorted[0]![0];

    const fatigueScores = days.map((d) => d.fatigueScore);
    const fatigueTrend: 'improving' | 'stable' | 'worsening' =
      fatigueScores.length < 2 ? 'stable' :
      fatigueScores[fatigueScores.length - 1]! > fatigueScores[0]! + 0.1 ? 'worsening' :
      fatigueScores[fatigueScores.length - 1]! < fatigueScores[0]! - 0.1 ? 'improving' : 'stable';

    return {
      totalActions,
      totalDurationMs,
      avgDailyActions: Math.round(totalActions / days.length),
      avgVoiceConfidence: confidences.length > 0
        ? confidences.reduce((s, c) => s + c, 0) / confidences.length
        : null,
      totalAiAssistance,
      dominantPhase,
      fatigueTrend,
      sessionsCompleted: days.reduce((sum, d) => sum + d.sessionCount, 0),
    };
  }

  private _computePhaseDistribution(days: DailySummary[]) {
    const totals: Partial<Record<string, number>> = {};
    let grandTotal = 0;
    for (const day of days) {
      for (const p of day.phaseBreakdown) {
        totals[p.phase] = (totals[p.phase] ?? 0) + p.durationMs;
        grandTotal += p.durationMs;
      }
    }
    if (grandTotal === 0) return [];
    return Object.entries(totals)
      .map(([phase, ms]) => ({ phase, percentage: Math.round(((ms ?? 0) / grandTotal) * 100) }))
      .sort((a, b) => b.percentage - a.percentage);
  }

  private _collectDifficultSegments(days: DailySummary[]) {
    const all: Array<{ segmentId: string; score: number; day: string }> = [];
    for (const day of days) {
      for (const seg of day.difficultSegments) {
        all.push({ segmentId: seg.segmentId, score: seg.score, day: day.date });
      }
    }
    return all.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  private _difficultyReason(d: DifficultSegmentDoc, locale: Locale): string {
    const messages = getReportGeneratorMessages(locale);
    if (d.editCount > 5) return messages.difficultyTooManyEdits;
    if (d.revertCount > 2) return messages.difficultyRepeatedUndo;
    if (d.aiAssistanceRequested) return messages.difficultyHighAiAssistance;
    if (d.dwellTimeMs > 30000) return messages.difficultyLongDwellTime;
    return messages.difficultyHighOverall;
  }

  private _todayStart(timestamp: number): number {
    const d = new Date(timestamp);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  private _weekStart(timestamp: number): number {
    const d = new Date(timestamp);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  // ── TTS Summary builders ─────────────────────────────────────────────────

  private _buildDailyTtsSummary(
    actions: ActionRecordDoc[],
    _profile: { fatigueScore: number },
    efficiencyVsYesterday: number | null,
    locale: Locale,
  ): string {
    const messages = getReportGeneratorMessages(locale);
    const count = actions.length;
    const trend = efficiencyVsYesterday !== null
      ? efficiencyVsYesterday >= 0
        ? messages.dailyTrendImproved(Math.round(efficiencyVsYesterday))
        : messages.dailyTrendDeclined(Math.round(Math.abs(efficiencyVsYesterday)))
      : messages.dailyTrendUnavailable;
    return messages.dailyTtsSummary(count, trend);
  }

  private _buildWeeklyTtsSummary(totals: ReturnType<typeof this._computeWeeklyTotals>, daysWithData: number, locale: Locale): string {
    const messages = getReportGeneratorMessages(locale);
    const { totalActions, fatigueTrend } = totals;
    const fatigueStr = fatigueTrend === 'worsening'
      ? messages.weeklyFatigueWorsening
      : fatigueTrend === 'improving'
        ? messages.weeklyFatigueImproving
        : messages.weeklyFatigueStable;
    return messages.weeklyTtsSummary(totalActions, daysWithData, fatigueStr);
  }

  private _buildProjectTtsSummary(
    total: number,
    annotated: number,
    completionRate: number,
    estimatedDate: string | null,
    locale: Locale,
  ): string {
    const messages = getReportGeneratorMessages(locale);
    const pct = Math.round(completionRate * 100);
    const remaining = total - annotated;
    const estStr = estimatedDate ? messages.projectEstimateKnown(estimatedDate) : messages.projectEstimateUnknown;
    return messages.projectTtsSummary(total, annotated, pct, remaining, estStr);
  }

  // ── Markdown formatters ─────────────────────────────────────────────────

  private _dailyToMarkdown(d: DailySummary, locale: Locale): string {
    const messages = getReportGeneratorMessages(locale);
    const voiceConfidence = d.voiceConfidenceAvg !== null ? `${(d.voiceConfidenceAvg * 100).toFixed(0)}%` : messages.notAvailable;
    const efficiency = d.efficiencyVsYesterday !== null
      ? `${d.efficiencyVsYesterday >= 0 ? '+' : ''}${d.efficiencyVsYesterday.toFixed(1)}%`
      : messages.notAvailable;
    const lines = [
      messages.markdownDailyTitle(d.date),
      '',
      messages.markdownOverview,
      messages.markdownTotalActions(d.totalActions),
      messages.markdownTotalDurationMinutes((d.totalDurationMs / 60000).toFixed(1)),
      messages.markdownVoiceConfidence(voiceConfidence),
      messages.markdownAiAssistance(d.aiAssistanceCount),
      messages.markdownFatigueScore(`${(d.fatigueScore * 100).toFixed(0)}%`),
      messages.markdownEfficiencyVsYesterday(efficiency),
      '',
      messages.markdownTopActions,
      ...d.topActions.map((action) => messages.markdownTopActionRow(action.actionId, action.count, (action.avgDurationMs / 1000).toFixed(1))),
      '',
      d.difficultSegments.length > 0
        ? `${messages.markdownDifficultSegments}\n${d.difficultSegments.map((segment) => messages.markdownDifficultSegmentRow(segment.segmentId, (segment.score * 100).toFixed(0), segment.reason)).join('\n')}`
        : '',
    ];
    return lines.filter(Boolean).join('\n');
  }

  private _weeklyToMarkdown(w: WeeklySummary, locale: Locale): string {
    const messages = getReportGeneratorMessages(locale);
    const lines = [
      messages.markdownWeeklyTitle(w.weekStart, w.weekEnd),
      '',
      messages.markdownWeeklyStats,
      messages.markdownWeeklyTotalActions(w.weeklyTotals.totalActions),
      messages.markdownWeeklyAvgDailyActions(w.weeklyTotals.avgDailyActions),
      messages.markdownWeeklyTotalDurationHours((w.weeklyTotals.totalDurationMs / 3600000).toFixed(1)),
      messages.markdownWeeklyFatigueTrend(messages.fatigueTrendLabel(w.weeklyTotals.fatigueTrend)),
      messages.markdownWeeklyDominantPhase(messages.phaseLabel(w.weeklyTotals.dominantPhase)),
      '',
      messages.markdownPhaseDistribution,
      ...w.phaseDistribution.map((phase) => messages.markdownPhaseDistributionRow(messages.phaseLabel(phase.phase), phase.percentage)),
      '',
      messages.markdownTopActions,
      ...w.topActionsOverall.map((action) => messages.markdownTopActionOverallRow(action.actionId, action.count)),
    ];
    return lines.join('\n');
  }

  private _projectToMarkdown(p: ProjectSummary, locale: Locale): string {
    const messages = getReportGeneratorMessages(locale);
    const lines = [
      messages.markdownProjectTitle(p.projectName),
      '',
      messages.markdownProgress,
      messages.markdownProjectTotalSegments(p.totalSegments),
      messages.markdownProjectAnnotatedSegments(p.annotatedSegments, (p.completionRate * 100).toFixed(1)),
      messages.markdownProjectTranslatedSegments(p.translatedSegments),
      messages.markdownProjectGlossedSegments(p.glossedSegments),
      p.estimatedCompletionDate ? messages.markdownProjectEstimatedCompletion(p.estimatedCompletionDate) : '',
      '',
      messages.markdownRecentActivity,
      ...p.recentActivity.map((activity) => messages.markdownRecentActivityRow(activity.date, activity.actions, (activity.durationMs / 60000).toFixed(1))),
    ];
    return lines.filter(Boolean).join('\n');
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

let _instance: ReportGenerator | null = null;

export function getReportGenerator(): ReportGenerator {
  if (!_instance) {
    _instance = new ReportGenerator();
  }
  return _instance;
}
