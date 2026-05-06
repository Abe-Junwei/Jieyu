/**
 * PR-15: MCP Server 只读工具定义（初版 mock 实现）
 *
 * 三个工具：
 * 1. jieyu_list_segments   — 列出语段摘要
 * 2. jieyu_get_segment_detail — 获取单个语段详情
 * 3. jieyu_diagnose_quality — 项目质量诊断
 *
 * 均为只读；任何写请求在 server 层直接返回 not_supported。
 */

import type { McpToolDefinition, McpToolHandler } from './types';

export const JIEYU_LIST_SEGMENTS_TOOL: McpToolDefinition = {
  name: 'jieyu_list_segments',
  description: 'List segment summaries in the current project. Returns id, startTime, endTime, and a preview of source text.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Maximum number of segments to return (default 20, max 100)' },
      offset: { type: 'number', description: 'Offset for pagination (default 0)' },
    },
  },
};

export const JIEYU_GET_SEGMENT_DETAIL_TOOL: McpToolDefinition = {
  name: 'jieyu_get_segment_detail',
  description: 'Get full detail of a single segment including layers, annotations, and translations.',
  inputSchema: {
    type: 'object',
    properties: {
      segmentId: { type: 'string', description: 'The segment identifier' },
    },
    required: ['segmentId'],
  },
};

export const JIEYU_DIAGNOSE_QUALITY_TOOL: McpToolDefinition = {
  name: 'jieyu_diagnose_quality',
  description: 'Diagnose project data quality: coverage gaps, missing speakers, untranscribed segments, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['project', 'current_media'],
        description: 'Scope of the diagnosis (default: project)',
      },
    },
  },
};

export const READ_ONLY_TOOLS: McpToolDefinition[] = [
  JIEYU_LIST_SEGMENTS_TOOL,
  JIEYU_GET_SEGMENT_DETAIL_TOOL,
  JIEYU_DIAGNOSE_QUALITY_TOOL,
];

// ── Mock handlers (P1b: wired to static fixtures; P2+ can integrate Dexie queries) ──

const listSegmentsHandler: McpToolHandler = (args) => {
  const limit = Math.min(100, Math.max(1, typeof args.limit === 'number' ? args.limit : 20));
  const offset = Math.max(0, typeof args.offset === 'number' ? args.offset : 0);

  const mockSegments = Array.from({ length: limit }, (_, i) => ({
    id: `seg-${String(offset + i + 1).padStart(3, '0')}`,
    startTime: `${(offset + i) * 5}.000`,
    endTime: `${(offset + i) * 5 + 4.999}`,
    sourceTextPreview: `Sample source text for segment ${offset + i + 1}`,
  }));

  return {
    content: [
      { type: 'text', text: JSON.stringify({ segments: mockSegments, total: 1000 }, null, 2) },
    ],
  };
};

const getSegmentDetailHandler: McpToolHandler = (args) => {
  const segmentId = String(args.segmentId ?? '');
  if (!segmentId) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'segmentId is required' }, null, 2) }],
      isError: true,
    };
  }

  const detail = {
    id: segmentId,
    startTime: '0.000',
    endTime: '4.999',
    sourceText: 'Sample source text content.',
    layers: [
      { layerId: 'layer-gloss', type: 'gloss', text: 'sample gloss' },
      { layerId: 'layer-trans', type: 'translation', text: 'sample translation' },
    ],
    annotations: [
      { category: 'pos', value: 'noun', start: 0, end: 6 },
    ],
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(detail, null, 2) }],
  };
};

const diagnoseQualityHandler: McpToolHandler = (args) => {
  const scope = args.scope === 'current_media' ? 'current_media' : 'project';

  const diagnosis = {
    scope,
    summary: {
      totalSegments: 1000,
      transcribedSegments: 980,
      untranscribedSegments: 20,
      segmentsWithSpeaker: 950,
      segmentsMissingSpeaker: 50,
      translationLayers: 3,
    },
    recommendations: [
      '20 segments remain untranscribed; consider batch transcription.',
      '50 segments are missing speaker labels; review speaker assignment.',
    ],
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(diagnosis, null, 2) }],
  };
};

export const TOOL_HANDLERS: Record<string, McpToolHandler> = {
  [JIEYU_LIST_SEGMENTS_TOOL.name]: listSegmentsHandler,
  [JIEYU_GET_SEGMENT_DETAIL_TOOL.name]: getSegmentDetailHandler,
  [JIEYU_DIAGNOSE_QUALITY_TOOL.name]: diagnoseQualityHandler,
};
