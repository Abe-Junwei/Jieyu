import { getMetricVersionTag } from '../../observability/metrics';

/** 客户端当前实现的协同协议主版本 | Client-supported collaboration protocol major version */
export const SUPPORTED_COLLABORATION_PROTOCOL_VERSION = 1;

export interface CollaborationProtocolGuardEvaluation {
  /** 为 true 时禁止写 project_changes / 资产 / 快照等云端共享状态 | When true, block cloud writes */
  cloudWritesDisabled: boolean;
  /** 机器可读原因，便于日志与指标 | Machine-readable reasons for logs/metrics */
  reasons: string[];
  /** 出站变更使用的 protocol_version（与 projects.protocol_version 对齐） | Outbound protocol version */
  outboundProtocolVersion: number;
}

function parseSemverCore(version: string): [number, number, number] | null {
  const trimmed = version.trim();
  if (!trimmed) return null;
  const core = trimmed.split(/[-+]/)[0];
  if (!core) return null;
  const segments = core.split('.');
  const numbers: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const raw = segments[i] ?? '0';
    const match = /^(\d+)/.exec(raw);
    const majorMinorPatch = match?.[1];
    numbers.push(majorMinorPatch !== undefined ? Number.parseInt(majorMinorPatch, 10) : 0);
  }
  return [numbers[0]!, numbers[1]!, numbers[2]!];
}

/**
 * 比较两段 semver 核心版本（忽略 prerelease）。
 * Compare two semver core versions (prerelease ignored).
 * @returns -1 / 0 / 1，任一侧不可解析则返回 null | null if either side is unparsable
 */
export function compareSemverCore(left: string, right: string): number | null {
  const a = parseSemverCore(left);
  const b = parseSemverCore(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

/** 客户端应用版本是否满足 projects.app_min_version | Whether client semver meets project minimum */
export function clientMeetsAppMinVersion(clientVersion: string, appMinVersion: string): boolean {
  const cmp = compareSemverCore(clientVersion, appMinVersion);
  if (cmp === null) return false;
  return cmp >= 0;
}

export function resolveCollaborationClientAppVersion(): string {
  return getMetricVersionTag();
}

const DEFAULT_EVALUATION: CollaborationProtocolGuardEvaluation = {
  cloudWritesDisabled: false,
  reasons: [],
  outboundProtocolVersion: SUPPORTED_COLLABORATION_PROTOCOL_VERSION,
};

/**
 * 根据云端 projects 行评估是否允许写共享协同状态。
 * Evaluate whether shared collaboration writes are allowed from a projects row.
 * @param project null 表示云端尚无该项目行（首期本地建项）| null when no cloud project row yet
 */
export function evaluateCollaborationProtocolGuard(
  project: { protocolVersion: unknown; appMinVersion: unknown } | null,
): CollaborationProtocolGuardEvaluation {
  if (!project) return { ...DEFAULT_EVALUATION };

  const protocolVersion = typeof project.protocolVersion === 'number' && Number.isFinite(project.protocolVersion)
    ? Math.trunc(project.protocolVersion)
    : null;
  const appMinVersion = typeof project.appMinVersion === 'string' ? project.appMinVersion.trim() : '';

  if (protocolVersion === null) {
    return {
      cloudWritesDisabled: true,
      reasons: ['invalid-project-protocol-version'],
      outboundProtocolVersion: SUPPORTED_COLLABORATION_PROTOCOL_VERSION,
    };
  }

  if (protocolVersion > SUPPORTED_COLLABORATION_PROTOCOL_VERSION) {
    return {
      cloudWritesDisabled: true,
      reasons: [`server-protocol-version-${protocolVersion}-exceeds-client-${SUPPORTED_COLLABORATION_PROTOCOL_VERSION}`],
      outboundProtocolVersion: SUPPORTED_COLLABORATION_PROTOCOL_VERSION,
    };
  }

  if (protocolVersion !== SUPPORTED_COLLABORATION_PROTOCOL_VERSION) {
    return {
      cloudWritesDisabled: true,
      reasons: [`server-protocol-version-${protocolVersion}-mismatch-expected-${SUPPORTED_COLLABORATION_PROTOCOL_VERSION}`],
      outboundProtocolVersion: SUPPORTED_COLLABORATION_PROTOCOL_VERSION,
    };
  }

  if (!appMinVersion) {
    return {
      cloudWritesDisabled: true,
      reasons: ['missing-project-app-min-version'],
      outboundProtocolVersion: protocolVersion,
    };
  }

  const clientVersion = resolveCollaborationClientAppVersion();
  if (!clientMeetsAppMinVersion(clientVersion, appMinVersion)) {
    return {
      cloudWritesDisabled: true,
      reasons: [`client-app-version-${clientVersion}-below-required-${appMinVersion}`],
      outboundProtocolVersion: protocolVersion,
    };
  }

  return {
    cloudWritesDisabled: false,
    reasons: [],
    outboundProtocolVersion: protocolVersion,
  };
}
