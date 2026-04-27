/**
 * Page-layer bridge for `LanguageMetadataCustomFields` (M3: pages must not import `../services/*` directly).
 */

export {
  applyCustomFieldDraftDefaults,
  buildCustomFieldDraftValues,
  buildPersistedCustomFieldValues,
  CUSTOM_FIELD_RENDERER_REGISTRY,
  formatCustomFieldOptionsEditorValue,
  parseCustomFieldDraftMultiselectValue,
  parseCustomFieldOptionsEditorValue,
  readLocalizedFieldText,
  serializeCustomFieldDraftValue,
  validateCustomFieldDraftValue,
} from '../services/LanguageMetadataCustomFields';
