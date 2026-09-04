export type AnnotationKeyboardMode = 'rowFocused' | 'inputFocused';

export type AnnotationKeyboardAction =
  | 'none'
  | 'playToggle'
  | 'insertSpace'
  | 'acceptSuggestion'
  | 'moveNext'
  | 'movePrev'
  | 'commitStay'
  | 'commitNext';

export type AnnotationKeyboardState = {
  mode: AnnotationKeyboardMode;
  focusedUnitId: string;
};

export type AnnotationKeyboardEvent =
  | { type: 'focusRow'; unitId: string }
  | { type: 'focusInput'; unitId: string }
  | {
      type: 'keydown';
      key: string;
      ctrlKey: boolean;
      shiftKey: boolean;
      hasSuggestion: boolean;
    };

export function stepAnnotationUnitId(
  unitIds: readonly string[],
  currentId: string,
  delta: number,
): string {
  if (unitIds.length === 0) return '';
  const index = unitIds.indexOf(currentId);
  const from = index >= 0 ? index : 0;
  const next = from + delta;
  if (next < 0) return unitIds[0] ?? '';
  if (next >= unitIds.length) return unitIds[unitIds.length - 1] ?? '';
  return unitIds[next] ?? currentId;
}

export function reduceAnnotationKeyboard(
  state: AnnotationKeyboardState,
  event: AnnotationKeyboardEvent,
  unitIds: readonly string[],
): { state: AnnotationKeyboardState; action: AnnotationKeyboardAction } {
  if (event.type === 'focusRow' || event.type === 'focusInput') {
    const id = event.unitId.trim();
    if (id.length === 0) return { state, action: 'none' };
    return {
      state: {
        mode: event.type === 'focusInput' ? 'inputFocused' : 'rowFocused',
        focusedUnitId: id,
      },
      action: 'none',
    };
  }

  const focusedUnitId =
    state.focusedUnitId.length > 0 && unitIds.includes(state.focusedUnitId)
      ? state.focusedUnitId
      : (unitIds[0] ?? '');
  if (focusedUnitId.length === 0) return { state, action: 'none' };

  const current: AnnotationKeyboardState = { ...state, focusedUnitId };
  const { key, ctrlKey, shiftKey, hasSuggestion } = event;

  if (key === ' ' || key === 'Spacebar' || key === 'Space') {
    if (current.mode === 'inputFocused') {
      return { state: current, action: 'insertSpace' };
    }
    return { state: current, action: 'playToggle' };
  }

  if (key === 'Tab') {
    if (current.mode === 'inputFocused' && !shiftKey && hasSuggestion) {
      return { state: current, action: 'acceptSuggestion' };
    }
    const action: AnnotationKeyboardAction = shiftKey ? 'movePrev' : 'moveNext';
    const nextId = stepAnnotationUnitId(unitIds, focusedUnitId, shiftKey ? -1 : 1);
    return { state: { ...current, focusedUnitId: nextId }, action };
  }

  if (key === 'Enter') {
    if (current.mode === 'rowFocused' && !ctrlKey) {
      return { state: { ...current, mode: 'inputFocused' }, action: 'none' };
    }
    if (current.mode === 'inputFocused' && ctrlKey) {
      return { state: current, action: 'commitNext' };
    }
    if (current.mode === 'inputFocused') {
      return { state: current, action: 'commitStay' };
    }
  }

  return { state: current, action: 'none' };
}
