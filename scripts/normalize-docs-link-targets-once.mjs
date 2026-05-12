/**
 * Occasional batch: normalize known-broken markdown link targets under docs/.
 * Run: node scripts/normalize-docs-link-targets-once.mjs && npm run report:docs-link-debt
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOCS = path.join(ROOT, 'docs');

const ABS_PREFIX = '/Users/junwei/Documents/百度网盘同步/Obsremote/（50）开发/Jieyu/';

/** @param {string} dir */
function* walkMarkdown(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkMarkdown(p);
      continue;
    }
    if (ent.isFile() && ent.name.endsWith('.md')) yield p;
  }
}

/** @param {string} filePath @param {Array<{from: string, to: string}>} rules */
function applyReplacements(filePath, rules) {
  let s = fs.readFileSync(filePath, 'utf8');
  const before = s;
  for (const { from, to } of rules) {
    s = s.split(from).join(to);
  }
  if (s !== before) {
    fs.writeFileSync(filePath, s, 'utf8');
    return true;
  }
  return false;
}

const deadSrcRewrites = [
  ['src/components/TranscriptionToolbarActions.tsx', 'src/pages/TranscriptionPage.ReadyWorkspace.tsx'],
  ['src/components/transcription/TranscriptionTimelineMediaLanes.tsx', 'src/components/TranscriptionTimelineHorizontalMediaLanes.tsx'],
  ['src/components/TranscriptionTimelineMediaLanes.tsx', 'src/components/TranscriptionTimelineHorizontalMediaLanes.tsx'],
  ['src/components/TranscriptionTimelineTextOnly.tsx', 'src/pages/TranscriptionPage.TimelineContent.tsx'],
  ['src/components/TranscriptionTimelineComparison.tsx', 'src/pages/TranscriptionPage.ReadyWorkspace.tsx'],
  ['src/components/TranscriptionTimelineComparison.test.tsx', 'src/components/TranscriptionTimelineHorizontalMediaLanes.test.tsx'],
  ['src/styles/pages/timeline/timeline-comparison.css', 'src/styles/pages/transcription-timeline.css'],
  ['src/services/TranslationLayerHostService.ts', 'src/hooks/transcription/useTranscriptionLayerActions.ts'],
  ['src/ai/eval/JudgeProvider.ts', 'src/ai/eval/citationJudge.ts'],
  ['src/data/generated/iso6393Seed.generated.ts', 'scripts/build-language-tag-mappings.mjs'],
  ['../../../../src/pages/index.ts', '../../../../src/App.tsx'],
  ['src/hooks/useTranscriptionSegmentBridgeController.ts', 'src/pages/useTranscriptionSegmentBridgeController.ts'],
];

const supersededDir = path.join(DOCS, 'execution/archive/planning-ai-agent-superseded');
const supersededRules = [
  { from: '](./F4-扩展入口-capability-isolation-epic-2026-05-01.md)', to: '](../../plans/F4-扩展入口-capability-isolation-epic-2026-05-01.md)' },
  { from: '](./F4-扩展入口-受控矩阵-2026-05-05.md)', to: '](../../plans/F4-扩展入口-受控矩阵-2026-05-05.md)' },
  { from: '](./语料库-产品定位与执行方案-2026-04-28.md)', to: '](../../plans/语料库-产品定位与执行方案-2026-04-28.md)' },
  { from: '](../archive/historical-root-docs/', to: '](../historical-root-docs/' },
  { from: '](../archive/milestone-records/', to: '](../milestone-records/' },
  { from: '(../archive/milestone-records/', to: '(../milestone-records/' },
  { from: '](../archive/manual-validation/', to: '](../manual-validation/' },
  { from: '](../../adr/', to: '](../../../adr/' },
  { from: '](../../architecture/', to: '](../../../architecture/' },
  { from: '](../release-gates/', to: '](../../release-gates/' },
  { from: '(../release-gates/', to: '(../../release-gates/' },
];

let touched = 0;
for (const filePath of walkMarkdown(DOCS)) {
  const rules = [{ from: ABS_PREFIX, to: '' }, { from: '[`git status`](git status)', to: '`git status`' }];
  for (const [from, to] of deadSrcRewrites) {
    rules.push({ from, to });
  }
  if (filePath.startsWith(supersededDir + path.sep)) {
    rules.push(...supersededRules);
  }
  if (applyReplacements(filePath, rules)) touched += 1;
}

console.log(`[normalize-docs-link-targets] updated ${touched} markdown file(s) under docs/`);
