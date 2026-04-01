/**
 * Leipzig Glossing Rules standard abbreviation validator.
 *
 * Based on the 2008 Leipzig Glossing Rules (Max Planck Institute / University of Leipzig).
 * Provides non-blocking validation: abbreviation legality and separator consistency.
 */

// Standard abbreviation set.

const STANDARD_ABBREVIATIONS: ReadonlySet<string> = new Set([
  // Person
  '1', '2', '3',
  // Number
  'SG', 'PL', 'DU',
  // Case
  'NOM', 'ACC', 'GEN', 'DAT', 'ERG', 'ABS', 'VOC', 'LOC', 'INS', 'COM',
  'ALL', 'ABL', 'PRTV', 'ESS', 'TRANS', 'ILL', 'ELAT', 'INES', 'ADESS',
  'SUPER', 'SUB', 'DEL',
  // Tense
  'PST', 'PRS', 'FUT',
  // Aspect
  'IPFV', 'PFV', 'PROG', 'PERF', 'HAB', 'PROSP',
  // Mood
  'IND', 'SBJV', 'IMP', 'OPT', 'COND', 'POT', 'DEONT', 'EPIST',
  // Voice
  'ACT', 'PASS', 'MID', 'ANTIP', 'APPL', 'CAUS',
  // Definiteness
  'DEF', 'INDEF',
  // Gender
  'M', 'F', 'N',
  // Negation / question / relativizer
  'NEG', 'Q', 'REL',
  // Demonstrative / deictic
  'DEM', 'PROX', 'MED', 'DIST',
  // Information structure
  'TOP', 'FOC',
  // Verbal categories
  'COP', 'AUX', 'REFL', 'RECP', 'TR', 'INTR',
  // Nominalization / derivation
  'NMLZ', 'ADV', 'ADJ', 'CLF',
  // Non-finite forms
  'INF', 'PTCP', 'CONV', 'GER',
  // Comparison
  'COMP', 'SUPERL',
  // Quotative / evidential
  'QUOT', 'EV',
  // Directional / evidentiality
  'DIR', 'INDIR',
  // Clusivity
  'EXCL', 'INCL',
  // Animacy
  'ANIM', 'INAN', 'HUM', 'NHUM',
  // Semantic roles
  'AGT', 'PAT', 'EXP', 'THEM', 'REC', 'BEN', 'INSTR',
  // Other common
  'POSS', 'ASSOC', 'PURP', 'ITER', 'INTENS', 'DIM', 'AUG',
  'HON', 'OBL', 'OBV',
]);

// Category to standard abbreviation mapping.

const CATEGORY_MAP: Readonly<Record<string, readonly string[]>> = {
  person:  ['1', '2', '3'],
  number:  ['SG', 'PL', 'DU'],
  tense:   ['PST', 'PRS', 'FUT'],
  aspect:  ['IPFV', 'PFV', 'PROG', 'PERF', 'HAB', 'PROSP'],
  mood:    ['IND', 'SBJV', 'IMP', 'OPT', 'COND', 'POT', 'DEONT', 'EPIST'],
  case:    ['NOM', 'ACC', 'GEN', 'DAT', 'ERG', 'ABS', 'VOC', 'LOC', 'INS', 'COM',
            'ALL', 'ABL', 'PRTV', 'ESS', 'TRANS', 'ILL', 'ELAT', 'INES', 'ADESS',
            'SUPER', 'SUB', 'DEL'],
  voice:   ['ACT', 'PASS', 'MID', 'ANTIP', 'APPL', 'CAUS'],
  other:   ['DEF','INDEF','M','F','N','NEG','Q','REL','DEM','PROX','MED','DIST',
            'TOP','FOC','COP','AUX','REFL','RECP','TR','INTR','NMLZ','ADV','ADJ',
            'CLF','INF','PTCP','CONV','GER','COMP','SUPERL','QUOT','EV','DIR','INDIR',
            'EXCL','INCL','ANIM','INAN','HUM','NHUM','AGT','PAT','EXP','THEM','REC',
            'BEN','INSTR','POSS','ASSOC','PURP','ITER','INTENS','DIM','AUG','HON',
            'OBL','OBV'],
};

