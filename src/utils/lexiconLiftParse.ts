/**
 * LIFT 0.13 → DMLex JSON projection. Unmapped FLEx fields become diagnostics.
 * Parsing only. Dexie writes stay in lexiconLiftImport.ts.
 */
import type { LexemeEntryDoc, LexemeResourceDoc } from '../db/types';
import { newId } from './transcriptionFormatters';
import { applyLexiconEntryFields, emptyDmlexResource, type LexiconSenseDraft } from './dmlexEntry';
import { LIFT_VERSION } from './lexiconLiftExport';
import type { InterchangeLoss } from './interchangeLossReport';
import { ensureDomParser } from './ensureDomParser';

export type LexiconLiftDiagnosticCode =
  | 'extra-headword'
  | 'morph-type'
  | 'note'
  | 'reversal'
  | 'import-residue'
  | 'scientific-name'
  | 'variant-with-sense';

export type LexiconLiftDiagnostic = {
  code: LexiconLiftDiagnosticCode;
  entryId: string;
};

export type LexiconLiftImportReason =
  'invalid-xml' | 'unsupported-version' | 'empty' | 'save-failed';

export type LexiconLiftParseResult =
  | {
      ok: true;
      lexemes: LexemeEntryDoc[];
      resource: LexemeResourceDoc;
      diagnostics: LexiconLiftDiagnostic[];
      losses: InterchangeLoss[];
      /** 每个词条 lexical-unit 的语言（按解析出的词条 id）| Headword language per parsed entry id */
      headwordLangs: ReadonlyMap<string, string>;
    }
  | { ok: false; reason: Exclude<LexiconLiftImportReason, 'save-failed'> };

/**
 * LIFT 原文直接写进词条：词头、变体形式、发音原样保留（不 trim、不按逗号拆分），
 * 发音语言与词头不同时记成 DMLex transcription scheme（如 `seh-fonipa`）。
 * Write LIFT text straight into the entry: headword, variant forms and pronunciation are kept as is
 * (no trim, no comma split); a pronunciation language other than the headword's becomes the DMLex
 * transcription scheme (e.g. `seh-fonipa`).
 */
function withLiftForms(
  doc: LexemeEntryDoc,
  forms: {
    headword: string;
    variantForms: readonly string[];
    pronunciation: string;
    pronunciationScheme: string;
  },
): LexemeEntryDoc {
  const { inflectedForms: _dropped, pronunciations: _replaced, ...rest } = doc.entry;
  const entry: LexemeEntryDoc['entry'] = {
    ...rest,
    headword: forms.headword,
    ...(forms.pronunciation.length > 0
      ? {
          pronunciations: [
            {
              transcriptions: [
                {
                  text: forms.pronunciation,
                  ...(forms.pronunciationScheme.length > 0
                    ? { scheme: forms.pronunciationScheme }
                    : {}),
                },
              ],
            },
          ],
        }
      : {}),
    ...(forms.variantForms.length > 0
      ? { inflectedForms: forms.variantForms.map((text) => ({ text })) }
      : {}),
  };
  return { ...doc, entry };
}

