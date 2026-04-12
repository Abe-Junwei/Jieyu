import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = process.cwd();
const metricEventLogPath = path.join(
  workspaceRoot,
  'docs',
  'execution',
  'audits',
  'M5-观测指标事件流水-v1.ndjson',
);

function getTodayDateLabel() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const markdownReportPath = path.join(
  workspaceRoot,
  'docs',
  'execution',
  'audits',
  `M5-观测趋势报告-v1-${getTodayDateLabel()}.md`,
);

function quantile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(ratio * sortedValues.length) - 1));
  return sortedValues[index] ?? 0;
}

function summarizeValues(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function safeNumber(value) {
  if (typeof value !== 'number') return NaN;
  if (!Number.isFinite(value)) return NaN;
  return value;
}

function parseMetricEvents(rawText) {
  const events = [];
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const value = safeNumber(parsed.value);
      if (typeof parsed.id !== 'string' || Number.isNaN(value)) continue;
      const tags = parsed.tags && typeof parsed.tags === 'object' ? parsed.tags : {};
      events.push({
        id: parsed.id,
        value,
        at: typeof parsed.at === 'string' ? parsed.at : '',
        tags,
      });
    } catch {
      // ignore malformed lines
    }
  }
  return events;
}

function groupEvents(events) {
  const grouped = new Map();
  for (const event of events) {
    const version = String(event.tags.version ?? 'unknown');
    const moduleName = String(event.tags.module ?? 'unknown');
    const environment = String(event.tags.environment ?? 'unknown');
    const dimensionKey = `${version}__${moduleName}__${environment}`;
    const metricKey = `${dimensionKey}__${event.id}`;
    const existing = grouped.get(metricKey);
    if (existing) {
      existing.values.push(event.value);
      existing.latestAt = existing.latestAt < event.at ? event.at : existing.latestAt;
    } else {
      grouped.set(metricKey, {
        id: event.id,
        version,
        moduleName,
        environment,
        values: [event.value],
        latestAt: event.at,
      });
    }
  }
  return [...grouped.values()];
}

function buildMarkdown(events, summaries) {
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];
  lines.push(`# M5 观测趋势报告 v1（${getTodayDateLabel()}）`);
  lines.push('');
  lines.push(`- 生成时间：${generatedAt}`);
  lines.push(`- 事件源：${path.relative(workspaceRoot, metricEventLogPath)}`);
  lines.push(`- 事件总数：${events.length}`);
  lines.push('');

  const mainPathRows = summaries
    .filter((item) => item.id === 'business.e2e.main_path_success_rate')
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt));

  lines.push('## 主路径成功率快照');
  lines.push('');
  if (mainPathRows.length === 0) {
    lines.push('- 当前无 `business.e2e.main_path_success_rate` 事件。');
  } else {
    const latest = mainPathRows[0];
    const latestSummary = summarizeValues(latest.values);
    lines.push(`- 最新维度：version=${latest.version}, module=${latest.moduleName}, environment=${latest.environment}`);
    lines.push(`- 最新样本窗口：count=${latestSummary.count}, p50=${latestSummary.p50.toFixed(4)}, p95=${latestSummary.p95.toFixed(4)}`);
    lines.push(`- 最新时间：${latest.latestAt || 'unknown'}`);
  }
  lines.push('');

  lines.push('## 分维度指标汇总');
  lines.push('');
  lines.push('| version | module | environment | metric id | count | p50 | p95 | min | max | latestAt |');
  lines.push('|---|---|---|---|---:|---:|---:|---:|---:|---|');

  const sorted = [...summaries].sort((left, right) => {
    if (left.version !== right.version) return left.version.localeCompare(right.version);
    if (left.moduleName !== right.moduleName) return left.moduleName.localeCompare(right.moduleName);
    if (left.environment !== right.environment) return left.environment.localeCompare(right.environment);
    return left.id.localeCompare(right.id);
  });

  for (const item of sorted) {
    const summary = summarizeValues(item.values);
    lines.push(
      `| ${item.version} | ${item.moduleName} | ${item.environment} | ${item.id} | ${summary.count} | ${summary.p50.toFixed(4)} | ${summary.p95.toFixed(4)} | ${summary.min.toFixed(4)} | ${summary.max.toFixed(4)} | ${item.latestAt || 'unknown'} |`,
    );
  }

  lines.push('');
  lines.push('## 判读说明');
  lines.push('');
  lines.push('1. 该报告按 version/module/environment 三维分组后再按 metric id 汇总。');
  lines.push('2. `business.e2e.main_path_success_rate` 推荐长期观察阈值为 >= 0.99。');
  lines.push('3. 若某指标仅 1 条样本，p50 与 p95 将等于该样本值。');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const raw = await readFile(metricEventLogPath, 'utf8');
  const events = parseMetricEvents(raw);
  if (events.length === 0) {
    throw new Error('No valid metric events found; cannot generate trend report.');
  }
  const summaries = groupEvents(events);
  const markdown = buildMarkdown(events, summaries);
  await mkdir(path.dirname(markdownReportPath), { recursive: true });
  await writeFile(markdownReportPath, markdown, 'utf8');
  console.log(`[m5-trend] Report written: ${path.relative(workspaceRoot, markdownReportPath)}`);
}

main().catch((error) => {
  console.error('[m5-trend] Failed to generate trend report:', error);
  process.exitCode = 1;
});
