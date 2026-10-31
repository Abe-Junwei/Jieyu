// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { DesktopPageRouter, resetDesktopPageRouters } from '../test/desktopPageRouter';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from '../db/desktop/desktopCall';
import {
  openDesktopSession,
  reopenDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from '../db/desktop/projectSession';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import {
  forgetOpenProjectSession,
  readOpenProjectSession,
  rememberOpenProjectSession,
} from '../desktop/openProjectSession';
import { LocaleProvider } from '../i18n';
import { DesktopCorpusPage } from './DesktopCorpusPage';
import { DesktopProjectReadPage } from './DesktopProjectReadPage';
import {
  subscribeDesktopDomainEvents,
  type DesktopDomainEvent,
} from '../desktop/desktopDomainEvents';

const roots: string[] = [];

afterEach(() => {
  resetDesktopPageRouters();
  while (eventStops.length > 0) eventStops.pop()?.();
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
      <DesktopPageRouter initialEntries={['/desktop-project']}>
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route path="/elsewhere" element={<div>elsewhere</div>} />
          <Route
            path="/desktop-project"
            element={
              <>
                <LeaveProbe />
                <DesktopProjectReadPage />
              </>
            }
          />
        </Routes>
      </DesktopPageRouter>
    </LocaleProvider>,
  );
}

function LeaveProbe() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate('/elsewhere')}>
      leave page
    </button>
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
    const corpus = readFileSync(join(process.cwd(), 'src/pages/DesktopCorpusPage.tsx'), 'utf8');
    const exchange = readFileSync(
      join(process.cwd(), 'src/pages/DesktopExchangePanel.tsx'),
      'utf8',
    );
    const conversations = readFileSync(
      join(process.cwd(), 'src/pages/DesktopConversationPanel.tsx'),
      'utf8',
    );
    const conversationHook = readFileSync(
      join(process.cwd(), 'src/pages/useDesktopConversations.ts'),
      'utf8',
    );
    expect(page.includes('dexie') || page.includes('Dexie') || page.includes('getDb')).toBe(false);
    expect(page.includes('storageCall')).toBe(false);
    expect(page.includes("from '../db")).toBe(false);
    expect(controller.includes("from '../db")).toBe(false);
    expect(view.includes('dexie') || view.includes('Dexie') || view.includes('getDb')).toBe(false);
    expect(corpus.includes("from '../db")).toBe(false);
    expect(exchange.includes("from '../db")).toBe(false);
    expect(conversations.includes("from '../db")).toBe(false);
    expect(conversationHook.includes("from '../db")).toBe(false);
    expect(
      conversationHook.includes('sessionMemory') || conversationHook.includes('embedding'),
    ).toBe(false);
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
        if (method === 'project.get') {
          return Promise.resolve({
            id: 'p1',
            title: { und: 'folder' },
            createdAt: '',
            updatedAt: '',
          });
        }
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
        if (
          method === 'speakers.list' ||
          method === 'catalog.listLanguages' ||
          method === 'bridges.list' ||
          method === 'conversations.list' ||
          method === 'messages.list'
        ) {
          return Promise.resolve([]);
        }
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

  it('undoes one text edit from the page and reads it back after reopen', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 3,
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
      endTime: 1,
      text: '原句',
    }) as { id: string };
    mount(session.sessionId);
    fireEvent.click(await screen.findByRole('button', { name: /原句/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: '改过' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
    expect(await screen.findByRole('button', { name: /改过/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: /原句/ })).toBeTruthy();
    expect(textValue('Text')).toBe('原句');
    reopenDesktopSession(session.sessionId);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toMatchObject({
      text: '原句',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(textValue('Text')).toBe('原句');
  });

  it('splits a unit from the page, undoes it, and reads the span back', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const unit = seedReadUnit(session.sessionId, 0, 1, '原句');
    mount(session.sessionId);
    fireEvent.click(await screen.findByRole('button', { name: /原句/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(await screen.findByRole('button', { name: '0.0–0.5 原句' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '0.5–1.0 原句' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: '0.0–1.0 原句' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '0.5–1.0 原句' })).toBeNull();
    reopenDesktopSession(session.sessionId);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toMatchObject({
      startTime: 0,
      endTime: 1,
      text: '原句',
    });
  });

  it('merges the next unit from the page, undoes it, and reads both back', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const left = seedReadUnit(session.sessionId, 0, 1, '甲');
    const right = callDesktopSession(session.sessionId, 'units.create', {
      layerId: left.layerId,
      startTime: 1,
      endTime: 2,
      text: '乙',
    }) as { id: string };
    mount(session.sessionId);
    fireEvent.click(await screen.findByRole('button', { name: /甲/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge next' }));
    expect(await screen.findByRole('button', { name: '0.0–2.0 甲' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /乙/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: /乙/ })).toBeTruthy();
    reopenDesktopSession(session.sessionId);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: left.id })).toMatchObject({
      endTime: 1,
      text: '甲',
    });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: right.id })).toMatchObject({
      startTime: 1,
      text: '乙',
    });
  });

  describe('slice 0: text save through the invalidation table', () => {
    it('re-reads through the single table, not a page reload, and shows the saved value', async () => {
      const dir = tempFolder();
      writeFileSync(join(dir, 'a.wav'), '');
      const session = openDesktopSession(dir, [dir]);
      const unit = seedReadUnit(session.sessionId, 0, 1, '原句');
      const { host, calls } = countingHost(session.sessionId);
      const events = recordEvents();
      mountWith(host);
      fireEvent.click(await screen.findByRole('button', { name: '0.0–1.0 原句' }));
      const listsBefore = calls.filter((call) => call === 'units.list').length;
      fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), {
        target: { value: '改过' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
      expect(await screen.findByRole('button', { name: '0.0–1.0 改过' })).toBeTruthy();
      expect(textValue('Text')).toBe('改过');
      expect(events).toEqual([
        {
          type: 'unit.textSaved',
          sessionId: session.sessionId,
          manuscriptId: expect.any(String),
          unitId: unit.id,
        },
      ]);
      expect(calls.filter((call) => call === 'units.list').length).toBe(listsBefore + 1);
      reopenDesktopSession(session.sessionId);
      expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toMatchObject({
        text: '改过',
      });
    });

    it('keeps the draft, emits nothing, and stops a silent leave when the save fails', async () => {
      const dir = tempFolder();
      writeFileSync(join(dir, 'a.wav'), '');
      const session = openDesktopSession(dir, [dir]);
      const unit = seedReadUnit(session.sessionId, 0, 1, '原句');
      const { host, failText } = countingHost(session.sessionId);
      const events = recordEvents();
      mountWith(host);
      fireEvent.click(await screen.findByRole('button', { name: '0.0–1.0 原句' }));
      failText(true);
      fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), {
        target: { value: '草稿' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
      expect(await screen.findByText('Text was not saved; the draft is kept')).toBeTruthy();
      expect(textValue('Text')).toBe('草稿');
      expect(events).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: 'leave page' }));
      const dialog = await screen.findByRole('dialog', { name: 'This text is not saved yet' });
      expect(screen.queryByText('elsewhere')).toBeNull();
      expect(dialog.textContent).toContain('Text was not saved; the draft is kept');
      fireEvent.click(screen.getByRole('button', { name: 'Stay here' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(textValue('Text')).toBe('草稿');
      fireEvent.click(screen.getByRole('button', { name: 'leave page' }));
      await screen.findByRole('dialog', { name: 'This text is not saved yet' });
      failText(false);
      fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
      expect(await screen.findByText('elsewhere')).toBeTruthy();
      expect(events.map((event) => event.type)).toEqual(['unit.textSaved']);
      expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toMatchObject({
        text: '草稿',
      });
    });

    it('saves a submittable draft before switching units and asks before dropping a failed one', async () => {
      const dir = tempFolder();
      writeFileSync(join(dir, 'a.wav'), '');
      const session = openDesktopSession(dir, [dir]);
      const left = seedReadUnit(session.sessionId, 0, 1, '左');
      callDesktopSession(session.sessionId, 'units.create', {
        layerId: left.layerId,
        startTime: 1,
        endTime: 2,
        text: '右',
      });
      const { host, failText } = countingHost(session.sessionId);
      mountWith(host);
      fireEvent.click(await screen.findByRole('button', { name: '0.0–1.0 左' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), {
        target: { value: '左改' },
      });
      fireEvent.click(screen.getByRole('button', { name: '1.0–2.0 右' }));
      expect(await screen.findByRole('button', { name: '0.0–1.0 左改' })).toBeTruthy();
      await waitFor(() => expect(textValue('Text')).toBe('右'));
      failText(true);
      fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), {
        target: { value: '右改' },
      });
      fireEvent.click(screen.getByRole('button', { name: '0.0–1.0 左改' }));
      await screen.findByRole('dialog', { name: 'This text is not saved yet' });
      expect(textValue('Text')).toBe('右改');
      fireEvent.click(screen.getByRole('button', { name: 'Discard this edit' }));
      await waitFor(() => expect(textValue('Text')).toBe('左改'));
      expect(callDesktopSession(session.sessionId, 'units.get', { id: left.id })).toMatchObject({
        text: '左改',
      });
      expect(screen.getByRole('button', { name: '1.0–2.0 右' })).toBeTruthy();
    });

    it('does not submit while an IME composition is open', async () => {
      const dir = tempFolder();
      writeFileSync(join(dir, 'a.wav'), '');
      const session = openDesktopSession(dir, [dir]);
      const unit = seedReadUnit(session.sessionId, 0, 1, '原句');
      const { host, calls } = countingHost(session.sessionId);
      mountWith(host);
      fireEvent.click(await screen.findByRole('button', { name: '0.0–1.0 原句' }));
      const input = screen.getByRole('textbox', { name: 'Text' });
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: 'ni' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
      fireEvent.click(screen.getByRole('button', { name: 'leave page' }));
      await screen.findByRole('dialog', { name: 'This text is not saved yet' });
      expect(calls.filter((call) => call === 'units.updateText')).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: 'Stay here' }));
      fireEvent.change(input, { target: { value: '你' } });
      fireEvent.compositionEnd(input);
      fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
      expect(await screen.findByRole('button', { name: '0.0–1.0 你' })).toBeTruthy();
      expect(calls.filter((call) => call === 'units.updateText')).toEqual(['units.updateText']);
      expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toMatchObject({
        text: '你',
      });
    });

    it('drops a slow read from the old session after switching projects', async () => {
      const dir = tempFolder();
      writeFileSync(join(dir, 'a.wav'), '');
      const current = openDesktopSession(dir, [dir]);
      seedReadUnit(current.sessionId, 0, 1, '新项目');
      const stale = 'stale-session';
      let releaseOld: () => void = () => {};
      const oldGate = new Promise<void>((resolve) => {
        releaseOld = resolve;
      });
      const picks = [stale, current.sessionId];
      const host: DesktopReadHost = {
        projectReadEnabled: true,
        chooseDesktopFolder: () => Promise.resolve({ sessionId: picks.shift() ?? '' }),
        desktopCall: async (id, method, args) => {
          if (id !== stale) return callDesktopSession(id, method, args);
          if (method === 'manuscripts.list') {
            return [{ id: 'old-ms', title: { zh: '旧稿' }, mediaId: 'old-media' }];
          }
          if (method === 'layers.list') {
            return [
              {
                id: 'old-layer',
                tierType: 'time-aligned',
                contentType: 'transcription',
              },
            ];
          }
          if (method === 'units.list') {
            await oldGate;
            return [{ id: 'old-unit', startTime: 0, endTime: 1, text: '旧项目' }];
          }
          if (method === 'project.get') return { title: { und: 'old' } };
          return [];
        },
        desktopMediaUrl: () => Promise.resolve({ url: 'jieyu-media://local/token' }),
      };
      mountWith(host);
      await waitFor(() => expect(readOpenProjectSession()).toBe(stale));
      fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
      expect(await screen.findByRole('button', { name: '0.0–1.0 新项目' })).toBeTruthy();
      releaseOld();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.queryByRole('button', { name: '0.0–1.0 旧项目' })).toBeNull();
      expect(screen.queryByRole('button', { name: '旧稿' })).toBeNull();
      expect(screen.getByRole('button', { name: '0.0–1.0 新项目' })).toBeTruthy();
    });
  });

  it('reads the project name after the folder is opened again', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    mount(session.sessionId);
    expect(await screen.findByText(basename(dir))).toBeTruthy();
    reopenDesktopSession(session.sessionId);
    cleanup();
    mount(session.sessionId);
    expect(await screen.findByText(basename(dir))).toBeTruthy();
  });

  it('assigns a speaker, edits the catalog, and reads both back after reopen', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const left = seedReadUnit(session.sessionId, 0, 1, '原句');
    callDesktopSession(session.sessionId, 'units.create', {
      layerId: left.layerId,
      startTime: 1,
      endTime: 2,
      text: '后句',
    });
    const language = callDesktopSession(session.sessionId, 'catalog.ensureProjectDefinition', {
      name: { zh: '示例', en: 'Example' },
      sourceType: 'user-custom',
      iso6393: 'eng',
    }) as { id: string };
    const source = callDesktopSession(session.sessionId, 'orthographies.create', {
      languageId: language.id,
      name: { en: 'Latin' },
      scriptTag: 'Latn',
      sourceType: 'user-custom',
    }) as { id: string };
    const target = callDesktopSession(session.sessionId, 'orthographies.create', {
      languageId: language.id,
      name: { en: 'Cyrillic' },
      scriptTag: 'Cyrl',
      sourceType: 'user-custom',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'bridges.create', {
      sourceOrthographyId: source.id,
      targetOrthographyId: target.id,
      engine: 'table-map',
      rules: { mappings: [{ from: 'a', to: 'b' }] },
    });
    mount(session.sessionId);
    expect(await screen.findByRole('textbox', { name: 'Language name' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Speaker name' }), {
      target: { value: 'Ada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create speaker' }));
    expect(await screen.findByRole('button', { name: 'Ada' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Speaker note' }), {
      target: { value: '田野' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save speaker note' }));
    expect(await screen.findByDisplayValue('田野')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Language name' }), {
      target: { value: '木雅' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save language' }));
    expect(await screen.findByRole('button', { name: '木雅' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Script' }), {
      target: { value: 'Syrc' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save orthography' }));
    expect(await screen.findByRole('button', { name: 'Syrc' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Bridge rules' }), {
      target: { value: '{"mappings":[{"from":"a","to":"c"}]}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save bridge' }));
    expect(await screen.findByDisplayValue('{"mappings":[{"from":"a","to":"c"}]}')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Assign speaker' }));
    expect(await screen.findByText('原句 · Ada')).toBeTruthy();
    expect(screen.getByText('后句 · Ada')).toBeTruthy();

    cleanup();
    mount(session.sessionId);
    expect(await screen.findByText('原句 · Ada')).toBeTruthy();
    expect(screen.getByDisplayValue('田野')).toBeTruthy();
    expect(screen.getByRole('button', { name: '木雅' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Syrc' })).toBeTruthy();
    expect(screen.getByDisplayValue('{"mappings":[{"from":"a","to":"c"}]}')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '0.0–1.0 原句' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(screen.queryByText('原句 · Ada')).toBeNull();
    });
    reopenDesktopSession(session.sessionId);
    cleanup();
    mount(session.sessionId);
    expect(await screen.findByDisplayValue('田野')).toBeTruthy();
    expect(screen.getByRole('button', { name: '木雅' })).toBeTruthy();
    expect(screen.queryByText('原句 · Ada')).toBeNull();
    expect(screen.getByText('原句')).toBeTruthy();
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

  it('carries the manuscript, layer, and unit from the corpus page', async () => {
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
    const firstLayer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: first.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const secondLayer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: second.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'units.create', {
      layerId: firstLayer.id,
      startTime: 0,
      endTime: 1,
      text: 'stay',
    });
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: secondLayer.id,
      startTime: 4,
      endTime: 5,
      text: 'jump',
    }) as { id: string };
    rememberOpenProjectSession(session.sessionId);
    const host: DesktopReadHost = {
      projectReadEnabled: true,
      chooseDesktopFolder: () => Promise.resolve({ cancelled: true }),
      desktopCall: (id, method, args) => Promise.resolve(callDesktopSession(id, method, args)),
      desktopMediaUrl: () => Promise.resolve({ url: 'jieyu-media://local/token' }),
    };
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
    render(
      <LocaleProvider locale="en-US">
        <DesktopPageRouter initialEntries={['/corpus']}>
          <LocationProbe />
          <Routes>
            <Route path="/corpus" element={<DesktopCorpusPage />} />
            <Route path="/desktop-project" element={<DesktopProjectReadPage />} />
          </Routes>
        </DesktopPageRouter>
      </LocaleProvider>,
    );
    fireEvent.change(await screen.findByRole('textbox', { name: 'Query text' }), {
      target: { value: 'jump' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search corpus' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Result 4.0–5.0 jump' }));
    const location = screen.getByTestId('location').textContent ?? '';
    expect(location).toContain('/desktop-project?');
    expect(location).toContain(`manuscriptId=${second.id}`);
    expect(location).toContain(`layerId=${secondLayer.id}`);
    expect(location).toContain(`unitId=${unit.id}`);
    expect(await screen.findByRole('button', { name: '乙', current: true })).toBeTruthy();
    await waitFor(() => {
      expect(textValue('Text')).toBe('jump');
    });
    expect(screen.queryByRole('button', { name: '0.0–1.0 stay' })).toBeNull();
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
    cleanup();
    resetDesktopSessions();
    const again = openDesktopSession(dir, [dir]);
    mount(again.sessionId);
    expect(await screen.findByRole('button', { name: 'Register recording' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '文稿' })).toBeNull();
    expect(callDesktopSession(again.sessionId, 'manuscripts.listDeleted', {})).toHaveLength(1);
  });

  it('lists a deleted manuscript without its text and restores it', async () => {
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
    callDesktopSession(session.sessionId, 'units.create', {
      layerId: layer.id,
      startTime: 0,
      endTime: 1,
      text: 'secret-body',
    });
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: manuscript.id });
    callDesktopSession(session.sessionId, 'media.delete', { id: media.id });
    mount(session.sessionId);
    expect(await screen.findByText(/Manuscript 文稿, kept until /)).toBeTruthy();
    expect(screen.getByText(/Recording a\.wav, kept until /)).toBeTruthy();
    expect(screen.queryByText('secret-body')).toBeNull();
    expect(screen.queryByRole('button', { name: '文稿' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore manuscript' }));
    expect(await screen.findByText('Restored 文稿')).toBeTruthy();
    expect(await screen.findByRole('button', { name: '文稿' })).toBeTruthy();
    expect(screen.queryByText(/Recording a\.wav, kept until /)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '文稿' }));
    expect(await screen.findByRole('button', { name: '0.0–1.0 secret-body' })).toBeTruthy();
    cleanup();
    resetDesktopSessions();
    const again = openDesktopSession(dir, [dir]);
    mount(again.sessionId);
    expect(await screen.findByRole('button', { name: '文稿' })).toBeTruthy();
    expect(screen.queryByText(/Manuscript 文稿, kept until /)).toBeNull();
    expect(callDesktopSession(again.sessionId, 'units.list', { layerId: layer.id })).toEqual([
      expect.objectContaining({ text: 'secret-body' }),
    ]);
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
    expect(screen.queryByRole('textbox', { name: 'Transcript' })).toBeNull();
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
    const reminder = await screen.findByRole('dialog');
    expect(reminder).toHaveTextContent(`Manuscript 到期, kept until ${until}`);
    expect(reminder).toHaveTextContent(`Recording b.wav, kept until ${until}`);
    expect(reminder).not.toHaveTextContent('留下');
    expect(reminder).not.toHaveTextContent('录音文稿');
    expect(screen.getByText(/Manuscript 留下, kept until /)).toBeTruthy();
    expect(screen.getByText(/Manuscript 录音文稿, kept until /)).toBeTruthy();
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

  it('imports FlexText without embedded roles via the panel (#429)', async () => {
    const dir = tempFolder();
    const session = openDesktopSession(dir, [dir]);
    const source = join(dir, 'source');
    mkdirSync(source);
    writeFileSync(join(source, 'phrase.wav'), Buffer.from('synthetic-chain'));
    const file = join(source, 'phrase.flextext');
    writeFileSync(
      file,
      `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <interlinear-text>
    <paragraphs><paragraph><phrases>
      <phrase begin-time-offset="0" end-time-offset="1000">
        <item type="txt" lang="und">kept sentence</item>
      </phrase>
    </phrases></paragraph></paragraphs>
  </interlinear-text>
</document>`,
    );
    const host: DesktopReadHost = {
      projectReadEnabled: true,
      chooseDesktopFolder: () => Promise.resolve({ sessionId: session.sessionId }),
      chooseImportFile: () => Promise.resolve({ file }),
      chooseExportFile: () => Promise.resolve({ cancelled: true }),
      desktopCall: (id, method, args) => Promise.resolve(callDesktopSession(id, method, args)),
      desktopMediaUrl: () => Promise.resolve({ url: 'jieyu-media://local/token' }),
    };
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import file' }));
    expect(await screen.findByRole('button', { name: /kept sentence/ })).toBeTruthy();
  });

  it('imports a field file into the open project and reads it after reopen', async () => {
    const dir = tempFolder();
    const session = openDesktopSession(dir, [dir]);
    const source = join(dir, 'source');
    mkdirSync(source);
    writeFileSync(join(source, 'test.wav'), Buffer.from('synthetic-chain'));
    const file = join(source, 'kept.eaf');
    writeFileSync(file, keptEaf());
    const exported = join(dir, 'out.jyt');
    const host: DesktopReadHost = {
      projectReadEnabled: true,
      chooseDesktopFolder: () => Promise.resolve({ sessionId: session.sessionId }),
      chooseImportFile: () => Promise.resolve({ file }),
      chooseExportFile: () => Promise.resolve({ file: exported }),
      desktopCall: (id, method, args) => Promise.resolve(callDesktopSession(id, method, args)),
      desktopMediaUrl: () => Promise.resolve({ url: 'jieyu-media://local/token' }),
    };
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import file' }));
    expect(await screen.findByRole('button', { name: /kept sentence/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export JYT' }));
    await waitFor(() => {
      expect(existsSync(exported)).toBe(true);
    });
    reopenDesktopSession(session.sessionId);
    cleanup();
    mount(session.sessionId);
    expect(await screen.findByRole('button', { name: /kept sentence/ })).toBeTruthy();
  });

  it('purges a reminded manuscript and leaves it gone after reopen', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 8,
    }) as { id: string };
    const live = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '留下' },
      mediaId: media.id,
    }) as { id: string };
    const due = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '到期' },
      mediaId: media.id,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: due.id });
    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE manuscripts SET retain_until = ?, reminder_shown_at = ? WHERE id = ?')
      .run(PAST, PAST, due.id);
    mount(session.sessionId);
    fireEvent.click(await screen.findByRole('button', { name: 'Deletion reminders' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Purge manuscript' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm purge' }));
    await waitFor(() => {
      expect(callDesktopSession(session.sessionId, 'manuscripts.listDeleted', {})).toEqual([]);
      expect(screen.queryByText(/Manuscript 到期/)).toBeNull();
    });
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual([
      expect.objectContaining({ id: live.id }),
    ]);
    cleanup();
    resetDesktopSessions();
    const again = openDesktopSession(dir, [dir]);
    mount(again.sessionId);
    expect(await screen.findByRole('button', { name: '留下' })).toBeTruthy();
    expect(callDesktopSession(again.sessionId, 'manuscripts.listDeleted', {})).toEqual([]);
  });

  it('refuses an early or unreminded purge, and cancel writes nothing', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 8,
    }) as { id: string };
    const due = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '到期' },
      mediaId: media.id,
    }) as { id: string };
    const layer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: due.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'units.create', {
      layerId: layer.id,
      startTime: 0,
      endTime: 1,
      text: 'secret-body',
    });
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: due.id });
    const until = daysFromNow(3);
    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE manuscripts SET retain_until = ? WHERE id = ?')
      .run(until, due.id);
    mount(session.sessionId);
    fireEvent.click(await screen.findByRole('button', { name: 'Deletion reminders' }));
    await waitFor(() => {
      expect(reminderAt(session.sessionId, 'manuscripts', due.id)).not.toBeNull();
    });
    const shown = reminderAt(session.sessionId, 'manuscripts', due.id);
    fireEvent.click(screen.getByRole('button', { name: 'Purge manuscript' }));
    expect(screen.getByRole('dialog', { name: 'Purge this manuscript' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Purge this manuscript' })).toBeNull();
    expect(reminderAt(session.sessionId, 'manuscripts', due.id)).toBe(shown);
    expect(callDesktopSession(session.sessionId, 'manuscripts.listDeleted', {})).toHaveLength(1);
    expect(unitBody(session.sessionId, layer.id)).toBe('secret-body');

    fireEvent.click(screen.getByRole('button', { name: 'Purge manuscript' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm purge' }));
    expect(await screen.findByText('The purge did not finish')).toBeTruthy();
    expect(callDesktopSession(session.sessionId, 'manuscripts.listDeleted', {})).toHaveLength(1);
    expect(screen.queryByText('secret-body')).toBeNull();

    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE manuscripts SET retain_until = ?, reminder_shown_at = NULL WHERE id = ?')
      .run(PAST, due.id);
    fireEvent.click(screen.getByRole('button', { name: 'Purge manuscript' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm purge' }));
    expect(await screen.findByText('The purge did not finish')).toBeTruthy();
    expect(reminderAt(session.sessionId, 'manuscripts', due.id)).toBeNull();
    expect(unitBody(session.sessionId, layer.id)).toBe('secret-body');

    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE manuscripts SET reminder_shown_at = ? WHERE id = ?')
      .run(PAST, due.id);
    fireEvent.click(screen.getByRole('button', { name: 'Purge manuscript' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm purge' }));
    await waitFor(() => {
      expect(callDesktopSession(session.sessionId, 'manuscripts.listDeleted', {})).toEqual([]);
    });
    cleanup();
    resetDesktopSessions();
    const again = openDesktopSession(dir, [dir]);
    mount(again.sessionId);
    expect(await screen.findByRole('button', { name: 'Register recording' })).toBeTruthy();
    expect(callDesktopSession(again.sessionId, 'manuscripts.listDeleted', {})).toEqual([]);
    expect(
      requireDesktopSession(again.sessionId)
        .db.prepare('SELECT COUNT(*) AS n FROM units')
        .get() as { n: number },
    ).toEqual({ n: 0 });
  });

  it('refuses to remove a recording a manuscript still references', async () => {
    const dir = tempFolder();
    const bytes = Buffer.from('keep-me');
    writeFileSync(join(dir, 'b.wav'), bytes);
    const session = openDesktopSession(dir, [dir]);
    const recording = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'b.wav',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      duration: 8,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '录音文稿' },
      mediaId: recording.id,
    });
    callDesktopSession(session.sessionId, 'media.delete', { id: recording.id });
    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE media SET retain_until = ?, reminder_shown_at = ? WHERE id = ?')
      .run(PAST, PAST, recording.id);
    const host: DesktopReadHost = {
      projectReadEnabled: true,
      chooseDesktopFolder: () => Promise.resolve({ sessionId: session.sessionId }),
      desktopCall: (id, method, args) =>
        Promise.resolve(
          callDesktopSession(
            id,
            method,
            args,
            method === 'media.finishCleanup'
              ? async (file) => {
                  rmSync(file);
                  return 'moved';
                }
              : undefined,
          ),
        ),
      desktopMediaUrl: () => Promise.resolve({ url: 'jieyu-media://local/token' }),
    };
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deletion reminders' }));
    expect(await screen.findByText(/Recording b\.wav, kept until /)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove recording file' })).toBeNull();
    await expect(
      callDesktopSession(
        session.sessionId,
        'media.finishCleanup',
        { id: recording.id, operationId: 'op-referenced' },
        async (file) => {
          rmSync(file);
          return 'moved';
        },
      ),
    ).rejects.toThrow('media is still referenced');
    expect(existsSync(join(dir, 'b.wav'))).toBe(true);
    expect(callDesktopSession(session.sessionId, 'manuscripts.listDeleted', {})).toHaveLength(1);
    cleanup();
    resetDesktopSessions();
    const again = openDesktopSession(dir, [dir]);
    mount(again.sessionId);
    expect(await screen.findByText(/Recording b\.wav, kept until /)).toBeTruthy();
    expect(existsSync(join(dir, 'b.wav'))).toBe(true);
  });

  it('removes a reminded recording file and leaves it gone after reopen', async () => {
    const dir = tempFolder();
    const bytes = Buffer.from('keep-me');
    writeFileSync(join(dir, 'a.wav'), '');
    writeFileSync(join(dir, 'b.wav'), bytes);
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
    const recording = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'b.wav',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      duration: 8,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'media.delete', { id: recording.id });
    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE media SET retain_until = ?, reminder_shown_at = ? WHERE id = ?')
      .run(PAST, PAST, recording.id);
    const host: DesktopReadHost = {
      projectReadEnabled: true,
      chooseDesktopFolder: () => Promise.resolve({ sessionId: session.sessionId }),
      desktopCall: (id, method, args) =>
        Promise.resolve(
          callDesktopSession(
            id,
            method,
            args,
            method === 'media.finishCleanup'
              ? async (file) => {
                  rmSync(file);
                  return 'moved';
                }
              : undefined,
          ),
        ),
      desktopMediaUrl: () => Promise.resolve({ url: 'jieyu-media://local/token' }),
    };
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deletion reminders' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove recording file' }));
    await waitFor(() => {
      expect(existsSync(join(dir, 'b.wav'))).toBe(false);
    });
    expect(callDesktopSession(session.sessionId, 'media.list', {})).toEqual([
      expect.objectContaining({ filename: 'a.wav' }),
    ]);
    cleanup();
    resetDesktopSessions();
    const again = openDesktopSession(dir, [dir]);
    mount(again.sessionId);
    expect(await screen.findByText('a.wav')).toBeTruthy();
    expect(screen.queryByText('b.wav')).toBeNull();
    expect(callDesktopSession(again.sessionId, 'media.list', {})).toEqual([
      expect.objectContaining({ filename: 'a.wav' }),
    ]);
  });

  it('does not retry an unknown recording removal or claim it was restored', async () => {
    const dir = tempFolder();
    const bytes = Buffer.from('keep-me');
    writeFileSync(join(dir, 'b.wav'), bytes);
    const session = openDesktopSession(dir, [dir]);
    const recording = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'b.wav',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      duration: 8,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'media.delete', { id: recording.id });
    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE media SET retain_until = ?, reminder_shown_at = ? WHERE id = ?')
      .run(PAST, PAST, recording.id);
    let calls = 0;
    const gate: { release: () => void } = { release: () => undefined };
    const host: DesktopReadHost = {
      projectReadEnabled: true,
      chooseDesktopFolder: () => Promise.resolve({ sessionId: session.sessionId }),
      desktopCall: (id, method, args) =>
        Promise.resolve(
          callDesktopSession(
            id,
            method,
            args,
            method === 'media.finishCleanup'
              ? () => {
                  calls += 1;
                  return new Promise<'unknown'>((resolve) => {
                    gate.release = () => resolve('unknown');
                  });
                }
              : undefined,
          ),
        ),
      desktopMediaUrl: () => Promise.resolve({ url: 'jieyu-media://local/token' }),
    };
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deletion reminders' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove recording file' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove recording file' }));
    await waitFor(() => {
      expect(calls).toBe(1);
    });
    gate.release();
    expect(
      await screen.findByText('It is unknown whether this recording was removed'),
    ).toBeTruthy();
    expect(screen.queryByText(/Restored /)).toBeNull();
    const button = screen.getByRole('button', { name: 'Remove recording file' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(calls).toBe(1);
    expect(existsSync(join(dir, 'b.wav'))).toBe(true);
    cleanup();
    resetDesktopSessions();
    const again = openDesktopSession(dir, [dir]);
    mount(again.sessionId);
    expect(await screen.findByText(/Recording b\.wav, kept until /)).toBeTruthy();
    expect(existsSync(join(dir, 'b.wav'))).toBe(true);
  });

  it('shows a failed recording removal without saying the file is gone', async () => {
    const dir = tempFolder();
    const bytes = Buffer.from('keep-me');
    writeFileSync(join(dir, 'b.wav'), bytes);
    const session = openDesktopSession(dir, [dir]);
    const recording = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'b.wav',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      duration: 8,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'media.delete', { id: recording.id });
    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE media SET retain_until = ?, reminder_shown_at = ? WHERE id = ?')
      .run(PAST, PAST, recording.id);
    let calls = 0;
    const host: DesktopReadHost = {
      projectReadEnabled: true,
      chooseDesktopFolder: () => Promise.resolve({ sessionId: session.sessionId }),
      desktopCall: (id, method, args) =>
        Promise.resolve(
          callDesktopSession(
            id,
            method,
            args,
            method === 'media.finishCleanup'
              ? () => {
                  calls += 1;
                  throw new Error('disk');
                }
              : undefined,
          ),
        ),
      desktopMediaUrl: () => Promise.resolve({ url: 'jieyu-media://local/token' }),
    };
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deletion reminders' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove recording file' }));
    expect(await screen.findByText('The recording file was not removed')).toBeTruthy();
    expect(screen.queryByText('It is unknown whether this recording was removed')).toBeNull();
    expect(screen.queryByText(/Restored /)).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Remove recording file' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(calls).toBe(1);
    expect(existsSync(join(dir, 'b.wav'))).toBe(true);
  });

  it('accepts a finished transcript and reads the unit after reopen', async () => {
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
    const run = callDesktopSession(session.sessionId, 'modelRuns.start', {
      manuscriptId: manuscript.id,
      layerId: layer.id,
      modelId: 'local.whisper',
      modelVersion: '1',
      manifestSha256: 'abc',
      params: {},
      rangeStart: 0,
      rangeEnd: 8,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'modelRuns.finish', {
      runId: run.id,
      status: 'ok',
      chunkCount: 1,
    });
    mount(session.sessionId);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Transcript' }), {
      target: { value: 'said' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept transcript' }));
    expect(await screen.findByRole('button', { name: '0.0–8.0 said' })).toBeTruthy();
    cleanup();
    resetDesktopSessions();
    const again = openDesktopSession(dir, [dir]);
    mount(again.sessionId);
    expect(await screen.findByRole('button', { name: '0.0–8.0 said' })).toBeTruthy();
  });

  it('accepts two transcript lines and reads both after reopen', async () => {
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
    const run = callDesktopSession(session.sessionId, 'modelRuns.start', {
      manuscriptId: manuscript.id,
      layerId: layer.id,
      modelId: 'local.whisper',
      modelVersion: '1',
      manifestSha256: 'abc',
      params: {},
      rangeStart: 0,
      rangeEnd: 8,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'modelRuns.finish', {
      runId: run.id,
      status: 'ok',
      chunkCount: 1,
    });
    mount(session.sessionId);
    fireEvent.click(await screen.findByRole('button', { name: 'Add transcript line' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Transcript' }), {
      target: { value: 'one' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Transcript start 1' }), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Transcript end 1' }), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Transcript 2' }), {
      target: { value: 'two' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Transcript start 2' }), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Transcript end 2' }), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept transcript' }));
    expect(await screen.findByRole('button', { name: '0.0–1.0 one' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '1.0–2.0 two' })).toBeTruthy();
    cleanup();
    resetDesktopSessions();
    const again = openDesktopSession(dir, [dir]);
    mount(again.sessionId);
    expect(await screen.findByRole('button', { name: '0.0–1.0 one' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '1.0–2.0 two' })).toBeTruthy();
  });

  it('keeps project, manuscript, layer, and text notes after reopen', async () => {
    const dir = tempFolder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    seedReadUnit(session.sessionId, 0, 1, 'keep');
    mount(session.sessionId);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Project note' }), {
      target: { value: 'project-note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save project note' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Manuscript note: 文稿' }), {
      target: { value: 'manuscript-note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save manuscript note: 文稿' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Layer note' }), {
      target: { value: 'layer-note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save layer note' }));
    fireEvent.click(await screen.findByRole('button', { name: '0.0–1.0 keep' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Text note: keep' }), {
      target: { value: 'text-note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save text note' }));
    expect(await screen.findByText('project-note')).toBeTruthy();
    expect(screen.getByText('manuscript-note')).toBeTruthy();
    expect(screen.getByText('layer-note')).toBeTruthy();
    expect(screen.getByText('text-note')).toBeTruthy();
    cleanup();
    resetDesktopSessions();
    const again = openDesktopSession(dir, [dir]);
    mount(again.sessionId);
    expect(await screen.findByText('project-note')).toBeTruthy();
    expect(await screen.findByText('manuscript-note')).toBeTruthy();
    expect(await screen.findByText('layer-note')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: '0.0–1.0 keep' }));
    expect(await screen.findByText('text-note')).toBeTruthy();
  });

  it('registers a recording and restores a deleted hash after reopen', async () => {
    const dir = tempFolder();
    const bytes = Buffer.from('same-bytes');
    writeFileSync(join(dir, 'same.wav'), bytes);
    const session = openDesktopSession(dir, [dir]);
    const sha = createHash('sha256').update(bytes).digest('hex');
    const deleted = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'same.wav',
      sha256: sha,
      duration: 1,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'media.delete', { id: deleted.id });
    mount(session.sessionId);
    expect(await screen.findByRole('button', { name: 'Register recording' })).toBeTruthy();
    expect(screen.queryByText('same.wav')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Recording path' }), {
      target: { value: 'same.wav' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Duration seconds' }), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Register recording' }));
    expect(await screen.findByText('same.wav')).toBeTruthy();
    expect(callDesktopSession(session.sessionId, 'media.list', {})).toEqual([
      expect.objectContaining({ id: deleted.id, filename: 'same.wav' }),
    ]);
    cleanup();
    resetDesktopSessions();
    const again = openDesktopSession(dir, [dir]);
    mount(again.sessionId);
    expect(await screen.findByText('same.wav')).toBeTruthy();
  });

  it('imports a TextGrid beside roles.txt and reads the sentence after reopen', async () => {
    const dir = tempFolder();
    const session = openDesktopSession(dir, [dir]);
    const source = join(dir, 'source');
    mkdirSync(source);
    writeFileSync(join(source, 'kept.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(join(source, 'roles.txt'), 'tx 转写\n');
    const file = join(source, 'kept.TextGrid');
    writeFileSync(file, textGrid('kept sentence'));
    const host: DesktopReadHost = {
      projectReadEnabled: true,
      chooseDesktopFolder: () => Promise.resolve({ sessionId: session.sessionId }),
      chooseImportFile: () => Promise.resolve({ file }),
      chooseExportFile: () => Promise.resolve({ file: join(dir, 'unused.jyt') }),
      desktopCall: (id, method, args) => Promise.resolve(callDesktopSession(id, method, args)),
      desktopMediaUrl: () => Promise.resolve({ url: 'jieyu-media://local/token' }),
    };
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import file' }));
    expect(await screen.findByRole('button', { name: /kept sentence/ })).toBeTruthy();
    cleanup();
    resetDesktopSessions();
    const again = openDesktopSession(dir, [dir]);
    mount(again.sessionId);
    expect(await screen.findByRole('button', { name: /kept sentence/ })).toBeTruthy();
  });
});

function unitBody(sessionId: string, layerId: string): string | null {
  const row = requireDesktopSession(sessionId)
    .db.prepare(
      `SELECT unit_texts.body AS text
       FROM unit_texts
       JOIN units ON units.id = unit_texts.unit_id
       WHERE units.layer_id = ? AND unit_texts.role = 'transcription'`,
    )
    .get(layerId) as { text: string } | undefined;
  return row?.text ?? null;
}

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

const PAST = '2020-01-01T00:00:00.000Z';

function tempFolder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-desktop-read-'));
  roots.push(root);
  return root;
}

function seedReadUnit(
  sessionId: string,
  startTime: number,
  endTime: number,
  text: string,
): { id: string; layerId: string } {
  const media = callDesktopSession(sessionId, 'media.create', {
    relpath: 'a.wav',
    sha256: 'aa',
    duration: 3,
  }) as { id: string };
  const manuscript = callDesktopSession(sessionId, 'manuscripts.create', {
    title: { zh: '文稿' },
    mediaId: media.id,
  }) as { id: string };
  const layer = callDesktopSession(sessionId, 'layers.create', {
    manuscriptId: manuscript.id,
    key: 'tx',
    name: { zh: '转写' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  return callDesktopSession(sessionId, 'units.create', {
    layerId: layer.id,
    startTime,
    endTime,
    text,
  }) as { id: string; layerId: string };
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

function mountWith(host: DesktopReadHost): void {
  (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
}

/** Real single-library calls with a call log; `failText(true)` makes `units.updateText` reject like a lost session. */
function countingHost(sessionId: string) {
  const calls: string[] = [];
  let failing = false;
  const host: DesktopReadHost = {
    projectReadEnabled: true,
    chooseDesktopFolder: () => Promise.resolve({ sessionId }),
    desktopCall: (id, method, args) => {
      calls.push(method);
      if (failing && method === 'units.updateText') {
        return Promise.reject(new Error('session closed'));
      }
      return Promise.resolve(callDesktopSession(id, method, args));
    },
    desktopMediaUrl: () => Promise.resolve({ url: 'jieyu-media://local/token' }),
  };
  return {
    host,
    calls,
    failText: (value: boolean) => {
      failing = value;
    },
  };
}

const eventStops: (() => void)[] = [];

function recordEvents(): DesktopDomainEvent[] {
  const seen: DesktopDomainEvent[] = [];
  eventStops.push(
    subscribeDesktopDomainEvents((event) => {
      seen.push(event);
    }),
  );
  return seen;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function textValue(name: string): string {
  return (screen.getByRole('textbox', { name }) as HTMLInputElement).value;
}

function textGrid(text: string): string {
  return `File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 1
tiers? <exists>
size = 1
item []:
    item [1]:
        class = "IntervalTier"
        name = "tx"
        xmin = 0
        xmax = 1
        intervals: size = 1
        intervals [1]:
            xmin = 0
            xmax = 1
            text = "${text}"
`;
}

function keptEaf(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT>
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="test.wav" MIME_TYPE="audio/x-wav" />
    <PROPERTY NAME="jieyu:layer-meta:transcription">{"role":"transcription"}</PROPERTY>
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
  </TIME_ORDER>
  <TIER TIER_ID="transcription" LINGUISTIC_TYPE_REF="default-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>kept sentence</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" />
</ANNOTATION_DOCUMENT>`;
}
