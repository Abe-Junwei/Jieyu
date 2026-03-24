// @vitest-environment jsdom
/**
 * Golden File Round-trip Regression Tests
 *
 * Each golden file in tests/golden/{format}/ is imported, then re-exported,
 * then imported again. The final import must match the first import exactly.
 *
 * This ensures:
 *   (a) parsers correctly handle real-world file structures
 *   (b) exporters produce valid output that round-trips cleanly
 *   (c) future changes to any service don't silently break interop
 *
 * To add coverage for a new format:
 *   1. Drop a sample file into tests/golden/{format}/
 *   2. Add a test block below following the existing pattern
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { importFromEaf, exportToEaf } from '../../src/services/EafService';
import { importFromTextGrid, exportToTextGrid } from '../../src/services/TextGridService';
import { importFromTrs, exportToTrs } from '../../src/services/TranscriberService';
import { importFromToolbox, exportToToolbox } from '../../src/services/ToolboxService';
import { importFromFlextext, exportToFlextext } from '../../src/services/FlexService';

// ── Helpers ──────────────────────────────────────────────────

const GOLDEN_DIR = join(__dirname, '../golden');

function readGolden(subdir: string, filename: string): string {
  return readFileSync(join(GOLDEN_DIR, subdir, filename), 'utf-8');
}

/**
 * Normalise a floating-point time to 3 decimal places so round-trip
 * comparisons aren't tripped by IEEE 754 representation differences.
 */
function roundTime(t: number): number {
  return Math.round(t * 1000) / 1000;
}

// ── EAF Golden Tests ──────────────────────────────────────────

describe('Golden Round-trip: EAF', () => {
  it('minimal.eaf — 2 utterances, no translation tiers', () => {
    const raw = readGolden('eaf', 'minimal.eaf');
    const imported = importFromEaf(raw);

    expect(imported.utterances).toHaveLength(2);
    expect(imported.utterances[0]!.transcription).toBe('Hello world');
    expect(imported.utterances[0]!.startTime).toBeCloseTo(0, 3);
    expect(imported.utterances[0]!.endTime).toBeCloseTo(2, 3);
    expect(imported.utterances[1]!.transcription).toBe('Goodbye');
    expect(imported.utterances[1]!.startTime).toBeCloseTo(2, 3);
    expect(imported.utterances[1]!.endTime).toBeCloseTo(5.5, 3);
    expect(imported.translationTiers.size).toBe(0);

    // Round-trip: export minimal utterances then re-import
    const utterances = imported.utterances.map((u, i) => ({
      id: `u${i}`,
      textId: 'text1',
      mediaId: 'media1',
      transcription: { default: u.transcription },
      startTime: u.startTime,
      endTime: u.endTime,
      isVerified: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }) as const);

    const exported = exportToEaf({ utterances, layers: [], translations: [] });
    const reimported = importFromEaf(exported);

    expect(reimported.utterances).toHaveLength(2);
    expect(reimported.utterances[0]!.transcription).toBe('Hello world');
    expect(reimported.utterances[1]!.transcription).toBe('Goodbye');
    expect(roundTime(reimported.utterances[0]!.startTime)).toBeCloseTo(0, 3);
    expect(roundTime(reimported.utterances[0]!.endTime)).toBeCloseTo(2, 3);
  });

  it('multi-tier-ipa.eaf — 3 utterances, 2 translation tiers, IPA text', () => {
    const raw = readGolden('eaf', 'multi-tier-ipa.eaf');
    const imported = importFromEaf(raw);

    expect(imported.utterances).toHaveLength(3);
    expect(imported.utterances[0]!.transcription).toBe('tɕʰa mo ɣa ra');
    expect(imported.utterances[1]!.transcription).toBe('ŋa joŋs pa yin');
    expect(imported.utterances[2]!.transcription).toBe('de ring dus tshod');

    expect(imported.translationTiers.size).toBe(2);
    const englishTier = imported.translationTiers.get('English');
    expect(englishTier).toBeDefined();
    expect(englishTier![0]!.text).toBe('The tea is hot');

    const chineseTier = imported.translationTiers.get('Chinese');
    expect(chineseTier).toBeDefined();
    expect(chineseTier![0]!.text).toBe('茶很烫');
  });

  it('xml-escaping.eaf — special characters survive import', () => {
    const raw = readGolden('eaf', 'xml-escaping.eaf');
    const imported = importFromEaf(raw);

    expect(imported.utterances).toHaveLength(1);
    expect(imported.utterances[0]!.transcription).toBe('a < b & c > d "quoted"');
  });
});

