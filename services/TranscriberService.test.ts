// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { exportToTrs, importFromTrs } from './TranscriberService';
import type { TrsExportInput, TrsSpeaker } from './TranscriberService';
import type { UtteranceDocType } from '../db';

// ── Helpers ──────────────────────────────────────────────────

function makeUtterance(
  id: string,
  start: number,
  end: number,
  text: string,
  speakerId?: string,
): UtteranceDocType {
  return {
    id,
    textId: 'text1',
    mediaId: 'media1',
    transcription: { default: text },
    startTime: start,
    endTime: end,
    isVerified: false,
    ...(speakerId !== undefined && { speakerId }),
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

// ── importFromTrs ────────────────────────────────────────────

describe('TranscriberService', () => {
  describe('importFromTrs', () => {
    it('parses speakers from <Speakers> block', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Trans program="Test" air_date="2026-01-01" version="1" version_date="2026-01-01">
  <Speakers>
    <Speaker id="spk1" name="Alice" />
    <Speaker id="spk2" name="Bob" />
  </Speakers>
  <Episode>
    <Section type="report" startTime="0" endTime="5">
      <Turn speaker="spk1" startTime="0" endTime="5">
        <Sync time="0"/>
        Hello world
      </Turn>
    </Section>
  </Episode>
</Trans>`;
      const result = importFromTrs(xml);
      expect(result.speakers).toHaveLength(2);
      expect(result.speakers[0]).toEqual({ id: 'spk1', name: 'Alice', lang: undefined });
      expect(result.speakers[1]).toEqual({ id: 'spk2', name: 'Bob', lang: undefined });
    });

    it('parses a single-sync Turn as one utterance', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Trans program="Test" version="1" version_date="2026-01-01">
  <Speakers />
  <Episode>
    <Section type="report" startTime="0" endTime="5.0">
      <Turn speaker="spk1" startTime="0" endTime="5.0">
        <Sync time="0"/>
        Hello world
      </Turn>
    </Section>
  </Episode>
</Trans>`;
      const { utterances } = importFromTrs(xml);
      expect(utterances).toHaveLength(1);
      expect(utterances[0]!.startTime).toBeCloseTo(0);
      expect(utterances[0]!.endTime).toBeCloseTo(5);
      expect(utterances[0]!.transcription).toBe('Hello world');
      expect(utterances[0]!.speakerId).toBe('spk1');
    });

    it('splits multiple Sync elements within a Turn into separate utterances', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Trans program="Test" version="1" version_date="2026-01-01">
  <Speakers />
  <Episode>
    <Section type="report" startTime="0" endTime="10.0">
      <Turn speaker="spk1" startTime="0" endTime="10.0">
        <Sync time="0"/>
        First segment
        <Sync time="4.5"/>
        Second segment
        <Sync time="7.0"/>
        Third segment
      </Turn>
    </Section>
  </Episode>
</Trans>`;
      const { utterances } = importFromTrs(xml);
      expect(utterances).toHaveLength(3);
      expect(utterances[0]!.transcription).toBe('First segment');
      expect(utterances[0]!.startTime).toBeCloseTo(0);
      expect(utterances[0]!.endTime).toBeCloseTo(4.5);
      expect(utterances[1]!.transcription).toBe('Second segment');
      expect(utterances[1]!.startTime).toBeCloseTo(4.5);
      expect(utterances[1]!.endTime).toBeCloseTo(7.0);
      expect(utterances[2]!.transcription).toBe('Third segment');
      expect(utterances[2]!.startTime).toBeCloseTo(7.0);
      expect(utterances[2]!.endTime).toBeCloseTo(10.0);
    });

    it('handles multiple speakers across Turns', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Trans program="Test" version="1" version_date="2026-01-01">
  <Speakers>
    <Speaker id="spk1" name="Alice" />
    <Speaker id="spk2" name="Bob" />
  </Speakers>
  <Episode>
    <Section type="report" startTime="0" endTime="10.0">
      <Turn speaker="spk1" startTime="0" endTime="4.0">
        <Sync time="0"/>
        Alice speaks
      </Turn>
      <Turn speaker="spk2" startTime="4.0" endTime="10.0">
        <Sync time="4.0"/>
        Bob replies
      </Turn>
    </Section>
  </Episode>
</Trans>`;
      const { utterances } = importFromTrs(xml);
      expect(utterances).toHaveLength(2);
      expect(utterances[0]!.speakerId).toBe('spk1');
      expect(utterances[1]!.speakerId).toBe('spk2');
    });

    it('skips empty segments between consecutive Sync elements', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Trans program="Test" version="1" version_date="2026-01-01">
  <Speakers />
  <Episode>
    <Section type="report" startTime="0" endTime="10.0">
      <Turn startTime="0" endTime="10.0">
        <Sync time="0"/>
        Real text
        <Sync time="3.0"/>

        <Sync time="6.0"/>
        More text
      </Turn>
    </Section>
  </Episode>
</Trans>`;
      const { utterances } = importFromTrs(xml);
      expect(utterances).toHaveLength(2);
      expect(utterances[0]!.transcription).toBe('Real text');
      expect(utterances[1]!.transcription).toBe('More text');
    });

    it('throws on invalid XML', () => {
      expect(() => importFromTrs('<not valid xml')).toThrow(/TRS XML 解析失败/);
    });
  });

  // ── exportToTrs ────────────────────────────────────────────

  describe('exportToTrs', () => {
    it('produces valid XML with correct root element', () => {
      const input: TrsExportInput = {
        utterances: [makeUtterance('u1', 0, 2.5, 'Hello')],
        programTitle: 'My Corpus',
      };
      const xml = exportToTrs(input);
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<Trans');
      expect(xml).toContain('My Corpus');
    });

    it('includes speaker metadata when provided', () => {
      const speakers: TrsSpeaker[] = [{ id: 'spk1', name: 'Alice', lang: 'en' }];
      const input: TrsExportInput = {
        utterances: [makeUtterance('u1', 0, 2.5, 'Hello', 'spk1')],
        speakers,
      };
      const xml = exportToTrs(input);
      expect(xml).toContain('id="spk1"');
      expect(xml).toContain('name="Alice"');
      expect(xml).toContain('xml:lang="en"');
    });

    it('generates speaker stubs for unknown speaker IDs', () => {
      const input: TrsExportInput = {
        utterances: [makeUtterance('u1', 0, 2.5, 'Hello', 'unknownSpk')],
        speakers: [],
      };
      const xml = exportToTrs(input);
      expect(xml).toContain('id="unknownSpk"');
    });

    it('groups consecutive same-speaker utterances into one Turn', () => {
      const input: TrsExportInput = {
        utterances: [
          makeUtterance('u1', 0, 2.0, 'First', 'spk1'),
          makeUtterance('u2', 2.0, 4.0, 'Second', 'spk1'),
        ],
      };
      const xml = exportToTrs(input);
      const turnMatches = xml.match(/<Turn/g);
      expect(turnMatches).toHaveLength(1);
      const syncMatches = xml.match(/<Sync/g);
      expect(syncMatches).toHaveLength(2);
    });

    it('creates separate Turns for different speakers', () => {
      const input: TrsExportInput = {
        utterances: [
          makeUtterance('u1', 0, 2.0, 'Alice says', 'spk1'),
          makeUtterance('u2', 2.0, 4.0, 'Bob says', 'spk2'),
        ],
      };
      const xml = exportToTrs(input);
      const turnMatches = xml.match(/<Turn/g);
      expect(turnMatches).toHaveLength(2);
    });

    it('escapes XML special characters in transcription text', () => {
      const input: TrsExportInput = {
        utterances: [makeUtterance('u1', 0, 2.5, 'a < b & c > d')],
      };
      const xml = exportToTrs(input);
      expect(xml).toContain('a &lt; b &amp; c &gt; d');
      expect(xml).not.toContain('a < b');
    });
  });

  // ── Round-trip ─────────────────────────────────────────────

  describe('TRS round-trip', () => {
    it('export → import preserves utterances and speaker data', () => {
      const speakers: TrsSpeaker[] = [
        { id: 'spk1', name: 'Alice' },
        { id: 'spk2', name: 'Bob' },
      ];
      const utterances = [
        makeUtterance('u1', 0, 2.5, 'Hello from Alice', 'spk1'),
        makeUtterance('u2', 2.5, 5.0, 'Hello from Bob', 'spk2'),
        makeUtterance('u3', 5.0, 8.0, 'Alice again', 'spk1'),
      ];
      const exported = exportToTrs({ utterances, speakers });
      const imported = importFromTrs(exported);

      expect(imported.utterances).toHaveLength(3);
      expect(imported.utterances[0]!.transcription).toBe('Hello from Alice');
      expect(imported.utterances[0]!.speakerId).toBe('spk1');
      expect(imported.utterances[1]!.transcription).toBe('Hello from Bob');
      expect(imported.utterances[1]!.speakerId).toBe('spk2');
      expect(imported.utterances[2]!.transcription).toBe('Alice again');
      expect(imported.utterances[2]!.speakerId).toBe('spk1');

      expect(imported.speakers).toHaveLength(2);
      const names = imported.speakers.map((s) => s.name);
      expect(names).toContain('Alice');
      expect(names).toContain('Bob');
    });

    it('export → import preserves timing within 0.001s tolerance', () => {
      const utterances = [
        makeUtterance('u1', 1.234, 3.567, 'Precise timing'),
        makeUtterance('u2', 3.567, 7.891, 'Second segment'),
      ];
      const exported = exportToTrs({ utterances });
      const imported = importFromTrs(exported);

      expect(imported.utterances[0]!.startTime).toBeCloseTo(1.234, 3);
      expect(imported.utterances[0]!.endTime).toBeCloseTo(3.567, 3);
      expect(imported.utterances[1]!.startTime).toBeCloseTo(3.567, 3);
      expect(imported.utterances[1]!.endTime).toBeCloseTo(7.891, 3);
    });
  });
});
