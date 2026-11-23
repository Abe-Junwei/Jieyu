import { startLocalWhisper, stopLocalWhisper } from '../src/desktop/localWhisper';
import {
  awaitWindowDecision,
  quitAfterWindows,
  resolveWindowDecision,
} from '../src/desktop/quitAfterWindows';
import {
  grantTranscriptionModel,
  transcribeProject,
  cancelProjectTranscription,
  recoverProjectTranscriptions,
  resetProjectTranscriptions,
} from '../src/desktop/projectTranscription';
import type { ProjectTranscriptionInput } from '../src/desktop/transcriptionTypes';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  safeStorage,
  session,
} from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  callLockedSqliteStorage,
  closeLockedSqliteStorage,
  openLockedSqliteStorage,
  reopenLockedSqliteStorage,
  writeProjectLibraryMarker,
} from '@sqlite-host';
import { callDesktopSession } from '../src/db/desktop/desktopCall';
import { trashFile } from './trashFile';
import { listDailyBackupDays, restoreDailyBackup } from '../src/db/desktop/dailyBackup';
import {
  grantRestoredProject,
  // exchange path grants (#482)
  readRestoredProjectGrant,
} from '../src/desktop/restoredProjectGrant';
import { grantExchangePath } from '../src/desktop/exchangePathGrant';
import { projectLibraryHeaderMatches } from '../src/db/desktop/openProject';
import {
  copyRecordingIntoProject,
  projectFolderForNewImport,
} from '../src/db/desktop/importRecordingFile';
import { desktopMediaPlayUrl } from '../src/db/desktop/mediaUrl';
import {
  abandonDesktopSession,
  closeDesktopSession,
  desktopSessionFolder,
  expireAndSweepAttachments,
  openDesktopSession,
  openPreparedDesktopSession,
  resetDesktopSessions,
  sweepCurrentAttachments,
} from '../src/db/desktop/projectSession';
import { DESKTOP_CSP } from '../src/desktop/skeleton/desktopCsp';
import { packagedPageFile } from '../src/desktop/skeleton/packagedPage';
import {
  isAllowedAiOutboundUrl,
  isAllowedProjectFolder,
  isAppNavigation,
  secretStoreRefusal,
} from '../src/desktop/skeleton/desktopSecurity';
import { sliceForRange } from '../src/desktop/skeleton/mediaRange';
import { openProjectFolder } from '../src/desktop/skeleton/openProject';
import {
  bindDesktopMediaSession,
  grantDesktopMedia,
  releaseDesktopMediaSession,
  resetDesktopMediaGrants,
  resolveDesktopMedia,
} from '../src/desktop/skeleton/desktopMediaGrant';
import { fileContainsProbeTable, writeSkeletonProbe } from '../src/desktop/skeleton/probeStore';
import { sqliteStoragePortFlagEnabled } from '../src/desktop/skeleton/sqliteStoragePortFlag';
import { ensureUserDataLayout, projectBackupDir } from '../src/desktop/skeleton/userDataLayout';
import { configureDesktopDiagnosticStore } from '../src/db/desktop/diagnosticDelivery';

const userDataDir = process.env.JIEYU_DESKTOP_USER_DATA;
if (typeof userDataDir === 'string' && userDataDir.length > 0) {
  app.setPath('userData', userDataDir);
}

const SMOKE = process.argv.includes('--smoke');
// Test runs keep the window hidden and out of the Dock so they never take focus.
const HIDE_WINDOW = process.env.JIEYU_DESKTOP_HIDE_WINDOW === '1';
if (HIDE_WINDOW && process.platform === 'darwin') app.setActivationPolicy('accessory');
// Linux CI has no secret service; only the smoke run may fall back to the hardcoded-password store.
if (SMOKE) {
  app.commandLine.appendSwitch('password-store', 'basic');
  if (process.platform === 'linux') safeStorage.setUsePlainTextEncryption(true);
}
// Local Font Access stays off unless this feature is named before ready.
app.commandLine.appendSwitch('enable-features', 'FontAccess');

const BAIDU_MARKER = '百度网盘';
const MEDIA_SCHEME = 'jieyu-media';
const APP_SCHEME = 'jieyu-app';
const APP_PRIVILEGES = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  stream: true,
  corsEnabled: true,
};

protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: APP_PRIVILEGES },
  { scheme: APP_SCHEME, privileges: APP_PRIVILEGES },
]);

function mediaRoot(): string {
  return path.join(app.getPath('temp'), 'jieyu-skeleton-media');
}

function mediaFile(name: string): string | null {
  return resolveDesktopMedia(path.basename(name));
}

function installCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [DESKTOP_CSP],
      },
    });
  });
}

function installAppProtocol(): void {
  const distRoot = path.join(app.getAppPath(), 'dist');
  protocol.handle(APP_SCHEME, (request) => {
    const file = packagedPageFile(distRoot, new URL(request.url).pathname, (candidate) => {
      try {
        return fs.statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
    if (file === null) return new Response(null, { status: 404 });
    return new Response(fs.readFileSync(file), {
      headers: { 'Content-Type': packagedContentType(file) },
    });
  });
}

function packagedContentType(file: string): string {
  switch (path.extname(file)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.woff2':
      return 'font/woff2';
    case '.json':
    case '.map':
      return 'application/json';
    case '.webmanifest':
      return 'application/manifest+json';
    case '.wasm':
      return 'application/wasm';
    case '.png':
      return 'image/png';
    default:
      return 'application/octet-stream';
  }
}

function installMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url);
    const filePath = mediaFile(url.pathname);
    if (!filePath || !fs.existsSync(filePath)) {
      return new Response(null, { status: 404 });
    }
    const total = fs.statSync(filePath).size;
    const slice = sliceForRange(total, request.headers.get('range'));
    if (slice.status === 416) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}` },
      });
    }
    const length = slice.end - slice.start + 1;
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(length),
    });
    if (slice.status === 206) {
      headers.set('Content-Range', `bytes ${slice.start}-${slice.end}/${total}`);
    }
    if (length === 0) {
      return new Response(null, { status: slice.status, headers });
    }
    const stream = fs.createReadStream(filePath, { start: slice.start, end: slice.end });
    return new Response(Readable.toWeb(stream) as unknown as BodyInit, {
      status: slice.status,
      headers,
    });
  });
}

let smokeSqliteUserDataFile: string | undefined;
const inFlightRequests = new Map<string, AbortController>();
/** Origins registered by main. IPC cannot add to this set. */
const allowedOutboundOrigins = new Set<string>();
/** Project roots registered by main (dialog or the smoke harness). IPC cannot add to this set. */
const allowedProjectFolders = new Set<string>();

function sqliteUserDataFile(): string {
  return smokeSqliteUserDataFile ?? path.join(app.getPath('userData'), 'user-data.sqlite');
}

function secretPath(): string {
  return path.join(app.getPath('userData'), 'preferences', 'secret.bin');
}

async function readStoredSecret(): Promise<string | null> {
  const file = secretPath();
  if (!fs.existsSync(file) || !(await safeStorage.isAsyncEncryptionAvailable())) return null;
  const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(fs.readFileSync(file));
  if (shouldReEncrypt) fs.writeFileSync(file, await safeStorage.encryptStringAsync(result));
  return result;
}

function handle<T extends unknown[]>(channel: string, listener: (...args: T) => unknown): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: T) => {
    void event;
    return listener(...args);
  });
}

async function runOutboundRequest(
  sender: WebContents,
  requestId: string,
  url: string,
): Promise<{ status: number; chunks: number; aborted: boolean }> {
  if (!isAllowedAiOutboundUrl(url, [...allowedOutboundOrigins])) {
    throw new Error('outbound url refused');
  }
  const secret = await readStoredSecret();
  if (!secret) throw new Error('missing secret');
  const controller = new AbortController();
  inFlightRequests.set(requestId, controller);
  let chunks = 0;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      redirect: 'error',
      signal: controller.signal,
    });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      while (true) {
        const step = await reader.read();
        if (step.done) break;
        const text = decoder.decode(step.value, { stream: true });
        if (text.length > 0) {
          chunks += 1;
          sender.send('skeleton:request-chunk', { requestId, chunk: text });
        }
      }
    }
    return { status: response.status, chunks, aborted: false };
  } catch (error) {
    if (controller.signal.aborted) {
      return { status: 0, chunks, aborted: true };
    }
    throw error;
  } finally {
    inFlightRequests.delete(requestId);
  }
}

async function settleThenOpen<T>(open: () => T): Promise<T> {
  await expireAndSweepAttachments(trashFile);
  const opened = open();
  await sweepCurrentAttachments(trashFile);
  return opened;
}

function openUserProjectSession(folder: string): { sessionId: string } {
  resetProjectTranscriptions();
  void stopLocalWhisper();
  const opened = openDesktopSession(folder, [...allowedProjectFolders], {
    dir: projectBackupDir(app.getPath('userData'), folder),
  });
  recoverProjectTranscriptions(opened.sessionId);
  return opened;
}

function registerIpc(): void {
  handle('skeleton:write-probe', (note: unknown) => {
    if (typeof note !== 'string' || note.length === 0) throw new Error('empty probe');
    return writeSkeletonProbe(app.getPath('temp'), note);
  });

  handle('desktop:open-session', async (folder: unknown) => {
    if (typeof folder !== 'string' || folder.length === 0) throw new Error('empty folder');
    const opened = await settleThenOpen(() => openUserProjectSession(folder));
    bindDesktopMediaSession(opened.sessionId);
    return opened;
  });

  handle('desktop:close-session', async (sessionId: unknown) => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('empty session');
    desktopSessionFolder(sessionId);
    resetProjectTranscriptions();
    void stopLocalWhisper();
    await expireAndSweepAttachments(trashFile);
    closeDesktopSession(sessionId);
    releaseDesktopMediaSession(sessionId);
    return { closed: true };
  });

  handle('desktop:media-url', (sessionId: unknown, mediaId: unknown) => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('empty session');
    if (typeof mediaId !== 'string' || mediaId.length === 0) throw new Error('empty media');
    return desktopMediaPlayUrl(sessionId, mediaId);
  });

  handle('desktop:list-backups', (sessionId: unknown) => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('empty session');
    const folder = desktopSessionFolder(sessionId);
    return {
      days: listDailyBackupDays(projectBackupDir(app.getPath('userData'), folder)),
    };
  });

  handle('desktop:restore-backup', async (sessionId: unknown, day: unknown) => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('empty session');
    if (typeof day !== 'string' || day.length === 0) throw new Error('empty backup day');
    const folder = desktopSessionFolder(sessionId);
    const picked = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    const destination = picked.filePaths[0];
    if (destination === undefined) return { cancelled: true };
    desktopSessionFolder(sessionId);
    restoreDailyBackup({
      backupDir: projectBackupDir(app.getPath('userData'), folder),
      day,
      destination,
    });
    grantRestoredProject(sessionId, destination);
    return { folder: destination };
  });

  handle('desktop:open-restored-backup', async (sessionId: unknown) => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('empty session');
    desktopSessionFolder(sessionId);
    const folder = readRestoredProjectGrant(sessionId);
    const resolved = path.resolve(folder);
    const alreadyAllowed = allowedProjectFolders.has(resolved);
    if (!alreadyAllowed) allowedProjectFolders.add(resolved);
    try {
      const opened = await settleThenOpen(() =>
        openPreparedDesktopSession(resolved, [...allowedProjectFolders], {
          dir: projectBackupDir(app.getPath('userData'), resolved),
        }),
      );
      resetProjectTranscriptions();
      void stopLocalWhisper();
      recoverProjectTranscriptions(opened.sessionId);
      bindDesktopMediaSession(opened.sessionId);
      return opened;
    } catch (error) {
      if (!alreadyAllowed) allowedProjectFolders.delete(resolved);
      throw error;
    }
  });

  handle('desktop:import-recording', async (sessionId: unknown) => {
    const picked = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Audio',
          extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'aiff', 'aif', 'caf', 'mp4'],
        },
      ],
    });
    const file = picked.filePaths[0];
    if (file === undefined) return { cancelled: true };
    let session = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null;
    let folder: string;
    if (session === null) {
      folder = projectFolderForNewImport(
        path.resolve(app.getPath('documents'), '解语'),
        path.basename(file, path.extname(file)),
        projectLibraryHeaderMatches,
      );
      fs.mkdirSync(path.dirname(folder), { recursive: true });
      allowedProjectFolders.add(folder);
      const opened = openUserProjectSession(folder);
      bindDesktopMediaSession(opened.sessionId);
      session = opened.sessionId;
    } else {
      folder = desktopSessionFolder(session);
    }
    const copied = await copyRecordingIntoProject(folder, file);
    const absolute = path.resolve(folder, copied.relpath);
    return {
      ...copied,
      sessionId: session,
      url: `jieyu-media://local/${grantDesktopMedia(session, absolute)}`,
    };
  });

  handle('desktop:choose-folder', async () => {
    const picked = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    const folder = picked.filePaths[0];
    if (folder === undefined) return { cancelled: true };
    const resolved = path.resolve(folder);
    allowedProjectFolders.add(resolved);
    const opened = openUserProjectSession(resolved);
    bindDesktopMediaSession(opened.sessionId);
    return opened;
  });

  handle('desktop:choose-import-file', async (sessionId: unknown) => {
    if (typeof sessionId !== 'string') throw new Error('empty session');
    desktopSessionFolder(sessionId);
    const picked = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Annotation',
          extensions: ['eaf', 'flextext', 'textgrid', 'toolbox', 'lift', 'jyb'],
        },
      ],
    });
    const file = picked.filePaths[0];
    if (file === undefined) return { cancelled: true };
    desktopSessionFolder(sessionId);
    const grantId = grantExchangePath(sessionId, file, 'import');
    const extension = path.extname(file).toLowerCase();
    // LIFT/JYB need no tier roles; other formats may supply an optional roles list (#429).
    if (extension === '.lift' || extension === '.jyb') return { grantId };
    const rolesPick = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Tier roles', extensions: ['txt'] }],
    });
    const roles = rolesPick.filePaths[0];
    if (roles === undefined) return { grantId };
    desktopSessionFolder(sessionId);
    return {
      grantId,
      rolesGrantId: grantExchangePath(sessionId, roles, 'import-roles'),
    };
  });

  handle('desktop:choose-export-file', async (sessionId: unknown, name: unknown) => {
    if (typeof sessionId !== 'string') throw new Error('empty session');
    if (typeof name !== 'string' || name.length === 0) throw new Error('empty export name');
    desktopSessionFolder(sessionId);
    const picked = await dialog.showSaveDialog({ defaultPath: name });
    if (picked.filePath === undefined) return { cancelled: true };
    desktopSessionFolder(sessionId);
    return { grantId: grantExchangePath(sessionId, picked.filePath, 'export') };
  });

  handle('desktop:choose-local-whisper', async (sessionId: unknown) => {
    if (typeof sessionId !== 'string') throw new Error('empty session');
    desktopSessionFolder(sessionId);
    const picked = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Whisper weights', extensions: ['bin'] }],
    });
    const file = picked.filePaths[0];
    if (file === undefined) return { cancelled: true };
    desktopSessionFolder(sessionId);
    // Development engine only until the signed per-platform binaries are bundled.
    const cli = app.isPackaged
      ? path.join(
          process.resourcesPath,
          'whisper',
          process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli',
        )
      : process.env.WHISPER_CLI;
    if (!cli) throw new Error('local whisper engine is unavailable');
    return startLocalWhisper(sessionId, file, cli);
  });

  handle('desktop:choose-transcription-model', async (sessionId: unknown) => {
    if (typeof sessionId !== 'string') throw new Error('empty session');
    desktopSessionFolder(sessionId);
    const picked = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Model declaration', extensions: ['json'] }],
    });
    const file = picked.filePaths[0];
    if (file === undefined) return { cancelled: true };
    desktopSessionFolder(sessionId);
    return grantTranscriptionModel(sessionId, file);
  });
  handle('desktop:transcribe-project', (sessionId: unknown, input: unknown) => {
    if (typeof sessionId !== 'string') throw new Error('empty session');
    return transcribeProject(sessionId, input as ProjectTranscriptionInput);
  });
  handle('desktop:cancel-project-transcription', (sessionId: unknown, requestId: unknown) => {
    if (typeof sessionId !== 'string' || typeof requestId !== 'string')
      throw new Error('empty request');
    cancelProjectTranscription(sessionId, requestId);
  });

  handle('desktop:call', (sessionId: unknown, method: unknown, args: unknown) => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('empty session');
    if (typeof method !== 'string' || method.length === 0) throw new Error('empty desktop call');
    return callDesktopSession(sessionId, method, args, trashFile);
  });

  handle('skeleton:open-project', (folder: unknown) => {
    if (typeof folder !== 'string' || folder.length === 0) throw new Error('empty folder');
    if (!isAllowedProjectFolder(folder, [...allowedProjectFolders])) {
      throw new Error('project folder refused');
    }
    const opened = openProjectFolder({
      folder,
      extraMarkers: [BAIDU_MARKER],
      userDataRoot: app.getPath('userData'),
    });
    if (opened.lock === 'busy') {
      return { ...opened, message: '已在别处打开' };
    }
    if (opened.warning === 'sync-folder') {
      return { ...opened, message: '文件夹在同步盘里，仍可继续' };
    }
    return opened;
  });

  handle('skeleton:store-secret', async (plain: unknown) => {
    if (typeof plain !== 'string' || plain.length === 0) throw new Error('empty secret');
    const refusal = secretStoreRefusal(
      await safeStorage.isAsyncEncryptionAvailable(),
      process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : null,
      SMOKE,
    );
    if (refusal === 'basic_text') {
      return { stored: false, reason: refusal, message: '系统没有可用的密钥环，未保存密钥' };
    }
    if (refusal) return { stored: false, reason: refusal };
    const file = secretPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await safeStorage.encryptStringAsync(plain));
    return { stored: true };
  });

  ipcMain.handle('skeleton:start-request', (event, requestId: unknown, url: unknown) => {
    if (typeof requestId !== 'string' || requestId.length === 0) throw new Error('empty requestId');
    if (typeof url !== 'string' || url.length === 0) throw new Error('empty url');
    return runOutboundRequest(event.sender, requestId, url);
  });

  handle('skeleton:abort-request', (requestId: unknown) => {
    if (typeof requestId !== 'string' || requestId.length === 0) throw new Error('empty requestId');
    const controller = inFlightRequests.get(requestId);
    if (!controller) return { aborted: false };
    controller.abort();
    return { aborted: true };
  });

  handle('skeleton:media-url', (name: unknown) => {
    if (typeof name !== 'string' || name.length === 0) throw new Error('empty media');
    return `${MEDIA_SCHEME}://local/${path.basename(name)}`;
  });

  if (sqliteStoragePortFlagEnabled(process.env.JIEYU_SQLITE_STORAGE_PORT)) {
    handle('storage:open', (folder: unknown) => {
      if (typeof folder !== 'string' || folder.length === 0) throw new Error('empty folder');
      if (!isAllowedProjectFolder(folder, [...allowedProjectFolders])) {
        throw new Error('project folder refused');
      }
      openLockedSqliteStorage({
        folder,
        userDataFile: sqliteUserDataFile(),
      });
      return { opened: true };
    });
    handle('storage:call', (method: unknown, args: unknown) => {
      if (typeof method !== 'string' || method.length === 0)
        throw new Error('empty storage method');
      if (!Array.isArray(args)) throw new Error('storage args must be a list');
      return callLockedSqliteStorage(method, args);
    });
    handle('storage:reopen', () => {
      reopenLockedSqliteStorage();
      return { reopened: true };
    });
  }
}

