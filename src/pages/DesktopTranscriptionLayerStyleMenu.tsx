import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { JieyuIcon } from '../components/ui/JieyuIcon';
import { t, type Locale } from '../i18n';
import { useLocalFonts } from '../hooks/fonts/useLocalFonts';
import { JIEYU_ICON_INLINE } from '../utils/jieyuIcon';
import {
  fontPresetChoices,
  layerStyleMenuContext,
  localFontMatchNames,
  systemDefaultFontKey,
} from '../utils/layerDisplayStyle';

export interface LayerStyleFields {
  languageId: string | null;
  orthographyId: string | null;
  orthographyName: string;
  scriptTag: string | null;
  displayFont: string | null;
  displayFontSize: number | null;
  displayBold: boolean;
  displayItalic: boolean;
}

export interface LayerStyleChange {
  orthographyId: string | null;
  displayFont: string | null;
  displayFontSize: number | null;
  displayBold: boolean;
  displayItalic: boolean;
  reset?: boolean;
}

export function layerStyleFields(
  layer:
    | {
        languageId?: string | null;
        orthographyId?: string | null;
        orthographyName?: Record<string, string> | null;
        orthographyScriptTag?: string | null;
        displayFont?: string | null;
        displayFontSize?: number | null;
        displayBold?: boolean;
        displayItalic?: boolean;
      }
    | undefined,
  locale: string,
): LayerStyleFields | undefined {
  if (layer === undefined) return undefined;
  return {
    languageId: layer.languageId ?? null,
    orthographyId: layer.orthographyId ?? null,
    orthographyName: labelOf(layer.orthographyName ?? undefined, locale),
    scriptTag: layer.orthographyScriptTag ?? null,
    displayFont: layer.displayFont ?? null,
    displayFontSize: layer.displayFontSize ?? null,
    displayBold: layer.displayBold === true,
    displayItalic: layer.displayItalic === true,
  };
}

export function styleMenuProps(
  fields: LayerStyleFields | undefined,
  loadOrthographies: (
    languageId: string,
  ) => Promise<{ id: string; name: Record<string, string>; scriptTag: string }[]>,
  onApplyStyle: (change: LayerStyleChange) => void,
):
  | {
      styleFields: LayerStyleFields;
      loadOrthographies: typeof loadOrthographies;
      onApplyStyle: typeof onApplyStyle;
    }
  | Record<string, never> {
  if (fields === undefined) return {};
  return { styleFields: fields, loadOrthographies, onApplyStyle };
}

export function readOrthographyRows(
  result: unknown,
): { id: string; name: Record<string, string>; scriptTag: string }[] {
  if (!Array.isArray(result)) return [];
  return result.flatMap((row) => {
    if (typeof row !== 'object' || row === null) return [];
    const item = row as { id?: unknown; name?: unknown; scriptTag?: unknown };
    if (typeof item.id !== 'string' || typeof item.scriptTag !== 'string') return [];
    if (typeof item.name !== 'object' || item.name === null) return [];
    const name: Record<string, string> = {};
    for (const [key, value] of Object.entries(item.name)) {
      if (typeof value === 'string') name[key] = value;
    }
    return [{ id: item.id, name, scriptTag: item.scriptTag }];
  });
}

function foldFontQuery(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
}

