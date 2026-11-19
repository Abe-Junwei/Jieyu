/** @vitest-environment jsdom */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DesktopPageRouter, resetDesktopPageRouters } from '../test/desktopPageRouter';
import { callDesktopSession } from '../db/desktop/desktopCall';
import {
  openDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from '../db/desktop/projectSession';
import { createUnit } from '../db/desktop/units';
import {
  forgetOpenProjectSession,
  rememberOpenProjectSession,
} from '../desktop/openProjectSession';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { releaseAllProjectLocks } from '../desktop/skeleton/projectLock';
import { LocaleProvider } from '../i18n';
import { DesktopAnalysisPage } from './DesktopAnalysisPage';
import { DesktopAnnotationPage } from './DesktopAnnotationPage';
import { DesktopCorpusQueryPanel } from './DesktopCorpusQueryPanel';
import { DesktopProjectReadView } from './DesktopProjectReadView';

const roots: string[] = [];

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

const noop = () => undefined;

function renderReadView() {
  render(
    <DesktopProjectReadView
      manuscripts={[{ id: 'm1', title: { en: 'Manuscript' } }]}
      manuscriptId="m1"
      units={[
        { id: 'short', startMs: 0, endMs: 10, text: 'short' },
        { id: 'edge', startMs: 10, endMs: 11, text: 'edge' },
        { id: 'long', startMs: 7200000, endMs: 7200001, text: 'long' },
        { id: 'bare', startMs: null, endMs: null, text: 'bare' },
      ]}
      notes={[]}
      audioUrl={null}
      emptyLabel="empty"
      audioLabel="audio"
      textLabel="Text"
      saveTextLabel="Save text"
      undoTextLabel="Undo text"
      splitLabel="Split"
      splitTimeLabel="Split time"
      mergeNextLabel="Merge next"
      boundaryLabel="Boundary"
      moveBoundaryLabel="Move boundary"
      noteLabel="Note"
      saveNoteLabel="Save note"
      saveTimelineNoteLabel="Save timeline note"
      saveWaveformNoteLabel="Save waveform note"
      draft={null}
      onEditText={noop}
      onComposeText={noop}
      onLeaveUnit={(go) => go()}
      onSelectManuscript={noop}
      onSaveText={noop}
      onUndoText={noop}
      onSplit={noop}
      onMerge={noop}
      onMoveBoundary={noop}
      onSaveNote={noop}
      onSaveTierNote={noop}
    />,
  );
}

function seedHost(): { host: DesktopReadHost; sessionId: string } {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-ms-label-'));
  roots.push(folder);
  writeFileSync(join(folder, 'a.wav'), '');
  const session = openDesktopSession(folder, [folder]);
  const media = callDesktopSession(session.sessionId, 'media.create', {
    relpath: 'a.wav',
    sha256: 'aa',
    duration: 8000,
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
  for (const [startMs, endMs, text] of [
    [0, 10, 'short'],
    [10, 11, 'edge'],
    [7200000, 7200001, 'long'],
  ] as const) {
    callDesktopSession(session.sessionId, 'units.create', {
      layerId: layer.id,
      startMs,
      endMs,
      text,
    });
  }
  createUnit(requireDesktopSession(session.sessionId).db, {
    layerId: layer.id,
    startMs: null,
    endMs: null,
    text: 'bare',
  });
  rememberOpenProjectSession(session.sessionId);
  const host: DesktopReadHost = {
    projectReadEnabled: true,
    chooseDesktopFolder: () => Promise.reject(new Error('must not choose a folder')),
    desktopCall: (id, method, args) => Promise.resolve(callDesktopSession(id, method, args)),
    desktopMediaUrl: () => Promise.reject(new Error('must not request media')),
  };
  (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
  return { host, sessionId: session.sessionId };
}

function page(node: ReactNode) {
  return render(
    <LocaleProvider locale="en-US">
      <DesktopPageRouter>{node}</DesktopPageRouter>
    </LocaleProvider>,
  );
}

async function expectDistinctSpans() {
  expect(await screen.findByRole('button', { name: '0.000–0.010 short' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '0.010–0.011 edge' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '7200.000–7200.001 long' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'bare' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /0\.0–0\.0/ })).toBeNull();
}

describe('millisecond span labels', () => {
  it('keeps a 10ms read-view span distinct from its 1ms neighbor and a long instant', async () => {
    renderReadView();
    await expectDistinctSpans();
    expect(screen.getByText('0.000–0.010')).toBeTruthy();
    expect(screen.getByText('0.010–0.011')).toBeTruthy();
  });

  it('shows the same precision on the annotation list', async () => {
    page(<DesktopAnnotationPage host={seedHost().host} />);
    await expectDistinctSpans();
  });

  it('shows the same precision on the analysis list', async () => {
    page(<DesktopAnalysisPage host={seedHost().host} />);
    await expectDistinctSpans();
  });

  it('shows the same precision on a corpus hit, including a unit with no time', async () => {
    const seeded = seedHost();
    page(
      <DesktopCorpusQueryPanel host={seeded.host} sessionId={seeded.sessionId} onLocate={noop} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search corpus' }));
    expect(await screen.findByRole('button', { name: 'Result 0.000–0.010 short' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Result 0.010–0.011 edge' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Result 7200.000–7200.001 long' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Result bare' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /0\.0–0\.0/ })).toBeNull();
  });
});
