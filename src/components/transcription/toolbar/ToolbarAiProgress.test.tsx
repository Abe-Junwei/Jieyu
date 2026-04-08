/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../../i18n';
import { ToolbarAiProgress } from './ToolbarAiProgress';

describe('ToolbarAiProgress', () => {
  it('renders compact acoustic and VAD progress badges while work is active', () => {
    render(
      <LocaleProvider locale="zh-CN">
        <ToolbarAiProgress
          acousticRuntimeStatus={{ state: 'loading', phase: 'analyzing', progressRatio: 0.4, processedFrames: 40, totalFrames: 100 }}
          vadCacheStatus={{ state: 'warming', engine: 'silero', progressRatio: 0.25, processedFrames: 25, totalFrames: 100 }}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText('分析进度 40%')).toBeTruthy();
    expect(screen.getByText('VAD 缓存 25%')).toBeTruthy();
  });

  it('renders an acoustic failure badge when runtime failed', () => {
    render(
      <LocaleProvider locale="zh-CN">
        <ToolbarAiProgress acousticRuntimeStatus={{ state: 'error' }} />
      </LocaleProvider>,
    );

    expect(screen.getByText('分析失败')).toBeTruthy();
  });

  it('renders nothing when no foreground progress is active', () => {
    const { container } = render(
      <LocaleProvider locale="zh-CN">
        <ToolbarAiProgress
          acousticRuntimeStatus={{ state: 'ready', phase: 'done', progressRatio: 1, processedFrames: 100, totalFrames: 100 }}
          vadCacheStatus={{ state: 'ready', engine: 'silero', segmentCount: 3 }}
        />
      </LocaleProvider>,
    );

    expect(container.firstChild).toBeNull();
  });
});