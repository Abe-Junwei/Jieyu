// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from '../db/desktop/desktopCall';
import { openDesktopSession, resetDesktopSessions } from '../db/desktop/projectSession';
import { forgetOpenProjectSession } from '../desktop/openProjectSession';
import type { DesktopReadHost } from '../desktop/projectReadHost';
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

function tempFolder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-desktop-conversation-'));
  roots.push(root);
  return root;
}

function mount(sessionId: string, methods: string[]): void {
  const host: DesktopReadHost = {
    projectReadEnabled: true,
    chooseDesktopFolder: () => Promise.resolve({ sessionId }),
    desktopCall: (id, method, args) => {
      methods.push(method);
      return Promise.resolve(callDesktopSession(id, method, args));
    },
    desktopMediaUrl: () => Promise.resolve({ url: 'jieyu-media://local/token' }),
  };
  (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
}

function listed(sessionId: string): { id: string; title: string; revisions: { title: number } }[] {
  return callDesktopSession(sessionId, 'conversations.list', {}) as {
    id: string;
    title: string;
    revisions: { title: number };
  }[];
}

describe('DesktopConversationPanel', () => {
  it('creates a conversation, appends a message, and reads both back after reopen', async () => {
    const folder = tempFolder();
    const session = openDesktopSession(folder, [folder]);
    const methods: string[] = [];
    mount(session.sessionId, methods);

    fireEvent.click(await screen.findByRole('button', { name: 'Create conversation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A conversation title is required');
    expect(listed(session.sessionId)).toEqual([]);
    expect(methods).not.toContain('conversations.create');

    fireEvent.change(screen.getByRole('textbox', { name: 'Conversation title' }), {
      target: { value: 'field notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create conversation' }));
    const created = await screen.findByRole('button', { name: 'field notes' });
    expect(created.getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByRole('textbox', { name: 'Conversation message' }), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add message' }));
    expect(await screen.findByText('hello')).toBeTruthy();
    expect(methods).toContain('conversations.create');
    expect(methods).toContain('messages.append');
    const conversationId = listed(session.sessionId)[0]?.id ?? '';

    cleanup();
    resetDesktopSessions();
    const reopened = openDesktopSession(folder, [folder]);
    mount(reopened.sessionId, []);
    fireEvent.click(await screen.findByRole('button', { name: 'field notes' }));
    expect(await screen.findByText('hello')).toBeTruthy();
    expect(listed(reopened.sessionId)).toEqual([
      expect.objectContaining({ id: conversationId, title: 'field notes' }),
    ]);
    expect(callDesktopSession(reopened.sessionId, 'messages.list', { conversationId })).toEqual([
      expect.objectContaining({ role: 'user', body: 'hello' }),
    ]);
  });

  it('keeps the newer title when a rename still holds the old revision', async () => {
    const folder = tempFolder();
    const session = openDesktopSession(folder, [folder]);
    mount(session.sessionId, []);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Conversation title' }), {
      target: { value: 'field notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create conversation' }));
    await screen.findByRole('button', { name: 'field notes' });
    const conversation = listed(session.sessionId)[0];
    expect(conversation?.revisions.title).toBe(0);
    callDesktopSession(session.sessionId, 'conversations.patch', {
      operationId: crypto.randomUUID(),
      id: conversation?.id,
      title: { expectedRevision: 0, value: 'outside' },
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'New conversation title' }), {
      target: { value: 'rejected' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename conversation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This conversation was not written');
    expect(await screen.findByRole('button', { name: 'outside' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'rejected' })).toBeNull();

    cleanup();
    resetDesktopSessions();
    const reopened = openDesktopSession(folder, [folder]);
    expect(listed(reopened.sessionId)).toEqual([
      expect.objectContaining({ id: conversation?.id, title: 'outside' }),
    ]);
    mount(reopened.sessionId, []);
    expect(await screen.findByRole('button', { name: 'outside' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'rejected' })).toBeNull();
  });
});
