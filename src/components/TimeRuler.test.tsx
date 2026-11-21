/** @vitest-environment jsdom */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { TimeRuler } from './TimeRuler';

describe('TimeRuler', () => {
  it('draws a tick label for the visible span', () => {
    const { container } = render(
      <LocaleProvider locale="zh-CN">
        <TimeRuler
          duration={10}
          rulerView={{ start: 0, end: 10 }}
          zoomPxPerSec={100}
          documentSpanSec={10}
          isLaneHeaderCollapsed={false}
          onToggleLaneHeader={() => undefined}
          seekTo={vi.fn()}
          instanceRef={{ current: null }}
          waveCanvasRef={{ current: null }}
          tierContainerRef={{ current: null }}
        />
      </LocaleProvider>,
    );
    expect(container.querySelector('.time-ruler-label-text')?.textContent).toBe('0:00');
    expect(container.querySelector('.time-ruler-overview')).toBeTruthy();
    expect(container.querySelector('.time-ruler-cursor-line')?.getAttribute('y2')).toBe('100%');
  });
});
