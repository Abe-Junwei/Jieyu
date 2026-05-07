/**
 * PR-15 + PR-P0-2: MCP Server 只读工具定义
 *
 * 三个工具：
 * 1. jieyu_list_segments   — 列出语段摘要
 * 2. jieyu_get_segment_detail — 获取单个语段详情
 * 3. jieyu_diagnose_quality — 项目质量诊断
 *
 * 均为只读；任何写请求在 server 层直接返回 not_supported。
 * 工具 handler 消费 segmentReadQueries 门面，查询真实 Dexie 数据。
 */

import type { McpToolDefinition, McpToolHandler, McpServerRuntimeContext, McpToolCallResult } from './types';
import {
  listSegmentSummaries,
  getSegmentDetail,
  diagnoseProjectQuality,
  type SegmentReadQueryScope,
} from '../../queries/segmentReadQueries';

function buildSegmentReadScopeFromMcpRuntime(runtimeContext?: McpServerRuntimeContext): SegmentReadQueryScope {
  return {
    ...(runtimeContext?.textId?.trim() ? { textId: runtimeContext.textId.trim() } : {}),
    ...(runtimeContext?.currentMediaId?.trim() ? { mediaId: runtimeContext.currentMediaId.trim() } : {}),
    ...(runtimeContext?.currentLayerId?.trim() ? { layerId: runtimeContext.currentLayerId.trim() } : {}),
  };
}

function hasNonEmptySegmentReadScope(scope: SegmentReadQueryScope): boolean {
  return Boolean(scope.textId?.trim() || scope.mediaId?.trim() || scope.layerId?.trim());
}

function mcpSegmentReadScopeRequiredError(): McpToolCallResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            error: 'SEGMENT_READ_SCOPE_REQUIRED',
            message:
              'Jieyu MCP tools require runtime scope: set at least one of textId (workspace text), currentMediaId, or currentLayerId in McpServerRuntimeContext before calling read tools. Empty scope is rejected to avoid unbounded database reads.',
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

export const JIEYU_LIST_SEGMENTS_TOOL: McpToolDefinition = {
  name: 'jieyu_list_segments',
  description:
    'List segment summaries in the current project. Returns id, startTime, endTime, and a preview of source text. Requires McpServerRuntimeContext with at least one of textId, currentMediaId, or currentLayerId.',
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
  description:
    'Get full detail of a single segment including layers, annotations, and translations. Requires McpServerRuntimeContext with at least one of textId, currentMediaId, or currentLayerId.',
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
  description:
    'Diagnose project data quality: coverage gaps, missing speakers, untranscribed segments, etc. Requires McpServerRuntimeContext with at least one of textId, currentMediaId, or currentLayerId. Note: default scope `project` does not narrow by currentMediaId (only `scope: current_media` adds mediaId from runtime); project-wide diagnosis still needs textId or layerId when media-only context would otherwise be empty.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['project', 'current_media'],
        description:
          'Diagnosis breadth: `project` uses textId/layerId from runtime only (not currentMediaId). Use `current_media` to include currentMediaId in the segment-read scope.',
      },
    },
  },
};

export const READ_ONLY_TOOLS: McpToolDefinition[] = [
  JIEYU_LIST_SEGMENTS_TOOL,
  JIEYU_GET_SEGMENT_DETAIL_TOOL,
  JIEYU_DIAGNOSE_QUALITY_TOOL,
];

// ── Real query handlers (via segmentReadQueries facade) ──

const listSegmentsHandler: McpToolHandler = async (args, runtimeContext) => {
  const limit = Math.min(100, Math.max(1, typeof args.limit === 'number' ? args.limit : 20));
  const offset = Math.max(0, typeof args.offset === 'number' ? args.offset : 0);

  const scope = buildSegmentReadScopeFromMcpRuntime(runtimeContext);
  if (!hasNonEmptySegmentReadScope(scope)) {
    return mcpSegmentReadScopeRequiredError();
  }
  const result = await listSegmentSummaries(scope, limit, offset);

  return {
    content: [
      { type: 'text', text: JSON.stringify(result, null, 2) },
    ],
  };
};

const getSegmentDetailHandler: McpToolHandler = async (args, runtimeContext) => {
  const segmentId = String(args.segmentId ?? '');
  if (!segmentId) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'segmentId is required' }, null, 2) }],
      isError: true,
    };
  }

  const scope = buildSegmentReadScopeFromMcpRuntime(runtimeContext);
  if (!hasNonEmptySegmentReadScope(scope)) {
    return mcpSegmentReadScopeRequiredError();
  }
  const detail = await getSegmentDetail(segmentId, scope);

  if (!detail) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `Segment not found: ${segmentId}` }, null, 2) }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(detail, null, 2) }],
  };
};

const diagnoseQualityHandler: McpToolHandler = async (args, runtimeContext) => {
  // Match segmentReadQueries expectations: mediaId only when explicitly scoped to current_media.
  const scope: SegmentReadQueryScope = {
    ...(runtimeContext?.textId?.trim() ? { textId: runtimeContext.textId.trim() } : {}),
    ...(runtimeContext?.currentLayerId?.trim() ? { layerId: runtimeContext.currentLayerId.trim() } : {}),
    ...(args.scope === 'current_media' && runtimeContext?.currentMediaId?.trim()
      ? { mediaId: runtimeContext.currentMediaId.trim() }
      : {}),
  };
  if (!hasNonEmptySegmentReadScope(scope)) {
    return mcpSegmentReadScopeRequiredError();
  }
  const diagnosis = await diagnoseProjectQuality(scope);

  if (!diagnosis) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Quality diagnosis unavailable' }, null, 2) }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(diagnosis, null, 2) }],
  };
};

export const TOOL_HANDLERS: Record<string, McpToolHandler> = {
  [JIEYU_LIST_SEGMENTS_TOOL.name]: listSegmentsHandler,
  [JIEYU_GET_SEGMENT_DETAIL_TOOL.name]: getSegmentDetailHandler,
  [JIEYU_DIAGNOSE_QUALITY_TOOL.name]: diagnoseQualityHandler,
};
