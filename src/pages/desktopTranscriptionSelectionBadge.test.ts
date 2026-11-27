import { describe, expect, it } from 'vitest';
import { selectionBadgeLabel } from './desktopTranscriptionSelectionBadge';

describe('selectionBadgeLabel', () => {
  const text = {
    selected: (count: number) => `已选 ${count} 段`,
    filtering: '筛选中',
  };

  it('hides under two selections', () => {
    expect(selectionBadgeLabel(0, false, text)).toBeNull();
    expect(selectionBadgeLabel(1, true, text)).toBeNull();
  });

  it('shows the count, and the filter prefix only while filtering', () => {
    expect(selectionBadgeLabel(2, false, text)).toBe('已选 2 段');
    expect(selectionBadgeLabel(2, true, text)).toBe('筛选中 · 已选 2 段');
  });
});
