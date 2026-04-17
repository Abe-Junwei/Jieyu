/**
 * 统一 SVG 小图标库 | Unified SVG micro-icon library
 *
 * 所有图标均采用 viewBox="0 0 16 16"，stroke="currentColor"，
 * 尺寸由外部 CSS width/height 控制。
 * All icons use viewBox="0 0 16 16", stroke="currentColor",
 * sized via external CSS width/height.
 */
import type { CSSProperties } from 'react';

interface IconProps {
  className?: string;
  style?: CSSProperties;
  title?: string;
  ariaLabel?: string;
}

const common = {
  viewBox: '0 0 16 16',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  role: 'img' as const,
};

/* ── 关闭 ✕ | Close ────────────────────────── */
export function CloseIcon({ className, style, title, ariaLabel }: IconProps) {
  return (
    <svg className={className} style={style} aria-label={ariaLabel} {...common}>
      {title ? <title>{title}</title> : null}
      <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" stroke="currentColor" strokeWidth="1.28" strokeLinecap="round" />
    </svg>
  );
}

/* ── 上箭头 ▲ | Chevron Up ─────────────────── */
export function ChevronUpIcon({ className, style, title, ariaLabel }: IconProps) {
  return (
    <svg className={className} style={style} aria-label={ariaLabel} {...common}>
      {title ? <title>{title}</title> : null}
      <path d="M4 10 8 6 12 10" stroke="currentColor" strokeWidth="1.28" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── 下箭头 ▼ | Chevron Down ───────────────── */
export function ChevronDownIcon({ className, style, title, ariaLabel }: IconProps) {
  return (
    <svg className={className} style={style} aria-label={ariaLabel} {...common}>
      {title ? <title>{title}</title> : null}
      <path d="M4 6 8 10 12 6" stroke="currentColor" strokeWidth="1.28" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── 替换切换 ⇄ | Swap / Toggle Replace ───── */
export function SwapIcon({ className, style, title, ariaLabel }: IconProps) {
  return (
    <svg className={className} style={style} aria-label={ariaLabel} {...common}>
      {title ? <title>{title}</title> : null}
      <path d="M3 5.5h10M10.5 3 13 5.5 10.5 8" stroke="currentColor" strokeWidth="1.28" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 10.5H3M5.5 8 3 10.5 5.5 13" stroke="currentColor" strokeWidth="1.28" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── 对勾 ✓ | Check ────────────────────────── */
export function CheckIcon({ className, style, title, ariaLabel }: IconProps) {
  return (
    <svg className={className} style={style} aria-label={ariaLabel} {...common}>
      {title ? <title>{title}</title> : null}
      <path d="M4 8.5 7 11.5 12 5" stroke="currentColor" strokeWidth="1.28" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── 叉号 ✗ | Cross / Failure ──────────────── */
export function CrossIcon({ className, style, title, ariaLabel }: IconProps) {
  return (
    <svg className={className} style={style} aria-label={ariaLabel} {...common}>
      {title ? <title>{title}</title> : null}
      <path d="M5 5 11 11M11 5 5 11" stroke="currentColor" strokeWidth="1.28" strokeLinecap="round" />
    </svg>
  );
}

/* ── 扳手 🔧 | Wrench ──────────────────────── */
export function WrenchIcon({ className, style, title, ariaLabel }: IconProps) {
  return (
    <svg className={className} style={style} aria-label={ariaLabel} {...common}>
      {title ? <title>{title}</title> : null}
      <path d="M10.3 2.7a3.5 3.5 0 0 0-4.1 5.5L3.5 10.8a1.2 1.2 0 0 0 1.7 1.7l2.6-2.7a3.5 3.5 0 0 0 5.5-4.1L11.5 7.5 10 8l-.5-1.5L11.3 4.7Z" stroke="currentColor" strokeWidth="1.28" strokeLinejoin="round" />
    </svg>
  );
}

/* ── 文件夹 📂 | Folder Open ───────────────── */
export function FolderOpenIcon({ className, style, title, ariaLabel }: IconProps) {
  return (
    <svg className={className} style={style} aria-label={ariaLabel} {...common}>
      {title ? <title>{title}</title> : null}
      <path d="M2 4.5V12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1H8.2L6.8 4H3a1 1 0 0 0-1 .5Z" stroke="currentColor" strokeWidth="1.28" strokeLinejoin="round" />
      <path d="M2 7h12" stroke="currentColor" strokeWidth="1.02" />
    </svg>
  );
}

/* ── 实心圆点 ● | Dot ──────────────────────── */
export function DotIcon({ className, style, title, ariaLabel }: IconProps) {
  return (
    <svg className={className} style={style} aria-label={ariaLabel} {...common}>
      {title ? <title>{title}</title> : null}
      <circle cx="8" cy="8" r="3" fill="currentColor" />
    </svg>
  );
}
