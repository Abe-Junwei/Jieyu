import { LeipzigValidator } from '../../ai/LeipzigValidator';
import { DEFAULT_LEIPZIG_STRUCTURAL_PROFILE } from '../../annotation/structuralRuleProfile';

const TEMPLATE_ABBREVIATIONS = [
  ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.zeroMarkers,
  ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.reduplicationMarkers,
];

const validator = new LeipzigValidator(TEMPLATE_ABBREVIATIONS);

export const ANNOTATION_LEIPZIG_TEMPLATE_ID = DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.id;

export function annotationGlossHasLeipzigIssue(gloss: string): boolean {
  if (gloss.trim().length === 0) return false;
  return !validator.validateGloss(gloss).valid;
}
