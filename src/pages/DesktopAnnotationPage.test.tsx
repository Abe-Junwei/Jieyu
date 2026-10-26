// @vitest-environment jsdom
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from '../db/desktop/desktopCall';
import { openDesktopSession, resetDesktopSessions } from '../db/desktop/projectSession';
import {
  forgetOpenProjectSession,
  rememberOpenProjectSession,
} from '../desktop/openProjectSession';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { LocaleProvider } from '../i18n';
import { AnnotationPage } from './AnnotationPage';

const roots: string[] = [];

afterEach(() => {
  cleanup();
  delete (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop;
  forgetOpenProjectSession();
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('DesktopAnnotationPage', () => {
  it('uses the already-open project session to save and read a categorized unit note', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'jieyu-desktop-annotation-'));
    roots.push(folder);
    writeFileSync(join(folder, 'a.wav'), '');
    const session = openDesktopSession(folder, [folder]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 12,
    }) as { id: string };
    const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { en: 'Manuscript' },
      mediaId: media.id,
    }) as { id: string };
    const layer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { en: 'Transcription' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: layer.id,
      startTime: 0,
      endTime: 2,
      text: 'sentence',
    }) as { id: string };
    rememberOpenProjectSession(session.sessionId);
    const host: DesktopReadHost = {
      projectReadEnabled: true,
      chooseDesktopFolder: () => Promise.reject(new Error('should not choose a folder')),
      desktopCall: (id, method, args) => Promise.resolve(callDesktopSession(id, method, args)),
      desktopMediaUrl: () => Promise.reject(new Error('annotation must not request media')),
    };
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
    const page = () => (
      <LocaleProvider locale="en-US">
        <MemoryRouter>
          <AnnotationPage />
        </MemoryRouter>
      </LocaleProvider>
    );
    const view = render(page());
    fireEvent.click(await screen.findByRole('button', { name: '0.0–2.0 sentence' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Note category' }), {
      target: { value: 'question' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'check this' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Question: check this')).toBeTruthy();
    view.unmount();
    render(page());
    fireEvent.click(await screen.findByRole('button', { name: '0.0–2.0 sentence' }));
    expect(await screen.findByText('Question: check this')).toBeTruthy();
    expect(
      callDesktopSession(session.sessionId, 'notes.list', {
        anchorKind: 'unit',
        unitId: unit.id,
        attachment: 'active',
      }),
    ).toMatchObject([{ category: 'question', content: { default: 'check this' } }]);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toMatchObject({
      text: 'sentence',
    });
  });
});
