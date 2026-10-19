/**
 * 起一个子进程，等它在标准输出里打出 ready，就用 SIGKILL 杀掉。
 * 子进程要在打出 ready 之后自己停住，不能先退出。
 */
import { spawn } from 'node:child_process';

export function killWhenReady(childFile, { env = {}, nodeArgs = ['--experimental-sqlite'] } = {}) {
  const child = spawn(process.execPath, [...nodeArgs, childFile], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
      if (output.includes('ready')) child.kill('SIGKILL');
    });
    child.on('exit', (code, signal) => {
      if (signal === 'SIGKILL') resolve();
      else reject(new Error(`expected SIGKILL, got ${signal ?? code}: ${output}`));
    });
  });
}
