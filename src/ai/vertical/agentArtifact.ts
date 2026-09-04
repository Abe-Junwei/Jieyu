/**
 * B12 AgentArtifactV0 — Dexie persist + AdoptionQueue ids + B5b export manifest helper.
 */

import { getDb, type AgentArtifactDoc, type AgentArtifactKind } from '../../db';
import type { AdoptionItem } from './adoptionQueue';

export type { AgentArtifactDoc, AgentArtifactKind };

export const AGENT_ARTIFACT_AUDIT_FIELD = 'agent_artifact' as const;

export type B5bExportManifestItem = {
  artifactId: string;
  uri: string;
  title: string;
  kind: AgentArtifactKind;
};

export type B5bExportManifest = {
  schemaVersion: 1;
  items: B5bExportManifestItem[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function newArtifactId(): string {
  return `art_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newAuditId(): string {
  return `aud_artifact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function persistAgentArtifact(input: {
  kind: AgentArtifactKind;
  uri: string;
  title: string;
  mimeType?: string;
  body: unknown;
  agentRunId?: string;
  adoptionItemId?: string;
}): Promise<AgentArtifactDoc> {
  const db = await getDb();
  const createdAt = nowIso();
  const doc: AgentArtifactDoc = {
    id: newArtifactId(),
    schemaVersion: 0,
    kind: input.kind,
    uri: input.uri,
    title: input.title,
    mimeType: input.mimeType ?? 'application/json',
    bodyJson: JSON.stringify(input.body),
    createdAt,
    ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
    ...(input.adoptionItemId ? { adoptionItemId: input.adoptionItemId } : {}),
  };
  await db.collections.agent_artifacts.insert(doc);
  await db.collections.audit_logs.insert({
    id: newAuditId(),
    collection: 'agent_artifacts',
    documentId: doc.id,
    action: 'create',
    field: AGENT_ARTIFACT_AUDIT_FIELD,
    newValue: doc.uri,
    source: 'system',
    timestamp: createdAt,
    metadataJson: JSON.stringify({ kind: doc.kind, uri: doc.uri }),
  });
  const stored = await db.collections.agent_artifacts.findOne({ selector: { id: doc.id } }).exec();
  return stored!.toJSON();
}

export async function getAgentArtifact(id: string): Promise<AgentArtifactDoc | undefined> {
  const db = await getDb();
  const row = await db.collections.agent_artifacts.findOne({ selector: { id } }).exec();
  return row?.toJSON();
}

export function attachArtifactId(item: AdoptionItem, artifactId: string): AdoptionItem {
  const nextIds = item.artifactIds?.includes(artifactId)
    ? item.artifactIds
    : [...(item.artifactIds ?? []), artifactId];
  return { ...item, artifactIds: nextIds };
}

export function buildB5bExportManifest(
  artifacts: readonly Pick<AgentArtifactDoc, 'id' | 'uri' | 'title' | 'kind'>[],
): B5bExportManifest {
  return {
    schemaVersion: 1,
    items: artifacts.map((artifact) => ({
      artifactId: artifact.id,
      uri: artifact.uri,
      title: artifact.title,
      kind: artifact.kind,
    })),
  };
}
