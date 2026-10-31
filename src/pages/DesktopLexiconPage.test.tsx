// @vitest-environment jsdom
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callDesktopSession } from '../db/desktop/desktopCall';
import {
  openDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from '../db/desktop/projectSession';
import { releaseAllProjectLocks } from '../desktop/skeleton/projectLock';
import {
  forgetOpenProjectSession,
  rememberOpenProjectSession,
} from '../desktop/openProjectSession';
import { readDesktopProjectHost, type DesktopReadHost } from '../desktop/projectReadHost';
import { LocaleProvider } from '../i18n';
import { DesktopLexiconPage } from './DesktopLexiconPage';

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
  delete (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop;
  forgetOpenProjectSession();
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function hostFor(): DesktopReadHost {
  return {
    projectReadEnabled: true,
    chooseDesktopFolder: () => Promise.reject(new Error('lexicon must not choose a folder')),
    desktopCall: (id, method, args) => Promise.resolve(callDesktopSession(id, method, args)),
    desktopMediaUrl: () => Promise.reject(new Error('lexicon must not request media')),
  };
}

function renderPage() {
  const host = readDesktopProjectHost();
  if (host === null) throw new Error('desktop host is missing');
  return render(
    <LocaleProvider locale="en-US">
      <MemoryRouter>
        <DesktopLexiconPage host={host} />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

describe('DesktopLexiconPage', () => {
  it('edits a desktop lexeme and keeps the rest of the entry', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'jieyu-desktop-lexicon-'));
    roots.push(folder);
    const session = openDesktopSession(folder, [folder]);
    callDesktopSession(session.sessionId, 'lexicon.saveEntry', {
      id: 'kept',
      entry: {
        headword: 'kept',
        senses: [
          {
            id: 's1',
            definitions: [{ text: 'stay' }],
            headwordTranslations: [{ text: 'hello' }],
          },
        ],
      },
    });
    rememberOpenProjectSession(session.sessionId);
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = hostFor();
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'kept' }));
    expect(await screen.findByText('This entry has no attachments yet.')).toBeTruthy();
    const headword = await screen.findByRole('textbox', { name: 'Headword' });
    const translation = screen.getByRole('textbox', { name: 'Sense translation' });
    expect((headword as HTMLInputElement).value).toBe('kept');
    expect((translation as HTMLInputElement).value).toBe('hello');
    fireEvent.change(headword, { target: { value: 'kept-again' } });
    fireEvent.change(translation, { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'kept-again' })).toBeTruthy();
    });
    expect(callDesktopSession(session.sessionId, 'lexicon.getEntry', { id: 'kept' })).toMatchObject(
      {
        entry: {
          headword: 'kept-again',
          senses: [
            {
              id: 's1',
              definitions: [{ text: 'stay' }],
              headwordTranslations: [{ text: 'hi' }],
            },
          ],
        },
      },
    );
    expect(screen.getByText('This entry has no attachments yet.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Choose an attachment file'), {
      target: { files: [] },
    });
    fireEvent.change(screen.getByLabelText('Choose an attachment file'), {
      target: { files: [new File([], 'empty.png', { type: 'image/png' })] },
    });
    expect(callDesktopSession(session.sessionId, 'attachments.list', { lexemeId: 'kept' })).toEqual(
      [],
    );
    const file = new File([Uint8Array.from([1, 2, 3, 4])], 'plate.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Choose an attachment file'), {
      target: { files: [file] },
    });
    expect(await screen.findByText('plate.png')).toBeTruthy();

    cleanup();
    resetDesktopSessions();
    const again = openDesktopSession(folder, [folder]);
    rememberOpenProjectSession(again.sessionId);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'kept-again' }));
    expect(
      ((await screen.findByRole('textbox', { name: 'Headword' })) as HTMLInputElement).value,
    ).toBe('kept-again');
    expect(await screen.findByText('plate.png')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open attachment' }));
    expect(await screen.findByText('Opened image/png')).toBeTruthy();
    const listed = callDesktopSession(again.sessionId, 'attachments.list', {
      lexemeId: 'kept',
    }) as { id: string }[];
    const read = callDesktopSession(again.sessionId, 'attachments.read', {
      linkId: listed[0]?.id,
    }) as { mimeType: string; bytes: Uint8Array };
    expect(read.mimeType).toBe('image/png');
    expect(Buffer.from(read.bytes).equals(Buffer.from([1, 2, 3, 4]))).toBe(true);
    const [objectName] = readdirSync(join(folder, 'attachments', 'objects'));
    writeFileSync(join(folder, 'attachments', 'objects', objectName ?? ''), 'nope');
    fireEvent.click(screen.getByRole('button', { name: 'Open attachment' }));
    expect(await screen.findByText('The attachment did not open')).toBeTruthy();
    expect(screen.queryByText('Opened image/png')).toBeNull();
  });

  it('creates a lexeme in the open desktop project', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'jieyu-desktop-lexicon-new-'));
    roots.push(folder);
    const session = openDesktopSession(folder, [folder]);
    rememberOpenProjectSession(session.sessionId);
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = hostFor();
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'New lexeme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create lexeme' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Headword and sense translation are both required',
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Headword' }), {
      target: { value: 'new-word' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Sense translation' }), {
      target: { value: 'fresh' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create lexeme' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'new-word' })).toBeTruthy();
    });
    const listed = callDesktopSession(session.sessionId, 'lexicon.listLinkCandidates', {}) as {
      id: string;
      headword: string;
    }[];
    expect(listed).toEqual([expect.objectContaining({ headword: 'new-word' })]);
    expect(
      callDesktopSession(session.sessionId, 'lexicon.getEntry', { id: listed[0]!.id }),
    ).toMatchObject({
      entry: { headword: 'new-word', senses: [{ headwordTranslations: [{ text: 'fresh' }] }] },
    });
  });

  it('does not save the previous entry onto a newly selected id (#430)', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'jieyu-desktop-lexicon-race-'));
    roots.push(folder);
    const session = openDesktopSession(folder, [folder]);
    callDesktopSession(session.sessionId, 'lexicon.saveEntry', {
      id: 'alpha',
      entry: {
        headword: 'alpha',
        senses: [{ id: 'sa', headwordTranslations: [{ text: 'A' }] }],
      },
    });
    callDesktopSession(session.sessionId, 'lexicon.saveEntry', {
      id: 'beta',
      entry: {
        headword: 'beta',
        senses: [{ id: 'sb', headwordTranslations: [{ text: 'B' }] }],
      },
    });
    rememberOpenProjectSession(session.sessionId);

    let releaseAlpha: ((value: unknown) => void) | undefined;
    const deferredAlpha = new Promise((resolve) => {
      releaseAlpha = resolve;
    });
    const base = hostFor();
    const host: DesktopReadHost = {
      ...base,
      desktopCall: (id, method, args) => {
        if (
          method === 'lexicon.getEntry' &&
          typeof args === 'object' &&
          args !== null &&
          (args as { id?: string }).id === 'alpha'
        ) {
          return deferredAlpha.then(() => callDesktopSession(id, method, args));
        }
        return Promise.resolve(callDesktopSession(id, method, args));
      },
    };
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'alpha' }));
    fireEvent.click(await screen.findByRole('button', { name: 'beta' }));
    await waitFor(() => {
      expect((screen.getByRole('textbox', { name: 'Headword' }) as HTMLInputElement).value).toBe(
        'beta',
      );
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Headword' }), {
      target: { value: 'beta-new' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Sense translation' }), {
      target: { value: 'B2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'beta-new' })).toBeTruthy();
    });

    releaseAlpha?.(undefined);
    await waitFor(() => {
      expect(
        callDesktopSession(session.sessionId, 'lexicon.getEntry', { id: 'beta' }),
      ).toMatchObject({
        entry: {
          headword: 'beta-new',
          senses: [{ id: 'sb', headwordTranslations: [{ text: 'B2' }] }],
        },
      });
    });
    expect(
      callDesktopSession(session.sessionId, 'lexicon.getEntry', { id: 'alpha' }),
    ).toMatchObject({
      entry: {
        headword: 'alpha',
        senses: [{ id: 'sa', headwordTranslations: [{ text: 'A' }] }],
      },
    });
  });

  it('drops one shared attachment link and still opens the other entry', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'jieyu-desktop-lexicon-share-'));
    roots.push(folder);
    const session = openDesktopSession(folder, [folder]);
    saveLexeme(session.sessionId, 'one');
    saveLexeme(session.sessionId, 'two');
    const bytes = Uint8Array.from([9, 8, 7]);
    callDesktopSession(session.sessionId, 'attachments.publish', {
      lexemeId: 'one',
      displayName: 'plate.png',
      kind: 'image',
      mimeType: 'image/png',
      bytes,
      operationId: 'op-1',
    });
    callDesktopSession(session.sessionId, 'attachments.publish', {
      lexemeId: 'two',
      displayName: 'plate.png',
      kind: 'image',
      mimeType: 'image/png',
      bytes,
      operationId: 'op-2',
    });
    rememberOpenProjectSession(session.sessionId);
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = hostFor();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'one' }));
    expect(await screen.findByText('plate.png')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      callDesktopSession(session.sessionId, 'attachments.list', { lexemeId: 'one' }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
    await waitFor(() => {
      expect(
        callDesktopSession(session.sessionId, 'attachments.list', { lexemeId: 'one' }),
      ).toEqual([]);
    });
    expect(screen.queryByText('It is unknown whether this attachment was removed')).toBeNull();
    expect(screen.queryByText('The attachment was removed from this project')).toBeNull();
    expect(readdirSync(join(folder, 'attachments', 'objects'))).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'two' }));
    expect(await screen.findByText('plate.png')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open attachment' }));
    expect(await screen.findByText('Opened image/png')).toBeTruthy();
  });

  it('keeps an attachment when cleanup is unknown and does not try again', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'jieyu-desktop-lexicon-unknown-'));
    roots.push(folder);
    const session = openDesktopSession(folder, [folder]);
    saveLexeme(session.sessionId, 'one');
    callDesktopSession(session.sessionId, 'attachments.publish', {
      lexemeId: 'one',
      displayName: 'plate.png',
      kind: 'image',
      mimeType: 'image/png',
      bytes: Uint8Array.from([1, 2, 3]),
      operationId: 'op-1',
    });
    let calls = 0;
    rememberOpenProjectSession(session.sessionId);
    const host: DesktopReadHost = {
      ...hostFor(),
      desktopCall: (id, method, args) =>
        Promise.resolve(
          callDesktopSession(
            id,
            method,
            args,
            method === 'attachments.finishCleanup'
              ? () => {
                  calls += 1;
                  throw new Error('disk');
                }
              : undefined,
          ),
        ),
    };
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'one' }));
    expect(await screen.findByText('plate.png')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
    expect(
      await screen.findByText('It is unknown whether this attachment was removed'),
    ).toBeTruthy();
    expect(screen.queryByText('The attachment was removed from this project')).toBeNull();
    expect(calls).toBe(1);
    expect(readdirSync(join(folder, 'attachments', 'objects'))).toHaveLength(1);
    const file = requireDesktopSession(session.sessionId)
      .db.prepare('SELECT id, state FROM attachment_files')
      .get() as { id: string; state: string };
    expect(file.state).toBe('cleanup_unknown');
    callDesktopSession(session.sessionId, 'reopen', {});
    const again = await callDesktopSession(
      session.sessionId,
      'attachments.finishCleanup',
      { fileId: file.id },
      async () => {
        calls += 1;
        return 'moved';
      },
    );
    expect(again).toEqual({ fileId: file.id, state: 'cleanup_unknown' });
    expect(calls).toBe(1);
    expect(
      existsSync(
        join(
          folder,
          'attachments',
          'objects',
          readdirSync(join(folder, 'attachments', 'objects'))[0] ?? '',
        ),
      ),
    ).toBe(true);
  });
});

function saveLexeme(sessionId: string, id: string): void {
  callDesktopSession(sessionId, 'lexicon.saveEntry', {
    id,
    entry: {
      headword: id,
      senses: [{ id: 's', definitions: [{ text: 't' }], headwordTranslations: [{ text: id }] }],
    },
  });
}