function mostCommonLang(langs: ReadonlyMap<string, string>): string {
  const counts = new Map<string, number>();
  for (const lang of langs.values()) {
    if (lang === 'und') continue;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  let best = 'und';
  let bestCount = 0;
  for (const [lang, count] of counts) {
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return best;
}

function directChildren(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

function attr(el: Element, name: string): string {
  return (el.getAttribute(name) ?? '').trim();
}

function formText(parent: Element | undefined): Array<{ lang: string; text: string }> {
  if (!parent) return [];
  const out: Array<{ lang: string; text: string }> = [];
  for (const form of directChildren(parent, 'form')) {
    // 文本原样保留（含首尾空白）；只有全空白才算空 | Keep the text as is; whitespace-only counts as empty
    const text = directChildren(form, 'text')[0]?.textContent ?? '';
    if (text.trim().length === 0) continue;
    const lang = attr(form, 'lang');
    out.push({ lang: lang.length > 0 ? lang : 'und', text });
  }
  return out;
}

function firstText(forms: Array<{ lang: string; text: string }>): string {
  return forms[0]?.text ?? '';
}

type ParsedSense = {
  id: string;
  parentId: string;
  draft: LexiconSenseDraft;
  pos: string;
};

function parseSense(
  sense: Element,
  parentId: string,
  entryId: string,
  headLang: string,
  diagnostics: LexiconLiftDiagnostic[],
): ParsedSense {
  const senseIdAttr = attr(sense, 'id');
  const id = senseIdAttr.length > 0 ? senseIdAttr : newId('sense');
  const glosses = directChildren(sense, 'gloss').flatMap((gloss) => {
    const text = (gloss.querySelector('text')?.textContent ?? '').trim();
    if (text.length === 0) return [];
    const lang = attr(gloss, 'lang');
    return [{ lang: lang.length > 0 ? lang : 'und', text }];
  });
  const definitions = directChildren(sense, 'definition').flatMap((definition) =>
    formText(definition),
  );
  const sameLang = definitions.find((item) => item.lang === headLang || item.lang.length === 0);
  const otherLang = definitions.find((item) => item.lang !== headLang && item.lang.length > 0);
  const example = directChildren(sense, 'example')[0];
  const exampleForms = formText(example);
  const exampleTranslationForm = example
    ? formText(directChildren(example, 'translation')[0])[0]
    : undefined;
  const exampleTranslation = exampleTranslationForm?.text ?? '';
  const labels = directChildren(sense, 'trait')
    .map((trait) => attr(trait, 'value'))
    .filter((value) => value.length > 0);
  if (directChildren(sense, 'note').length > 0) diagnostics.push({ code: 'note', entryId });
  if (directChildren(sense, 'reversal').length > 0) diagnostics.push({ code: 'reversal', entryId });
  if (sense.querySelector('field[type="import-residue"]')) {
    diagnostics.push({ code: 'import-residue', entryId });
  }
  if (sense.querySelector('field[type="scientific-name"]')) {
    diagnostics.push({ code: 'scientific-name', entryId });
  }
  const draft: LexiconSenseDraft = {
    id,
    parentId,
    indicator: '',
    translation: glosses[0]?.text ?? '',
    translationLang: glosses[0]?.lang ?? 'zh',
    explanation: otherLang?.text ?? '',
    explanationLang: otherLang?.lang ?? 'zh',
    definition: sameLang?.text ?? (otherLang ? '' : (definitions[0]?.text ?? '')),
    example: firstText(exampleForms),
    exampleTranslation,
    exampleTranslationLang:
      exampleTranslationForm && exampleTranslationForm.lang !== 'und'
        ? exampleTranslationForm.lang
        : 'zh',
    exampleSegmentId: '',
    labels: labels.join(', '),
    note: '',
  };
  return {
    id,
    parentId,
    draft,
    pos: directChildren(sense, 'grammatical-info')[0]
      ? attr(directChildren(sense, 'grammatical-info')[0]!, 'value')
      : '',
  };
}

function collectSenses(
  elements: Element[],
  parentId: string,
  entryId: string,
  headLang: string,
  diagnostics: LexiconLiftDiagnostic[],
): ParsedSense[] {
  const out: ParsedSense[] = [];
  for (const element of elements) {
    const parsed = parseSense(element, parentId, entryId, headLang, diagnostics);
    out.push(parsed);
    out.push(
      ...collectSenses(
        directChildren(element, 'subsense'),
        parsed.id,
        entryId,
        headLang,
        diagnostics,
      ),
    );
  }
  return out;
}

function blankEntry(id: string, headword: string, now: string, textId: string): LexemeEntryDoc {
  return {
    id,
    textId,
    entry: { id, headword },
    createdAt: now,
    updatedAt: now,
  };
}

export function parseLiftXml(xml: string, textId: string): LexiconLiftParseResult {
  ensureDomParser();
  const trimmed = xml.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  const doc = new DOMParser().parseFromString(trimmed, 'application/xml');
  if (doc.querySelector('parsererror')) return { ok: false, reason: 'invalid-xml' };
  const lift = doc.documentElement;
  if (lift.localName !== 'lift') return { ok: false, reason: 'invalid-xml' };
  if (attr(lift, 'version') !== LIFT_VERSION) return { ok: false, reason: 'unsupported-version' };
  const now = new Date().toISOString();
  const diagnostics: LexiconLiftDiagnostic[] = [];
  const lexemes: LexemeEntryDoc[] = [];
  let resource = emptyDmlexResource(now, textId);
  let missingStableIds = 0;
  const headwordLangs = new Map<string, string>();
  for (const entry of directChildren(lift, 'entry')) {
    const entryIdAttr = attr(entry, 'id');
    const id = entryIdAttr.length > 0 ? entryIdAttr : newId('lex');
    if (
      attr(entry, 'morph-type').length > 0 ||
      directChildren(entry, 'trait').some((trait) => attr(trait, 'name') === 'morph-type')
    ) {
      diagnostics.push({ code: 'morph-type', entryId: id });
    }
    const forms = formText(directChildren(entry, 'lexical-unit')[0]);
    if (forms.length === 0) continue;
    if (entryIdAttr.length === 0) missingStableIds += 1;
    if (forms.length > 1) diagnostics.push({ code: 'extra-headword', entryId: id });
    const senses = collectSenses(
      directChildren(entry, 'sense'),
      '',
      id,
      forms[0]!.lang,
      diagnostics,
    );
    const posValues = [
      ...new Set(senses.map((sense) => sense.pos).filter((pos) => pos.length > 0)),
    ];
    const pronunciationForm = formText(directChildren(entry, 'pronunciation')[0])[0];
    const pronunciation = pronunciationForm?.text ?? '';
    const etymology = directChildren(entry, 'etymology')[0];
    const etymon = firstText(formText(etymology));
    const variants = directChildren(entry, 'variant');
    for (const variant of variants) {
      if (directChildren(variant, 'sense').length > 0) {
        diagnostics.push({ code: 'variant-with-sense', entryId: id });
      }
    }
    // 变体形式直接成为数组，不经过逗号分隔的表单字符串（JY-09）
    // Variant forms become the array directly, never through a comma-separated form string (JY-09)
    const variantForms = variants.flatMap((variant) => formText(variant)).map((form) => form.text);
    const groups =
      posValues.length <= 1
        ? [{ id, pos: posValues[0] ?? '', senses }]
        : posValues.map((pos, index) => ({
            id: index === 0 ? id : `${id}__${pos}`,
            pos,
            senses: senses
              .filter((sense) => sense.pos === pos)
              .map((sense) => ({ ...sense, draft: { ...sense.draft, parentId: '' } })),
          }));
    const partners = groups.map((group) => group.id);
    for (const group of groups) {
      const applied = applyLexiconEntryFields(
        blankEntry(group.id, forms[0]!.text, now, textId),
        {
          headword: forms[0]!.text,
          homographNumber: groups.length > 1 ? String(partners.indexOf(group.id) + 1) : '',
          partsOfSpeech: group.pos,
          labels: '',
          pronunciation,
          inflectedForms: '',
          etymon,
          etymonLang: etymology ? attr(etymology, 'source') : '',
          note: '',
          homographEntryId: group.id === partners[0] ? '' : (partners[0] ?? ''),
          senses: group.senses.map((sense) => sense.draft),
        },
        resource,
        now,
        textId,
      );
      lexemes.push(
        withLiftForms(applied.entry, {
          headword: forms[0]!.text,
          variantForms,
          pronunciation,
          pronunciationScheme:
            pronunciationForm &&
            pronunciationForm.lang !== 'und' &&
            pronunciationForm.lang !== forms[0]!.lang
              ? pronunciationForm.lang
              : '',
        }),
      );
      headwordLangs.set(group.id, forms[0]!.lang);
      resource = applied.resource;
    }
  }
  if (lexemes.length === 0) return { ok: false, reason: 'empty' };
  const losses: InterchangeLoss[] =
    missingStableIds > 0 ? [{ code: 'no-stable-id', count: missingStableIds }] : [];
  // 词典的对象语言取文件里最常见的词头语言（JY-09）| Dictionary language = most common headword language
  const objectLang = mostCommonLang(headwordLangs);
  resource = { ...resource, resource: { ...resource.resource, langCode: objectLang } };
  return { ok: true, lexemes, resource, diagnostics, losses, headwordLangs };
}
