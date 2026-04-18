/**
 * Page 层避免直连 `../services/*`（架构守卫 M3）；类型仍以 LinguisticService 为真源。
 */
export type { TextTimeMapping } from '../services/LinguisticService';
