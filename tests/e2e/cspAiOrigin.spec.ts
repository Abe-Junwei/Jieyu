/**
 * BF3-1：CSP 放行本机 Ollama 和用户设置的那一个 AI 源，其它源仍被拦截。
 * BF3-1: the CSP allows local Ollama and the one AI origin the user set; other origins stay blocked.
 */
import { expect, test, type Page } from '@playwright/test';

const OLLAMA = ['http://localhost:11434', 'http://127.0.0.1:11434'];
const CUSTOM = 'https://llm.example.org:8443';
const OTHER = 'https://other.example.net';

async function probe(page: Page, stored: string | null): Promise<Record<string, string>> {
  for (const host of [...OLLAMA, CUSTOM, OTHER]) {
    await page.route(`${host}/**`, (route) =>
      route.fulfill({ status: 200, body: 'ok', headers: { 'access-control-allow-origin': '*' } }),
    );
  }
  if (stored !== null) {
    await page.addInitScript((value) => localStorage.setItem('jieyu.csp.aiOrigin', value), stored);
  }
  await page.goto('/');
  return page.evaluate(async (urls) => {
    const out: Record<string, string> = {};
    for (const url of urls) {
      out[url] = await fetch(`${url}/v1/models`).then(
        () => 'ok',
        () => 'blocked',
      );
    }
    return out;
  }, [...OLLAMA, CUSTOM, OTHER]);
}

test('Ollama and the stored AI origin are allowed, others blocked', async ({ page }) => {
  expect(await probe(page, CUSTOM)).toEqual({
    [OLLAMA[0]!]: 'ok',
    [OLLAMA[1]!]: 'ok',
    [CUSTOM]: 'ok',
    [OTHER]: 'blocked',
  });
});

test('without a stored origin, or with a wildcard, the policy stays strict', async ({ page }) => {
  const strict = { [OLLAMA[0]!]: 'ok', [OLLAMA[1]!]: 'ok', [CUSTOM]: 'blocked', [OTHER]: 'blocked' };
  expect(await probe(page, null)).toEqual(strict);
  expect(await probe(page, 'https://*.example.org')).toEqual(strict);
});
