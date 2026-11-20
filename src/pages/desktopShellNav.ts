import { t, type Locale } from '../i18n';
import {
  buildTranscriptionDeepLinkHref,
  readTranscriptionWorkspaceReturnHint,
} from '../utils/transcriptionUrlDeepLink';
import type { LeftRailNavIconName } from '../utils/jieyuIcon';

export interface DesktopNavItem {
  to: string;
  label: string;
  icon: LeftRailNavIconName;
  summary: string;
}

export function desktopPrimaryNav(locale: Locale): DesktopNavItem[] {
  return [
    {
      to: '/',
      label: t(locale, 'app.nav.home'),
      icon: 'Library',
      summary: t(locale, 'app.nav.summary.home'),
    },
    {
      to: '/transcription',
      label: t(locale, 'app.nav.transcription'),
      icon: 'AudioLines',
      summary: t(locale, 'app.nav.summary.transcription'),
    },
    {
      to: '/annotation',
      label: t(locale, 'app.nav.annotation'),
      icon: 'Pencil',
      summary: t(locale, 'app.nav.summary.annotation'),
    },
    {
      to: '/lexicon',
      label: t(locale, 'app.nav.lexicon'),
      icon: 'BookOpen',
      summary: t(locale, 'app.nav.summary.lexicon'),
    },
    {
      to: '/corpus',
      label: t(locale, 'app.nav.corpus'),
      icon: 'NotebookPen',
      summary: t(locale, 'app.nav.summary.corpus'),
    },
    {
      to: '/analysis',
      label: t(locale, 'app.nav.analysis'),
      icon: 'Brain',
      summary: t(locale, 'app.nav.summary.analysis'),
    },
  ];
}

export function desktopSecondaryNav(locale: Locale): DesktopNavItem[] {
  return [
    {
      to: '/assets/language-metadata',
      label: t(locale, 'app.nav.languageMetadata'),
      icon: 'Languages',
      summary: t(locale, 'app.nav.summary.languageMetadata'),
    },
    {
      to: '/assets/structural-profiles',
      label: t(locale, 'app.nav.structuralProfiles'),
      icon: 'Layers',
      summary: t(locale, 'app.nav.summary.structuralProfiles'),
    },
    {
      to: '/assets/orthographies',
      label: t(locale, 'app.nav.orthographies'),
      icon: 'BookBookmark',
      summary: t(locale, 'app.nav.summary.orthographies'),
    },
    {
      to: '/assets/orthography-bridges',
      label: t(locale, 'app.nav.orthographyBridges'),
      icon: 'GitBranch',
      summary: t(locale, 'app.nav.summary.orthographyBridges'),
    },
  ];
}

export function resolveDesktopNavTo(to: string): string {
  if (to !== '/transcription' && to !== '/annotation') return to;
  const hint = readTranscriptionWorkspaceReturnHint();
  if (!hint) return to;
  if (to === '/transcription') {
    return buildTranscriptionDeepLinkHref({
      textId: hint.textId,
      ...(hint.mediaId ? { mediaId: hint.mediaId } : {}),
    });
  }
  const params = new URLSearchParams();
  params.set('textId', hint.textId);
  if (hint.mediaId) params.set('mediaId', hint.mediaId);
  return `/annotation?${params.toString()}`;
}

export function activeDesktopNav(
  items: readonly DesktopNavItem[],
  pathname: string,
): DesktopNavItem | undefined {
  return (
    items.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)) ?? items[0]
  );
}
