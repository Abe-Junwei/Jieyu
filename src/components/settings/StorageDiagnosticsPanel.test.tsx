// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StorageDiagnosticsPanel } from './StorageDiagnosticsPanel';

vi.mock('../../utils/storageDurability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/storageDurability')>()),
  readStorageDiagnostics: vi.fn(async () => {
    throw new Error('estimate failed');
  }),
}));

describe('StorageDiagnosticsPanel', () => {
  it('does not leak an unhandled rejection when diagnostics fail to load', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const view = render(<StorageDiagnosticsPanel locale="zh-CN" />);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      view.unmount();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
