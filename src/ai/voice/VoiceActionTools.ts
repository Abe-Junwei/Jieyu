/**
 * VoiceActionTools — LLM 可调用的 UI 控制工具 schema
 *
 * 定义 Voice Agent 通过 AI 调用 UI 操作的工具接口。
 * 与 IntentRouter 的正则规则不同：VoiceActionTools 是 LLM 在意图解析后，
 * 当需要执行更复杂的 UI 操作（如调用 AI 自动标注、批量导航）时使用的结构化工具。
 *
 * 工具通过 VoiceAgentService.executeTool() 分发到对应的 handler。
 *
 * @see 解语-语音智能体架构设计方案 v2.5 §阶段2
 */

import type { ActionId } from '../../services/IntentRouter';

// ── Tool Names ───────────────────────────────────────────────────────────────

/** LLM 可调用的 Voice Action Tool 名称 */
export type VoiceActionToolName =
  // ── Navigation ──────────────────────────────────────────────────────────
  | 'nav_to_segment'
  | 'nav_to_time'
  | 'play_pause'
  // ── Segment editing ──────────────────────────────────────────────────────
  | 'mark_segment'
  | 'delete_segment'
  | 'split_at_time'
  | 'merge_prev'
  | 'merge_next'
  // ── Undo / redo ──────────────────────────────────────────────────────────
  | 'undo'
  | 'redo'
  // ── View ────────────────────────────────────────────────────────────────
  | 'focus_segment'
  | 'zoom_to_segment'
  | 'toggle_notes'
  | 'search_segments'
  // ── AI assistance ───────────────────────────────────────────────────────
  | 'auto_gloss_segment'
  | 'auto_translate_segment'
  | 'auto_segment'
  | 'suggest_segment_improvement'
  | 'analyze_segment_quality'
  // ── Context query ────────────────────────────────────────────────────────
  | 'get_current_segment'
  | 'get_project_summary'
  | 'get_recent_history';

// ── Tool Parameter Schemas ────────────────────────────────────────────────────

export interface NavToSegmentParams {
  /** 目标句段序号（从 1 开始） */
  segmentIndex: number;
}

export interface NavToTimeParams {
  /** 目标时间点（秒） */
  timeSeconds: number;
}

export interface SplitAtTimeParams {
  /** 分割时间点（秒） */
  timeSeconds: number;
}

export interface FocusSegmentParams {
  /** 句段 ID */
  segmentId: string;
}

export interface ZoomToSegmentParams {
  /** 句段 ID */
  segmentId: string;
  /** 缩放级别（1-20），默认 4 */
  zoomLevel?: number;
}

export interface SearchSegmentsParams {
  /** 搜索关键词 */
  query: string;
  /** 搜索层（transcription/translation/gloss），默认全部 */
  layers?: Array<'transcription' | 'translation' | 'gloss'>;
}

export interface AutoGlossSegmentParams {
  /** 句段 ID，不传则使用当前句段 */
  segmentId?: string;
  /** 标注语言（ISO 639-3），默认根据语料库推断 */
  targetLang?: string;
}

export interface AutoTranslateSegmentParams {
  /** 句段 ID，不传则使用当前句段 */
  segmentId?: string;
  /** 目标语言（ BCP-47），默认翻译层语言 */
  targetLang?: string;
}

export interface SuggestSegmentImprovementParams {
  /** 句段 ID */
  segmentId: string;
  /** 改进类型 */
  type: 'transcription' | 'translation' | 'gloss' | 'all';
}

export interface AnalyzeSegmentQualityParams {
  /** 句段 ID */
  segmentId: string;
}

// ── Union Type ────────────────────────────────────────────────────────────────

export type VoiceActionToolParams =
  | NavToSegmentParams
  | NavToTimeParams
  | SplitAtTimeParams
  | FocusSegmentParams
  | ZoomToSegmentParams
  | SearchSegmentsParams
  | AutoGlossSegmentParams
  | AutoTranslateSegmentParams
  | SuggestSegmentImprovementParams
  | AnalyzeSegmentQualityParams
  | Record<string, never>; // empty params for tools with no required params

// ── Tool Definition ────────────────────────────────────────────────────────────

