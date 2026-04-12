import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'src/observability/metrics.ts',
  'src/observability/metrics.test.ts',
  'scripts/report-m5-mainpath-success-rate.mjs',
  'scripts/generate-m5-observability-trend-report.mjs',
  'docs/execution/audits/M5-观测指标事件流水-v1.ndjson',
  'docs/execution/plans/M5-执行记录-2026-04-12.md',
  'docs/execution/release-gates/M5-观测门禁清单-2026-04-12.md',
  'docs/execution/audits/M5-质量仪表盘-v1-数据定义-2026-04-12.md',
];

const requiredMetricIds = [
  'ai.chat.first_token_latency_ms',
  'business.transcription.segment_action_latency_ms',
  'business.e2e.main_path_success_rate',
  'ux.web_vitals.lcp_ms',
];

const missingFiles = requiredFiles.filter((relativePath) => !existsSync(path.resolve(root, relativePath)));
if (missingFiles.length > 0) {
  console.error('[check-m5-observability-foundation] Missing required files:');
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const metricCatalogSource = readFileSync(path.resolve(root, 'src/observability/metrics.ts'), 'utf8');
const missingMetricIds = requiredMetricIds.filter((metricId) => !metricCatalogSource.includes(metricId));
if (missingMetricIds.length > 0) {
  console.error('[check-m5-observability-foundation] Missing required metric ids in catalog:');
  for (const metricId of missingMetricIds) {
    console.error(`- ${metricId}`);
  }
  process.exit(1);
}

console.log(`[check-m5-observability-foundation] OK: ${requiredFiles.length} required files and ${requiredMetricIds.length} required metrics.`);
