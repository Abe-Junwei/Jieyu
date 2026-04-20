// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { LayerDocType, LayerUnitDocType } from '../db';
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

function makeUnit(id: string): LayerUnitDocType {
  return {
    id,
    textId: 't1',
    mediaId: 'm1',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitDocType;
}

function makeBaseProps(): ComponentProps<typeof TranscriptionOverlays> {
  return {
    ctxMenu: null,
    onCloseCtxMenu: vi.fn(),
    uttOpsMenu: null,
    onCloseUttOpsMenu: vi.fn(),
    selectedUnitIds: new Set<string>(),
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
    units: [makeUnit('utt_1')],
    getUnitTextForLayer: vi.fn(() => 'u1'),
    transcriptionLayers: [makeLayer('layer_default')],
    translationLayers: [] as LayerDocType[],
    speakerOptions: [],
    speakerFilterOptions: [],
    onAssignSpeakerFromMenu: vi.fn(),
    onSetUnitSelfCertaintyFromMenu: vi.fn(),
    onOpenSpeakerManagementPanelFromMenu: vi.fn(),
    onToggleSkipProcessingFromMenu: vi.fn(),
    resolveSkipProcessingState: vi.fn(() => false),
  };
}

afterEach(() => {
  cleanup();
});

describe('TranscriptionOverlays independent selection routing', () => {
  it('shows self-certainty submenu when ctx unitKind is segment but unitId is an unit host', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'utt_1',
      layerId: 'layer_default',
      unitKind: 'segment',
      splitTime: 0.5,
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
    };

    render(<TranscriptionOverlays {...props} />);

    expect(await screen.findByRole('menuitem', { name: /确信程度/ })).toBeTruthy();
  });

  it('shows self-certainty when unitId is segment id if resolver maps to an unit id', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_ref_1',
      layerId: 'layer_default',
      unitKind: 'segment',
      splitTime: 0.5,
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
    };
    props.resolveSelfCertaintyUnitIds = (ids) => ids
      .map((raw) => (raw === 'seg_ref_1' ? 'utt_1' : raw))
      .filter((uid) => props.units.some((u) => u.id === uid));

    render(<TranscriptionOverlays {...props} />);

    expect(await screen.findByRole('menuitem', { name: /确信程度/ })).toBeTruthy();
  });

  it('keeps segment target ids for self-certainty even when resolver maps to host units', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_ref_1',
      layerId: 'layer_default',
      unitKind: 'segment',
      splitTime: 0.5,
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
    };
    props.resolveSelfCertaintyUnitIds = (ids) => ids
      .map((raw) => (raw === 'seg_ref_1' ? 'utt_1' : raw))
      .filter((uid) => props.units.some((u) => u.id === uid));

    render(<TranscriptionOverlays {...props} />);

    const certaintyItem = await screen.findByRole('menuitem', { name: /确信程度/ });
    fireEvent.mouseEnter(certaintyItem);

    const certainOptions = await screen.findAllByRole('menuitem', { name: /^确定$/ });
    fireEvent.click(certainOptions[certainOptions.length - 1]!);

    expect(props.onSetUnitSelfCertaintyFromMenu).toHaveBeenCalledWith(['seg_ref_1'], 'segment', 'certain', 'layer_default');
  });

  it('shows self-certainty when handler is set even if unitId is not an unit id, and falls back to raw target ids', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_shadow_only',
      layerId: 'layer_default',
      unitKind: 'unit',
      splitTime: 0.5,
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
    };
    delete props.resolveSelfCertaintyUnitIds;

    render(<TranscriptionOverlays {...props} />);

    const certaintyItem = await screen.findByRole('menuitem', { name: /确信程度/ });
    fireEvent.mouseEnter(certaintyItem);

    const certainOptions = await screen.findAllByRole('menuitem', { name: /^确定$/ });
    fireEvent.click(certainOptions[certainOptions.length - 1]!);

    expect(props.onSetUnitSelfCertaintyFromMenu).toHaveBeenCalledWith(['seg_shadow_only'], 'unit', 'certain', 'layer_default');
  });

  it('opens utt ops menu with selectedTimelineUnit and deletes the segment target', async () => {
    const props = makeBaseProps();
    props.uttOpsMenu = { x: 100, y: 100 };
    props.selectedTimelineUnit = { layerId: 'layer_default', unitId: 'seg_1', kind: 'segment' };

    render(<TranscriptionOverlays {...props} />);

    const deleteItem = await screen.findByRole('menuitem', { name: /删除句段/ });
    fireEvent.click(deleteItem);

    expect(props.runDeleteOne).toHaveBeenCalledWith('seg_1', 'segment', 'layer_default');
  });

  it('toolbar utt ops menu omits merge actions on translation layer', async () => {
    const props = makeBaseProps();
    props.uttOpsMenu = { x: 100, y: 100 };
    props.selectedTimelineUnit = { layerId: 'tr_layer', unitId: 'utt_1', kind: 'unit' };
    props.translationLayers = [{ ...makeLayer('tr_layer'), layerType: 'translation' } as LayerDocType];

    render(<TranscriptionOverlays {...props} />);

    expect(screen.queryAllByRole('menuitem', { name: /向前合并|向后合并/ })).toHaveLength(0);
    expect((await screen.findAllByRole('menuitem', { name: /删除句段/ })).length).toBeGreaterThan(0);
    expect((await screen.findAllByRole('menuitem', { name: /拆分句段/ })).length).toBeGreaterThan(0);
  });

  it('toolbar utt ops menu keeps merge actions on transcription layer', async () => {
    const props = makeBaseProps();
    props.uttOpsMenu = { x: 100, y: 100 };
    props.selectedTimelineUnit = { layerId: 'layer_default', unitId: 'utt_1', kind: 'unit' };

    render(<TranscriptionOverlays {...props} />);

    expect((await screen.findAllByRole('menuitem', { name: /向前合并/ })).length).toBeGreaterThan(0);
  });

  it('toolbar utt ops menu omits batch merge for translation multi-select', async () => {
    const props = makeBaseProps();
    props.uttOpsMenu = { x: 100, y: 100 };
    props.selectedTimelineUnit = { layerId: 'tr_layer', unitId: 'seg_2', kind: 'segment' };
    props.selectedUnitIds = new Set(['seg_1', 'seg_2']);
    props.translationLayers = [{ ...makeLayer('tr_layer'), layerType: 'translation' } as LayerDocType];

    render(<TranscriptionOverlays {...props} />);

    expect(screen.queryAllByRole('menuitem', { name: /合并 2 个句段/ })).toHaveLength(0);
    expect((await screen.findAllByRole('menuitem', { name: /删除 2 个句段/ })).length).toBeGreaterThan(0);
  });

  it('toolbar utt ops menu omits merge and split for skip-processing transcription segment', async () => {
    const props = makeBaseProps();
    props.uttOpsMenu = { x: 100, y: 100 };
    props.selectedTimelineUnit = { layerId: 'layer_default', unitId: 'seg_1', kind: 'segment' };
    props.resolveSkipProcessingState = vi.fn((uid) => uid === 'seg_1');

    render(<TranscriptionOverlays {...props} />);

    expect(screen.queryAllByRole('menuitem', { name: /向前合并|向后合并/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /拆分句段/ })).toHaveLength(0);
    expect((await screen.findAllByRole('menuitem', { name: /删除句段/ })).length).toBeGreaterThan(0);
  });

  it('toolbar utt ops menu omits batch merge when selection includes skip-processing', async () => {
    const props = makeBaseProps();
    props.uttOpsMenu = { x: 100, y: 100 };
    props.selectedTimelineUnit = { layerId: 'layer_default', unitId: 'seg_2', kind: 'segment' };
    props.selectedUnitIds = new Set(['seg_1', 'seg_2']);
    props.resolveSkipProcessingState = vi.fn((uid) => uid === 'seg_1');

    render(<TranscriptionOverlays {...props} />);

    expect(screen.queryAllByRole('menuitem', { name: /合并 2 个句段/ })).toHaveLength(0);
    expect((await screen.findAllByRole('menuitem', { name: /删除 2 个句段/ })).length).toBeGreaterThan(0);
  });

  it('shows skip-processing action in the right-click menu for a segment and routes the toggle', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_1',
      layerId: 'layer_default',
      unitKind: 'segment',
      splitTime: 0.5,
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
    };

    render(<TranscriptionOverlays {...props} />);

    const skipItem = await screen.findByRole('menuitem', { name: /标记为跳过处理/ });
    fireEvent.click(skipItem);

    expect(props.onToggleSkipProcessingFromMenu).toHaveBeenCalledWith('seg_1', 'segment', 'layer_default');
  });

  it('restricts skipped segments to unskip, delete, and notes while hiding merge, split, and speaker actions', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_1',
      layerId: 'layer_default',
      unitKind: 'segment',
      splitTime: 0.5,
      source: 'waveform',
      menuSurface: 'waveform-region',
      layerType: 'transcription',
    };
    props.resolveSkipProcessingState = vi.fn(() => true);

    render(<TranscriptionOverlays {...props} />);

    expect(await screen.findByRole('menuitem', { name: /取消跳过处理/ })).toBeTruthy();
    expect((await screen.findAllByRole('menuitem', { name: /添加备注/ })).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('menuitem', { name: /向前合并|向后合并/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /从当前位置拆分/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /说话人管理/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /确信程度/ })).toHaveLength(0);
  });

  it('hides batch merge when multi-select includes a skip-processing segment', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_2',
      layerId: 'layer_default',
      unitKind: 'segment',
      splitTime: 0.5,
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
    };
    props.selectedUnitIds = new Set(['seg_1', 'seg_2']);
    props.resolveSkipProcessingState = vi.fn((uid) => uid === 'seg_1');

    render(<TranscriptionOverlays {...props} />);

    expect(screen.queryAllByRole('menuitem', { name: /合并 2 个句段/ })).toHaveLength(0);
    expect((await screen.findAllByRole('menuitem', { name: /删除 2 个句段/ })).length).toBeGreaterThan(0);
  });

  it('shows batch merge action for multi-selected segment context and routes the selected ids', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_2',
      layerId: 'layer_independent',
      unitKind: 'segment',
      splitTime: 0.5,
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
    };
    props.selectedUnitIds = new Set(['seg_1', 'seg_2']);
    props.transcriptionLayers = [makeLayer('layer_independent', 'independent_boundary')];

    render(<TranscriptionOverlays {...props} />);

    const mergeItem = await screen.findByRole('menuitem', { name: '合并 2 个句段' });
    fireEvent.click(mergeItem);

    expect(props.runMergeSelection).toHaveBeenCalledWith(
      new Set(['seg_1', 'seg_2']),
      'segment',
      'layer_independent',
    );
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
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
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
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
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
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
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
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
    };
    props.selectedTimelineUnit = { layerId: 'layer_independent', unitId: 'seg_1', kind: 'segment' };
    props.selectedUnitIds = new Set(['seg_1', 'seg_2']);
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
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
    };
    props.selectedTimelineUnit = { layerId: 'layer_independent', unitId: 'seg_1', kind: 'segment' };
    props.selectedUnitIds = new Set(['seg_1', 'seg_2']);
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
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
    };
    props.selectedTimelineUnit = { layerId: 'layer_default', unitId: 'utt_1', kind: 'unit' };
    props.selectedUnitIds = new Set(['seg_1', 'seg_2']);
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
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
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

  it('renders note popover unit preview with orthography-aware direction and style', () => {
    const props = makeBaseProps();
    props.notePopover = { x: 120, y: 80, uttId: 'utt_1', layerId: 'layer_ar' };
    props.getUnitTextForLayer = vi.fn(() => 'مرحبا (123)');
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

describe('TranscriptionOverlays unit context menu surface policy', () => {
  it('hides structural merge, speaker, self-certainty, range-select, and skip for translation layer', async () => {
    const props = makeBaseProps();
    const trLayer = { ...makeLayer('tr_layer'), layerType: 'translation' } as LayerDocType;
    props.translationLayers = [trLayer];
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_1',
      layerId: 'tr_layer',
      unitKind: 'segment',
      splitTime: 0.5,
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'translation',
    };
    props.onSetUnitSelfCertaintyFromMenu = vi.fn();

    render(<TranscriptionOverlays {...props} />);

    expect(screen.queryAllByRole('menuitem', { name: /向前合并/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /向后合并/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /说话人管理/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /确信程度/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /选中此句段及之前所有/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /选中此句段及之后所有/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /标记为跳过处理/ })).toHaveLength(0);

    expect((await screen.findAllByRole('menuitem', { name: /删除句段/ })).length).toBeGreaterThan(0);
    expect((await screen.findAllByRole('menuitem', { name: /添加备注/ })).length).toBeGreaterThan(0);
  });

  it('hides batch merge for multi-select on translation layer', async () => {
    const props = makeBaseProps();
    const trLayer = { ...makeLayer('tr_layer'), layerType: 'translation' } as LayerDocType;
    props.translationLayers = [trLayer];
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_2',
      layerId: 'tr_layer',
      unitKind: 'segment',
      splitTime: 0.5,
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'translation',
    };
    props.selectedUnitIds = new Set(['seg_1', 'seg_2']);

    render(<TranscriptionOverlays {...props} />);

    expect(screen.queryAllByRole('menuitem', { name: /合并 2 个句段/ })).toHaveLength(0);
    expect((await screen.findAllByRole('menuitem', { name: /删除 2 个句段/ })).length).toBeGreaterThan(0);
  });

  it('does not show split-at-current from timeline segment context', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_1',
      layerId: 'layer_default',
      unitKind: 'segment',
      splitTime: 0.5,
      source: 'timeline',
      menuSurface: 'timeline-annotation',
      layerType: 'transcription',
    };

    render(<TranscriptionOverlays {...props} />);

    expect(screen.queryAllByRole('menuitem', { name: /从当前位置拆分/ })).toHaveLength(0);
  });

  it('shows split-at-current on waveform segment surface and omits certainty and speaker', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'seg_1',
      layerId: 'layer_default',
      unitKind: 'segment',
      splitTime: 0.5,
      source: 'waveform',
      menuSurface: 'waveform-region',
      layerType: 'transcription',
    };
    props.onSetUnitSelfCertaintyFromMenu = vi.fn();
    props.speakerOptions = [{ id: 's1', name: 'Alice' }];

    render(<TranscriptionOverlays {...props} />);

    expect((await screen.findAllByRole('menuitem', { name: /从当前位置拆分/ })).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('menuitem', { name: /确信程度/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /说话人管理/ })).toHaveLength(0);
  });

  it('hides range-select and layer display style on waveform region surface', async () => {
    const props = makeBaseProps();
    props.ctxMenu = {
      x: 120,
      y: 120,
      unitId: 'utt_1',
      layerId: 'layer_default',
      unitKind: 'unit',
      splitTime: 0.5,
      source: 'waveform',
      menuSurface: 'waveform-region',
      layerType: 'transcription',
    };
    props.displayStyleControl = {
      orthographies: [],
      onUpdate: vi.fn(),
      onReset: vi.fn(),
    };

    render(<TranscriptionOverlays {...props} />);

    expect(screen.queryAllByRole('menuitem', { name: /选中此句段及之前所有/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /选中此句段及之后所有/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /本层显示样式/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /确信程度/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /说话人管理/ })).toHaveLength(0);
    expect((await screen.findAllByRole('menuitem', { name: /向前合并/ })).length).toBeGreaterThan(0);
  });
});
