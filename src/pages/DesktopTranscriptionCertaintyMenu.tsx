import { useLayoutEffect, useRef } from 'react';
import { SelfCertaintyIcon } from '../components/SelfCertaintyIcon';
import { t, tf, type Locale } from '../i18n';
import type { DictKey } from '../i18n/dictKeys';
import {
  CERTAINTY_VALUES,
  type CertaintyValue,
  sharedSelfCertainty,
} from './desktopTranscriptionMetadata';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';

const LABEL_KEY: Record<CertaintyValue, DictKey> = {
  not_understood: 'app.desktopTranscription.certaintyNotUnderstood',
  uncertain: 'app.desktopTranscription.certaintyUncertain',
  certain: 'app.desktopTranscription.certaintyCertain',
};

export function DesktopTranscriptionCertaintyMenu(props: {
  locale: Locale;
  open: boolean;
  selectedCount: number;
  current: ReturnType<typeof sharedSelfCertainty>;
  onToggle: () => void;
  onPick: (value: UnitSelfCertainty | null) => void;
}) {
  const { locale } = props;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = panel.current;
    const button = trigger.current;
    if (!menu || !button) return;
    const box = menu.getBoundingClientRect();
    const anchor = button.getBoundingClientRect();
    const parent = menu.offsetParent?.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(anchor.right + 4, window.innerWidth - box.width - 8)) - (parent?.left ?? 0)}px`;
    menu.style.top = `${Math.max(8, Math.min(anchor.top, window.innerHeight - box.height - 8)) - (parent?.top ?? 0)}px`;
  }, [props.open]);
  return (
    <>
      <button ref={trigger} type="button" role="menuitem" onClick={props.onToggle}>
        {t(locale, 'app.desktopTranscription.certaintyMenu')}
      </button>
      {props.open ? (
        <div ref={panel} className="desktop-tx-menu desktop-tx-certainty" role="menu">
          {props.current.kind === 'mixed' ? (
            <p className="desktop-tx-certainty__mixed">
              {tf(locale, 'app.desktopTranscription.certaintyMixed', {
                count: props.selectedCount,
              })}
            </p>
          ) : null}
          {CERTAINTY_VALUES.map((value) => {
            const selected = props.current.kind === 'value' && props.current.value === value;
            return (
              <button
                key={value}
                type="button"
                role="menuitem"
                className="desktop-tx-certainty__item"
                onClick={() => props.onPick(value)}
              >
                <SelfCertaintyIcon certainty={value} />
                <span>{t(locale, LABEL_KEY[value])}</span>
                {selected ? <span aria-hidden>✓</span> : null}
              </button>
            );
          })}
          <button
            type="button"
            role="menuitem"
            className="desktop-tx-certainty__clear"
            onClick={() => props.onPick(null)}
          >
            {t(locale, 'app.desktopTranscription.certaintyClear')}
          </button>
        </div>
      ) : null}
    </>
  );
}
