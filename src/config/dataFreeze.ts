/**
 * 数据冻结标记（rev5 D14 / T56）| Data freeze marker (rev5 D14 / T56)
 *
 * 冻结点之前为 `false`：界面常驻“开发期版本”提示，schema 变更可以直接重置开发数据。
 * 宣布冻结时改为 `true`，提示随之消失，之后的 schema 变更必须走第 4 批的迁移框架。
 * `false` before the freeze point (dev-build banner shown, resets allowed); flip to `true` when frozen.
 */
export const JIEYU_DATA_FROZEN: boolean = false;
