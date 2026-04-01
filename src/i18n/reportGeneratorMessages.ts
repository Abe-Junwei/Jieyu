import type { Locale } from './index';

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

const zhPhaseLabels: Record<string, string> = {
  importing: '\u5bfc\u5165',
  transcribing: '\u8f6c\u5199',
  annotating: '\u6807\u6ce8',
  translating: '\u7ffb\u8bd1',
  reviewing: '\u590d\u6838',
  exporting: '\u5bfc\u51fa',
};

const enPhaseLabels: Record<string, string> = {
  importing: 'Importing',
  transcribing: 'Transcribing',
  annotating: 'Annotating',
  translating: 'Translating',
  reviewing: 'Reviewing',
  exporting: 'Exporting',
};

const zhCN: ReportGeneratorMessages = {
  unknownProject: '\u672a\u77e5\u9879\u76ee',
  notAvailable: 'N/A',
  difficultyTooManyEdits: '\u7f16\u8f91\u6b21\u6570\u8fc7\u591a',
  difficultyRepeatedUndo: '\u53cd\u590d\u64a4\u9500',
  difficultyHighAiAssistance: 'AI \u8f85\u52a9\u6b21\u6570\u9ad8',
  difficultyLongDwellTime: '\u505c\u7559\u65f6\u95f4\u8fc7\u957f',
  difficultyHighOverall: '\u7efc\u5408\u96be\u5ea6\u8f83\u9ad8',
  dailyTrendImproved: (percent) => `\u6548\u7387\u6bd4\u6628\u5929\u63d0\u5347${percent}%`,
  dailyTrendDeclined: (percent) => `\u6548\u7387\u6bd4\u6628\u5929\u4e0b\u964d${percent}%`,
  dailyTrendUnavailable: '\u6682\u65e0\u5bf9\u6bd4\u6570\u636e',
  dailyTtsSummary: (count, trend) => `\u4eca\u65e5\u5171\u6267\u884c${count}\u6b21\u64cd\u4f5c\u3002${trend}\u3002`,
  weeklyFatigueWorsening: '\u75b2\u52b3\u5ea6\u6709\u6240\u4e0a\u5347\uff0c\u6ce8\u610f\u4f11\u606f',
  weeklyFatigueImproving: '\u72b6\u6001\u826f\u597d\uff0c\u7ee7\u7eed\u4fdd\u6301',
  weeklyFatigueStable: '\u75b2\u52b3\u5ea6\u7a33\u5b9a',
  weeklyTtsSummary: (totalActions, daysWithData, fatigueSummary) => `\u672c\u5468\u5171${totalActions}\u6b21\u64cd\u4f5c\uff0c\u5206\u5e03\u5728${daysWithData}\u5929\u3002${fatigueSummary}\u3002`,
  projectEstimateKnown: (date) => `\u9884\u8ba1${date}\u5b8c\u6210`,
  projectEstimateUnknown: '\u65e0\u6cd5\u9884\u4f30',
  projectTtsSummary: (total, annotated, percent, remaining, estimate) => `\u9879\u76ee\u5171${total}\u53e5\u6bb5\uff0c\u5df2\u5b8c\u6210${annotated}\u53e5\uff0c\u5b8c\u6210\u7387${percent}%\u3002\u8fd8\u5269${remaining}\u53e5\uff0c${estimate}\u3002`,
  markdownDailyTitle: (date) => `# \u65e5\u62a5 - ${date}`,
  markdownWeeklyTitle: (weekStart, weekEnd) => `# \u5468\u62a5 - ${weekStart} ~ ${weekEnd}`,
  markdownProjectTitle: (projectName) => `# \u9879\u76ee\u603b\u89c8 - ${projectName}`,
  markdownOverview: '## \u6982\u89c8',
  markdownWeeklyStats: '## \u5468\u7edf\u8ba1',
  markdownProgress: '## \u8fdb\u5ea6',
  markdownRecentActivity: '## \u8fd1\u671f\u6d3b\u52a8',
  markdownTopActions: '## \u9ad8\u9891\u64cd\u4f5c',
  markdownDifficultSegments: '## \u56f0\u96be\u53e5\u6bb5',
  markdownPhaseDistribution: '## \u9636\u6bb5\u5206\u5e03',
  markdownTotalActions: (count) => `- \u603b\u64cd\u4f5c\u6b21\u6570\uff1a${count}`,
  markdownTotalDurationMinutes: (minutes) => `- \u603b\u8017\u65f6\uff1a${minutes}\u5206\u949f`,
  markdownVoiceConfidence: (value) => `- \u8bed\u97f3\u5e73\u5747\u7f6e\u4fe1\u5ea6\uff1a${value}`,
  markdownAiAssistance: (count) => `- AI \u8f85\u52a9\u6b21\u6570\uff1a${count}`,
  markdownFatigueScore: (value) => `- \u75b2\u52b3\u6307\u6570\uff1a${value}`,
  markdownEfficiencyVsYesterday: (value) => `- \u6548\u7387\u5bf9\u6bd4\u6628\u5929\uff1a${value}`,
  markdownTopActionRow: (actionId, count, seconds) => `- ${actionId}: ${count}\u6b21\uff08\u5747${seconds}\u79d2\uff09`,
  markdownDifficultSegmentRow: (segmentId, scorePercent, reason) => `- \`${segmentId}\`\uff08\u96be\u5ea6${scorePercent}%\uff09${reason}`,
  markdownWeeklyTotalActions: (count) => `- \u603b\u64cd\u4f5c\uff1a${count}\u6b21`,
  markdownWeeklyAvgDailyActions: (count) => `- \u65e5\u5747\u64cd\u4f5c\uff1a${count}\u6b21`,
  markdownWeeklyTotalDurationHours: (hours) => `- \u603b\u8017\u65f6\uff1a${hours}\u5c0f\u65f6`,
  markdownWeeklyFatigueTrend: (trendLabel) => `- \u75b2\u52b3\u8d8b\u52bf\uff1a${trendLabel}`,
  markdownWeeklyDominantPhase: (phaseLabel) => `- \u4e3b\u8981\u9636\u6bb5\uff1a${phaseLabel}`,
  markdownPhaseDistributionRow: (phaseLabel, percentage) => `- ${phaseLabel}: ${percentage}%`,
  markdownTopActionOverallRow: (actionId, count) => `- ${actionId}: ${count}\u6b21`,
  markdownProjectTotalSegments: (count) => `- \u603b\u53e5\u6bb5\uff1a${count}`,
  markdownProjectAnnotatedSegments: (count, percent) => `- \u5df2\u8f6c\u5199\uff1a${count}\uff08${percent}%\uff09`,
  markdownProjectTranslatedSegments: (count) => `- \u5df2\u7ffb\u8bd1\uff1a${count}`,
  markdownProjectGlossedSegments: (count) => `- \u5df2\u6807\u6ce8\uff1a${count}`,
  markdownProjectEstimatedCompletion: (date) => `- \u9884\u8ba1\u5b8c\u6210\uff1a${date}`,
  markdownRecentActivityRow: (date, actions, minutes) => `- ${date}\uff1a${actions}\u6b21\u64cd\u4f5c\uff0c${minutes}\u5206\u949f`,
  phaseLabel: (phase) => zhPhaseLabels[phase] ?? phase,
  fatigueTrendLabel: (trend) => {
    switch (trend) {
      case 'worsening':
        return '\u4e0a\u5347';
      case 'improving':
        return '\u4e0b\u964d';
      default:
        return '\u7a33\u5b9a';
    }
  },
};

