export type BackgroundToolSandboxProfile = 'readonly' | 'restricted_write' | 'deny_by_default';
export type BackgroundToolSandboxAction = 'allow' | 'ask' | 'deny';
export type BackgroundToolSandboxReason =
  | 'sandbox-disabled'
  | 'deny-by-default'
  | 'readonly-command-allowed'
  | 'readonly-write-not-allowed'
  | 'restricted-write-allowed'
  | 'write-outside-authorized-dir'
  | 'workspace-boundary-violation'
  | 'shell-command-not-allowlisted'
  | 'shell-syntax-not-allowed';

export interface BackgroundToolSandboxDecision {
  action: BackgroundToolSandboxAction;
  reason: BackgroundToolSandboxReason;
}

export type BackgroundToolSandboxRequest =
  | {
      enabled: boolean;
      profile: BackgroundToolSandboxProfile;
      kind: 'shell';
      command: string;
      workspaceRoot: string;
      cwd: string;
    }
  | {
      enabled: boolean;
      profile: BackgroundToolSandboxProfile;
      kind: 'file_read' | 'file_write';
      path: string;
      workspaceRoot: string;
      cwd?: string;
      authorizedWriteDirs?: readonly string[];
    };

const READONLY_COMMAND_ALLOWLIST = new Set([
  'pwd',
  'ls',
  'rg',
  'git status',
  'git diff',
  'git log',
  'npm run -s typecheck',
  'npm run -s check:docs-governance',
  'npm run -s check:architecture-guard',
]);

function normalizePath(raw: string): string {
  const hasRoot = raw.startsWith('/');
  const segments: string[] = [];
  for (const segment of raw.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return `${hasRoot ? '/' : ''}${segments.join('/')}`;
}

function joinPath(base: string, target: string): string {
  return normalizePath(target.startsWith('/') ? target : `${base}/${target}`);
}

function isWithin(parent: string, child: string): boolean {
  const normalizedParent = normalizePath(parent).replace(/\/$/, '');
  const normalizedChild = normalizePath(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

function hasUnsafeShellSyntax(command: string): boolean {
  return /(\n|&&|\|\||[;|<>`]|[$][({A-Za-z_])/.test(command);
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ');
}

function isReadonlyCommandAllowlisted(command: string): boolean {
  return READONLY_COMMAND_ALLOWLIST.has(command) || command.startsWith('rg ') || command.startsWith('ls ');
}

function decideShell(request: Extract<BackgroundToolSandboxRequest, { kind: 'shell' }>): BackgroundToolSandboxDecision {
  if (!isWithin(request.workspaceRoot, request.cwd)) {
    return { action: 'deny', reason: 'workspace-boundary-violation' };
  }
  const command = normalizeCommand(request.command);
  if (hasUnsafeShellSyntax(command)) return { action: 'deny', reason: 'shell-syntax-not-allowed' };
  if (request.profile === 'deny_by_default') return { action: 'deny', reason: 'deny-by-default' };
  if (isReadonlyCommandAllowlisted(command)) return { action: 'allow', reason: 'readonly-command-allowed' };
  return { action: 'deny', reason: 'shell-command-not-allowlisted' };
}

function decideFileAccess(request: Extract<BackgroundToolSandboxRequest, { kind: 'file_read' | 'file_write' }>): BackgroundToolSandboxDecision {
  const cwd = request.cwd ? joinPath(request.workspaceRoot, request.cwd) : request.workspaceRoot;
  if (!isWithin(request.workspaceRoot, cwd)) return { action: 'deny', reason: 'workspace-boundary-violation' };
  const targetPath = joinPath(cwd, request.path);
  if (!isWithin(request.workspaceRoot, targetPath)) return { action: 'deny', reason: 'workspace-boundary-violation' };
  if (request.profile === 'deny_by_default') return { action: 'deny', reason: 'deny-by-default' };
  if (request.kind === 'file_read') return { action: 'allow', reason: 'readonly-command-allowed' };
  if (request.profile === 'readonly') return { action: 'ask', reason: 'readonly-write-not-allowed' };
  const authorizedDirs = request.authorizedWriteDirs ?? [];
  const isAuthorized = authorizedDirs.some((dir) => isWithin(joinPath(request.workspaceRoot, dir), targetPath));
  return isAuthorized
    ? { action: 'allow', reason: 'restricted-write-allowed' }
    : { action: 'deny', reason: 'write-outside-authorized-dir' };
}

export function resolveBackgroundToolSandboxDecision(request: BackgroundToolSandboxRequest): BackgroundToolSandboxDecision {
  if (!request.enabled) return { action: 'allow', reason: 'sandbox-disabled' };
  return request.kind === 'shell' ? decideShell(request) : decideFileAccess(request);
}
