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
    reopen: (sessionId: string) => once<{ reopened: true }>(sessionId, 'reopen', {}),
  };
}
