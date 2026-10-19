import {
  applyAutoGlossWrites,
  listLexemesByTextIds,
  listUnitTokensByUnitId,
  type AutoGlossWrite,
} from '../db/storagePortAiAutoGloss';
import type {
  MultiLangString,
  TokenLexemeLinkDocType,
  TokenLexemeLinkRole,
  UnitTokenDocType,
} from '../db/types';
import { TaskRunner } from './tasks/TaskRunner';
import { getGlobalTaskRunner } from './tasks/taskRunnerSingleton';
import { LeipzigValidator, type LeipzigWarning as LzWarning } from './LeipzigValidator';
import { previewAutoGlossMatches } from './autoGlossPreview';

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface AutoGlossMatch {
  tokenId: string;
  tokenForm: UnitTokenDocType['form'];
  lexemeId: string;
  lexemeLemma: TranscriptionLike;
  gloss: MultiLangString;
  confidence: number;
  matchType: TokenLexemeLinkRole;
  linkId: string;
}

type TranscriptionLike = UnitTokenDocType['form'];

interface AutoGlossLeipzigHint {
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
  leipzigHints?: AutoGlossLeipzigHint[];
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
    const tokens = await listUnitTokensByUnitId(unitId);
    // 只用这些 token 所属项目的词条：词条按项目归属，跨项目链接会被归属中间件拒绝（GAP-1）
    // Only lexemes of the tokens' own project: lexemes are per project and cross-project links
    // are rejected by the ownership middleware (GAP-1)
    const tokenTextIds = [
      ...new Set(tokens.map((token) => token.textId.trim()).filter((id) => id.length > 0)),
    ];
    const lexemes = await listLexemesByTextIds(tokenTextIds);
    const preview = previewAutoGlossMatches(tokens, lexemes);

    const matched: AutoGlossMatch[] = [];
    const leipzigHints: AutoGlossLeipzigHint[] = [];
    const writes: AutoGlossWrite[] = [];

    for (const item of preview.matches) {
      const now = new Date().toISOString();
      const role: TokenLexemeLinkRole = item.matchType;
      const link: TokenLexemeLinkDocType = {
        id: makeId('tll'),
        targetType: 'token',
        targetId: item.tokenId,
        lexemeId: item.lexemeId,
        ...(item.senseId ? { senseId: item.senseId } : {}),
        role,
        confidence: item.confidence,
        createdAt: now,
        updatedAt: now,
      };
      writes.push({
        tokenId: item.tokenId,
        gloss: item.gloss,
        updatedAt: now,
        link,
      });

      matched.push({
        tokenId: item.tokenId,
        tokenForm: item.tokenForm,
        lexemeId: item.lexemeId,
        lexemeLemma: item.lexemeLemma,
        gloss: item.gloss,
        confidence: item.confidence,
        matchType: item.matchType,
        linkId: link.id,
      });

      for (const glossVal of Object.values(item.gloss)) {
        const validation = this.leipzigValidator.validateGloss(glossVal);
        if (!validation.valid) {
          leipzigHints.push({
            tokenId: item.tokenId,
            glossText: glossVal,
            warnings: validation.warnings,
          });
        }
      }
    }

    await applyAutoGlossWrites(writes);

    return {
      unitId,
      matched,
      skipped: preview.skipped,
      total: preview.total,
      ...(leipzigHints.length > 0 ? { leipzigHints } : {}),
    };
  }
}
