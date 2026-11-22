import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
import type { LayerCommandId, LayerCommandItem } from './desktopTranscriptionLayerCommands';

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

function useOrthographyOptions(
  languageId: string | null,
  locale: Locale,
  load:
    | ((
        languageId: string,
      ) => Promise<{ id: string; name: Record<string, string>; scriptTag: string }[]>)
    | undefined,
): OrthographyOption[] {
  const [options, setOptions] = useState<OrthographyOption[]>([]);
  useEffect(() => {
    if (languageId === null || load === undefined) {
      setOptions([]);
      return undefined;
    }
    let live = true;
    void load(languageId).then((rows) => {
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
  }, [languageId, locale, load]);
  return options;
}

function MenuFlyout(props: {
  label: string;
  value?: string;
  panel?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const flyoutRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = flyoutRef.current;
    if (node === null) return;
    const box = node.getBoundingClientRect();
    if (box.right > window.innerWidth - 8) node.classList.add('is-left');
    if (props.panel === true) return;
    const room = window.innerHeight - box.top - 8;
    if (box.height > room) node.style.maxHeight = `${Math.max(room, 32)}px`;
  }, [props.open, props.panel]);
  return (
    <div className="desktop-tx-layer-menu__sub">
      <button
        type="button"
        className="desktop-tx-layer-menu__sub-trigger"
        aria-expanded={props.open}
        aria-haspopup={props.panel === true ? 'true' : 'menu'}
        onClick={props.onToggle}
      >
        <span>{props.label}</span>
        {props.value === undefined ? null : (
          <span className="desktop-tx-layer-menu__sub-value">{props.value}</span>
        )}
        <span className="desktop-tx-layer-menu__sub-mark" aria-hidden>
          <JieyuIcon name="ChevronRight" className={JIEYU_ICON_INLINE} />
        </span>
      </button>
      {props.open ? (
        <div
          ref={flyoutRef}
          className={`desktop-tx-menu desktop-tx-layer-menu__flyout${props.panel === true ? ' is-panel' : ''}`}
          role={props.panel === true ? 'group' : 'menu'}
          aria-label={props.label}
        >
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

const LANE_MODES = [
  ['single', 'app.desktopTranscription.laneSingle'],
  ['auto', 'app.desktopTranscription.laneAuto'],
  ['one-per-speaker', 'app.desktopTranscription.laneFixed'],
] as const;

function LayerCommandMenu(props: {
  label: string;
  items: readonly LayerCommandItem[];
  open: boolean;
  onToggle: () => void;
  onRun: (command: LayerCommandId) => void;
}) {
  return (
    <MenuFlyout label={props.label} open={props.open} onToggle={props.onToggle}>
      {props.items.map((item) => (
        <Fragment key={item.id}>
          {item.ruleBefore ? <div className="desktop-tx-menu__rule" role="separator" /> : null}
          <button
            type="button"
            role="menuitem"
            className={item.danger === true ? 'is-danger' : undefined}
            aria-disabled={item.disabledReason === undefined ? undefined : true}
            {...(item.disabledReason === undefined
              ? {}
              : { title: item.disabledReason, 'aria-description': item.disabledReason })}
            onClick={() => {
              if (item.disabledReason !== undefined) return;
              props.onRun(item.id);
            }}
          >
            {item.label}
          </button>
        </Fragment>
      ))}
    </MenuFlyout>
  );
}

/** Right-click menu on a timeline layer header. Style fields sit under the collapse action. */
export function DesktopLayerHeaderMenu(props: {
  locale: Locale;
  x: number;
  y: number;
  onCollapse: () => void;
  lane?: {
    mode: 'single' | 'auto' | 'one-per-speaker';
    conflicts: boolean;
    onMode: (mode: 'single' | 'auto' | 'one-per-speaker') => void;
    onLock: () => void;
    onClearConflicts: () => void;
  };
  commands?: readonly LayerCommandItem[];
  onCommand?: (command: LayerCommandId) => void;
  fields?: LayerStyleFields;
  loadOrthographies?: (
    languageId: string,
  ) => Promise<{ id: string; name: Record<string, string>; scriptTag: string }[]>;
  onApply?: (change: LayerStyleChange) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ x: props.x, y: props.y });
  const [flyout, setFlyout] = useState<'layer' | 'lane' | 'style' | 'orthography' | null>(null);
  const toggleFlyout = (id: 'layer' | 'lane' | 'style' | 'orthography') =>
    setFlyout((current) => (current === id ? null : id));
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
  const orthographies = useOrthographyOptions(
    style?.fields.languageId ?? null,
    props.locale,
    style?.loadOrthographies,
  );
  const deleteCommand = props.commands?.find((item) => item.id === 'delete');
  const layerCommands = props.commands?.filter((item) => item.id !== 'delete') ?? [];
  const picked = orthographies.find((item) => item.id === style?.fields.orthographyId);
  const styleFields =
    style === null
      ? null
      : { ...style.fields, scriptTag: picked?.scriptTag ?? style.fields.scriptTag };
  const applyStyle = (change: Partial<LayerStyleChange>) => {
    if (style === null) return;
    style.onApply({
      orthographyId: style.fields.orthographyId,
      displayFont: style.fields.displayFont,
      displayFontSize: style.fields.displayFontSize,
      displayBold: style.fields.displayBold,
      displayItalic: style.fields.displayItalic,
      ...change,
    });
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
      {props.onCommand === undefined || layerCommands.length === 0 ? null : (
        <LayerCommandMenu
          label={t(props.locale, 'app.desktopTranscription.layerMenu')}
          items={layerCommands}
          open={flyout === 'layer'}
          onToggle={() => toggleFlyout('layer')}
          onRun={props.onCommand}
        />
      )}
      {props.lane === undefined ? null : (
        <MenuFlyout
          label={t(props.locale, 'app.desktopTranscription.laneMenu')}
          open={flyout === 'lane'}
          onToggle={() => toggleFlyout('lane')}
          value={t(
            props.locale,
            LANE_MODES.find(([mode]) => mode === props.lane?.mode)?.[1] ??
              'app.desktopTranscription.laneSingle',
          )}
        >
          {LANE_MODES.map(([mode, key]) => (
            <button
              key={mode}
              type="button"
              role="menuitemradio"
              aria-checked={props.lane?.mode === mode}
              onClick={() => props.lane?.onMode(mode)}
            >
              {t(props.locale, key)}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            aria-disabled={props.lane.mode === 'single' ? true : undefined}
            {...(props.lane.mode === 'single'
              ? {
                  title: t(props.locale, 'app.desktopTranscription.laneLockSingle'),
                  'aria-description': t(props.locale, 'app.desktopTranscription.laneLockSingle'),
                }
              : {})}
            onClick={() => {
              if (props.lane?.mode === 'single') return;
              props.lane?.onLock();
            }}
          >
            {t(props.locale, 'app.desktopTranscription.laneLock')}
          </button>
          {props.lane.conflicts ? (
            <button type="button" role="menuitem" onClick={props.lane.onClearConflicts}>
              {t(props.locale, 'app.desktopTranscription.laneUnlockConflicts')}
            </button>
          ) : null}
        </MenuFlyout>
      )}
      {style === null || styleFields === null ? null : (
        <SideList
          label={t(props.locale, 'app.desktopTranscription.layerStyleOrthography')}
          valueLabel={
            picked?.name ||
            style.fields.orthographyName ||
            t(props.locale, 'app.desktopTranscription.layerStyleNone')
          }
          open={flyout === 'orthography'}
          disabled={style.fields.languageId === null}
          options={[
            {
              id: '',
              label: t(props.locale, 'app.desktopTranscription.layerStyleNone'),
              selected: style.fields.orthographyId === null,
            },
            ...orthographies.map((item) => ({
              id: item.id,
              label: item.name,
              selected: item.id === style.fields.orthographyId,
            })),
          ]}
          onToggle={() => toggleFlyout('orthography')}
          onPick={(id) => applyStyle({ orthographyId: id === '' ? null : id })}
        />
      )}
      {style === null || styleFields === null ? null : (
        <MenuFlyout
          label={t(props.locale, 'app.desktopTranscription.styleMenu')}
          panel
          open={flyout === 'style'}
          onToggle={() => toggleFlyout('style')}
        >
          <StyleFields locale={props.locale} fields={styleFields} onApply={style.onApply} />
        </MenuFlyout>
      )}
      {deleteCommand === undefined || props.onCommand === undefined ? null : (
        <>
          <div className="desktop-tx-menu__rule" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={() => props.onCommand?.('delete')}
          >
            {deleteCommand.label}
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

function StyleFields(props: {
  locale: Locale;
  fields: LayerStyleFields;
  onApply: (change: LayerStyleChange) => void;
}) {
  const { fields, locale } = props;
  const localFonts = useLocalFonts();
  const menu = layerStyleMenuContext({
    languageId: fields.languageId,
    scriptTag: fields.scriptTag,
  });
  const presets = fontPresetChoices(menu.scriptTag);
  const defaultFont =
    presets.find((preset) => preset.key === systemDefaultFontKey)?.key ?? systemDefaultFontKey;

  const [open, setOpen] = useState<'font' | null>(null);
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
