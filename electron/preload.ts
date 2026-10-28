import { contextBridge, ipcRenderer } from 'electron';
import { desktopProjectReadEnabled } from '../src/desktop/skeleton/desktopProjectReadFlag';

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
  transcribeModel: (input: unknown) => ipcRenderer.invoke('model:transcribe', input),
  cancelModel: (requestId: string) => ipcRenderer.invoke('model:cancel', requestId),
  projectReadEnabled: desktopProjectReadEnabled(process.env.JIEYU_DESKTOP_PROJECT_READ),
  chooseDesktopFolder: () => ipcRenderer.invoke('desktop:choose-folder'),
  chooseImportFile: () => ipcRenderer.invoke('desktop:choose-import-file'),
  chooseExportFile: (name: string) => ipcRenderer.invoke('desktop:choose-export-file', name),
  listDailyBackups: (sessionId: string) => ipcRenderer.invoke('desktop:list-backups', sessionId),
  restoreDailyBackup: (sessionId: string, day: string) =>
    ipcRenderer.invoke('desktop:restore-backup', sessionId, day),
  desktopMediaUrl: (sessionId: string, mediaId: string) =>
    ipcRenderer.invoke('desktop:media-url', sessionId, mediaId),
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
