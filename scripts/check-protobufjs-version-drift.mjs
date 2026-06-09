import { spawnSync } from 'child_process';

/**
 * P1 依赖风险：检测 protobufjs 版本漂移。
 * P1 dependency risk: detect protobufjs version drift.
 *
 * 策略（ADR 0031）：
 * Policy (ADR 0031):
 * - @opentelemetry/otlp-transformer 嵌套路径必须 >= 8.2.0（override 保障）。
 * - @opentelemetry/otlp-transformer nested path must be >= 8.2.0 (guarded by override).
 * - 其余路径（如 onnxruntime-web）允许 7.5.8+（ADR 声明该线已修复 CVE）。
 * - Other paths such as onnxruntime-web allow 7.5.8+ (ADR states that line has the CVE fix).
 * - 任何 < 7.5.8 的实例视为高风险漂移。
 * - Any instance < 7.5.8 is treated as high-risk drift.
 */

const OTEL_MIN_VERSION = [8, 2, 0];
const ONNXRUNTIME_MIN_VERSION = [7, 5, 8];
const OTHER_MIN_VERSION = [7, 5, 8];

function parseSemver(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return { major, minor, patch };
}

function isLessThan(v, targetMajor, targetMinor, targetPatch) {
  const { major, minor, patch } = parseSemver(v);
  if (major !== targetMajor) return major < targetMajor;
  if (minor !== targetMinor) return minor < targetMinor;
  return patch < targetPatch;
}

function collectProtobufjs(node, pathPrefix, results = []) {
  for (const [depName, depNode] of Object.entries(node.dependencies || {})) {
    const currentPath = pathPrefix ? `${pathPrefix} > ${depName}` : depName;
    if (depName === 'protobufjs' && depNode.version) {
      results.push({
        version: depNode.version,
        path: currentPath,
        overridden: depNode.overridden ?? false,
      });
    }
    collectProtobufjs(depNode, currentPath, results);
  }
  return results;
}

function classifyInstance(inst) {
  if (inst.path.includes('@opentelemetry') || inst.path.includes('otlp-transformer')) {
    return 'OTEL path';
  }
  if (inst.path.includes('onnxruntime-web')) {
    return 'onnxruntime-web path';
  }
  return 'Other path';
}

function formatMinVersion([major, minor, patch]) {
  return `${major}.${minor}.${patch}`;
}

const result = spawnSync('npm', ['ls', 'protobufjs', '--all', '--json'], {
  encoding: 'utf-8',
});

let tree;
try {
  tree = JSON.parse(result.stdout);
} catch {
  console.error('[check-protobufjs] Failed to parse npm ls output');
  process.exit(1);
}

if (tree.error && (!tree.dependencies || Object.keys(tree.dependencies).length === 0)) {
  console.error('[check-protobufjs] npm ls reported an error and no dependency tree available');
  process.exit(1);
}

const instances = collectProtobufjs(tree, '');

if (instances.length === 0) {
  console.error('[check-protobufjs] No protobufjs instances found in dependency tree');
  process.exit(1);
}

const violations = [];
const groupedInstances = new Map();

for (const inst of instances) {
  const classification = classifyInstance(inst);
  const existingGroup = groupedInstances.get(classification) ?? [];
  existingGroup.push(inst);
  groupedInstances.set(classification, existingGroup);

  if (classification === 'OTEL path') {
    if (isLessThan(inst.version, ...OTEL_MIN_VERSION)) {
      violations.push({
        ...inst,
        classification,
        reason: `OTEL path must be >= ${formatMinVersion(OTEL_MIN_VERSION)} (ADR 0031)`,
      });
    }
  } else if (classification === 'onnxruntime-web path') {
    if (isLessThan(inst.version, ...ONNXRUNTIME_MIN_VERSION)) {
      violations.push({
        ...inst,
        classification,
        reason: `onnxruntime-web path must be >= ${formatMinVersion(ONNXRUNTIME_MIN_VERSION)} (ADR 0031 accepted-risk baseline)`,
      });
    }
  } else {
    if (isLessThan(inst.version, ...OTHER_MIN_VERSION)) {
      violations.push({
        ...inst,
        classification,
        reason: `other protobufjs paths must be >= ${formatMinVersion(OTHER_MIN_VERSION)} (ADR 0031 baseline)`,
      });
    }
  }
}

console.log(`[check-protobufjs] Found ${instances.length} protobufjs instance(s)`);
for (const [classification, group] of groupedInstances.entries()) {
  for (const inst of group) {
    console.log(`  ${classification}: ${inst.version} @ ${inst.path}`);
  }
}

if (violations.length > 0) {
  console.error(`[check-protobufjs] FAIL: ${violations.length} violation(s)`);
  for (const v of violations) {
    console.error(`  - ${v.classification}: ${v.version} @ ${v.path}: ${v.reason}`);
  }
  process.exit(1);
}

console.log('[check-protobufjs] OK: all protobufjs instances within ADR 0031 bounds');
