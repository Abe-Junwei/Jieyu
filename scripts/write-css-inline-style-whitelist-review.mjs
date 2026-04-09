import fs from 'node:fs';
import path from 'node:path';
import { ROOT, collectInlineStyleOccurrencesForFile, matchInlineStyleWhitelistEntry } from './css-inline-style-governance.mjs';

const WHITELIST_PATH = path.join(ROOT, 'scripts', 'css-inline-style-whitelist.json');

function parseArgs(argv) {
  const args = {
    reviewer: '',
    reviewedAt: new Date().toISOString().slice(0, 10),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--reviewer') {
      args.reviewer = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (current === '--reviewed-at') {
      args.reviewedAt = argv[index + 1] ?? args.reviewedAt;
      index += 1;
    }
  }

  return args;
}

function main() {
  if (!fs.existsSync(WHITELIST_PATH)) {
    throw new Error(`missing whitelist file: ${path.relative(ROOT, WHITELIST_PATH)}`);
  }

  const { reviewer, reviewedAt } = parseArgs(process.argv.slice(2));
  if (!reviewer.trim()) {
    throw new Error('missing required --reviewer <name>');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt)) {
    throw new Error('invalid --reviewed-at value, expected YYYY-MM-DD');
  }

  const parsed = JSON.parse(fs.readFileSync(WHITELIST_PATH, 'utf8'));
  const allowedEntries = Array.isArray(parsed?.allowed) ? parsed.allowed : [];
  const nextAllowed = allowedEntries.map((entry) => {
    if (!entry || typeof entry.file !== 'string') {
      throw new Error('invalid whitelist entry: missing file');
    }
    const absPath = path.join(ROOT, entry.file);
    if (!fs.existsSync(absPath)) {
      throw new Error(`whitelisted file does not exist: ${entry.file}`);
    }

    const occurrences = collectInlineStyleOccurrencesForFile(absPath);
    const { failures, matchedOccurrences } = matchInlineStyleWhitelistEntry(entry.file, occurrences, {
      reviewer: reviewer.trim(),
      reviewedAt,
      reason: typeof entry.reason === 'string' ? entry.reason : '',
      snippets: Array.isArray(entry.snippets) ? entry.snippets : [],
    }, { validateHashes: false });
    if (failures.length > 0) {
      throw new Error(failures.join('\n'));
    }

    return {
      ...entry,
      reviewer: reviewer.trim(),
      reviewedAt,
      snippets: matchedOccurrences.map(({ snippet, occurrence }) => ({
        anchor: snippet.anchor,
        reviewedSha256: occurrence.reviewedSha256,
      })),
    };
  });

  fs.writeFileSync(WHITELIST_PATH, `${JSON.stringify({ allowed: nextAllowed }, null, 2)}\n`, 'utf8');
  console.log(`[write-css-inline-style-whitelist-review] updated ${nextAllowed.length} whitelist review stamp(s) as ${reviewer.trim()} on ${reviewedAt}`);
}

main();