// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACOUSTIC_PROVIDER_STORAGE_KEYS, persistAcousticProviderRuntimeConfig, probeExternalAcousticProviderHealth, resolveAcousticProviderRuntimeConfig } from './acousticProviderContract';

describe('acousticProviderContract', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    persistAcousticProviderRuntimeConfig({
      routingStrategy: 'local-first',
      externalProvider: {
        enabled: false,
        timeoutMs: 10_000,
      },
    });
    window.localStorage.clear();
  });

  it('persists and resolves runtime config with normalized values', () => {
    const persisted = persistAcousticProviderRuntimeConfig({
      routingStrategy: 'prefer-external',
      externalProvider: {
        enabled: true,
        endpoint: '  https://provider.example.dev/analyze  ',
        apiKey: '  secret-key  ',
        timeoutMs: 120,
      },
    });

    expect(persisted.routingStrategy).toBe('prefer-external');
    expect(persisted.externalProvider.enabled).toBe(true);
    expect(persisted.externalProvider.endpoint).toBe('https://provider.example.dev/analyze');
    expect(persisted.externalProvider.apiKey).toBe('secret-key');
    expect(persisted.externalProvider.timeoutMs).toBe(500);

    const resolved = resolveAcousticProviderRuntimeConfig();
    expect(resolved).toEqual(persisted);
    expect(window.localStorage.getItem(ACOUSTIC_PROVIDER_STORAGE_KEYS.routingStrategy)).toBe('prefer-external');
    expect(window.localStorage.getItem(ACOUSTIC_PROVIDER_STORAGE_KEYS.externalEnabled)).toBe('true');
    expect(window.localStorage.getItem(ACOUSTIC_PROVIDER_STORAGE_KEYS.externalApiKey)).toBeNull();
  });

  it('rejects non-https endpoints and allows localhost http for development', () => {
    expect(() => persistAcousticProviderRuntimeConfig({
      routingStrategy: 'prefer-external',
      externalProvider: {
        enabled: true,
        endpoint: 'http://provider.example.dev/analyze',
        timeoutMs: 2000,
      },
    })).toThrow(/HTTPS/i);

    const localhostPersisted = persistAcousticProviderRuntimeConfig({
      routingStrategy: 'prefer-external',
      externalProvider: {
        enabled: true,
        endpoint: 'http://localhost:8787/analyze',
        timeoutMs: 2000,
      },
    });

    expect(localhostPersisted.externalProvider.endpoint).toBe('http://localhost:8787/analyze');
  });

  it('classifies unauthorized and forbidden probe responses', async () => {
    const runtimeConfig = {
      routingStrategy: 'prefer-external' as const,
      externalProvider: {
        enabled: true,
        endpoint: 'https://provider.example.dev/analyze',
        timeoutMs: 2000,
      },
    };

    const unauthorized = await probeExternalAcousticProviderHealth({
      runtimeConfig,
      fetchImpl: async () => new Response(null, { status: 401 }),
    });
    expect(unauthorized.state).toBe('unauthorized');
    expect(unauthorized.available).toBe(false);

    const forbidden = await probeExternalAcousticProviderHealth({
      runtimeConfig,
      fetchImpl: async () => new Response(null, { status: 403 }),
    });
    expect(forbidden.state).toBe('forbidden');
    expect(forbidden.available).toBe(false);
  });

  it('treats 405 as reachable for post-only external endpoints', async () => {
    const runtimeConfig = {
      routingStrategy: 'prefer-external' as const,
      externalProvider: {
        enabled: true,
        endpoint: 'https://provider.example.dev/analyze',
        timeoutMs: 2000,
      },
    };

    const methodNotAllowed = await probeExternalAcousticProviderHealth({
      runtimeConfig,
      fetchImpl: async () => new Response(null, { status: 405 }),
    });

    expect(methodNotAllowed.state).toBe('available');
    expect(methodNotAllowed.available).toBe(true);
    expect(methodNotAllowed.status).toBe(405);
  });

  it('returns disabled and unconfigured states without network calls', async () => {
    const disabled = await probeExternalAcousticProviderHealth({
      runtimeConfig: {
        routingStrategy: 'local-first',
        externalProvider: {
          enabled: false,
          timeoutMs: 2000,
        },
      },
      fetchImpl: async () => {
        throw new Error('fetch should not be called for disabled runtime');
      },
    });
    expect(disabled.state).toBe('disabled');

    const unconfigured = await probeExternalAcousticProviderHealth({
      runtimeConfig: {
        routingStrategy: 'prefer-external',
        externalProvider: {
          enabled: true,
          timeoutMs: 2000,
        },
      },
      fetchImpl: async () => {
        throw new Error('fetch should not be called for unconfigured runtime');
      },
    });
    expect(unconfigured.state).toBe('unconfigured');

    const invalidEndpoint = await probeExternalAcousticProviderHealth({
      runtimeConfig: {
        routingStrategy: 'prefer-external',
        externalProvider: {
          enabled: true,
          endpoint: 'http://provider.example.dev/analyze',
          timeoutMs: 2000,
        },
      },
      fetchImpl: async () => {
        throw new Error('fetch should not be called for invalid endpoint');
      },
    });
    expect(invalidEndpoint.state).toBe('unconfigured');
  });

  it('classifies timeout, network error, and aborted probes', async () => {
    const runtimeConfig = {
      routingStrategy: 'prefer-external' as const,
      externalProvider: {
        enabled: true,
        endpoint: 'https://provider.example.dev/analyze',
        timeoutMs: 500,
      },
    };

    const timeout = await probeExternalAcousticProviderHealth({
      runtimeConfig,
      fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted by timeout', 'AbortError'));
        }, { once: true });
      }),
    });
    expect(timeout.state).toBe('timeout');

    const network = await probeExternalAcousticProviderHealth({
      runtimeConfig,
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    expect(network.state).toBe('network-error');

    const controller = new AbortController();
    controller.abort();
    const aborted = await probeExternalAcousticProviderHealth({
      runtimeConfig,
      signal: controller.signal,
      fetchImpl: async () => {
        throw new Error('fetch should not be called for already-aborted signal');
      },
    });
    expect(aborted.state).toBe('aborted');
  });

  it('classifies http-error and unknown-error probes', async () => {
    const runtimeConfig = {
      routingStrategy: 'prefer-external' as const,
      externalProvider: {
        enabled: true,
        endpoint: 'https://provider.example.dev/analyze',
        timeoutMs: 2000,
      },
    };

    const httpError = await probeExternalAcousticProviderHealth({
      runtimeConfig,
      fetchImpl: async () => new Response(null, { status: 502 }),
    });
    expect(httpError.state).toBe('http-error');
    expect(httpError.available).toBe(false);
    expect(httpError.status).toBe(502);

    const unknownError = await probeExternalAcousticProviderHealth({
      runtimeConfig,
      fetchImpl: async () => {
        throw new Error('provider runtime exploded');
      },
    });
    expect(unknownError.state).toBe('unknown-error');
    expect(unknownError.available).toBe(false);
    expect(unknownError.message).toContain('provider runtime exploded');
  });
});
