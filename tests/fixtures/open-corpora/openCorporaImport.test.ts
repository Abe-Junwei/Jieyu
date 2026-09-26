// @vitest-environment jsdom
/**
 * Imports local open-license annotation files from tests/fixtures/open-corpora.
 * The annotation files are gitignored. Each case skips when the file is absent.
 * Licenses and citations live in manifest.json and README.md.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { exportToEaf, importFromEaf } from '../../../src/services/EafService';
import { importFromFlextext } from '../../../src/services/FlexService';
import { parseLiftXml } from '../../../src/utils/lexiconLiftImport';

const ROOT = __dirname;
const ALLOWED_LICENSES = new Set([
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'Apache-2.0',
  'CC-BY-NC-ND-2.5',
  'CC-BY-NC-SA-4.0',
  'freely-accessible',
  'private-local',
  'open-access',
]);

interface CorpusRecord {
  path: string;
  format: 'eaf' | 'flextext' | 'lift' | 'pangloss-xml';
  language: string;
  license: string;
}

function loadManifest(): CorpusRecord[] {
  const raw = readFileSync(join(ROOT, 'manifest.json'), 'utf-8');
  const parsed = JSON.parse(raw) as { files: CorpusRecord[] };
  return parsed.files;
}

function hasLetters(value: string): boolean {
  return /\p{L}/u.test(value);
}

describe('open corpora fixtures', () => {
  const files = loadManifest();

  it('records an access license for each local file', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(ALLOWED_LICENSES.has(file.license), file.path).toBe(true);
    }
  });

  describe('ELAN', () => {
    for (const file of files.filter((entry) => entry.format === 'eaf')) {
      it.skipIf(!existsSync(join(ROOT, file.path)))(
        `${file.language} (${file.path}) imports linguistic text`,
        () => {
        const raw = readFileSync(join(ROOT, file.path), 'utf-8');
        const imported = importFromEaf(raw);
        const texts = [
          ...imported.units.map((unit) => unit.transcription),
          ...[...imported.translationTiers.values()].flatMap((tier) => tier.map((ann) => ann.text)),
        ]
          .map((text) => text.trim())
          .filter(hasLetters);

        expect(texts.length, file.language).toBeGreaterThan(0);

        const unit = imported.units.find((entry) => hasLetters(entry.transcription));
        if (!unit) return;

        const exported = exportToEaf({
          units: [
            {
              id: 'u0',
              textId: 'text1',
              mediaId: 'media1',
              transcription: { default: unit.transcription },
              startTime: unit.startTime,
              endTime: unit.endTime,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          layers: [],
          translations: [],
        });
        const reimported = importFromEaf(exported);
        expect(reimported.units[0]?.transcription).toBe(unit.transcription);
      },
      );
    }
  });

  describe('FLEx', () => {
    for (const file of files.filter((entry) => entry.format === 'flextext')) {
      it.skipIf(!existsSync(join(ROOT, file.path)))(
        `${file.language} (${file.path}) imports phrases and morphemes`,
        () => {
        const raw = readFileSync(join(ROOT, file.path), 'utf-8');
        const imported = importFromFlextext(raw);
        expect(imported.units.length).toBeGreaterThan(0);
        // Some FLEx exports put the baseline on word items, not a phrase-level txt item.
        const lexical = imported.units
          .flatMap((unit) => [
            unit.transcription,
            ...(unit.tokens ?? []).flatMap((token) => Object.values(token.form)),
          ])
          .join(' ');
        expect(hasLetters(lexical)).toBe(true);
        const morphemes = imported.units.flatMap((unit) =>
          (unit.tokens ?? []).flatMap((token) => token.morphemes ?? []),
        );
        expect(morphemes.length).toBeGreaterThan(0);
        expect(morphemes.some((morph) => hasLetters(Object.values(morph.form).join('')))).toBe(true);
      },
      );
    }
  });

  describe('LIFT', () => {
    for (const file of files.filter((entry) => entry.format === 'lift')) {
      it.skipIf(!existsSync(join(ROOT, file.path)))(
        `${file.language} (${file.path}) imports lexemes`,
        () => {
        const raw = readFileSync(join(ROOT, file.path), 'utf-8');
        const parsed = parseLiftXml(raw);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.lexemes.length).toBeGreaterThan(0);
        expect(
          parsed.lexemes.some((lexeme) =>
            Object.values(lexeme.lemma).some((value) => hasLetters(value)),
          ),
        ).toBe(true);
      },
      );
    }
  });

  describe('Pangloss XML', () => {
    for (const file of files.filter((entry) => entry.format === 'pangloss-xml')) {
      it.skipIf(!existsSync(join(ROOT, file.path)))(
        `${file.language} (${file.path}) keeps sentences and translations`,
        () => {
        const raw = readFileSync(join(ROOT, file.path), 'utf-8');
        const doc = new DOMParser().parseFromString(raw, 'application/xml');
        expect(doc.querySelector('parsererror')).toBeNull();
        const forms = [...doc.querySelectorAll('FORM')]
          .map((node) => node.textContent?.trim() ?? '')
          .filter(hasLetters);
        const translations = [...doc.querySelectorAll('TRANSL')]
          .map((node) => node.textContent?.trim() ?? '')
          .filter(hasLetters);
        expect(forms.length).toBeGreaterThan(0);
        expect(translations.length).toBeGreaterThan(0);
      },
      );
    }
  });
});
