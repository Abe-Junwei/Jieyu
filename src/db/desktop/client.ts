import type { Layer, LayerCreate } from './layers';
import type { Media, MediaCreate } from './media';
import type { Manuscript, ManuscriptCreate } from './manuscripts';
import type { Unit, UnitCreate } from './units';

export interface DesktopBridge {
  desktopCall(sessionId: string, method: string, args: unknown): Promise<unknown>;
}

/** One bridge call per action. A lost response is returned as a failure and is not sent again. */
export function createDesktopClient(bridge: DesktopBridge) {
  async function once<T>(sessionId: string, method: string, args: unknown): Promise<T> {
    return (await bridge.desktopCall(sessionId, method, args)) as T;
  }
  return {
    createMedia: (sessionId: string, input: MediaCreate) =>
      once<Media>(sessionId, 'media.create', input),
    createManuscript: (sessionId: string, input: ManuscriptCreate) =>
      once<Manuscript>(sessionId, 'manuscripts.create', input),
    createLayer: (sessionId: string, input: LayerCreate) =>
      once<Layer>(sessionId, 'layers.create', input),
    createUnit: (sessionId: string, input: UnitCreate) =>
      once<Unit>(sessionId, 'units.create', input),
    getUnit: (sessionId: string, id: string) => once<Unit | null>(sessionId, 'units.get', { id }),
    listManuscripts: (sessionId: string) => once<Manuscript[]>(sessionId, 'manuscripts.list', {}),
    listLayers: (sessionId: string, manuscriptId: string) =>
      once<Layer[]>(sessionId, 'layers.list', { manuscriptId }),
    listUnits: (sessionId: string, layerId: string) =>
      once<Unit[]>(sessionId, 'units.list', { layerId }),
    updateUnitText: (sessionId: string, input: { unitId: string; text: string }) =>
      once<Unit>(sessionId, 'units.updateText', input),
    updateBoundary: (sessionId: string, input: { leftId: string; rightId: string; time: number }) =>
      once<{ left: Unit; right: Unit }>(sessionId, 'units.updateBoundary', input),
    setTimeMapping: (
      sessionId: string,
      input: {
        manuscriptId: string;
        expectedRevision: number;
        offsetSec: number;
        scale: number;
        sourceMediaId?: string;
      },
    ) => once<Manuscript>(sessionId, 'manuscripts.setTimeMapping', input),
    rollbackTimeMapping: (
      sessionId: string,
      input: { manuscriptId: string; expectedRevision: number },
    ) => once<Manuscript>(sessionId, 'manuscripts.rollbackTimeMapping', input),
    reopen: (sessionId: string) => once<{ reopened: true }>(sessionId, 'reopen', {}),
  };
}
