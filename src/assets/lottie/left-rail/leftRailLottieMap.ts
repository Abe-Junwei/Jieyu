/**
 * 左侧栏可选 Bodymovin 资源：ligature 名 → JSON（与 Material / 路由对齐）。
 * 当前产品 UI 使用 Material Symbols；本映射供 `scripts/build-left-rail-lottie-icons.mjs` 与自选 Lottie 替换用。
 */
import type { LeftRailNavIconName } from '../../../utils/jieyuMaterialIcon';
import account_tree from './icons/account_tree.json';
import auto_stories from './icons/auto_stories.json';
import draw from './icons/draw.json';
import edit_note from './icons/edit_note.json';
import speech_to_text from './icons/speech_to_text.json';
import inventory_2 from './icons/inventory_2.json';
import layers from './icons/layers.json';
import local_library from './icons/local_library.json';
import menu_book from './icons/menu_book.json';
import psychology from './icons/psychology.json';
import settings from './icons/settings.json';
import translate from './icons/translate.json';

/** @deprecated 使用 LeftRailNavIconName */
export type LeftRailLottieMaterialName = LeftRailNavIconName;

export const LEFT_RAIL_LOTTIE_BY_MATERIAL_NAME: Record<LeftRailNavIconName, object> = {
  speech_to_text,
  draw,
  psychology,
  edit_note,
  menu_book,
  translate,
  auto_stories,
  account_tree,
  local_library,
  settings,
  inventory_2,
  layers,
};
