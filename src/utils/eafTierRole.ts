export const EAF_TIER_ROLES = ['transcription', 'translation', 'notes', 'exclude'] as const;

export type EafTierRole = (typeof EAF_TIER_ROLES)[number];

export const EAF_NOTE_KINDS = ['controlled-vocabulary', 'speaker-dialect', 'addressee'] as const;

export type EafNoteKind = (typeof EAF_NOTE_KINDS)[number];

export const EAF_TIER_ROLES_METADATA_KEY = 'eafTierRoles';

const ROLE_SET = new Set<string>(EAF_TIER_ROLES);
const KIND_SET = new Set<string>(EAF_NOTE_KINDS);

export function parseEafTierRole(value: unknown): EafTierRole | undefined {
  return typeof value === 'string' && ROLE_SET.has(value) ? (value as EafTierRole) : undefined;
}

export function parseEafNoteKind(value: unknown): EafNoteKind | undefined {
  return typeof value === 'string' && KIND_SET.has(value) ? (value as EafNoteKind) : undefined;
}

export type EafRolePromptTier = {
  tierId: string;
  role: EafTierRole;
};

export function proposeEafTierRoles(
  tiers: ReadonlyArray<{ tierId: string; parentTierId?: string }>,
): EafRolePromptTier[] | undefined {
  const independent = tiers.filter(
    (tier) => tier.parentTierId === undefined || tier.parentTierId.length === 0,
  );
  if (independent.length < 2) return undefined;
  let transcriptionAssigned = false;
  return tiers.map((tier) => {
    if (tier.parentTierId !== undefined && tier.parentTierId.length > 0) {
      return { tierId: tier.tierId, role: 'translation' };
    }
    if (!transcriptionAssigned) {
      transcriptionAssigned = true;
      return { tierId: tier.tierId, role: 'transcription' };
    }
    return { tierId: tier.tierId, role: 'translation' };
  });
}

export function readEafTierRoles(
  metadata: Record<string, unknown> | undefined,
): Record<string, EafTierRole> | undefined {
  const raw = metadata?.[EAF_TIER_ROLES_METADATA_KEY];
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const roles: Record<string, EafTierRole> = {};
  for (const [tierId, value] of Object.entries(raw)) {
    const role = parseEafTierRole(value);
    const id = tierId.trim();
    if (role === undefined || id.length === 0) continue;
    roles[id] = role;
  }
  return Object.keys(roles).length > 0 ? roles : undefined;
}

export function mergeEafTierRoles(
  metadata: Record<string, unknown>,
  roles: Readonly<Record<string, EafTierRole>>,
): Record<string, unknown> {
  return {
    ...metadata,
    [EAF_TIER_ROLES_METADATA_KEY]: { ...roles },
  };
}

export class EafTierRolesRequiredError extends Error {
  readonly fileName: string;
  readonly tiers: readonly EafRolePromptTier[];

  constructor(fileName: string, tiers: readonly EafRolePromptTier[]) {
    super('EafTierRolesRequired');
    this.name = 'EafTierRolesRequiredError';
    this.fileName = fileName;
    this.tiers = tiers;
  }
}

export function isEafTierRolesRequiredError(error: unknown): error is EafTierRolesRequiredError {
  return error instanceof EafTierRolesRequiredError;
}

const SIDE_CHANNEL_NOTE = /^(controlled-vocabulary|speaker-dialect|addressee):\s*([\s\S]*)$/;

export function formatEafSideChannelNote(kind: EafNoteKind, value: string): string {
  return `${kind}: ${value.trim()}`;
}

export function parseEafSideChannelNote(
  text: string,
): { kind: EafNoteKind; value: string } | undefined {
  const match = SIDE_CHANNEL_NOTE.exec(text.trim());
  if (!match) return undefined;
  const kind = parseEafNoteKind(match[1]);
  const value = match[2]?.trim() ?? '';
  if (kind === undefined || value.length === 0) return undefined;
  return { kind, value };
}
