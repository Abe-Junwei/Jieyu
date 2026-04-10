// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../db';
import { TimelineLaneHeader } from './TimelineLaneHeader';

const NOW = new Date().toISOString();

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
  onLayerAction?: (action: 'create-transcription' | 'create-translation' | 'delete', layerId: string) => void;
  displayStyleControl?: Parameters<typeof TimelineLaneHeader>[0]['displayStyleControl'];
}) {
  const layer = options?.layer ?? makeLayer('layer-1');
  return render(
    <TimelineLaneHeader
      layer={layer}
      layerIndex={0}
      allLayers={options?.allLayers ?? [layer]}
      onReorderLayers={vi.fn(async () => undefined)}
      deletableLayers={options?.allLayers ?? [layer]}
      onFocusLayer={vi.fn()}
      renderLaneLabel={() => <span>Layer 1</span>}
      onLayerAction={options?.onLayerAction ?? vi.fn()}
      onToggleCollapsed={vi.fn()}
      {...(options?.displayStyleControl ? { displayStyleControl: options.displayStyleControl } : {})}
      {...(trackModeControl ? { trackModeControl } : {})}
    />,
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

    expect(await findMenuButton('新建转写层')).toBeTruthy();
    expect(await findMenuButton('新建翻译层')).toBeTruthy();
    expect(await findMenuButton('删除当前层')).toBeTruthy();
    expect(await findMenuButton('视图')).toBeTruthy();
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

    const lockedModeItem = await findMenuButton('切换到多轨模式（锁定，需先锁定说话人）');
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
      parentLayerId: parentB.id,
      sortOrder: 2,
    } as LayerDocType;
    const onLayerAction = vi.fn();

    renderHeader(undefined, {
      layer: translationLayer,
      allLayers: [parentA, parentB, translationLayer],
      onLayerAction,
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
      parentLayerId: root.id,
      sortOrder: 1,
    } as LayerDocType;

    const view = renderHeader(undefined, {
      layer: root,
      allLayers: [root, child],
    });

    expect(view.container.querySelector('.lane-link-connector-svg')).toBeTruthy();

    fireEvent.contextMenu(screen.getByText('Layer 1'));
    fireEvent.mouseEnter(await findMenuButton('视图'));
    let toggleItem = await findMenuButton('隐藏层级关系');
    expect(toggleItem.disabled).toBe(false);

    view.rerender(
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
      />,
    );

    expect(view.container.querySelector('.lane-link-connector-svg')).toBeFalsy();
    fireEvent.contextMenu(screen.getByText('Layer 1'));
    fireEvent.mouseEnter(await findMenuButton('视图'));
    toggleItem = await findMenuButton('显示层级关系（暂无可用链接）');
    expect(toggleItem.disabled).toBe(true);

    view.rerender(
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
      />,
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
      parentLayerId: rootA.id,
      sortOrder: 1,
    } as LayerDocType;
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
      parentLayerId: rootB.id,
      sortOrder: 3,
    } as LayerDocType;

    const view = renderHeader(undefined, {
      layer: rootB,
      allLayers: [rootA, childA, rootB, childB],
    });

    const stack = view.container.querySelector('.lane-link-stack') as HTMLElement | null;
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
