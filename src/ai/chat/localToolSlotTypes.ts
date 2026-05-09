import type {
  AiSessionMemoryLocalSemanticFrame,
  LocalToolClarificationReason,
  LocalToolIntent,
  LocalToolMetric,
  LocalUnitScope,
} from './chatDomain.types';
import type { LocalContextToolCall } from './localContextTools';

export type LocalToolStatePatch = {
  lastIntent?: LocalToolIntent;
  lastQuery?: string;
  lastResultUnitIds?: string[];
  lastScope?: LocalUnitScope;
  lastFrame?: AiSessionMemoryLocalSemanticFrame;
  /** When true, drop persisted lastQuery (e.g. after list-all). */
  clearLastQuery?: boolean;
};

export type ResolveLocalToolCallsOutput = {
  calls: LocalContextToolCall[];
};

export type LocalToolQueryFamily =
  | 'count'
  | 'search'
  | 'detail'
  | 'list'
  | 'selection'
  | 'quality'
  | 'unknown';

export interface LocalToolRoutingPlan {
  queryFamily: LocalToolQueryFamily;
  selectedTools: string[];
  scope: LocalUnitScope;
  requestedMetric?: LocalToolMetric;
  clarificationNeeded?: boolean;
}

export type LocalToolClarificationNeed =
  | {
      needed: true;
      reason: LocalToolClarificationReason;
      callName: LocalContextToolCall['name'];
    }
  | {
      needed: false;
    };
