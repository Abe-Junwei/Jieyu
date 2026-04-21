// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerLinkDocType } from '../db';
import { LocaleProvider } from '../i18n';
import { TimelineLaneHeader } from './TimelineLaneHeader';

const NOW = new Date().toISOString();

function makeTestHostLink(translationLayerId: string, host: LayerDocType): LayerLinkDocType {
  return {
    id: `link-${translationLayerId}`,
    layerId: translationLayerId,
    transcriptionLayerKey: host.key,
    hostTranscriptionLayerId: host.id,
    linkType: 'free',
    isPreferred: true,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerLinkDocType;
}

function makeLayer(id: string): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: `layer_${id}`,
    name: { zho: id },
    layerType: 'transcription',
    languageId: 'cmn',
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerDocType;
}

function renderHeader(trackModeControl?: {
  mode: 'single' | 'multi-auto' | 'multi-locked' | 'multi-speaker-fixed';
  onToggle: () => void;
  onSetMode?: (nextMode: 'single' | 'multi-auto' | 'multi-locked' | 'multi-speaker-fixed') => void;
  onLockSelectedToLane?: (laneIndex: number) => void;
  onUnlockSelected?: () => void;
  onResetAuto?: () => void;
  selectedSpeakerNames?: string[];
  lockedSpeakerCount?: number;
  lockConflictCount?: number;
}, options?: {
  layer?: LayerDocType;
  allLayers?: LayerDocType[];
  activeTextTimelineMode?: 'document' | 'media' | null;
  onLayerAction?: (
    action: 'create-transcription' | 'create-translation' | 'edit-transcription-metadata' | 'edit-translation-metadata' | 'delete',
    layerId: string,
  ) => void;
  displayStyleControl?: Parameters<typeof TimelineLaneHeader>[0]['displayStyleControl'];
  speakerQuickActions?: Parameters<typeof TimelineLaneHeader>[0]['speakerQuickActions'];
  headerMenuPreset?: Parameters<typeof TimelineLaneHeader>[0]['headerMenuPreset'];
  layerLinks?: LayerLinkDocType[];
}) {
  const layer = options?.layer ?? makeLayer('layer-1');
  return render(
    <LocaleProvider locale="zh-CN">
      <TimelineLaneHeader
        layer={layer}
        layerIndex={0}
        activeTextTimelineMode={options?.activeTextTimelineMode ?? null}
        allLayers={options?.allLayers ?? [layer]}
        onReorderLayers={vi.fn(async () => undefined)}
        deletableLayers={options?.allLayers ?? [layer]}
        onFocusLayer={vi.fn()}
        renderLaneLabel={() => <span>Layer 1</span>}
        onLayerAction={options?.onLayerAction ?? vi.fn()}
        onToggleCollapsed={vi.fn()}
        {...(options?.layerLinks !== undefined ? { layerLinks: options.layerLinks } : {})}
        {...(options?.displayStyleControl ? { displayStyleControl: options.displayStyleControl } : {})}
        {...(options?.speakerQuickActions ? { speakerQuickActions: options.speakerQuickActions } : {})}
        {...(options?.headerMenuPreset ? { headerMenuPreset: options.headerMenuPreset } : {})}
        {...(trackModeControl ? { trackModeControl } : {})}
      />
    </LocaleProvider>,
  );
}

async function findMenuButton(label: string): Promise<HTMLButtonElement> {
  const textNode = await screen.findByText(label);
  const button = textNode.closest('button');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Menu button not found for label: ${label}`);
  }
  return button;
}

async function findMenuButtonByPattern(pattern: RegExp): Promise<HTMLButtonElement> {
  const button = await screen.findByRole('menuitem', { name: pattern });
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Menu button not found for pattern: ${pattern.source}`);
  }
  return button;
}

afterEach(() => {
  cleanup();
});

