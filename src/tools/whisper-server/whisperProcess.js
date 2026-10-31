import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildWhisperCliArgs, parseWhisperCliJson } from './whisperCliJson.js';

const children = new Set();
export function stopWhisperProcesses() {
  for (const child of children) child.kill('SIGKILL');
}

/** One private output directory per invocation; stderr is never returned as user data. */
export async function runWhisper({ audioPath, model, language, signal, whisperCli, threads = 4 }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'jieyu-whisper-output-'));
  let proc;
  let killTimer;
  const abort = () => {
    proc?.kill('SIGTERM');
    killTimer ??= setTimeout(() => proc?.kill('SIGKILL'), 1000);
    killTimer.unref();
  };
  try {
    signal?.throwIfAborted();
    const outputBase = path.join(dir, 'result');
    await new Promise((resolve, reject) => {
      proc = spawn(
        whisperCli,
        buildWhisperCliArgs({ model, language, audioPath, outputBase, threads }),
        {
          stdio: 'ignore',
          windowsHide: true,
        },
      );
      children.add(proc);
      proc.once('close', () => children.delete(proc));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      proc.once('error', () => reject(new Error('whisper process failed')));
      proc.once('close', (code) =>
        code === 0 ? resolve() : reject(new Error('whisper process failed')),
      );
    });
    signal?.throwIfAborted();
    if ((await stat(`${outputBase}.json`)).size > 8 * 1024 * 1024)
      throw new Error('whisper output is too large');
    return parseWhisperCliJson(await readFile(`${outputBase}.json`, 'utf8'));
  } finally {
    signal?.removeEventListener('abort', abort);
    clearTimeout(killTimer);
    await rm(dir, { recursive: true, force: true });
  }
}
