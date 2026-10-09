// @vitest-environment jsdom
/**
 * BF1-N1：maplibre-gl 6 为纯 ESM，默认按 `new URL('./maplibre-gl-worker.mjs', import.meta.url)` 找 worker，
 * Vite 不会产出该文件；组件必须在建图前用打包后的 `?url` 调用 setWorkerUrl。
 * BF1-N1: maplibre-gl 6 resolves its worker next to its own chunk, which Vite does not emit; the component must
 * call setWorkerUrl with the bundled `?url` before constructing the Map.
 * （移植自复审用例 src/__review__/maplibreWorker.review.test.tsx | ported from the review repro）
 */
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const loadHandlers: Array<() => void> = [];
let currentWorkerUrl = '';

vi.mock('maplibre-gl', () => {
  class Evented {
    on(type: string, handler: () => void) {
      if (type === 'load') loadHandlers.push(handler);
      return this;
    }
    off() {
      return this;
    }
  }
  class Map extends Evented {
    constructor() {
      super();
      calls.push('Map');
    }
    addControl() {
      return this;
    }
    getCanvas() {
      return { style: {} };
    }
    remove() {}
    getZoom() {
      return 5;
    }
    flyTo() {}
    setCenter() {}
  }
  class Marker extends Evented {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    setPopup() {
      return this;
    }
    remove() {}
    getElement() {
      return document.createElement('div');
    }
    setDraggable() {
      return this;
    }
  }
  class Popup {
    setHTML() {
      return this;
    }
  }
  class NavigationControl {}
  return {
    Map,
    Marker,
    Popup,
    NavigationControl,
    setWorkerUrl: (url: string) => {
      calls.push(`setWorkerUrl:${url}`);
      currentWorkerUrl = url;
    },
    getWorkerUrl: () => currentWorkerUrl,
  };
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?url', () => ({
  default: '/assets/maplibre-gl-worker-test.mjs',
}));

const OSM = { kind: 'osm', apiKey: '', styleId: 'standard', apiKeysByProvider: {} } as const;

describe('LanguageMapEmbed: bundled maplibre worker (BF1-N1)', () => {
  beforeEach(() => {
    calls.length = 0;
    loadHandlers.length = 0;
    currentWorkerUrl = '';
  });

  it('在建图前用打包后的 worker URL 调用 setWorkerUrl | sets the bundled worker URL before constructing the Map', async () => {
    const { LanguageMapEmbed } = await import('./LanguageMapEmbed');
    render(
      <LanguageMapEmbed
        latitude={30}
        longitude={100}
        locale="zh-CN"
        providerConfig={OSM as never}
      />,
    );
    await waitFor(() => expect(calls).toContain('Map'));
    const setIdx = calls.findIndex((c) => c.startsWith('setWorkerUrl:'));
    expect(setIdx).toBeGreaterThanOrEqual(0);
    expect(setIdx).toBeLessThan(calls.indexOf('Map'));
    expect(calls[setIdx]).toBe('setWorkerUrl:/assets/maplibre-gl-worker-test.mjs');
  });

  it('重复挂载不重复设置；load 后标记容器 | does not reset an identical URL and marks the container on load', async () => {
    currentWorkerUrl = '/assets/maplibre-gl-worker-test.mjs';
    const { LanguageMapEmbed } = await import('./LanguageMapEmbed');
    const { container } = render(
      <LanguageMapEmbed
        latitude={30}
        longitude={100}
        locale="zh-CN"
        providerConfig={OSM as never}
      />,
    );
    await waitFor(() => expect(calls).toContain('Map'));
    expect(calls.some((c) => c.startsWith('setWorkerUrl:'))).toBe(false);
    expect(container.querySelector('[data-map-loaded]')).toBeNull();
    loadHandlers.forEach((handler) => handler());
    expect(container.querySelector('[data-map-loaded="true"]')).not.toBeNull();
  });
});
