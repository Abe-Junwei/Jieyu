// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchReplaceOverlay } from './SearchReplaceOverlay';

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
});