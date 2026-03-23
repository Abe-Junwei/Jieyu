// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  AiProviderError,
  normalizeAiProviderError,
  parseProviderJson,
  throwProviderHttpError,
} from './errorUtils';

describe('errorUtils', () => {
  it('maps common HTTP status codes to provider-friendly messages', async () => {
    await expect(
      throwProviderHttpError('OpenAI Compatible', new Response('invalid api key', { status: 401 }), 'failed'),
    ).rejects.toMatchObject({ code: 'auth' });

    await expect(
      throwProviderHttpError('OpenAI Compatible', new Response('quota exceeded', { status: 429 }), 'failed'),
    ).rejects.toMatchObject({ code: 'rate-limit' });

    await expect(
      throwProviderHttpError('OpenAI Compatible', new Response('upstream unavailable', { status: 500 }), 'failed'),
    ).rejects.toMatchObject({ code: 'server' });
  });

  it('maps malformed JSON payload to format error', () => {
    expect(() => parseProviderJson('{bad json', 'OpenAI Compatible', 'OpenAI SSE'))
      .toThrowError(AiProviderError);

    try {
      parseProviderJson('{bad json', 'OpenAI Compatible', 'OpenAI SSE');
    } catch (error) {
      const aiError = error as AiProviderError;
      expect(aiError.code).toBe('format');
      expect(aiError.message).toContain('返回格式无法解析');
    }
  });

  it('normalizes network and abort errors', () => {
    const network = normalizeAiProviderError(new TypeError('Failed to fetch'), 'OpenAI Compatible');
    expect(network).toContain('网络连接失败');

    const aborted = normalizeAiProviderError(new DOMException('aborted', 'AbortError'), 'OpenAI Compatible');
    expect(aborted).toContain('请求已取消');
  });

  it('keeps provider label on generic errors', () => {
    const message = normalizeAiProviderError(new Error('远程模型未返回可读流'), 'OpenAI Compatible');
    expect(message).toContain('OpenAI Compatible');
    expect(message).toContain('远程模型未返回可读流');
  });
});
