import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs guard script without type declarations
import { evaluateR1R8Gate, isR1R8TriggerPath, matchR1R8TriggerFiles, parseR1R8Checklist, R1_R8_ITEMS } from './check-r1-r8-cross-page.mjs';

const COMPLETE_BODY = `
## R1–R8 三页联评
- [x] **R1** 词汇标签分轨
- [x] **R2** 写库边界
- [x] **R3** 只读路径
- [x] **R4** AI 分区
- [x] **R5** 导出分轨
- [X] **R6** 深链语义
- [x] **R7** 增量刷新
- [x] **R8** 往返上下文
`;

const NA_BODY = `
- [ ] **R1** 词汇标签分轨 — N/A：未改词典文案
- [ ] **R2** 写库边界 — N/A：未改语料写路径
- [ ] **R3** 只读路径 — N/A：本 PR 仅脚本
- [ ] **R4** AI 分区 — N/A
- [ ] **R5** 导出分轨 — n/a：未改导出
- [ ] **R6** 深链语义 — N/A：
- [ ] **R7** 增量刷新 — N/A：未接线事件
- [ ] **R8** 往返上下文 — N/A：未改深链
`;

describe('isR1R8TriggerPath', () => {
  it('matches annotation / lexicon / corpus product paths', () => {
    expect(isR1R8TriggerPath('src/pages/AnnotationPage.tsx')).toBe(true);
    expect(isR1R8TriggerPath('src/pages/annotation/AnnotationIgtRow.tsx')).toBe(true);
    expect(isR1R8TriggerPath('src/pages/useAnnotationWorkspaceController.ts')).toBe(true);
    expect(isR1R8TriggerPath('src/pages/LexiconPage.tsx')).toBe(true);
    expect(isR1R8TriggerPath('src/pages/useLexiconAttachmentController.ts')).toBe(true);
    expect(isR1R8TriggerPath('src/hooks/lexicon/useLexiconSearch.ts')).toBe(true);
    expect(isR1R8TriggerPath('src/pages/CorpusLibraryPage.tsx')).toBe(true);
    expect(isR1R8TriggerPath('src/pages/corpusBasketSession.ts')).toBe(true);
    expect(isR1R8TriggerPath('src/pages/useCorpusLibraryController.ts')).toBe(true);
    expect(isR1R8TriggerPath('src/utils/workspaceReturnDeepLink.ts')).toBe(true);
    expect(isR1R8TriggerPath('src/utils/appShellEvents.ts')).toBe(true);
    expect(isR1R8TriggerPath('src/services/corpusUnitIndexQuery.ts')).toBe(true);
    expect(isR1R8TriggerPath('src/services/linguisticServiceLexemeOps.ts')).toBe(true);
    expect(isR1R8TriggerPath('src/components/WorkspaceReturnBanner.tsx')).toBe(true);
    expect(isR1R8TriggerPath('src/styles/pages/annotation-workspace.css')).toBe(true);
  });

  it('does not match gate bootstrap / docs / flags / transcription AI', () => {
    expect(isR1R8TriggerPath('scripts/check-r1-r8-cross-page.mjs')).toBe(false);
    expect(isR1R8TriggerPath('.github/pull_request_template.md')).toBe(false);
    expect(isR1R8TriggerPath('docs/execution/plans/三页联动最小落地计划书-2026-04-22.md')).toBe(false);
    expect(isR1R8TriggerPath('src/featureFlags.ts')).toBe(false);
    expect(isR1R8TriggerPath('src/components/AnnotationImportMismatchDialog.tsx')).toBe(false);
    expect(isR1R8TriggerPath('src/ai/vertical/corpusSourceSet.ts')).toBe(false);
    expect(isR1R8TriggerPath('src/pages/TranscriptionPage.tsx')).toBe(false);
  });
});

describe('matchR1R8TriggerFiles', () => {
  it('returns only triggering paths from a mixed diff', () => {
    expect(
      matchR1R8TriggerFiles([
        'scripts/check-r1-r8-cross-page.mjs',
        'src/pages/LexiconPage.tsx',
        'CHANGELOG.md',
      ]),
    ).toEqual(['src/pages/LexiconPage.tsx']);
  });
});

