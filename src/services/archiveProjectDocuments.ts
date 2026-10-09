/**
 * 项目包清单里的 `projects[].documents[]` 与 `systemRefs[]`（rev5 7.2、7.3）。JYT、JYM、JYB 共用。
 * `projects[].documents[]` and `systemRefs[]` of package manifests (rev5 7.2, 7.3); shared by JYT,
 * JYM and JYB.
 */
import { isSystemTemplateId } from '../db/catalogOwnership';

export type ArchiveProjectDocuments = {
  id: string;
  defaultDocumentId?: string;
  documents: Array<{
    documentId: string;
    isDefault: boolean;
    layerIds: string[];
    sourceIds: string[];
  }>;
};

/** 快照里每个项目的文档清单；层没写 documentId 时归默认文档 | Per-project documents from a snapshot */
export function collectArchiveProjectDocuments(snapshot: {
  collections: Record<string, unknown[]>;
}): ArchiveProjectDocuments[] {
  type Row = Record<string, unknown>;
  const str = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined;
  const texts = (snapshot.collections['texts'] ?? []) as Row[];
  const documents = (snapshot.collections['annotation_documents'] ?? []) as Row[];
  const tiers = (snapshot.collections['tier_definitions'] ?? []) as Row[];
  return texts.map((text) => {
    const textId = str(text.id) ?? '';
    const defaultDocumentId = str(text.defaultDocumentId);
    const ownDocuments = documents.filter((doc) => doc.textId === textId);
    return {
      id: textId,
      ...(defaultDocumentId ? { defaultDocumentId } : {}),
      documents: ownDocuments.map((doc) => {
        const documentId = str(doc.id) ?? '';
        const layerIds = tiers
          .filter(
            (tier) =>
              tier.textId === textId &&
              String(tier.key ?? '').startsWith('bridge_') &&
              (str(tier.documentId) ?? defaultDocumentId) === documentId,
          )
          .map((tier) => String(tier.id))
          .sort();
        const sourceIds = Array.isArray(doc.sourceIds) ? doc.sourceIds.map(String) : [];
        return { documentId, isDefault: documentId === defaultDocumentId, layerIds, sourceIds };
      }),
    };
  });
}

/** 项目行引用到的系统模板 ID | System template ids referenced by stored rows */
export function collectArchiveSystemRefs(snapshot: {
  collections: Record<string, unknown[]>;
}): Array<{ id: string }> {
  const ids = new Set<string>();
  for (const row of snapshot.collections['structural_rule_profiles'] ?? []) {
    const ref = (row as { derivedFromSystemId?: unknown } | null)?.derivedFromSystemId;
    if (isSystemTemplateId(ref)) ids.add(ref);
  }
  return [...ids].sort().map((id) => ({ id }));
}
