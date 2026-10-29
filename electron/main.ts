import { app, BrowserWindow, dialog, ipcMain, protocol, safeStorage, session } from 'electron';
import type { IpcMainInvokeEvent, WebContents } from 'electron';
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
import { cancelModelTranscribe, runModelTranscribe } from '../src/desktop/modelHost';
import { trashFile } from './trashFile';
import { listDailyBackupDays, restoreDailyBackup } from '../src/db/desktop/dailyBackup';
import { ensureBundledSample, SAMPLE_PROJECT_DIRNAME } from '../src/db/desktop/sampleProject';
import { desktopMediaPlayUrl } from '../src/db/desktop/mediaUrl';
import {
  closeDesktopSession,
  desktopSessionFolder,
  openDesktopSession,
  resetDesktopSessions,
} from '../src/db/desktop/projectSession';
import { DESKTOP_CSP } from '../src/desktop/skeleton/desktopCsp';
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
  releaseDesktopMediaSession,
  resetDesktopMediaGrants,
  resolveDesktopMedia,
} from '../src/desktop/skeleton/desktopMediaGrant';
import { fileContainsProbeTable, writeSkeletonProbe } from '../src/desktop/skeleton/probeStore';
import { sqliteStoragePortFlagEnabled } from '../src/desktop/skeleton/sqliteStoragePortFlag';
import {
  ensureProjectBackupDir,
  ensureUserDataLayout,
  projectBackupKey,
} from '../src/desktop/skeleton/userDataLayout';

const userDataDir = process.env.JIEYU_DESKTOP_USER_DATA;
if (typeof userDataDir === 'string' && userDataDir.length > 0) {
  app.setPath('userData', userDataDir);
}

const SMOKE = process.argv.includes('--smoke');
// Linux CI has no secret service; only the smoke run may fall back to the hardcoded-password store.
if (SMOKE) {
  app.commandLine.appendSwitch('password-store', 'basic');
  if (process.platform === 'linux') safeStorage.setUsePlainTextEncryption(true);
}

const BAIDU_MARKER = '百度网盘';
const MEDIA_SCHEME = 'jieyu-media';

protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

function mediaRoot(): string {
  return path.join(app.getPath('temp'), 'jieyu-skeleton-media');
}

function mediaFile(name: string): string | null {
  const granted = resolveDesktopMedia(path.basename(name));
  if (granted) return granted;
  const root = path.resolve(mediaRoot());
  const filePath = path.resolve(root, path.basename(name));
  const relative = path.relative(root, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return filePath;
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

function openUserProjectSession(folder: string): { sessionId: string } {
  return openDesktopSession(folder, [...allowedProjectFolders], {
    dir: ensureProjectBackupDir(app.getPath('userData'), projectBackupKey(folder)),
  });
}

function registerIpc(): void {
  handle('skeleton:write-probe', (note: unknown) => {
    if (typeof note !== 'string' || note.length === 0) throw new Error('empty probe');
    return writeSkeletonProbe(app.getPath('temp'), note);
  });

  handle('desktop:open-session', (folder: unknown) => {
    if (typeof folder !== 'string' || folder.length === 0) throw new Error('empty folder');
    const opened = openUserProjectSession(folder);
    bindDesktopMediaSession(opened.sessionId);
    return opened;
  });

  handle('desktop:close-session', (sessionId: unknown) => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('empty session');
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
      days: listDailyBackupDays(
        ensureProjectBackupDir(app.getPath('userData'), path.basename(folder)),
      ),
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
    restoreDailyBackup({
      backupDir: ensureProjectBackupDir(app.getPath('userData'), path.basename(folder)),
      day,
      destination,
    });
    return { folder: destination };
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

  handle('desktop:choose-import-file', async () => {
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
    const extension = path.extname(file).toLowerCase();
    // LIFT/JYB need no tier roles; other formats may supply an optional roles list (#429).
    if (extension === '.lift' || extension === '.jyb') return { file };
    const rolesPick = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Tier roles', extensions: ['txt'] }],
    });
    const roles = rolesPick.filePaths[0];
    return roles === undefined ? { file } : { file, roles };
  });

  handle('desktop:choose-export-file', async (name: unknown) => {
    if (typeof name !== 'string' || name.length === 0) throw new Error('empty export name');
    const picked = await dialog.showSaveDialog({ defaultPath: name });
    if (picked.filePath === undefined) return { cancelled: true };
    return { file: picked.filePath };
  });

  handle('model:transcribe', (input: unknown) => runModelTranscribe(input));
  handle('model:cancel', (requestId: unknown) => {
    if (typeof requestId !== 'string' || requestId.length === 0) {
      throw new Error('empty model request');
    }
    cancelModelTranscribe(requestId);
    return { cancelled: true };
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
    show: !process.argv.includes('--smoke'),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppNavigation(url, win.webContents.getURL())) event.preventDefault();
  });
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
    fs.mkdirSync(mediaRoot(), { recursive: true });
    fs.writeFileSync(path.join(mediaRoot(), 'clip.bin'), 'abcdefgh');
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
      const mediaUrl = await window.jieyuDesktop.mediaUrl('clip.bin');
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

app
  .whenReady()
  .then(async () => {
    ensureUserDataLayout(app.getPath('userData'));
    installCsp();
    installMediaProtocol();
    registerIpc();
    const win = await openWindow();
    if (process.argv.includes('--smoke')) {
      await runSmoke(win);
      return;
    }
    try {
      ensureBundledSample(path.join(app.getPath('userData'), SAMPLE_PROJECT_DIRNAME));
    } catch (error) {
      console.error(error);
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

app.on('before-quit', () => {
  resetDesktopSessions();
  resetDesktopMediaGrants();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !process.argv.includes('--smoke')) app.quit();
});
