// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSidePaneSidebarMessages } from '../../i18n/sidePaneSidebarMessages';
import {
  LEFT_RAIL_TRANSCRIPTION_LAYER_ACTIONS_SLOT_ID,
  TranscriptionLeftRailLayerActions,
} from './TranscriptionLeftRailLayerActions';

function mountLeftRailHost(): HTMLDivElement {
  const host = document.createElement('div');
  host.id = LEFT_RAIL_TRANSCRIPTION_LAYER_ACTIONS_SLOT_ID;
  document.body.appendChild(host);
  return host;
}

describe('TranscriptionLeftRailLayerActions', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('allows switching to vertical layout even when translation layer count is zero', async () => {
    mountLeftRailHost();
    const onSelectVerticalMode = vi.fn();

    render(
      <TranscriptionLeftRailLayerActions
        messages={getSidePaneSidebarMessages('zh-CN')}
        disableCreateTranslationEntry={false}
        onCreateTranscription={vi.fn()}
        onCreateTranslation={vi.fn()}
        workspaceTimelineLayout={{
          locale: 'zh-CN',
          verticalViewActive: false,
          translationLayerCount: 0,
          onSelectHorizontalMode: vi.fn(),
          onSelectVerticalMode,
        }}
      />,
    );

    const toggle = await screen.findByTestId('left-rail-workspace-layout-toggle');
    expect((toggle as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(toggle);
    expect(onSelectVerticalMode).toHaveBeenCalledTimes(1);
  });

  it('switches back to horizontal when currently in comparison view', async () => {
    mountLeftRailHost();
    const onSelectHorizontalMode = vi.fn();

    render(
      <TranscriptionLeftRailLayerActions
        messages={getSidePaneSidebarMessages('zh-CN')}
        disableCreateTranslationEntry={false}
        onCreateTranscription={vi.fn()}
        onCreateTranslation={vi.fn()}
        workspaceTimelineLayout={{
          locale: 'zh-CN',
          verticalViewActive: true,
          translationLayerCount: 0,
          onSelectHorizontalMode,
          onSelectVerticalMode: vi.fn(),
        }}
      />,
    );

    const toggle = await screen.findByTestId('left-rail-workspace-layout-toggle');
    fireEvent.click(toggle);
    expect(onSelectHorizontalMode).toHaveBeenCalledTimes(1);
  });
});
