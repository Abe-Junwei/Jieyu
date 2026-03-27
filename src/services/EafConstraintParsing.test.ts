// @vitest-environment jsdom
/**
 * EAF tierConstraints 解析 + isIndependentBoundaryLayer / getLayerEditMode 工具函数测试
 * Tests for EAF tierConstraints parsing, isIndependentBoundaryLayer, and getLayerEditMode utilities
 */
import { describe, it, expect } from 'vitest';
import { importFromEaf } from './EafService';
import { isIndependentBoundaryLayer, getLayerEditMode } from '../hooks/useLayerSegments';
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

    // 独立时间对齐层 → 'independent_boundary' | Independent time-aligned → 'independent_boundary'
    const trc = result.tierConstraints.get('transcription');
    expect(trc).toBeDefined();
    expect(trc!.constraint).toBe('independent_boundary');
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

  it('defaults to independent_boundary for tier without CONSTRAINTS and no PARENT_REF', () => {
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
    expect(bare!.constraint).toBe('independent_boundary');
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
    expect(def!.constraint).toBe('independent_boundary');
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
  it('returns true when constraint is independent_boundary and not default layer', () => {
    expect(isIndependentBoundaryLayer(makeLayer({ constraint: 'independent_boundary' }), 'other_layer')).toBe(true);
  });

  it('returns true when layer is the default transcription layer', () => {
    expect(isIndependentBoundaryLayer(makeLayer({ constraint: 'independent_boundary' }), 'layer_1')).toBe(true);
  });

  it('returns false when constraint is symbolic_association', () => {
    expect(isIndependentBoundaryLayer(makeLayer({ constraint: 'symbolic_association' }))).toBe(false);
  });

  it('returns false when constraint is undefined', () => {
    expect(isIndependentBoundaryLayer(makeLayer({}))).toBe(false);
  });

  it('returns false for time_subdivision constraint', () => {
    expect(isIndependentBoundaryLayer(makeLayer({ constraint: 'time_subdivision' }))).toBe(false);
  });

  it('returns true when no defaultTranscriptionLayerId provided and constraint is independent_boundary', () => {
    expect(isIndependentBoundaryLayer(makeLayer({ constraint: 'independent_boundary' }))).toBe(true);
  });
});

// ── getLayerEditMode ──

describe('getLayerEditMode', () => {
  it('returns utterance when layer is undefined', () => {
    expect(getLayerEditMode(undefined, 'other')).toBe('utterance');
  });

  it('returns independent-segment for constraint=independent_boundary non-default layer', () => {
    expect(getLayerEditMode(makeLayer({ constraint: 'independent_boundary' }), 'other_layer')).toBe('independent-segment');
  });

  it('returns independent-segment for constraint=independent_boundary default transcription layer', () => {
    expect(getLayerEditMode(makeLayer({ constraint: 'independent_boundary' }), 'layer_1')).toBe('independent-segment');
  });

  it('returns time-subdivision for constraint=time_subdivision', () => {
    expect(getLayerEditMode(makeLayer({ constraint: 'time_subdivision' }), 'other')).toBe('time-subdivision');
  });

  it('returns utterance for constraint=symbolic_association', () => {
    expect(getLayerEditMode(makeLayer({ constraint: 'symbolic_association' }), 'other')).toBe('utterance');
  });

  it('returns utterance for undefined constraint', () => {
    expect(getLayerEditMode(makeLayer({}), 'other')).toBe('utterance');
  });

  it('returns independent-segment when no defaultTranscriptionLayerId and constraint is independent_boundary', () => {
    expect(getLayerEditMode(makeLayer({ constraint: 'independent_boundary' }))).toBe('independent-segment');
  });
});
