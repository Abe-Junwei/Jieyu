import { describe, expect, it } from 'vitest';
import { buildRuntimeV2ToolSpecs } from './aiRuntimeV2Turn';
import { corpusToolMessage } from './runtimeV2CorpusTools';

describe('runtime v2 corpus tools', () => {
  it('offers the first five workspace reads, and not the write tool', () => {
    const specs = buildRuntimeV2ToolSpecs();
    expect(Object.keys(specs)).toEqual(
      expect.arrayContaining([
        'list_units',
        'search_units',
        'get_unit_detail',
        'get_unit_linguistic_memory',
        'get_current_selection',
        'list_layers',
        'list_layer_links',
        'get_unsaved_drafts',
        'list_speakers',
        'list_notes',
        'list_notes_detail',
        'get_visible_timeline_state',
        'get_speaker_breakdown',
        'get_project_stats',
        'get_waveform_analysis',
        'get_acoustic_summary',
        'find_incomplete_units',
        'diagnose_quality',
        'suggest_next_action',
      ]),
    );
    expect(specs.batch_apply?.description).toContain('does not change data');
  });

  it('stays out of the tool list unless the caller opts in', () => {
    expect(buildRuntimeV2ToolSpecs().concordance_kwic).toBeUndefined();
    const specs = buildRuntimeV2ToolSpecs({ corpusAnalysis: true });
    expect(Object.keys(specs)).toEqual(
      expect.arrayContaining([
        'concordance_kwic',
        'query_morpheme_paradigm',
        'find_counterexamples',
      ]),
    );
  });

  it('drops read-model metadata from the message the model sees', () => {
    expect(
      corpusToolMessage({
        ok: true,
        hits: [{ morphemeId: 'm2' }],
        _readModel: { source: 'timeline_index' },
      }),
    ).toBe(JSON.stringify({ ok: true, hits: [{ morphemeId: 'm2' }] }));
  });
});
