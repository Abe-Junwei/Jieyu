import type { Locale } from './index';
import { formatCatalogTemplate, readMessageCatalog } from './messageCatalog';

type FatigueTrend = 'improving' | 'stable' | 'worsening';

export type ReportGeneratorMessages = {
  unknownProject: string;
  notAvailable: string;
  difficultyTooManyEdits: string;
  difficultyRepeatedUndo: string;
  difficultyHighAiAssistance: string;
  difficultyLongDwellTime: string;
  difficultyHighOverall: string;
  dailyTrendImproved: (percent: number) => string;
  dailyTrendDeclined: (percent: number) => string;
  dailyTrendUnavailable: string;
  dailyTtsSummary: (count: number, trend: string) => string;
  weeklyFatigueWorsening: string;
  weeklyFatigueImproving: string;
  weeklyFatigueStable: string;
  weeklyTtsSummary: (totalActions: number, daysWithData: number, fatigueSummary: string) => string;
  projectEstimateKnown: (date: string) => string;
  projectEstimateUnknown: string;
  projectTtsSummary: (total: number, annotated: number, percent: number, remaining: number, estimate: string) => string;
  markdownDailyTitle: (date: string) => string;
  markdownWeeklyTitle: (weekStart: string, weekEnd: string) => string;
  markdownProjectTitle: (projectName: string) => string;
  markdownOverview: string;
  markdownWeeklyStats: string;
  markdownProgress: string;
  markdownRecentActivity: string;
  markdownTopActions: string;
  markdownDifficultSegments: string;
  markdownPhaseDistribution: string;
  markdownTotalActions: (count: number) => string;
  markdownTotalDurationMinutes: (minutes: string) => string;
  markdownVoiceConfidence: (value: string) => string;
  markdownAiAssistance: (count: number) => string;
  markdownFatigueScore: (value: string) => string;
  markdownEfficiencyVsYesterday: (value: string) => string;
  markdownTopActionRow: (actionId: string, count: number, seconds: string) => string;
  markdownDifficultSegmentRow: (segmentId: string, scorePercent: string, reason: string) => string;
  markdownWeeklyTotalActions: (count: number) => string;
  markdownWeeklyAvgDailyActions: (count: number) => string;
  markdownWeeklyTotalDurationHours: (hours: string) => string;
  markdownWeeklyFatigueTrend: (trendLabel: string) => string;
  markdownWeeklyDominantPhase: (phaseLabel: string) => string;
  markdownPhaseDistributionRow: (phaseLabel: string, percentage: number) => string;
  markdownTopActionOverallRow: (actionId: string, count: number) => string;
  markdownProjectTotalSegments: (count: number) => string;
  markdownProjectAnnotatedSegments: (count: number, percent: string) => string;
  markdownProjectTranslatedSegments: (count: number) => string;
  markdownProjectGlossedSegments: (count: number) => string;
  markdownProjectEstimatedCompletion: (date: string) => string;
  markdownRecentActivityRow: (date: string, actions: number, minutes: string) => string;
  phaseLabel: (phase: string) => string;
  fatigueTrendLabel: (trend: FatigueTrend) => string;
};

type ReportGeneratorCatalog = Omit<
  ReportGeneratorMessages,
  | 'dailyTrendImproved'
  | 'dailyTrendDeclined'
  | 'dailyTtsSummary'
  | 'weeklyTtsSummary'
  | 'projectEstimateKnown'
  | 'projectTtsSummary'
  | 'markdownDailyTitle'
  | 'markdownWeeklyTitle'
  | 'markdownProjectTitle'
  | 'markdownTotalActions'
  | 'markdownTotalDurationMinutes'
  | 'markdownVoiceConfidence'
  | 'markdownAiAssistance'
  | 'markdownFatigueScore'
  | 'markdownEfficiencyVsYesterday'
  | 'markdownTopActionRow'
  | 'markdownDifficultSegmentRow'
  | 'markdownWeeklyTotalActions'
  | 'markdownWeeklyAvgDailyActions'
  | 'markdownWeeklyTotalDurationHours'
  | 'markdownWeeklyFatigueTrend'
  | 'markdownWeeklyDominantPhase'
  | 'markdownPhaseDistributionRow'
  | 'markdownTopActionOverallRow'
  | 'markdownProjectTotalSegments'
  | 'markdownProjectAnnotatedSegments'
  | 'markdownProjectTranslatedSegments'
  | 'markdownProjectGlossedSegments'
  | 'markdownProjectEstimatedCompletion'
  | 'markdownRecentActivityRow'
  | 'phaseLabel'
  | 'fatigueTrendLabel'
