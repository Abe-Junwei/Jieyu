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

  it('keeps move, rename, and delete in the row menu', () => {
    const onMove = vi.fn();
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
        onMove={onMove}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('转写')).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: '上移' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '更多' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '上移' }));
    expect(onMove).toHaveBeenCalledWith('layer-1', 'up');
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
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '更多' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '改名' }));
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

  it('offers return-to-root only on a transcription layer', () => {
    render(
      <DesktopTranscriptionLayerList
        locale="zh-CN"
        layers={[
          {
            id: 'tx',
            name: { zh: '木雅语' },
            contentType: 'transcription',
            tierType: 'time-aligned',
            contentCount: 0,
          },
          {
            id: 'tr',
            name: { zh: '汉语' },
            contentType: 'translation',
            tierType: 'symbolic-association',
            contentCount: 0,
          },
        ]}
        links={[{ layerId: 'tr', hostLayerId: 'tx', isPreferred: true, sortOrder: 0 }]}
        currentId="tx"
        error=""
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        drag={{
          draggedIds: [],
          mark: () => null,
          offset: 0,
          dropLayerId: null,
          dropKind: null,
          reasonKey: null,
          x: 0,
          y: 0,
          shift: () => 0,
          onPointerDown: vi.fn(),
          onPointerUp: vi.fn(),
          attachReason: () => null,
          returnReason: () => null,
          showReturn: (id) => id === 'tx',
          attachToCurrent: vi.fn(),
          returnToRoot: vi.fn(),
        }}
      />,
    );
    const menus = screen.getAllByRole('button', { name: '更多' });
    fireEvent.click(menus[1]!);
    expect(screen.queryByRole('menuitem', { name: '回到顶层' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: '挂到当前转写层' })).toBeTruthy();
    fireEvent.click(menus[0]!);
    expect(screen.getByRole('menuitem', { name: '回到顶层' })).toBeTruthy();
  });
});
