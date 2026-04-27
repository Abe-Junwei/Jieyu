/**
 * Re-exports selected `src/db` runtime entry points for page modules (M3: pages must not import `../db` directly).
 */

export { db, getDb, withTransaction } from '../db';
export { stripForbiddenTranslationParentLayerId } from '../db';