function SideList(props: {
  label: string;
  valueLabel: string;
  open: boolean;
  disabled?: boolean;
  options: { id: string; label: string; selected: boolean; extra?: string[] }[];
  search?: { label: string; placeholder: string; emptyLabel: string };
  onToggle: () => void;
  onPick: (id: string) => void;
}) {
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  if (!props.open && query !== '') setQuery('');
  const needle = foldFontQuery(query);
  const options =
    props.search === undefined || needle.length === 0
      ? props.options
      : props.options.filter((option) =>
          [option.label, ...(option.extra ?? [])].some((part) =>
            foldFontQuery(part).includes(needle),
          ),
        );
  useLayoutEffect(() => {
    const node = flyoutRef.current;
    if (node === null) return;
    const box = node.getBoundingClientRect();
    if (box.right > window.innerWidth - 8) node.classList.add('is-left');
    const room = window.innerHeight - box.top - 8;
    if (box.height > room) node.style.maxHeight = `${Math.max(room, 32)}px`;
  }, [props.open, options.length]);
  return (
    <div className="desktop-tx-layer-menu__sub">
      <button
        type="button"
        className="desktop-tx-layer-menu__sub-trigger"
        aria-expanded={props.open}
        aria-haspopup="menu"
        disabled={props.disabled === true}
        onClick={props.onToggle}
      >
        <span>{props.label}</span>
        <span className="desktop-tx-layer-menu__sub-value">{props.valueLabel}</span>
        {props.open ? null : (
          <JieyuIcon name="ChevronRight" aria-hidden className={JIEYU_ICON_INLINE} />
        )}
      </button>
      {props.open ? (
        <div
          ref={flyoutRef}
          className="desktop-tx-menu desktop-tx-layer-menu__flyout"
          role="menu"
          aria-label={props.label}
        >
          {props.search === undefined ? null : (
            <input
              type="text"
              className="desktop-tx-layer-menu__search"
              aria-label={props.search.label}
              placeholder={props.search.placeholder}
              value={query}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          {props.search !== undefined && needle.length > 0 && options.length === 0 ? (
            <div className="desktop-tx-layer-menu__empty">{props.search.emptyLabel}</div>
          ) : null}
          {options.map((option) => (
            <button
              key={`${option.id}:${option.label}`}
              type="button"
              role="menuitemradio"
              aria-checked={option.selected}
              className={option.selected ? 'is-on' : undefined}
              onClick={() => props.onPick(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function labelOf(name: Record<string, string> | undefined, locale: string): string {
  if (name === undefined) return '';
  const preferred = locale.startsWith('zh') ? name.zh : name.en;
  return (preferred ?? name.zh ?? name.en ?? Object.values(name)[0] ?? '').trim();
}

type OrthographyOption = { id: string; name: string; scriptTag: string };

/** Right-click menu on a timeline layer header. Style fields sit under the collapse action. */
export function DesktopLayerHeaderMenu(props: {
  locale: Locale;
  x: number;
  y: number;
  onCollapse: () => void;
  fields?: LayerStyleFields;
  loadOrthographies?: (
    languageId: string,
  ) => Promise<{ id: string; name: Record<string, string>; scriptTag: string }[]>;
  onApply?: (change: LayerStyleChange) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ x: props.x, y: props.y });
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (panel === null) return;
    const box = panel.getBoundingClientRect();
    setPlace({
      x: Math.max(8, Math.min(props.x, window.innerWidth - box.width - 8)),
      y: Math.max(8, Math.min(props.y, window.innerHeight - box.height - 8)),
    });
  }, [props.x, props.y]);
  const style =
    props.fields === undefined ||
    props.onApply === undefined ||
    props.loadOrthographies === undefined
      ? null
      : {
          fields: props.fields,
          onApply: props.onApply,
          loadOrthographies: props.loadOrthographies,
        };
  return createPortal(
    <div
      ref={panelRef}
      className="desktop-tx-menu desktop-tx-layer-menu"
      role="dialog"
      aria-label={t(props.locale, 'app.desktopTranscription.layerStyle')}
      style={{ left: place.x, top: place.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" role="menuitem" onClick={props.onCollapse}>
        {t(props.locale, 'app.desktopTranscription.layerCollapse')}
      </button>
      {style === null ? null : (
        <>
          <div className="desktop-tx-menu__rule" />
          <StyleFields
            locale={props.locale}
            fields={style.fields}
            loadOrthographies={style.loadOrthographies}
            onApply={style.onApply}
          />
        </>
      )}
    </div>,
    document.body,
  );
}

function StyleFields(props: {
  locale: Locale;
  fields: LayerStyleFields;
  loadOrthographies: (
    languageId: string,
  ) => Promise<{ id: string; name: Record<string, string>; scriptTag: string }[]>;
  onApply: (change: LayerStyleChange) => void;
}) {
  const { fields, locale, loadOrthographies } = props;
  const [options, setOptions] = useState<OrthographyOption[]>([]);
  const localFonts = useLocalFonts();
  const selected = options.find((item) => item.id === fields.orthographyId);
  const menu = layerStyleMenuContext({
    languageId: fields.languageId,
    scriptTag: selected?.scriptTag ?? fields.scriptTag,
  });
  const presets = fontPresetChoices(menu.scriptTag);
  const defaultFont =
    presets.find((preset) => preset.key === systemDefaultFontKey)?.key ?? systemDefaultFontKey;

  useEffect(() => {
    if (fields.languageId === null) {
      setOptions([]);
      return undefined;
    }
    let live = true;
    void loadOrthographies(fields.languageId).then((rows) => {
      if (!live) return;
      setOptions(
        rows.map((row) => ({
          id: row.id,
          name: labelOf(row.name, locale),
          scriptTag: row.scriptTag,
        })),
      );
    });
    return () => {
      live = false;
    };
  }, [fields.languageId, locale, loadOrthographies]);

  const [open, setOpen] = useState<'orthography' | 'font' | null>(null);
  const apply = (change: Partial<LayerStyleChange>) => {
    setOpen(null);
    props.onApply({
      orthographyId: fields.orthographyId,
      displayFont: fields.displayFont,
      displayFontSize: fields.displayFontSize,
      displayBold: fields.displayBold,
      displayItalic: fields.displayItalic,
      ...change,
    });
  };
  const none = t(locale, 'app.desktopTranscription.layerStyleNone');
  const fontChoices = presets
    .filter((preset) => preset.key !== systemDefaultFontKey)
    .filter((preset, index, list) => list.findIndex((item) => item.key === preset.key) === index);
  const fontLabel =
    fields.displayFont === null
      ? defaultFont
      : (fontChoices.find((preset) => preset.key === fields.displayFont)?.key ??
        fields.displayFont);

  return (
    <>
      <SideList
        label={t(locale, 'app.desktopTranscription.layerStyleOrthography')}
        valueLabel={selected?.name || none}
        open={open === 'orthography'}
        disabled={fields.languageId === null}
        options={[
          { id: '', label: none, selected: fields.orthographyId === null },
          ...options.map((item) => ({
            id: item.id,
            label: item.name,
            selected: item.id === fields.orthographyId,
          })),
        ]}
        onToggle={() => setOpen((current) => (current === 'orthography' ? null : 'orthography'))}
        onPick={(id) => apply({ orthographyId: id === '' ? null : id })}
      />
      <SideList
        label={t(locale, 'app.desktopTranscription.layerStyleFont')}
        valueLabel={fontLabel}
        open={open === 'font'}
        search={{
          label: t(locale, 'msg.layerStyle.findFonts'),
          placeholder: t(locale, 'msg.layerStyle.searchAllLocalFonts'),
          emptyLabel: t(locale, 'msg.layerStyle.noMatchingLocalFonts'),
        }}
        options={[
          { id: '', label: defaultFont, selected: fields.displayFont === null },
          ...fontChoices.map((preset) => ({
            id: preset.key,
            label: preset.key,
            selected: preset.key === fields.displayFont,
          })),
          ...(localFonts.status === 'loaded'
            ? localFonts.fonts.map((font) => ({
                id: font.family,
                label: font.family,
                selected: font.family === fields.displayFont,
                extra: localFontMatchNames(font),
              }))
            : []),
          ...(fields.displayFont !== null &&
          !fontChoices.some((preset) => preset.key === fields.displayFont) &&
          !localFonts.fonts.some((font) => font.family === fields.displayFont)
            ? [{ id: fields.displayFont, label: fields.displayFont, selected: true }]
            : []),
        ]}
        onToggle={() =>
          setOpen((current) => {
            if (current === 'font') return null;
            void localFonts.loadLocalFonts();
            return 'font';
          })
        }
        onPick={(id) => apply({ displayFont: id === '' ? null : id })}
      />
      <label className="desktop-tx-layer-menu__row">
        <span>{t(locale, 'app.desktopTranscription.layerStyleSize')}</span>
        <input
          aria-label={t(locale, 'app.desktopTranscription.layerStyleSize')}
          type="number"
          min={8}
          max={36}
          step={1}
          value={fields.displayFontSize ?? 13}
          onChange={(event) => {
            const size = Number(event.target.value);
            if (Number.isInteger(size) && size >= 8 && size <= 36) apply({ displayFontSize: size });
          }}
        />
      </label>
      <label className="desktop-tx-layer-menu__choice">
        <span>{t(locale, 'app.desktopTranscription.layerStyleBold')}</span>
        <input
          type="radio"
          checked={fields.displayBold}
          onChange={() => apply({ displayBold: true })}
          onClick={(event) => {
            if (!fields.displayBold) return;
            event.preventDefault();
            apply({ displayBold: false });
          }}
        />
      </label>
      <label className="desktop-tx-layer-menu__choice">
        <span>{t(locale, 'app.desktopTranscription.layerStyleItalic')}</span>
        <input
          type="radio"
          checked={fields.displayItalic}
          onChange={() => apply({ displayItalic: true })}
          onClick={(event) => {
            if (!fields.displayItalic) return;
            event.preventDefault();
            apply({ displayItalic: false });
          }}
        />
      </label>
      <div className="desktop-tx-menu__rule" />
      <button
        type="button"
        onClick={() =>
          props.onApply({
            orthographyId: null,
            displayFont: null,
            displayFontSize: null,
            displayBold: false,
            displayItalic: false,
            reset: true,
          })
        }
      >
        {t(locale, 'app.desktopTranscription.layerStyleReset')}
      </button>
    </>
  );
}
