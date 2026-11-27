/** Public two-segment merge entry. Preview / write / snapshot live in sibling modules (1b-6 6p). */
export {
  mergeBaseline,
  mergePreview,
  type MergeClip,
  type MergePreview,
  type MergeTextPreview,
} from './unitMergePreview';
export { mergeUnits, undoMerge } from './unitMergeWrite';
export type { UnitMergeInput, UnitMergeUndo } from './unitMergeShared';
