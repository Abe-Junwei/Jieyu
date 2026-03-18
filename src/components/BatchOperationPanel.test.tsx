// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BatchOperationPanel } from './BatchOperationPanel';

function makeUtterance(id: string, startTime: number, endTime: number) {
  return { id, startTime, endTime };
}

describe('BatchOperationPanel preview table', () => {
  afterEach(() => {
    cleanup();
  });
  it('shows overlap conflict for offset preview and blocks submit', () => {
    render(
      <BatchOperationPanel
        selectedCount={1}
        selectedUtterances={[makeUtterance('u1', 0, 1)]}
        allUtterancesOnMedia={[makeUtterance('u1', 0, 1), makeUtterance('u2', 1.1, 2)]}
        utteranceTextById={{ u1: 'hello world' }}
        onClose={vi.fn()}
        onOffset={vi.fn().mockResolvedValue(undefined)}
        onScale={vi.fn().mockResolvedValue(undefined)}
        onSplitByRegex={vi.fn().mockResolvedValue(undefined)}
        onMerge={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('0.200'), { target: { value: '0.500' } });

    expect(screen.getByText('与相邻句段重叠')).toBeTruthy();
    expect(screen.getByText('存在阻断冲突，执行会失败。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '执行偏移' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows invalid regex as blocking conflict in split preview', () => {
    render(
      <BatchOperationPanel
        selectedCount={1}
        selectedUtterances={[makeUtterance('u1', 0, 1)]}
        allUtterancesOnMedia={[makeUtterance('u1', 0, 1)]}
        utteranceTextById={{ u1: 'a,b,c' }}
        onClose={vi.fn()}
        onOffset={vi.fn().mockResolvedValue(undefined)}
        onScale={vi.fn().mockResolvedValue(undefined)}
        onSplitByRegex={vi.fn().mockResolvedValue(undefined)}
        onMerge={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '正则拆分' }));
    fireEvent.change(screen.getByDisplayValue('[,，。？！;；]\\s*'), { target: { value: '[' } });

    expect(screen.getByText('正则表达式无效。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '执行拆分' }).hasAttribute('disabled')).toBe(true);
  });

  it('keeps toggle visible when no conflicts under conflict-only mode', () => {
    render(
      <BatchOperationPanel
        selectedCount={1}
        selectedUtterances={[makeUtterance('u1', 0, 1)]}
        allUtterancesOnMedia={[makeUtterance('u1', 0, 1), makeUtterance('u2', 1.1, 2)]}
        utteranceTextById={{ u1: 'hello world' }}
        onClose={vi.fn()}
        onOffset={vi.fn().mockResolvedValue(undefined)}
        onScale={vi.fn().mockResolvedValue(undefined)}
        onSplitByRegex={vi.fn().mockResolvedValue(undefined)}
        onMerge={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('0.200'), { target: { value: '0.500' } });
    fireEvent.click(screen.getByRole('button', { name: '只看冲突' }));
    expect(screen.getByText('u1')).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('0.500'), { target: { value: '0.050' } });
    expect(screen.getByRole('button', { name: '显示全部' })).toBeTruthy();
    expect(screen.getByText('暂无可展示的预览行')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '显示全部' }));
    expect(screen.getByText('u1')).toBeTruthy();
  });

  it('supports layer-wide quick preview for all utterances', () => {
    render(
      <BatchOperationPanel
        selectedCount={0}
        selectedUtterances={[]}
        allUtterancesOnMedia={[makeUtterance('u1', 0, 1), makeUtterance('u2', 1.1, 2)]}
        utteranceTextById={{}}
        previewLayerOptions={[{ id: 'layer_1', label: '转写层 1' }]}
        previewTextByLayerId={{
          layer_1: {
            u1: 'a,b',
            u2: 'c,d',
          },
        }}
        defaultPreviewLayerId="layer_1"
        onClose={vi.fn()}
        onOffset={vi.fn().mockResolvedValue(undefined)}
        onScale={vi.fn().mockResolvedValue(undefined)}
        onSplitByRegex={vi.fn().mockResolvedValue(undefined)}
        onMerge={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: '预览范围' }), { target: { value: 'layer-all' } });
    fireEvent.click(screen.getByRole('button', { name: '正则拆分' }));

    expect(screen.getByText('u1')).toBeTruthy();
    expect(screen.getByText('u2')).toBeTruthy();
    expect(screen.getByText('已切换为层级全量预览（2 条）。执行仍只作用于当前选中句段。')).toBeTruthy();
  });

  it('shows utterance content and supports jump for each row', () => {
    const onJump = vi.fn();
    const onClose = vi.fn();
    render(
      <BatchOperationPanel
        selectedCount={1}
        selectedUtterances={[makeUtterance('u1', 0, 1)]}
        allUtterancesOnMedia={[makeUtterance('u1', 0, 1)]}
        utteranceTextById={{ u1: '当前句段内容示例' }}
        onClose={onClose}
        onOffset={vi.fn().mockResolvedValue(undefined)}
        onScale={vi.fn().mockResolvedValue(undefined)}
        onSplitByRegex={vi.fn().mockResolvedValue(undefined)}
        onMerge={vi.fn().mockResolvedValue(undefined)}
        onJumpToUtterance={onJump}
      />,
    );

    expect(screen.getByText('句段内容')).toBeTruthy();
    expect(screen.getByText('当前句段内容示例')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '跳转' }));
    expect(onJump).toHaveBeenCalledWith('u1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
