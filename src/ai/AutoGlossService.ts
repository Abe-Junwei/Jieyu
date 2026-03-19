import { getDb } from '../../db';
import type { LexemeDocType, UtteranceTokenDocType, TokenLexemeLinkDocType, Transcription, MultiLangString } from '../../db';
import { TaskRunner } from './tasks/TaskRunner';
import { getGlobalTaskRunner } from './tasks/taskRunnerSingleton';

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface AutoGlossMatch {
  tokenId: string;
  tokenForm: Transcription;
  lexemeId: string;
  lexemeLemma: Transcription;
  gloss: MultiLangString;
  confidence: number;
}

export interface AutoGlossResult {
  taskId?: string;
  utteranceId: string;
  matched: AutoGlossMatch[];
  skipped: number;
  total: number;
}

/**
 * Lexeme-based auto-gloss: exact-match token forms against lexeme lemmas,
 * then copy the first sense's gloss. No LLM required.
 */
export class AutoGlossService {
  constructor(private readonly taskRunner: TaskRunner = getGlobalTaskRunner()) {}

  /**
   * For each token in the given utterance that has no gloss yet,
   * look up lexemes whose lemma values contain an exact match for
   * one of the token's form values. If found, write the first
   * sense's gloss onto the token and create a link record.
   */
  async glossUtterance(utteranceId: string): Promise<AutoGlossResult> {
    const enqueued = await this.taskRunner.enqueue<AutoGlossResult>({
      taskType: 'gloss',
      targetId: utteranceId,
      targetType: 'utterance',
      modelId: 'lexeme-exact-match',
      maxAttempts: 1,
      run: async () => this.executeGloss(utteranceId),
    });

    const result = await enqueued.result;
    return {
      ...result,
      taskId: enqueued.taskId,
    };
  }

  private async executeGloss(utteranceId: string): Promise<AutoGlossResult> {
    const db = await getDb();
    const tokens = await db.collections.utterance_tokens.findByIndex('utteranceId', utteranceId);

    const allLexemes = await db.collections.lexemes.find().exec();
    const lexemes = allLexemes.map((d) => d.toJSON());

    // Build lowercased lemma → lexeme map for O(1) lookup
    const lemmaIndex = new Map<string, LexemeDocType>();
    for (const lex of lexemes) {
      for (const val of Object.values(lex.lemma)) {
        const key = val.toLowerCase();
        if (!lemmaIndex.has(key)) {
          lemmaIndex.set(key, lex);
        }
      }
    }

    const matched: AutoGlossMatch[] = [];
    let skipped = 0;
    const total = tokens.length;

    for (const tokenDoc of tokens) {
      const token: UtteranceTokenDocType = tokenDoc.toJSON();

      // Skip tokens that already have a gloss
      if (token.gloss && Object.keys(token.gloss).length > 0) {
        skipped += 1;
        continue;
      }

      // Try exact match of any form value
      let matchedLexeme: LexemeDocType | undefined;
      for (const formVal of Object.values(token.form)) {
        matchedLexeme = lemmaIndex.get(formVal.toLowerCase());
        if (matchedLexeme) break;
      }

      if (!matchedLexeme || matchedLexeme.senses.length === 0) {
        continue;
      }

      const gloss = matchedLexeme.senses[0]!.gloss;
      if (Object.keys(gloss).length === 0) continue;

      // Write gloss onto the token
      const now = new Date().toISOString();
      await db.collections.utterance_tokens.insert({
        ...token,
        gloss,
        updatedAt: now,
      });

      // Create token-lexeme link
      const link: TokenLexemeLinkDocType = {
        id: makeId('tll'),
        targetType: 'token',
        targetId: token.id,
        lexemeId: matchedLexeme.id,
        role: 'exact',
        confidence: 1.0,
        createdAt: now,
        updatedAt: now,
      };
      await db.collections.token_lexeme_links.insert(link);

      matched.push({
        tokenId: token.id,
        tokenForm: token.form,
        lexemeId: matchedLexeme.id,
        lexemeLemma: matchedLexeme.lemma,
        gloss,
        confidence: 1.0,
      });
    }

    return { utteranceId, matched, skipped, total };
  }
}
