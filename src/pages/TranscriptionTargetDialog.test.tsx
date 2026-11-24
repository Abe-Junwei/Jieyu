// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { TranscriptionTargetDialog } from './TranscriptionTargetDialog';

afterEach(cleanup);

it.each(['write', 'create'])('does not transcribe a late %s plan after closing', async (action) => {
  let resolve!: (value: unknown) => void;
  const plan = new Promise((resolvePlan) => {
    resolve = resolvePlan;
  });
  const transcribe = vi.fn(async () => {});
  const view = render(
    <LocaleProvider locale="en-US">
      <TranscriptionTargetDialog
        layerId="audio"
        unitId="unit"
        onClose={() => {}}
        transcribe={transcribe}
        listTargets={async () => ({
          manuscriptId: 'm',
          hostLayerId: 'h',
          contentType: 'transcription',
          targets: [{ id: 'other', name: { en: 'Other' }, tierType: 'time-aligned', host: false }],
        })}
        plan={() => plan}
        createLayer={async () => ({ id: 'new' })}
      />
    </LocaleProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Other' }));
  view.unmount();
  await act(async () =>
    resolve({ action, empty: true, host: false, longer: false, hasBody: false }),
  );
  expect(transcribe).not.toHaveBeenCalled();
});

it('does not transcribe a late translation layer creation after Escape', async () => {
  let resolve!: (value: unknown) => void;
  const created = new Promise((resolveLayer) => {
    resolve = resolveLayer;
  });
  const transcribe = vi.fn(async () => {});
  const onClose = vi.fn();
  render(
    <LocaleProvider locale="en-US">
      <TranscriptionTargetDialog
        layerId="audio"
        unitId="unit"
        onClose={onClose}
        transcribe={transcribe}
        listTargets={async () => ({
          manuscriptId: 'm',
          hostLayerId: 'h',
          contentType: 'translation',
          targets: [],
        })}
        plan={async () => null}
        createLayer={() => created}
      />
    </LocaleProvider>,
  );
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Translation' } });
  fireEvent.click(screen.getByRole('button', { name: 'Write' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
  await act(async () => resolve({ id: 'new' }));
  expect(transcribe).not.toHaveBeenCalled();
});
