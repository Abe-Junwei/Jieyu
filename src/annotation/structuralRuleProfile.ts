import { z } from 'zod';
import { analysisGraphProjectionTargetSchema, projectionDiagnosticSchema, type ProjectionDiagnostic } from './analysisGraph';

export const structuralRuleProfileScopeSchema = z.enum(['system', 'language', 'project', 'user']);
export const structuralParseWarningSeveritySchema = z.enum(['info', 'warning']);

const markerSchema = z.string().min(1).max(8);
const markerListSchema = z.array(markerSchema).min(1).max(24);

export const structuralRuleProfileSchema = z.object({
  id: z.string().trim().min(1).max(128),
  label: z.string().trim().min(1).max(128),
  version: z.string().trim().min(1).max(32),
  scope: structuralRuleProfileScopeSchema,
  symbols: z.object({
    morphemeBoundary: markerSchema,
    featureSeparator: markerSchema,
    cliticBoundary: markerSchema,
    infixStart: markerSchema,
    infixEnd: markerSchema,
    suppliedStart: markerSchema,
    suppliedEnd: markerSchema,
    alternationMarker: markerSchema,
  }).strict(),
  zeroMarkers: markerListSchema,
  reduplicationMarkers: markerListSchema,
  warningPolicy: z.object({
    emptySegment: structuralParseWarningSeveritySchema,
    unmatchedWrapper: structuralParseWarningSeveritySchema,
    alternationMarker: structuralParseWarningSeveritySchema,
  }).strict(),
  projectionTargets: z.array(analysisGraphProjectionTargetSchema).min(1).max(8),
}).strict().superRefine((profile, ctx) => {
  const markers = Object.entries(profile.symbols);
  for (const [leftName, leftMarker] of markers) {
    for (const [rightName, rightMarker] of markers) {
      if (leftName >= rightName) continue;
      if (leftMarker === rightMarker) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['symbols', rightName],
          message: `structural marker "${rightMarker}" is reused by ${leftName} and ${rightName}`,
        });
      }
    }
  }
});

export type StructuralRuleProfileScope = z.infer<typeof structuralRuleProfileScopeSchema>;
export type StructuralParseWarningSeverity = z.infer<typeof structuralParseWarningSeveritySchema>;
export type StructuralRuleProfile = z.infer<typeof structuralRuleProfileSchema>;

export type StructuralBoundaryType =
  | 'morpheme'
  | 'feature'
  | 'clitic'
  | 'infix'
  | 'supplied'
  | 'alternation';

export type StructuralSegmentKind = 'lexical' | 'feature' | 'zero' | 'reduplication' | 'infix' | 'supplied';

export type StructuralParsedSegment = {
  id: string;
  text: string;
  kind: StructuralSegmentKind;
  wordIndex: number;
  startOffset: number;
  endOffset: number;
};

export type StructuralBoundary = {
  type: StructuralBoundaryType;
  marker: string;
  offset: number;
  wordIndex: number;
};

export type StructuralParsedFeature = {
  segmentId: string;
  label: string;
};

export type StructuralParseWarning = {
  type: 'empty_segment' | 'unmatched_wrapper' | 'alternation_marker';
  text: string;
  message: string;
  severity: StructuralParseWarningSeverity;
};

export type StructuralParseResult = {
  profileId: string;
  input: string;
  segments: StructuralParsedSegment[];
  boundaries: StructuralBoundary[];
  features: StructuralParsedFeature[];
  warnings: StructuralParseWarning[];
  projectionDiagnostics: ProjectionDiagnostic[];
};

export const DEFAULT_LEIPZIG_STRUCTURAL_PROFILE = {
  id: 'system.leipzig-structural.v1',
  label: 'Leipzig structural profile',
  version: '1',
  scope: 'system',
  symbols: {
    morphemeBoundary: '-',
    featureSeparator: '.',
    cliticBoundary: '=',
    infixStart: '<',
    infixEnd: '>',
    suppliedStart: '[',
    suppliedEnd: ']',
    alternationMarker: '\\',
  },
  zeroMarkers: ['ZERO', '0', '∅'],
  reduplicationMarkers: ['REDUP', 'RED'],
  warningPolicy: {
    emptySegment: 'warning',
    unmatchedWrapper: 'warning',
    alternationMarker: 'info',
  },
  projectionTargets: ['latex', 'conllu'],
} satisfies StructuralRuleProfile;

