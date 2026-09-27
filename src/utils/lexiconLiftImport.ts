/**
 * LIFT 0.13 → DMLex JSON projection. Unmapped FLEx fields become diagnostics.
 */
import { LinguisticService } from '../services/LinguisticService';
import { DMLEX_HOMOGRAPH, DMLEX_SUBSENSE } from '../db/dmlexTypes';
import type { LexemeDocType, LexemeEntryDoc, LexemeResourceDoc } from '../db/types';
import { isLexemeEntry } from '../db/lexemeNestedIds';
import { newId } from './transcriptionFormatters';
import { applyLexiconEntryFields, emptyDmlexResource, type LexiconSenseDraft } from './dmlexEntry';
import { LIFT_VERSION } from './lexiconLiftExport';

export type LexiconLiftDiagnosticCode =
  | 'extra-headword'
  | 'morph-type'
  | 'sense-pos-split'
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
  | 'invalid-xml'
  | 'unsupported-version'
  | 'empty'
  | 'save-failed';

export type LexiconLiftParseResult =
  | {
      ok: true;
      lexemes: LexemeEntryDoc[];
      resource: LexemeResourceDoc;
      diagnostics: LexiconLiftDiagnostic[];
    }
  | { ok: false; reason: Exclude<LexiconLiftImportReason, 'save-failed'> };

export type LexiconLiftImportResult =
  | {
      ok: true;
      savedCount: number;
      readback: LexemeEntryDoc[];
      diagnostics: LexiconLiftDiagnostic[];
    }
  | { ok: false; reason: LexiconLiftImportReason };

export type LexiconLiftImportDeps = {
  save: (doc: LexemeDocType) => Promise<string>;
  list: () => Promise<LexemeEntryDoc[]>;
  loadResource: () => Promise<LexemeResourceDoc | null>;
  saveResource: (doc: LexemeResourceDoc) => Promise<string>;
};

const defaultDeps: LexiconLiftImportDeps = {
  save: (doc) => LinguisticService.lexemes.save(doc),
  list: () => LinguisticService.lexemes.list(),
  loadResource: () => LinguisticService.lexemes.getResource(),
  saveResource: (doc) => LinguisticService.lexemes.save(doc),
};

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
    const text = (directChildren(form, 'text')[0]?.textContent ?? '').trim();
    if (text.length === 0) continue;
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
  const exampleTranslation = example
    ? firstText(formText(directChildren(example, 'translation')[0]))
    : '';
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
    exampleTranslationLang: 'zh',
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

function blankEntry(id: string, headword: string, now: string): LexemeEntryDoc {
  return {
    id,
    entry: { id, headword },
    createdAt: now,
    updatedAt: now,
  };
}

export function parseLiftXml(xml: string): LexiconLiftParseResult {
  if (typeof DOMParser === 'undefined') return { ok: false, reason: 'invalid-xml' };
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
  let resource = emptyDmlexResource(now);
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
    const pronunciation = firstText(formText(directChildren(entry, 'pronunciation')[0]));
    const etymology = directChildren(entry, 'etymology')[0];
    const etymon = firstText(formText(etymology));
    const variants = directChildren(entry, 'variant');
    for (const variant of variants) {
      if (directChildren(variant, 'sense').length > 0) {
        diagnostics.push({ code: 'variant-with-sense', entryId: id });
      }
    }
    const inflected = variants
      .flatMap((variant) => formText(variant))
      .map((form) => form.text)
      .join(', ');
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
    if (groups.length > 1) diagnostics.push({ code: 'sense-pos-split', entryId: id });
    const partners = groups.map((group) => group.id);
    for (const group of groups) {
      const applied = applyLexiconEntryFields(
        blankEntry(group.id, forms[0]!.text, now),
        {
          headword: forms[0]!.text,
          homographNumber: groups.length > 1 ? String(partners.indexOf(group.id) + 1) : '',
          partsOfSpeech: group.pos,
          labels: '',
          pronunciation,
          inflectedForms: inflected,
          etymon,
          etymonLang: etymology ? attr(etymology, 'source') : '',
          note: '',
          homographEntryId: group.id === partners[0] ? '' : (partners[0] ?? ''),
          senses: group.senses.map((sense) => sense.draft),
        },
        resource,
        now,
      );
      lexemes.push(applied.entry);
      resource = applied.resource;
    }
  }
  if (lexemes.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, lexemes, resource, diagnostics };
}

export async function importLexemesFromLiftXml(
  xml: string,
  deps: LexiconLiftImportDeps = defaultDeps,
): Promise<LexiconLiftImportResult> {
  const parsed = parseLiftXml(xml);
  if (!parsed.ok) return parsed;
  try {
    const existingResource = await deps.loadResource();
    let resource = existingResource ?? parsed.resource;
    for (const lexeme of parsed.lexemes) {
      const relations = [
        ...(resource.resource.relations ?? []).filter(
          (relation) =>
            relation.type !== DMLEX_SUBSENSE &&
            !(
              relation.type === DMLEX_HOMOGRAPH &&
              relation.members.some((member) => member.ref === lexeme.id)
            ),
        ),
        ...(parsed.resource.resource.relations ?? []).filter((relation) =>
          relation.members.some(
            (member) =>
              member.ref === lexeme.id ||
              (lexeme.entry.senses ?? []).some((sense) => sense.id === member.ref),
          ),
        ),
      ];
      const relationTypes = parsed.resource.resource.relationTypes;
      resource = {
        ...parsed.resource,
        resource: {
          ...parsed.resource.resource,
          relations,
          ...(relationTypes ? { relationTypes } : {}),
        },
        createdAt: resource.createdAt,
      };
      await deps.save(lexeme);
    }
    await deps.saveResource(resource);
    const readback = (await deps.list()).filter(isLexemeEntry);
    return {
      ok: true,
      savedCount: parsed.lexemes.length,
      readback,
      diagnostics: parsed.diagnostics,
    };
  } catch {
    return { ok: false, reason: 'save-failed' };
  }
}

export async function importLexemesFromLiftFile(
  file: File,
  deps: LexiconLiftImportDeps = defaultDeps,
): Promise<LexiconLiftImportResult> {
  return importLexemesFromLiftXml(await file.text(), deps);
}
