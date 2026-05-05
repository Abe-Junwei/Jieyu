export function loadTierService() {
  return import('./LinguisticService.tiers');
}

export function loadOrthographyService() {
  return import('./LinguisticService.orthography');
}

export function loadStructuralProfileService() {
  return import('./LinguisticService.structuralProfiles');
}

export function loadLanguageCatalogService() {
  return import('./LinguisticService.languageCatalog');
}