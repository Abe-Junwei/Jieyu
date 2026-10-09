// @vitest-environment jsdom
/**
 * RD-2：带占位符的报错文案不能显示字面量 "{message}"，要保留调用方已插好参数的 message。
 * RD-2: parametrised error toasts must keep the caller's interpolated message, never "{message}".
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { ToastProvider, useToast } from './ToastContext';
import { renderWithLocale } from '../test/localeTestUtils';
import { reportActionError } from '../utils/actionErrorReporter';
import { t, tf, type Locale } from '../i18n';

afterEach(() => cleanup());

function Consumer({ onMount }: { onMount: (c: ReturnType<typeof useToast>) => void }) {
  const ctx = useToast();
  React.useEffect(() => {
    onMount(ctx);
  }, [onMount, ctx]);
  return null;
}

function reportImportFailure(locale: Locale, reason: string): string {
  let ctx: ReturnType<typeof useToast> | undefined;
  renderWithLocale(
    <ToastProvider>
      <Consumer
        onMount={(c) => {
          ctx = c;
        }}
      />
    </ToastProvider>,
    locale,
  );
  act(() => {
    reportActionError({
      actionLabel: 'import',
      error: new Error(reason),
      setErrorState: ({ message, meta }) =>
        ctx!.showSaveState({ kind: 'error', message, errorMeta: meta }),
      fallbackI18nKey: 'transcription.importExport.failed',
      fallbackMessage: tf(locale, 'transcription.importExport.failed', { message: reason }),
    });
  });
  return document.body.textContent ?? '';
}

describe('RD-2: parametrised error toasts keep their message', () => {
  it.each(['zh-CN', 'en-US'] as const)('%s: shows the reason, not "{message}"', (locale) => {
    // 前提：该文案确实带占位符 | Precondition: the template really has a placeholder
    expect(t(locale, 'transcription.importExport.failed')).toContain('{message}');
    const text = reportImportFailure(locale, 'media_items.timelineKind invalid');
    expect(text).not.toContain('{message}');
    expect(text).toContain('timelineKind');
  });
});
