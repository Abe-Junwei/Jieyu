/**
 * 词条嵌套 id 归一化（JY-23）| Lexeme nested-id normalization (JY-23)
 *
 * 以前 `validateLexemeDoc` 在校验时原地补齐 entry / sense 的 id，写入校验中间件因此既改值又校验。
 * 现在校验器是纯函数，补 id 由本中间件显式完成：只处理 `lexemes` 表的 add / put，
 * 对缺 id 的行生成补齐后的副本（不改调用方对象），然后交给下层的 zod 写入校验。
 * 同步执行，不读库、不 await。
 *
 * `validateLexemeDoc` used to fill entry / sense ids in place while validating. The validator is
 * now pure; this middleware fills ids explicitly for `lexemes` add / put by writing filled COPIES
 * (caller objects are not mutated) before the zod write validation below it. Synchronous only.
 *
 * level 11：位于 zod 写入校验（默认 level 10）之上，校验看到的就是补齐后的最终值。
 * Level 11 sits above the zod write validation (default level 10), which sees the filled values.
 */
import type { DBCore, DBCoreMutateRequest, Middleware } from 'dexie';
import { withLexemeNestedIds } from './lexemeNestedIds';

const MIDDLEWARE_NAME = 'jieyuLexemeNestedIds';
export const LEXEME_NESTED_IDS_MIDDLEWARE_LEVEL = 11;

function normalizeMutation(req: DBCoreMutateRequest): DBCoreMutateRequest {
  if (req.type !== 'add' && req.type !== 'put') return req;
  let changed = false;
  const values = req.values.map((row) => {
    const next = withLexemeNestedIds(row);
    if (next !== row) changed = true;
    return next;
  });
  return changed ? { ...req, values } : req;
}

export function createLexemeNestedIdsMiddleware(): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: MIDDLEWARE_NAME,
    level: LEXEME_NESTED_IDS_MIDDLEWARE_LEVEL,
    create(down) {
      return {
        ...down,
        table(tableName) {
          const downTable = down.table(tableName);
          if (tableName !== 'lexemes') return downTable;
          return {
            ...downTable,
            mutate(req: DBCoreMutateRequest) {
              return downTable.mutate(normalizeMutation(req));
            },
          };
        },
      };
    },
  };
}
