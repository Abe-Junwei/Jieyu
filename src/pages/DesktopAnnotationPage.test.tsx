// @vitest-environment jsdom
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('rewrites and deletes a segment note, then reads that back from a reopened project', async () => {
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
    callDesktopSession(session.sessionId, 'notes.create', {
      id: 'axis',
      anchor: { kind: 'unit', unitId: unit.id, view: 'timeline' },
      content: { default: 'axis' },
    });
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
    expect(screen.queryByText('axis')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Note category' }), {
      target: { value: 'comment' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'keep me' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Comment: keep me')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Note category' }), {
      target: { value: 'question' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'drop me' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Question: drop me')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit note: keep me' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Note category' }), {
      target: { value: 'linguistic' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'kept' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Linguistic: kept')).toBeTruthy();
    expect(screen.queryByText('Comment: keep me')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete note: drop me' }));
    await waitFor(() => {
      expect(screen.queryByText('Question: drop me')).toBeNull();
    });
    view.unmount();
    resetDesktopSessions();
    const reopened = openDesktopSession(folder, [folder]);
    rememberOpenProjectSession(reopened.sessionId);
    render(page());
    fireEvent.click(await screen.findByRole('button', { name: '0.0–2.0 sentence' }));
    expect(await screen.findByText('Linguistic: kept')).toBeTruthy();
    expect(screen.queryByText('Question: drop me')).toBeNull();
    expect(screen.queryByText('axis')).toBeNull();
    expect(callDesktopSession(reopened.sessionId, 'notes.list', { unitId: unit.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          anchorKind: 'unit',
          unitId: unit.id,
          view: null,
          category: 'linguistic',
          content: { default: 'kept' },
        }),
        expect.objectContaining({
          id: 'axis',
          anchorKind: 'unit',
          unitId: unit.id,
          view: 'timeline',
          content: { default: 'axis' },
        }),
      ]),
    );
    expect(callDesktopSession(reopened.sessionId, 'notes.list', { unitId: unit.id })).toHaveLength(
      2,
    );
    expect(callDesktopSession(reopened.sessionId, 'units.get', { id: unit.id })).toMatchObject({
      text: 'sentence',
    });
  });

  it('splits the selected unit into words and shows them after the project is reopened', async () => {
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
      text: 'alpha beta',
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
    fireEvent.click(await screen.findByRole('button', { name: '0.0–2.0 alpha beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Split into words' }));
    expect(await screen.findByText('alpha')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Split into words' })).toHaveProperty(
      'disabled',
      true,
    );
    view.unmount();
    resetDesktopSessions();
    const reopened = openDesktopSession(folder, [folder]);
    rememberOpenProjectSession(reopened.sessionId);
    render(page());
    fireEvent.click(await screen.findByRole('button', { name: '0.0–2.0 alpha beta' }));
    expect(await screen.findByText('alpha')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
    expect(
      callDesktopSession(reopened.sessionId, 'analysis.listWords', { unitId: unit.id }),
    ).toMatchObject([{ form: 'alpha' }, { form: 'beta' }]);
    expect(callDesktopSession(reopened.sessionId, 'units.get', { id: unit.id })).toMatchObject({
      text: 'alpha beta',
    });
  });
});
