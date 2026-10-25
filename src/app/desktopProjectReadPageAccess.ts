/** Desktop folder reader for pages. Pages cannot import `../db`. */
export { createDesktopClient } from '../db/desktop/client';
export {
  loadDesktopProjectRead,
  type DesktopProjectRead,
  type DesktopProjectReadApi,
} from '../db/desktop/projectRead';
