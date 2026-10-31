import { expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '::1', family: 6 }]),
}));

import { assertLoopbackUrl } from './modelHost';

it('pins an IPv6 loopback answer onto the request URL', async () => {
  const url = await assertLoopbackUrl('http://model.example.test:8080');
  expect(url.hostname).toBe('[::1]');
  expect(url.href).toBe('http://[::1]:8080/');
});
