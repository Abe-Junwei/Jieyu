import { describe, expect, it } from 'vitest';
import { buildTraceContextHeaders } from './traceContextHeaders';

describe('buildTraceContextHeaders', () => {
  it('returns empty headers when traceparent is absent', () => {
    expect(buildTraceContextHeaders()).toEqual({});
    expect(buildTraceContextHeaders({ traceContext: { traceparent: '   ' } })).toEqual({});
  });

  it('accepts valid traceparent and trims tracestate', () => {
    const headers = buildTraceContextHeaders({
      traceContext: {
        traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        tracestate: ' vendor=a ',
      },
    });

    expect(headers).toEqual({
      traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      tracestate: 'vendor=a',
    });
  });

  it('normalizes uppercase traceparent to lowercase', () => {
    const headers = buildTraceContextHeaders({
      traceContext: {
        traceparent: '00-0123456789ABCDEF0123456789ABCDEF-0123456789ABCDEF-01',
      },
    });

    expect(headers.traceparent).toBe('00-0123456789abcdef0123456789abcdef-0123456789abcdef-01');
  });

  it('rejects malformed traceparent value', () => {
    const headers = buildTraceContextHeaders({
      traceContext: {
        traceparent: '00-not-valid-0123456789abcdef-01',
        tracestate: 'vendor=a',
      },
    });

    expect(headers).toEqual({});
  });

  it('rejects all-zero trace id or span id', () => {
    const allZeroTraceId = buildTraceContextHeaders({
      traceContext: {
        traceparent: '00-00000000000000000000000000000000-0123456789abcdef-01',
      },
    });
    const allZeroSpanId = buildTraceContextHeaders({
      traceContext: {
        traceparent: '00-0123456789abcdef0123456789abcdef-0000000000000000-01',
      },
    });

    expect(allZeroTraceId).toEqual({});
    expect(allZeroSpanId).toEqual({});
  });

  it('drops tracestate when value exceeds w3c size limit', () => {
    const oversized = `vendor=${'a'.repeat(513)}`;
    const headers = buildTraceContextHeaders({
      traceContext: {
        traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        tracestate: oversized,
      },
    });

    expect(headers).toEqual({
      traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
    });
  });
});
