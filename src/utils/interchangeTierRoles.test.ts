import { describe, expect, it } from 'vitest';
import { EafTierRolesRequiredError } from './eafTierRole';
import {
  INTERCHANGE_TIER_ROLES_METADATA_KEY,
  mergeInterchangeTierRoles,
  shapeTextGridForTierRoles,
} from './interchangeTierRoles';
import type { TextGridImportResult } from '../services/TextGridService';

function twoTierGrid(): TextGridImportResult {
  return {
    transcriptionTierName: 'utterance',
    units: [{ startTime: 0, endTime: 1, transcription: 'hello' }],
    additionalTiers: new Map([['free', [{ startTime: 0, endTime: 1, text: 'hi' }]]]),
    tierMetadata: new Map(),
  };
}

const noMetadata = async () => undefined;

describe('shapeTextGridForTierRoles', () => {
  it('asks before writing when two tiers have no saved roles', async () => {
    await expect(
      shapeTextGridForTierRoles(
        twoTierGrid(),
        'demo.textgrid',
        { promptForEafTierRoles: true },
        noMetadata,
      ),
    ).rejects.toBeInstanceOf(EafTierRolesRequiredError);
  });

  it('leaves the current split in place when the switch is off or the confirmed roles are the default', async () => {
    const closed = await shapeTextGridForTierRoles(
      twoTierGrid(),
      'demo.textgrid',
      undefined,
      noMetadata,
    );
    expect(closed.result.units.map((unit) => unit.transcription)).toEqual(['hello']);
    expect(closed.result.additionalTiers.get('free')?.[0]?.text).toBe('hi');
    expect(closed.extraTranscriptionTiers).toEqual([]);

    const confirmed = await shapeTextGridForTierRoles(
      twoTierGrid(),
      'demo.textgrid',
      {
        promptForEafTierRoles: true,
        tierRolesAcknowledged: true,
        tierRoles: { utterance: 'transcription', free: 'translation' },
      },
      noMetadata,
    );
    expect(confirmed.result.units.map((unit) => unit.transcription)).toEqual(['hello']);
    expect(confirmed.result.additionalTiers.get('free')?.[0]?.text).toBe('hi');
    expect(confirmed.extraTranscriptionTiers).toEqual([]);
  });

  it('drops an excluded tier and moves a later transcription tier out of translations', async () => {
    const shaped = await shapeTextGridForTierRoles(
      twoTierGrid(),
      'demo.textgrid',
      {
        promptForEafTierRoles: true,
        tierRoles: { utterance: 'exclude', free: 'transcription' },
      },
      noMetadata,
    );
    expect(shaped.result.units.map((unit) => unit.transcription)).toEqual(['hi']);
    expect(shaped.result.additionalTiers.size).toBe(0);
    expect(shaped.extraTranscriptionTiers).toEqual([]);
  });

  it('reuses saved roles from the interchange metadata key', async () => {
    const metadata = mergeInterchangeTierRoles({}, { utterance: 'transcription', free: 'notes' });
    expect(metadata[INTERCHANGE_TIER_ROLES_METADATA_KEY]).toBeTruthy();
    const shaped = await shapeTextGridForTierRoles(
      twoTierGrid(),
      'demo.textgrid',
      { promptForEafTierRoles: true },
      async () => metadata,
    );
    expect(shaped.result.additionalTiers.size).toBe(0);
    expect(shaped.noteSegments.map((note) => note.text)).toEqual(['hi']);
  });
});
