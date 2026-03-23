/**
 * ReportGenerator — 用户工作报告生成器
 *
 * 从 userBehaviorDB 读取数据，生成结构化报告。
 * 支持日报/周报/项目总览/自定义区间四种类型，
 * 输出 Markdown / JSON / CSV / TTS 摘要格式。
 *
 * 数据来源：
 *  - actionRecords：操作频率、耗时、语音置信度
 *  - taskPhaseRecords：各阶段耗时、句段处理量
 *  - difficultSegments：困难句段列表
 *  - userBehaviorProfile：疲劳趋势、使用时段分布
 *
 * @see 解语-语音智能体架构设计方案 v2.5 §阶段5
 */

import {
  getActionRecordsInRange,
  getTaskPhaseRecordsInRange,
  getDifficultSegmentsInRange,
  type UserBehaviorProfileDoc,
  type ActionRecordDoc,
  type TaskPhaseRecordDoc,
  type DifficultSegmentDoc,
} from './userBehaviorDB';
import { globalContext } from './GlobalContextService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReportType = 'daily' | 'weekly' | 'project' | 'custom';

export interface ReportOptions {
  type: ReportType;
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
      reason: this._difficultyReason(d),
    }));

    const dateStr = new Date(startTime).toISOString().split('T')[0] ?? '';

    return {
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
      ttsSummary: this._buildDailyTtsSummary(actions, profile, efficiencyVsYesterday),
    };
  }

  /**
   * Generate a weekly report (Mon–Sun of current week or specified week).
   */
  async _generateWeekly(options: ReportOptions): Promise<WeeklySummary> {
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
      weekStart: new Date(weekStart).toISOString().split('T')[0] ?? '',
      weekEnd: new Date(weekEnd).toISOString().split('T')[0] ?? '',
      days,
      weeklyTotals,
      topActionsOverall,
      phaseDistribution,
      difficultSegmentsOverall,
      weeklyTtsSummary: this._buildWeeklyTtsSummary(weeklyTotals, days.length),
    };
  }

  /**
   * Generate a project summary from all available data for a project.
   */
  async _generateProject(options: ReportOptions): Promise<ProjectSummary> {
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

    // 获取最近活动（近 7 天） | Get recent activity (last 7 days)
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

    // 基于当前节奏估算完成日期 | Estimate completion date based on current pace
    const todayActions = recentActivity[recentActivity.length - 1]?.actions ?? 0;
    const remaining = totalSegments - annotatedSegments;
    const dailyPace = todayActions > 0 ? todayActions : 10;
    const daysRemaining = Math.ceil(remaining / dailyPace);
    const estimatedCompletionDate = daysRemaining > 0
      ? new Date(Date.now() + daysRemaining * 86400000).toISOString().split('T')[0] ?? null
      : null;

    return {
      projectId,
      projectName: corpus?.projectMeta.name ?? '未知项目',
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
      projectTtsSummary: this._buildProjectTtsSummary(totalSegments, annotatedSegments, completionRate, estimatedCompletionDate),
    };
  }

  // ── Export formats ─────────────────────────────────────────────────────────

  /**
   * Export report as Markdown string.
   */
  toMarkdown(report: GeneratedReport): string {
    if ('weekStart' in report) return this._weeklyToMarkdown(report);
    if ('projectName' in report) return this._projectToMarkdown(report);
    return this._dailyToMarkdown(report);
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
          preferredMode: 'command',
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

  private _difficultyReason(d: DifficultSegmentDoc): string {
    if (d.editCount > 5) return '编辑次数过多';
    if (d.revertCount > 2) return '反复撤销';
    if (d.aiAssistanceRequested) return 'AI 辅助次数高';
    if (d.dwellTimeMs > 30000) return '停留时间过长';
    return '综合难度较高';
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
  ): string {
    const count = actions.length;
    const trend = efficiencyVsYesterday !== null
      ? efficiencyVsYesterday >= 0 ? `效率比昨天提升${Math.round(efficiencyVsYesterday)}%` : `效率比昨天下降${Math.round(Math.abs(efficiencyVsYesterday))}%`
      : '暂无对比数据';
    return `今日共执行${count}次操作。${trend}。`;
  }

  private _buildWeeklyTtsSummary(totals: ReturnType<typeof this._computeWeeklyTotals>, daysWithData: number): string {
    const { totalActions, fatigueTrend } = totals;
    const fatigueStr = fatigueTrend === 'worsening' ? '疲劳度有所上升，注意休息' :
      fatigueTrend === 'improving' ? '状态良好，继续保持' : '疲劳度稳定';
    return `本周共${totalActions}次操作，分布在${daysWithData}天。${fatigueStr}。`;
  }

  private _buildProjectTtsSummary(
    total: number,
    annotated: number,
    completionRate: number,
    estimatedDate: string | null,
  ): string {
    const pct = Math.round(completionRate * 100);
    const remaining = total - annotated;
    const estStr = estimatedDate ? `预计${estimatedDate}完成` : '无法预估';
    return `项目共${total}句段，已完成${annotated}句，完成率${pct}%。还剩${remaining}句，${estStr}。`;
  }

  // ── Markdown formatters ─────────────────────────────────────────────────

  private _dailyToMarkdown(d: DailySummary): string {
    const lines = [
      `# 日报 — ${d.date}`,
      '',
      `## 概览`,
      `- 总操作次数：${d.totalActions}`,
      `- 总耗时：${(d.totalDurationMs / 60000).toFixed(1)}分钟`,
      `- 语音平均置信度：${d.voiceConfidenceAvg !== null ? `${(d.voiceConfidenceAvg * 100).toFixed(0)}%` : 'N/A'}`,
      `- AI 辅助次数：${d.aiAssistanceCount}`,
      `- 疲劳指数：${(d.fatigueScore * 100).toFixed(0)}%`,
      `- 效率对比昨天：${d.efficiencyVsYesterday !== null ? `${d.efficiencyVsYesterday >= 0 ? '+' : ''}${d.efficiencyVsYesterday.toFixed(1)}%` : 'N/A'}`,
      '',
      `## 高频操作`,
      ...d.topActions.map((a) => `- ${a.actionId}: ${a.count}次（均${(a.avgDurationMs / 1000).toFixed(1)}秒）`),
      '',
      d.difficultSegments.length > 0
        ? `## 困难句段\n${d.difficultSegments.map((s) => `- \`${s.segmentId}\`（难度${(s.score * 100).toFixed(0)}%）${s.reason}`).join('\n')}`
        : '',
    ];
    return lines.filter(Boolean).join('\n');
  }

  private _weeklyToMarkdown(w: WeeklySummary): string {
    const lines = [
      `# 周报 — ${w.weekStart} ~ ${w.weekEnd}`,
      '',
      `## 周统计`,
      `- 总操作：${w.weeklyTotals.totalActions}次`,
      `- 日均操作：${w.weeklyTotals.avgDailyActions}次`,
      `- 总耗时：${(w.weeklyTotals.totalDurationMs / 3600000).toFixed(1)}小时`,
      `- 疲劳趋势：${w.weeklyTotals.fatigueTrend === 'worsening' ? '上升📈' : w.weeklyTotals.fatigueTrend === 'improving' ? '下降📉' : '稳定➡️'}`,
      `- 主要阶段：${w.weeklyTotals.dominantPhase}`,
      '',
      `## 阶段分布`,
      ...w.phaseDistribution.map((p) => `- ${p.phase}: ${p.percentage}%`),
      '',
      `## 高频操作`,
      ...w.topActionsOverall.map((a) => `- ${a.actionId}: ${a.count}次`),
    ];
    return lines.join('\n');
  }

  private _projectToMarkdown(p: ProjectSummary): string {
    const lines = [
      `# 项目总览 — ${p.projectName}`,
      '',
      `## 进度`,
      `- 总句段：${p.totalSegments}`,
      `- 已转写：${p.annotatedSegments}（${(p.completionRate * 100).toFixed(1)}%）`,
      `- 已翻译：${p.translatedSegments}`,
      `- 已标注：${p.glossedSegments}`,
      p.estimatedCompletionDate ? `- 预计完成：${p.estimatedCompletionDate}` : '',
      '',
      `## 近期活动`,
      ...p.recentActivity.map((a) => `- ${a.date}：${a.actions}次操作，${(a.durationMs / 60000).toFixed(1)}分钟`),
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
