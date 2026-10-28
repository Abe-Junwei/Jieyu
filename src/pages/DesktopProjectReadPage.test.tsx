// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from '../db/desktop/desktopCall';
import {
  openDesktopSession,
  reopenDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from '../db/desktop/projectSession';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { forgetOpenProjectSession, readOpenProjectSession } from '../desktop/openProjectSession';
import { LocaleProvider } from '../i18n';
import { DesktopProjectReadPage } from './DesktopProjectReadPage';

const roots: string[] = [];

afterEach(() => {
  cleanup();
  delete (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop;
  resetDesktopSessions();
  forgetOpenProjectSession();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function renderPage() {
  return render(
    <LocaleProvider locale="en-US">
      <MemoryRouter initialEntries={['/desktop-project']}>
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route path="/desktop-project" element={<DesktopProjectReadPage />} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  );
}

describe('DesktopProjectReadPage', () => {
  it('does not read the folder library through Dexie', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/DesktopProjectReadPage.tsx'), 'utf8');
    const view = readFileSync(join(process.cwd(), 'src/pages/DesktopProjectReadView.tsx'), 'utf8');
    const controller = readFileSync(
      join(process.cwd(), 'src/pages/useDesktopProjectReadController.ts'),
      'utf8',
    );
    expect(page.includes('dexie') || page.includes('Dexie') || page.includes('getDb')).toBe(false);
    expect(page.includes('storageCall')).toBe(false);
    expect(page.includes("from '../db")).toBe(false);
    expect(controller.includes("from '../db")).toBe(false);
    expect(view.includes('dexie') || view.includes('Dexie') || view.includes('getDb')).toBe(false);
  });

  it('stays on the home page when the internal branch is off', () => {
    renderPage();
    expect(screen.getByText('home')).toBeTruthy();
  });

  it('opens a folder once and seeks the recording from a unit', async () => {
    const calls: string[] = [];
    const host: DesktopReadHost = {
      projectReadEnabled: true,
      chooseDesktopFolder: () => {
        calls.push('choose');
        return Promise.resolve({ sessionId: 'session-1' });
      },
      desktopCall: (_sessionId, method) => {
        calls.push(method);
        if (method === 'manuscripts.list') {
          return Promise.resolve([
            { id: 'ms-1', title: { zh: '文稿' }, mediaId: 'media-1', createdAt: '', updatedAt: '' },
          ]);
        }
        if (method === 'layers.list') {
          return Promise.resolve([
            {
              id: 'layer-1',
              manuscriptId: 'ms-1',
              key: 'tx',
              name: { zh: '转写' },
              tierType: 'time-aligned',
              contentType: 'transcription',
              languageId: null,
              orthographyId: null,
              parentId: null,
              sortOrder: 0,
              createdAt: '',
              updatedAt: '',
            },
          ]);
        }
        if (method === 'units.updateText') return Promise.resolve({});
        if (method === 'notes.list') return Promise.resolve([]);
        if (method === 'units.list') {
          return Promise.resolve([
            {
              id: 'unit-1',
              layerId: 'layer-1',
              speakerId: null,
              parentUnitId: null,
              startTime: 0.4,
              endTime: 1.2,
              createdAt: '',
              updatedAt: '',
              text: '句子',
            },
          ]);
        }
        return Promise.reject(new Error('unexpected'));
      },
      desktopMediaUrl: () => {
        calls.push('media-url');
        return Promise.resolve({ url: 'jieyu-media://local/token' });
      },
    };
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    expect(await screen.findByRole('button', { name: '文稿' })).toBeTruthy();
    const unit = screen.getByRole('button', { name: '0.4–1.2 句子' });
    const audio = screen.getByLabelText('Recording') as HTMLAudioElement;
    expect(audio.getAttribute('src')).toBe('jieyu-media://local/token');
    fireEvent.click(unit);
    expect(audio.currentTime).toBe(0.4);
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: '改过' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
    expect(calls.filter((call) => call === 'choose')).toEqual(['choose']);
    expect(calls.filter((call) => call === 'units.updateText')).toEqual(['units.updateText']);
  });

  it('saves the current manuscript offset after a switch', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 12,
    }) as { id: string };
    const first = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '甲' },
      mediaId: media.id,
    }) as { id: string };
    const second = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '乙' },
      mediaId: media.id,
    }) as { id: string };
    const db = requireDesktopSession(session.sessionId).db;
    db.prepare('UPDATE manuscripts SET created_at = ? WHERE id = ?').run(
      '2026-10-25T00:00:00.000Z',
      first.id,
    );
    db.prepare('UPDATE manuscripts SET created_at = ? WHERE id = ?').run(
      '2026-10-25T00:00:01.000Z',
      second.id,
    );
    callDesktopSession(session.sessionId, 'manuscripts.setTimeMapping', {
      manuscriptId: first.id,
      expectedRevision: 0,
      offsetSec: 1,
      scale: 1,
    });
    callDesktopSession(session.sessionId, 'manuscripts.setTimeMapping', {
      manuscriptId: second.id,
      expectedRevision: 0,
      offsetSec: 9,
      scale: 1,
    });
    mount(session.sessionId);
    expect(await screen.findByRole('button', { name: '甲' })).toBeTruthy();
    expect(textValue('Offset seconds')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: '乙' }));
    await waitFor(() => {
      expect(textValue('Offset seconds')).toBe('9');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save time mapping' }));
    await waitFor(() => {
      const saved = requireDesktopSession(session.sessionId).manuscripts.get(second.id);
      expect(saved?.timeMapping).toMatchObject({ offsetSec: 9, revision: 2 });
    });
    expect(
      requireDesktopSession(session.sessionId).manuscripts.get(first.id)?.timeMapping,
    ).toMatchObject({
      offsetSec: 1,
      revision: 1,
    });
    reopenDesktopSession(session.sessionId);
    expect(
      requireDesktopSession(session.sessionId).manuscripts.get(second.id)?.timeMapping,
    ).toMatchObject({
      offsetSec: 9,
      revision: 2,
    });
  });

  it('saves the selected unit boundary after a switch', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 12,
    }) as { id: string };
    const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '文稿' },
      mediaId: media.id,
    }) as { id: string };
    const layer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const units = [
      [0, 2, '一'],
      [2, 4, '二'],
      [4, 6, '三'],
    ].map(([start, end, text]) =>
      callDesktopSession(session.sessionId, 'units.create', {
        layerId: layer.id,
        startTime: start,
        endTime: end,
        text,
      }),
    ) as { id: string }[];
    mount(session.sessionId);
    fireEvent.click(await screen.findByRole('button', { name: '0.0–2.0 一' }));
    expect(textValue('Literature boundary')).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: '2.0–4.0 二' }));
    expect(textValue('Literature boundary')).toBe('4');
    fireEvent.change(screen.getByRole('textbox', { name: 'Literature boundary' }), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move boundary' }));
    expect(await screen.findByRole('button', { name: '2.0–3.0 二' })).toBeTruthy();
    reopenDesktopSession(session.sessionId);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: units[1]?.id })).toMatchObject({
      startTime: 2,
      endTime: 3,
    });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: units[2]?.id })).toMatchObject({
      startTime: 3,
      endTime: 6,
    });
  });

  it('saves a unit note and reads it back without changing the text', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 12,
    }) as { id: string };
    const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '文稿' },
      mediaId: media.id,
    }) as { id: string };
    const layer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: layer.id,
      startTime: 0,
      endTime: 2,
      text: 'sentence',
    }) as { id: string };
    mount(session.sessionId);
    await waitFor(() => expect(readOpenProjectSession()).toBe(session.sessionId));
    fireEvent.click(await screen.findByRole('button', { name: '0.0–2.0 sentence' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'remember' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('remember')).toBeTruthy();
    reopenDesktopSession(session.sessionId);
    expect(
      callDesktopSession(session.sessionId, 'notes.list', {
        unitId: unit.id,
        anchorKind: 'unit',
        attachment: 'active',
      }),
    ).toMatchObject([{ anchorKind: 'unit', unitId: unit.id, content: { default: 'remember' } }]);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toMatchObject({
      text: 'sentence',
    });
  });

  it('keeps a timeline note apart from a waveform note on the same unit', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 12,
    }) as { id: string };
    const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '文稿' },
      mediaId: media.id,
    }) as { id: string };
    const layer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: layer.id,
      startTime: 0,
      endTime: 2,
      text: 'sentence',
    }) as { id: string };
    mount(session.sessionId);
    fireEvent.click(await screen.findByRole('button', { name: '0.0–2.0 sentence' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'on the line' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save timeline note' }));
    expect(await screen.findByText('on the line')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'on the wave' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save waveform note' }));
    expect(await screen.findByText('on the wave')).toBeTruthy();
    reopenDesktopSession(session.sessionId);
    const listed = callDesktopSession(session.sessionId, 'notes.list', {
      unitId: unit.id,
      attachment: 'active',
    }) as {
      id: string;
      anchorKind: string;
      view: string | null;
      content: { default: string };
    }[];
    const timeline = listed.find((note) => note.view === 'timeline');
    const waveform = listed.find((note) => note.view === 'waveform');
    expect(timeline).toMatchObject({
      anchorKind: 'unit',
      content: { default: 'on the line' },
    });
    expect(waveform).toMatchObject({
      anchorKind: 'unit',
      content: { default: 'on the wave' },
    });
    expect(timeline?.id).not.toBe(waveform?.id);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toMatchObject({
      text: 'sentence',
    });
  });

  it('searches the open project and locates the segment', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 12,
    }) as { id: string };
    const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '文稿' },
      mediaId: media.id,
    }) as { id: string };
    const layer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'units.create', {
      layerId: layer.id,
      startTime: 0,
      endTime: 1,
      text: 'Alpha beta',
    });
    callDesktopSession(session.sessionId, 'units.create', {
      layerId: layer.id,
      startTime: 2,
      endTime: 3,
      text: 'other',
    });
    mount(session.sessionId);
    await screen.findByRole('button', { name: '0.0–1.0 Alpha beta' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Query lexeme' }), {
      target: { value: 'lex' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search corpus' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'A sense query needs both a lexeme and a sense',
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Query lexeme' }), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Query text' }), {
      target: { value: 'beta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search corpus' }));
    const result = await screen.findByRole('button', { name: 'Result 0.0–1.0 Alpha beta' });
    expect(result.querySelector('mark')?.textContent).toBe('beta');
    fireEvent.click(result);
    expect(textValue('Text')).toBe('Alpha beta');
    expect(screen.queryByRole('button', { name: 'Result 2.0–3.0 other' })).toBeNull();
  });

  it('opens the layer that contains the hit', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 12,
    }) as { id: string };
    const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '文稿' },
      mediaId: media.id,
    }) as { id: string };
    const first = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      sortOrder: 0,
    }) as { id: string };
    const second = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tl',
      name: { zh: '第二层' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      sortOrder: 1,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'units.create', {
      layerId: first.id,
      startTime: 0,
      endTime: 1,
      text: 'keep',
    });
    callDesktopSession(session.sessionId, 'units.create', {
      layerId: second.id,
      startTime: 0,
      endTime: 1,
      text: 'other layer',
    });
    mount(session.sessionId);
    await screen.findByRole('button', { name: '0.0–1.0 keep' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Query text' }), {
      target: { value: 'layer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search corpus' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Result 0.0–1.0 other layer' }));
    expect(await screen.findByRole('button', { name: '0.0–1.0 other layer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '0.0–1.0 keep' })).toBeNull();
    await waitFor(() => {
      expect(textValue('Text')).toBe('other layer');
    });
  });

  it('deletes a manuscript only after the impact is confirmed', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 8,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '文稿' },
      mediaId: media.id,
    });
    mount(session.sessionId);
    expect(await screen.findByRole('button', { name: '文稿' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete manuscript' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Recording a.wav')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete manuscript' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '文稿' })).toBeNull();
    });
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual([]);
    expect(callDesktopSession(session.sessionId, 'manuscripts.listDeleted', {})).toHaveLength(1);
  });

  it('does not confirm deletion while a transcription is running', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 8,
    }) as { id: string };
    const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '文稿' },
      mediaId: media.id,
    }) as { id: string };
    const layer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'modelRuns.start', {
      manuscriptId: manuscript.id,
      layerId: layer.id,
      modelId: 'local.whisper',
      modelVersion: '1',
      manifestSha256: 'abc',
      params: {},
      rangeStart: 0,
      rangeEnd: 8,
    });
    mount(session.sessionId);
    expect(await screen.findByRole('button', { name: '文稿' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete manuscript' }));
    const confirm = await screen.findByRole('button', { name: 'Confirm delete' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirm);
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toHaveLength(1);
  });

  it('records a reminder only after the due list is opened', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    writeFileSync(join(dir, 'b.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 8,
    }) as { id: string };
    const later = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '留下' },
      mediaId: media.id,
    }) as { id: string };
    const due = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '到期' },
      mediaId: media.id,
    }) as { id: string };
    const recording = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'b.wav',
      sha256: 'bb',
      duration: 8,
    }) as { id: string };
    const onRecording = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '录音文稿' },
      mediaId: recording.id,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: later.id });
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: due.id });
    callDesktopSession(session.sessionId, 'media.delete', { id: recording.id });
    mount(session.sessionId);
    fireEvent.click(await screen.findByRole('button', { name: 'Deletion reminders' }));
    expect(await screen.findByText('Nothing is due for removal')).toBeTruthy();
    expect(reminderAt(session.sessionId, 'manuscripts', later.id)).toBeNull();
    expect(reminderAt(session.sessionId, 'manuscripts', due.id)).toBeNull();
    expect(reminderAt(session.sessionId, 'media', recording.id)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    const until = daysFromNow(3);
    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE manuscripts SET retain_until = ? WHERE id = ?')
      .run(until, due.id);
    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE media SET retain_until = ? WHERE id = ?')
      .run(until, recording.id);
    fireEvent.click(screen.getByRole('button', { name: 'Deletion reminders' }));
    expect(await screen.findByText(`Manuscript 到期, kept until ${until}`)).toBeTruthy();
    expect(screen.getByText(`Recording b.wav, kept until ${until}`)).toBeTruthy();
    expect(screen.queryByText(/留下/)).toBeNull();
    expect(screen.queryByText(/录音文稿/)).toBeNull();
    await waitFor(() => {
      expect(reminderAt(session.sessionId, 'manuscripts', due.id)).not.toBeNull();
      expect(reminderAt(session.sessionId, 'media', recording.id)).not.toBeNull();
    });
    const manuscriptShown = reminderAt(session.sessionId, 'manuscripts', due.id);
    const recordingShown = reminderAt(session.sessionId, 'media', recording.id);
    expect(reminderAt(session.sessionId, 'manuscripts', later.id)).toBeNull();
    expect(reminderAt(session.sessionId, 'manuscripts', onRecording.id)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deletion reminders' }));
    expect(await screen.findByText(`Manuscript 到期, kept until ${until}`)).toBeTruthy();
    await waitFor(() => {
      expect(reminderAt(session.sessionId, 'manuscripts', due.id)).toBe(manuscriptShown);
      expect(reminderAt(session.sessionId, 'media', recording.id)).toBe(recordingShown);
    });
  });
});

function reminderAt(sessionId: string, table: 'manuscripts' | 'media', id: string): string | null {
  const row = requireDesktopSession(sessionId)
    .db.prepare(`SELECT reminder_shown_at AS shown FROM ${table} WHERE id = ?`)
    .get(id) as { shown: string | null };
  return row.shown;
}

function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function tempFolder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-desktop-read-'));
  roots.push(root);
  return root;
}

function mount(sessionId: string): void {
  const host: DesktopReadHost = {
    projectReadEnabled: true,
    chooseDesktopFolder: () => Promise.resolve({ sessionId }),
    desktopCall: (id, method, args) => Promise.resolve(callDesktopSession(id, method, args)),
    desktopMediaUrl: () => Promise.resolve({ url: 'jieyu-media://local/token' }),
  };
  (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
}

function textValue(name: string): string {
  return (screen.getByRole('textbox', { name }) as HTMLInputElement).value;
}