describe('TimelineLaneHeader track mode menu', () => {
  it('groups the layer header context menu into second-level categories', async () => {
    renderHeader();

    fireEvent.contextMenu(screen.getByText('Layer 1'));

    expect(await findMenuButtonByPattern(/编辑该层元信息|Edit layer metadata/)).toBeTruthy();
    expect(await findMenuButton('新建转写层')).toBeTruthy();
    expect(await findMenuButton('新建翻译层')).toBeTruthy();
    expect(await findMenuButton('删除当前层')).toBeTruthy();
    expect(await findMenuButton('视图')).toBeTruthy();
  });

  it('renders a manuscript timebase badge when timeline mode is document', () => {
    renderHeader(undefined, { activeTextTimelineMode: 'document' });

    const badge = screen.getByText(/文献时间基|Manuscript timebase/);
    expect(badge.className).toContain('timeline-lane-timebase-badge');
  });

  it('disables switching to locked multi-track mode when no lane locks exist', async () => {
    renderHeader({
      mode: 'multi-auto',
      onToggle: vi.fn(),
      onSetMode: vi.fn(),
      onLockSelectedToLane: vi.fn(),
      selectedSpeakerNames: ['Alice'],
      lockedSpeakerCount: 0,
    });

    fireEvent.contextMenu(screen.getByText('Layer 1'));
    fireEvent.mouseEnter(await findMenuButton('轨道'));

    const lockedModeItem = await findMenuButton('切换到分轨（锁定，需先锁定说话人）');
    expect(lockedModeItem.disabled).toBe(true);
  });

  it('opens a custom lane-lock dialog and applies the selected lane', async () => {
    const onLockSelectedToLane = vi.fn();

    renderHeader({
      mode: 'multi-auto',
      onToggle: vi.fn(),
      onSetMode: vi.fn(),
      onLockSelectedToLane,
      selectedSpeakerNames: ['Alice', 'Bob'],
      lockedSpeakerCount: 0,
    });

    fireEvent.contextMenu(screen.getByText('Layer 1'));
    fireEvent.mouseEnter(await findMenuButton('轨道'));
    fireEvent.click(await findMenuButton('锁定选中说话人到轨道…（Alice、Bob）'));

    const dialog = await screen.findByRole('dialog', { name: '锁定说话人到轨道' });
    const closeButton = screen.getByRole('button', { name: '关闭锁定轨道面板' });

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('timeline-lane-lock-dialog');
    expect(closeButton.closest('.dialog-header')).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认锁定' }).closest('.dialog-footer')).toBeTruthy();

    const input = screen.getByRole('spinbutton', { name: '目标轨道序号' });
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '确认锁定' }));

    expect(onLockSelectedToLane).toHaveBeenCalledWith(2);
  });

  it('allows opening create-translation from a translation header when transcription parents exist', async () => {
    const parentA = {
      ...makeLayer('parent-a'),
      constraint: 'independent_boundary',
      sortOrder: 0,
    } as LayerDocType;
    const parentB = {
      ...makeLayer('parent-b'),
      languageId: 'jpn',
      constraint: 'independent_boundary',
      sortOrder: 1,
    } as LayerDocType;
    const translationLayer = {
      ...makeLayer('translation-1'),
      layerType: 'translation',
      key: 'trl_fra_1',
      languageId: 'fra',
      sortOrder: 2,
    } as unknown as LayerDocType;
    const onLayerAction = vi.fn();

    renderHeader(undefined, {
      layer: translationLayer,
      allLayers: [parentA, parentB, translationLayer],
      onLayerAction,
      layerLinks: [makeTestHostLink(translationLayer.id, parentB)],
    });

    fireEvent.contextMenu(screen.getByText('Layer 1'));
    const createItem = await findMenuButton('新建翻译层');
    expect(createItem.disabled).toBe(false);

    fireEvent.click(createItem);
    expect(onLayerAction).toHaveBeenCalledWith('create-translation', translationLayer.id);
  });

  it('shows connectors by default and updates availability when layers change', async () => {
    const root = {
      ...makeLayer('root-layer'),
      constraint: 'independent_boundary',
      sortOrder: 0,
    } as LayerDocType;
    const child = {
      ...makeLayer('child-layer'),
      layerType: 'translation',
      key: 'trl_eng_1',
      languageId: 'eng',
      sortOrder: 1,
    } as unknown as LayerDocType;

    const view = renderHeader(undefined, {
      layer: root,
      allLayers: [root, child],
      layerLinks: [makeTestHostLink(child.id, root)],
    });

    expect(view.container.querySelector('.lane-link-connector-svg')).toBeTruthy();

    fireEvent.contextMenu(screen.getByText('Layer 1'));
    fireEvent.mouseEnter(await findMenuButton('视图'));
    let toggleItem = await findMenuButton('隐藏层级关系');
    expect(toggleItem.disabled).toBe(false);

    view.rerender(
      <LocaleProvider locale="zh-CN">
        <TimelineLaneHeader
          layer={root}
          layerIndex={0}
          allLayers={[root]}
          onReorderLayers={vi.fn(async () => undefined)}
          deletableLayers={[root]}
          onFocusLayer={vi.fn()}
          renderLaneLabel={() => <span>Layer 1</span>}
          onLayerAction={vi.fn()}
          onToggleCollapsed={vi.fn()}
        />
      </LocaleProvider>,
    );

    expect(view.container.querySelector('.lane-link-connector-svg')).toBeFalsy();
    fireEvent.contextMenu(screen.getByText('Layer 1'));
    fireEvent.mouseEnter(await findMenuButton('视图'));
    toggleItem = await findMenuButton('显示层级关系（暂无可用链接）');
    expect(toggleItem.disabled).toBe(true);

    view.rerender(
      <LocaleProvider locale="zh-CN">
        <TimelineLaneHeader
          layer={root}
          layerIndex={0}
          allLayers={[root, child]}
          onReorderLayers={vi.fn(async () => undefined)}
          deletableLayers={[root, child]}
          onFocusLayer={vi.fn()}
          renderLaneLabel={() => <span>Layer 1</span>}
          onLayerAction={vi.fn()}
          onToggleCollapsed={vi.fn()}
          layerLinks={[makeTestHostLink(child.id, root)]}
        />
      </LocaleProvider>,
    );

    expect(view.container.querySelector('.lane-link-connector-svg')).toBeTruthy();
    fireEvent.contextMenu(screen.getByText('Layer 1'));
    fireEvent.mouseEnter(await findMenuButton('视图'));
    toggleItem = await findMenuButton('隐藏层级关系');
    expect(toggleItem.disabled).toBe(false);
  });

  it('uses max bundle column width and offsets connector svg by column index', () => {
    const rootA = {
      ...makeLayer('root-a'),
      constraint: 'independent_boundary',
      sortOrder: 0,
    } as LayerDocType;
    const childA = {
      ...makeLayer('child-a'),
      layerType: 'translation',
      key: 'trl_a',
      languageId: 'eng',
      sortOrder: 1,
    } as unknown as LayerDocType;
    const rootB = {
      ...makeLayer('root-b'),
      constraint: 'independent_boundary',
      sortOrder: 2,
    } as LayerDocType;
    const childB = {
      ...makeLayer('child-b'),
      layerType: 'translation',
      key: 'trl_b',
      languageId: 'fra',
      sortOrder: 3,
    } as unknown as LayerDocType;

    const view = renderHeader(undefined, {
      layer: rootB,
      allLayers: [rootA, childA, rootB, childB],
      layerLinks: [makeTestHostLink(childA.id, rootA), makeTestHostLink(childB.id, rootB)],
    });

    const _stack = view.container.querySelector('.lane-link-stack') as HTMLElement | null;
    void _stack;
    const svg = view.container.querySelector('.lane-link-stack-svg') as SVGElement | null;
    const connectorGroup = view.container.querySelector('.lane-link-connector-svg') as SVGGElement | null;

    expect(svg?.getAttribute('width')).toBe('36');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 36 100');
    expect(connectorGroup?.getAttribute('transform')).toBe('translate(18 0)');
  });

  it('routes font selection through display style submenu update', async () => {
    const onUpdate = vi.fn();

    renderHeader(undefined, {
      displayStyleControl: {
        orthographies: [{
          id: 'ortho-1',
          name: { zho: '汉字' },
          languageId: 'cmn',
          scriptTag: 'Hans',
          createdAt: NOW,
        }],
        onUpdate,
        onReset: vi.fn(),
      },
    });

    fireEvent.contextMenu(screen.getByText('Layer 1'));
    fireEvent.mouseEnter(await findMenuButtonByPattern(/^显示样式/));
    fireEvent.mouseEnter(await findMenuButtonByPattern(/^字体|^Fonts/));
    fireEvent.click(await findMenuButtonByPattern(/Noto Sans SC/));

    expect(onUpdate).toHaveBeenCalledWith('layer-1', { fontFamily: 'Noto Sans SC' });
  });

  it('routes font size selection through display style submenu update', async () => {
    const onUpdate = vi.fn();

    renderHeader(undefined, {
      displayStyleControl: {
        orthographies: [{
          id: 'ortho-1',
          name: { zho: '汉字' },
          languageId: 'cmn',
          scriptTag: 'Hans',
          createdAt: NOW,
        }],
        onUpdate,
        onReset: vi.fn(),
      },
    });

    fireEvent.contextMenu(screen.getByText('Layer 1'));
    fireEvent.mouseEnter(await findMenuButtonByPattern(/^显示样式/));
    fireEvent.mouseEnter(await findMenuButtonByPattern(/^字号|^Font Size/));
    fireEvent.click(await findMenuButtonByPattern(/15px/));

    expect(onUpdate).toHaveBeenCalledWith('layer-1', { fontSize: 15 });
  });
});

