// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function Crash({ shouldThrow, message }: { shouldThrow: boolean; message: string }) {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div>child-ok</div>;
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs uncaught render errors through structured logger', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Crash shouldThrow message="boom-default" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('boom-default')).toBeTruthy();
    expect(document.querySelector('.app-error-boundary__reload-btn')).toBeTruthy();

    const matched = errorSpy.mock.calls.find(
      (call) => call[0] === '[ErrorBoundary]' && call[1] === 'uncaught error',
    );
    expect(matched).toBeTruthy();
    expect(matched?.[2]).toEqual(
      expect.objectContaining({
        err: expect.anything(),
        componentStack: expect.any(String),
      }),
    );
  });

  it('supports custom fallback reset flow', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function Harness() {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <ErrorBoundary
          fallback={(error, reset) => (
            <button
              onClick={() => {
                setShouldThrow(false);
                reset();
              }}
            >
              recover:{error.message}
            </button>
          )}
        >
          <Crash shouldThrow={shouldThrow} message="boom-custom" />
        </ErrorBoundary>
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'recover:boom-custom' }));
    expect(screen.getByText('child-ok')).toBeTruthy();

    const matched = errorSpy.mock.calls.find(
      (call) => call[0] === '[ErrorBoundary]' && call[1] === 'uncaught error',
    );
    expect(matched).toBeTruthy();
  });
});