async function openWindow(): Promise<BrowserWindow> {
  const preload = path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.cjs');
  const win = new BrowserWindow({
    show: !process.argv.includes('--smoke') && !HIDE_WINDOW,
    webPreferences: {
      backgroundThrottling: !HIDE_WINDOW,
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  let loadedOnce = false;
  const windowId = win.webContents.id;
  win.webContents.on('did-finish-load', () => {
    if (!loadedOnce) {
      loadedOnce = true;
      return;
    }
    void expireAndSweepAttachments(trashFile).finally(() => {
      const abandoned = abandonDesktopSession();
      if (abandoned !== null) releaseDesktopMediaSession(abandoned);
    });
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // 渲染进程有未保存正文时会取消 beforeunload。先尝试保存；失败才问用户。
  let acceptingClose = false;
  let closeFlight: Promise<void> | null = null;
  win.webContents.on('will-prevent-unload', (event) => {
    if (acceptingClose) {
      event.preventDefault();
      return;
    }
    if (closeFlight !== null) return;
    // beforeunload is still on the stack. A timer lets the renderer run the flush.
    closeFlight = new Promise<void>((resolve) => {
      const onResult = (_event: IpcMainEvent, result: unknown) => {
        if (_event.sender !== win.webContents) return;
        ipcMain.removeListener('desktop:flush-close-result', onResult);
        void settleTextClose(win, String(result)).finally(resolve);
      };
      ipcMain.on('desktop:flush-close-result', onResult);
      setTimeout(() => {
        if (win.isDestroyed()) {
          ipcMain.removeListener('desktop:flush-close-result', onResult);
          resolve();
          return;
        }
        win.webContents.send('desktop:flush-close');
      }, 100);
    }).finally(() => {
      closeFlight = null;
      if (!win.isDestroyed()) resolveWindowDecision(windowId, false);
    });
  });

  const forceClose = () => {
    acceptingClose = true;
    win.close();
  };

  const settleTextClose = async (target: BrowserWindow, result: string): Promise<void> => {
    if (result === 'saved') {
      forceClose();
      return;
    }
    if (result === 'stay') return;
    const choice = dialog.showMessageBoxSync(target, {
      type: 'question',
      buttons:
        result === 'unknown'
          ? ['留在这里', '重试保存']
          : ['留在这里', '重试保存', '放弃修改并关闭'],
      defaultId: 0,
      cancelId: 0,
      message: '正文还没保存',
      detail:
        result === 'unknown'
          ? '还无法核实正文是否已保存，请重试核实。'
          : result === 'blocked'
            ? '这段修改还不能提交。'
            : '保存没有成功，这段修改还在。',
    });
    if (choice === 1) {
      const again = await new Promise<string>((resolve) => {
        const onResult = (_event: IpcMainEvent, next: unknown) => {
          if (_event.sender !== target.webContents) return;
          ipcMain.removeListener('desktop:flush-close-result', onResult);
          resolve(String(next));
        };
        ipcMain.on('desktop:flush-close-result', onResult);
        target.webContents.send('desktop:flush-close');
      });
      await settleTextClose(target, again);
      return;
    }
    if (choice !== 2 || result === 'unknown') return;
    const discarded = await new Promise<boolean>((resolve) => {
      const onResult = (event: IpcMainEvent, value: unknown) => {
        if (event.sender !== target.webContents) return;
        ipcMain.removeListener('desktop:flush-close-result', onResult);
        resolve(value === 'discarded');
      };
      ipcMain.on('desktop:flush-close-result', onResult);
      target.webContents.send('desktop:discard-close');
    });
    if (discarded) forceClose();
  };
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppNavigation(url, win.webContents.getURL())) event.preventDefault();
  });
  if (!app.isPackaged) {
    const devServer = process.env.JIEYU_VITE_DEV_SERVER;
    if (devServer && !process.argv.includes('--smoke')) {
      await win.loadURL(devServer);
      return win;
    }
    const indexHtml = path.join(process.cwd(), 'dist', 'index.html');
    if (!process.argv.includes('--smoke') && fs.existsSync(indexHtml)) {
      await win.loadFile(indexHtml);
      return win;
    }
  } else if (!process.argv.includes('--smoke')) {
    await win.loadURL(`${APP_SCHEME}://local/desktop-project`);
    return win;
  }
  const page = path.join(app.getPath('temp'), 'jieyu-skeleton-smoke.html');
  fs.writeFileSync(page, '<!doctype html><title>jieyu</title>');
  await win.loadFile(page);
  return win;
}

function startSmokeLoopback(expectedSecret: string): Promise<{
  baseUrl: string;
  sawExpectedAuth: () => boolean;
  close: () => Promise<void>;
}> {
  let matchedAuth = false;
  const server = http.createServer((req, res) => {
    if (req.headers.authorization === `Bearer ${expectedSecret}`) {
      matchedAuth = true;
    } else {
      res.writeHead(401).end('unauthorized');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    });
    res.write('chunk-1');
    const timer = setInterval(() => {
      if (!res.writableEnded) res.write('chunk-next');
    }, 25);
    req.on('close', () => clearInterval(timer));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        sawExpectedAuth: () => matchedAuth,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

async function runSmoke(win: BrowserWindow): Promise<void> {
  const secretValue = 'super-secret-value';
  const loopback = await startSmokeLoopback(secretValue);
  allowedOutboundOrigins.add(new URL(loopback.baseUrl).origin);
  try {
    const root = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'jieyu-smoke-'));
    const project = path.join(root, 'field');
    const synced = path.join(root, BAIDU_MARKER, 'field');
    fs.mkdirSync(project, { recursive: true });
    allowedProjectFolders.add(path.resolve(project));
    allowedProjectFolders.add(path.resolve(synced));
    writeProjectLibraryMarker(path.join(project, 'project.sqlite'));
    smokeSqliteUserDataFile = path.join(root, 'user-data.sqlite');
    const clip = path.join(mediaRoot(), 'clip.bin');
    fs.mkdirSync(mediaRoot(), { recursive: true });
    fs.writeFileSync(clip, 'abcdefgh');
    bindDesktopMediaSession('smoke-range');
    const clipToken = grantDesktopMedia('smoke-range', clip);
    // Keys saved before the async switch were written by the deprecated sync encryptString (gone in Electron 46).
    fs.mkdirSync(path.dirname(secretPath()), { recursive: true });
    fs.writeFileSync(secretPath(), safeStorage.encryptString('legacy-secret'));
    const legacySecret = await readStoredSecret();
    const script = `(async () => {
      const opened = await window.jieyuDesktop.openProject(${JSON.stringify(project)});
      const probe = await window.jieyuDesktop.writeProbe('ping');
      const busy = await window.jieyuDesktop.openProject(${JSON.stringify(project)});
      const synced = await window.jieyuDesktop.openProject(${JSON.stringify(synced)});
      const secret = await window.jieyuDesktop.storeSecret(${JSON.stringify(secretValue)});
      const streamed = [];
      const off = window.jieyuDesktop.onRequestChunk((event) => {
        if (event.requestId === 'req-smoke') {
          streamed.push(event.chunk);
          void window.jieyuDesktop.abortRequest('req-smoke');
        }
      });
      const outbound = await window.jieyuDesktop.startRequest(
        'req-smoke',
        ${JSON.stringify(`${loopback.baseUrl}/stream`)},
      );
      off();
      const mediaUrl = await window.jieyuDesktop.mediaUrl(${JSON.stringify(clipToken)});
      const mediaResponse = await fetch(mediaUrl, { headers: { Range: 'bytes=0-3' } });
      const turn = { conversationId: 'smoke-turn', createdAt: 1, expiresAt: 70, note: 'kept' };
      await window.jieyuDesktop.openStorage(${JSON.stringify(project)});
      await window.jieyuDesktop.storageCall('turns.putTurn', [turn]);
      await window.jieyuDesktop.reopenStorage();
      const storedTurn = await window.jieyuDesktop.storageCall('turns.getTurn', ['smoke-turn']);
      return {
        probe,
        opened,
        busy,
        synced,
        secret,
        outbound,
        streamed,
        media: { status: mediaResponse.status, body: await mediaResponse.text() },
        storedTurn,
      };
    })()`;
    const result = (await win.webContents.executeJavaScript(script, true)) as {
      probe: { id: number; note: string };
      opened: { lock: string };
      busy: { lock: string; message?: string };
      synced: { warning: string | null };
      secret: { stored?: boolean };
      outbound: { status: number; chunks: number; aborted: boolean };
      streamed: string[];
      media: { status: number; body: string };
      storedTurn: { conversationId?: string; note?: string };
    };
    const failures: string[] = [];
    if (legacySecret !== 'legacy-secret') failures.push('legacy-secret');
    if (result.probe.note !== 'ping') failures.push('probe');
    if (fileContainsProbeTable(path.join(project, 'project.sqlite')))
      failures.push('probe-touched-project');
    if (result.opened.lock !== 'acquired') failures.push('lock');
    if (result.busy.lock !== 'busy' || result.busy.message !== '已在别处打开')
      failures.push('second-window');
    if (result.synced.warning !== 'sync-folder') failures.push('sync-folder');
    if (result.secret.stored !== true) failures.push('secret');
    if (!loopback.sawExpectedAuth()) failures.push('outbound-auth');
    if (!result.outbound.aborted || !result.streamed.some((chunk) => chunk.includes('chunk-1'))) {
      failures.push('outbound-stream-abort');
    }
    const serialized = JSON.stringify({
      secret: result.secret,
      outbound: result.outbound,
      streamed: result.streamed,
    });
    if (serialized.includes(secretValue)) failures.push('secret-leaked');
    const file = secretPath();
    if (fs.existsSync(file) && fs.readFileSync(file).includes(secretValue)) {
      failures.push('secret-plaintext');
    }
    if (result.media.status !== 206 || result.media.body !== 'abcd') failures.push('range');
    if (result.storedTurn.conversationId !== 'smoke-turn' || result.storedTurn.note !== 'kept') {
      failures.push('storage-turn');
    }
    if (failures.length > 0) {
      console.error(failures.join(','), JSON.stringify(result));
      app.exit(1);
      return;
    }
    console.log('skeleton smoke ok');
    app.exit(0);
  } finally {
    allowedOutboundOrigins.clear();
    allowedProjectFolders.clear();
    closeLockedSqliteStorage();
    await loopback.close();
  }
}

async function chooseProject(): Promise<void> {
  const picked = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  const folder = picked.filePaths[0];
  if (!folder) return;
  allowedProjectFolders.add(path.resolve(folder));
  const opened = openProjectFolder({
    folder,
    extraMarkers: [BAIDU_MARKER],
    userDataRoot: app.getPath('userData'),
  });
  if (opened.lock === 'busy') {
    await dialog.showMessageBox({ message: '已在别处打开' });
    return;
  }
  if (opened.warning === 'sync-folder') {
    await dialog.showMessageBox({ message: '文件夹在同步盘里，仍可继续' });
  }
}

// Electron's default menu, except Minimize has no accelerator: ⌘M is "merge with next" (ADR-0107).
function installAppMenu(): void {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      {
        role: 'window',
        submenu: [
          { label: 'Minimize', click: (_item, win) => win?.minimize() },
          ...(isMac
            ? [
                { role: 'zoom' as const },
                { type: 'separator' as const },
                { role: 'front' as const },
              ]
            : [{ role: 'close' as const }]),
        ],
      },
    ]),
  );
}

