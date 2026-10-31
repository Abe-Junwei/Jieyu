// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
import { DesktopCatalogPage } from './DesktopCatalogPage';

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

function hostFor(methods: string[]): DesktopReadHost {
  return {
    projectReadEnabled: true,
    chooseDesktopFolder: () => Promise.reject(new Error('catalog must not choose a folder')),
    desktopCall: (id, method, args) => {
      methods.push(method);
      return Promise.resolve(callDesktopSession(id, method, args));
    },
    desktopMediaUrl: () => Promise.reject(new Error('catalog must not request media')),
  };
}

function renderCatalog(
  sessionId: string,
  section: 'language' | 'orthography' | 'bridge' | 'structure',
  methods: string[],
) {
  rememberOpenProjectSession(sessionId);
  (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = hostFor(methods);
  return render(
    <LocaleProvider locale="en-US">
      <MemoryRouter>
        <DesktopCatalogPage
          host={(globalThis as unknown as { jieyuDesktop: DesktopReadHost }).jieyuDesktop}
          section={section}
        />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

function openFolder(): { folder: string; sessionId: string } {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-desktop-catalog-'));
  roots.push(folder);
  return { folder, sessionId: openDesktopSession(folder, [folder]).sessionId };
}

function seedLanguage(sessionId: string): { id: string } {
  return callDesktopSession(sessionId, 'catalog.ensureProjectDefinition', {
    name: { zh: 'Example' },
    sourceType: 'built-in-reviewed',
    iso6393: 'eng',
  }) as { id: string };
}

describe('DesktopCatalogPage', () => {
  it('does not open the old lexicon or structural workspace', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/DesktopCatalogPage.tsx'), 'utf8');
    expect(page.includes("from '../db")).toBe(false);
    expect(page.includes('lift') || page.includes('attachment')).toBe(false);
    expect(page.includes('StructuralProfileWorkspacePage')).toBe(false);
    expect(page.includes('LanguageMetadataWorkspacePage')).toBe(false);
  });

  it('saves a language name from the desktop route and reads it back after reopen', async () => {
    const { folder, sessionId } = openFolder();
    const language = seedLanguage(sessionId);
    const methods: string[] = [];
    const view = renderCatalog(sessionId, 'language', methods);

    fireEvent.change(await screen.findByRole('textbox', { name: 'Language name' }), {
      target: { value: 'Sample' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save language' }));
    expect(await screen.findByRole('button', { name: 'Sample' })).toBeTruthy();
    expect(methods).toContain('catalog.updateLanguage');
    expect(methods).not.toContain('lexicon.saveEntry');

    view.unmount();
    resetDesktopSessions();
    const reopened = openDesktopSession(folder, [folder]);
    expect(
      callDesktopSession(reopened.sessionId, 'catalog.getLanguage', { id: language.id }),
    ).toMatchObject({
      name: { zh: 'Sample' },
    });
    renderCatalog(reopened.sessionId, 'language', []);
    expect(await screen.findByRole('button', { name: 'Sample' })).toBeTruthy();
  });

  it('keeps the language name when the new name is empty', async () => {
    const { folder, sessionId } = openFolder();
    const language = seedLanguage(sessionId);
    renderCatalog(sessionId, 'language', []);

    fireEvent.change(await screen.findByRole('textbox', { name: 'Language name' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save language' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not read this folder');
    expect(screen.getByRole('button', { name: 'Example' })).toBeTruthy();

    resetDesktopSessions();
    const reopened = openDesktopSession(folder, [folder]);
    expect(
      callDesktopSession(reopened.sessionId, 'catalog.getLanguage', { id: language.id }),
    ).toMatchObject({
      name: { zh: 'Example' },
    });
  });

  it('saves bridge rules from the desktop route and reads them back after reopen', async () => {
    const { folder, sessionId } = openFolder();
    const language = seedLanguage(sessionId);
    const source = callDesktopSession(sessionId, 'orthographies.create', {
      languageId: language.id,
      name: { en: 'Latin' },
      scriptTag: 'Latn',
      sourceType: 'built-in-reviewed',
    }) as { id: string };
    const target = callDesktopSession(sessionId, 'orthographies.create', {
      languageId: language.id,
      name: { en: 'Other' },
      scriptTag: 'Cyrl',
      sourceType: 'built-in-generated',
    }) as { id: string };
    const bridge = callDesktopSession(sessionId, 'bridges.create', {
      sourceOrthographyId: source.id,
      targetOrthographyId: target.id,
      engine: 'table-map',
      rules: { from: 'a' },
      sampleInput: 'a',
      sampleOutput: 'b',
      sampleCases: [{ input: 'a', expectedOutput: 'b' }],
    }) as { id: string };
    const methods: string[] = [];
    renderCatalog(sessionId, 'bridge', methods);

    fireEvent.change(await screen.findByRole('textbox', { name: 'Bridge rules' }), {
      target: { value: '{"from":"b"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save bridge' }));
    expect(await screen.findByDisplayValue('{"from":"b"}')).toBeTruthy();
    expect(methods).toContain('bridges.update');

    resetDesktopSessions();
    const reopened = openDesktopSession(folder, [folder]);
    expect(callDesktopSession(reopened.sessionId, 'bridges.list', {})).toEqual([
      expect.objectContaining({ id: bridge.id, rules: { from: 'b' } }),
    ]);
    cleanup();
    resetDesktopSessions();
    const shown = openDesktopSession(folder, [folder]);
    renderCatalog(shown.sessionId, 'bridge', []);
    expect(await screen.findByDisplayValue('{"from":"b"}')).toBeTruthy();
  });

  it('leaves structural templates off the old workspace', async () => {
    const { sessionId } = openFolder();
    const methods: string[] = [];
    renderCatalog(sessionId, 'structure', methods);

    expect(
      await screen.findByText('Structural templates are not stored in this desktop project'),
    ).toBeTruthy();
    expect(methods).toEqual([]);
    expect(screen.queryByText('language-metadata-page')).toBeNull();
  });
});
