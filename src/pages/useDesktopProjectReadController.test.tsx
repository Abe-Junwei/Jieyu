// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../i18n';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { useDesktopProjectReadController } from './useDesktopProjectReadController';

function wrapper({ children }: { children: React.ReactNode }) {
  return <LocaleProvider locale="en-US">{children}</LocaleProvider>;
}

describe('useDesktopProjectReadController (#401)', () => {
  it('ignores a stale manuscript load after a newer selection', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    let resolveSecond: ((value: unknown) => void) | undefined;
    const firstGate = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondGate = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    const host: DesktopReadHost = {
      projectReadEnabled: true,
      chooseDesktopFolder: async () => ({ sessionId: 'session-1' }),
      desktopCall: async (_sessionId, method, args) => {
        if (method === 'manuscripts.list') {
          return [
            { id: 'ms-a', title: { zh: '甲' }, mediaId: 'm1', createdAt: '', updatedAt: '' },
            { id: 'ms-b', title: { zh: '乙' }, mediaId: 'm1', createdAt: '', updatedAt: '' },
          ];
        }
        if (method === 'layers.list') {
          const manuscriptId = (args as { manuscriptId?: string }).manuscriptId;
          if (manuscriptId === 'ms-a') await firstGate;
          if (manuscriptId === 'ms-b') await secondGate;
          return [
            {
              id: `layer-${manuscriptId}`,
              manuscriptId,
              key: 'tx',
              name: { zh: '转写' },
              tierType: 'time-aligned',
              contentType: 'transcription',
              languageId: null,
              orthographyId: null,
              parentId: null,
              sortOrder: 0,
              createdAt: '',
              updatedAt: '',
            },
          ];
        }
        if (method === 'units.list') {
          const layerId = String((args as { layerId?: string }).layerId ?? '');
          const manuscriptId = layerId.replace('layer-', '');
          return [
            {
              id: `unit-${manuscriptId}`,
              layerId,
              speakerId: null,
              parentUnitId: null,
              startTime: 0,
              endTime: 1,
              createdAt: '',
              updatedAt: '',
              text: manuscriptId === 'ms-a' ? '甲句' : '乙句',
            },
          ];
        }
        if (method === 'notes.list') return [];
        if (method === 'projects.get' || method === 'project.get') {
          return { id: 'p1', title: { zh: '项目' } };
        }
        return [];
      },
      desktopMediaUrl: async () => ({ url: 'jieyu-media://local/token' }),
    };

    const { result } = renderHook(() => useDesktopProjectReadController(host), { wrapper });

    await act(async () => {
      result.current.openFolder();
    });
    // Open folder loads default manuscript (first list item) — release both gates for open.
    resolveFirst?.(undefined);
    resolveSecond?.(undefined);
    await waitFor(() => {
      expect(
        result.current.model?.manuscriptId === 'ms-a' ||
          result.current.model?.manuscriptId === 'ms-b',
      ).toBe(true);
    });

    // Reset gates for switch race
    let resolveA: ((value: unknown) => void) | undefined;
    let resolveB: ((value: unknown) => void) | undefined;
    const gateA = new Promise((resolve) => {
      resolveA = resolve;
    });
    const gateB = new Promise((resolve) => {
      resolveB = resolve;
    });
    host.desktopCall = async (_sessionId, method, args) => {
      if (method === 'manuscripts.list') {
        return [
          { id: 'ms-a', title: { zh: '甲' }, mediaId: 'm1', createdAt: '', updatedAt: '' },
          { id: 'ms-b', title: { zh: '乙' }, mediaId: 'm1', createdAt: '', updatedAt: '' },
        ];
      }
      if (method === 'layers.list') {
        const manuscriptId = (args as { manuscriptId?: string }).manuscriptId;
        if (manuscriptId === 'ms-a') await gateA;
        if (manuscriptId === 'ms-b') await gateB;
        return [
          {
            id: `layer-${manuscriptId}`,
            manuscriptId,
            key: 'tx',
            name: { zh: '转写' },
            tierType: 'time-aligned',
            contentType: 'transcription',
            languageId: null,
            orthographyId: null,
            parentId: null,
            sortOrder: 0,
            createdAt: '',
            updatedAt: '',
          },
        ];
      }
      if (method === 'units.list') {
        const layerId = String((args as { layerId?: string }).layerId ?? '');
        const manuscriptId = layerId.replace('layer-', '');
        return [
          {
            id: `unit-${manuscriptId}`,
            layerId,
            speakerId: null,
            parentUnitId: null,
            startTime: 0,
            endTime: 1,
            createdAt: '',
            updatedAt: '',
            text: manuscriptId === 'ms-a' ? '甲句' : '乙句',
          },
        ];
      }
      if (method === 'notes.list') return [];
      if (method === 'projects.get' || method === 'project.get') {
        return { id: 'p1', title: { zh: '项目' } };
      }
      return [];
    };

    act(() => {
      result.current.selectManuscript('ms-a');
      result.current.selectManuscript('ms-b');
    });
    resolveB?.(undefined);
    await waitFor(() => {
      expect(result.current.model?.manuscriptId).toBe('ms-b');
      expect(result.current.model?.units[0]?.text).toBe('乙句');
    });
    resolveA?.(undefined);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.model?.manuscriptId).toBe('ms-b');
    expect(result.current.model?.units[0]?.text).toBe('乙句');
  });
});
