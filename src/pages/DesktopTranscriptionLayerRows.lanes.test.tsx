/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopTranscriptionEdgeChrome } from './DesktopTranscriptionEdgeChrome';
import { buildLayerTree, emptyFold } from './desktopTranscriptionLayerTree';
import { DesktopTranscriptionLayerRows } from './DesktopTranscriptionLayerRows';
import { layoutSpeakerLane, type SpeakerLaneChrome } from './desktopSpeakerLanes';

afterEach(() => cleanup());

describe('speaker lane paint', () => {
  it('shows the speaker name and the overlap count on a single row', () => {
    const layout = layoutSpeakerLane(
      [
        { id: 'u', startTime: 0, endTime: 2, speakerId: 'ada' },
        { id: 'v', startTime: 1, endTime: 3, speakerId: 'bai' },
      ],
      'single',
      {},
    );
    const lanes: SpeakerLaneChrome = {
      layoutOf: () => layout,
      modeOf: () => 'single',
      nameOf: (id) => (id === 'ada' ? '阿达' : id === 'bai' ? '白玛' : ''),
      menu: { recent: [], rest: [] },
      setMode: vi.fn(),
      cycle: vi.fn(),
      lock: vi.fn(),
      clearConflicts: vi.fn(),
      assign: vi.fn(),
      clear: vi.fn(),
    };
    const layers = [
      {
        id: 'tx',
        name: { zh: '转写' },
        units: [
          { id: 'u', startMs: 0, endMs: 2000, text: '甲', speakerId: 'ada' },
          { id: 'v', startMs: 1000, endMs: 3000, text: '乙', speakerId: 'bai' },
        ],
      },
    ];
    render(
      <DesktopTranscriptionLayerRows
        locale="zh-CN"
        layers={layers}
        tree={buildLayerTree(layers, [], emptyFold())}
        mainLayerId={null}
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
        lanes={lanes}
      />,
    );
    expect(screen.getByText('1 处')).toBeTruthy();
    expect(screen.getAllByTestId('speaker-name').map((node) => node.textContent)).toEqual([
      '阿达',
      '白玛',
    ]);
  });

  it('lists the recent speakers before the rest, then clear', () => {
    render(
      <DesktopTranscriptionEdgeChrome
        locale="zh-CN"
        place={null}
        start=""
        end=""
        saved={false}
        hasMedia={false}
        tip={null}
        edgeFocus={null}
        conflicts={{ start: null, end: null }}
        stale={null}
        menu={{ x: 0, y: 0, canLink: false, skipped: false }}
        deletePrompt={null}
        onRebase={vi.fn()}
        onDiscardDraft={vi.fn()}
        onDropStale={vi.fn()}
        onEdit={vi.fn()}
        onFlush={vi.fn()}
        onCloseMenu={vi.fn()}
        onLink={vi.fn()}
        onClearText={vi.fn()}
        onToggleSkip={vi.fn()}
        onAskDelete={vi.fn()}
        onCancelDelete={vi.fn()}
        onConfirmDelete={vi.fn()}
        speakers={{
          recent: [
            { id: 'a', name: '阿达' },
            { id: 'b', name: '白玛' },
          ],
          rest: [{ id: 'd', name: '达瓦' }],
          currentId: 'a',
          onAssign: vi.fn(),
          onClear: vi.fn(),
        }}
      />,
    );
    const items = screen.getAllByRole('menuitem').map((node) => node.textContent);
    const speaker = items.indexOf('阿达  当前');
    expect(items.slice(speaker, speaker + 4)).toEqual(['阿达  当前', '白玛', '达瓦', '清除']);
  });
});
