// @vitest-environment jsdom
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importFromEaf, type EafImportResult } from './EafService';
import { isEafContentAnchor, isEafDateTier } from '../utils/eafTierPick';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function assertFiniteTimes(result: EafImportResult): void {
  const rows = [
    ...result.units,
    ...(result.userNotes ?? []),
    ...[...result.translationTiers.values()].flat(),
  ];
  for (const row of rows) {
    expect(Number.isFinite(row.startTime)).toBe(true);
    expect(Number.isFinite(row.endTime)).toBe(true);
  }
}

function importOrError(xml: string): EafImportResult | Error {
  try {
    return importFromEaf(xml);
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
}

const xmlToken = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 .+-{:,'.split('')), {
    maxLength: 16,
  })
  .map((chars) => chars.join(''));

function eafDocument(
  timeA: string,
  timeB: string,
  propertyBody: string,
  utterance: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT>
  <HEADER>
    <MEDIA_DESCRIPTOR MEDIA_URL="clip.wav" MIME_TYPE="audio/wav"/>
    <PROPERTY NAME="jieyu:project-meta:timeline">${propertyBody}</PROPERTY>
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="${timeA}"/>
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="${timeB}"/>
  </TIME_ORDER>
  <TIER TIER_ID="utterance">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>${utterance}</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
</ANNOTATION_DOCUMENT>`;
}

describe('importFromEaf properties', () => {
  it('returns a result or an Error for any string, and times stay finite', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2_000 }), (xml) => {
        const outcome = importOrError(xml);
        if (outcome instanceof Error) return;
        assertFiniteTimes(outcome);
      }),
      { numRuns: 80 },
    );
  });

  it('drops non-finite time slots and still imports when header JSON is garbage', () => {
    fc.assert(
      fc.property(
        xmlToken,
        xmlToken,
        xmlToken,
        xmlToken,
        (timeA, timeB, propertyBody, utterance) => {
          const outcome = importOrError(eafDocument(timeA, timeB, propertyBody, utterance));
          expect(outcome).not.toBeInstanceOf(Error);
          if (outcome instanceof Error) return;
          assertFiniteTimes(outcome);
          const bothFinite =
            Number.isFinite(parseInt(timeA, 10)) && Number.isFinite(parseInt(timeB, 10));
          const anchor = isEafContentAnchor([utterance]);
          const dateTier = isEafDateTier([utterance]);
          expect(outcome.units.length).toBe(bothFinite && !dateTier ? 1 : 0);
          if (!bothFinite || dateTier) return;
          expect(outcome.units[0]?.startTime).toBe(parseInt(timeA, 10) / 1000);
          expect(outcome.units[0]?.endTime).toBe(parseInt(timeB, 10) / 1000);
          expect(outcome.units[0]?.transcription).toBe(anchor ? '' : utterance);
          if (anchor) {
            expect(outcome.userNotes?.some((note) => note.text === utterance)).toBe(true);
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it('ignores a TIME_VALUE that is not a finite integer', () => {
    const xml = eafDocument('nope', '1000', 'not-json', 'hi');
    const result = importFromEaf(xml);
    expect(result.units).toEqual([]);
  });

  it('keeps the utterance when only one slot is numeric and the header property is not JSON', () => {
    const xml = eafDocument('0', '1500', '{', 'hi');
    const result = importFromEaf(xml);
    expect(result.units).toEqual([
      expect.objectContaining({ startTime: 0, endTime: 1.5, transcription: 'hi' }),
    ]);
  });

  it('parses a few hundred annotations without throwing', () => {
    const slots = Array.from({ length: 300 }, (_, index) => {
      const start = index * 2;
      return `<TIME_SLOT TIME_SLOT_ID="ts${start}" TIME_VALUE="${start * 1000}"/><TIME_SLOT TIME_SLOT_ID="ts${start + 1}" TIME_VALUE="${(start + 1) * 1000}"/>`;
    }).join('');
    const annotations = Array.from({ length: 300 }, (_, index) => {
      const start = index * 2;
      return `<ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a${index}" TIME_SLOT_REF1="ts${start}" TIME_SLOT_REF2="ts${start + 1}"><ANNOTATION_VALUE>row</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>`;
    }).join('');
    const xml = `<?xml version="1.0"?><ANNOTATION_DOCUMENT><HEADER><MEDIA_DESCRIPTOR MEDIA_URL="clip.wav"/></HEADER><TIME_ORDER>${slots}</TIME_ORDER><TIER TIER_ID="utterance">${annotations}</TIER></ANNOTATION_DOCUMENT>`;
    const started = performance.now();
    const result = importFromEaf(xml);
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(result.units).toHaveLength(300);
    assertFiniteTimes(result);
  });
});