> & {
  dailyTrendImproved: string;
  dailyTrendDeclined: string;
  dailyTtsSummary: string;
  weeklyTtsSummary: string;
  projectEstimateKnown: string;
  projectTtsSummary: string;
  markdownDailyTitle: string;
  markdownWeeklyTitle: string;
  markdownProjectTitle: string;
  markdownTotalActions: string;
  markdownTotalDurationMinutes: string;
  markdownVoiceConfidence: string;
  markdownAiAssistance: string;
  markdownFatigueScore: string;
  markdownEfficiencyVsYesterday: string;
  markdownTopActionRow: string;
  markdownDifficultSegmentRow: string;
  markdownWeeklyTotalActions: string;
  markdownWeeklyAvgDailyActions: string;
  markdownWeeklyTotalDurationHours: string;
  markdownWeeklyFatigueTrend: string;
  markdownWeeklyDominantPhase: string;
  markdownPhaseDistributionRow: string;
  markdownTopActionOverallRow: string;
  markdownProjectTotalSegments: string;
  markdownProjectAnnotatedSegments: string;
  markdownProjectTranslatedSegments: string;
  markdownProjectGlossedSegments: string;
  markdownProjectEstimatedCompletion: string;
  markdownRecentActivityRow: string;
  phaseLabels: Record<string, string>;
  fatigueTrendLabels: Record<FatigueTrend, string>;
};

