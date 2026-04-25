import { describe, expect, it } from 'vitest';
import { deepScrubPlainObjectForObservability } from './logger';
import { scrubOtelSpanAttributes } from './otel';
import { scrubUnknownForSentry } from './sentry';

describe('observability sensitive key policy', () => {
  it('scrubs a fixed payload consistently across logger / otel / sentry', () => {
    const payload = {
      apiKey: 'sk-live-123456',
      token: 'tok_secret_abcdef',
      nested: {
        authorization: 'Bearer very-secret-token',
      },
      urlFull: 'https://api.example.com/chat?token=abcd&safe=yes',
      safe: 'ok',
    };

    const loggerScrubbed = deepScrubPlainObjectForObservability(payload);
    expect(JSON.stringify(loggerScrubbed)).not.toContain('sk-live-123456');
    expect(JSON.stringify(loggerScrubbed)).not.toContain('tok_secret_abcdef');
    expect(JSON.stringify(loggerScrubbed)).toContain('token=[REDACTED]');
    expect(loggerScrubbed.safe).toBe('ok');

    const sentryScrubbed = scrubUnknownForSentry(payload) as Record<string, unknown>;
    expect(JSON.stringify(sentryScrubbed)).not.toContain('sk-live-123456');
    expect(JSON.stringify(sentryScrubbed)).not.toContain('very-secret-token');
    expect(JSON.stringify(sentryScrubbed)).toContain('token=[REDACTED]');

    const otelAttrs: Record<string, unknown> = {
      apiKey: 'sk-live-123456',
      prompt: 'plain prompt body',
      urlFull: 'https://api.example.com/chat?token=abcd&safe=yes',
      safe: 'ok',
    };
    scrubOtelSpanAttributes(otelAttrs);
    expect(otelAttrs.apiKey).toBe('[REDACTED]');
    expect(otelAttrs.prompt).toBe('len:17');
    expect(otelAttrs.urlFull).toBe('https://api.example.com/chat?token=[REDACTED]&safe=yes');
    expect(otelAttrs.safe).toBe('ok');
  });
});