export function validateStructuralRuleProfile(input: unknown): StructuralRuleProfile {
  return structuralRuleProfileSchema.parse(input);
}

function startsWithMarker(input: string, offset: number, marker: string): boolean {
  return input.slice(offset, offset + marker.length) === marker;
}

/** True when the segment should be treated as an interlinear gloss feature label (vs surface/lexical material). */
function segmentLooksLikeGlossFeatureLabel(text: string): boolean {
  if (!text) return false;
  if (text !== text.toLocaleUpperCase('und')) return false;
  return /\p{Lu}|\p{N}/u.test(text);
}

function classifySegment(text: string, profile: StructuralRuleProfile, forcedKind?: StructuralSegmentKind): StructuralSegmentKind {
  if (forcedKind) return forcedKind;
  const upper = text.toUpperCase();
  if (profile.zeroMarkers.some((marker) => marker.toUpperCase() === upper)) return 'zero';
  if (profile.reduplicationMarkers.some((marker) => marker.toUpperCase() === upper)) return 'reduplication';
  if (segmentLooksLikeGlossFeatureLabel(text)) return 'feature';
  return 'lexical';
}

function createProjectionDiagnostics(profile: StructuralRuleProfile, warnings: StructuralParseWarning[]): ProjectionDiagnostic[] {
  const warningCount = warnings.filter((warning) => warning.severity === 'warning').length;
  return profile.projectionTargets.map((target) => projectionDiagnosticSchema.parse({
    target,
    status: warningCount > 0 ? 'needsReview' : 'complete',
    message: warningCount > 0
      ? `Structural parse has ${warningCount} warning(s); review before projecting to analysisGraph.`
      : 'Structural parse is ready for candidate analysisGraph projection.',
  }));
}