describe('parseR1R8Checklist', () => {
  it('accepts checked boxes', () => {
    const parsed = parseR1R8Checklist(COMPLETE_BODY);
    for (const id of R1_R8_ITEMS) {
      expect(parsed[id].status).toBe('ok');
    }
  });

  it('accepts N/A on unchecked lines', () => {
    const parsed = parseR1R8Checklist(NA_BODY);
    for (const id of R1_R8_ITEMS) {
      expect(parsed[id].status).toBe('ok');
      expect(parsed[id].na).toBe(true);
    }
  });

  it('fails missing and unchecked-without-N/A items', () => {
    const parsed = parseR1R8Checklist(`
- [ ] **R1** 词汇标签分轨
- [x] **R2** 写库边界
`);
    expect(parsed.R1.status).toBe('unchecked');
    expect(parsed.R2.status).toBe('ok');
    expect(parsed.R3.status).toBe('missing');
    expect(parsed.R8.status).toBe('missing');
  });

  it('does not treat R10 as R1, and ignores heading-only R1 when a later line is ok', () => {
    const parsed = parseR1R8Checklist(`
## R1–R8 三页联评
R10 leftover
- [x] **R1** 词汇标签分轨
- [x] **R2** a
- [x] **R3** a
- [x] **R4** a
- [x] **R5** a
- [x] **R6** a
- [x] **R7** a
- [x] **R8** a
`);
    expect(parsed.R1.status).toBe('ok');
  });

  it('does not treat intro copy or r1-r8 anchors as a completed R1/R8 row', () => {
    const parsed = parseR1R8Checklist(`
命中路径时必须逐项勾选 \`[x]\`，或写明 \`N/A\`。锚点 #r1-r8-cross-page-checklist。门禁：\`npm run check:r1-r8\`。
## R1–R8 三页联评
- [ ] **R1** 词汇标签分轨
- [ ] **R8** 往返上下文
`);
    expect(parsed.R1.status).toBe('unchecked');
    expect(parsed.R8.status).toBe('unchecked');
  });
});

describe('evaluateR1R8Gate', () => {
  it('skips push events', () => {
    const result = evaluateR1R8Gate({
      files: ['src/pages/LexiconPage.tsx'],
      body: '',
      eventName: 'push',
      enforce: true,
    });
    expect(result.verdict).toBe('skip');
  });

  it('skips when no trigger paths are present', () => {
    const result = evaluateR1R8Gate({
      files: ['scripts/check-r1-r8-cross-page.mjs', 'docs/execution/plans/foo.md'],
      body: '',
      eventName: 'pull_request',
      enforce: true,
    });
    expect(result.verdict).toBe('skip');
    expect(result.triggerFiles).toEqual([]);
  });

  it('fails CI PRs that hit trigger paths without a checklist', () => {
    const result = evaluateR1R8Gate({
      files: ['src/pages/AnnotationPage.tsx'],
      body: '',
      eventName: 'pull_request',
      enforce: true,
    });
    expect(result.verdict).toBe('fail');
  });

  it('skips local runs with trigger paths but no body', () => {
    const result = evaluateR1R8Gate({
      files: ['src/pages/AnnotationPage.tsx'],
      body: '',
      eventName: 'local',
      enforce: false,
    });
    expect(result.verdict).toBe('skip');
  });

  it('passes when every item is ticked or N/A', () => {
    expect(
      evaluateR1R8Gate({
        files: ['src/pages/CorpusLibraryPage.tsx'],
        body: COMPLETE_BODY,
        eventName: 'pull_request',
        enforce: true,
      }).verdict,
    ).toBe('pass');
    expect(
      evaluateR1R8Gate({
        files: ['src/utils/workspaceReturnDeepLink.ts'],
        body: NA_BODY,
        eventName: 'pull_request',
        enforce: true,
      }).verdict,
    ).toBe('pass');
  });

  it('fails when a triggered PR leaves an item unchecked', () => {
    const result = evaluateR1R8Gate({
      files: ['src/pages/useLexiconAttachmentController.ts'],
      body: `
- [x] **R1** a
- [ ] **R2** b
- [x] **R3** a
- [x] **R4** a
- [x] **R5** a
- [x] **R6** a
- [x] **R7** a
- [x] **R8** a
`,
      eventName: 'pull_request',
      enforce: true,
    });
    expect(result.verdict).toBe('fail');
    expect(result.reason).toContain('R2=unchecked');
  });

  it('fails the stock PR template on a three-page product diff (no pre-filled N/A)', () => {
    const template = readFileSync('.github/pull_request_template.md', 'utf8');
    const result = evaluateR1R8Gate({
      files: ['src/pages/LexiconPage.tsx'],
      body: template,
      eventName: 'pull_request',
      enforce: true,
    });
    expect(result.verdict).toBe('fail');
  });
});
