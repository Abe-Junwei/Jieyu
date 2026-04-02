// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import { DevErrorAggregationPanel } from './DevErrorAggregationPanel';
import {
  recordStructuredError,
  resetStructuredErrorAggregation,
} from '../observability/errorAggregation';

describe('DevErrorAggregationPanel', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    resetStructuredErrorAggregation();
  });

  it('does not render when there are no aggregated errors', () => {
    render(<DevErrorAggregationPanel />);
    expect(screen.queryByText(/Error Aggregation/)).toBeNull();
  });

  it('renders aggregated errors and refreshes by polling', () => {
    vi.useFakeTimers();
    render(<DevErrorAggregationPanel />);

    recordStructuredError({
      category: 'action',
      action: '导入文件',
      recoverable: true,
      i18nKey: 'transcription.importExport.failed',
    });

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(screen.getByText(/Error Aggregation/)).toBeTruthy();
    expect(screen.getByText(/1x/)).toBeTruthy();
    expect(screen.getByText(/action · 导入文件 · (i18nKey: )?transcription\.importExport\.failed · recoverable/)).toBeTruthy();
  });
});