export function parseGlossStructure(
  input: string,
  profile: StructuralRuleProfile = DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
): StructuralParseResult {
  const resolvedProfile = validateStructuralRuleProfile(profile);
  const segments: StructuralParsedSegment[] = [];
  const boundaries: StructuralBoundary[] = [];
  const features: StructuralParsedFeature[] = [];
  const warnings: StructuralParseWarning[] = [];
  const symbols = resolvedProfile.symbols;

  let wordIndex = 0;
  let segmentIndex = 0;
  let buffer = '';
  let bufferStart = 0;

  const pushSegment = (endOffset: number, forcedKind?: StructuralSegmentKind) => {
    if (!buffer) return;
    const segment = {
      id: `seg-${segmentIndex + 1}`,
      text: buffer,
      kind: classifySegment(buffer, resolvedProfile, forcedKind),
      wordIndex,
      startOffset: bufferStart,
      endOffset,
    };
    segments.push(segment);
    // `features` lists morphosyntactic/grammatical feature tokens only; do not count `supplied` filler (coverage stats stay meaningful).
    if (segment.kind === 'feature' || segment.kind === 'zero' || segment.kind === 'infix') {
      features.push({ segmentId: segment.id, label: segment.text });
    }
    segmentIndex += 1;
    buffer = '';
  };

  const pushBoundary = (type: StructuralBoundaryType, marker: string, offset: number) => {
    boundaries.push({ type, marker, offset, wordIndex });
  };

  const pushEmptyWarning = (marker: string, offset: number) => {
    warnings.push({
      type: 'empty_segment',
      text: marker,
      message: `Empty segment before marker "${marker}" at offset ${offset}.`,
      severity: resolvedProfile.warningPolicy.emptySegment,
    });
  };

  const readWrapped = (startOffset: number, startMarker: string, endMarker: string): { text: string; endOffset: number } | undefined => {
    const contentStart = startOffset + startMarker.length;
    const endOffset = input.indexOf(endMarker, contentStart);
    if (endOffset < 0) return undefined;
    return { text: input.slice(contentStart, endOffset), endOffset };
  };

  for (let offset = 0; offset < input.length;) {
    const char = input[offset]!;
    if (/\s/.test(char)) {
      pushSegment(offset);
      wordIndex += 1;
      offset += 1;
      continue;
    }

    const separatorMatch = [
      { type: 'morpheme' as const, marker: symbols.morphemeBoundary },
      { type: 'feature' as const, marker: symbols.featureSeparator },
      { type: 'clitic' as const, marker: symbols.cliticBoundary },
    ].find((candidate) => startsWithMarker(input, offset, candidate.marker));

    if (separatorMatch) {
      if (!buffer) pushEmptyWarning(separatorMatch.marker, offset);
      pushSegment(offset);
      pushBoundary(separatorMatch.type, separatorMatch.marker, offset);
      offset += separatorMatch.marker.length;
      bufferStart = offset;
      continue;
    }

    if (startsWithMarker(input, offset, symbols.alternationMarker)) {
      pushSegment(offset);
      pushBoundary('alternation', symbols.alternationMarker, offset);
      warnings.push({
        type: 'alternation_marker',
        text: symbols.alternationMarker,
        message: 'Alternation marker parsed structurally; relation projection requires user review.',
        severity: resolvedProfile.warningPolicy.alternationMarker,
      });
      offset += symbols.alternationMarker.length;
      bufferStart = offset;
      continue;
    }

    if (startsWithMarker(input, offset, symbols.infixStart)) {
      pushSegment(offset);
      const wrapped = readWrapped(offset, symbols.infixStart, symbols.infixEnd);
      if (!wrapped) {
        warnings.push({
          type: 'unmatched_wrapper',
          text: symbols.infixStart,
          message: `Missing infix end marker "${symbols.infixEnd}".`,
          severity: resolvedProfile.warningPolicy.unmatchedWrapper,
        });
        offset += symbols.infixStart.length;
        bufferStart = offset;
        continue;
      }
      pushBoundary('infix', symbols.infixStart, offset);
      buffer = wrapped.text;
      bufferStart = offset + symbols.infixStart.length;
      pushSegment(wrapped.endOffset, 'infix');
      pushBoundary('infix', symbols.infixEnd, wrapped.endOffset);
      offset = wrapped.endOffset + symbols.infixEnd.length;
      bufferStart = offset;
      continue;
    }

    if (startsWithMarker(input, offset, symbols.suppliedStart)) {
      pushSegment(offset);
      const wrapped = readWrapped(offset, symbols.suppliedStart, symbols.suppliedEnd);
      if (!wrapped) {
        warnings.push({
          type: 'unmatched_wrapper',
          text: symbols.suppliedStart,
          message: `Missing supplied end marker "${symbols.suppliedEnd}".`,
          severity: resolvedProfile.warningPolicy.unmatchedWrapper,
        });
        offset += symbols.suppliedStart.length;
        bufferStart = offset;
        continue;
      }
      pushBoundary('supplied', symbols.suppliedStart, offset);
      buffer = wrapped.text;
      bufferStart = offset + symbols.suppliedStart.length;
      pushSegment(wrapped.endOffset, classifySegment(wrapped.text, resolvedProfile) === 'zero' ? 'zero' : 'supplied');
      pushBoundary('supplied', symbols.suppliedEnd, wrapped.endOffset);
      offset = wrapped.endOffset + symbols.suppliedEnd.length;
      bufferStart = offset;
      continue;
    }

    if (!buffer) bufferStart = offset;
    buffer += char;
    offset += 1;
  }

  pushSegment(input.length);

  return {
    profileId: resolvedProfile.id,
    input,
    segments,
    boundaries,
    features,
    warnings,
    projectionDiagnostics: createProjectionDiagnostics(resolvedProfile, warnings),
  };
}
