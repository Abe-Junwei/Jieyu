# 图标效果主题（Material / 动效）

## 行为摘要

| 模式 | 说明 |
|------|------|
| **Material（默认）** | 沿用 Google Material Symbols Outlined，无额外交互动画。根节点：`data-icon-effect="material"`（亦可缺省，初始化时会写入）。 |
| **动效增强** | 仍为同一套 Material 字形，通过 CSS 在悬停/点击时增加轻微 **缩放** 与 **FILL=1**（实心）。根节点：`data-icon-effect="motion"`。 |

持久化键：`localStorage['jieyu-icon-effect']`，值为 `material` | `motion`。

与 **「减少动态效果」**（`document.documentElement.classList` 含 `jieyu-reduced-motion`）或 **`prefers-reduced-motion: reduce`** 时，动效模式的缩放与填充变化会自动关闭。

## 与 Lottie / SVG 动画库的关系

- Material Symbols **不包含**内置的悬停/点击矢量动画；若需逐图标 Lottie，需自行引入播放器与 JSON（常见开源选型见下）。
- 当前仓库动效模式 **未** 增加 `lottie-web` 依赖；可在具体组件内按需 `import lottie-web` 或 `lottie-react`，仅对少数关键入口挂载 `.json`。

### 可参考的开源栈（摘录）

- **Lottie Web**：[`lottie-web`](https://github.com/airbnb/lottie-web)（Airbnb），MIT。
- **React 封装**：[`lottie-react`](https://github.com/Gamote/lottie-react)。
- **DotLottie**：[`dotlottie-web`](https://github.com/LottieFiles/dotlottie-web)（体积更小的 `.lottie` 包）。
- **SVG/CSS 动效**：[`anime.js`](https://github.com/juliangarnier/anime)（MIT）、[`GSAP`](https://github.com/greensock/GSAP)（核心免费）等，适合路径动画而非整段 Lottie。

## 相关源码

- `src/utils/iconEffect.ts` — 读写存储与 `data-icon-effect`
- `src/main.tsx` — `initIconEffect()`
- `src/styles/foundation/icon-effect-motion.css` — 动效样式
- `src/components/SettingsModal.tsx` — 设置 → 外观 →「图标效果」
