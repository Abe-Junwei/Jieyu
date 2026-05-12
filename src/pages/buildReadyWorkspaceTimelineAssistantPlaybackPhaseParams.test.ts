/**
 * Lock-in 测试：playback 阶段必须从 pre / domainShell 注入 toggleNotes 与 setShowSearch，
 * 不得回退成 `data.toggleNotes` / `data.setShowSearch`（`useTranscriptionData` 不暴露这两个 UI 入口；
 * 历史回归参见 docs/execution/release-gates/对外前最小检查-2026-05-11.md 2026-05-12 条目）。
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE_PATH = path.resolve(
  __dirname,
  'buildReadyWorkspaceTimelineAssistantPlaybackPhaseParams.ts',
);

function readPlaybackBlock(): string {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');
  const start = source.indexOf('playback: {');
  expect(start, 'playback: { ... } block must exist').toBeGreaterThan(-1);

  let depth = 0;
  let end = -1;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  expect(end, 'playback block must be properly closed').toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('buildReadyWorkspaceTimelineAssistantPlaybackPhaseParams — UI-action wiring lock', () => {
  const playback = readPlaybackBlock();

  it('routes toggleNotes from pre (useNoteHandlers), not from data', () => {
    expect(playback).toMatch(/\btoggleNotes:\s*pre\.toggleNotes\b/);
    expect(playback).not.toMatch(/\btoggleNotes:\s*data\./);
  });

  it('routes setShowSearch from domainShell (useTranscriptionShellController), not from data', () => {
    expect(playback).toMatch(/\bsetShowSearch:\s*domainShell\.setShowSearch\b/);
    expect(playback).not.toMatch(/\bsetShowSearch:\s*data\./);
  });
});