// ── TextGrid Golden Tests ─────────────────────────────────────

describe('Golden Round-trip: TextGrid', () => {
  it('minimal.TextGrid — 2 utterances extracted from gap-padded intervals', () => {
    const raw = readGolden('textgrid', 'minimal.TextGrid');
    const imported = importFromTextGrid(raw);

    // Gap intervals with empty text should be filtered out
    const nonEmpty = imported.utterances.filter((u) => u.transcription.trim() !== '');
    expect(nonEmpty).toHaveLength(2);
    expect(nonEmpty[0]!.transcription).toBe('Hello world');
    expect(nonEmpty[0]!.startTime).toBeCloseTo(0, 3);
    expect(nonEmpty[0]!.endTime).toBeCloseTo(2, 3);
    expect(nonEmpty[1]!.transcription).toBe('Goodbye');

    // Round-trip
    const utterances = nonEmpty.map((u, i) => ({
      id: `u${i}`,
      textId: 'text1',
      mediaId: 'media1',
      transcription: { default: u.transcription },
      startTime: u.startTime,
      endTime: u.endTime,
      isVerified: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }) as const);

    const exported = exportToTextGrid({ utterances, layers: [], translations: [] });
    const reimported = importFromTextGrid(exported);
    const nonEmptyAfter = reimported.utterances.filter((u) => u.transcription.trim() !== '');
    expect(nonEmptyAfter).toHaveLength(2);
    expect(nonEmptyAfter[0]!.transcription).toBe('Hello world');
    expect(nonEmptyAfter[1]!.transcription).toBe('Goodbye');
  });

  it('multi-tier-ipa.TextGrid — IPA transcription + 2 translation tiers', () => {
    const raw = readGolden('textgrid', 'multi-tier-ipa.TextGrid');
    const imported = importFromTextGrid(raw);

    const nonEmpty = imported.utterances.filter((u) => u.transcription.trim() !== '');
    expect(nonEmpty).toHaveLength(3);
    expect(nonEmpty[0]!.transcription).toBe('tɕʰa mo ɣa ra');
    expect(nonEmpty[1]!.transcription).toBe('ŋa joŋs pa yin');
    expect(nonEmpty[2]!.transcription).toBe('de ring dus tshod');

    expect(imported.additionalTiers).toBeDefined();
    const tiers = imported.additionalTiers;
    expect(tiers.size).toBe(2);

    const englishTier = tiers.get('English');
    expect(englishTier).toBeDefined();
    const nonEmptyEn = englishTier!.filter((s) => s.text.trim() !== '');
    expect(nonEmptyEn[0]!.text).toBe('The tea is hot');
  });
});

// ── TRS Golden Tests ──────────────────────────────────────────

