import { getDb } from '../db';
import type {
  MultiLangString,
  TokenLexemeLinkDocType,
  TokenLexemeLinkRole,
  UnitTokenDocType,
} from '../db';
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
    const db = await getDb();
    const tokens = (await db.collections.unit_tokens.findByIndex('unitId', unitId)).map((doc) =>
      doc.toJSON(),
    );
    const lexemes = (await db.collections.lexemes.find().exec()).map((doc) => doc.toJSON());
    const preview = previewAutoGlossMatches(tokens, lexemes);

    const matched: AutoGlossMatch[] = [];
    const leipzigHints: AutoGlossLeipzigHint[] = [];

    for (const item of preview.matches) {
      const now = new Date().toISOString();
      await db.collections.unit_tokens.update(item.tokenId, {
        gloss: item.gloss,
        updatedAt: now,
      });

      const role: TokenLexemeLinkRole = item.matchType;
      const link: TokenLexemeLinkDocType = {
        id: makeId('tll'),
        targetType: 'token',
        targetId: item.tokenId,
        lexemeId: item.lexemeId,
        role,
        confidence: item.confidence,
        createdAt: now,
        updatedAt: now,
      };
      await db.collections.token_lexeme_links.insert(link);

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

    return {
      unitId,
      matched,
      skipped: preview.skipped,
      total: preview.total,
      ...(leipzigHints.length > 0 ? { leipzigHints } : {}),
    };
  }
}
