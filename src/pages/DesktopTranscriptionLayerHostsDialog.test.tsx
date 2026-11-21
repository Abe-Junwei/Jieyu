/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopTranscriptionLayerHostsDialog } from './DesktopTranscriptionLayerHostsDialog';
import { DesktopTranscriptionLayerList } from './DesktopTranscriptionLayerList';

const hosts = [
  {
    id: 'tx-1',
    name: { zh: '国际音标' },
    contentType: 'transcription',
    tierType: 'time-aligned',
    contentCount: 1,
  },
  {
    id: 'tx-2',
    name: { zh: '汉字转写' },
    contentType: 'transcription',
    tierType: 'time-aligned',
    contentCount: 1,
  },
];

const translation = {
  id: 'tl-1',
  name: { zh: '英语' },
  contentType: 'translation',
  tierType: 'symbolic-association',
  contentCount: 1,
};

const links = [
  {
    layerId: 'tl-1',
    hostLayerId: 'tx-1',
    isPreferred: true,
    sortOrder: 0,
    linkType: 'free' as const,
  },
  {
    layerId: 'tl-1',
    hostLayerId: 'tx-2',
    isPreferred: false,
    sortOrder: 1,
    linkType: 'free' as const,
  },
];

describe('layer host dialog', () => {
  afterEach(() => cleanup());

  it('shows the hosts menu only on a symbolic layer', () => {
    render(
      <DesktopTranscriptionLayerList
        locale="zh-CN"
        layers={[hosts[0]!, translation]}
        links={links}
        currentId={null}
        error=""
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onPreviewHosts={vi.fn()}
        onSetHosts={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: '更多' })[0]!);
    expect(screen.queryByRole('menuitem', { name: '依附关系…' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getAllByRole('button', { name: '更多' })[1]!);
    expect(screen.getByRole('menuitem', { name: '依附关系…' })).toBeTruthy();
  });

  it('disables save and explains when detaching a host that still has text', async () => {
    const onPreview = vi.fn().mockResolvedValue({
      removed: [{ hostLayerId: 'tx-2', texts: 12, drafts: 1 }],
      blocked: true,
    });
    render(
      <DesktopTranscriptionLayerHostsDialog
        locale="zh-CN"
        layer={translation}
        layers={[...hosts, translation]}
        links={links}
        descendantIds={[]}
        onPreview={onPreview}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: '汉字转写' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('还有 12 条正文、1 条草稿');
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByText('有 12 条正文')).toBeTruthy();
  });

  it('saves the new preferred host', async () => {
    const onSave = vi.fn();
    const onPreview = vi.fn().mockResolvedValue({ removed: [], blocked: false });
    render(
      <DesktopTranscriptionLayerHostsDialog
        locale="zh-CN"
        layer={translation}
        layers={[...hosts, translation]}
        links={links}
        descendantIds={[]}
        onPreview={onPreview}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: '汉字转写 首选' }));
    expect(await screen.findByText('改首选宿主后，本层排到新宿主的从属层末尾。')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledWith({
      layerId: 'tl-1',
      hostLayerIds: ['tx-1', 'tx-2'],
      preferredHostLayerId: 'tx-2',
      linkType: 'free',
    });
  });
});