export function getReportGeneratorMessages(locale: Locale): ReportGeneratorMessages {
  const catalog = readMessageCatalog<ReportGeneratorCatalog>(locale === 'en-US' ? 'en-US' : 'zh-CN', 'msg.report.catalog');
  return {
    unknownProject: catalog.unknownProject,
    notAvailable: catalog.notAvailable,
    difficultyTooManyEdits: catalog.difficultyTooManyEdits,
    difficultyRepeatedUndo: catalog.difficultyRepeatedUndo,
    difficultyHighAiAssistance: catalog.difficultyHighAiAssistance,
    difficultyLongDwellTime: catalog.difficultyLongDwellTime,
    difficultyHighOverall: catalog.difficultyHighOverall,
    dailyTrendImproved: (percent) => formatCatalogTemplate(catalog.dailyTrendImproved, { percent }),
    dailyTrendDeclined: (percent) => formatCatalogTemplate(catalog.dailyTrendDeclined, { percent }),
    dailyTrendUnavailable: catalog.dailyTrendUnavailable,
    dailyTtsSummary: (count, trend) => formatCatalogTemplate(catalog.dailyTtsSummary, { count, trend }),
    weeklyFatigueWorsening: catalog.weeklyFatigueWorsening,
    weeklyFatigueImproving: catalog.weeklyFatigueImproving,
    weeklyFatigueStable: catalog.weeklyFatigueStable,
    weeklyTtsSummary: (totalActions, daysWithData, fatigueSummary) => formatCatalogTemplate(catalog.weeklyTtsSummary, { totalActions, daysWithData, fatigueSummary }),
    projectEstimateKnown: (date) => formatCatalogTemplate(catalog.projectEstimateKnown, { date }),
    projectEstimateUnknown: catalog.projectEstimateUnknown,
    projectTtsSummary: (total, annotated, percent, remaining, estimate) => formatCatalogTemplate(catalog.projectTtsSummary, { total, annotated, percent, remaining, estimate }),
    markdownDailyTitle: (date) => formatCatalogTemplate(catalog.markdownDailyTitle, { date }),
    markdownWeeklyTitle: (weekStart, weekEnd) => formatCatalogTemplate(catalog.markdownWeeklyTitle, { weekStart, weekEnd }),
    markdownProjectTitle: (projectName) => formatCatalogTemplate(catalog.markdownProjectTitle, { projectName }),
    markdownOverview: catalog.markdownOverview,
    markdownWeeklyStats: catalog.markdownWeeklyStats,
    markdownProgress: catalog.markdownProgress,
    markdownRecentActivity: catalog.markdownRecentActivity,
    markdownTopActions: catalog.markdownTopActions,
    markdownDifficultSegments: catalog.markdownDifficultSegments,
    markdownPhaseDistribution: catalog.markdownPhaseDistribution,
    markdownTotalActions: (count) => formatCatalogTemplate(catalog.markdownTotalActions, { count }),
    markdownTotalDurationMinutes: (minutes) => formatCatalogTemplate(catalog.markdownTotalDurationMinutes, { minutes }),
    markdownVoiceConfidence: (value) => formatCatalogTemplate(catalog.markdownVoiceConfidence, { value }),
    markdownAiAssistance: (count) => formatCatalogTemplate(catalog.markdownAiAssistance, { count }),
    markdownFatigueScore: (value) => formatCatalogTemplate(catalog.markdownFatigueScore, { value }),
    markdownEfficiencyVsYesterday: (value) => formatCatalogTemplate(catalog.markdownEfficiencyVsYesterday, { value }),
    markdownTopActionRow: (actionId, count, seconds) => formatCatalogTemplate(catalog.markdownTopActionRow, { actionId, count, seconds }),
    markdownDifficultSegmentRow: (segmentId, scorePercent, reason) => formatCatalogTemplate(catalog.markdownDifficultSegmentRow, { segmentId, scorePercent, reason }),
    markdownWeeklyTotalActions: (count) => formatCatalogTemplate(catalog.markdownWeeklyTotalActions, { count }),
    markdownWeeklyAvgDailyActions: (count) => formatCatalogTemplate(catalog.markdownWeeklyAvgDailyActions, { count }),
    markdownWeeklyTotalDurationHours: (hours) => formatCatalogTemplate(catalog.markdownWeeklyTotalDurationHours, { hours }),
    markdownWeeklyFatigueTrend: (trendLabel) => formatCatalogTemplate(catalog.markdownWeeklyFatigueTrend, { trendLabel }),
    markdownWeeklyDominantPhase: (phaseLabel) => formatCatalogTemplate(catalog.markdownWeeklyDominantPhase, { phaseLabel }),
    markdownPhaseDistributionRow: (phaseLabel, percentage) => formatCatalogTemplate(catalog.markdownPhaseDistributionRow, { phaseLabel, percentage }),
    markdownTopActionOverallRow: (actionId, count) => formatCatalogTemplate(catalog.markdownTopActionOverallRow, { actionId, count }),
    markdownProjectTotalSegments: (count) => formatCatalogTemplate(catalog.markdownProjectTotalSegments, { count }),
    markdownProjectAnnotatedSegments: (count, percent) => formatCatalogTemplate(catalog.markdownProjectAnnotatedSegments, { count, percent }),
    markdownProjectTranslatedSegments: (count) => formatCatalogTemplate(catalog.markdownProjectTranslatedSegments, { count }),
    markdownProjectGlossedSegments: (count) => formatCatalogTemplate(catalog.markdownProjectGlossedSegments, { count }),
    markdownProjectEstimatedCompletion: (date) => formatCatalogTemplate(catalog.markdownProjectEstimatedCompletion, { date }),
    markdownRecentActivityRow: (date, actions, minutes) => formatCatalogTemplate(catalog.markdownRecentActivityRow, { date, actions, minutes }),
    phaseLabel: (phase) => catalog.phaseLabels[phase] ?? phase,
    fatigueTrendLabel: (trend) => catalog.fatigueTrendLabels[trend] ?? trend,
  };
}