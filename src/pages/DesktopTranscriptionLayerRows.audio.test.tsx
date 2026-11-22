/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLayerTree, emptyFold } from './desktopTranscriptionLayerTree';
import { DesktopTranscriptionLayerRows } from './DesktopTranscriptionLayerRows';

afterEach(() => cleanup());

describe('audio layer cards', () => {
  it('puts the clip controls on the recording layer only', () => {
    const layers = [
      {
        id: 'host',
        name: { zh: '转写' },
        modality: 'text',
        units: [{ id: 'u', startMs: 0, endMs: 1000, text: '原句' }],
      },
      {
        id: 'audio',
        name: { zh: '口译' },
        modality: 'audio',
        units: [{ id: 'u', startMs: 0, endMs: 1000, text: '' }],
      },
      {
        id: 'text',
        name: { zh: '口译文' },
        modality: 'text',
        parentId: 'audio',
        units: [{ id: 'u', startMs: 0, endMs: 1000, text: '词' }],
      },
    ];
    const tree = buildLayerTree(
      layers,
      [
        { layerId: 'audio', hostLayerId: 'host', isPreferred: true, sortOrder: 0 },
        { layerId: 'text', hostLayerId: 'host', isPreferred: true, sortOrder: 1 },
      ],
      emptyFold(),
    );
    render(
      <DesktopTranscriptionLayerRows
        locale="zh-CN"
        layers={layers}
        tree={tree}
        mainLayerId="host"
        renderMain={() => null}
        onToggleGroup={vi.fn()}
        onCollapse={vi.fn()}
        onExpand={vi.fn()}
        compact={false}
        duration={10}
        zoomPxPerSec={10}
        scrollLeftPx={0}
        focus={null}
        editing={null}
        createLayerId={null}
        createFrame={null}
        bodyDraft={null}
        preview={null}
        onRowMenu={vi.fn()}
        onRowResize={vi.fn()}
        onPick={vi.fn()}
        onEditBody={vi.fn()}
        onComposeBody={vi.fn()}
        onCommitBody={vi.fn()}
        onStopEdit={vi.fn()}
        onCreate={vi.fn()}
        audioTools={() => <span data-testid="oral-controls">clip</span>}
      />,
    );
    expect(screen.getAllByTestId('oral-controls')).toHaveLength(1);
    expect(screen.getByText('词')).toBeTruthy();
  });
});
