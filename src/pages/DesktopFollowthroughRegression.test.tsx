// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { LocaleProvider } from '../i18n';
import { DesktopLexiconAttachments } from './DesktopLexiconAttachments';
import { DesktopDailyBackupPanel } from './DesktopDailyBackupPanel';
import { DesktopDeletionReminderDialog } from './DesktopDeletionReminderDialog';
import { openDesktopSession, resetDesktopSessions } from '../db/desktop/projectSession';
import { callDesktopSession } from '../db/desktop/desktopCall';
const roots: string[] = [];
beforeEach(() => {
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:attachment-preview';
      }
      static revokeObjectURL() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetDesktopSessions();
  for (const d of roots.splice(0)) rmSync(d, { recursive: true, force: true });
});
function seed() {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-audit-ui-'));
  roots.push(folder);
  const { sessionId } = openDesktopSession(folder, [folder]);
  for (const id of ['a', 'b'])
    callDesktopSession(sessionId, 'lexicon.saveEntry', { id, entry: { headword: id, senses: [] } });
  callDesktopSession(sessionId, 'attachments.publish', {
    lexemeId: 'a',
    displayName: 'old.png',
    kind: 'image',
    mimeType: 'image/png',
    bytes: new Uint8Array(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aizsAAAAASUVORK5CYII=',
        'base64',
      ),
    ),
    operationId: 'audit-image',
  });
  return sessionId;
}
it('switching entry does not let an old list remove the old entry attachment', async () => {
  const id = seed();
  const desktopCall = async (s: string, m: string, args: unknown) => {
    if (m === 'attachments.list' && (args as { lexemeId: string }).lexemeId === 'b')
      return new Promise(() => {});
    return callDesktopSession(s, m, args);
  };
  const view = render(
    <LocaleProvider locale="en-US">
      <DesktopLexiconAttachments sessionId={id} lexemeId="a" desktopCall={desktopCall} />
    </LocaleProvider>,
  );
  await screen.findByText('old.png');
  view.rerender(
    <LocaleProvider locale="en-US">
      <DesktopLexiconAttachments sessionId={id} lexemeId="b" desktopCall={desktopCall} />
    </LocaleProvider>,
  );
  const remove = screen.queryByRole('button', { name: 'Remove attachment' });
  if (remove) {
    fireEvent.click(remove);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
    await act(async () => {});
  }
  callDesktopSession(id, 'reopen', {});
  expect(callDesktopSession(id, 'attachments.list', { lexemeId: 'a' })).toHaveLength(1);
});
it('opening an image presents its bytes instead of only declaring its MIME', async () => {
  const id = seed();
  const desktopCall = async (s: string, m: string, a: unknown) => callDesktopSession(s, m, a);
  const view = render(
    <LocaleProvider locale="en-US">
      <DesktopLexiconAttachments sessionId={id} lexemeId="a" desktopCall={desktopCall} />
    </LocaleProvider>,
  );
  await screen.findByText('old.png');
  fireEvent.click(screen.getByRole('button', { name: 'Open attachment' }));
  await waitFor(() => expect(screen.getByText(/image\/png/)).toBeTruthy());
  expect(view.container.querySelector('img[src],a[href],iframe[src],object[data]')).not.toBeNull();
});
it('changing project during a restore does not leave the new project permanently busy', async () => {
  let finish!: (v: { folder: string }) => void;
  const list = async () => ({ days: ['2026-10-30'] });
  const restore = () => new Promise<{ folder: string }>((r) => (finish = r));
  const view = render(
    <LocaleProvider locale="en-US">
      <DesktopDailyBackupPanel
        sessionId="old"
        listDailyBackups={list}
        restoreDailyBackup={restore}
      />
    </LocaleProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue restore' }));
  view.rerender(
    <LocaleProvider locale="en-US">
      <DesktopDailyBackupPanel
        sessionId="new"
        listDailyBackups={list}
        restoreDailyBackup={restore}
      />
    </LocaleProvider>,
  );
  await act(async () => finish({ folder: '/old-copy' }));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Restore' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
});

it('a normal und manuscript title is visible before destructive purge confirmation', () => {
  render(
    <LocaleProvider locale="en-US">
      <DesktopDeletionReminderDialog
        items={[
          {
            target: 'manuscript',
            id: 'a',
            title: { und: 'Clip' },
            relpath: null,
            retainUntil: '2026-10-30',
            removable: false,
          },
        ]}
        onShown={() => {}}
        onPurge={async () => {}}
        onRemoveFile={async () => ({ state: 'unknown' })}
        onClose={() => {}}
      />
    </LocaleProvider>,
  );
  expect(screen.getByText(/Clip/)).toBeTruthy();
});
