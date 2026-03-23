/**
 * Leipzig Glossing Rules 标准缩写验证器
 * Leipzig Glossing Rules standard abbreviation validator
 *
 * 基于 2008 版 Leipzig Glossing Rules (Max Planck Institute / University of Leipzig)
 * 提供非阻断式验证：缩写合法性 + 分隔符一致性
 * Non-blocking validation: abbreviation legality + separator consistency
 */

// ── 标准缩写集 | Standard abbreviation set ──

const STANDARD_ABBREVIATIONS: ReadonlySet<string> = new Set([
  // 人称 | Person
  '1', '2', '3',
  // 数 | Number
  'SG', 'PL', 'DU',
  // 格 | Case
  'NOM', 'ACC', 'GEN', 'DAT', 'ERG', 'ABS', 'VOC', 'LOC', 'INS', 'COM',
  'ALL', 'ABL', 'PRTV', 'ESS', 'TRANS', 'ILL', 'ELAT', 'INES', 'ADESS',
  'SUPER', 'SUB', 'DEL',
  // 时态 | Tense
  'PST', 'PRS', 'FUT',
  // 体 | Aspect
  'IPFV', 'PFV', 'PROG', 'PERF', 'HAB', 'PROSP',
  // 语气 | Mood
  'IND', 'SBJV', 'IMP', 'OPT', 'COND', 'POT', 'DEONT', 'EPIST',
  // 态 | Voice
  'ACT', 'PASS', 'MID', 'ANTIP', 'APPL', 'CAUS',
  // 确定性 | Definiteness
  'DEF', 'INDEF',
  // 性 | Gender
  'M', 'F', 'N',
  // 否定/疑问/关系 | Negation / Question / Relativizer
  'NEG', 'Q', 'REL',
  // 指示/指称 | Demonstrative / Deictic
  'DEM', 'PROX', 'MED', 'DIST',
  // 信息结构 | Information structure
  'TOP', 'FOC',
  // 动词范畴 | Verbal categories
  'COP', 'AUX', 'REFL', 'RECP', 'TR', 'INTR',
  // 名物化/派生 | Nominalization / Derivation
  'NMLZ', 'ADV', 'ADJ', 'CLF',
  // 非限定形式 | Non-finite forms
  'INF', 'PTCP', 'CONV', 'GER',
  // 比较 | Comparison
  'COMP', 'SUPERL',
  // 引述/证据 | Quotative / Evidential
  'QUOT', 'EV',
  // 方向/传据 | Directional / Evidentiality
  'DIR', 'INDIR',
  // 兼容性 | Clusivity
  'EXCL', 'INCL',
  // 有生性 | Animacy
  'ANIM', 'INAN', 'HUM', 'NHUM',
  // 语义角色 | Semantic roles
  'AGT', 'PAT', 'EXP', 'THEM', 'REC', 'BEN', 'INSTR',
  // 其他常用 | Other common
  'POSS', 'ASSOC', 'PURP', 'ITER', 'INTENS', 'DIM', 'AUG',
  'HON', 'OBL', 'OBV',
]);

// ── 类别 → 标准缩写映射 | Category → standard abbreviations ──

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

// ── 验证结果接口 | Validation result interfaces ──

export type LeipzigWarningSeverity = 'info' | 'warning';

export interface LeipzigWarning {
  /** 警告类型 | Warning type */
  type: 'non_standard_abbreviation' | 'separator_inconsistency' | 'mixed_case';
  /** 问题文本 | Problematic text */
  text: string;
  /** 说明 | Description */
  message: string;
  severity: LeipzigWarningSeverity;
}

export interface LeipzigValidationResult {
  /** 是否完全合规 | Fully compliant */
  valid: boolean;
  /** 警告列表 | Warning list */
  warnings: LeipzigWarning[];
  /** 识别到的缩写 | Recognized abbreviations */
  recognizedAbbreviations: string[];
  /** 未识别的缩写 | Unrecognized abbreviations */
  unknownAbbreviations: string[];
}

// ── 核心验证类 | Core validator class ──

export class LeipzigValidator {
  /** 用户自定义扩展缩写 | User-defined extension abbreviations */
  private readonly customAbbreviations: Set<string>;

  constructor(customAbbreviations?: Iterable<string>) {
    this.customAbbreviations = new Set(customAbbreviations);
  }

  // ── 公开 API | Public API ──

  /**
   * 判断缩写是否为 Leipzig 标准
   * Check if an abbreviation is Leipzig standard
   */
  isStandardAbbreviation(abbr: string): boolean {
    return STANDARD_ABBREVIATIONS.has(abbr.toUpperCase());
  }

  /**
   * 判断缩写是否在标准 + 自定义集中
   * Check if abbreviation is in standard + custom set
   */
  isKnownAbbreviation(abbr: string): boolean {
    const upper = abbr.toUpperCase();
    return STANDARD_ABBREVIATIONS.has(upper) || this.customAbbreviations.has(upper);
  }

