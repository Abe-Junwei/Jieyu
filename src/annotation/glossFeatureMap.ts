/**
 * Unambiguous Leipzig labels mapped to UD / UniMorph feature names.
 * The display gloss stays as written. Ambiguous labels such as `S` are not rewritten.
 */
const UNAMBIGUOUS_GLOSS_FEATURES: Record<string, Record<string, string>> = {
  PL: { Number: 'Plur' },
  SG: { Number: 'Sing' },
  DU: { Number: 'Dual' },
  PST: { Tense: 'Past' },
  PRS: { Tense: 'Pres' },
  FUT: { Tense: 'Fut' },
  NEG: { Polarity: 'Neg' },
  ACC: { Case: 'Acc' },
  NOM: { Case: 'Nom' },
  ERG: { Case: 'Erg' },
  '1SG': { Person: '1', Number: 'Sing' },
  '2SG': { Person: '2', Number: 'Sing' },
  '3SG': { Person: '3', Number: 'Sing' },
  '1PL': { Person: '1', Number: 'Plur' },
  '2PL': { Person: '2', Number: 'Plur' },
  '3PL': { Person: '3', Number: 'Plur' },
};

const AMBIGUOUS_GLOSS_LABELS = new Set(['S']);

export type GlossFeatureMapping = {
  features: Record<string, string>;
  reviews: string[];
};

function piecesOf(label: string): string[] {
  return label
    .split(/[-.=<>]+/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
}

export function mapGlossLabelToFeatures(label: string): GlossFeatureMapping {
  const raw = label.trim();
  const features: Record<string, string> = {};
  const reviews: string[] = [];
  const whole = UNAMBIGUOUS_GLOSS_FEATURES[raw];
  const candidates = whole ? [raw] : piecesOf(raw);
  for (const piece of candidates) {
    if (AMBIGUOUS_GLOSS_LABELS.has(piece)) {
      reviews.push(`Gloss label ${piece} is ambiguous and was not rewritten.`);
      continue;
    }
    const mapped = UNAMBIGUOUS_GLOSS_FEATURES[piece];
    if (!mapped) continue;
    Object.assign(features, mapped);
  }
  return { features, reviews };
}
