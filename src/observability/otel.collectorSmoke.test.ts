import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { initOtelWithResolvedConfig } from './otel';

type StartedCollector = {
  readonly port: number;
  readonly hits: number;
  readonly lastPayload: Buffer | null;
  close: () => Promise<void>;
};

async function startCollector(): Promise<StartedCollector> {
  let hits = 0;
  let lastPayload: Buffer | null = null;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'POST' && req.url === '/v1/traces') {
      let bodySize = 0;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        bodySize += chunk.length;
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (bodySize > 0) {
          hits += 1;
          lastPayload = Buffer.concat(chunks);
        }
        res.statusCode = 200;
        res.end('ok');
      });
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('collector address not available');
  }

  return {
    port: address.port,
    get hits() {
      return hits;
    },
    get lastPayload() {
      return lastPayload;
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

const otelSmokeEnabled = process.env.JIEYU_OTEL_SMOKE === '1';
const itIfOtelSmoke = otelSmokeEnabled ? it : it.skip;

describe('otel collector smoke', () => {
  let collector: StartedCollector | null = null;
  let providerRef: { forceFlush?: () => Promise<void>; shutdown?: () => Promise<void> } | null = null;
  let exportedSpans: Array<{
    name?: string;
    status?: { code?: number; message?: string };
    attributes?: Record<string, unknown>;
    resource?: { attributes?: Record<string, unknown> };
  }> = [];

  afterEach(async () => {
    await providerRef?.shutdown?.();
    providerRef = null;
    exportedSpans = [];
    if (collector) {
      await collector.close();
      collector = null;
    }
  });

  itIfOtelSmoke('exports contract payload to local collector', async () => {
    collector = await startCollector();

    const sdkWeb = await import('@opentelemetry/sdk-trace-web');
    const sdkBase = await import('@opentelemetry/sdk-trace-base');
    const otlp = await import('@opentelemetry/exporter-trace-otlp-http');
    const resources = await import('@opentelemetry/resources');
    const semantics = await import('@opentelemetry/semantic-conventions');

    class CapturingWebTracerProvider extends sdkWeb.WebTracerProvider {
      constructor(config?: ConstructorParameters<typeof sdkWeb.WebTracerProvider>[0]) {
        super(config);
        providerRef = this;
      }
    }

    class CapturingOTLPTraceExporter {
      private readonly inner: InstanceType<typeof otlp.OTLPTraceExporter>;

      constructor(config?: ConstructorParameters<typeof otlp.OTLPTraceExporter>[0]) {
        this.inner = new otlp.OTLPTraceExporter(config);
      }

      export(...args: Parameters<InstanceType<typeof otlp.OTLPTraceExporter>['export']>) {
        const [spans] = args;
        exportedSpans.push(...(spans as typeof exportedSpans));
        return this.inner.export(...args);
      }

      shutdown(...args: Parameters<InstanceType<typeof otlp.OTLPTraceExporter>['shutdown']>) {
        return this.inner.shutdown(...args);
      }

      forceFlush(...args: Parameters<NonNullable<InstanceType<typeof otlp.OTLPTraceExporter>['forceFlush']>>) {
        return this.inner.forceFlush?.(...args);
      }
    }

    await initOtelWithResolvedConfig(
      {
        enabled: true,
        endpoint: `http://127.0.0.1:${collector.port}/v1/traces`,
        serviceName: 'jieyu-otel-smoke',
        environment: 'smoke-test',
        tracesSampleRate: 1,
      },
      async () => ({
        sdkWeb: { ...sdkWeb, WebTracerProvider: CapturingWebTracerProvider },
        sdkBase,
        otlp: { ...otlp, OTLPTraceExporter: CapturingOTLPTraceExporter },
        resources,
        semantics,
      }),
    );

    const tracer = trace.getTracer('jieyu-otel-smoke');
    const span = tracer.startSpan('smoke-span');
    span.setAttribute('apiKey', 'sk-secret-1234');
    span.setAttribute('prompt', 'raw prompt must be scrubbed');
    span.setAttribute('urlFull', 'https://api.example.com/chat?token=abcd&safe=yes');
    span.setAttribute('gen_ai.jieyu.tool_name', 'tool_slot_resolver');
    span.end();

    const errorSpan = tracer.startSpan('smoke-error-span');
    errorSpan.recordException(new Error('smoke forced error'));
    errorSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'smoke-error-status' });
    errorSpan.end();

    await providerRef?.forceFlush?.();

    const deadline = Date.now() + 8_000;
    while (collector.hits < 1 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(collector.hits).toBeGreaterThan(0);
    expect(collector.lastPayload).not.toBeNull();
    const payloadText = collector.lastPayload?.toString('utf8') ?? '';
    expect(payloadText).toContain('smoke-span');
    expect(payloadText).toContain('jieyu-otel-smoke');
    expect(payloadText).toContain('smoke-test');
    expect(payloadText).toContain('[REDACTED]');
    expect(payloadText).toContain('len:27');
    expect(payloadText).toContain('token=[REDACTED]');
    expect(payloadText).toContain('gen_ai.jieyu.tool_name');
    expect(payloadText).not.toContain('sk-secret-1234');
    expect(payloadText).not.toContain('raw prompt must be scrubbed');

    expect(exportedSpans.length).toBeGreaterThan(0);
    const normalSpan = exportedSpans.find((item) => item.name === 'smoke-span');
    const failedSpan = exportedSpans.find((item) => item.name === 'smoke-error-span');
    expect(normalSpan).toBeDefined();
    expect(failedSpan).toBeDefined();

    const resourceAttrs = normalSpan?.resource?.attributes ?? {};
    expect(resourceAttrs['service.name']).toBe('jieyu-otel-smoke');
    expect(
      resourceAttrs['deployment.environment.name'] ?? resourceAttrs['deployment.environment'],
    ).toBe('smoke-test');
    expect(normalSpan?.attributes?.['gen_ai.jieyu.tool_name']).toBe('tool_slot_resolver');
    expect(failedSpan?.status?.code).toBe(SpanStatusCode.ERROR);
    expect(failedSpan?.status?.message).toBe('smoke-error-status');
  }, 20_000);
});
