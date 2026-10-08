/**
 * 统一写入校验（rev5 4.4 / T50）| Unified write validation (rev5 4.4 / T50)
 *
 * Dexie 的 stores 字符串只声明主键和索引，不拒绝缺字段的行。本中间件挂在主库 DBCore 上，
 * 对 add / put（含 bulkAdd、bulkPut，以及 update、modify 落到 DBCore 的 put）逐行跑该表的同步 zod 校验器；
 * 不合格时抛出带表名和字段路径的错误，所在事务随之回滚。导入路径的整体预校验仍保留，这里是第二道防线。
 *
 * Dexie store strings only declare keys/indexes. This DBCore middleware validates every row of
 * add/put mutations (bulkAdd, bulkPut, update and modify all lower to `put`) with the table's
 * synchronous zod validator, rejecting with table + field path so the transaction aborts.
 */
import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, Middleware } from 'dexie';
import { ZodError } from 'zod';

/** 同步校验器：不合格时抛错。Validators must be synchronous (no awaits inside IDB transactions). */
export type JieyuRowValidator = (doc: never) => void;

export type JieyuTableValidators<TableName extends string> = Record<TableName, JieyuRowValidator>;

export class JieyuWriteValidationError extends Error {
  constructor(
    public readonly tableName: string,
    public readonly fieldPath: string,
    public readonly rowKey: unknown,
    public readonly cause: unknown,
  ) {
    super(
      `Write rejected for table "${tableName}"${fieldPath.length > 0 ? ` at field "${fieldPath}"` : ''}: ${describeCause(cause)}`,
    );
    this.name = 'JieyuWriteValidationError';
  }
}

function describeCause(cause: unknown): string {
  if (cause instanceof ZodError) {
    const first = cause.issues[0];
    return first ? first.message : 'schema validation failed';
  }
  return cause instanceof Error ? cause.message : String(cause);
}

function fieldPathOf(cause: unknown): string {
  if (cause instanceof ZodError) {
    const first = cause.issues[0];
    if (first && first.path.length > 0) return first.path.map(String).join('.');
  }
  return '';
}

function rowKeyOf(row: unknown): unknown {
  if (row !== null && typeof row === 'object') {
    const record = row as Record<string, unknown>;
    return record.id ?? record.conversationId;
  }
  return undefined;
}

/** 对一行执行校验，失败时包装为 `JieyuWriteValidationError`。 */
function validateRowForTable(tableName: string, validate: JieyuRowValidator, row: unknown): void {
  try {
    validate(row as never);
  } catch (cause) {
    throw new JieyuWriteValidationError(tableName, fieldPathOf(cause), rowKeyOf(row), cause);
  }
}

function validateMutation(
  tableName: string,
  validate: JieyuRowValidator,
  req: DBCoreMutateRequest,
): void {
  if (req.type !== 'add' && req.type !== 'put') return;
  for (const row of req.values) {
    validateRowForTable(tableName, validate, row);
  }
}

const JIEYU_WRITE_VALIDATION_MIDDLEWARE_NAME = 'jieyuWriteValidation';

export function createWriteValidationMiddleware<TableName extends string>(
  validators: JieyuTableValidators<TableName>,
): Middleware<DBCore> {
  const byTable = validators as Record<string, JieyuRowValidator | undefined>;
  return {
    stack: 'dbcore',
    name: JIEYU_WRITE_VALIDATION_MIDDLEWARE_NAME,
    create(down) {
      return {
        ...down,
        table(tableName) {
          const downTable = down.table(tableName);
          const validate = byTable[tableName];
          if (!validate) return downTable;
          return {
            ...downTable,
            mutate(req: DBCoreMutateRequest): Promise<DBCoreMutateResponse> {
              try {
                validateMutation(tableName, validate, req);
              } catch (error) {
                return Promise.reject(error);
              }
              return downTable.mutate(req);
            },
          };
        },
      };
    },
  };
}
