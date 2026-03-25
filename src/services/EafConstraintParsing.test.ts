// @vitest-environment jsdom
/**
 * EAF tierConstraints 解析 + isIndependentBoundaryLayer 工具函数测试
 * Tests for EAF tierConstraints parsing and isIndependentBoundaryLayer utility
 */
import { describe, it, expect, afterEach } from 'vitest';
import { importFromEaf } from './EafService';
import { isIndependentBoundaryLayer } from '../hooks/useLayerSegments';
import { featureFlags } from '../ai/config/featureFlags';
import type { LayerDocType } from '../db';

// ── EAF tierConstraints parsing ──

const EAF_WITH_CONSTRAINTS = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT>
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="test.wav" MIME_TYPE="audio/x-wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="2000" />
  </TIME_ORDER>
  <TIER TIER_ID="transcription" LINGUISTIC_TYPE_REF="default-lt" DEFAULT_LOCALE="en">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>Hello</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="translation" LINGUISTIC_TYPE_REF="translation-lt" PARENT_REF="transcription" DEFAULT_LOCALE="zh">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a2" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>你好</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="phonetic" LINGUISTIC_TYPE_REF="phonetic-lt" PARENT_REF="transcription" DEFAULT_LOCALE="und">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a3" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>hɛˈloʊ</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="translation-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Association" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="phonetic-lt" TIME_ALIGNABLE="true" CONSTRAINTS="Time_Subdivision" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`;

describe('EAF tierConstraints parsing', () => {
  it('maps CONSTRAINTS to LayerConstraint correctly', () => {
    const result = importFromEaf(EAF_WITH_CONSTRAINTS);

    // 独立时间对齐层 → 'none' | Independent time-aligned → 'none'
    const trc = result.tierConstraints.get('transcription');
    expect(trc).toBeDefined();
    expect(trc!.constraint).toBe('none');
    expect(trc!.parentTierId).toBeUndefined();

    // Symbolic_Association → 'symbolic_association' | Has PARENT_REF
    const trl = result.tierConstraints.get('translation');
    expect(trl).toBeDefined();
    expect(trl!.constraint).toBe('symbolic_association');
    expect(trl!.parentTierId).toBe('transcription');

    // Time_Subdivision → 'time_subdivision' | Has PARENT_REF
    const phon = result.tierConstraints.get('phonetic');
    expect(phon).toBeDefined();
    expect(phon!.constraint).toBe('time_subdivision');
    expect(phon!.parentTierId).toBe('transcription');
  });

  it('defaults to none for tier without CONSTRAINTS and no PARENT_REF', () => {
    const eaf = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT>
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="test.wav" MIME_TYPE="audio/x-wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
  </TIME_ORDER>
  <TIER TIER_ID="bare" LINGUISTIC_TYPE_REF="bare-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>test</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="bare-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`;

    const result = importFromEaf(eaf);
    const bare = result.tierConstraints.get('bare');
    expect(bare).toBeDefined();
    expect(bare!.constraint).toBe('none');
    expect(bare!.parentTierId).toBeUndefined();
  });

  it('defaults to symbolic_association for non-time-alignable tier without explicit CONSTRAINTS', () => {
    const eaf = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT>
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="test.wav" MIME_TYPE="audio/x-wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
  </TIME_ORDER>
  <TIER TIER_ID="main" LINGUISTIC_TYPE_REF="main-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>test</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="dependent" LINGUISTIC_TYPE_REF="dep-lt" PARENT_REF="main">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="a2" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>dep</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="main-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="dep-lt" TIME_ALIGNABLE="false" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`;

    const result = importFromEaf(eaf);
    const dep = result.tierConstraints.get('dependent');
    expect(dep).toBeDefined();
    expect(dep!.constraint).toBe('symbolic_association');
    expect(dep!.parentTierId).toBe('main');
  });

  it('golden minimal.eaf has expected tierConstraints', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const raw = readFileSync(join(__dirname, '../../tests/golden/eaf/minimal.eaf'), 'utf-8');
    const result = importFromEaf(raw);

    // minimal.eaf: single tier "default" with default-lt (TIME_ALIGNABLE=true, no CONSTRAINTS)
    const def = result.tierConstraints.get('default');
    expect(def).toBeDefined();
    expect(def!.constraint).toBe('none');
  });
});

// ── isIndependentBoundaryLayer ──

function makeLayer(overrides: Partial<LayerDocType>): LayerDocType {
  return {
    id: 'layer_1',
    textId: 'text_1',
    key: 'test_layer',
    name: { eng: 'Test', zho: '测试' },
    layerType: 'translation',
    languageId: 'en',
    modality: 'text',
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as LayerDocType;
}

describe('isIndependentBoundaryLayer', () => {
  afterEach(() => {
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = true;
  });

  it('returns true when flag on and constraint is none', () => {
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = true;
    expect(isIndependentBoundaryLayer(makeLayer({ constraint: 'none' }))).toBe(true);
  });

  it('returns false when flag on but constraint is symbolic_association', () => {
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = true;
    expect(isIndependentBoundaryLayer(makeLayer({ constraint: 'symbolic_association' }))).toBe(false);
  });

  it('returns false when flag on but constraint is undefined', () => {
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = true;
    expect(isIndependentBoundaryLayer(makeLayer({}))).toBe(false);
  });

  it('returns false when flag off even if constraint is none', () => {
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = false;
    expect(isIndependentBoundaryLayer(makeLayer({ constraint: 'none' }))).toBe(false);
  });

  it('returns false for time_subdivision constraint', () => {
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = true;
    expect(isIndependentBoundaryLayer(makeLayer({ constraint: 'time_subdivision' }))).toBe(false);
  });
});