  /**
   * 验证一条 gloss 文本（如 "3.SG.PST"）
   * Validate a single gloss text (e.g. "3.SG.PST")
   */
  validateGloss(glossText: string): LeipzigValidationResult {
    const warnings: LeipzigWarning[] = [];
    const recognized: string[] = [];
    const unknown: string[] = [];

    if (!glossText.trim()) {
      return { valid: true, warnings, recognizedAbbreviations: recognized, unknownAbbreviations: unknown };
    }

    // 分隔词素级 gloss（按 - 分隔）| Split morpheme-level glosses by hyphen
    const morphemeGlosses = glossText.split('-');

    for (const mg of morphemeGlosses) {
      // 跳过纯词汇 gloss（小写，如 "dog", "run"）| Skip lexical glosses (lowercase)
      if (mg === mg.toLowerCase() && /^[a-z]/.test(mg)) {
        continue;
      }

      // 按 . 分隔语法标签 | Split grammatical labels by period
      const parts = mg.split('.');

      for (const part of parts) {
        if (!part) continue;

        // 纯数字人称标记（1, 2, 3）直接识别 | Person numbers
        if (/^\d+$/.test(part)) {
          if (this.isKnownAbbreviation(part)) {
            recognized.push(part);
          } else {
            unknown.push(part);
            warnings.push({
              type: 'non_standard_abbreviation',
              text: part,
              message: `非标准人称标记 "${part}" | Non-standard person marker "${part}"`,
              severity: 'warning',
            });
          }
          continue;
        }

        // 纯小写词汇 gloss 跳过 | Skip lowercase lexical glosses
        if (part === part.toLowerCase() && /^[a-z]/.test(part)) {
          continue;
        }

        // 大写/混合大小写 → 检查是否标准缩写 | Uppercase/mixed → check standard
        const upper = part.toUpperCase();
        if (this.isKnownAbbreviation(upper)) {
          recognized.push(upper);
          // 检查大小写规范 | Check casing convention (Leipzig uses SMALL CAPS)
          if (part !== upper && part !== part.toUpperCase()) {
            warnings.push({
              type: 'mixed_case',
              text: part,
              message: `建议使用全大写 "${upper}" 代替 "${part}" | Prefer uppercase "${upper}" over "${part}"`,
              severity: 'info',
            });
          }
        } else if (/[A-Z]/.test(part)) {
          // 含大写但不在标准集中 | Contains uppercase but not standard
          unknown.push(part);
          warnings.push({
            type: 'non_standard_abbreviation',
            text: part,
            message: `非标准缩写 "${part}"，不在 Leipzig 规则集中 | Non-standard abbreviation "${part}", not in Leipzig set`,
            severity: 'warning',
          });
        }
      }
    }

    // 分隔符一致性检查 | Separator consistency check
    this.checkSeparatorConsistency(glossText, warnings);

    return {
      valid: warnings.length === 0,
      warnings,
      recognizedAbbreviations: recognized,
      unknownAbbreviations: unknown,
    };
  }

  /**
   * 批量验证多条 gloss
   * Validate multiple gloss entries
   */
  validateBatch(glossTexts: string[]): Map<string, LeipzigValidationResult> {
    const results = new Map<string, LeipzigValidationResult>();
    for (const text of glossTexts) {
      results.set(text, this.validateGloss(text));
    }
    return results;
  }

  // ── 静态工具方法 | Static utility methods ──

  /**
   * 获取某个类别下的所有标准缩写
   * Get all standard abbreviations for a category
   */
  static getStandardByCategory(category: string): readonly string[] {
    return CATEGORY_MAP[category] ?? [];
  }

  /**
   * 获取所有标准缩写
   * Get all standard abbreviations
   */
  static getAllStandard(): ReadonlySet<string> {
    return STANDARD_ABBREVIATIONS;
  }

  // ── 内部方法 | Internal methods ──

  /**
   * 检查分隔符一致性 | Check separator consistency
   *
   * Leipzig 规则：
   *   - `.` 分隔同一词素内的多个语法含义 (如 3.SG.PST)
   *   - `-` 分隔不同词素的 gloss (如 dog-PL)
   *
   * 常见问题：
   *   - 在应使用 `.` 的地方用了 `-`（如 "3-SG" 应为 "3.SG"）
   *   - 混用 `:` 或其他分隔符
   */
  private checkSeparatorConsistency(text: string, warnings: LeipzigWarning[]): void {
    // 检查是否使用了非标准分隔符（冒号、斜杠等） | Check non-standard separators
    if (/[:;/\\]/.test(text)) {
      warnings.push({
        type: 'separator_inconsistency',
        text,
        message: `使用了非标准分隔符，Leipzig 规则仅允许 "." 和 "-" | Non-standard separator detected; Leipzig rules allow only "." and "-"`,
        severity: 'warning',
      });
    }

    // 检查 "-" 连接的两个全大写语法标签（可能应该用 "."）
    // Check if "-" joins two all-caps grammar tags (should likely use ".")
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
          message: `"${leftTail}-${rightHead}" 中两个语法标签用 "-" 连接，可能应使用 "."（如 "${leftTail}.${rightHead}"）| "${leftTail}-${rightHead}" joins two grammatical labels with "-", consider using "." (e.g. "${leftTail}.${rightHead}")`,
          severity: 'info',
        });
      }
    }
  }
}
