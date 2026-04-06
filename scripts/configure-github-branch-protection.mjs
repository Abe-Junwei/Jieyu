import { execFileSync } from 'node:child_process';

const defaultBranches = ['dev', 'main'];
const defaultChecks = ['docs-governance', 'quality', 'build-guard'];

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function getRepeatedArgValues(flag) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
}

function parseGitHubRepo(remoteUrl) {
  const normalized = remoteUrl.trim();
  const patterns = [
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/,
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/,
    /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    return { owner: match[1], repo: match[2] };
  }
  throw new Error(`Unsupported GitHub remote URL: ${remoteUrl}`);
}

function getRemoteRepo() {
  const explicitRepo = getArgValue('--repo');
  if (explicitRepo) {
    const [owner, repo] = explicitRepo.split('/');
    if (!owner || !repo) {
      throw new Error('Expected --repo in the form <owner>/<repo>.');
    }
    return { owner, repo };
  }

  const remoteUrl = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
    encoding: 'utf8',
  }).trim();
  if (!remoteUrl) {
    throw new Error('Unable to determine remote.origin.url.');
  }
  return parseGitHubRepo(remoteUrl);
}

function buildPayload(requiredChecks) {
  return {
    required_status_checks: {
      strict: true,
      contexts: requiredChecks,
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      required_approving_review_count: 0,
      require_last_push_approval: false,
    },
    restrictions: null,
    required_linear_history: false,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: true,
    lock_branch: false,
    allow_fork_syncing: false,
  };
}

async function updateBranchProtection({ owner, repo, branch, payload, token }) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${branch}/protection`, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update branch protection for ${branch}: ${response.status} ${response.statusText}\n${errorText}`);
  }

  return response.json();
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_PAT;
  const branches = getRepeatedArgValues('--branch');
  const checks = getRepeatedArgValues('--check');
  const repoInfo = getRemoteRepo();
  const targetBranches = branches.length > 0 ? branches : defaultBranches;
  const requiredChecks = checks.length > 0 ? checks : defaultChecks;
  const payload = buildPayload(requiredChecks);

  if (dryRun) {
    console.log(JSON.stringify({
      repo: `${repoInfo.owner}/${repoInfo.repo}`,
      branches: targetBranches,
      payload,
    }, null, 2));
    return;
  }

  if (!token) {
    throw new Error('Missing GITHUB_TOKEN, GH_TOKEN, or GITHUB_PAT. Use --dry-run to inspect the payload without applying it.');
  }

  for (const branch of targetBranches) {
    const result = await updateBranchProtection({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      branch,
      payload,
      token,
    });
    console.log(`Updated branch protection: ${result.url}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});