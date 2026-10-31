// @vitest-environment jsdom
import { afterEach, it, expect } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { seed, disposeModelFixtures } from '../test/desktopModelFixture';
import { callDesktopSession } from '../db/desktop/desktopCall';
import { cancelProjectTranscription } from '../desktop/projectTranscription';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { LocaleProvider } from '../i18n';
import { DesktopModelCandidates } from './DesktopModelCandidates';
afterEach(async () => {
  cleanup();
  await disposeModelFixtures();
});
it('uses host results as editable candidates and accepts one without saving the others', async () => {
  const s = await seed();
  let loseAcceptanceReply = true;
  const host: DesktopReadHost = {
    projectReadEnabled: true,
    chooseDesktopFolder: async () => ({ cancelled: true }),
    desktopMediaUrl: async () => ({ url: '' }),
    desktopCall: async (id, method, args) => {
      const result = callDesktopSession(id, method, args);
      if (method === 'modelRuns.accept' && loseAcceptanceReply) {
        loseAcceptanceReply = false;
        throw new Error('reply lost after commit');
      }
      return result;
    },
    chooseTranscriptionModel: async () => s.model,
    transcribeProject: async () => {
      const run = callDesktopSession(s.sessionId, 'modelRuns.start', {
        manuscriptId: s.manuscriptId,
        layerId: s.layerId,
        modelId: 'org.example.mock',
        modelVersion: '1',
        manifestSha256: 'fixture',
        params: {},
        rangeStart: 0,
        rangeEnd: 2,
      }) as { id: string };
      callDesktopSession(s.sessionId, 'modelRuns.finish', {
        runId: run.id,
        status: 'ok',
        chunkCount: 2,
      });
      const preview = callDesktopSession(s.sessionId, 'modelRuns.preview', {
        runId: run.id,
        candidates: [
          { chunkIndex: 0, segmentIndex: 0, mediaStart: 0, mediaEnd: 1 },
          { chunkIndex: 1, segmentIndex: 0, mediaStart: 1, mediaEnd: 2 },
        ],
      }) as {
        timeMappingRevision: number;
        candidates: import('../desktop/transcriptionTypes').ModelCandidate[];
      };
      return {
        runId: run.id,
        status: 'ok' as const,
        warnings: [],
        timeMappingRevision: preview.timeMappingRevision,
        candidates: preview.candidates.map((row) => ({ ...row, text: 'mock candidate' })),
      };
    },
    cancelProjectTranscription: async (id, request) => cancelProjectTranscription(id, request),
  };
  const view = render(
    <LocaleProvider locale="en-US">
      <DesktopModelCandidates
        host={host}
        sessionId={s.sessionId}
        manuscriptId={s.manuscriptId}
        layerId={s.layerId}
        onAccepted={() => {}}
      />
    </LocaleProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose model declaration' }));
  await screen.findByText('org.example.mock 1');
  await waitFor(() =>
    expect((screen.getByLabelText('Recording end (seconds)') as HTMLInputElement).value).toBe('2'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Generate transcript candidates' }));
  const first = await screen.findByRole('textbox', { name: 'Candidate transcript 0:0' });
  expect((first as HTMLInputElement).value).toBe('mock candidate');
  expect(callDesktopSession(s.sessionId, 'units.list', { layerId: s.layerId })).toEqual([]);
  fireEvent.change(first, { target: { value: 'reviewed candidate' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Accept transcript' })[0]!);
  await screen.findByText(
    'This operation did not finish. Check the model, audio format and target; rerun if the target changed.',
  );
  fireEvent.click(screen.getAllByRole('button', { name: 'Accept transcript' })[0]!);
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Candidate transcript 0:0' })).toBeNull(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Abandon remaining candidates' }));
  await screen.findByText('Candidates abandoned; existing text was kept');
  view.unmount();
  callDesktopSession(s.sessionId, 'reopen', {});
  expect(callDesktopSession(s.sessionId, 'units.list', { layerId: s.layerId })).toMatchObject([
    { text: 'reviewed candidate' },
  ]);
});
