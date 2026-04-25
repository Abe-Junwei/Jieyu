import type {
  AiSessionDirective,
  AiSessionMemory,
  AiUserDirectiveLedgerEntry,
  AiUserDirectiveSource,
} from '../chat/chatDomain.types';
import type { ExtractedUserDirective } from './userDirectiveExtractor';

export interface UserDirectiveApplicationResult {
  nextMemory: AiSessionMemory;
  ledgerEntries: AiUserDirectiveLedgerEntry[];
  acceptedCount: number;
  ignoredCount: number;
  downgradedCount: number;
  supersededCount: number;
}

function directiveExpiresAt(scope: ExtractedUserDirective['scope'], createdAt: string): string | undefined {
  if (scope !== 'session') return undefined;
  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed + 12 * 60 * 60 * 1000).toISOString();
}

function createLedgerEntry(
  directive: ExtractedUserDirective,
  action: AiUserDirectiveLedgerEntry['action'],
  createdAt: string,
  reason?: string,
): AiUserDirectiveLedgerEntry {
  const expiresAt = directiveExpiresAt(directive.scope, createdAt);
  return {
    id: directive.id,
    category: directive.category,
    scope: directive.scope,
    text: directive.text,
    action,
    source: directive.source,
    confidence: directive.confidence,
    createdAt,
    targetPath: directive.targetPath,
    value: directive.value,
    ...(directive.sourceMessageId ? { sourceMessageId: directive.sourceMessageId } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(reason ? { reason } : {}),
  };
}

function isUnsafeRelaxation(directive: ExtractedUserDirective): boolean {
  return (directive.targetPath === 'safetyPreferences.denyDestructive' && directive.value === false)
    || (directive.targetPath === 'safetyPreferences.denyBatch' && directive.value === false)
    || (directive.targetPath === 'toolPreferences.autoExecute' && directive.value === 'allow' && directive.scope === 'long_term');
}

function appendSessionDirective(memory: AiSessionMemory, directive: ExtractedUserDirective, createdAt: string): AiSessionDirective[] {
  const existing = memory.sessionDirectives ?? [];
  const expiresAt = directiveExpiresAt(directive.scope, createdAt);
  const next = {
    id: directive.id,
    text: directive.text,
    category: directive.category,
    createdAt,
    source: directive.source,
    ...(directive.sourceMessageId ? { sourceMessageId: directive.sourceMessageId } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
  return [...existing.filter((item) => item.id !== next.id), next].slice(-24);
}

export function applyUserDirectivesToSessionMemory(
  memory: AiSessionMemory,
  directives: readonly ExtractedUserDirective[],
  options?: {
    now?: Date;
    sourceOverride?: AiUserDirectiveSource;
  },
): UserDirectiveApplicationResult {
  const createdAt = (options?.now ?? new Date()).toISOString();
  let nextMemory: AiSessionMemory = { ...memory };
  const ledgerEntries: AiUserDirectiveLedgerEntry[] = [];
  let acceptedCount = 0;
  let ignoredCount = 0;
  let downgradedCount = 0;
  let supersededCount = 0;

  for (const directive of directives) {
    if (directive.confidence < 0.72) {
      ignoredCount += 1;
      ledgerEntries.push(createLedgerEntry(directive, 'ignored', createdAt, 'low_confidence'));
      continue;
    }
    if (isUnsafeRelaxation(directive)) {
      downgradedCount += 1;
      ledgerEntries.push(createLedgerEntry(directive, 'downgraded', createdAt, 'cannot_relax_system_safety'));
      continue;
    }

    const existingTarget = [...(nextMemory.directiveLedger ?? [])]
      .reverse()
      .find((entry) => entry.targetPath === directive.targetPath && entry.action === 'accepted');
    if (existingTarget && String(existingTarget.value) !== String(directive.value)) {
      supersededCount += 1;
      ledgerEntries.push({
        ...existingTarget,
        id: `${existingTarget.id}_superseded_${directive.id}`,
        action: 'superseded',
        supersededBy: directive.id,
        createdAt,
      });
    }

    if (directive.category === 'response') {
      nextMemory = {
        ...nextMemory,
        responsePreferences: {
          ...(nextMemory.responsePreferences ?? {}),
          ...(directive.targetPath === 'responsePreferences.language' ? { language: directive.value } : {}),
          ...(directive.targetPath === 'responsePreferences.style' ? { style: directive.value } : {}),
          ...(directive.targetPath === 'responsePreferences.format' ? { format: directive.value } : {}),
          ...(directive.targetPath === 'responsePreferences.evidenceRequired' ? { evidenceRequired: directive.value } : {}),
        },
      };
    } else if (directive.category === 'tool') {
      nextMemory = {
        ...nextMemory,
        toolPreferences: {
          ...(nextMemory.toolPreferences ?? {}),
          ...(directive.targetPath === 'toolPreferences.defaultScope' ? { defaultScope: directive.value } : {}),
          ...(directive.targetPath === 'toolPreferences.autoExecute' ? { autoExecute: directive.value } : {}),
          ...(directive.targetPath === 'toolPreferences.preferLocalReads' ? { preferLocalReads: directive.value } : {}),
        },
      };
    } else if (directive.category === 'safety') {
      nextMemory = {
        ...nextMemory,
        safetyPreferences: {
          ...(nextMemory.safetyPreferences ?? {}),
          ...(directive.targetPath === 'safetyPreferences.denyDestructive' ? { denyDestructive: directive.value } : {}),
          ...(directive.targetPath === 'safetyPreferences.denyBatch' ? { denyBatch: directive.value } : {}),
          ...(directive.targetPath === 'safetyPreferences.requireImpactPreview' ? { requireImpactPreview: directive.value } : {}),
        },
      };
    } else if (directive.category === 'terminology') {
      nextMemory = {
        ...nextMemory,
        terminologyPreferences: [
          ...(nextMemory.terminologyPreferences ?? []).filter((item) => item.source.toLocaleLowerCase() !== directive.sourceTerm.toLocaleLowerCase()),
          { source: directive.sourceTerm, target: directive.targetTerm, createdAt },
        ].slice(-80),
      };
    } else if (directive.category === 'session') {
      nextMemory = {
        ...nextMemory,
        sessionDirectives: appendSessionDirective(nextMemory, directive, createdAt),
      };
    }

    if (directive.scope === 'session' && directive.category !== 'session') {
      nextMemory = {
        ...nextMemory,
        sessionDirectives: appendSessionDirective(nextMemory, directive, createdAt),
      };
    }

    acceptedCount += 1;
    ledgerEntries.push(createLedgerEntry(directive, 'accepted', createdAt));
  }

  const currentLedger = nextMemory.directiveLedger ?? [];
  return {
    nextMemory: {
      ...nextMemory,
      directiveLedger: [...currentLedger, ...ledgerEntries].slice(-80),
    },
    ledgerEntries,
    acceptedCount,
    ignoredCount,
    downgradedCount,
    supersededCount,
  };
}

export function summarizeDirectiveApplication(result: UserDirectiveApplicationResult): {
  extractedCount: number;
  acceptedCount: number;
  ignoredCount: number;
  downgradedCount: number;
  supersededCount: number;
  categories: Record<string, number>;
} {
  const categories: Record<string, number> = {};
  for (const entry of result.ledgerEntries) {
    categories[entry.category] = (categories[entry.category] ?? 0) + 1;
  }
  return {
    extractedCount: result.ledgerEntries.length,
    acceptedCount: result.acceptedCount,
    ignoredCount: result.ignoredCount,
    downgradedCount: result.downgradedCount,
    supersededCount: result.supersededCount,
    categories,
  };
}
