// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchReplaceOverlay } from './SearchReplaceOverlay';

afterEach(() => {
  cleanup();
});

describe('SearchReplaceOverlay', () => {
  it('applies initial query and layer kind filters from shell/tool requests', async () => {
    const onNavigate = vi.fn();

    render(
      <SearchReplaceOverlay
        items={[
          { utteranceId: 'u1', layerId: 'trc-1', layerKind: 'transcription', text: 'hello source' },
          { utteranceId: 'u2', layerId: 'trl-1', layerKind: 'translation', text: 'hello translation' },
        ]}
        currentLayerId="trc-1"
        currentUtteranceId="u1"
        initialQuery="hello"
        initialScope="global"
        initialLayerKinds={['translation']}
        onNavigate={onNavigate}
        onReplace={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect((screen.getByPlaceholderText('搜索…') as HTMLInputElement).value).toBe('hello');
    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith('u2');
      expect(screen.getByText('1/1')).toBeTruthy();
    });
  });

  it('renders preview with orthography-aware bidi policy', async () => {
    render(
      <SearchReplaceOverlay
        items={[
          {
            utteranceId: 'u1',
            layerId: 'trc-ar',
            layerKind: 'transcription',
            languageId: 'ara',
            orthographyId: 'ortho-ar',
            text: 'هذا اختبار مرحبا بالعالم',
          },
        ]}
        orthographies={[
          {
            id: 'ortho-ar',
            languageId: 'ara',
            name: { zho: '阿拉伯文方案', eng: 'Arabic Orthography' },
            scriptTag: 'Arab',
            direction: 'rtl',
            bidiPolicy: {
              isolateInlineRuns: true,
              preferDirAttribute: true,
            },
            fontPreferences: {
              primary: ['Scheherazade New'],
            },
            createdAt: '2026-03-31T00:00:00.000Z',
          },
        ]}
        currentLayerId="trc-ar"
        currentUtteranceId="u1"
        initialQuery="مرحبا"
        onNavigate={vi.fn()}
        onReplace={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const preview = await screen.findByTestId('search-replace-preview');
    expect(preview.getAttribute('dir')).toBe('rtl');
    expect(preview.style.direction).toBe('rtl');
    expect(preview.style.unicodeBidi).toBe('isolate');
  });
});