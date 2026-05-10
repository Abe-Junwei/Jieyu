import { loadTierService } from './linguisticServiceLazyLoaders';

type TierService = Awaited<ReturnType<typeof loadTierService>>;

export async function getTierDefinitions(...args: Parameters<TierService['getTierDefinitions']>) {
  return (await loadTierService()).getTierDefinitions(...args);
}

export async function saveTierDefinition(...args: Parameters<TierService['saveTierDefinition']>) {
  return (await loadTierService()).saveTierDefinition(...args);
}

export async function removeTierDefinition(
  ...args: Parameters<TierService['removeTierDefinition']>
) {
  return (await loadTierService()).removeTierDefinition(...args);
}

export async function getTierAnnotations(...args: Parameters<TierService['getTierAnnotations']>) {
  return (await loadTierService()).getTierAnnotations(...args);
}

export async function saveTierAnnotation(...args: Parameters<TierService['saveTierAnnotation']>) {
  return (await loadTierService()).saveTierAnnotation(...args);
}

export async function removeTierAnnotation(
  ...args: Parameters<TierService['removeTierAnnotation']>
) {
  return (await loadTierService()).removeTierAnnotation(...args);
}

export async function saveTierAnnotationsBatch(
  ...args: Parameters<TierService['saveTierAnnotationsBatch']>
) {
  return (await loadTierService()).saveTierAnnotationsBatch(...args);
}

export async function getAuditLogs(...args: Parameters<TierService['getAuditLogs']>) {
  return (await loadTierService()).getAuditLogs(...args);
}

export async function getAuditLogsByCollection(
  ...args: Parameters<TierService['getAuditLogsByCollection']>
) {
  return (await loadTierService()).getAuditLogsByCollection(...args);
}

export async function pruneAuditLogs(...args: Parameters<TierService['pruneAuditLogs']>) {
  return (await loadTierService()).pruneAuditLogs(...args);
}