describe('TimelineLaneHeader track and speaker chrome', () => {
  it('omits track and speaker categories when those props are not passed', async () => {
    const parent = {
      ...makeLayer('parent-1'),
      constraint: 'independent_boundary',
    } as LayerDocType;
    const translationLayer = {
      ...makeLayer('tr-1'),
      layerType: 'translation',
    } as unknown as LayerDocType;

    render(
      <LocaleProvider locale="zh-CN">
        <TimelineLaneHeader
          layer={translationLayer}
          layerIndex={1}
          activeTextTimelineMode={null}
          allLayers={[parent, translationLayer]}
          onReorderLayers={vi.fn(async () => undefined)}
          deletableLayers={[parent, translationLayer]}
          onFocusLayer={vi.fn()}
          renderLaneLabel={() => <span>Layer 1</span>}
          onLayerAction={vi.fn()}
          onToggleCollapsed={vi.fn()}
          layerLinks={[makeTestHostLink(translationLayer.id, parent)]}
        />
      </LocaleProvider>,
    );

    fireEvent.contextMenu(screen.getByText('Layer 1'));

    expect(screen.queryAllByRole('menuitem', { name: /轨道/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /^说话人/ })).toHaveLength(0);
  });

  it('shows track and speaker categories when props are passed (caller opt-in)', async () => {
    const translationLayer = {
      ...makeLayer('tr-1'),
      layerType: 'translation',
    } as unknown as LayerDocType;

    renderHeader(
      {
        mode: 'single',
        onToggle: vi.fn(),
      },
      {
        layer: translationLayer,
        allLayers: [translationLayer],
        headerMenuPreset: 'layer-chrome-plus-track',
        speakerQuickActions: {
          selectedCount: 0,
          speakerOptions: [{ id: 's1', name: 'Alice' }],
          onAssignToSelection: vi.fn(),
          onClearSelection: vi.fn(),
          onOpenCreateAndAssignPanel: vi.fn(),
        },
      },
    );

    fireEvent.contextMenu(screen.getByText('Layer 1'));

    expect((await screen.findAllByRole('menuitem', { name: /轨道/ })).length).toBeGreaterThan(0);
    expect((await screen.findAllByRole('menuitem', { name: /^说话人/ })).length).toBeGreaterThan(0);
  });

  it('suppresses track and speaker when preset is layer-chrome even if props are passed', async () => {
    const translationLayer = {
      ...makeLayer('tr-1'),
      layerType: 'translation',
    } as unknown as LayerDocType;

    render(
      <LocaleProvider locale="zh-CN">
        <TimelineLaneHeader
          layer={translationLayer}
          layerIndex={1}
          activeTextTimelineMode={null}
          allLayers={[translationLayer]}
          onReorderLayers={vi.fn(async () => undefined)}
          deletableLayers={[translationLayer]}
          onFocusLayer={vi.fn()}
          renderLaneLabel={() => <span>Layer 1</span>}
          onLayerAction={vi.fn()}
          onToggleCollapsed={vi.fn()}
          headerMenuPreset="layer-chrome"
          trackModeControl={{
            mode: 'single',
            onToggle: vi.fn(),
          }}
          speakerQuickActions={{
            selectedCount: 0,
            speakerOptions: [{ id: 's1', name: 'Alice' }],
            onAssignToSelection: vi.fn(),
            onClearSelection: vi.fn(),
            onOpenCreateAndAssignPanel: vi.fn(),
          }}
        />
      </LocaleProvider>,
    );

    fireEvent.contextMenu(screen.getByText('Layer 1'));

    expect(screen.queryAllByRole('menuitem', { name: /轨道/ })).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: /^说话人/ })).toHaveLength(0);
  });
});
