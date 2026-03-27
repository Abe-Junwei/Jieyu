// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { LayerDocType, UtteranceDocType } from '../db';
import { TranscriptionOverlays } from './TranscriptionOverlays';

const NOW = new Date().toISOString();

function makeLayer(id: string, constraint?: LayerDocType['constraint']): LayerDocType {
  return {
    id,
    textId: 't1',
    key: `trc_${id}`,
    name: { zho: id },
    layerType: 'transcription',
    languageId: 'cmn',
    modality: 'text',
    acceptsAudio: false,
    ...(constraint ? { constraint } : {}),
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerDocType;
}

function makeUtterance(id: string): UtteranceDocType {
  return {
    id,
    textId: 't1',
    mediaId: 'm1',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as UtteranceDocType;
}

function makeBaseProps(): ComponentProps<typeof TranscriptionOverlays> {
  return {
    ctxMenu: null,
    onCloseCtxMenu: vi.fn(),
    uttOpsMenu: null,
    onCloseUttOpsMenu: vi.fn(),
    selectedUtteranceIds: new Set<string>(),
    runDeleteSelection: vi.fn(),
    runMergeSelection: vi.fn(),
    runSelectBefore: vi.fn(),
    runSelectAfter: vi.fn(),
    runDeleteOne: vi.fn(),
    runMergePrev: vi.fn(),
    runMergeNext: vi.fn(),
    runSplitAtTime: vi.fn(),
    getCurrentTime: vi.fn(() => 0.5),
    onOpenNoteFromMenu: vi.fn(),
    deleteConfirmState: null,
    muteDeleteConfirmInSession: false,
    setMuteDeleteConfirmInSession: vi.fn(),
    closeDeleteConfirmDialog: vi.fn(),
    confirmDeleteFromDialog: vi.fn(),
    notePopover: null,
    currentNotes: [],
    onCloseNotePopover: vi.fn(),
    addNote: vi.fn(async () => undefined),
    updateNote: vi.fn(async () => undefined),
    deleteNote: vi.fn(async () => undefined),
    utterances: [makeUtterance('utt_1')],
    getUtteranceTextForLayer: vi.fn(() => 'u1'),
    transcriptionLayers: [makeLayer('layer_default')],
    translationLayers: [] as LayerDocType[],
    speakerOptions: [],
    speakerFilterOptions: [],
    onAssignSpeakerFromMenu: vi.fn(),
    onCreateSpeakerAndAssignFromMenu: vi.fn(),
  };
}

describe('TranscriptionOverlays independent selection routing', () => {
  it('opens utt ops menu with selectedTimelineUnit and deletes the segment target', async () => {
    const props = makeBaseProps();
    props.uttOpsMenu = { x: 100, y: 100 };
    props.selectedTimelineUnit = { layerId: 'layer_default', unitId: 'seg_1', kind: 'segment' };

    render(<TranscriptionOverlays {...props} />);

    const deleteItem = await screen.findByRole('menuitem', { name: /删除句段/ });
    fireEvent.click(deleteItem);

    expect(props.runDeleteOne).toHaveBeenCalledWith('seg_1');
  });

  it('keeps select-before/after actions visible when layer is the default transcription layer', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      utteranceId: 'seg_1',
      layerId: 'layer_independent',
      splitTime: 0.5,
    };
    props.transcriptionLayers = [makeLayer('layer_independent', 'independent_boundary')];
    // 默认转写层不视为独立边界层 | Default transcription layer is not treated as independent
    (props as unknown as Record<string, unknown>).defaultTranscriptionLayerId = 'layer_independent';

    render(<TranscriptionOverlays {...props} />);

    expect(screen.queryByText('选中此句段及之前所有')).not.toBeNull();
    expect(screen.queryByText('选中此句段及之后所有')).not.toBeNull();
  });
});
