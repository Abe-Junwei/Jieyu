import { describe, expect, it, vi } from 'vitest';
import { writeChosenTimelineText } from './writeChosenTimelineText';

describe('writeChosenTimelineText', () => {
  it('writes a chosen segment without touching the unit writers', async () => {
    const saveSegmentContentForLayer = vi.fn(async () => undefined);
    const saveUnitLayerText = vi.fn(async () => undefined);
    const saveUnitText = vi.fn(async () => undefined);
    await writeChosenTimelineText(
      { kind: 'segment', segmentId: 'seg-1', layerId: 'layer-1' },
      'hello',
      { saveSegmentContentForLayer, saveUnitLayerText, saveUnitText },
    );
    expect(saveSegmentContentForLayer).toHaveBeenCalledWith('seg-1', 'layer-1', 'hello');
    expect(saveUnitLayerText).not.toHaveBeenCalled();
    expect(saveUnitText).not.toHaveBeenCalled();
  });

  it('writes a chosen unit layer without touching the segment writer', async () => {
    const saveSegmentContentForLayer = vi.fn(async () => undefined);
    const saveUnitLayerText = vi.fn(async () => undefined);
    await writeChosenTimelineText(
      { kind: 'unit-layer', unitId: 'utt-1', layerId: 'layer-tr' },
      'gloss',
      { saveSegmentContentForLayer, saveUnitLayerText },
    );
    expect(saveUnitLayerText).toHaveBeenCalledWith('utt-1', 'gloss', 'layer-tr');
    expect(saveSegmentContentForLayer).not.toHaveBeenCalled();
  });

  it('writes chosen source text through the unit text writer', async () => {
    const saveUnitText = vi.fn(async () => undefined);
    const saveUnitLayerText = vi.fn(async () => undefined);
    await writeChosenTimelineText({ kind: 'unit-text', unitId: 'utt-1' }, 'pine', {
      saveUnitText,
      saveUnitLayerText,
    });
    expect(saveUnitText).toHaveBeenCalledWith('utt-1', 'pine', undefined);
    expect(saveUnitLayerText).not.toHaveBeenCalled();
  });
});
