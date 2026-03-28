import { describe, expect, it } from 'vitest';
import {
  getTrackEntityState,
  loadTrackEntityStateMap,
  saveTrackEntityStateMap,
  upsertTrackEntityState,
  type TrackEntityStateMap,
} from './TrackEntityStore';

describe('TrackEntityStore', () => {
  it('upserts and retrieves media scoped track entity state', () => {
    const stateMap = upsertTrackEntityState({}, 'm1', {
      mode: 'multi-locked',
      laneLockMap: { s1: 2 },
    });

    const state = getTrackEntityState(stateMap, 'm1');
    expect(state?.mode).toBe('multi-locked');
    expect(state?.laneLockMap.s1).toBe(2);
  });

  it('persists and reloads with sanitizer', () => {
    const storage = {
      value: '',
      getItem: (_key: string) => storage.value,
      setItem: (_key: string, value: string) => {
        storage.value = value;
      },
      removeItem: () => {
        storage.value = '';
      },
      clear: () => {
        storage.value = '';
      },
      key: () => null,
      length: 0,
    } as unknown as Storage;

    const sourceMap: TrackEntityStateMap = {
      m1: {
        mode: 'multi-auto',
        laneLockMap: { s1: 0 },
        updatedAt: new Date().toISOString(),
      },
    };

    saveTrackEntityStateMap(sourceMap, storage);
    const loaded = loadTrackEntityStateMap(storage);

    expect(loaded.m1?.mode).toBe('multi-auto');
    expect(loaded.m1?.laneLockMap.s1).toBe(0);
  });

  it('isolates state by project+media scoped keys', () => {
    const projectAKey = 'text-a::m1';
    const projectBKey = 'text-b::m1';

    const withProjectA = upsertTrackEntityState({}, projectAKey, {
      mode: 'multi-locked',
      laneLockMap: { s1: 1 },
    });
    const withBothProjects = upsertTrackEntityState(withProjectA, projectBKey, {
      mode: 'multi-auto',
      laneLockMap: { s2: 0 },
    });

    const stateA = getTrackEntityState(withBothProjects, projectAKey);
    const stateB = getTrackEntityState(withBothProjects, projectBKey);

    expect(stateA?.mode).toBe('multi-locked');
    expect(stateA?.laneLockMap).toEqual({ s1: 1 });
    expect(stateB?.mode).toBe('multi-auto');
    expect(stateB?.laneLockMap).toEqual({ s2: 0 });
  });

  it('keeps the fixed-speaker multi-track mode through sanitize and storage', () => {
    const stateMap = upsertTrackEntityState({}, 'm-fixed', {
      mode: 'multi-speaker-fixed',
      laneLockMap: { s1: 0, s2: 1 },
    });

    expect(getTrackEntityState(stateMap, 'm-fixed')?.mode).toBe('multi-speaker-fixed');
  });
});
