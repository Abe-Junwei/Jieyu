/**
 * Breaks static cycles: custom-field admin module must not import the full language catalog graph eagerly.
 */
export async function refreshLanguageCatalogReadModelAfterMutation(): Promise<void> {
  const { refreshLanguageCatalogReadModel } = await import('./languageCatalog/languageCatalogCore');
  await refreshLanguageCatalogReadModel();
}