export interface VoiceActionToolDef {
  name: VoiceActionToolName;
  description: string;
  parameters: {
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
  };
}

/**
 * All VoiceActionTool definitions.
 * These are provided to the LLM as tool schemas for the ChatOrchestrator.
 *
 * IMPORTANT: These are NOT the actual implementations — they are ONLY schemas.
 * Implementations are dispatched via VoiceAgentService.executeTool().
 */
export const VOICE_ACTION_TOOL_DEFINITIONS: VoiceActionToolDef[] = [
  // ── Navigation ─────────────────────────────────────────────────────────────
  {
    name: 'nav_to_segment',
    description: '导航到指定序号的句段并选中它。用于"跳到第5句"等指令。',
    parameters: {
      properties: { segmentIndex: { type: 'integer', description: '目标句段序号，从 1 开始', minimum: 1 } },
      required: ['segmentIndex'],
    },
  },
  {
    name: 'nav_to_time',
    description: '将播放头跳转到指定时间点（秒）。用于"跳到30秒"等指令。',
    parameters: {
      properties: { timeSeconds: { type: 'number', description: '目标时间点，单位秒', minimum: 0 } },
      required: ['timeSeconds'],
    },
  },
  {
    name: 'play_pause',
    description: '切换播放/暂停状态。无需参数。',
    parameters: { properties: {}, required: [] },
  },

  // ── Segment editing ─────────────────────────────────────────────────────────
  {
    name: 'mark_segment',
    description: '对当前句段或指定句段进行标记（mark）。用于"标记这句"等指令。',
    parameters: {
      properties: { segmentId: { type: 'string', description: '句段 ID，不传则使用当前选中句段' } },
      required: [],
    },
  },
  {
    name: 'delete_segment',
    description: '删除当前句段或指定句段。谨慎使用。',
    parameters: {
      properties: { segmentId: { type: 'string', description: '句段 ID，不传则使用当前选中句段' } },
      required: [],
    },
  },
  {
    name: 'split_at_time',
    description: '在指定时间点分割句段。用于"在30秒处分割"等指令。',
    parameters: {
      properties: { timeSeconds: { type: 'number', description: '分割时间点，单位秒', minimum: 0 } },
      required: ['timeSeconds'],
    },
  },
  {
    name: 'merge_prev',
    description: '将当前句段与上一个句段合并。',
    parameters: {
      properties: { segmentId: { type: 'string', description: '句段 ID，不传则使用当前选中句段' } },
      required: [],
    },
  },
  {
    name: 'merge_next',
    description: '将当前句段与下一个句段合并。',
    parameters: {
      properties: { segmentId: { type: 'string', description: '句段 ID，不传则使用当前选中句段' } },
      required: [],
    },
  },

  // ── Undo / redo ────────────────────────────────────────────────────────────
  {
    name: 'undo',
    description: '撤销上一次编辑操作。无需参数。',
    parameters: { properties: {}, required: [] },
  },
  {
    name: 'redo',
    description: '重做上一次撤销的操作。无需参数。',
    parameters: { properties: {}, required: [] },
  },

  // ── View ────────────────────────────────────────────────────────────────────
  {
    name: 'focus_segment',
    description: '将视口滚动到并聚焦指定句段，使其可见但不改变选中状态。',
    parameters: {
      properties: { segmentId: { type: 'string', description: '句段 ID' } },
      required: ['segmentId'],
    },
  },
  {
    name: 'zoom_to_segment',
    description: '缩放波形到指定句段的时间范围。用于仔细查看某段音频。',
    parameters: {
      properties: {
        segmentId: { type: 'string', description: '句段 ID' },
        zoomLevel: { type: 'integer', description: '缩放级别 1-20，默认 4', minimum: 1, maximum: 20 },
      },
      required: ['segmentId'],
    },
  },
  {
    name: 'toggle_notes',
    description: '打开或关闭备注面板。无需参数。',
    parameters: { properties: {}, required: [] },
  },
  {
    name: 'search_segments',
    description: '在句段中搜索关键词。用于"搜索"相关指令。',
    parameters: {
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        layers: { type: 'array', items: { type: 'string', enum: ['transcription', 'translation', 'gloss'] }, description: '搜索层，默认全部' },
      },
      required: ['query'],
    },
  },

  // ── AI assistance ────────────────────────────────────────────────────────────
  {
    name: 'auto_gloss_segment',
    description: '对当前句段或指定句段运行自动标注（auto-gloss）。用于"自动标注这句"等指令。',
    parameters: {
      properties: {
        segmentId: { type: 'string', description: '句段 ID，不传则使用当前选中句段' },
        targetLang: { type: 'string', description: '目标标注语言（ISO 639-3），不传则自动推断' },
      },
      required: [],
    },
  },
  {
    name: 'auto_translate_segment',
    description: '对当前句段或指定句段运行自动翻译。用于"翻译这句"等指令。',
    parameters: {
      properties: {
        segmentId: { type: 'string', description: '句段 ID，不传则使用当前选中句段' },
        targetLang: { type: 'string', description: '目标语言（ BCP-47），不传则使用默认翻译层语言' },
      },
      required: [],
    },
  },
  {
    name: 'auto_segment',
    description: '对一段音频范围运行自动切分。用于"重新切分"等指令。',
    parameters: {
      properties: {
        startTime: { type: 'number', description: '起始时间（秒）' },
        endTime: { type: 'number', description: '结束时间（秒）' },
      },
      required: [],
    },
  },
  {
    name: 'suggest_segment_improvement',
    description: '请求 AI 对指定句段的转写/翻译/标注提出改进建议。',
    parameters: {
      properties: {
        segmentId: { type: 'string', description: '句段 ID' },
        type: { type: 'string', enum: ['transcription', 'translation', 'gloss', 'all'], description: '改进类型' },
      },
      required: ['segmentId', 'type'],
    },
  },
  {
    name: 'analyze_segment_quality',
    description: '对指定句段进行质量分析（ SNR、清晰度、是否困难句段）。',
    parameters: {
      properties: { segmentId: { type: 'string', description: '句段 ID' } },
      required: ['segmentId'],
    },
  },

  // ── Context query ───────────────────────────────────────────────────────────
  {
    name: 'get_current_segment',
    description: '获取当前句段的详细信息（ID、文本、翻译、标注状态）。用于确认操作目标。',
    parameters: { properties: {}, required: [] },
  },
  {
    name: 'get_project_summary',
    description: '获取当前项目摘要（句段总数、完成率、当前阶段、用户画像提示）。',
    parameters: { properties: {}, required: [] },
  },
  {
    name: 'get_recent_history',
    description: '获取最近的语音命令历史（最近 8 条），用于理解用户意图趋势。',
    parameters: { properties: {}, required: [] },
  },
];

