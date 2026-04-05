/**
 * 文字标签下拉选择 + 自定义输入组件
 * Writing system (script tag) combobox with predefined options and free-text input
 */
import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Locale } from '../i18n';

// ── ISO 15924 预定义脚本选项 | Predefined script options ──────

type ScriptOption = {
  code: string;
  nameZh: string;
  nameEn: string;
};

const SCRIPT_OPTIONS: readonly ScriptOption[] = [
  { code: 'Latn', nameZh: '拉丁字母', nameEn: 'Latin' },
  { code: 'Hans', nameZh: '简体中文', nameEn: 'Simplified Chinese' },
  { code: 'Hant', nameZh: '繁体中文', nameEn: 'Traditional Chinese' },
  { code: 'Arab', nameZh: '阿拉伯文', nameEn: 'Arabic' },
  { code: 'Cyrl', nameZh: '西里尔字母', nameEn: 'Cyrillic' },
  { code: 'Deva', nameZh: '天城体', nameEn: 'Devanagari' },
  { code: 'Grek', nameZh: '希腊字母', nameEn: 'Greek' },
  { code: 'Jpan', nameZh: '日文', nameEn: 'Japanese' },
  { code: 'Kore', nameZh: '韩文', nameEn: 'Korean' },
  { code: 'Thai', nameZh: '泰文', nameEn: 'Thai' },
  { code: 'Tibt', nameZh: '藏文', nameEn: 'Tibetan' },
  { code: 'Beng', nameZh: '孟加拉文', nameEn: 'Bengali' },
  { code: 'Taml', nameZh: '泰米尔文', nameEn: 'Tamil' },
  { code: 'Telu', nameZh: '泰卢固文', nameEn: 'Telugu' },
  { code: 'Mlym', nameZh: '马拉雅拉姆文', nameEn: 'Malayalam' },
  { code: 'Knda', nameZh: '卡纳达文', nameEn: 'Kannada' },
  { code: 'Guru', nameZh: '古木基文', nameEn: 'Gurmukhi' },
  { code: 'Gujr', nameZh: '古吉拉特文', nameEn: 'Gujarati' },
  { code: 'Orya', nameZh: '奥里亚文', nameEn: 'Odia' },
  { code: 'Sinh', nameZh: '僧伽罗文', nameEn: 'Sinhala' },
  { code: 'Mymr', nameZh: '缅甸文', nameEn: 'Myanmar' },
  { code: 'Khmr', nameZh: '高棉文', nameEn: 'Khmer' },
  { code: 'Laoo', nameZh: '老挝文', nameEn: 'Lao' },
  { code: 'Ethi', nameZh: '埃塞俄比亚文', nameEn: 'Ethiopic' },
  { code: 'Geor', nameZh: '格鲁吉亚文', nameEn: 'Georgian' },
  { code: 'Armn', nameZh: '亚美尼亚文', nameEn: 'Armenian' },
  { code: 'Hebr', nameZh: '希伯来文', nameEn: 'Hebrew' },
] as const;

// ── 组件 | Component ──────────────────────────────────────────

type ScriptTagComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

export function ScriptTagCombobox({
  value,
  onChange,
  locale,
  placeholder,
  className = 'input',
  ariaLabel,
  disabled = false,
}: ScriptTagComboboxProps) {
  const idPrefix = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const filteredOptions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return SCRIPT_OPTIONS;
    return SCRIPT_OPTIONS.filter(
      (opt) =>
        opt.code.toLowerCase().includes(query) ||
        opt.nameZh.includes(query) ||
        opt.nameEn.toLowerCase().includes(query),
    );
  }, [value]);

  const listboxId = `${idPrefix}-script-listbox`;
  const activeOptionId = activeIndex >= 0 && activeIndex < filteredOptions.length
    ? `${idPrefix}-script-option-${activeIndex}`
    : undefined;

  const handleSelect = (code: string) => {
    onChange(code);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    const count = filteredOptions.length;
    if (count === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % count);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + count) % count);
    } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < count) {
      e.preventDefault();
      const selected = filteredOptions[activeIndex];
      if (selected) handleSelect(selected.code);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const showDropdown = isOpen && filteredOptions.length > 0;

  return (
    <div className="script-tag-combobox" ref={containerRef}>
      <input
        className={className}
        type="text"
        role="combobox"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          // 延迟关闭，让 click 事件有机会触发 | Delay close so click events can fire
          setTimeout(() => setIsOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={showDropdown}
        aria-controls={showDropdown ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
      />
      {showDropdown && (
        <ul
          id={listboxId}
          className="script-tag-combobox-listbox"
          role="listbox"
          aria-label={ariaLabel}
        >
          {filteredOptions.map((opt, index) => (
            <li
              key={opt.code}
              id={`${idPrefix}-script-option-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              className={`script-tag-combobox-option${activeIndex === index ? ' is-active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(opt.code)}
            >
              <span className="script-tag-combobox-code">{opt.code}</span>
              <span className="script-tag-combobox-name">
                {locale === 'zh-CN' ? opt.nameZh : opt.nameEn}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
