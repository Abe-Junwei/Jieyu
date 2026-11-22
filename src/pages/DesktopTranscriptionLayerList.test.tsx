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
        onCreate={vi.fn()}
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
        onCreate={vi.fn()}
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

  it('names a new transcription 转写 and a new translation 译文, then numbers copies', () => {
    const onCreate = vi.fn();
    const { rerender } = render(
      <DesktopTranscriptionLayerList
        locale="zh-CN"
        layers={[layer]}
        links={[]}
        currentId={null}
        error=""
        onSelect={vi.fn()}
        onCreate={onCreate}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '新建转写层' }));
    fireEvent.click(screen.getByRole('button', { name: '新建翻译层' }));
    expect(onCreate).toHaveBeenNthCalledWith(1, 'transcription', '转写');
    expect(onCreate).toHaveBeenNthCalledWith(2, 'translation', '译文');

    rerender(
      <DesktopTranscriptionLayerList
        locale="zh-CN"
        layers={[
          { ...layer, name: { zh: '转写' } },
          {
            id: 'layer-2',
            name: { zh: '译文' },
            contentType: 'translation',
            tierType: 'symbolic-association',
            contentCount: 0,
          },
        ]}
        links={[]}
        currentId={null}
        error=""
        onSelect={vi.fn()}
        onCreate={onCreate}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '新建转写层' }));
    fireEvent.click(screen.getByRole('button', { name: '新建翻译层' }));
    expect(onCreate).toHaveBeenNthCalledWith(3, 'transcription', '转写 2');
    expect(onCreate).toHaveBeenNthCalledWith(4, 'translation', '译文 2');
  });

  it('asks for one recording pair at a time', () => {
    const onCreatePair = vi.fn();
    render(
      <DesktopTranscriptionLayerList
        locale="zh-CN"
        layers={[layer]}
        links={[]}
        currentId="layer-1"
        error=""
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onCreatePair={onCreatePair}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '新建语音转写' }));
    fireEvent.click(screen.getByRole('button', { name: '新建口译' }));
    expect(onCreatePair).toHaveBeenNthCalledWith(1, 'voice', '语音转写', '语音转写文本');
    expect(onCreatePair).toHaveBeenNthCalledWith(2, 'oral', '口译', '口译文');
  });
});
