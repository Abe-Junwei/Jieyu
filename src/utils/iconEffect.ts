/**
 * 图标效果：默认沿用 Google Material Symbols；「动效」模式通过 CSS 做悬停/按压反馈（非 Lottie）。
 * Icon effect: default is Material Symbols; “motion” adds CSS hover/active feedback (not Lottie).
 */

export type IconEffect = 'material' | 'motion';

export const ICON_EFFECT_STORAGE_KEY = 'jieyu-icon-effect';

const ATTR = 'data-icon-effect';

function isIconEffect(value: string | null): value is IconEffect {
  return value === 'material' || value === 'motion';
}

export function getIconEffect(): IconEffect {
  try {
    const raw = localStorage.getItem(ICON_EFFECT_STORAGE_KEY);
    if (isIconEffect(raw)) return raw;
  } catch {
    // ignore
  }
  return 'material';
}

/** 写入存储并同步到 `<html data-icon-effect>` */
export function setIconEffect(effect: IconEffect): void {
  try {
    localStorage.setItem(ICON_EFFECT_STORAGE_KEY, effect);
  } catch {
    // ignore
  }
  applyIconEffectToDocument(effect);
}

export function applyIconEffectToDocument(effect: IconEffect): void {
  document.documentElement.setAttribute(ATTR, effect);
}

/** 启动时调用：与 theme 类似，首屏前即写入根属性 */
export function initIconEffect(): IconEffect {
  const effect = getIconEffect();
  applyIconEffectToDocument(effect);
  return effect;
}
