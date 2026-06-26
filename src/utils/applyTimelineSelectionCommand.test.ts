import { describe, expect, it, vi } from 'vitest';
import {
  applyTimelineSelectionCommand,
  writeTimelineSelection,
  type TimelineSelectionCommandDeps,
} from './applyTimelineSelectionCommand';

function createDeps(
  overrides: Partial<TimelineSelectionCommandDeps> = {},
): TimelineSelectionCommandDeps {
  return {
    selectTimelineUnit: vi.fn(),
    selectUnit: vi.fn(),
    selectUnitRange: vi.fn(),
    toggleUnitSelection: vi.fn(),
    toggleSegmentSelection: vi.fn(),
    selectSegmentRange: vi.fn(),
    clearUnitSelection: vi.fn(),
    selectAllUnits: vi.fn(),
    ...overrides,
  };
}

describe('applyTimelineSelectionCommand', () => {
  it('routes clear to clearUnitSelection', () => {
    const clearUnitSelection = vi.fn();
    applyTimelineSelectionCommand({ type: 'clear' }, createDeps({ clearUnitSelection }));
    expect(clearUnitSelection).toHaveBeenCalledTimes(1);
  });

  it('routes selectTimelineUnit to deps', () => {
    const selectTimelineUnit = vi.fn();
    const unit = { layerId: 'l1', unitId: 'u1', kind: 'unit' as const };
    applyTimelineSelectionCommand(
      { type: 'selectTimelineUnit', unit },
      createDeps({ selectTimelineUnit }),
    );
    expect(selectTimelineUnit).toHaveBeenCalledWith(unit);
  });

  it('routes waveform segment commands to deps', () => {
    const toggleSegmentSelection = vi.fn();
    const selectSegmentRange = vi.fn();
    const items = [{ id: 's1' }, { id: 's2' }];
    applyTimelineSelectionCommand(
      { type: 'toggleSegmentSelection', segmentId: 's1' },
      createDeps({ toggleSegmentSelection }),
    );
    applyTimelineSelectionCommand(
      {
        type: 'selectSegmentRange',
        anchorId: 's1',
        targetId: 's2',
        waveformTimelineItems: items,
      },
      createDeps({ selectSegmentRange }),
    );
    expect(toggleSegmentSelection).toHaveBeenCalledWith('s1');
    expect(selectSegmentRange).toHaveBeenCalledWith('s1', 's2', items);
  });

  it('routes selectAll to selectAllUnits', () => {
    const selectAllUnits = vi.fn();
    applyTimelineSelectionCommand({ type: 'selectAll' }, createDeps({ selectAllUnits }));
    expect(selectAllUnits).toHaveBeenCalledTimes(1);
  });
});

describe('writeTimelineSelection', () => {
  it('prefers applyTimelineSelectionCommand when funnel is wired', () => {
    const funnel = vi.fn();
    const selectUnit = vi.fn();
    writeTimelineSelection(
      { type: 'selectUnit', unitId: 'u1' },
      {
        applyTimelineSelectionCommand: funnel,
        ...createDeps({ selectUnit }),
      },
    );
    expect(funnel).toHaveBeenCalledWith({ type: 'selectUnit', unitId: 'u1' });
    expect(selectUnit).not.toHaveBeenCalled();
  });
});
