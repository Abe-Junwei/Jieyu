import type { ChatRequestOptions } from './LLMProvider';

const W3C_TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ALL_ZERO_TRACE_ID = '00000000000000000000000000000000';
const ALL_ZERO_SPAN_ID = '0000000000000000';
const MAX_TRACESTATE_BYTES = 512;

function isValidTraceparent(value: string): boolean {
  const match = W3C_TRACEPARENT_RE.exec(value);
  if (!match) return false;
  const [, traceId, spanId] = match;
  return traceId !== ALL_ZERO_TRACE_ID && spanId !== ALL_ZERO_SPAN_ID;
}

function isTracestateWithinLimit(value: string): boolean {
  return new TextEncoder().encode(value).byteLength <= MAX_TRACESTATE_BYTES;
}

export function buildTraceContextHeaders(options?: ChatRequestOptions): Record<string, string> {
  const rawTraceparent = options?.traceContext?.traceparent?.trim();
  if (!rawTraceparent) {
    return {};
  }
  const traceparent = rawTraceparent.toLowerCase();
  if (!isValidTraceparent(traceparent)) {
    return {};
  }

  const rawTracestate = options?.traceContext?.tracestate?.trim();
  const tracestate = rawTracestate && isTracestateWithinLimit(rawTracestate)
    ? rawTracestate
    : undefined;

  return {
    traceparent,
    ...(tracestate ? { tracestate } : {}),
  };
}