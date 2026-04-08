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

  it('renders as a fixed disclosure panel with stable shell classes', () => {
    vi.useFakeTimers();
    recordStructuredError({
      category: 'action',
      action: '导入文件',
      recoverable: true,
      i18nKey: 'transcription.importExport.failed',
    });

    const { container } = render(<DevErrorAggregationPanel />);

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    const panel = container.querySelector('.dev-error-aggregation-panel') as HTMLDetailsElement;
    const summary = container.querySelector('.dev-error-aggregation-panel-summary') as HTMLElement;
    const list = container.querySelector('.dev-error-aggregation-panel-list') as HTMLDivElement;

    expect(panel).toBeTruthy();
    expect(summary).toBeTruthy();
    expect(list).toBeTruthy();
    expect(panel.getAttribute('style')).toContain('--dev-error-panel-min-width');
    expect(panel.getAttribute('style')).toContain('--dev-error-panel-max-width');
    expect(panel.getAttribute('style')).toContain('--dev-error-panel-font-size');
    expect(summary.textContent).toContain('Error Aggregation (1)');
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
