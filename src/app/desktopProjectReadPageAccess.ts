/** Desktop folder reader for pages. Pages cannot import `../db`. */
export { createDesktopClient } from '../db/desktop/client';
export { CUSTOM_FIELD_TARGETS, CUSTOM_FIELD_TYPES } from '../db/desktop/customFieldValidation';
export {
  loadDesktopProjectRead,
  type DesktopProjectRead,
  type DesktopProjectReadApi,
} from '../db/desktop/projectRead';