app
  .whenReady()
  .then(async () => {
    installAppMenu();
    ensureUserDataLayout(app.getPath('userData'));
    configureDesktopDiagnosticStore(app.getPath('userData'));
    installCsp();
    installMediaProtocol();
    installAppProtocol();
    registerIpc();
    const win = await openWindow();
    if (process.argv.includes('--smoke')) {
      await runSmoke(win);
      return;
    }
    ipcMain.handle('skeleton:choose-project', () => chooseProject());
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void openWindow();
    });
  })
  .catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });

let quitting = false;
let quitFlight: Promise<void> | null = null;

function closeForQuit(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) return Promise.resolve(true);
  const id = win.webContents.id;
  const decision = awaitWindowDecision(id);
  win.once('closed', () => resolveWindowDecision(id, true));
  win.close();
  if (win.isDestroyed()) resolveWindowDecision(id, true);
  return decision;
}

app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  if (quitFlight !== null) return;
  const windows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed());
  quitFlight = quitAfterWindows(
    windows.map((win) => ({ close: () => closeForQuit(win) })),
    async () => {
      resetProjectTranscriptions();
      await stopLocalWhisper();
      resetDesktopSessions();
      resetDesktopMediaGrants();
    },
  )
    .then((closed) => {
      if (!closed) return;
      quitting = true;
      app.quit();
    })
    .finally(() => {
      quitFlight = null;
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !process.argv.includes('--smoke')) app.quit();
});
