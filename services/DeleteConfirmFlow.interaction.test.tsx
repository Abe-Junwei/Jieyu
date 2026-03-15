// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDeleteDialog } from '../src/components/ConfirmDeleteDialog';
import { useDeleteConfirmFlow } from '../src/hooks/useDeleteConfirmFlow';

function DeleteFlowHarness({ onConfirmed }: { onConfirmed: () => void }) {
  const {
    requestDeleteUtterances,
    deleteConfirmState,
    muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog,
    confirmDeleteFromDialog,
  } = useDeleteConfirmFlow(() => true);

  return (
    <div>
      <button onClick={() => requestDeleteUtterances('u1', onConfirmed)}>delete</button>
      <ConfirmDeleteDialog
        open={Boolean(deleteConfirmState)}
        totalCount={deleteConfirmState?.totalCount ?? 0}
        textCount={deleteConfirmState?.textCount ?? 0}
        emptyCount={deleteConfirmState?.emptyCount ?? 0}
        muteInSession={muteDeleteConfirmInSession}
        onMuteChange={setMuteDeleteConfirmInSession}
        onCancel={closeDeleteConfirmDialog}
        onConfirm={confirmDeleteFromDialog}
      />
    </div>
  );
}

describe('delete confirm flow interaction', () => {
  it('suppresses subsequent prompts after confirm + mute in same session', () => {
    const onConfirmed = vi.fn();
    render(<DeleteFlowHarness onConfirmed={onConfirmed} />);

    fireEvent.click(screen.getByText('delete'));
    expect(screen.getByRole('heading', { name: '确认删除' })).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(onConfirmed).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('delete'));
    expect(onConfirmed).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('确认删除')).toBeNull();
  });
});
