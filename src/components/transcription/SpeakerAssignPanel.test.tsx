// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeakerAssignPanel } from './SpeakerAssignPanel';

afterEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
});

function createBaseProps() {
  return {
    selectedCount: 2,
    summary: '已选 2 条',
    batchSpeakerId: '',
    speakerOptions: [{ id: 'spk_1', name: '说话人 A', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    speakerDraftName: '',
    speakerSaving: false,
    onBatchSpeakerIdChange: vi.fn(),
    onAssign: vi.fn(),
    onDraftNameChange: vi.fn(),
    onCreateAndAssign: vi.fn(),
  };
}

describe('SpeakerAssignPanel', () => {
  it('restores persisted layout from localStorage', () => {
    window.localStorage.setItem('jieyu:speaker-assign-panel-rect', JSON.stringify({
      x: 120,
      y: 84,
      width: 420,
      height: 260,
    }));

    render(<SpeakerAssignPanel {...createBaseProps()} />);

    const panel = screen.getByRole('region', { name: '说话人批量指派面板' });
    const element = panel as HTMLElement;
    expect(element.style.left).toBe('120px');
    expect(element.style.top).toBe('84px');
    expect(element.style.width).toBe('420px');
    expect(element.style.minHeight).toBe('260px');
  });

  it('reset button clears persisted layout', () => {
    window.localStorage.setItem('jieyu:speaker-assign-panel-rect', JSON.stringify({
      x: 120,
      y: 84,
      width: 420,
      height: 260,
    }));

    render(<SpeakerAssignPanel {...createBaseProps()} />);

    fireEvent.click(screen.getByRole('button', { name: '重置位置与尺寸' }));

    const stored = window.localStorage.getItem('jieyu:speaker-assign-panel-rect');
    expect(stored).not.toBeNull();
    expect(stored).toContain('"width":360');
    expect(stored).toContain('"height":178');
  });
});
