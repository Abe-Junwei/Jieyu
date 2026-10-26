// @vitest-environment jsdom

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { featureFlags } from '../ai/config/featureFlags';
import { callDesktopSession } from '../db/desktop/desktopCall';
import { openDesktopSession, resetDesktopSessions } from '../db/desktop/projectSession';
import { releaseAllProjectLocks } from '../desktop/skeleton/projectLock';
import { LocaleProvider } from '../i18n';
import { ProjectCustomFieldManager } from './ProjectCustomFieldManager';

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
});
