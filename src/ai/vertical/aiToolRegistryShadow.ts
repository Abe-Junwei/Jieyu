/**
 * Compatibility re-export: A10 catalog is the SSOT.
 * Existing MCP / evals / tests keep importing this module.
 */
export {
  AI_TOOL_CATALOG as AI_TOOL_REGISTRY_SHADOW,
  type AiToolCatalogEntry as AiToolRegistryShadowEntry,
  type AiToolCatalogParityReport as AiToolRegistryShadowParityReport,
  getAiToolCatalogEntry as getAiToolRegistryShadowEntry,
  listAiToolCatalogEntries as listAiToolRegistryShadowEntries,
  getAiToolCatalogParityReport as getAiToolRegistryShadowParityReport,
  assertAiToolCatalogParity as assertAiToolRegistryShadowParity,
} from '../catalog/aiToolCatalog';