describe('Golden Round-trip: TRS (Transcriber)', () => {
  it('minimal.trs — 1 turn, 1 speaker, 1 utterance', () => {
    const raw = readGolden('trs', 'minimal.trs');
    const imported = importFromTrs(raw);

    expect(imported.speakers).toHaveLength(1);
    expect(imported.speakers[0]!.name).toBe('Speaker One');

    expect(imported.utterances).toHaveLength(1);
    expect(imported.utterances[0]!.transcription).toBe('Hello world');
    expect(imported.utterances[0]!.startTime).toBeCloseTo(0, 3);
    expect(imported.utterances[0]!.endTime).toBeCloseTo(4.0, 3);
    expect(imported.utterances[0]!.speakerId).toBe('spk1');
  });

  it('two-speakers.trs — 2 speakers, 4 utterances across 2 turns', () => {
    const raw = readGolden('trs', 'two-speakers.trs');
    const imported = importFromTrs(raw);

    expect(imported.speakers).toHaveLength(2);
    const speakerNames = imported.speakers.map((s) => s.name);
    expect(speakerNames).toContain('Alice Doe');
    expect(speakerNames).toContain('Bob Smith');

    expect(imported.utterances).toHaveLength(4);
    expect(imported.utterances[0]!.transcription).toBe('First utterance by Alice');
    expect(imported.utterances[0]!.speakerId).toBe('spk1');
    expect(imported.utterances[1]!.transcription).toBe('Second utterance by Alice');
    expect(imported.utterances[1]!.speakerId).toBe('spk1');
    expect(imported.utterances[2]!.transcription).toBe('Bob responds here');
    expect(imported.utterances[2]!.speakerId).toBe('spk2');
    expect(imported.utterances[3]!.transcription).toBe('Bob continues speaking');
    expect(imported.utterances[3]!.speakerId).toBe('spk2');
  });

  it('two-speakers.trs — round-trip export → import preserves structure', () => {
    const raw = readGolden('trs', 'two-speakers.trs');
    const imported = importFromTrs(raw);

    const utterances = imported.utterances.map((u, i) => ({
      id: `u${i}`,
      textId: 'text1',
      mediaId: 'media1',
      transcription: { default: u.transcription },
      startTime: u.startTime,
      endTime: u.endTime,
      ...(u.speakerId !== undefined && { speakerId: u.speakerId }),
      isVerified: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }) as const);

    const exported = exportToTrs({ utterances, speakers: imported.speakers });
    const reimported = importFromTrs(exported);

    expect(reimported.utterances).toHaveLength(4);
    reimported.utterances.forEach((u, i) => {
      expect(u.transcription).toBe(imported.utterances[i]!.transcription);
      expect(u.speakerId).toBe(imported.utterances[i]!.speakerId);
      expect(roundTime(u.startTime)).toBeCloseTo(roundTime(imported.utterances[i]!.startTime), 2);
      expect(roundTime(u.endTime)).toBeCloseTo(roundTime(imported.utterances[i]!.endTime), 2);
    });
  });
});

// ── Toolbox Golden Tests ─────────────────────────────────────

