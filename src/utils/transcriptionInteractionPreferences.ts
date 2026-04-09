export type WaveformDoubleClickAction = 'zoom-selection' | 'create-segment';
export type NewSegmentSelectionBehavior = 'select-created' | 'keep-current';

export const WAVEFORM_DOUBLE_CLICK_ACTION_KEY = 'jieyu:waveform-double-click-action';
export const NEW_SEGMENT_SELECTION_BEHAVIOR_KEY = 'jieyu:new-segment-selection-behavior';

export function readStoredWaveformDoubleClickAction(): WaveformDoubleClickAction {
  try {
    const stored = localStorage.getItem(WAVEFORM_DOUBLE_CLICK_ACTION_KEY);
    return stored === 'create-segment' ? 'create-segment' : 'zoom-selection';
  } catch {
    return 'zoom-selection';
  }
}

export function readStoredNewSegmentSelectionBehavior(): NewSegmentSelectionBehavior {
  try {
    const stored = localStorage.getItem(NEW_SEGMENT_SELECTION_BEHAVIOR_KEY);
    return stored === 'keep-current' ? 'keep-current' : 'select-created';
  } catch {
    return 'select-created';
  }
}
