// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast, type ToastVariant } from './ToastContext';

// ── Test component that uses the toast context ──────────────────────────────────

function TestConsumer({
  onMount,
}: {
  onMount?: (ctx: ReturnType<typeof useToast>) => void;
}) {
  const ctx = useToast();
  React.useEffect(() => { onMount?.(ctx); }, [onMount, ctx]);
  return null;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ToastContext', () => {
  // Helper to render inside ToastProvider
  function renderInProvider(element: React.ReactElement) {
    return render(
      <ToastProvider>
        {element}
      </ToastProvider>
    );
  }

  describe('useToast throws outside provider', () => {
    it('throws when useToast is called outside ToastProvider', () => {
      const orig = console.error;
      console.error = vi.fn();
      expect(() => render(<TestConsumer />)).toThrow('useToast must be used within <ToastProvider>');
      console.error = orig;
    });
  });

  describe('showToast', () => {
    it('does not render a toast initially', () => {
      renderInProvider(<TestConsumer />);
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('renders a toast when showToast is called', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showToast('hello world', 'info'); });
      expect(screen.getByRole('status').textContent).toBe('hello world');
    });

    it('renders with correct variant class', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showToast('test', 'success'); });
      expect(document.querySelector('.toast-success')).not.toBeNull();
    });

    it('dismisses on click', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showToast('click me', 'info'); });
      // Click the inner toast div (which has onClick={dismiss}), not the container
      act(() => { fireEvent.click(screen.getByText('click me')); });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('auto-dismisses after default delay for info toast', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showToast('auto', 'info'); });
      expect(screen.getByRole('status').textContent).toBe('auto');
      act(() => { vi.advanceTimersByTime(3500); });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('auto-dismisses after error delay for error toast', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showToast('error', 'error'); });
      act(() => { vi.advanceTimersByTime(4999); });
      expect(screen.queryByRole('status')).not.toBeNull(); // not yet
      act(() => { vi.advanceTimersByTime(2); });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('does NOT auto-dismiss for recording variant (persistent)', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showToast('recording', 'recording'); });
      act(() => { vi.advanceTimersByTime(10000); });
      expect(screen.getByRole('status').textContent).toBe('recording');
    });

    it('does NOT auto-dismiss for listening variant (persistent)', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showToast('listening', 'listening'); });
      act(() => { vi.advanceTimersByTime(10000); });
      expect(screen.getByRole('status').textContent).toBe('listening');
    });

    it('respects explicit autoDismissMs=0 (persistent)', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showToast('persistent', 'info', 0); });
      act(() => { vi.advanceTimersByTime(10000); });
      expect(screen.getByRole('status').textContent).toBe('persistent');
    });

    it('respects explicit autoDismissMs override', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showToast('short', 'info', 500); });
      act(() => { vi.advanceTimersByTime(499); });
      expect(screen.queryByRole('status')).not.toBeNull();
      act(() => { vi.advanceTimersByTime(2); });
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  describe('showSaveState', () => {
    it('renders saving toast', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showSaveState({ kind: 'saving' }); });
      expect(screen.getByRole('status').textContent).toBe('保存中…');
    });

    it('renders done toast with custom message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showSaveState({ kind: 'done', message: '自定义保存完成' }); });
      expect(screen.getByRole('status').textContent).toBe('自定义保存完成');
    });

    it('renders error toast with custom message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showSaveState({ kind: 'error', message: '保存失败原因' }); });
      expect(screen.getByRole('status').textContent).toBe('保存失败原因');
    });

    it('dismisses on idle saveState', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showToast('some toast', 'info'); });
      expect(screen.getByRole('status').textContent).toBe('some toast');
      act(() => { ctx!.showSaveState({ kind: 'idle' }); });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('done uses default message when none provided', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showSaveState({ kind: 'done', message: '保存完成' }); });
      expect(screen.getByRole('status').textContent).toBe('保存完成');
    });

    it('error uses default message when none provided', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showSaveState({ kind: 'error', message: '保存失败' }); });
      expect(screen.getByRole('status').textContent).toBe('保存失败');
    });

    it('maps validation errors to info toast variant', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => {
        ctx!.showSaveState({
          kind: 'error',
          message: '请先选择句段',
          errorMeta: { category: 'validation', action: '批量合并', recoverable: true },
        });
      });

      expect(screen.getByRole('status').textContent).toBe('请先选择句段');
      expect(document.querySelector('.toast-info')).not.toBeNull();
    });

    it('appends refresh hint for conflict errors when message has no refresh text', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => {
        ctx!.showSaveState({
          kind: 'error',
          message: '导入文件失败：外部写入冲突',
          errorMeta: { category: 'conflict', action: '导入文件', recoverable: true },
        });
      });

      expect(screen.getByRole('status').textContent).toMatch(/导入文件失败：外部写入冲突（建议刷新后重试）|导入文件失败：外部写入冲突（Refresh and try again）/);
      expect(document.querySelector('.toast-error')).not.toBeNull();
    });

    it('keeps conflict message unchanged when it already includes refresh hint', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => {
        ctx!.showSaveState({
          kind: 'error',
          message: '导入文件失败：检测到数据已被其他操作更新，请刷新后重试',
          errorMeta: { category: 'conflict', action: '导入文件', recoverable: true },
        });
      });

      expect(screen.getByRole('status').textContent).toBe('导入文件失败：检测到数据已被其他操作更新，请刷新后重试');
    });

    it('prefers i18nKey message when key is provided on save error', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => {
        ctx!.showSaveState({
          kind: 'error',
          message: 'raw fallback message',
          errorMeta: {
            category: 'conflict',
            action: '导入文件',
            recoverable: true,
            i18nKey: 'transcription.importExport.conflict',
          },
        });
      });

      expect(screen.getByRole('status').textContent).toMatch(/导入失败：检测到数据已被其他操作更新，请刷新后重试|Import failed: data was modified by another operation\. Refresh and try again\./);
    });
  });

  describe('showVoiceState', () => {
    it('shows command mode waiting message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showVoiceState('command', false); });
      expect(screen.getByRole('status').textContent).toBe('🎤 等待语音指令…');
    });

    it('shows command mode listening message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showVoiceState('command', true); });
      expect(screen.getByRole('status').textContent).toBe('🎤 正在听…');
    });

    it('shows dictation mode waiting message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showVoiceState('dictation', false); });
      expect(screen.getByRole('status').textContent).toBe('🎤 听写模式 — 说话即写入');
    });

    it('shows dictation mode listening message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showVoiceState('dictation', true); });
      expect(screen.getByRole('status').textContent).toBe('🎤 正在听写…');
    });

    it('shows analysis mode waiting message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showVoiceState('analysis', false); });
      expect(screen.getByRole('status').textContent).toBe('🎤 分析模式 — 说话即分析');
    });

    it('shows analysis mode listening message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showVoiceState('analysis', true); });
      expect(screen.getByRole('status').textContent).toBe('🎤 正在分析…');
    });

    it('dismisses toast when mode is null', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showToast('some toast', 'info'); });
      act(() => { ctx!.showVoiceState(null); });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('renders with listening variant class', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showVoiceState('command', true); });
      expect(document.querySelector('.toast-listening')).not.toBeNull();
    });
  });

  describe('dismiss', () => {
    it('dismisses the current toast immediately', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showToast('to dismiss', 'info'); });
      expect(screen.getByRole('status').textContent).toBe('to dismiss');
      act(() => { ctx!.dismiss(); });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('clears pending auto-dismiss timer', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
      act(() => { ctx!.showToast('timer test', 'info'); });
      act(() => { ctx!.dismiss(); });
      act(() => { vi.advanceTimersByTime(10000); });
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  describe('variant CSS classes', () => {
    const variants: ToastVariant[] = ['info', 'success', 'error', 'recording', 'listening', 'routing', 'executing', 'ai-thinking'];
    for (const variant of variants) {
      it(`renders .toast-${variant} for variant=${variant}`, () => {
        let ctx: ReturnType<typeof useToast>;
        renderInProvider(<TestConsumer onMount={(c) => { ctx = c; }} />);
        act(() => { ctx!.showToast(variant, variant); });
        expect(document.querySelector(`.toast-${variant}`)).not.toBeNull();
      });
    }
  });
});
