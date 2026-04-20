// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { TranscriptionTimelineTextTranslationItem } from './TranscriptionTimelineTextTranslationItem';

vi.mock('./transcription/TimelineDraftEditorSurface', () => ({
  TimelineDraftEditorSurface: (props: { onRetry?: () => void }) => (
    <button type="button" onClick={props.onRetry}>
      retry-save
    </button>
  ),
}));

function makeLayer(): LayerDocType {
  const now = new Date().toISOString();
  return {
    id: 'trl-seg',
    textId: 't1',
    key: 'trl_seg',
    name: { zho: '译文层' },
    layerType: 'translation',
    languageId: 'eng',
    modality: 'mixed',
    acceptsAudio: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  } as LayerDocType;
}

function makeUnitView(): TimelineUnitView {
  return {
    id: 'seg-1',
    startTime: 0,
    endTime: 1,
    text: '原文',
    kind: 'segment',
  } as TimelineUnitView;
}

describe('TranscriptionTimelineTextTranslationItem', () => {
  it('retrySave writes segment content when usesOwnSegments is true', async () => {
    const layer = makeLayer();
    const unit = makeUnitView();
    const saveSegmentContentForLayer = vi.fn(async () => undefined);
    const saveUnitLayerText = vi.fn(async () => undefined);

    const runSaveWithStatus = vi.fn(async (_cellKey: string, task: () => Promise<void>) => {
      await task();
    });

    render(
      <TranscriptionTimelineTextTranslationItem
        utt={unit}
        layer={layer}
        text="旧译文"
        draft="新译文"
        draftKey="draft-key"
        cellKey="cell-key"
        isActive={false}
        isEditing={false}
        isDimmed={false}
        saveStatus="error"
        usesOwnSegments
        unitById={new Map()}
        segmentById={new Map()}
        layoutStyle={{}}
        dir={undefined}
        audioMedia={undefined}
        recording={false}
        recordingUnitId={null}
        recordingLayerId={null}
        startRecordingForUnit={undefined}
        stopRecording={undefined}
        deleteVoiceTranslation={undefined}
        transcribeVoiceTranslation={vi.fn()}
        saveSegmentContentForLayer={saveSegmentContentForLayer}
        saveUnitLayerText={saveUnitLayerText}
        scheduleAutoSave={vi.fn()}
        clearAutoSaveTimer={vi.fn()}
        setTranslationDrafts={vi.fn()}
        setEditingCellKey={vi.fn()}
        setCellSaveStatus={vi.fn()}
        runSaveWithStatus={runSaveWithStatus}
        focusedTranslationDraftKeyRef={{ current: null }}
        onFocusLayer={vi.fn()}
        navigateUnitFromInput={vi.fn()}
        handleAnnotationClick={vi.fn()}
        handleAnnotationContextMenu={undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'retry-save' }));

    expect(runSaveWithStatus).toHaveBeenCalledTimes(1);
    expect(saveSegmentContentForLayer).toHaveBeenCalledWith('seg-1', 'trl-seg', '新译文');
    expect(saveUnitLayerText).not.toHaveBeenCalled();
  });
});
