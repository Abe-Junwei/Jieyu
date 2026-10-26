// @vitest-environment jsdom

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { featureFlags } from '../ai/config/featureFlags';
import { createDesktopClient } from '../db/desktop/client';
import { callDesktopSession } from '../db/desktop/desktopCall';
import { linkSense, removeSense, saveLexemeEntry } from '../db/desktop/lexicon';
import { openProject } from '../db/desktop/openProject';
import { writeAnalysisRoot } from '../db/desktop/units';
import { openDesktopSession, resetDesktopSessions } from '../db/desktop/projectSession';
import { releaseAllProjectLocks } from '../desktop/skeleton/projectLock';
import { LocaleProvider } from '../i18n';
import { ProjectCustomFieldManager } from './ProjectCustomFieldManager';
import { useProjectCustomFieldController } from './useProjectCustomFieldController';

const roots: string[] = [];

afterEach(() => {
  cleanup();
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('project custom fields', () => {
  it('stays off unless the desktop flag is enabled', () => {
    expect(featureFlags.projectCustomFieldsEnabled).toBe(false);
  });

  it('creates a definition, reuses the same import, and previews the migration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jieyu-fields-ui-'));
    roots.push(dir);
    const session = openDesktopSession(dir, [dir]);
    render(
      <LocaleProvider locale="en-US">
        <ProjectCustomFieldManager
          desktopCall={(sessionId, method, args) =>
            Promise.resolve(callDesktopSession(sessionId, method, args))
          }
          sessionId={session.sessionId}
        />
      </LocaleProvider>,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'count' } });
    fireEvent.click(screen.getByRole('button', { name: 'New definition' }));
    await screen.findByRole('button', { name: 'count' });
    fireEvent.click(screen.getByRole('button', { name: 'count' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview migration' }));
    await screen.findByText('Revision 1, 0 current, 0 history');

    fireEvent.click(screen.getByRole('button', { name: 'Import and reuse' }));
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'count' })).toHaveLength(1);
    });

    fireEvent.change(screen.getByLabelText('Object'), { target: { value: 'language' } });
    expect(screen.getByText('This object has no fields yet')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import as new' }));
    await screen.findByRole('button', { name: 'note' });

    resetDesktopSessions();
    const reopened = openDesktopSession(dir, [dir]);
    const listed = callDesktopSession(reopened.sessionId, 'customFields.listDefinitions', {}) as {
      targetType: string;
      name: Record<string, string>;
    }[];
    expect(listed.map((item) => `${item.targetType}:${item.name.en}`).sort()).toEqual([
      'language:note',
      'unit:count',
    ]);
  });

  it('shows a missing required value, confirms removal, and lists a deleted sense', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jieyu-fields-ui-'));
    roots.push(dir);
    seedHost(dir);
    const session = openDesktopSession(dir, [dir]);
    render(
      <LocaleProvider locale="en-US">
        <ProjectCustomFieldManager
          desktopCall={(sessionId, method, args) =>
            Promise.resolve(callDesktopSession(sessionId, method, args))
          }
          sessionId={session.sessionId}
        />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Required' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'count' } });
    fireEvent.click(screen.getByRole('button', { name: 'New definition' }));
    await screen.findByRole('button', { name: 'count' });
    fireEvent.change(screen.getByLabelText('Object id'), { target: { value: 'u1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check missing values' }));
    await waitFor(() => {
      const plain = screen
        .getAllByRole('listitem')
        .filter((item) => item.querySelector('button') === null);
      expect(plain.map((item) => item.textContent)).toEqual(['count']);
    });

    fireEvent.click(screen.getByRole('button', { name: 'count' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview removal' }));
    await screen.findByText('Remove count: 0 current and 0 history');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'count' })).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show invalid references' }));
    await screen.findByText('sense1 Sense was deleted');

    resetDesktopSessions();
    const reopened = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(reopened.sessionId, 'customFields.listDefinitions', {})).toEqual([]);
    const links = callDesktopSession(reopened.sessionId, 'references.listLinks', {}) as {
      senseId: string;
      linkState: string;
      gap?: string;
    }[];
    expect(links).toEqual([
      expect.objectContaining({
        senseId: 'sense1',
        linkState: 'target-missing',
        gap: 'missing-sense',
      }),
    ]);
  });

  it('ignores a late purge preview after the selection changes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jieyu-fields-ui-'));
    roots.push(dir);
    const session = openDesktopSession(dir, [dir]);
    const client = createDesktopClient({
      desktopCall: (sessionId, method, args) =>
        Promise.resolve(callDesktopSession(sessionId, method, args)),
    });
    const first = await client.createCustomFieldDefinition(session.sessionId, {
      targetType: 'unit',
      name: { en: 'A' },
      fieldType: 'text',
    });
    const second = await client.createCustomFieldDefinition(session.sessionId, {
      targetType: 'unit',
      name: { en: 'B' },
      fieldType: 'text',
    });
    let deliver: () => void = () => {
      throw new Error('preview not started');
    };
    const desktopCall = (sessionId: string, method: string, args: unknown) => {
      const result = callDesktopSession(sessionId, method, args);
      if (method === 'customFields.previewPurge') {
        return new Promise((resolve) => {
          deliver = () => resolve(result);
        });
      }
      return Promise.resolve(result);
    };
    const hook = renderHook(() => useProjectCustomFieldController(desktopCall, session.sessionId), {
      wrapper: ({ children }) => <LocaleProvider locale="en-US">{children}</LocaleProvider>,
    });
    await waitFor(() => expect(hook.result.current.visible).toHaveLength(2));
    act(() => hook.result.current.chooseDefinition(hook.result.current.visible[0]!));
    act(() => hook.result.current.previewPurge());
    act(() => hook.result.current.chooseDefinition(hook.result.current.visible[1]!));
    await act(async () => deliver());
    expect(hook.result.current.purge).toBeNull();
    act(() => hook.result.current.confirmPurge());
    expect(
      (await client.listCustomFieldDefinitions(session.sessionId)).map((item) => item.id).sort(),
    ).toEqual([first.id, second.id].sort());
  });
});