// Validation result interfaces.

export type LeipzigWarningSeverity = 'info' | 'warning';

export interface LeipzigWarning {
  /** Warning type. */
  type: 'non_standard_abbreviation' | 'separator_inconsistency' | 'mixed_case';
  /** Problematic text. */
  text: string;
  /** Description. */
  message: string;
  severity: LeipzigWarningSeverity;
}

export interface LeipzigValidationResult {
  /** Whether the gloss is fully compliant. */
  valid: boolean;
  /** Warning list. */
  warnings: LeipzigWarning[];
  /** Recognized abbreviations. */
  recognizedAbbreviations: string[];
  /** Unrecognized abbreviations. */
  unknownAbbreviations: string[];
}

// Core validator class.

export class LeipzigValidator {
  /** User-defined extension abbreviations. */
  private readonly customAbbreviations: Set<string>;

  constructor(customAbbreviations?: Iterable<string>) {
    this.customAbbreviations = new Set(customAbbreviations);
  }

  // Public API.

  /**
   * Check if an abbreviation is Leipzig standard.
   */
  isStandardAbbreviation(abbr: string): boolean {
    return STANDARD_ABBREVIATIONS.has(abbr.toUpperCase());
  }

  /**
   * Check if an abbreviation is in the standard or custom set.
   */
  isKnownAbbreviation(abbr: string): boolean {
    const upper = abbr.toUpperCase();
    return STANDARD_ABBREVIATIONS.has(upper) || this.customAbbreviations.has(upper);
  }

  /**
   * Validate a single gloss text, e.g. "3.SG.PST".
   */
  validateGloss(glossText: string): LeipzigValidationResult {
    const warnings: LeipzigWarning[] = [];
    const recognized: string[] = [];
    const unknown: string[] = [];

    if (!glossText.trim()) {
      return { valid: true, warnings, recognizedAbbreviations: recognized, unknownAbbreviations: unknown };
    }

    // Split morpheme-level glosses by hyphen.
    const morphemeGlosses = glossText.split('-');

    for (const mg of morphemeGlosses) {
      // Skip lexical glosses written in lowercase, e.g. "dog" or "run".
      if (mg === mg.toLowerCase() && /^[a-z]/.test(mg)) {
        continue;
      }

      // Split grammatical labels by period.
      const parts = mg.split('.');

      for (const part of parts) {
        if (!part) continue;

        // Directly recognize numeric person markers such as 1, 2, or 3.
        if (/^\d+$/.test(part)) {
          if (this.isKnownAbbreviation(part)) {
            recognized.push(part);
          } else {
            unknown.push(part);
            warnings.push({
              type: 'non_standard_abbreviation',
              text: part,
              message: `\u975e\u6807\u51c6\u4eba\u79f0\u6807\u8bb0 "${part}" | Non-standard person marker "${part}"`,
              severity: 'warning',
            });
          }
          continue;
        }

        // Skip lowercase lexical glosses.
        if (part === part.toLowerCase() && /^[a-z]/.test(part)) {
          continue;
        }

        // Check uppercase or mixed-case abbreviations against the standard set.
        const upper = part.toUpperCase();
        if (this.isKnownAbbreviation(upper)) {
          recognized.push(upper);
          // Check casing convention; Leipzig uses small caps in practice.
          if (part !== upper && part !== part.toUpperCase()) {
            warnings.push({
              type: 'mixed_case',
              text: part,
              message: `\u5efa\u8bae\u4f7f\u7528\u5168\u5927\u5199 "${upper}" \u4ee3\u66ff "${part}" | Prefer uppercase "${upper}" over "${part}"`,
              severity: 'info',
            });
          }
        } else if (/[A-Z]/.test(part)) {
          // Contains uppercase letters but is not in the standard set.
          unknown.push(part);
          warnings.push({
            type: 'non_standard_abbreviation',
            text: part,
            message: `\u975e\u6807\u51c6\u7f29\u5199 "${part}"\uff0c\u4e0d\u5728 Leipzig \u89c4\u5219\u96c6\u4e2d | Non-standard abbreviation "${part}", not in Leipzig set`,
            severity: 'warning',
          });
        }
      }
    }

    // Separator consistency check.
    this.checkSeparatorConsistency(glossText, warnings);

    return {
      valid: warnings.length === 0,
      warnings,
      recognizedAbbreviations: recognized,
      unknownAbbreviations: unknown,
    };
  }

