/**
 * 语言资产面板上下文 | Language asset panel context
 *
 * 允许子组件触发面板切换，替代旧的路由导航方式。
 * Allows child components to trigger panel switches,
 * replacing the old route-navigation pattern.
 */
import { createContext, useContext } from 'react';

export type LanguageAssetPanel =
  | 'none'
  | 'language-metadata'
  | 'structural-profiles'
  | 'orthographies'
  | 'orthography-bridges';

export interface AssetPanelContextValue {
  /** 打开指定面板（传路径或面板 ID）| Open a panel by path or ID */
  openPanel: (to: string) => void;
}

const AssetPanelContext = createContext<AssetPanelContextValue | null>(null);

export const AssetPanelProvider = AssetPanelContext.Provider;

export function useAssetPanel(): AssetPanelContextValue | null {
  return useContext(AssetPanelContext);
}