// ── Tool → ActionId Mapping ───────────────────────────────────────────────────

/**
 * Maps VoiceActionToolNames to UI ActionIds where applicable.
 * Tools that don't map directly to ActionIds (AI assistance / context query) return null.
 */
export function toolToActionId(toolName: VoiceActionToolName, params: VoiceActionToolParams): ActionId | null {
  switch (toolName) {
    case 'play_pause': return 'playPause';
    case 'mark_segment': return 'markSegment';
    case 'delete_segment': return 'deleteSegment';
    case 'merge_prev': return 'mergePrev';
    case 'merge_next': return 'mergeNext';
    case 'undo': return 'undo';
    case 'redo': return 'redo';
    case 'toggle_notes': return 'toggleNotes';
    case 'search_segments': return 'search';
    // nav_to_segment: special — needs index → navPrev/navNext or direct nav
    // focus_segment: special — scroll to segment
    // zoom_to_segment: special
    // split_at_time: special
    // auto_* / suggest_* / analyze_*: AI-side only
    // context queries: no-op from executeAction perspective
    default: return null;
  }
}

/**
 * Returns true if the tool requires AI-side processing
 * (i.e., it cannot be handled by simple executeAction and needs the AI provider).
 */
export function isAiTool(toolName: VoiceActionToolName): boolean {
  switch (toolName) {
    case 'auto_gloss_segment':
    case 'auto_translate_segment':
    case 'auto_segment':
    case 'suggest_segment_improvement':
    case 'analyze_segment_quality':
    case 'get_current_segment':
    case 'get_project_summary':
    case 'get_recent_history':
      return true;
    default:
      return false;
  }
}
