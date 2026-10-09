/**
 * 元信息对话框里改别名时，算出图层的下一版名称（JY-18）。
 * Compute a layer's next name when the alias is edited in the metadata dialog (JY-18).
 *
 * `currentAlias` 必须是对话框预填的值，即 `getLayerLabelParts(layer).alias`（主语言键上的名称；
 * 以「转写 / 翻译」开头的视为自动名，别名为空）。
 * `currentAlias` must be the value the dialog pre-fills, i.e. `getLayerLabelParts(layer).alias`.
 *
 * - 别名没变：返回 `null`，名称原样保留（以前每次保存都会把 `zho` 改写成「翻译 / 转写 · 别名」，
 *   手动命名或导入的名称因此丢失）。
 * - 设了新别名：写在语言中立的 `und` 键（显示时最先读取），不写任何界面语言的固定文字；
 *   去掉等于旧别名的值，以及旧代码写入的「转写 / 翻译 …」自动名。其他语言的名称保留。
 * - 清空别名：去掉 `und` 与等于旧别名的值，其他名称保留。
 * Unchanged alias: `null`, the name is kept (saving used to rewrite `zho` to a fixed Chinese label
 * and lose manual / imported names). New alias: stored under the language-neutral `und` key (read
 * first for display) with no UI-language text; values equal to the old alias and the 转写 / 翻译
 * auto names the old code wrote are dropped, other names are kept. Cleared alias: drop `und` and
 * values equal to the old alias, keep the rest.
 */
const LEGACY_AUTO_NAME_PREFIXES = ['\u8f6c\u5199', '\u7ffb\u8bd1'] as const;

function isLegacyAutoName(value: string): boolean {
  return LEGACY_AUTO_NAME_PREFIXES.some((prefix) => value.trim().startsWith(prefix));
}

export function nextLayerNameForAlias(
  name: Record<string, string> | undefined,
  currentAlias: string,
  nextAlias: string,
): Record<string, string> | null {
  const previous = currentAlias.trim();
  const next = nextAlias.trim();
  if (next === previous) return null;
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(name ?? {})) {
    if (key === 'und') continue;
    if (previous.length > 0 && value.trim() === previous) continue;
    if (next.length > 0 && isLegacyAutoName(value)) continue;
    kept[key] = value;
  }
  return next.length > 0 ? { ...kept, und: next } : kept;
}
