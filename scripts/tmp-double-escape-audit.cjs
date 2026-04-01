const fs = require('fs');

const path = '/tmp/jieyu_u_double_repo_hits.txt';
const content = fs.existsSync(path) ? fs.readFileSync(path, 'utf8').trim() : '';
const lines = content ? content.split('\n') : [];

const per = new Map();
let totals = { raw: 0, comment: 0, regex: 0, string: 0, otherCode: 0 };

for (const line of lines) {
  const m = line.match(/^(.+?):(\d+):(.*)$/);
  if (!m) continue;
  const file = m[1].replace(/^\.\//, '');
  const text = m[3] ?? '';

  totals.raw += 1;
  const rec = per.get(file) ?? { raw: 0, comment: 0, regex: 0, string: 0, otherCode: 0 };
  rec.raw += 1;

  const commentOnly = /^\s*(\/\/|\/\*|\*|\*\/)/.test(text);
  const regexLike = /\/.*\\\\u[0-9A-Fa-f]{4}/.test(text)
    || (/new\s+RegExp\s*\(/.test(text) && /\\\\u[0-9A-Fa-f]{4}/.test(text));
  const stringLike = /(["'`])(?:\\.|(?!\1).)*\\\\u[0-9A-Fa-f]{4}(?:\\.|(?!\1).)*\1/.test(text);

  if (commentOnly) {
    rec.comment += 1;
    totals.comment += 1;
  } else {
    if (regexLike) {
      rec.regex += 1;
      totals.regex += 1;
    }
    if (stringLike) {
      rec.string += 1;
      totals.string += 1;
    }
    if (!regexLike && !stringLike) {
      rec.otherCode += 1;
      totals.otherCode += 1;
    }
  }

  per.set(file, rec);
}

const arr = [...per.entries()].map(([file, r]) => ({
  file,
  ...r,
  score: r.regex * 10 + r.string * 2 + r.otherCode,
}));
arr.sort((a, b) => b.score - a.score || b.raw - a.raw || a.file.localeCompare(b.file));

console.log('TOTAL\t' + JSON.stringify(totals));
for (const item of arr) {
  console.log([
    item.file,
    `raw=${item.raw}`,
    `comment=${item.comment}`,
    `regex=${item.regex}`,
    `string=${item.string}`,
    `otherCode=${item.otherCode}`,
    `score=${item.score}`,
  ].join('\t'));
}
