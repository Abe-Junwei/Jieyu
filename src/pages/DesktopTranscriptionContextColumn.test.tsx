/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopTranscriptionContextColumn } from './DesktopTranscriptionContextColumn';

const props = {
  locale: 'zh-CN' as const,
  manuscripts: [{ id: 'ms-1', title: { zh: '村口对话' } }],
  manuscriptId: 'ms-1',
  layerId: null,
  layers: [],
  links: [],
  layerError: '',
  onRenameLayer: vi.fn(),
  onMoveLayer: vi.fn(),
  onDeleteLayer: vi.fn(),
  onSelectLayer: vi.fn(),
  units: [],
  durationLabel: null,
  speakerCount: 0,
  selectedUnitId: null,
  onSelectManuscript: vi.fn(),
  onSelectUnit: vi.fn(),
};

describe('DesktopTranscriptionContextColumn', () => {
  afterEach(() => cleanup());

  it('expands a collapsed section from the header row, including its count', () => {
    render(<DesktopTranscriptionContextColumn {...props} />);
    expect(screen.queryByRole('button', { name: /村口对话/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '层0' }));

    expect(screen.getByRole('button', { name: '层0' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '稿件' }));
    expect(screen.getByRole('button', { name: /村口对话/ })).toBeTruthy();
  });

  it('hangs the layer under the host chosen in the dialog', async () => {
    const onSetHosts = vi.fn();
    const layers = [
      {
        id: 'tx-1',
        name: { zh: '国际音标' },
        contentType: 'transcription',
        tierType: 'time-aligned',
        sortOrder: 0,
        contentCount: 0,
      },
      {
        id: 'tx-2',
        name: { zh: '汉字转写' },
        contentType: 'transcription',
        tierType: 'time-aligned',
        sortOrder: 1,
        contentCount: 0,
      },
      {
        id: 'tl-1',
        name: { zh: '英语' },
        contentType: 'translation',
        tierType: 'symbolic-association',
        sortOrder: 0,
        contentCount: 0,
      },
    ];
    const links = [
      {
        layerId: 'tl-1',
        hostLayerId: 'tx-1',
        isPreferred: true,
        sortOrder: 0,
        linkType: 'free' as const,
      },
    ];
    const { rerender, container } = render(
      <DesktopTranscriptionContextColumn
        {...props}
        layers={layers}
        links={links}
        onPreviewHosts={vi.fn().mockResolvedValue({ removed: [], blocked: false })}
        onSetHosts={onSetHosts}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '层3' }));
    const names = () =>
      [...container.querySelectorAll('.desktop-tx-layer-list__line .desktop-tx-context__name')].map(
        (node) => node.textContent,
      );
    expect(names()).toEqual(['国际音标', '英语', '汉字转写']);
    rerender(
      <DesktopTranscriptionContextColumn
        {...props}
        layers={layers}
        links={links}
        onPreviewHosts={vi.fn().mockResolvedValue({ removed: [], blocked: false })}
        onSetHosts={onSetHosts}
        layerRequest={{ nonce: 1, layerId: 'tl-1', action: 'hosts' }}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: '汉字转写' }));
    fireEvent.click(screen.getByRole('radio', { name: '汉字转写 首选' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSetHosts).toHaveBeenCalledWith(
      expect.objectContaining({ preferredHostLayerId: 'tx-2', hostLayerIds: ['tx-1', 'tx-2'] }),
    );
    rerender(
      <DesktopTranscriptionContextColumn
        {...props}
        layers={layers}
        links={[
          {
            layerId: 'tl-1',
            hostLayerId: 'tx-2',
            isPreferred: true,
            sortOrder: 0,
            linkType: 'free' as const,
          },
        ]}
        onPreviewHosts={vi.fn().mockResolvedValue({ removed: [], blocked: false })}
        onSetHosts={onSetHosts}
      />,
    );
    expect(names()).toEqual(['国际音标', '汉字转写', '英语']);
  });
});
