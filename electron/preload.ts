import { contextBridge, ipcRenderer } from 'electron';

export interface RequestChunkEvent {
  requestId: string;
  chunk: string;
}

const desktop = {
  writeProbe: (note: string) => ipcRenderer.invoke('skeleton:write-probe', note),
  openProject: (folder: string) => ipcRenderer.invoke('skeleton:open-project', folder),
  openDesktopSession: (folder: string) => ipcRenderer.invoke('desktop:open-session', folder),
  closeDesktopSession: (sessionId: string) =>
    ipcRenderer.invoke('desktop:close-session', sessionId),
  desktopCall: (sessionId: string, method: string, args: unknown) =>
    ipcRenderer.invoke('desktop:call', sessionId, method, args),
  storeSecret: (plain: string) => ipcRenderer.invoke('skeleton:store-secret', plain),
  startRequest: (requestId: string, url: string) =>
    ipcRenderer.invoke('skeleton:start-request', requestId, url),
  abortRequest: (requestId: string) => ipcRenderer.invoke('skeleton:abort-request', requestId),
  onRequestChunk: (listener: (event: RequestChunkEvent) => void) => {
    const wrapped = (_event: unknown, payload: RequestChunkEvent) => listener(payload);
    ipcRenderer.on('skeleton:request-chunk', wrapped);
    return () => {
      ipcRenderer.removeListener('skeleton:request-chunk', wrapped);
    };
  },
  mediaUrl: (name: string) => ipcRenderer.invoke('skeleton:media-url', name),
  openStorage: (folder: string) => ipcRenderer.invoke('storage:open', folder),
  storageCall: (method: string, args: readonly unknown[]) =>
    ipcRenderer.invoke('storage:call', method, args),
  reopenStorage: () => ipcRenderer.invoke('storage:reopen'),
};

contextBridge.exposeInMainWorld('jieyuDesktop', desktop);

export type JieyuDesktop = typeof desktop;
