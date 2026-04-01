/**
 * VoiceActionTools - tool schemas for LLM-driven UI control.
 *
 * Defines the tool interface used by the Voice Agent to invoke UI actions via AI.
 * Unlike IntentRouter regex rules, these tools are used after intent resolution
 * when the model needs to trigger more complex structured actions.
 *
 * Tools are dispatched through VoiceAgentService.executeTool().
 */

import type { ActionId } from '../../services/IntentRouter';

// ── Tool Names ───────────────────────────────────────────────────────────────

/** Voice Action Tool names callable by the LLM. */
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
  /** Target segment index, starting from 1. */
  segmentIndex: number;
}

export interface NavToTimeParams {
  /** Target playback position in seconds. */
  timeSeconds: number;
}

export interface SplitAtTimeParams {
  /** Split position in seconds. */
  timeSeconds: number;
}

export interface FocusSegmentParams {
  /** Segment ID. */
  segmentId: string;
}

export interface ZoomToSegmentParams {
  /** Segment ID. */
  segmentId: string;
  /** Zoom level from 1 to 20. Default is 4. */
  zoomLevel?: number;
}

export interface SearchSegmentsParams {
  /** Search query. */
  query: string;
  /** Layers to search. Defaults to all supported text layers. */
  layers?: Array<'transcription' | 'translation' | 'gloss'>;
}

export interface AutoGlossSegmentParams {
  /** Segment ID. Uses the current segment when omitted. */
  segmentId?: string;
  /** Target gloss language (ISO 639-3). Auto-detected when omitted. */
  targetLang?: string;
}

export interface AutoTranslateSegmentParams {
  /** Segment ID. Uses the current segment when omitted. */
  segmentId?: string;
  /** Target language (BCP-47). Defaults to the translation layer language. */
  targetLang?: string;
}

export interface SuggestSegmentImprovementParams {
  /** Segment ID. */
  segmentId: string;
  /** Improvement category. */
  type: 'transcription' | 'translation' | 'gloss' | 'all';
}

