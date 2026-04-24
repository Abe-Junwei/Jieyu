/**
 * 从 `country-state-city` 的 `Country.getAllCountries()` 生成静态快照（`src/data/iso3166CountriesSnapshot.json`），
 * 供运行时代码替代 npm 依赖（A-5）。顺序与 `getAllCountries()` 返回一致。
 *
 * 若仓库已移除该依赖，临时安装后再运行： `npm i country-state-city@3.2.1`（完成后可 `npm uninstall country-state-city`）
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let Country;
try {
  ({ Country } = await import('country-state-city'));
} catch {
  console.error('Missing dependency. Run: npm i country-state-city@3.2.1');
  process.exit(1);
}

const list = Country.getAllCountries();
const countries = list.map((c) => ({ isoCode: c.isoCode, name: c.name }));
const out = join(root, 'src/data/iso3166CountriesSnapshot.json');
const payload = {
  schemaVersion: 1,
  source: 'country-state-city@3.2.1 Country.getAllCountries()',
  generatedAt: new Date().toISOString().slice(0, 10),
  count: countries.length,
  countries,
};

writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${countries.length} countries → ${out}`);
