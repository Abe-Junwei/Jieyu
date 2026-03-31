// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    onOpenSpeakerManagementPanelFromMenu: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
});

describe('TranscriptionOverlays independent selection routing', () => {
  it('opens utt ops menu with selectedTimelineUnit and deletes the segment target', async () => {
    const props = makeBaseProps();
    props.uttOpsMenu = { x: 100, y: 100 };
    props.selectedTimelineUnit = { layerId: 'layer_default', unitId: 'seg_1', kind: 'segment' };

    render(<TranscriptionOverlays {...props} />);

    const deleteItem = await screen.findByRole('menuitem', { name: /删除句段/ });
    fireEvent.click(deleteItem);

    expect(props.runDeleteOne).toHaveBeenCalledWith('seg_1', 'segment', 'layer_default');
  });

  it('hides batch merge action for multi-selected segment context', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_2',
      layerId: 'layer_independent',
      unitKind: 'segment',
      splitTime: 0.5,
    };
    props.selectedUtteranceIds = new Set(['seg_1', 'seg_2']);
    props.transcriptionLayers = [makeLayer('layer_independent', 'independent_boundary')];

    render(<TranscriptionOverlays {...props} />);

    expect(screen.queryByText('合并 2 个句段')).toBeNull();
  });

  it('hides select-before/after actions for independent-boundary layer context', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_1',
      layerId: 'layer_independent',
      unitKind: 'segment',
      splitTime: 0.5,
    };
    props.transcriptionLayers = [makeLayer('layer_independent', 'independent_boundary')];

    render(<TranscriptionOverlays {...props} />);

    expect(screen.queryByText('选中此句段及之前所有')).toBeNull();
    expect(screen.queryByText('选中此句段及之后所有')).toBeNull();
  });

  it('hides select-before/after actions for dependent segment-backed context', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_dep_1',
      layerId: 'layer_dependent',
      unitKind: 'segment',
      splitTime: 0.5,
    };
    props.transcriptionLayers = [makeLayer('layer_dependent', 'symbolic_association')];

    render(<TranscriptionOverlays {...props} />);

    expect(screen.queryByText('选中此句段及之前所有')).toBeNull();
    expect(screen.queryByText('选中此句段及之后所有')).toBeNull();
  });

  it('routes speaker assignment menu actions with segment kind for independent layer context', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_1',
      layerId: 'layer_independent',
      unitKind: 'segment',
      splitTime: 0.5,
    };
    props.transcriptionLayers = [makeLayer('layer_independent', 'independent_boundary')];
    props.speakerOptions = [{ id: 'spk_1', name: 'Alice' }];

    render(<TranscriptionOverlays {...props} />);

    const speakerManageItems = await screen.findAllByRole('menuitem', { name: /说话人管理/ });
    fireEvent.mouseEnter(speakerManageItems[speakerManageItems.length - 1]!);

    const assignSpeakerItems = await screen.findAllByRole('menuitem', { name: /指派说话人 → Alice/ });
    fireEvent.click(assignSpeakerItems[assignSpeakerItems.length - 1]!);

    expect(props.onAssignSpeakerFromMenu).toHaveBeenCalledWith(['seg_1'], 'segment', 'spk_1');
  });

  it('keeps batch speaker assignment targets when context menu opens on a selected item', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_2',
      layerId: 'layer_independent',
      unitKind: 'segment',
      splitTime: 0.5,
    };
    props.selectedTimelineUnit = { layerId: 'layer_independent', unitId: 'seg_1', kind: 'segment' };
    props.selectedUtteranceIds = new Set(['seg_1', 'seg_2']);
    props.transcriptionLayers = [makeLayer('layer_independent', 'independent_boundary')];
    props.speakerOptions = [{ id: 'spk_1', name: 'Alice' }];

    render(<TranscriptionOverlays {...props} />);

    const speakerManageItems = await screen.findAllByRole('menuitem', { name: /说话人管理/ });
    fireEvent.mouseEnter(speakerManageItems[speakerManageItems.length - 1]!);

    const assignSpeakerItems = await screen.findAllByRole('menuitem', { name: /指派说话人 → Alice/ });
    fireEvent.click(assignSpeakerItems[assignSpeakerItems.length - 1]!);

    expect(props.onAssignSpeakerFromMenu).toHaveBeenCalledWith(['seg_1', 'seg_2'], 'segment', 'spk_1');
  });

  it('keeps batch clear-speaker targets when context menu opens on a selected item', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_2',
      layerId: 'layer_independent',
      unitKind: 'segment',
      splitTime: 0.5,
    };
    props.selectedTimelineUnit = { layerId: 'layer_independent', unitId: 'seg_1', kind: 'segment' };
    props.selectedUtteranceIds = new Set(['seg_1', 'seg_2']);
    props.transcriptionLayers = [makeLayer('layer_independent', 'independent_boundary')];
    props.speakerOptions = [{ id: 'spk_1', name: 'Alice' }];

    render(<TranscriptionOverlays {...props} />);

    const speakerManageItems = await screen.findAllByRole('menuitem', { name: /说话人管理/ });
    fireEvent.mouseEnter(speakerManageItems[speakerManageItems.length - 1]!);

    const clearItems = await screen.findAllByRole('menuitem', { name: '清空说话人' });
    fireEvent.click(clearItems[clearItems.length - 1]!);

    expect(props.onAssignSpeakerFromMenu).toHaveBeenCalledWith(['seg_1', 'seg_2'], 'segment', undefined);
  });

  it('uses the current context-menu unit kind for batch speaker actions', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_2',
      layerId: 'layer_independent',
      unitKind: 'segment',
      splitTime: 0.5,
    };
    props.selectedTimelineUnit = { layerId: 'layer_default', unitId: 'utt_1', kind: 'utterance' };
    props.selectedUtteranceIds = new Set(['seg_1', 'seg_2']);
    props.transcriptionLayers = [makeLayer('layer_independent', 'independent_boundary')];
    props.speakerOptions = [{ id: 'spk_1', name: 'Alice' }];

    render(<TranscriptionOverlays {...props} />);

    const speakerManageItems = await screen.findAllByRole('menuitem', { name: /说话人管理/ });
    fireEvent.mouseEnter(speakerManageItems[speakerManageItems.length - 1]!);

    const clearItems = await screen.findAllByRole('menuitem', { name: '清空说话人' });
    fireEvent.click(clearItems[clearItems.length - 1]!);

    expect(props.onAssignSpeakerFromMenu).toHaveBeenCalledWith(['seg_1', 'seg_2'], 'segment', undefined);
  });

  it('opens speaker management panel instead of prompting for a speaker name', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_1',
      layerId: 'layer_independent',
      unitKind: 'segment',
      splitTime: 0.5,
    };
    props.transcriptionLayers = [makeLayer('layer_independent', 'independent_boundary')];
    props.speakerOptions = [{ id: 'spk_1', name: 'Alice' }];

    render(<TranscriptionOverlays {...props} />);

    const speakerManageItems = await screen.findAllByRole('menuitem', { name: /说话人管理/ });
    fireEvent.mouseEnter(speakerManageItems[speakerManageItems.length - 1]!);

    const createItems = await screen.findAllByRole('menuitem', { name: '新建说话人并指派…' });
    fireEvent.click(createItems[createItems.length - 1]!);

    expect(props.onOpenSpeakerManagementPanelFromMenu).toHaveBeenCalledTimes(1);
  });

  it('renders note popover utterance preview with orthography-aware direction and style', () => {
    const props = makeBaseProps();
    props.notePopover = { x: 120, y: 80, uttId: 'utt_1', layerId: 'layer_ar' };
    props.getUtteranceTextForLayer = vi.fn(() => 'مرحبا (123)');
    props.transcriptionLayers = [{
      ...makeLayer('layer_ar'),
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      displaySettings: { fontFamily: 'Scheherazade New' },
      isDefault: true,
    } as LayerDocType];
    props.displayStyleControl = {
      orthographies: [{
        id: 'ortho-ar',
        languageId: 'ara',
        name: { zho: '阿拉伯语正字法', eng: 'Arabic Orthography' },
        scriptTag: 'Arab',
        direction: 'rtl',
        bidiPolicy: {
          isolateInlineRuns: true,
          preferDirAttribute: true,
        },
        fontPreferences: {
          primary: ['Scheherazade New'],
        },
        createdAt: NOW,
      }],
      onUpdate: vi.fn(),
      onReset: vi.fn(),
    };

    const { container } = render(<TranscriptionOverlays {...props} />);

    const title = container.querySelector('.note-popover-title');
    const preview = screen.getByText('مرحبا (123)');
    expect(title?.textContent).toContain('转写');
    expect(preview.getAttribute('dir')).toBe('rtl');
    expect((preview as HTMLElement).style.direction).toBe('rtl');
    expect((preview as HTMLElement).style.unicodeBidi).toBe('isolate');
    expect((preview as HTMLElement).style.fontFamily).toContain('Scheherazade New');
  });
});
