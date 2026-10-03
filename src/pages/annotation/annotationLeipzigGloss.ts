import { LeipzigValidator } from '../../ai/LeipzigValidator';
import { DEFAULT_LEIPZIG_STRUCTURAL_PROFILE } from '../../annotation/structuralRuleProfile';

const TEMPLATE_ABBREVIATIONS = [
  ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.zeroMarkers,
  ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.reduplicationMarkers,
];

const validator = new LeipzigValidator(TEMPLATE_ABBREVIATIONS);

export const ANNOTATION_LEIPZIG_TEMPLATE_ID = DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.id;

function glossValidator(allowedAbbreviations?: ReadonlySet<string>): LeipzigValidator {
  if (!allowedAbbreviations) return validator;
  return new LeipzigValidator(allowedAbbreviations, { exclusive: true });
}

export function annotationGlossHasLeipzigIssue(
  gloss: string,
  allowedAbbreviations?: ReadonlySet<string>,
): boolean {
  if (gloss.trim().length === 0) return false;
  return !glossValidator(allowedAbbreviations).validateGloss(gloss).valid;
}

export function annotationUnknownGlossAbbreviation(
  gloss: string,
  allowedAbbreviations?: ReadonlySet<string>,
): string | null {
  if (gloss.trim().length === 0) return null;
  return glossValidator(allowedAbbreviations).validateGloss(gloss).unknownAbbreviations[0] ?? null;
}