export interface AnalyzeSegmentQualityParams {
  /** Segment ID. */
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
    description: '\u5bfc\u822a\u5230\u6307\u5b9a\u5e8f\u53f7\u7684\u53e5\u6bb5\u5e76\u9009\u4e2d\u5b83\u3002\u7528\u4e8e"\u8df3\u5230\u7b2c5\u53e5"\u7b49\u6307\u4ee4\u3002',
    parameters: {
      properties: { segmentIndex: { type: 'integer', description: '\u76ee\u6807\u53e5\u6bb5\u5e8f\u53f7\uff0c\u4ece 1 \u5f00\u59cb', minimum: 1 } },
      required: ['segmentIndex'],
    },
  },
  {
    name: 'nav_to_time',
    description: '\u5c06\u64ad\u653e\u5934\u8df3\u8f6c\u5230\u6307\u5b9a\u65f6\u95f4\u70b9\uff08\u79d2\uff09\u3002\u7528\u4e8e"\u8df3\u523030\u79d2"\u7b49\u6307\u4ee4\u3002',
    parameters: {
      properties: { timeSeconds: { type: 'number', description: '\u76ee\u6807\u65f6\u95f4\u70b9\uff0c\u5355\u4f4d\u79d2', minimum: 0 } },
      required: ['timeSeconds'],
    },
  },
  {
    name: 'play_pause',
    description: '\u5207\u6362\u64ad\u653e/\u6682\u505c\u72b6\u6001\u3002\u65e0\u9700\u53c2\u6570\u3002',
    parameters: { properties: {}, required: [] },
  },

  // ── Segment editing ─────────────────────────────────────────────────────────
  {
    name: 'mark_segment',
    description: '\u5bf9\u5f53\u524d\u53e5\u6bb5\u6216\u6307\u5b9a\u53e5\u6bb5\u8fdb\u884c\u6807\u8bb0\uff08mark\uff09\u3002\u7528\u4e8e"\u6807\u8bb0\u8fd9\u53e5"\u7b49\u6307\u4ee4\u3002',
    parameters: {
      properties: { segmentId: { type: 'string', description: '\u53e5\u6bb5 ID\uff0c\u4e0d\u4f20\u5219\u4f7f\u7528\u5f53\u524d\u9009\u4e2d\u53e5\u6bb5' } },
      required: [],
    },
  },
  {
    name: 'delete_segment',
    description: '\u5220\u9664\u5f53\u524d\u53e5\u6bb5\u6216\u6307\u5b9a\u53e5\u6bb5\u3002\u8c28\u614e\u4f7f\u7528\u3002',
    parameters: {
      properties: { segmentId: { type: 'string', description: '\u53e5\u6bb5 ID\uff0c\u4e0d\u4f20\u5219\u4f7f\u7528\u5f53\u524d\u9009\u4e2d\u53e5\u6bb5' } },
      required: [],
    },
  },
  {
    name: 'split_at_time',
    description: '\u5728\u6307\u5b9a\u65f6\u95f4\u70b9\u5206\u5272\u53e5\u6bb5\u3002\u7528\u4e8e"\u572830\u79d2\u5904\u5206\u5272"\u7b49\u6307\u4ee4\u3002',
    parameters: {
      properties: { timeSeconds: { type: 'number', description: '\u5206\u5272\u65f6\u95f4\u70b9\uff0c\u5355\u4f4d\u79d2', minimum: 0 } },
      required: ['timeSeconds'],
    },
  },
  {
    name: 'merge_prev',
    description: '\u5c06\u5f53\u524d\u53e5\u6bb5\u4e0e\u4e0a\u4e00\u4e2a\u53e5\u6bb5\u5408\u5e76\u3002',
    parameters: {
      properties: { segmentId: { type: 'string', description: '\u53e5\u6bb5 ID\uff0c\u4e0d\u4f20\u5219\u4f7f\u7528\u5f53\u524d\u9009\u4e2d\u53e5\u6bb5' } },
      required: [],
    },
  },
  {
    name: 'merge_next',
    description: '\u5c06\u5f53\u524d\u53e5\u6bb5\u4e0e\u4e0b\u4e00\u4e2a\u53e5\u6bb5\u5408\u5e76\u3002',
    parameters: {
      properties: { segmentId: { type: 'string', description: '\u53e5\u6bb5 ID\uff0c\u4e0d\u4f20\u5219\u4f7f\u7528\u5f53\u524d\u9009\u4e2d\u53e5\u6bb5' } },
      required: [],
    },
  },

  // ── Undo / redo ────────────────────────────────────────────────────────────
  {
    name: 'undo',
    description: '\u64a4\u9500\u4e0a\u4e00\u6b21\u7f16\u8f91\u64cd\u4f5c\u3002\u65e0\u9700\u53c2\u6570\u3002',
    parameters: { properties: {}, required: [] },
  },
  {
    name: 'redo',
    description: '\u91cd\u505a\u4e0a\u4e00\u6b21\u64a4\u9500\u7684\u64cd\u4f5c\u3002\u65e0\u9700\u53c2\u6570\u3002',
    parameters: { properties: {}, required: [] },
  },

  // ── View ────────────────────────────────────────────────────────────────────
  {
    name: 'focus_segment',
    description: '\u5c06\u89c6\u53e3\u6eda\u52a8\u5230\u5e76\u805a\u7126\u6307\u5b9a\u53e5\u6bb5\uff0c\u4f7f\u5176\u53ef\u89c1\u4f46\u4e0d\u6539\u53d8\u9009\u4e2d\u72b6\u6001\u3002',
    parameters: {
      properties: { segmentId: { type: 'string', description: '\u53e5\u6bb5 ID' } },
      required: ['segmentId'],
    },
  },
  {
    name: 'zoom_to_segment',
    description: '\u7f29\u653e\u6ce2\u5f62\u5230\u6307\u5b9a\u53e5\u6bb5\u7684\u65f6\u95f4\u8303\u56f4\u3002\u7528\u4e8e\u4ed4\u7ec6\u67e5\u770b\u67d0\u6bb5\u97f3\u9891\u3002',
    parameters: {
      properties: {
        segmentId: { type: 'string', description: '\u53e5\u6bb5 ID' },
        zoomLevel: { type: 'integer', description: '\u7f29\u653e\u7ea7\u522b 1-20\uff0c\u9ed8\u8ba4 4', minimum: 1, maximum: 20 },
      },
      required: ['segmentId'],
    },
  },
  {
    name: 'toggle_notes',
    description: '\u6253\u5f00\u6216\u5173\u95ed\u5907\u6ce8\u9762\u677f\u3002\u65e0\u9700\u53c2\u6570\u3002',
    parameters: { properties: {}, required: [] },
  },
  {
    name: 'search_segments',
    description: '\u5728\u53e5\u6bb5\u4e2d\u641c\u7d22\u5173\u952e\u8bcd\u3002\u7528\u4e8e"\u641c\u7d22"\u76f8\u5173\u6307\u4ee4\u3002',
    parameters: {
      properties: {
        query: { type: 'string', description: '\u641c\u7d22\u5173\u952e\u8bcd' },
        layers: { type: 'array', items: { type: 'string', enum: ['transcription', 'translation', 'gloss'] }, description: '\u641c\u7d22\u5c42\uff0c\u9ed8\u8ba4\u5168\u90e8' },
      },
      required: ['query'],
    },
  },

  // ── AI assistance ────────────────────────────────────────────────────────────
  {
    name: 'auto_gloss_segment',
    description: '\u5bf9\u5f53\u524d\u53e5\u6bb5\u6216\u6307\u5b9a\u53e5\u6bb5\u8fd0\u884c\u81ea\u52a8\u6807\u6ce8\uff08auto-gloss\uff09\u3002\u7528\u4e8e"\u81ea\u52a8\u6807\u6ce8\u8fd9\u53e5"\u7b49\u6307\u4ee4\u3002',
    parameters: {
      properties: {
        segmentId: { type: 'string', description: '\u53e5\u6bb5 ID\uff0c\u4e0d\u4f20\u5219\u4f7f\u7528\u5f53\u524d\u9009\u4e2d\u53e5\u6bb5' },
        targetLang: { type: 'string', description: '\u76ee\u6807\u6807\u6ce8\u8bed\u8a00\uff08ISO 639-3\uff09\uff0c\u4e0d\u4f20\u5219\u81ea\u52a8\u63a8\u65ad' },
      },
      required: [],
    },
  },
  // ── Context query ───────────────────────────────────────────────────────────
  {
    name: 'get_current_segment',
    description: '\u83b7\u53d6\u5f53\u524d\u53e5\u6bb5\u7684\u8be6\u7ec6\u4fe1\u606f\uff08ID\u3001\u6587\u672c\u3001\u7ffb\u8bd1\u3001\u6807\u6ce8\u72b6\u6001\uff09\u3002\u7528\u4e8e\u786e\u8ba4\u64cd\u4f5c\u76ee\u6807\u3002',
    parameters: { properties: {}, required: [] },
  },
  {
    name: 'get_project_summary',
    description: '\u83b7\u53d6\u5f53\u524d\u9879\u76ee\u6458\u8981\uff08\u53e5\u6bb5\u603b\u6570\u3001\u5b8c\u6210\u7387\u3001\u5f53\u524d\u9636\u6bb5\u3001\u7528\u6237\u753b\u50cf\u63d0\u793a\uff09\u3002',
    parameters: { properties: {}, required: [] },
  },
  {
    name: 'get_recent_history',
    description: '\u83b7\u53d6\u6700\u8fd1\u7684\u8bed\u97f3\u547d\u4ee4\u5386\u53f2\uff08\u6700\u8fd1 8 \u6761\uff09\uff0c\u7528\u4e8e\u7406\u89e3\u7528\u6237\u610f\u56fe\u8d8b\u52bf\u3002',
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
