import { LinguisticService } from '../../app/languageAssetPageAccess';
import type { UnitTokenDocType } from '../../types/jieyuDbDocTypes';
import { runAnnotationStructureTransaction } from './splitMergeAnnotationTokens';

export type AnnotationTokenDeletionPlan =
  | { kind: 'delete' }
  | { kind: 'reattach'; hostTokenId: string }
  | { kind: 'confirm'; morphCount: number; linkCount: number };

/** Left neighbor receives the attachments. A lone token with attachments must be confirmed. */
export function planAnnotationTokenDeletion(input: {
  tokenIdsInOrder: readonly string[];
  tokenId: string;
  morphCount: number;
  linkCount: number;
}): AnnotationTokenDeletionPlan {
  const index = input.tokenIdsInOrder.indexOf(input.tokenId);
  const attached = input.morphCount + input.linkCount > 0;
  if (!attached) return { kind: 'delete' };
  if (index < 0) {
    return { kind: 'confirm', morphCount: input.morphCount, linkCount: input.linkCount };
  }
  const hostTokenId =
    index > 0 ? input.tokenIdsInOrder[index - 1] : input.tokenIdsInOrder[index + 1];
  if (hostTokenId !== undefined && hostTokenId.length > 0) {
    return { kind: 'reattach', hostTokenId };
  }
  return { kind: 'confirm', morphCount: input.morphCount, linkCount: input.linkCount };
}

export async function deleteAnnotationToken(input: {
  unitId: string;
  tokenId: string;
  confirmLoss?: boolean;
}): Promise<AnnotationTokenDeletionPlan> {
  const tokens = [...(await LinguisticService.units.listTokensByUnitId(input.unitId))].sort(
    (a, b) => a.tokenIndex - b.tokenIndex,
  );
  const token = tokens.find((item) => item.id === input.tokenId);
  if (!token) return { kind: 'delete' };
  const [morphs, links] = await Promise.all([
    LinguisticService.units.listMorphemesByTokenIds([token.id]),
    LinguisticService.units.listTokenLexemeLinks('token', token.id),
  ]);
  const plan = planAnnotationTokenDeletion({
    tokenIdsInOrder: tokens.map((item) => item.id),
    tokenId: token.id,
    morphCount: morphs.length,
    linkCount: links.length,
  });
  if (plan.kind === 'confirm' && input.confirmLoss !== true) return plan;
  await runAnnotationStructureTransaction(async () => {
    if (plan.kind === 'reattach') {
      const host = tokens.find((item) => item.id === plan.hostTokenId);
      await moveAttachments(host, morphs, links);
    }
    await LinguisticService.units.removeToken(token.id);
    const later = tokens.filter((item) => item.tokenIndex > token.tokenIndex);
    for (const item of later) {
      await LinguisticService.units.saveToken({
        ...item,
        tokenIndex: item.tokenIndex - 1,
        updatedAt: new Date().toISOString(),
      });
    }
  }, 'annotation-token-delete');
  return plan.kind === 'confirm' ? { kind: 'delete' } : plan;
}

async function moveAttachments(
  host: UnitTokenDocType | undefined,
  morphs: Awaited<ReturnType<typeof LinguisticService.units.listMorphemesByTokenIds>>,
  links: Awaited<ReturnType<typeof LinguisticService.units.listTokenLexemeLinks>>,
): Promise<void> {
  if (!host) return;
  const hostMorphs = await LinguisticService.units.listMorphemesByTokenIds([host.id]);
  const nextIndex = hostMorphs.reduce((max, morph) => Math.max(max, morph.morphemeIndex), -1) + 1;
  const now = new Date().toISOString();
  const ordered = [...morphs].sort((a, b) => a.morphemeIndex - b.morphemeIndex);
  for (const [offset, morph] of ordered.entries()) {
    await LinguisticService.units.saveMorpheme({
      ...morph,
      tokenId: host.id,
      morphemeIndex: nextIndex + offset,
      updatedAt: now,
    });
  }
  for (const link of links) {
    await LinguisticService.units.saveTokenLexemeLink({
      ...link,
      targetId: host.id,
      updatedAt: now,
    });
  }
}
