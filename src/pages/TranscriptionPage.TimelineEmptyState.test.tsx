// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithLocale } from '../test/localeTestUtils';
import { TranscriptionPageTimelineEmptyState } from './TranscriptionPage.TimelineEmptyState';
import { buildEmptyTimelinePolicy } from '../utils/emptyTimelinePolicy';

describe('TranscriptionPageTimelineEmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders create transcription action from shared layer action labels', () => {
    const onCreateTranscriptionLayer = vi.fn();

    renderWithLocale(
      <TranscriptionPageTimelineEmptyState
        locale="zh-CN"
        policy={buildEmptyTimelinePolicy({
          layersCount: 0,
          hasSelectedMedia: false,
          currentMediaUnitCount: 0,
        })}
        onCreateTranscriptionLayer={onCreateTranscriptionLayer}
        onOpenImportFile={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '请导入媒体或文本文件开始工作' })).toBeTruthy();
    expect(screen.getByText('请先创建转写层或翻译层')).toBeTruthy();

    const createButton = screen.getByRole('button', { name: '新建转写层' });
    expect(createButton.className).toContain('btn-primary');
    fireEvent.click(createButton);

    expect(onCreateTranscriptionLayer).toHaveBeenCalledTimes(1);
  });

  it('renders import as primary when layers exist but no media is selected', () => {
    const onOpenImportFile = vi.fn();

    renderWithLocale(
      <TranscriptionPageTimelineEmptyState
        locale="zh-CN"
        policy={buildEmptyTimelinePolicy({
          layersCount: 1,
          hasSelectedMedia: false,
          currentMediaUnitCount: 0,
        })}
        onCreateTranscriptionLayer={vi.fn()}
        onOpenImportFile={onOpenImportFile}
      />,
    );

    expect(screen.getByRole('heading', { name: '请导入媒体或文本文件开始工作' })).toBeTruthy();
    const importButton = screen.getByRole('button', { name: '导入文件' });
    expect(importButton.className).toContain('btn-primary');
    fireEvent.click(importButton);
    expect(onOpenImportFile).toHaveBeenCalledTimes(1);
  });

  it('renders waveform-first empty card when media exists but has no units', () => {
    renderWithLocale(
      <TranscriptionPageTimelineEmptyState
        locale="zh-CN"
        policy={buildEmptyTimelinePolicy({
          layersCount: 1,
          hasSelectedMedia: true,
          currentMediaUnitCount: 0,
        })}
        onCreateTranscriptionLayer={vi.fn()}
        onOpenImportFile={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: '请在波形区拖拽选取或按 Enter 创建第一个句段' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing when policy hides empty chrome', () => {
    const { container } = renderWithLocale(
      <TranscriptionPageTimelineEmptyState
        locale="zh-CN"
        policy={buildEmptyTimelinePolicy({
          layersCount: 1,
          hasSelectedMedia: true,
          currentMediaUnitCount: 2,
        })}
        onCreateTranscriptionLayer={vi.fn()}
        onOpenImportFile={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
