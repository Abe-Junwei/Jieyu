import fs from 'node:fs';
import path from 'node:path';
import { architectureGuardRules } from './architecture-guard.config.mjs';

const workspaceRoot = process.cwd();
const reportOnly = process.argv.includes('--report');

function listWorkspaceFiles(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listWorkspaceFiles(fullPath));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function countMatches(source, pattern) {
  return (source.match(pattern) ?? []).length;
}

function measureFile(source) {
  return {
    lines: source.split('\n').length,
    useCallbackDecls: countMatches(source, /const\s+\w+\s*=\s*useCallback\(/g),
    useMemoDecls: countMatches(source, /const\s+\w+\s*=\s*useMemo\(/g),
    useEffects: countMatches(source, /useEffect\(/g),
  };
}

function countRegexMatches(source, regex) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const globalRegex = new RegExp(regex.source, flags);
  return Array.from(source.matchAll(globalRegex)).length;
}

function regexMatches(source, regex) {
  regex.lastIndex = 0;
  return regex.test(source);
}

function ruleMatchesFile(rule, relativePath) {
  if (typeof rule.file === 'string') return rule.file === relativePath;
  if (!(rule.matchRegex instanceof RegExp)) return false;
  if (!regexMatches(relativePath, rule.matchRegex)) return false;
  if (Array.isArray(rule.excludeFiles) && rule.excludeFiles.includes(relativePath)) return false;
  if (Array.isArray(rule.excludeRegexes) && rule.excludeRegexes.some((pattern) => regexMatches(relativePath, pattern))) return false;
  return true;
}

function getRuleTargets(rule, workspaceFiles) {
  if (typeof rule.file === 'string') {
    return [rule.file];
  }
  return workspaceFiles.filter((relativePath) => ruleMatchesFile(rule, relativePath));
}

const failures = [];
const warnings = [];
const workspaceFiles = listWorkspaceFiles(path.join(workspaceRoot, 'src'))
  .map((fullPath) => path.relative(workspaceRoot, fullPath).replaceAll(path.sep, '/'))
  .filter((relativePath) => /\.(ts|tsx)$/.test(relativePath));

function maybeWarnNumeric(target, label, value, max, warnAtRatio) {
  if (typeof warnAtRatio !== 'number') return;
  if (max <= 0) return;
  if (value > max) return;
  if (value / max < warnAtRatio) return;
  warnings.push(`${target}: ${label} ${value}/${max} reached ${Math.round((value / max) * 100)}% of ceiling`);
}

for (const rule of architectureGuardRules) {
  const targets = getRuleTargets(rule, workspaceFiles);
  if (targets.length === 0) {
    if (typeof rule.file === 'string') {
      failures.push(`Missing guarded file: ${rule.file}`);
    }
    continue;
  }

  for (const target of targets) {
    const fullPath = path.join(workspaceRoot, target);
    if (!fs.existsSync(fullPath)) {
      failures.push(`Missing guarded file: ${target}`);
      continue;
    }
    const source = fs.readFileSync(fullPath, 'utf8');
    const metrics = measureFile(source);

    if (typeof rule.maxLines === 'number' && metrics.lines > rule.maxLines) {
      failures.push(`${target}: line count ${metrics.lines} exceeds ceiling ${rule.maxLines}`);
    }
    maybeWarnNumeric(target, 'line count', metrics.lines, rule.maxLines, rule.warnAtRatio);
    if (typeof rule.maxUseCallbackDecls === 'number' && metrics.useCallbackDecls > rule.maxUseCallbackDecls) {
      failures.push(`${target}: useCallback declarations ${metrics.useCallbackDecls} exceed ceiling ${rule.maxUseCallbackDecls}`);
    }
    maybeWarnNumeric(target, 'useCallback declarations', metrics.useCallbackDecls, rule.maxUseCallbackDecls, rule.warnAtRatio);
    if (typeof rule.maxUseMemoDecls === 'number' && metrics.useMemoDecls > rule.maxUseMemoDecls) {
      failures.push(`${target}: useMemo declarations ${metrics.useMemoDecls} exceed ceiling ${rule.maxUseMemoDecls}`);
    }
    maybeWarnNumeric(target, 'useMemo declarations', metrics.useMemoDecls, rule.maxUseMemoDecls, rule.warnAtRatio);
    if (typeof rule.maxUseEffects === 'number' && metrics.useEffects > rule.maxUseEffects) {
      failures.push(`${target}: useEffect count ${metrics.useEffects} exceeds ceiling ${rule.maxUseEffects}`);
    }
    maybeWarnNumeric(target, 'useEffect count', metrics.useEffects, rule.maxUseEffects, rule.warnAtRatio);
    if (Array.isArray(rule.maxRegexMatchCounts)) {
      for (const metric of rule.maxRegexMatchCounts) {
        const count = countRegexMatches(source, metric.pattern);
        if (count > metric.max) {
          failures.push(`${target}: ${metric.label} count ${count} exceeds ceiling ${metric.max}`);
        }
        maybeWarnNumeric(target, metric.label, count, metric.max, rule.warnAtRatio);
      }
    }
    if (Array.isArray(rule.requiredLiterals)) {
      for (const literal of rule.requiredLiterals) {
        if (!source.includes(literal)) {
          failures.push(`${target}: required architecture literal missing: ${literal}`);
        }
      }
    }
    if (Array.isArray(rule.forbiddenLiterals)) {
      for (const literal of rule.forbiddenLiterals) {
        if (source.includes(literal)) {
          failures.push(`${target}: forbidden architecture literal found: ${literal}`);
        }
      }
    }
    if (Array.isArray(rule.requiredRegexes)) {
      for (const pattern of rule.requiredRegexes) {
        if (!regexMatches(source, pattern)) {
          failures.push(`${target}: required architecture pattern missing: ${pattern}`);
        }
      }
    }
    if (Array.isArray(rule.forbiddenRegexes)) {
      for (const pattern of rule.forbiddenRegexes) {
        if (regexMatches(source, pattern)) {
          failures.push(`${target}: forbidden architecture pattern found: ${pattern}`);
        }
      }
    }
  }
}

if (warnings.length > 0) {
  console.warn(`[check-architecture-guard] WARN: ${warnings.length} hotspot(s) approaching ceilings.`);
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (failures.length > 0) {
  console.error('[check-architecture-guard] FAILED');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  if (!reportOnly) {
    process.exit(1);
  }
}

if (reportOnly) {
  console.log('[check-architecture-guard] REPORT: architecture hotspot scan completed.');
} else {
  console.log('[check-architecture-guard] OK: guarded files stayed within architecture ceilings.');
}