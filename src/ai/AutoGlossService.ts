import { getDb } from '../db';
import type { LexemeDocType, UnitTokenDocType, TokenLexemeLinkDocType, TokenLexemeLinkRole, Transcription, MultiLangString } from '../db';
import { TaskRunner } from './tasks/TaskRunner';
import { getGlobalTaskRunner } from './tasks/taskRunnerSingleton';
import { LeipzigValidator, type LeipzigWarning as LzWarning } from './LeipzigValidator';

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── 匹配策略常量 | Match strategy constants ──

/** 前缀匹配最小重叠字符数 | Minimum overlap for prefix matching */
const MIN_PREFIX_LEN = 2;
/** 子串匹配最小重叠字符数 | Minimum overlap for substring matching */
const MIN_SUBSTRING_LEN = 3;

// ── 匹配类型与置信度 | Match types & confidence ──

type MatchType = 'exact' | 'stem' | 'gloss_candidate';

const MATCH_CONFIDENCE: Record<MatchType, number> = {
  exact: 1.0,
  stem: 0.75,
  gloss_candidate: 0.5,
};

export interface AutoGlossMatch {
  tokenId: string;
  tokenForm: Transcription;
  lexemeId: string;
  lexemeLemma: Transcription;
  gloss: MultiLangString;
  confidence: number;
  /** 匹配策略标签 | Match strategy label */
  matchType: MatchType;
}

/** Leipzig 规则提示（每个已赋 gloss 的 token） | Leipzig hint per glossed token */
export interface AutoGlossLeipzigHint {
  tokenId: string;
  glossText: string;
  warnings: LzWarning[];
}

export interface AutoGlossResult {
  taskId?: string;
  unitId: string;
  matched: AutoGlossMatch[];
  skipped: number;
  total: number;
  /** Leipzig 规则非阻断提示 | Non-blocking Leipzig hints */
  leipzigHints?: AutoGlossLeipzigHint[];
}

// ── Lexeme 索引条目 | Lexeme index entry ──

interface LexemeIndexEntry {
  lexeme: LexemeDocType;
  /** 所有可用于匹配的小写值（lemma + forms） | All lowercased matchable values */
  values: string[];
}

/**
 * 基于词库的自动标注引擎：精确匹配 → 前缀匹配 → 子串匹配
 * Lexeme-based auto-gloss engine: exact → prefix → substring matching
 */
export class AutoGlossService {
  private readonly leipzigValidator: LeipzigValidator;

  constructor(private readonly taskRunner: TaskRunner = getGlobalTaskRunner()) {
    this.leipzigValidator = new LeipzigValidator();
  }

  /**
   * 对给定 unit 中尚无 gloss 的 token 自动标注
   * Auto-gloss unglossed tokens in the given unit
   */
  async glossUnit(unitId: string): Promise<AutoGlossResult> {
    const enqueued = await this.taskRunner.enqueue<AutoGlossResult>({
      taskType: 'gloss',
      targetId: unitId,
      targetType: 'unit',
      modelId: 'lexeme-match',
      maxAttempts: 1,
      run: async () => this.executeGloss(unitId),
    });

    const result = await enqueued.result;
    return {
      ...result,
      taskId: enqueued.taskId,
    };
  }

  private async executeGloss(unitId: string): Promise<AutoGlossResult> {
    const db = await getDb();
    const tokens = await db.collections.unit_tokens.findByIndex('unitId', unitId);

    const allLexemes = await db.collections.lexemes.find().exec();
    const lexemes = allLexemes.map((d) => d.toJSON());

    // 构建索引 | Build index
    const { exactMap, entries } = buildLexemeIndex(lexemes);

    const matched: AutoGlossMatch[] = [];
    const leipzigHints: AutoGlossLeipzigHint[] = [];
    let skipped = 0;
    const total = tokens.length;

    for (const tokenDoc of tokens) {
      const token: UnitTokenDocType = tokenDoc.toJSON();

      // 跳过已有 gloss 的 token | Skip tokens with existing gloss
      if (token.gloss && Object.keys(token.gloss).length > 0) {
        skipped += 1;
        continue;
      }

      const formValues = Object.values(token.form).map((v) => v.toLowerCase());

      // 1. 精确匹配 O(1) | Exact match
      let best = findExactMatch(formValues, exactMap);

      // 2. 前缀匹配 | Prefix match (lemma is prefix of form → stem)
      if (!best) {
        best = findPrefixMatch(formValues, entries);
      }

      // 3. 子串匹配 | Substring match
      if (!best) {
        best = findSubstringMatch(formValues, entries);
      }

      if (!best || best.lexeme.senses.length === 0) continue;

      const gloss = best.lexeme.senses[0]!.gloss;
      if (Object.keys(gloss).length === 0) continue;

      // 写入 gloss | Write gloss
      const now = new Date().toISOString();
      await db.collections.unit_tokens.update(token.id, {
        gloss,
        updatedAt: now,
      });

      // 创建链接 | Create link
      const role: TokenLexemeLinkRole = best.matchType;
      const link: TokenLexemeLinkDocType = {
        id: makeId('tll'),
        targetType: 'token',
        targetId: token.id,
        lexemeId: best.lexeme.id,
        role,
        confidence: best.confidence,
        createdAt: now,
        updatedAt: now,
      };
      await db.collections.token_lexeme_links.insert(link);

      matched.push({
        tokenId: token.id,
        tokenForm: token.form,
        lexemeId: best.lexeme.id,
        lexemeLemma: best.lexeme.lemma,
        gloss,
        confidence: best.confidence,
        matchType: best.matchType,
      });

      // Leipzig 非阻断提示 | Non-blocking Leipzig hint
      for (const glossVal of Object.values(gloss)) {
        const validation = this.leipzigValidator.validateGloss(glossVal);
        if (!validation.valid) {
          leipzigHints.push({
            tokenId: token.id,
            glossText: glossVal,
            warnings: validation.warnings,
          });
        }
      }
    }

    return {
      unitId, matched, skipped, total,
      ...(leipzigHints.length > 0 ? { leipzigHints } : {}),
    };
  }
}

