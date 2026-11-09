/**
 * 左侧栏可选 Bodymovin 资源：Lucide 名 → JSON（JSON 文件名仍为历史 Material ligature，便于脚本/资源对照）。
 * 产品 UI 为 Lucide；本映射供 `scripts/build-left-rail-lottie-icons.mjs` 与自选 Lottie 替换用。
 */
import type { LeftRailNavIconName } from '../../../utils/jieyuIcon';
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

/** Lucide 导航名 → 历史 Material 文件名 JSON */
export const LEFT_RAIL_LOTTIE_BY_MATERIAL_NAME: Record<LeftRailNavIconName, object> = {
  AudioLines: speech_to_text,
  Pencil: draw,
  Brain: psychology,
  NotebookPen: edit_note,
  BookOpen: menu_book,
  Languages: translate,
  BookBookmark: auto_stories,
  GitBranch: account_tree,
  Library: local_library,
  Settings: settings,
  Package: inventory_2,
  Layers: layers,
};