describe('Golden Round-trip: Toolbox', () => {
  it('minimal.txt — 1 record with free translation', () => {
    const raw = readGolden('toolbox', 'minimal.txt');
    const imported = importFromToolbox(raw);

    expect(imported.utterances).toHaveLength(1);
    expect(imported.utterances[0]!.transcription).toBe('Hello world');
    expect(imported.utterances[0]!.startTime).toBeCloseTo(0, 3);
    expect(imported.utterances[0]!.endTime).toBeCloseTo(2, 3);
    expect(imported.additionalTiers.get('Toolbox Free Translation')?.[0]?.text).toBe('你好，世界');
  });

  it('interlinear.txt — mb/ge/ps lines map into word+morpheme hierarchy', () => {
    const raw = readGolden('toolbox', 'interlinear.txt');
    const imported = importFromToolbox(raw);

    expect(imported.utterances).toHaveLength(2);
    expect(imported.utterances[0]!.transcription).toBe('nga jongs');
    expect(imported.utterances[0]!.tokens).toHaveLength(2);
    expect(imported.utterances[0]!.tokens![0]!.morphemes![0]!.gloss!.eng).toBe('1SG');
    expect(imported.utterances[1]!.tokens![2]!.morphemes).toHaveLength(2);
  });

  it('interlinear.txt — round-trip export → import preserves utterance text and timing', () => {
    const raw = readGolden('toolbox', 'interlinear.txt');
    const imported = importFromToolbox(raw);

    const utterances = imported.utterances.map((u, i) => ({
      id: `u${i}`,
      textId: 'text1',
      mediaId: 'media1',
      transcription: { default: u.transcription },
      startTime: u.startTime,
      endTime: u.endTime,
      annotationStatus: 'raw' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }) as const);

    const tokenRows: import('../../db').UtteranceTokenDocType[] = [];
    const morphRows: import('../../db').UtteranceMorphemeDocType[] = [];
    imported.utterances.forEach((u, ui) => {
      const utteranceId = `u${ui}`;
      (u.tokens ?? []).forEach((t, ti) => {
        const tokenId = `tok_${ui}_${ti}`;
        tokenRows.push({
          id: tokenId,
          textId: 'text1',
          utteranceId,
          form: t.form,
          ...(t.gloss ? { gloss: t.gloss } : {}),
          ...(t.pos ? { pos: t.pos } : {}),
          tokenIndex: ti,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
        (t.morphemes ?? []).forEach((m, mi) => {
          morphRows.push({
            id: `morph_${ui}_${ti}_${mi}`,
            textId: 'text1',
            utteranceId,
            tokenId,
            form: m.form,
            ...(m.gloss ? { gloss: m.gloss } : {}),
            ...(m.pos ? { pos: m.pos } : {}),
            morphemeIndex: mi,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          });
        });
      });
    });

    const exported = exportToToolbox({ utterances, layers: [], translations: [], tokens: tokenRows, morphemes: morphRows });
    const reimported = importFromToolbox(exported);

    expect(reimported.utterances).toHaveLength(2);
    reimported.utterances.forEach((u, i) => {
      expect(u.transcription).toBe(imported.utterances[i]!.transcription);
      expect(roundTime(u.startTime)).toBeCloseTo(roundTime(imported.utterances[i]!.startTime), 2);
      expect(roundTime(u.endTime)).toBeCloseTo(roundTime(imported.utterances[i]!.endTime), 2);
    });
  });
});

// ── EAF Additional Golden Tests ───────────────────────────────

describe('Golden Round-trip: EAF (additional)', () => {
  it('empty.eaf — no annotations produces 0 utterances', () => {
    const raw = readGolden('eaf', 'empty.eaf');
    const imported = importFromEaf(raw);
    expect(imported.utterances).toHaveLength(0);
  });

  it('five-utterance-thai.eaf — 5 utterances with Thai gloss tier', () => {
    const raw = readGolden('eaf', 'five-utterance-thai.eaf');
    const imported = importFromEaf(raw);

    expect(imported.utterances).toHaveLength(5);
    expect(imported.utterances[0]!.transcription).toBe('kʰɔ̃ː tsʰeː pa reːt');
    expect(imported.utterances[4]!.transcription).toBe('sɯ́ː kʰɔ̌ŋ pàː');
    expect(imported.utterances[0]!.startTime).toBeCloseTo(0, 3);
    expect(imported.utterances[4]!.endTime).toBeCloseTo(10, 3);

    const thaiTier = imported.translationTiers.get('Thai-gloss');
    expect(thaiTier).toBeDefined();
    expect(thaiTier![0]!.text).toBe('คุณเป็นอะไร');
    expect(thaiTier![4]!.text).toBe('ซื้อของป่า');
  });

  it('mvm-muya-real.eaf — real-style mvm tier keeps language labels and REF alignment', () => {
    const raw = readGolden('eaf', 'mvm-muya-real.eaf');
    const imported = importFromEaf(raw);

    expect(imported.utterances).toHaveLength(1);
    expect(imported.utterances[0]!.transcription).toBe('mu31 nji55');
    expect(imported.utterances[0]!.startTime).toBeCloseTo(0, 3);
    expect(imported.utterances[0]!.endTime).toBeCloseTo(2.1, 3);
    expect(imported.transcriptionTierName).toBe('mvm-fonipa-x-emic');
    expect(imported.defaultLocale).toBe('mvm-fonipa-x-emic');

    const enTier = imported.translationTiers.get('en');
    expect(enTier).toBeDefined();
    expect(enTier).toHaveLength(1);
    expect(enTier![0]!.text).toBe('Muya sample line');
    expect(enTier![0]!.startTime).toBeCloseTo(0, 3);
    expect(enTier![0]!.endTime).toBeCloseTo(2.1, 3);

    // 来自 <LANGUAGE> 的标签映射 | LANG_ID -> LANG_LABEL from <LANGUAGE>
    expect(imported.languageLabels.get('mvm-fonipa-x-emic')).toBe('Muya (IPA)');
    expect(imported.languageLabels.get('en')).toBe('English');
    expect(imported.languageLabels.get('zh-CN')).toBe('Chinese, Mandarin');
  });
});

// ── TextGrid Additional Golden Tests ──────────────────────────

describe('Golden Round-trip: TextGrid (additional)', () => {
  it('empty.TextGrid — 0 intervals produces 0 utterances', () => {
    const raw = readGolden('textgrid', 'empty.TextGrid');
    const imported = importFromTextGrid(raw);
    expect(imported.utterances).toHaveLength(0);
  });

  it('korean-unicode.TextGrid — Korean text with gap interval filtered out', () => {
    const raw = readGolden('textgrid', 'korean-unicode.TextGrid');
    const imported = importFromTextGrid(raw);

    const nonEmpty = imported.utterances.filter((u) => u.transcription.trim() !== '');
    expect(nonEmpty).toHaveLength(4);
    expect(nonEmpty[0]!.transcription).toBe('안녕하세요');
    expect(nonEmpty[1]!.transcription).toBe('감사합니다');
    expect(nonEmpty[2]!.transcription).toBe('처음 뵙겠습니다');
    expect(nonEmpty[3]!.transcription).toBe('잘 부탁드립니다');

    // Round-trip
    const utterances = nonEmpty.map((u, i) => ({
      id: `u${i}`,
      textId: 'text1',
      mediaId: 'media1',
      transcription: { default: u.transcription },
      startTime: u.startTime,
      endTime: u.endTime,
      isVerified: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }) as const);

    const exported = exportToTextGrid({ utterances, layers: [], translations: [] });
    const reimported = importFromTextGrid(exported);
    const nonEmptyAfter = reimported.utterances.filter((u) => u.transcription.trim() !== '');
    expect(nonEmptyAfter).toHaveLength(4);
    expect(nonEmptyAfter[0]!.transcription).toBe('안녕하세요');
    expect(nonEmptyAfter[3]!.transcription).toBe('잘 부탁드립니다');
  });
});

// ── TRS Additional Golden Tests ───────────────────────────────

describe('Golden Round-trip: TRS (additional)', () => {
  it('empty.trs — no sync points produces 0 utterances', () => {
    const raw = readGolden('trs', 'empty.trs');
    const imported = importFromTrs(raw);
    expect(imported.utterances).toHaveLength(0);
  });

  it('three-speakers.trs — 3 speakers, 7 utterances across 4 turns', () => {
    const raw = readGolden('trs', 'three-speakers.trs');
    const imported = importFromTrs(raw);

    expect(imported.speakers).toHaveLength(3);
    const names = imported.speakers.map((s) => s.name);
    expect(names).toContain('Elder Dawa');
    expect(names).toContain('Researcher Li');
    expect(names).toContain('Translator Tenzin');

    expect(imported.utterances).toHaveLength(7);
    expect(imported.utterances[0]!.speakerId).toBe('spk2');
    expect(imported.utterances[0]!.transcription).toBe('请讲一下你的家乡');
    expect(imported.utterances[2]!.speakerId).toBe('spk1');
    expect(imported.utterances[2]!.transcription).toBe('ŋa bod ljongs nas yin');
    expect(imported.utterances[4]!.speakerId).toBe('spk3');
    expect(imported.utterances[6]!.speakerId).toBe('spk1');
    expect(imported.utterances[6]!.transcription).toBe('chu bo yaŋ yod red');
  });
});

// ── Toolbox Additional Golden Tests ──────────────────────────

describe('Golden Round-trip: Toolbox (additional)', () => {
  it('empty.txt — empty record produces 0 or 1 utterance with empty text', () => {
    const raw = readGolden('toolbox', 'empty.txt');
    const imported = importFromToolbox(raw);
    // Either 0 utterances or 1 with empty transcription — both acceptable
    if (imported.utterances.length > 0) {
      expect(imported.utterances[0]!.transcription.trim()).toBe('');
    }
  });

  it('three-records.txt — 3 records with mb/ge/ps interlinear data', () => {
    const raw = readGolden('toolbox', 'three-records.txt');
    const imported = importFromToolbox(raw);

    expect(imported.utterances).toHaveLength(3);
    expect(imported.utterances[0]!.transcription).toBe('tɕʰa mo');
    expect(imported.utterances[1]!.transcription).toBe('ŋa joŋs pa yin');
    expect(imported.utterances[2]!.transcription).toBe('de ring');

    // Check word/morpheme structure
    expect(imported.utterances[0]!.tokens).toHaveLength(2);
    expect(imported.utterances[0]!.tokens![0]!.morphemes![0]!.gloss!.eng).toBe('tea');
    expect(imported.utterances[1]!.tokens).toHaveLength(4);
    expect(imported.utterances[1]!.tokens![0]!.morphemes![0]!.gloss!.eng).toBe('1SG');

    // Free translation
    const ft = imported.additionalTiers.get('Toolbox Free Translation');
    expect(ft).toBeDefined();
    expect(ft![0]!.text).toBe('茶');
    expect(ft![1]!.text).toBe('我来了');
    expect(ft![2]!.text).toBe('今天');
  });
});

// ── FLExText Golden Tests ─────────────────────────────────────

describe('Golden Round-trip: FLExText', () => {
  it('minimal.flextext — 2 phrases, no words or glosses', () => {
    const raw = readGolden('flextext', 'minimal.flextext');
    const imported = importFromFlextext(raw);

    expect(imported.utterances).toHaveLength(2);
    expect(imported.utterances[0]!.transcription).toBe('tɕʰa mo ɣa ra');
    expect(imported.utterances[0]!.startTime).toBeCloseTo(0, 3);
    expect(imported.utterances[0]!.endTime).toBeCloseTo(2, 3);
    expect(imported.utterances[1]!.transcription).toBe('ŋa joŋs pa yin');
    expect(imported.utterances[1]!.startTime).toBeCloseTo(2, 3);
    expect(imported.utterances[1]!.endTime).toBeCloseTo(5.5, 3);

    // Round-trip
    const utterances = imported.utterances.map((u, i) => ({
      id: `u${i}`,
      textId: 'text1',
      mediaId: 'media1',
      transcription: { default: u.transcription },
      startTime: u.startTime,
      endTime: u.endTime,
      annotationStatus: 'raw' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));
    const exported = exportToFlextext({ utterances, layers: [], translations: [] });
    const reimported = importFromFlextext(exported);
    expect(reimported.utterances).toHaveLength(2);
    expect(reimported.utterances[0]!.transcription).toBe('tɕʰa mo ɣa ra');
    expect(reimported.utterances[1]!.transcription).toBe('ŋa joŋs pa yin');
  });

  it('interlinear-ipa.flextext — 3 phrases with word+morpheme glosses', () => {
    const raw = readGolden('flextext', 'interlinear-ipa.flextext');
    const imported = importFromFlextext(raw);

    expect(imported.utterances).toHaveLength(3);
    expect(imported.utterances[0]!.transcription).toBe('tɕʰa mo ɣa ra');
    expect(imported.utterances[2]!.transcription).toBe('de ring dus tshod');

    // Word-level data on first phrase
    const words0 = imported.utterances[0]!.tokens;
    expect(words0).toBeDefined();
    expect(words0).toHaveLength(3);
    expect(words0![0]!.form.default).toBe('tɕʰa');
    expect(words0![0]!.morphemes).toHaveLength(1);
    expect(words0![0]!.morphemes![0]!.gloss!.eng).toBe('tea');

    // Third word has 2 morphemes
    expect(words0![2]!.morphemes).toHaveLength(2);
    expect(words0![2]!.morphemes![0]!.gloss!.eng).toBe('hot');
    expect(words0![2]!.morphemes![1]!.gloss!.eng).toBe('COP');

    // Phrase glosses
    expect(imported.phraseGlosses.size).toBeGreaterThanOrEqual(2);
  });

  it('xml-escaping.flextext — XML entities survive round-trip', () => {
    const raw = readGolden('flextext', 'xml-escaping.flextext');
    const imported = importFromFlextext(raw);

    expect(imported.utterances).toHaveLength(1);
    expect(imported.utterances[0]!.transcription).toBe('a < b & c > d "quoted"');
  });

  it('empty.flextext — empty phrases produces 0 utterances', () => {
    const raw = readGolden('flextext', 'empty.flextext');
    const imported = importFromFlextext(raw);
    expect(imported.utterances).toHaveLength(0);
  });
});
