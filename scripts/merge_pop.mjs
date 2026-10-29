// 合并 2020 七普县级人口数据（来源：github.com/leiii/census）
import fs from 'node:fs/promises';
import path from 'node:path';

const text = (await fs.readFile('data/raw/census_county.csv', 'utf8')).replace(/^\uFEFF/, '');
const lines = text.split(/\r?\n/).filter(Boolean);
const head = lines[0].split(',');
const idx = Object.fromEntries(head.map((h, i) => [h.replace(/^"|"$/g, ''), i]));

function parseLine(line) {
  // CSV 中引号字段不含逗号，直接按逗号切分即可
  return line.split(',').map((s) => s.replace(/^"|"$/g, ''));
}

const pop = {};
for (const line of lines.slice(1)) {
  const c = parseLine(line);
  const code = c[idx.county_code];
  if (!code) continue;
  if (!/^(31|32|33|34|35|36|37)/.test(code)) continue;
  pop[code] = {
    county: c[idx.county],
    city: c[idx.city],
    province: c[idx.province],
    pop2020: Number(c[idx.popu_2020]) || null,
    pop2010: Number(c[idx.popu_2010]) || null,
    household2020: Number(c[idx.household_2020]) || null,
    urbanShare: null,
  };
}

const fc = JSON.parse(await fs.readFile('data/raw/east_china_counties_raw.geojson', 'utf8'));
let hit = 0;
const miss = [];
for (const f of fc.features) {
  const p = f.properties;
  const rec = pop[p.adcode];
  if (rec) {
    Object.assign(p, { pop2020: rec.pop2020, pop2010: rec.pop2010, household2020: rec.household2020 });
    hit++;
  } else {
    p.pop2020 = null;
    miss.push(`${p.adcode} ${p.name} (${p.city})`);
  }
}
await fs.writeFile('data/raw/east_china_counties_pop.geojson', JSON.stringify(fc));
console.log(`matched ${hit}/${fc.features.length}`);
if (miss.length) console.log('missing:\n' + miss.join('\n'));
