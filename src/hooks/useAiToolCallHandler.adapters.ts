import { segmentAdapter } from './useAiToolCallHandler.segmentAdapter';
import { layerAdapter } from './useAiToolCallHandler.layerAdapter';
import { glossAdapter, tokenAdapter } from './useAiToolCallHandler.annotationAdapters';
import { voiceAdapter } from './useAiToolCallHandler.voiceAdapter';
import type { ToolObjectAdapter } from './useAiToolCallHandler.types';

const ALL_ADAPTERS: ToolObjectAdapter[] = [segmentAdapter, layerAdapter, glossAdapter, tokenAdapter, voiceAdapter];

export const AI_TOOL_CALL_ADAPTER_MAP: Partial<Record<string, ToolObjectAdapter>> = {};
for (const adapter of ALL_ADAPTERS) {
  for (const toolName of adapter.handles) {
    AI_TOOL_CALL_ADAPTER_MAP[toolName] = adapter;
  }
}
