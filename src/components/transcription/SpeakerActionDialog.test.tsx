// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeakerActionDialog } from './SpeakerActionDialog';

afterEach(cleanup);

describe('SpeakerActionDialog', () => {
  it('renders rename mode and updates the draft value', () => {
    const onDraftNameChange = vi.fn();

    render(
      <SpeakerActionDialog
        state={{
          mode: 'rename',
          speakerKey: 'speaker-1',
          speakerName: '旧名字',
          draftName: '旧名字',
        }}
        busy={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onDraftNameChange={onDraftNameChange}
        onTargetSpeakerChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('新的说话人名称'), { target: { value: '新名字' } });

    expect((screen.getByRole('button', { name: '确认改名' }) as HTMLButtonElement).disabled).toBe(false);
    expect(onDraftNameChange).toHaveBeenCalledWith('新名字');
  });

  it('renders merge mode and forwards target speaker changes', () => {
    const onTargetSpeakerChange = vi.fn();

    render(
      <SpeakerActionDialog
        state={{
          mode: 'merge',
          sourceSpeakerKey: 'speaker-1',
          sourceSpeakerName: '来源说话人',
          targetSpeakerKey: 'speaker-2',
          candidates: [
            { key: 'speaker-2', name: '目标说话人' },
            { key: 'speaker-3', name: '备用说话人' },
          ],
        }}
        busy={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onDraftNameChange={vi.fn()}
        onTargetSpeakerChange={onTargetSpeakerChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('目标说话人'), { target: { value: 'speaker-3' } });

    expect(screen.getByText((content) => content.includes('\u201c来源说话人\u201d') && content.includes('合并到目标说话人后'))).toBeTruthy();
    expect(onTargetSpeakerChange).toHaveBeenCalledWith('speaker-3');
  });

  it('renders clear mode and disables actions while busy', () => {
    const onClose = vi.fn();

    render(
      <SpeakerActionDialog
        state={{
          mode: 'clear',
          speakerKey: 'speaker-1',
          speakerName: '说话人甲',
          affectedCount: 3,
        }}
        busy={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        onDraftNameChange={vi.fn()}
        onTargetSpeakerChange={vi.fn()}
      />,
    );

    expect(screen.getByText('确认删除\u201c说话人甲\u201d的说话人标签？将影响 3 条句段。')).toBeTruthy();
    expect((screen.getByRole('button', { name: '处理中…' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders delete mode and forwards delete strategy changes', () => {
    const onTargetSpeakerChange = vi.fn();

    render(
      <SpeakerActionDialog
        state={{
          mode: 'delete',
          sourceSpeakerKey: 'speaker-1',
          sourceSpeakerName: '来源说话人',
          replacementSpeakerKey: '',
          candidates: [
            { key: 'speaker-2', name: '目标说话人' },
          ],
          affectedCount: 4,
        }}
        busy={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onDraftNameChange={vi.fn()}
        onTargetSpeakerChange={onTargetSpeakerChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('删除策略'), { target: { value: 'speaker-2' } });

    const dialog = screen.getByRole('dialog', { name: '删除说话人实体' });
    const overlay = dialog.parentElement;

    expect(screen.getByText('删除说话人实体“来源说话人”后，将影响 4 条句段。')).toBeTruthy();
    expect(screen.getByText('风险提示：若选择删除说话人标签，相关句段将失去说话人归属。建议优先迁移到其他说话人。')).toBeTruthy();
    expect(onTargetSpeakerChange).toHaveBeenCalledWith('speaker-2');
    expect(screen.getByRole('button', { name: '确认删除说话人实体' })).toBeTruthy();
    expect(overlay?.classList.contains('dialog-overlay-topmost')).toBe(true);
  });
});