// ── 索引构建 | Index building ──

interface LexemeIndex {
  /** 小写值 → lexeme 的精确查找表 | Lowercased value → lexeme for O(1) exact lookup */
  exactMap: Map<string, LexemeDocType>;
  /** 完整条目列表（含所有可匹配值）| Full entry list for fuzzy scanning */
  entries: LexemeIndexEntry[];
}

function buildLexemeIndex(lexemes: LexemeDocType[]): LexemeIndex {
  const exactMap = new Map<string, LexemeDocType>();
  const entries: LexemeIndexEntry[] = [];

  for (const lex of lexemes) {
    const values: string[] = [];

    // lemma 所有值 | All lemma values
    for (const val of Object.values(lex.lemma)) {
      const key = val.toLowerCase();
      values.push(key);
      if (!exactMap.has(key)) {
        exactMap.set(key, lex);
      }
    }

    // forms[] 中的所有 transcription 值 | All forms[] transcription values
    if (lex.forms) {
      for (const form of lex.forms) {
        for (const val of Object.values(form.transcription)) {
          const key = val.toLowerCase();
          values.push(key);
          if (!exactMap.has(key)) {
            exactMap.set(key, lex);
          }
        }
      }
    }

    entries.push({ lexeme: lex, values });
  }

  return { exactMap, entries };
}

// ── 匹配函数 | Match functions ──

interface MatchResult {
  lexeme: LexemeDocType;
  matchType: MatchType;
  confidence: number;
  /** 匹配重叠长度（用于排序） | Overlap length for ranking */
  overlap: number;
}

function findExactMatch(
  formValues: string[],
  exactMap: Map<string, LexemeDocType>,
): MatchResult | undefined {
  for (const fv of formValues) {
    const lex = exactMap.get(fv);
    if (lex) {
      return { lexeme: lex, matchType: 'exact', confidence: MATCH_CONFIDENCE.exact, overlap: fv.length };
    }
  }
  return undefined;
}

/**
 * 前缀匹配：lemma 是 form 的前缀（stem 关系）
 * Prefix match: lemma is a prefix of form (stem relationship)
 */
function findPrefixMatch(
  formValues: string[],
  entries: LexemeIndexEntry[],
): MatchResult | undefined {
  let best: MatchResult | undefined;

  for (const entry of entries) {
    for (const fv of formValues) {
      for (const lv of entry.values) {
        if (lv.length < MIN_PREFIX_LEN || fv.length <= lv.length) continue;
        if (fv.startsWith(lv)) {
          // lemma 是 form 的前缀 → stem 关系 | lemma is prefix of form → stem
          if (!best || lv.length > best.overlap) {
            best = {
              lexeme: entry.lexeme,
              matchType: 'stem',
              confidence: MATCH_CONFIDENCE.stem,
              overlap: lv.length,
            };
          }
        }
      }
    }
  }

  return best;
}

/**
 * 子串匹配：form 包含 lemma 或 lemma 包含 form（非前缀位置）
 * Substring match: form contains lemma or lemma contains form (non-prefix)
 */
function findSubstringMatch(
  formValues: string[],
  entries: LexemeIndexEntry[],
): MatchResult | undefined {
  let best: MatchResult | undefined;

  for (const entry of entries) {
    for (const fv of formValues) {
      for (const lv of entry.values) {
        const shorter = fv.length <= lv.length ? fv : lv;
        const longer = fv.length <= lv.length ? lv : fv;

        if (shorter.length < MIN_SUBSTRING_LEN) continue;
        // 排除精确和前缀（已在前面处理）| Exclude exact & prefix (handled earlier)
        if (shorter.length === longer.length) continue;
        if (longer.startsWith(shorter)) continue;

        if (longer.includes(shorter)) {
          if (!best || shorter.length > best.overlap) {
            best = {
              lexeme: entry.lexeme,
              matchType: 'gloss_candidate',
              confidence: MATCH_CONFIDENCE.gloss_candidate,
              overlap: shorter.length,
            };
          }
        }
      }
    }
  }

  return best;
}