  /**
   * Validate multiple gloss entries.
   */
  validateBatch(glossTexts: string[]): Map<string, LeipzigValidationResult> {
    const results = new Map<string, LeipzigValidationResult>();
    for (const text of glossTexts) {
      results.set(text, this.validateGloss(text));
    }
    return results;
  }

  // Static utility methods.

  /**
   * Get all standard abbreviations for a category.
   */
  static getStandardByCategory(category: string): readonly string[] {
    return CATEGORY_MAP[category] ?? [];
  }

  /**
   * Get all standard abbreviations.
   */
  static getAllStandard(): ReadonlySet<string> {
    return STANDARD_ABBREVIATIONS;
  }

  // Internal methods.

  /**
   * Check separator consistency.
   *
   * Leipzig rules:
   *   - `.` separates multiple grammatical meanings within the same morpheme (e.g. 3.SG.PST)
   *   - `-` separates glosses belonging to different morphemes (e.g. dog-PL)
   *
   * Common issues:
   *   - Using `-` where `.` should be used, e.g. "3-SG" instead of "3.SG"
   *   - Mixing `:` or other separators
   */
  private checkSeparatorConsistency(text: string, warnings: LeipzigWarning[]): void {
    // Check for non-standard separators such as colons or slashes.
    if (/[:;/\\]/.test(text)) {
      warnings.push({
        type: 'separator_inconsistency',
        text,
        message: `\u4f7f\u7528\u4e86\u975e\u6807\u51c6\u5206\u9694\u7b26\uff0cLeipzig \u89c4\u5219\u4ec5\u5141\u8bb8 "." \u548c "-" | Non-standard separator detected; Leipzig rules allow only "." and "-"`,
        severity: 'warning',
      });
    }

    // Check whether "-" joins two all-caps grammar tags that likely need ".".
    const segments = text.split('-');
    for (let i = 0; i < segments.length - 1; i++) {
      const left = segments[i]!;
      const right = segments[i + 1]!;
      const leftTail = left.split('.').pop() ?? '';
      const rightHead = right.split('.')[0] ?? '';

      if (
        leftTail && rightHead &&
        leftTail === leftTail.toUpperCase() && /^[A-Z0-9]+$/.test(leftTail) &&
        rightHead === rightHead.toUpperCase() && /^[A-Z0-9]+$/.test(rightHead) &&
        this.isKnownAbbreviation(leftTail) && this.isKnownAbbreviation(rightHead)
      ) {
        warnings.push({
          type: 'separator_inconsistency',
          text: `${leftTail}-${rightHead}`,
          message: `"${leftTail}-${rightHead}" \u4e2d\u4e24\u4e2a\u8bed\u6cd5\u6807\u7b7e\u7528 "-" \u8fde\u63a5\uff0c\u53ef\u80fd\u5e94\u4f7f\u7528 "."\uff08\u5982 "${leftTail}.${rightHead}"\uff09| "${leftTail}-${rightHead}" joins two grammatical labels with "-", consider using "." (e.g. "${leftTail}.${rightHead}")`,
          severity: 'info',
        });
      }
    }
  }
}
