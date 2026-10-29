// 抓取阿里云 DataV 行政区划 GeoJSON，整理为华东七省县级单元
import fs from 'node:fs/promises';
import path from 'node:path';

const PROVINCES = [
  { code: '310000', name: '上海市', short: '沪' },
  { code: '320000', name: '江苏省', short: '苏' },
  { code: '330000', name: '浙江省', short: '浙' },
  { code: '340000', name: '安徽省', short: '皖' },
  { code: '350000', name: '福建省', short: '闽' },
  { code: '360000', name: '江西省', short: '赣' },
  { code: '370000', name: '山东省', short: '鲁' },
];

const BASE = 'https://geo.datav.aliyun.com/areas_v3/bound';
const OUT = path.resolve('data/raw');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 45000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'east-china-risk-map/1.0' } });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === tries - 1) throw err;
      console.warn(`  retry ${i + 1}: ${url} (${err.message})`);
      await sleep(1200 * (i + 1));
    }
  }
}

function featureCenter(f) {
  const p = f.properties;
  if (Array.isArray(p.center) && p.center.length === 2) return p.center;
  if (Array.isArray(p.centroid) && p.centroid.length === 2) return p.centroid;
  // 从几何外环取平均
  let g = f.geometry;
  if (!g) return null;
  const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((c) => c[0]) : [];
  let sx = 0, sy = 0, n = 0;
  for (const ring of rings) for (const [x, y] of ring) { sx += x; sy += y; n++; }
  return n ? [sx / n, sy / n] : null;
}

const all = [];
const cityIndex = [];
const seen = new Set();

for (const prov of PROVINCES) {
  console.log(`\n== ${prov.name} (${prov.code}) ==`);
  const pj = await getJSON(`${BASE}/${prov.code}_full.json`);
  const feats = pj.features || [];
  console.log(`  province features: ${feats.length}`);

  for (const f of feats) {
    const p = f.properties;
    if (p.level === 'district') {
      addCounty(f, prov, { city: prov.name, cityCode: prov.code });
    } else if (p.level === 'city') {
      cityIndex.push({ adcode: p.adcode, name: p.name, province: prov.name, provinceCode: prov.code, center: featureCenter(f), level: 'city' });
      try {
        const cj = await getJSON(`${BASE}/${p.adcode}_full.json`);
        const cfeats = cj.features || [];
        console.log(`  ${p.name}: ${cfeats.length}`);
        for (const cf of cfeats) {
          const cp = cf.properties;
          if (cp.level === 'district') addCounty(cf, prov, { city: p.name, cityCode: p.adcode });
          else if (cp.level === 'city') addCounty(cf, prov, { city: p.name, cityCode: p.adcode }); // 省直辖县级市等
        }
      } catch (err) {
        console.warn(`  !! ${p.name} 下钻失败，使用市界代替: ${err.message}`);
        addCounty(f, prov, { city: p.name, cityCode: p.adcode });
      }
      await sleep(250);
    }
  }
}

function addCounty(f, prov, ctx) {
  const p = f.properties;
  if (!p || !p.adcode || !p.name) return;
  const code = String(p.adcode);
  if (seen.has(code)) return;
  const center = featureCenter(f);
  if (!center) return;
  seen.add(code);
  all.push({
    type: 'Feature',
    properties: {
      adcode: code,
      name: p.name,
      level: p.level,
      city: ctx.city,
      cityCode: String(ctx.cityCode),
      province: prov.name,
      provinceCode: prov.code,
      provinceShort: prov.short,
      center,
      centroid: Array.isArray(p.centroid) ? p.centroid : center,
    },
    geometry: f.geometry,
  });
}

all.sort((a, b) => a.properties.adcode.localeCompare(b.properties.adcode));
const fc = { type: 'FeatureCollection', features: all, meta: { source: '阿里云 DataV.GeoAtlas areas_v3', fetchedAt: new Date().toISOString(), provinceCodes: PROVINCES.map((p) => p.code) } };
await fs.writeFile(path.join(OUT, 'east_china_counties_raw.geojson'), JSON.stringify(fc));
await fs.writeFile(path.join(OUT, 'east_china_cities.json'), JSON.stringify(cityIndex, null, 1));
console.log(`\nSaved ${all.length} county-level features.`);
const byProv = {};
for (const f of all) byProv[f.properties.province] = (byProv[f.properties.province] || 0) + 1;
console.table(byProv);
