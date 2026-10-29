import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const root = process.cwd();
const recordPath = 'scripts/install-targets.record.json';
const configPath = 'electron-builder.yml';

function targetMap(block) {
  const list = block && Array.isArray(block.target) ? block.target : [];
  const out = {};
  for (const item of list) {
    if (!item || typeof item.target !== 'string' || !Array.isArray(item.arch)) continue;
    out[item.target] = item.arch.map(String).sort();
  }
  return out;
}

function targetRecord(block) {
  if (!block || typeof block !== 'object') return {};
  const out = {};
  for (const [name, arches] of Object.entries(block)) {
    if (Array.isArray(arches)) out[name] = arches;
  }
  return out;
}

function sameTargets(actual, expected) {
  const actualNames = Object.keys(actual).sort();
  const expectedNames = Object.keys(expected).sort();
  if (actualNames.join('\n') !== expectedNames.join('\n')) return false;
  return actualNames.every(
    (name) => actual[name].join('\n') === [...expected[name]].map(String).sort().join('\n'),
  );
}

export function installTargetViolations(config, record, sources) {
  if (
    typeof config !== 'object' ||
    config === null ||
    typeof record !== 'object' ||
    record === null
  ) {
    return ['install target record is missing'];
  }
  const violations = [];
  if (!sameTargets(targetMap(config.mac), targetRecord(record.mac))) {
    violations.push('mac targets do not match the record');
  }
  if (!sameTargets(targetMap(config.win), targetRecord(record.win))) {
    violations.push('windows targets do not match the record');
  }
  if (config.win?.verifyUpdateCodeSignature !== record.win?.verifyUpdateCodeSignature) {
    violations.push('windows update signature check does not match the record');
  }
  const provider =
    config.publish && typeof config.publish === 'object' ? config.publish.provider : undefined;
  if (provider !== record.publish) violations.push('publish provider does not match the record');
  const electron = sources?.electron ?? [];
  const workflows = sources?.workflows ?? [];
  const hasUpdater = electron.some(
    (text) => text.includes('electron-updater') || text.includes('autoUpdater'),
  );
  if (record.updaterInApp !== hasUpdater) {
    violations.push(record.updaterInApp ? 'app has no updater' : 'app contains an updater');
  }
  const buildsInstaller = workflows.some((text) => text.includes('electron-builder'));
  if (record.installerWorkflow !== buildsInstaller) {
    violations.push(
      record.installerWorkflow ? 'ci does not build an installer' : 'ci builds an installer',
    );
  }
  return violations;
}

function selfCheck() {
  const config = {
    mac: {
      target: [
        { target: 'dmg', arch: ['arm64'] },
        { target: 'zip', arch: ['arm64'] },
      ],
    },
    win: {
      target: [{ target: 'nsis', arch: ['x64'] }],
      verifyUpdateCodeSignature: false,
    },
    publish: { provider: 'github' },
  };
  const record = {
    mac: { dmg: ['arm64'], zip: ['arm64'] },
    win: { nsis: ['x64'], verifyUpdateCodeSignature: false },
    publish: 'github',
    updaterInApp: false,
    installerWorkflow: false,
  };
  const ok = installTargetViolations(config, record, { electron: [], workflows: [] });
  const wrongMac = installTargetViolations(
    { ...config, mac: { target: [{ target: 'dmg', arch: ['x64'] }] } },
    record,
    { electron: [], workflows: [] },
  );
  const updater = installTargetViolations(config, record, {
    electron: ['autoUpdater.checkForUpdates()'],
    workflows: [],
  });
  const workflow = installTargetViolations(config, record, {
    electron: [],
    workflows: ['run: npx electron-builder'],
  });
  if (
    ok.length !== 0 ||
    !wrongMac.some((item) => item.includes('mac targets')) ||
    !updater.some((item) => item.includes('contains an updater')) ||
    !workflow.some((item) => item.includes('builds an installer'))
  ) {
    console.error('[check-install-targets] self-check failed');
    process.exit(1);
  }
}

function readTree(dir, suffixes) {
  if (!fs.existsSync(dir)) return [];
  const texts = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      texts.push(...readTree(full, suffixes));
      continue;
    }
    if (!entry.isFile() || !suffixes.some((suffix) => entry.name.endsWith(suffix))) continue;
    texts.push(fs.readFileSync(full, 'utf8'));
  }
  return texts;
}

selfCheck();
const record = JSON.parse(fs.readFileSync(path.join(root, recordPath), 'utf8'));
const config = yaml.load(fs.readFileSync(path.join(root, configPath), 'utf8'));
const violations = installTargetViolations(config, record, {
  electron: readTree(path.join(root, 'electron'), ['.ts', '.js', '.mjs']),
  workflows: readTree(path.join(root, '.github/workflows'), ['.yml', '.yaml']),
});
if (violations.length > 0) {
  for (const violation of violations) console.error(violation);
  process.exit(1);
}
console.log('[check-install-targets] OK');
