// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiPanelContext, useAiPanelContext, type AiPanelContextValue } from './AiPanelContext';

function Probe() {
  const value = useAiPanelContext();
  return (
    <div>
      <span data-testid="db-name">{value.dbName}</span>
      <span data-testid="utt-count">{value.unitCount}</span>
      <button
        type="button"
        onClick={() => {
          void value.onUpdateTokenPos?.('tok_1', 'N');
        }}
      >
        update-pos
      </button>
    </div>
  );
}

const makeContextValue = (overrides: Partial<AiPanelContextValue> = {}): AiPanelContextValue => ({
  dbName: 'db-a',
  unitCount: 3,
  translationLayerCount: 1,
  aiConfidenceAvg: null,
  selectedUnit: null,
  selectedRowMeta: null,
  selectedAiWarning: false,
  lexemeMatches: [],
  ...overrides,
});

describe('useAiPanelContext', () => {
  it('throws when used outside provider', () => {
    expect(() => render(<Probe />)).toThrowError(
      'useAiPanelContext must be used within AiPanelContext.Provider',
    );
  });

  it('reads latest provider value and keeps action callbacks callable', () => {
    const onUpdateTokenPos = vi.fn();

    const { rerender } = render(
      <AiPanelContext.Provider value={makeContextValue({ onUpdateTokenPos })}>
        <Probe />
      </AiPanelContext.Provider>,
    );

    expect(screen.getByTestId('db-name').textContent).toBe('db-a');
    expect(screen.getByTestId('utt-count').textContent).toBe('3');

    screen.getByText('update-pos').click();
    expect(onUpdateTokenPos).toHaveBeenCalledWith('tok_1', 'N');

    rerender(
      <AiPanelContext.Provider value={makeContextValue({ dbName: 'db-b', unitCount: 7, onUpdateTokenPos })}>
        <Probe />
      </AiPanelContext.Provider>,
    );

    expect(screen.getByTestId('db-name').textContent).toBe('db-b');
    expect(screen.getByTestId('utt-count').textContent).toBe('7');
  });
});
