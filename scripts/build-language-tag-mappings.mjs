#!/usr/bin/env node
/**
 * Build language-tag lookup mappings from `language-tags` at build time.
 *
 * This replaces runtime dependency on `language-tags` (~1.05 MB JSON registry)
 * with a pre-computed JSON (~5 KB) containing only the mappings we need:
 * - macroLanguageMembers: macroCode -> memberCodes[]
 * - preferredSubtag: code -> preferredCode
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const OUTPUT = resolve(__dirname, '../public/data/language-support/language-tag-mappings.json');

async function main() {
  const lt = (await import('language-tags')).default;
  const registry = (await import('language-subtag-registry/data/json/registry.json', { with: { type: 'json' } })).default;

  const languages = registry.filter((r) => r.Type === 'language');

  const macroLanguageMembers = {};
  const preferredSubtag = {};
  const subtagDetails = {};

  for (const lang of languages) {
    const code = lang.Subtag?.toLowerCase();
    if (!code) continue;

    const subtag = lt.language(code);
    if (subtag) {
      if (subtag.preferred) {
        const pref = subtag.preferred();
        if (pref) {
          preferredSubtag[code] = pref.format().toLowerCase();
        }
      }

      const descriptions = subtag.descriptions();
      const deprecated = subtag.deprecated();
      const script = subtag.script();

      subtagDetails[code] = {
        ...(descriptions && descriptions.length > 0 ? { descriptions } : {}),
        ...(deprecated !== null ? { deprecated: true } : {}),
        ...(script ? { suppressScript: script.format() } : {}),
      };
    }

    if (lang.Scope === 'macrolanguage') {
      try {
        const members = lt.languages(code);
        if (members && members.length > 0) {
          const unique = [...new Set(members.map((m) => m.format().toLowerCase()))];
          macroLanguageMembers[code] = unique;
        }
      } catch {
        // noop: some macrolanguages have no enumerable members in language-tags
      }
    }
  }

  const payload = {
    version: '1.0.0',
    builtAt: new Date().toISOString(),
    macroLanguageMembers,
    preferredSubtag,
    subtagDetails,
  };

  writeFileSync(OUTPUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[build-language-tag-mappings] wrote ${OUTPUT}`);
  console.log(`  macro languages: ${Object.keys(macroLanguageMembers).length}`);
  console.log(`  preferred mappings: ${Object.keys(preferredSubtag).length}`);
  console.log(`  size: ${(JSON.stringify(payload).length / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error('[build-language-tag-mappings] failed:', err);
  process.exit(1);
});
