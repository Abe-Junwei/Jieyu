import { describe, expect, it } from 'vitest';
import type { LayerDocType } from '../db/types';
import {
  getLayerHeaderVarietyOrAliasLine,
  getLayerHeaderWritingSystemLine,
  writingSystemHeaderLabel,
} from './transcriptionFormatters';

function layer(name: string, languageId: string): LayerDocType {
  return {
    id: 'layer',
    textId: 'text',
    key: 'trc',
    name: { zho: name },
    languageId,
    layerType: 'transcription',
    modality: 'text',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('imported tier header', () => {
  it('shows the FLEx element and the writing-system name, not the private script', () => {
    const row = layer('句子-txt-ers-Qaaa-CN-x-Ersu-ersueast', 'ers');
    expect(getLayerHeaderVarietyOrAliasLine(row)).toBe('句子');
    expect(getLayerHeaderWritingSystemLine(row)).toBe('ersueast');
    expect(writingSystemHeaderLabel('ers-Qaaa-CN-x-Ersu-ersueast')).not.toContain('Qaaa');
  });

  it('keeps a known variant and drops the repeated language name', () => {
    expect(writingSystemHeaderLabel('mvm-fonipa-x-emic')).toBe('IPA · emic');
  });

  it('shows the region when the tag has no writing-system name', () => {
    const row = layer('翻译-gls-zh-CN', 'zho');
    expect(getLayerHeaderVarietyOrAliasLine(row)).toBe('翻译');
    expect(getLayerHeaderWritingSystemLine(row)).toBe('CN');
  });
});
