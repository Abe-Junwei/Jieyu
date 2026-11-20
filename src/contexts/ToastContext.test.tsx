// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast, type ToastVariant } from './ToastContext';
import { t } from '../i18n';
import { renderWithLocale } from '../test/localeTestUtils';

const TOAST_FADE_OUT_MS = 260;

// ── Test component that uses the toast context ──────────────────────────────────

function TestConsumer({ onMount }: { onMount?: (ctx: ReturnType<typeof useToast>) => void }) {
  const ctx = useToast();
  React.useEffect(() => {
    onMount?.(ctx);
  }, [onMount, ctx]);
  return null;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ToastContext', () => {
  // Helper to render inside ToastProvider
  function renderInProvider(element: React.ReactElement, locale: 'zh-CN' | 'en-US' = 'zh-CN') {
    return renderWithLocale(<ToastProvider>{element}</ToastProvider>, locale);
  }

  describe('useToast throws outside provider', () => {
    it('throws when useToast is called outside ToastProvider', () => {
      const nativeConsole = globalThis['console'];
      const orig = nativeConsole.error;
      nativeConsole.error = vi.fn();
      expect(() => render(<TestConsumer />)).toThrow(
        'useToast must be used within <ToastProvider>',
      );
      nativeConsole.error = orig;
    });
  });

  describe('showToast', () => {
    it('does not render a toast initially', () => {
      renderInProvider(<TestConsumer />);
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('renders a toast when showToast is called', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showToast('hello world', 'info');
      });
      expect(screen.getByRole('status').textContent).toBe('hello world');
    });

    it('renders with correct variant class', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showToast('test', 'success');
      });
      expect(document.querySelector('.toast-success')).not.toBeNull();
    });

    it('dismisses on click', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showToast('click me', 'info');
      });
      act(() => {
        fireEvent.click(document.querySelector('.transcription-toast-close')!);
      });
      act(() => {
        vi.advanceTimersByTime(TOAST_FADE_OUT_MS);
      });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('auto-dismisses after default delay for info toast', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showToast('auto', 'info');
      });
      expect(screen.getByRole('status').textContent).toBe('auto');
      act(() => {
        vi.advanceTimersByTime(6500);
      });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('does NOT auto-dismiss error toasts (ADR-0116)', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showToast('error', 'error');
      });
      act(() => {
        vi.advanceTimersByTime(60000);
      });
      expect(screen.getByRole('status').textContent).toBe('error');
    });

    it('does NOT auto-dismiss for recording variant (persistent)', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showToast('recording', 'recording');
      });
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.getByRole('status').textContent).toBe('recording');
    });

    it('does NOT auto-dismiss for listening variant (persistent)', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showToast('listening', 'listening');
      });
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.getByRole('status').textContent).toBe('listening');
    });

    it('respects explicit autoDismissMs=0 (persistent)', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showToast('persistent', 'info', 0);
      });
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.getByRole('status').textContent).toBe('persistent');
    });

    it('respects explicit autoDismissMs override', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showToast('short', 'info', 500);
      });
      act(() => {
        vi.advanceTimersByTime(499);
      });
      expect(screen.queryByRole('status')).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(2 + TOAST_FADE_OUT_MS);
      });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('dedupes same message+variant in throttle window and does not reset dismiss timer', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );

      act(() => {
        ctx!.showToast('dedupe', 'info');
      });
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      act(() => {
        ctx!.showToast('dedupe', 'info');
      });
      act(() => {
        vi.advanceTimersByTime(4600 + TOAST_FADE_OUT_MS);
      });

      expect(screen.queryByRole('status')).toBeNull();
    });

    it('allows same message+variant again after dedupe window', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );

      act(() => {
        ctx!.showToast('dedupe-window', 'info');
      });
      act(() => {
        vi.advanceTimersByTime(2600);
      });
      act(() => {
        ctx!.showToast('dedupe-window', 'info');
      });

      expect(document.querySelectorAll('.transcription-toast')).toHaveLength(2);
    });
  });

  describe('stack and pause (ADR-0116)', () => {
    function setup() {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      return () => ctx!;
    }
    const texts = () =>
      Array.from(document.querySelectorAll('.transcription-toast-text')).map((n) => n.textContent);

    it('keeps at most 3 toasts and evicts results before items needing attention', () => {
      const get = setup();
      act(() => {
        get().showToast('boom', 'error');
        get().showToast('r1', 'success');
        get().showToast('r2', 'success');
        get().showToast('r3', 'success');
      });
      expect(texts()).toEqual(['boom', 'r2', 'r3']);
    });

    it('pauses the timer while hovered and resumes afterwards', () => {
      const get = setup();
      act(() => {
        get().showToast('hover me', 'info');
      });
      const container = document.querySelector('.transcription-toast-container')!;
      act(() => {
        vi.advanceTimersByTime(5000);
        fireEvent.mouseEnter(container);
        vi.advanceTimersByTime(30000);
      });
      expect(texts()).toEqual(['hover me']);
      act(() => {
        fireEvent.mouseLeave(container);
        vi.advanceTimersByTime(1000 + TOAST_FADE_OUT_MS);
      });
      expect(texts()).toEqual([]);
    });
  });

  describe('showSaveState', () => {
    it('renders saving toast', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showSaveState({ kind: 'saving' });
      });
      expect(screen.getByRole('status').textContent).toBe(t('zh-CN', 'transcription.toast.saving'));
    });

    it('renders done toast with custom message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showSaveState({ kind: 'done', message: '自定义保存完成' });
      });
      expect(screen.getByRole('status').textContent).toBe('自定义保存完成');
    });

    it('keeps a written-view warning until refresh or dismiss', () => {
      vi.useFakeTimers();
      const onAction = vi.fn();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showSaveState({
          kind: 'viewStale',
          message: '已写入，视图还没刷新。',
          actionLabel: '重新刷新',
          onAction,
        });
      });
      expect(document.querySelector('.toast-warning')).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole('button', { name: '重新刷新' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: '重新刷新' }));
      expect(onAction).toHaveBeenCalledOnce();
      expect(screen.getByRole('status')).toBeTruthy();
      fireEvent.click(document.querySelector('.transcription-toast-close')!);
      act(() => {
        vi.advanceTimersByTime(TOAST_FADE_OUT_MS);
      });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('keeps a save error toast until dismissed', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showSaveState({ kind: 'error', message: '保存失败原因' });
      });
      expect(document.querySelector('.toast-error')).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(60000);
      });
      expect(document.querySelector('.toast-error')).not.toBeNull();
    });

    it('renders error toast with custom message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showSaveState({ kind: 'error', message: '保存失败原因' });
      });
      expect(screen.getByRole('status').textContent).toBe('保存失败原因');
    });

    it('dismisses on idle saveState', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showSaveState({ kind: 'saving' });
      });
      expect(document.querySelectorAll('.transcription-toast')).toHaveLength(1);
      act(() => {
        ctx!.showSaveState({ kind: 'idle' });
      });
      act(() => {
        vi.advanceTimersByTime(TOAST_FADE_OUT_MS);
      });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('done uses default message when none provided', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showSaveState({ kind: 'done', message: '保存完成' });
      });
      expect(screen.getByRole('status').textContent).toBe('保存完成');
    });

    it('throttles done save toasts within cooldown window', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );

      act(() => {
        ctx!.showSaveState({ kind: 'done', message: '保存完成 A' });
      });
      expect(screen.getByRole('status').textContent).toBe('保存完成 A');

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      act(() => {
        ctx!.showSaveState({ kind: 'done', message: '保存完成 B' });
      });
      expect(screen.getByRole('status').textContent).toBe('保存完成 A');

      act(() => {
        vi.advanceTimersByTime(4500 + TOAST_FADE_OUT_MS);
      });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('allows done save toast again after cooldown window', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );

      act(() => {
        ctx!.showSaveState({ kind: 'done', message: '保存完成 A' });
      });
      act(() => {
        vi.advanceTimersByTime(6100 + TOAST_FADE_OUT_MS);
      });
      act(() => {
        ctx!.showSaveState({ kind: 'done', message: '保存完成 B' });
      });

      expect(screen.getByRole('status').textContent).toBe('保存完成 B');
    });

    it('does not throttle save error toast even after done toast', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );

      act(() => {
        ctx!.showSaveState({ kind: 'done', message: '保存完成' });
      });
      act(() => {
        ctx!.showSaveState({ kind: 'error', message: '保存失败' });
      });

      expect(screen.getByRole('status').textContent).toBe('保存失败');
      expect(document.querySelector('.toast-error')).not.toBeNull();
    });

    it('error uses default message when none provided', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showSaveState({ kind: 'error', message: '保存失败' });
      });
      expect(screen.getByRole('status').textContent).toBe('保存失败');
    });

    it('maps validation errors to info toast variant', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
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
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showSaveState({
          kind: 'error',
          message: '导入文件失败：外部写入冲突',
          errorMeta: { category: 'conflict', action: '导入文件', recoverable: true },
        });
      });

      expect(screen.getByRole('status').textContent).toMatch(
        /导入文件失败：外部写入冲突（建议刷新后重试）|导入文件失败：外部写入冲突（Refresh and try again）/,
      );
      expect(document.querySelector('.toast-error')).not.toBeNull();
    });

    it('keeps conflict message unchanged when it already includes refresh hint', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showSaveState({
          kind: 'error',
          message: '导入文件失败：检测到数据已被其他操作更新，请刷新后重试',
          errorMeta: { category: 'conflict', action: '导入文件', recoverable: true },
        });
      });

      expect(screen.getByRole('status').textContent).toBe(
        '导入文件失败：检测到数据已被其他操作更新，请刷新后重试',
      );
    });

    it('prefers i18nKey message when key is provided on save error', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
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

      expect(screen.getByRole('status').textContent).toMatch(
        /导入失败：检测到数据已被其他操作更新，请刷新后重试|Import failed: data was modified by another operation\. Refresh and try again\./,
      );
    });

    it('keeps the filled message when the i18nKey has placeholders (no "{message}" in the toast)', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showSaveState({
          kind: 'error',
          message: '导入失败：存储空间不足',
          errorMeta: {
            category: 'action',
            action: '导入文件',
            recoverable: true,
            i18nKey: 'transcription.importExport.failed',
          },
        });
      });

      expect(screen.getByRole('status').textContent).toContain('存储空间不足');
      expect(screen.getByRole('status').textContent).not.toContain('{message}');
    });
  });

  describe('showVoiceState', () => {
    it('shows command mode waiting message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showVoiceState('command', false);
      });
      expect(screen.getByRole('status').textContent).toBe('🎤 等待语音指令…');
    });

    it('shows command mode listening message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showVoiceState('command', true);
      });
      expect(screen.getByRole('status').textContent).toBe('🎤 正在听…');
    });

    it('shows dictation mode waiting message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showVoiceState('dictation', false);
      });
      expect(screen.getByRole('status').textContent).toBe('🎤 听写模式 — 说话即写入');
    });

    it('shows dictation mode listening message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showVoiceState('dictation', true);
      });
      expect(screen.getByRole('status').textContent).toBe('🎤 正在听写…');
    });

    it('shows analysis mode waiting message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showVoiceState('analysis', false);
      });
      expect(screen.getByRole('status').textContent).toBe('🎤 分析模式 — 说话即分析');
    });

    it('shows analysis mode listening message', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showVoiceState('analysis', true);
      });
      expect(screen.getByRole('status').textContent).toBe('🎤 正在分析…');
    });

    it('uses locale-aware english voice message when locale is en-US', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
        'en-US',
      );
      act(() => {
        ctx!.showVoiceState('dictation', false);
      });
      expect(screen.getByRole('status').textContent).toBe('🎤 Dictation mode — speak to insert');
    });

    it('dismisses voice toast when mode is null', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showVoiceState('command', true);
      });
      act(() => {
        ctx!.showVoiceState(null);
      });
      act(() => {
        vi.advanceTimersByTime(TOAST_FADE_OUT_MS);
      });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('does not dismiss non-voice toast when mode is null', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showToast('some toast', 'info', 0);
      });
      act(() => {
        ctx!.showVoiceState(null);
      });
      act(() => {
        vi.advanceTimersByTime(TOAST_FADE_OUT_MS);
      });
      expect(screen.getByRole('status').textContent).toBe('some toast');
    });

    it('renders with listening variant class', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showVoiceState('command', true);
      });
      expect(document.querySelector('.toast-listening')).not.toBeNull();
    });
  });

  describe('dismiss', () => {
    it('dismisses the current toast immediately', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showToast('to dismiss', 'info');
      });
      expect(screen.getByRole('status').textContent).toBe('to dismiss');
      act(() => {
        ctx!.dismiss();
      });
      act(() => {
        vi.advanceTimersByTime(TOAST_FADE_OUT_MS);
      });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('clears pending auto-dismiss timer', () => {
      vi.useFakeTimers();
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
      );
      act(() => {
        ctx!.showToast('timer test', 'info');
      });
      act(() => {
        ctx!.dismiss();
      });
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('uses locale-aware dismiss label when locale is en-US', () => {
      let ctx: ReturnType<typeof useToast>;
      renderInProvider(
        <TestConsumer
          onMount={(c) => {
            ctx = c;
          }}
        />,
        'en-US',
      );
      act(() => {
        ctx!.showToast('dismiss me', 'info');
      });
      expect(screen.getByRole('button', { name: 'Dismiss toast' })).toBeTruthy();
    });
  });

  describe('variant CSS classes', () => {
    const variants: ToastVariant[] = [
      'info',
      'success',
      'error',
      'recording',
      'listening',
      'routing',
      'executing',
      'ai-thinking',
    ];
    for (const variant of variants) {
      it(`renders .toast-${variant} for variant=${variant}`, () => {
        let ctx: ReturnType<typeof useToast>;
        renderInProvider(
          <TestConsumer
            onMount={(c) => {
              ctx = c;
            }}
          />,
        );
        act(() => {
          ctx!.showToast(variant, variant);
        });
        expect(document.querySelector(`.toast-${variant}`)).not.toBeNull();
      });
    }
  });
});
