import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs guard script without type declarations
import { checkSpecResearchFilled } from './check-spec-research-filled.mjs';

let specsDir: string;

function writeSpec(slug: string, design: string) {
  const dir = join(specsDir, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'design.md'), design);
}

const filledResearch = `## 1. 成熟方案扫描 / Research

- 同类产品：VS Code 辅助侧栏成对 Detach/Dock。
- best practice：遵循 ARIA dialog 规范。
- 公认不可行：全屏覆盖模式（遮挡主内容）。
- 潜在坑：焦点陷阱缺失会破坏键盘可达性。
- 决定：**适配** —— 复用既有 Popover 模式。

## 2. 架构选择
`;

const placeholderResearch = `## 1. 成熟方案扫描 / Research（承接工作流 §5.1.5）

- 仓库既有最相似的模式：…
- 同类产品 / 标杆实现：…
- 决定：**复用 / 适配 / 自研** —— 理由 + 已知坑规避：…

## 2. 架构选择
`;

beforeEach(() => {
  specsDir = mkdtempSync(join(tmpdir(), 'jieyu-specs-'));
});

afterEach(() => {
  rmSync(specsDir, { recursive: true, force: true });
});

describe('checkSpecResearchFilled', () => {
  it('skips draft specs even when Research still has placeholders', () => {
    writeSpec('feat-a', `---\nstatus: draft\n---\n\n${placeholderResearch}`);
    expect(checkSpecResearchFilled(specsDir)).toEqual([]);
  });

  it('fails a non-draft spec whose Research §1 still has template placeholders', () => {
    writeSpec('feat-b', `---\nstatus: active\n---\n\n${placeholderResearch}`);
    const failures = checkSpecResearchFilled(specsDir);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('feat-b');
    expect(failures[0]).toContain('占位符');
  });

  it('passes a non-draft spec with a filled Research section', () => {
    writeSpec('feat-c', `---\nstatus: completed\n---\n\n${filledResearch}`);
    expect(checkSpecResearchFilled(specsDir)).toEqual([]);
  });

  it('grandfathers a non-draft spec that has no 成熟方案/Research §1 section', () => {
    writeSpec('legacy', `---\nstatus: completed\n---\n\n## 1. 设计约束\n\n- 仅项目实际约束：x\n`);
    expect(checkSpecResearchFilled(specsDir)).toEqual([]);
  });

  it('fails a non-draft spec with an empty Research section', () => {
    writeSpec('feat-d', `---\nstatus: active\n---\n\n## 1. 成熟方案扫描 / Research\n\n## 2. 架构\n`);
    const failures = checkSpecResearchFilled(specsDir);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('为空');
  });

  it('ignores the _template directory', () => {
    mkdirSync(join(specsDir, '_template'), { recursive: true });
    writeFileSync(
      join(specsDir, '_template', 'design.md'),
      `---\nstatus: draft\n---\n\n${placeholderResearch}`,
    );
    expect(checkSpecResearchFilled(specsDir)).toEqual([]);
  });
});
