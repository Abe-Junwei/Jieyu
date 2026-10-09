/** 规范化编码往返 | Canonical encoding round trip */
import { describe, expect, it } from 'vitest';
import { canonicalSha256, fromTaggedTree, toCanonicalJson, toTaggedTree } from './canonicalValue';

describe('canonical value encoding', () => {
  it('is independent of key order', async () => {
    expect(await toCanonicalJson({ b: 1, a: 2 })).toBe(await toCanonicalJson({ a: 2, b: 1 }));
    expect(await canonicalSha256({ b: 1, a: 2 })).toBe(await canonicalSha256({ a: 2, b: 1 }));
  });

  it('round-trips structured-clone types', async () => {
    const value = {
      n: Number.NaN,
      inf: Number.POSITIVE_INFINITY,
      u: undefined,
      d: new Date('2026-10-09T01:02:03.000Z'),
      bytes: new Uint16Array([1, 65535]),
      buffer: new Uint8Array([4, 5]).buffer,
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
      map: new Map([['k', 1]]),
      set: new Set(['x']),
      dollar: { $date: 'not a date', plain: 1 },
      list: [null, 'ж', { z: true }],
    };
    const back = fromTaggedTree(
      JSON.parse(JSON.stringify(await toTaggedTree(value))),
    ) as typeof value;
    expect(Number.isNaN(back.n)).toBe(true);
    expect(back.inf).toBe(Number.POSITIVE_INFINITY);
    expect('u' in back && back.u === undefined).toBe(true);
    expect(back.d.toISOString()).toBe('2026-10-09T01:02:03.000Z');
    expect([...back.bytes]).toEqual([1, 65535]);
    expect(back.bytes).toBeInstanceOf(Uint16Array);
    expect(new Uint8Array(back.buffer)).toEqual(new Uint8Array([4, 5]));
    expect(back.blob.type).toBe('audio/wav');
    expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(back.map.get('k')).toBe(1);
    expect(back.set.has('x')).toBe(true);
    expect(back.dollar).toEqual({ $date: 'not a date', plain: 1 });
    expect(back.list).toEqual([null, 'ж', { z: true }]);
    expect(await canonicalSha256(back)).toBe(await canonicalSha256(value));
  });
});
