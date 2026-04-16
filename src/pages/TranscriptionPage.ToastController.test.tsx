// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SaveState } from '../hooks/transcriptionTypes';
import { ToastController } from './TranscriptionPage.ToastController';

const showToast = vi.fn<(message: string, variant?: string, autoDismissMs?: number) => void>();
const showSaveState = vi.fn<(state: SaveState) => void>();
const showVoiceState = vi.fn<(mode: string | null, isListening?: boolean) => void>();

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showToast,
    showSaveState,
    showVoiceState,
    dismiss: vi.fn(),
  }),
}));

const baseProps = {
  voiceAgent: {
    agentState: 'idle',
    mode: 'command',
    listening: false,
    isRecording: false,
  },
  saveState: { kind: 'idle' } as SaveState,
  recording: false,
  recordingUnitId: null,
  recordingError: null,
  tf: (key: string, opts?: Record<string, unknown>) => {
    if (key === 'transcription.toast.overlapCandidates') {
      return `重叠候选 ${opts?.index}/${opts?.total}`;
    }
    if (key === 'transcription.toast.lockConflict') {
      return `锁定冲突 ${opts?.count} 项`;
    }
    if (key === 'transcription.toast.lockConflictWithSpeakers') {
      return `锁定冲突 ${opts?.count} 项：${opts?.speakers}`;
    }
    return key;
  },
};

describe('ToastController overlap cycle toast', () => {
  afterEach(() => {
    showToast.mockClear();
    showSaveState.mockClear();
    showVoiceState.mockClear();
  });

  it('shows lightweight toast when overlap cycle payload updates', () => {
    const { rerender } = render(
      <ToastController
        {...baseProps}
        overlapCycleToast={null}
      />,
    );

    expect(showToast).not.toHaveBeenCalledWith('重叠候选 2/4', 'info', 2000);

    rerender(
      <ToastController
        {...baseProps}
        overlapCycleToast={{ index: 2, total: 4, nonce: Date.now() }}
      />,
    );

    expect(showToast).toHaveBeenCalledWith('重叠候选 2/4', 'info', 2000);
  });

  it('does not show overlap cycle toast when payload is absent', () => {
    render(
      <ToastController
        {...baseProps}
        overlapCycleToast={null}
      />,
    );

    const overlapCalls = showToast.mock.calls.filter((call) => String(call[0]).includes('重叠候选'));
    expect(overlapCalls.length).toBe(0);
  });

  it('shows lock conflict toast when payload updates', () => {
    render(
      <ToastController
        {...baseProps}
        overlapCycleToast={null}
        lockConflictToast={{ count: 2, speakers: ['甲', '乙'], nonce: Date.now() }}
      />,
    );

    expect(showToast).toHaveBeenCalledWith('锁定冲突 2 项：甲、乙', 'info', 2000);
  });

  it('shows voice error toast when voice agent exposes error', () => {
    render(
      <ToastController
        {...baseProps}
        voiceAgent={{
          ...baseProps.voiceAgent,
          error: '语音唤醒启动失败，已自动关闭。请检查麦克风权限后重试。',
        }}
      />,
    );

    expect(showToast).toHaveBeenCalledWith('语音唤醒启动失败，已自动关闭。请检查麦克风权限后重试。', 'error', 0);
  });

  it('maps push-to-talk ready state to waiting voice toast semantics', () => {
    render(
      <ToastController
        {...baseProps}
        voiceAgent={{
          ...baseProps.voiceAgent,
          mode: 'dictation',
          listening: true,
          agentState: 'idle',
        }}
      />,
    );

    expect(showVoiceState).toHaveBeenCalledWith('dictation', false);
  });

  it('core-only mode skips voice toast syncing', () => {
    render(
      <ToastController
        {...baseProps}
        mode="core-only"
        saveState={{ kind: 'done', message: '保存完成' }}
        voiceAgent={{
          ...baseProps.voiceAgent,
          mode: 'dictation',
          listening: true,
          agentState: 'listening',
        }}
      />,
    );

    expect(showSaveState).toHaveBeenCalledWith({ kind: 'done', message: '保存完成' });
    expect(showVoiceState).not.toHaveBeenCalled();
  });

  it('voice-only mode skips core toast syncing', () => {
    render(
      <ToastController
        {...baseProps}
        mode="voice-only"
        saveState={{ kind: 'done', message: '保存完成' }}
        recordingError="录音异常"
        voiceAgent={{
          ...baseProps.voiceAgent,
          mode: 'dictation',
          listening: true,
          agentState: 'listening',
        }}
      />,
    );

    expect(showSaveState).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalledWith('录音异常', 'error', 0);
    expect(showVoiceState).toHaveBeenCalledWith('dictation', true);
  });

  it('shows webllm warmup event as toast', () => {
    render(
      <ToastController
        {...baseProps}
      />,
    );

    window.dispatchEvent(new CustomEvent('ai:webllm-warmup', {
      detail: { status: 'success', message: '模型已就绪' },
    }));

    expect(showToast).toHaveBeenCalledWith('模型已就绪', 'info', 2000);
  });

  it('shows cancelled webllm warmup event as info toast', () => {
    render(
      <ToastController
        {...baseProps}
      />,
    );

    window.dispatchEvent(new CustomEvent('ai:webllm-warmup', {
      detail: { status: 'cancelled', message: '已取消预热' },
    }));

    expect(showToast).toHaveBeenCalledWith('已取消预热', 'info', 2000);
  });

  it('shows taskrunner stale recovered event as toast', () => {
    render(
      <ToastController
        {...baseProps}
      />,
    );

    window.dispatchEvent(new CustomEvent('taskrunner:stale-recovered', {
      detail: { count: 3 },
    }));

    expect(showToast).toHaveBeenCalledWith('transcription.toast.taskRecovered', 'info');
  });
});
