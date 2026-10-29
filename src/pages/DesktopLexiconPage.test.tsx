// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from '../db/desktop/desktopCall';
import { openDesktopSession, resetDesktopSessions } from '../db/desktop/projectSession';
import { releaseAllProjectLocks } from '../desktop/skeleton/projectLock';
import {
  forgetOpenProjectSession,
  rememberOpenProjectSession,
} from '../desktop/openProjectSession';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { LocaleProvider } from '../i18n';
import { LexiconPage } from './LexiconPage';

const roots: string[] = [];

afterEach(() => {
  cleanup();
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
  return render(
    <LocaleProvider locale="en-US">
      <MemoryRouter>
        <LexiconPage />
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
    expect(screen.queryByText('Entry attachments')).toBeNull();
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
    expect(screen.queryByText('Entry attachments')).toBeNull();
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
    expect(callDesktopSession(session.sessionId, 'lexicon.getEntry', { id: 'alpha' })).toMatchObject(
      {
        entry: {
          headword: 'alpha',
          senses: [{ id: 'sa', headwordTranslations: [{ text: 'A' }] }],
        },
      },
    );
  });
});