const T = '2026-10-26T00:00:00.000Z';

function seedHost(dir: string): void {
  const project = openProject(dir);
  const db = project.db;
  db.prepare(
    'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('m1', 'a.wav', 'aa', 'a.wav', 1, T);
  db.prepare(
    'INSERT INTO manuscripts (id, title_json, media_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run('ms1', '{"en":"Clip"}', 'm1', T, T);
  db.prepare(
    `INSERT INTO layers (
      id, manuscript_id, key, name_json, tier_type, content_type, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, '{"en":"Transcription"}', 'time-aligned', 'transcription', 0, ?, ?)`,
  ).run('ly1', 'ms1', 'tx', T, T);
  db.prepare(
    'INSERT INTO units (id, layer_id, start_time, end_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('u1', 'ly1', 0, 1, T, T);
  db.prepare(
    `INSERT INTO tokens (
      id, unit_id, token_index, form_json, gloss_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('tok-1', 'u1', 0, '{"default":"ka"}', '{}', T, T);
  db.prepare(
    `INSERT INTO unit_texts (id, unit_id, role, body, updated_at) VALUES ('ut1', 'u1', 'transcription', 'ka', ?)`,
  ).run(T);
  writeAnalysisRoot(db, {
    unitId: 'u1',
    expectedAnalysisGeneration: 0,
    graph: {
      payloadVersion: 1,
      id: 'g0',
      text: 'ka',
      nodes: [
        {
          id: 'tok-1',
          type: 'token',
          label: 'ka',
          domain: { form: { default: 'ka' }, index: 0, createdAt: T, updatedAt: T },
        },
      ],
      relations: [],
    },
  });
  saveLexemeEntry(db, {
    id: 'lexemeA',
    entry: { headword: 'ka', senses: [{ id: 'sense1', definitions: [{ text: 'past' }] }] },
  });
  linkSense(db, {
    lexemeId: 'lexemeA',
    targetType: 'token',
    targetId: 'tok-1',
    senseId: 'sense1',
  });
  removeSense(db, { lexemeId: 'lexemeA', senseId: 'sense1' });
  project.close();
}
