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
}) {
  const layer = options?.layer ?? makeLayer('layer-1');
  render(
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
      {...(trackModeControl ? { trackModeControl } : {})}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe('TimelineLaneHeader track mode menu', () => {
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

    const lockedModeItem = await screen.findByRole('menuitem', { name: '切换为多轨模式（锁定，需先锁定说话人）' });
    expect((lockedModeItem as HTMLButtonElement).disabled).toBe(true);
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
    fireEvent.click(await screen.findByRole('menuitem', { name: '锁定选中说话人到轨道…（Alice、Bob）' }));

    expect(await screen.findByRole('dialog', { name: '锁定说话人到轨道' })).toBeTruthy();

    const input = screen.getByRole('spinbutton');
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
    const createItem = await screen.findByRole('menuitem', { name: '新建翻译层' });
    expect((createItem as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(createItem);
    expect(onLayerAction).toHaveBeenCalledWith('create-translation', translationLayer.id);
  });
});
