// @vitest-environment jsdom
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DesktopPageRouter, resetDesktopPageRouters } from '../test/desktopPageRouter';
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
import { DesktopAnalysisPage } from './DesktopAnalysisPage';

const roots: string[] = [];
const T = '2026-10-28T00:00:00.000Z';

afterEach(() => {
  resetDesktopPageRouters();
  cleanup();
  delete (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop;
  forgetOpenProjectSession();
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

interface Credentials {
  manuscriptGeneration: number;
  analysisGeneration: number;
  graphFingerprint: string;
}

interface ReadState extends Credentials {
  text: string;
  definitionRevisions: { definitionId: string; revision: number }[];
  graph: { nodes: { id: string; label: string }[] } | null;
}

interface ListedCandidate extends Credentials {
  id: string;
  kind: string;
  status: string;
}

function hostFor(methods: string[], writes: unknown[]): DesktopReadHost {
  return {
    projectReadEnabled: true,
    chooseDesktopFolder: () => Promise.reject(new Error('analysis must not choose a folder')),
    desktopCall: (id, method, args) => {
      methods.push(method);
      if (method === 'analysis.accept' || method === 'analysis.restore') writes.push(args);
      return Promise.resolve(callDesktopSession(id, method, args));
    },
    desktopMediaUrl: () => Promise.reject(new Error('analysis must not request media')),
  };
}

function page() {
  return (
    <LocaleProvider locale="en-US">
      <DesktopPageRouter>
        <DesktopAnalysisPage
          host={(globalThis as unknown as { jieyuDesktop: DesktopReadHost }).jieyuDesktop}
        />
      </DesktopPageRouter>
    </LocaleProvider>
  );
}

function openFolder(): { folder: string; sessionId: string; unitId: string } {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-desktop-analysis-'));
  roots.push(folder);
  writeFileSync(join(folder, 'a.wav'), '');
  const session = openDesktopSession(folder, [folder]);
  const media = callDesktopSession(session.sessionId, 'media.create', {
    relpath: 'a.wav',
    sha256: 'aa',
    duration: 3,
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
    endTime: 1,
    text: 'ka',
  }) as { id: string };
  return { folder, sessionId: session.sessionId, unitId: unit.id };
}

function readState(sessionId: string, unitId: string): ReadState {
  return callDesktopSession(sessionId, 'analysis.readState', { unitId }) as ReadState;
}

function credentials(state: Credentials): Credentials {
  return {
    manuscriptGeneration: state.manuscriptGeneration,
    analysisGeneration: state.analysisGeneration,
    graphFingerprint: state.graphFingerprint,
  };
}

function token(id: string, label: string, index: number) {
  return {
    id,
    type: 'token' as const,
    label,
    domain: {
      form: { default: 'ka' },
      gloss: { en: 'past' },
      index,
      createdAt: T,
      updatedAt: T,
      provenance: { actorType: 'human' as const, method: 'manual' as const, createdAt: T },
    },
  };
}

function suggestion(label: string) {
  return {
    payloadVersion: 1 as const,
    id: 'g1',
    text: 'ka',
    nodes: [token('local-1', label, 0)],
    relations: [],
  };
}

function submitSuggestion(sessionId: string, unitId: string, label: string): ListedCandidate {
  const state = readState(sessionId, unitId);
  return callDesktopSession(sessionId, 'analysis.submit', {
    unitId,
    graph: suggestion(label),
    expected: credentials(state),
    definitionRevisions: state.definitionRevisions,
  }) as ListedCandidate;
}

describe('DesktopAnalysisPage', () => {
  it('accepts a real suggestion with the current credentials and reads it back after reopen', async () => {
    const { folder, sessionId, unitId } = openFolder();
    const suggestionRow = submitSuggestion(sessionId, unitId, 'past');
    const before = readState(sessionId, unitId);
    const methods: string[] = [];
    const writes: { candidateId?: string; expected?: Credentials }[] = [];
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = hostFor(methods, writes);
    rememberOpenProjectSession(sessionId);
    const view = render(page());

    fireEvent.click(await screen.findByRole('button', { name: '0.0–1.0 ka' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept suggestion: past' }));
    expect(await screen.findByText('Current analysis: past')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept suggestion: past' })).toBeNull();
    expect(writes).toEqual([{ candidateId: suggestionRow.id, expected: credentials(before) }]);
    expect(methods).toContain('analysis.accept');
    expect(methods).not.toContain('analysis.split');
    expect(methods).not.toContain('units.split');
    expect(methods).not.toContain('units.merge');

    view.unmount();
    resetDesktopSessions();
    const reopened = openDesktopSession(folder, [folder]);
    rememberOpenProjectSession(reopened.sessionId);
    render(page());
    fireEvent.click(await screen.findByRole('button', { name: '0.0–1.0 ka' }));
    expect(await screen.findByText('Current analysis: past')).toBeTruthy();
    expect(readState(reopened.sessionId, unitId).graph?.nodes.map((node) => node.label)).toEqual([
      'past',
    ]);
    expect(callDesktopSession(reopened.sessionId, 'analysis.listWords', { unitId })).toMatchObject([
      { form: 'ka' },
    ]);
    expect(callDesktopSession(reopened.sessionId, 'analysis.listCandidates', { unitId })).toEqual([
      expect.objectContaining({ id: suggestionRow.id, kind: 'suggestion', status: 'accepted' }),
    ]);
  });

  it('keeps an analysis-node note after the project is reopened', async () => {
    const { folder, sessionId, unitId } = openFolder();
    submitSuggestion(sessionId, unitId, 'past');
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = hostFor([], []);
    rememberOpenProjectSession(sessionId);
    const view = render(page());
    fireEvent.click(await screen.findByRole('button', { name: '0.0–1.0 ka' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept suggestion: past' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Analysis note: past' }), {
      target: { value: 'node-note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save analysis note: past' }));
    expect(await screen.findByText('node-note')).toBeTruthy();
    view.unmount();
    resetDesktopSessions();
    const reopened = openDesktopSession(folder, [folder]);
    rememberOpenProjectSession(reopened.sessionId);
    render(page());
    fireEvent.click(await screen.findByRole('button', { name: '0.0–1.0 ka' }));
    expect(await screen.findByText('node-note')).toBeTruthy();
  });

  it('rolls back when the suggestion no longer matches the current credentials', async () => {
    const { folder, sessionId, unitId } = openFolder();
    const suggestionRow = submitSuggestion(sessionId, unitId, 'past');
    callDesktopSession(sessionId, 'units.updateText', { unitId, text: 'ta' });
    const current = readState(sessionId, unitId);
    expect(current.manuscriptGeneration).toBe(suggestionRow.manuscriptGeneration + 1);
    const methods: string[] = [];
    const writes: { expected?: Credentials }[] = [];
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = hostFor(methods, writes);
    rememberOpenProjectSession(sessionId);
    render(page());

    fireEvent.click(await screen.findByRole('button', { name: '0.0–1.0 ta' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept suggestion: past' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This analysis was not written');
    expect(screen.getByText('No current analysis')).toBeTruthy();
    expect(writes[0]?.expected).toEqual(credentials(current));
    expect(writes[0]?.expected?.manuscriptGeneration).not.toBe(suggestionRow.manuscriptGeneration);
    expect(methods).not.toContain('analysis.split');
    expect(methods).not.toContain('units.split');

    resetDesktopSessions();
    const reopened = openDesktopSession(folder, [folder]);
    expect(readState(reopened.sessionId, unitId)).toMatchObject({
      text: 'ta',
      graph: null,
      manuscriptGeneration: current.manuscriptGeneration,
      graphFingerprint: current.graphFingerprint,
    });
    expect(callDesktopSession(reopened.sessionId, 'analysis.listCandidates', { unitId })).toEqual([
      expect.objectContaining({ id: suggestionRow.id, status: 'pending', kind: 'suggestion' }),
    ]);
    expect(callDesktopSession(reopened.sessionId, 'analysis.listWords', { unitId })).toEqual([]);
  });

  it('restores a review snapshot with the current credentials and reads the earlier node back', async () => {
    const { folder, sessionId, unitId } = openFolder();
    submitSuggestion(sessionId, unitId, 'past');
    const submitted = readState(sessionId, unitId);
    callDesktopSession(sessionId, 'analysis.accept', {
      candidateId: (
        callDesktopSession(sessionId, 'analysis.listCandidates', { unitId }) as ListedCandidate[]
      )[0]?.id,
      expected: credentials(submitted),
    });
    const accepted = readState(sessionId, unitId);
    const nodeId = accepted.graph?.nodes[0]?.id ?? '';
    callDesktopSession(sessionId, 'analysis.split', {
      unitId,
      nodeId,
      into: [token('left', 'left', 0), token('right', 'right', 1)],
      expected: credentials(accepted),
    });
    const split = readState(sessionId, unitId);
    const snapshot = (
      callDesktopSession(sessionId, 'analysis.listCandidates', { unitId }) as ListedCandidate[]
    ).find((item) => item.kind === 'review-snapshot');
    expect(snapshot?.status).toBe('stored');
    const methods: string[] = [];
    const writes: { candidateId?: string; expected?: Credentials }[] = [];
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = hostFor(methods, writes);
    rememberOpenProjectSession(sessionId);
    const view = render(page());

    fireEvent.click(await screen.findByRole('button', { name: '0.0–1.0 ka' }));
    expect(await screen.findByText('Current analysis: left right')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore snapshot: past' }));
    expect(await screen.findByText('Current analysis: past')).toBeTruthy();
    expect(writes).toEqual([{ candidateId: snapshot?.id, expected: credentials(split) }]);
    expect(methods).toContain('analysis.restore');
    expect(methods).not.toContain('analysis.split');
    expect(methods).not.toContain('units.split');
    expect(methods).not.toContain('units.merge');

    view.unmount();
    resetDesktopSessions();
    const reopened = openDesktopSession(folder, [folder]);
    rememberOpenProjectSession(reopened.sessionId);
    render(page());
    fireEvent.click(await screen.findByRole('button', { name: '0.0–1.0 ka' }));
    expect(await screen.findByText('Current analysis: past')).toBeTruthy();
    const restored = readState(reopened.sessionId, unitId);
    expect(restored.graph?.nodes.map((node) => node.label)).toEqual(['past']);
    expect(restored.text).toBe('ka');
    expect(callDesktopSession(reopened.sessionId, 'analysis.listWords', { unitId })).toMatchObject([
      { form: 'ka' },
    ]);
  });
});
