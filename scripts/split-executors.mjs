import fs from 'node:fs';

const SRC = 'src/ai/chat/localContextToolExecutors.ts';
const ANALYTICS = 'src/ai/chat/localContextToolExecutors.analytics.ts';
const SEARCH = 'src/ai/chat/localContextToolExecutors.search.ts';

const source = fs.readFileSync(SRC, 'utf8');
const lines = source.split('\n');

// 函数边界（基于 grep 结果，0-indexed）
const fnLines = {
  getProjectStats: 679 - 1,           // line 679
  findIncompleteUnitsWithSnapshots: 800 - 1,
  batchApplyWithSnapshots: 859 - 1,
  diagnoseQualityWithSnapshots: 929 - 1,
  searchUnits: 991 - 1,
  sortNormalizedUnitRows: 1108 - 1,
  executeLocalContextToolCall: 1701 - 1,
};

// 前 78 行是 import + 小型 normalize 函数
const headerEnd = 78; // line 78

// 提取 header（import + normalize 函数）
const header = lines.slice(0, headerEnd + 1).join('\n');

// 提取 analytics 区段：getProjectStats ~ diagnoseQualityWithSnapshots
const analyticsStart = fnLines.getProjectStats;
const analyticsEnd = fnLines.searchUnits - 1; // searchUnits 开始之前
const analyticsBody = lines.slice(analyticsStart, analyticsEnd + 1).join('\n');

// 提取 search 区段：searchUnits ~ sortNormalizedUnitRows 结束
// sortNormalizedUnitRows 后面跟着 executeLocalContextToolCall 或其他函数
const searchStart = fnLines.searchUnits;
const searchEnd = fnLines.executeLocalContextToolCall - 1;
const searchBody = lines.slice(searchStart, searchEnd + 1).join('\n');

// 保留在主文件中的：header + 中间函数 + executeLocalContextToolCall
const middleStart = headerEnd + 1;
const middleEnd = fnLines.getProjectStats - 1;
const middleBody = lines.slice(middleStart, middleEnd + 1).join('\n');

const execBody = lines.slice(fnLines.executeLocalContextToolCall).join('\n');

// 写 analytics 文件
const analyticsImports = `import type { AiPromptContext, LocalContextToolResult } from './chatDomain.types';
import { WorkspaceReadModelService, SegmentMetaService } from '../../services/segmentMetaService';
import { getDb } from '../../db';
import { createLogger } from '../../observability/logger';

const log = createLogger('localContextTools.analytics');

// Re-export helpers (copied to avoid circular deps)
function normalizeTextValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function normalizeLimit(value: unknown, fallback = 5): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : fallback;
  if (Number.isNaN(n) || n < 1) return fallback;
  if (n > 100) return 100;
  return n;
}
function normalizeBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return /^(true|yes|1|on)$/i.test(value);
  return fallback;
}
function normalizeOffset(value: unknown, fallback = 0, maxOffset = 10000): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : fallback;
  if (Number.isNaN(n) || n < 0) return fallback;
  if (n > maxOffset) return maxOffset;
  return n;
}
`;

const analyticsFile = `${analyticsImports}\n${analyticsBody}\n`;

// 写 search 文件
const searchImports = `import type { AiPromptContext, LocalContextToolResult } from './chatDomain.types';
import { SegmentMetaService } from '../../services/segmentMetaService';
import { createLogger } from '../../observability/logger';
import { resolveSegmentMetaScopeParams, mapSegmentMetaRows, loadNormalizedUnitRows, normalizeTextValue, normalizeLimit, normalizeBoolean, normalizeLayerTypeFilter } from './localContextToolExecutors';

const log = createLogger('localContextTools.search');
`;

const searchFile = `${searchImports}\n${searchBody}\n`;

// 重写主文件
const mainImports = `import { getProjectStats, findIncompleteUnitsWithSnapshots, batchApplyWithSnapshots, diagnoseQualityWithSnapshots } from './localContextToolExecutors.analytics';
import { searchUnits, sortNormalizedUnitRows } from './localContextToolExecutors.search';
`;

// 把 import 插入到现有的 import 块之后
const importEnd = lines.findIndex((l) => l.includes("const log = createLogger('localContextTools')"));
const beforeImport = lines.slice(0, importEnd + 1).join('\n');
const afterImport = lines.slice(importEnd + 1, headerEnd + 1).join('\n');

const mainFile = `${beforeImport}\n${mainImports}\n${afterImport}\n${middleBody}\n${execBody}`;

fs.writeFileSync(ANALYTICS, analyticsFile);
fs.writeFileSync(SEARCH, searchFile);
fs.writeFileSync(SRC, mainFile);

console.log('Done. File sizes:');
console.log(`  ${SRC}: ${mainFile.split('\n').length} lines`);
console.log(`  ${ANALYTICS}: ${analyticsFile.split('\n').length} lines`);
console.log(`  ${SEARCH}: ${searchFile.split('\n').length} lines`);