const enUS: ReportGeneratorMessages = {
  unknownProject: 'Unknown Project',
  notAvailable: 'N/A',
  difficultyTooManyEdits: 'Too many edits',
  difficultyRepeatedUndo: 'Repeated undo operations',
  difficultyHighAiAssistance: 'High AI assistance usage',
  difficultyLongDwellTime: 'Excessive dwell time',
  difficultyHighOverall: 'High overall difficulty',
  dailyTrendImproved: (percent) => `Efficiency improved by ${percent}% vs yesterday`,
  dailyTrendDeclined: (percent) => `Efficiency declined by ${percent}% vs yesterday`,
  dailyTrendUnavailable: 'No comparison data available',
  dailyTtsSummary: (count, trend) => `Completed ${count} actions today. ${trend}.`,
  weeklyFatigueWorsening: 'Fatigue is rising; schedule a break.',
  weeklyFatigueImproving: 'Momentum is improving; keep it steady.',
  weeklyFatigueStable: 'Fatigue stayed stable.',
  weeklyTtsSummary: (totalActions, daysWithData, fatigueSummary) => `Completed ${totalActions} actions this week across ${daysWithData} day(s). ${fatigueSummary}.`,
  projectEstimateKnown: (date) => `estimated completion: ${date}`,
  projectEstimateUnknown: 'no completion estimate available',
  projectTtsSummary: (total, annotated, percent, remaining, estimate) => `The project has ${total} segments, ${annotated} completed, and a ${percent}% completion rate. ${remaining} segment(s) remain, ${estimate}.`,
  markdownDailyTitle: (date) => `# Daily Report - ${date}`,
  markdownWeeklyTitle: (weekStart, weekEnd) => `# Weekly Report - ${weekStart} to ${weekEnd}`,
  markdownProjectTitle: (projectName) => `# Project Overview - ${projectName}`,
  markdownOverview: '## Overview',
  markdownWeeklyStats: '## Weekly Stats',
  markdownProgress: '## Progress',
  markdownRecentActivity: '## Recent Activity',
  markdownTopActions: '## Top Actions',
  markdownDifficultSegments: '## Difficult Segments',
  markdownPhaseDistribution: '## Phase Distribution',
  markdownTotalActions: (count) => `- Total actions: ${count}`,
  markdownTotalDurationMinutes: (minutes) => `- Total duration: ${minutes} minutes`,
  markdownVoiceConfidence: (value) => `- Average voice confidence: ${value}`,
  markdownAiAssistance: (count) => `- AI assistance count: ${count}`,
  markdownFatigueScore: (value) => `- Fatigue score: ${value}`,
  markdownEfficiencyVsYesterday: (value) => `- Efficiency vs yesterday: ${value}`,
  markdownTopActionRow: (actionId, count, seconds) => `- ${actionId}: ${count} time(s) (${seconds}s avg)`,
  markdownDifficultSegmentRow: (segmentId, scorePercent, reason) => `- \`${segmentId}\` (${scorePercent}% difficulty) ${reason}`,
  markdownWeeklyTotalActions: (count) => `- Total actions: ${count}`,
  markdownWeeklyAvgDailyActions: (count) => `- Average daily actions: ${count}`,
  markdownWeeklyTotalDurationHours: (hours) => `- Total duration: ${hours} hours`,
  markdownWeeklyFatigueTrend: (trendLabel) => `- Fatigue trend: ${trendLabel}`,
  markdownWeeklyDominantPhase: (phaseLabel) => `- Dominant phase: ${phaseLabel}`,
  markdownPhaseDistributionRow: (phaseLabel, percentage) => `- ${phaseLabel}: ${percentage}%`,
  markdownTopActionOverallRow: (actionId, count) => `- ${actionId}: ${count} time(s)`,
  markdownProjectTotalSegments: (count) => `- Total segments: ${count}`,
  markdownProjectAnnotatedSegments: (count, percent) => `- Annotated: ${count} (${percent}%)`,
  markdownProjectTranslatedSegments: (count) => `- Translated: ${count}`,
  markdownProjectGlossedSegments: (count) => `- Glossed: ${count}`,
  markdownProjectEstimatedCompletion: (date) => `- Estimated completion: ${date}`,
  markdownRecentActivityRow: (date, actions, minutes) => `- ${date}: ${actions} action(s), ${minutes} minutes`,
  phaseLabel: (phase) => enPhaseLabels[phase] ?? phase,
  fatigueTrendLabel: (trend) => {
    switch (trend) {
      case 'worsening':
        return 'Worsening';
      case 'improving':
        return 'Improving';
      default:
        return 'Stable';
    }
  },
};

export function getReportGeneratorMessages(locale: Locale): ReportGeneratorMessages {
  return locale === 'en-US' ? enUS : zhCN;
}