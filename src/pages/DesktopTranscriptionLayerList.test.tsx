/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopTranscriptionLayerList } from './DesktopTranscriptionLayerList';

const layer = {
  id: 'layer-1',
  name: { zh: '木雅语' },
  contentType: 'transcription',
  tierType: 'transcription' as string | undefined,
  contentCount: 0,
};

describe('DesktopTranscriptionLayerList', () => {
  afterEach(() => cleanup());

  it('soft-deletes an empty layer when asked', () => {
    const onDelete = vi.fn();
    render(
      <DesktopTranscriptionLayerList
        locale="zh-CN"
        layers={[layer]}
        links={[]}
        currentId="layer-1"
        error=""
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onDelete={onDelete}
        request={{ nonce: 1, layerId: 'layer-1', action: 'delete' }}
      />,
    );
    expect(onDelete).toHaveBeenCalledWith('layer-1', 'soft');
  });

  it('writes a rename when the field loses focus', () => {
    const onRename = vi.fn();
    render(
      <DesktopTranscriptionLayerList
        locale="zh-CN"
        layers={[layer]}
        links={[]}
        currentId={null}
        error=""
        onSelect={vi.fn()}
        onRename={onRename}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        request={{ nonce: 1, layerId: 'layer-1', action: 'rename' }}
      />,
    );
    const field = screen.getByRole('textbox', { name: '改名' });
    fireEvent.change(field, { target: { value: '东部方言' } });
    fireEvent.blur(field);

    expect(onRename).toHaveBeenCalledWith('layer-1', { zh: '东部方言' });
    expect(screen.queryByRole('textbox', { name: '改名' })).toBeNull();
  });
});
