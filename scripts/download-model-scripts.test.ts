/**
 * 模型下载脚本（BF1-N4）：校验不符的旧文件先删除；重新下载失败时报错退出且不留可加载的模型。
 * 另含守卫：仓库内 Silero 模型与脚本钉死的 sha256 / 字节数一致（移植自 vadPin.review.test.ts）。
 * Model download scripts (BF1-N4): a mismatching existing file is removed first; a failed
 * re-download exits non-zero and leaves no loadable model. Plus a guard that the committed Silero
 * model matches the script's pinned sha256 / size (ported from vadPin.review.test.ts).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/** PATH 里放一个总是失败的 curl | A curl on PATH that always fails (offline / 404) */
function failingCurlPath(): string {
  const bin = mkdtempSync(join(tmpdir(), 'fake-curl-'));
  const curl = join(bin, 'curl');
  writeFileSync(curl, '#!/usr/bin/env bash\necho "curl: (22) The requested URL returned error: 404" >&2\nexit 22\n');
  chmodSync(curl, 0o755);
  return `${bin}:${process.env.PATH ?? ''}`;
}

function runScript(script: string, destDir: string) {
  return spawnSync('bash', [join(ROOT, script)], {
    cwd: ROOT,
    env: { ...process.env, PATH: failingCurlPath(), DESTDIR: destDir },
    encoding: 'utf8',
  });
}

describe('download scripts remove a mismatching model (BF1-N4, BF2-3)', () => {
  it.each([
    ['scripts/download-silero-vad.sh', 'silero_vad.onnx'],
    [
      'scripts/download-whisper-model.sh',
      (JSON.parse(readFileSync(join(ROOT, 'src/tools/whisper-server/whisperModelDefaults.json'), 'utf8')) as {
        modelFile: string;
      }).modelFile,
    ],
  ])('%s: bad file + failed download -> exit 1, model absent, no quarantine copy left', (script, modelFile) => {
    const dest = mkdtempSync(join(tmpdir(), 'model-dest-'));
    writeFileSync(join(dest, modelFile), 'not the pinned model');
    const result = runScript(script, dest);
    expect(result.status).toBe(1);
    expect(existsSync(join(dest, modelFile))).toBe(false);
    // 不留隔离副本，临时下载文件也已清理 | no quarantine copy and no leftover temp download
    expect(readdirSync(dest)).toEqual([]);
    expect(result.stderr).toMatch(/removed/i);
  });
});

describe('committed Silero VAD model matches the pinned release', () => {
  it('sha256 and byte size match scripts/download-silero-vad.sh', () => {
    const script = readFileSync(join(ROOT, 'scripts/download-silero-vad.sh'), 'utf8');
    const sha = /EXPECTED_SHA256="([0-9a-f]{64})"/.exec(script)?.[1];
    const size = Number(/EXPECTED_BYTES=(\d+)/.exec(script)?.[1]);
    const bytes = readFileSync(join(ROOT, 'public/models/silero_vad.onnx'));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha);
    expect(bytes.length).toBe(size);
  });
});
