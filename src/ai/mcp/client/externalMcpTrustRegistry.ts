/**
 * B11 — outbound MCP allowlist. Identity is a normalized origin URL, not a display name.
 * Flag off ⇒ tools/list schema never reaches the LLM.
 */

import { getDb, type ExternalMcpTrustDoc } from '../../../db';
import { featureFlags } from '../../config/featureFlags';
import { inspectInbound } from '../../security/semanticGuard';

export type ExternalMcpToolSchema = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type ExternalMcpExposeDenial =
  | 'flag_off'
  | 'invalid_origin'
  | 'unregistered'
  | 'disabled'
  | 'schema_blocked';

export type ExternalMcpExposeResult<T extends ExternalMcpToolSchema> =
  | { allowed: true; origin: string; tools: readonly T[] }
  | {
      allowed: false;
      reason: ExternalMcpExposeDenial;
      blockReasons?: readonly string[];
    };

const AUDIT_COLLECTION = 'external_mcp_trust';
const AUDIT_FIELD = 'external_mcp_trust';
const LAST_TOOLS_JSON_MAX = 32_000;

function serializeLastToolsJson(tools: readonly ExternalMcpToolSchema[]): string {
  return JSON.stringify(tools).slice(0, LAST_TOOLS_JSON_MAX);
}

export function normalizeExternalMcpOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password) return null;
  parsed.hash = '';
  parsed.search = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.protocol}//${parsed.host}${path === '/' ? '' : path}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newAuditId(): string {
  return `aud_mcp_trust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function serializeToolSchemaText(tools: readonly ExternalMcpToolSchema[]): string {
  return tools
    .map((tool) => `${tool.name}\n${tool.description ?? ''}`)
    .join('\n')
    .slice(0, 16_000);
}

async function persistTrustAudit(input: {
  origin: string;
  action: 'create' | 'update';
  newValue: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  const timestamp = nowIso();
  await db.collections.audit_logs.insert({
    id: newAuditId(),
    collection: AUDIT_COLLECTION,
    documentId: input.origin,
    action: input.action,
    field: AUDIT_FIELD,
    newValue: input.newValue,
    source: 'system',
    timestamp,
    metadataJson: JSON.stringify(input.metadata),
  });
}

export async function listExternalMcpTrustEntries(): Promise<ExternalMcpTrustDoc[]> {
  const db = await getDb();
  const rows = await db.collections.external_mcp_trust.find().exec();
  return rows.map((row) => row.toJSON()).sort((a, b) => a.origin.localeCompare(b.origin));
}

export async function getExternalMcpTrustEntry(
  rawOrigin: string,
): Promise<ExternalMcpTrustDoc | undefined> {
  const origin = normalizeExternalMcpOrigin(rawOrigin);
  if (!origin) return undefined;
  const db = await getDb();
  const row = await db.collections.external_mcp_trust.findOne({ selector: { id: origin } }).exec();
  return row?.toJSON();
}

export async function persistExternalMcpLastToolsJson(input: {
  origin: string;
  tools: readonly ExternalMcpToolSchema[];
}): Promise<void> {
  const origin = normalizeExternalMcpOrigin(input.origin);
  if (!origin) return;
  const db = await getDb();
  const existing = await db.collections.external_mcp_trust
    .findOne({ selector: { id: origin } })
    .exec();
  if (!existing) return;
  const previous = existing.toJSON();
  const timestamp = nowIso();
  const next: ExternalMcpTrustDoc = {
    id: origin,
    origin,
    enabled: previous.enabled,
    createdAt: previous.createdAt,
    updatedAt: timestamp,
    lastToolsJson: serializeLastToolsJson(input.tools),
    lastToolsFetchedAt: timestamp,
    ...(previous.label ? { label: previous.label } : {}),
    ...(previous.lastSchemaScanResult
      ? { lastSchemaScanResult: previous.lastSchemaScanResult }
      : {}),
    ...(previous.lastSchemaScanAt ? { lastSchemaScanAt: previous.lastSchemaScanAt } : {}),
    ...(previous.lastSchemaScanReasonsJson
      ? { lastSchemaScanReasonsJson: previous.lastSchemaScanReasonsJson }
      : {}),
  };
  await db.collections.external_mcp_trust.update(origin, next);
}

export async function setExternalMcpTrustEnabled(input: {
  origin: string;
  enabled: boolean;
  label?: string;
  tools?: readonly ExternalMcpToolSchema[];
}): Promise<
  | { ok: true; entry: ExternalMcpTrustDoc }
  | { ok: false; reason: ExternalMcpExposeDenial; blockReasons?: readonly string[] }
> {
  const origin = normalizeExternalMcpOrigin(input.origin);
  if (!origin) return { ok: false, reason: 'invalid_origin' };

  let scanResult: ExternalMcpTrustDoc['lastSchemaScanResult'] = 'skipped';
  let scanReasons: string[] = [];
  if (input.enabled && input.tools && input.tools.length > 0) {
    const inbound = inspectInbound({
      text: serializeToolSchemaText(input.tools),
      trustTier: 'untrusted',
    });
    if (inbound.action === 'block') {
      scanResult = 'block';
      scanReasons = [...inbound.reasons];
      await persistTrustAudit({
        origin,
        action: 'update',
        newValue: 'denied',
        metadata: { origin, enabled: false, scanResult, reasons: scanReasons },
      });
      return { ok: false, reason: 'schema_blocked', blockReasons: scanReasons };
    }
    scanResult = 'allow';
  }

  const db = await getDb();
  const timestamp = nowIso();
  const existing = await db.collections.external_mcp_trust
    .findOne({ selector: { id: origin } })
    .exec();
  const previous = existing?.toJSON();
  const label = input.label?.trim() || previous?.label;
  const toolsJson =
    input.tools && input.tools.length > 0
      ? serializeLastToolsJson(input.tools)
      : previous?.lastToolsJson;
  const fetchedAt =
    input.tools && input.tools.length > 0 ? timestamp : previous?.lastToolsFetchedAt;
  const next: ExternalMcpTrustDoc = {
    id: origin,
    origin,
    enabled: input.enabled,
    createdAt: previous?.createdAt ?? timestamp,
    updatedAt: timestamp,
    ...(label ? { label } : {}),
    lastSchemaScanResult: scanResult,
    lastSchemaScanAt: timestamp,
    ...(scanReasons.length > 0 ? { lastSchemaScanReasonsJson: JSON.stringify(scanReasons) } : {}),
    ...(toolsJson ? { lastToolsJson: toolsJson } : {}),
    ...(fetchedAt ? { lastToolsFetchedAt: fetchedAt } : {}),
  };

  if (existing) {
    await db.collections.external_mcp_trust.update(origin, next);
  } else {
    await db.collections.external_mcp_trust.insert(next);
  }

  await persistTrustAudit({
    origin,
    action: existing ? 'update' : 'create',
    newValue: input.enabled ? 'enabled' : 'disabled',
    metadata: { origin, enabled: input.enabled, scanResult },
  });

  const stored = await db.collections.external_mcp_trust
    .findOne({ selector: { id: origin } })
    .exec();
  return { ok: true, entry: stored!.toJSON() };
}

export async function exposeExternalMcpToolsToLlm<T extends ExternalMcpToolSchema>(input: {
  origin: string;
  tools: readonly T[];
}): Promise<ExternalMcpExposeResult<T>> {
  if (!featureFlags.aiExternalMcpTrustEnabled) {
    return { allowed: false, reason: 'flag_off' };
  }
  const origin = normalizeExternalMcpOrigin(input.origin);
  if (!origin) return { allowed: false, reason: 'invalid_origin' };
  const entry = await getExternalMcpTrustEntry(origin);
  if (!entry) return { allowed: false, reason: 'unregistered' };
  if (!entry.enabled) return { allowed: false, reason: 'disabled' };

  const inbound = inspectInbound({
    text: serializeToolSchemaText(input.tools),
    trustTier: 'untrusted',
  });
  if (inbound.action === 'block') {
    return { allowed: false, reason: 'schema_blocked', blockReasons: inbound.reasons };
  }
  return { allowed: true, origin, tools: input.tools };
}
