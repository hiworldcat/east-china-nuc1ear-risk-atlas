// 采样县级单元地形（opentopodata SRTM 90m）
// 每个县取中心 + 8 方位 × 2 个半径，共 17 点，用于估算平均海拔与地形起伏。
import fs from 'node:fs/promises';
import path from 'node:path';

const IN = 'data/raw/east_china_counties_raw.geojson';
const OUT = 'data/raw/elevations.json';
const API = 'https://api.opentopodata.org/v1/srtm90m';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fc = JSON.parse(await fs.readFile(IN, 'utf8'));
let store = {};
try {
  store = JSON.parse(await fs.readFile(OUT, 'utf8'));
} catch {}

const dirs = [];
for (let i = 0; i < 8; i++) {
  const a = (i * Math.PI) / 4;
  dirs.push([Math.cos(a), Math.sin(a)]);
}
const radii = [0.07, 0.16];

const tasks = [];
for (const f of fc.features) {
  const p = f.properties;
  if (store[p.adcode] && store[p.adcode].samples >= 5) continue;
  const [lng, lat] = p.center;
  const pts = [[lng, lat]];
  for (const r of radii) for (const [dx, dy] of dirs) {
    // 经度按纬度收缩，保证地面距离近似
    pts.push([lng + (dx * r) / Math.cos((lat * Math.PI) / 180), lat + dy * r]);
  }
  tasks.push({ adcode: p.adcode, name: p.name, pts });
}
console.log(`counties to sample: ${tasks.length} (${tasks.length * 17} points)`);

const flat = [];
for (const t of tasks) for (const [lng, lat] of t.pts) flat.push({ adcode: t.adcode, lng, lat });
console.log(`total points: ${flat.length}, batches: ${Math.ceil(flat.length / 100)}`);

let done = 0;
for (let i = 0; i < flat.length; i += 100) {
  const batch = flat.slice(i, i + 100);
  const locs = batch.map((q) => `${q.lat.toFixed(5)},${q.lng.toFixed(5)}`).join('|');
  let data = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(`${API}?locations=${encodeURIComponent(locs)}`, { headers: { 'user-agent': 'east-china-risk-map/1.0' } });
      if (res.status === 429) throw new Error('429 rate limited');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      if (data.status !== 'OK') throw new Error(data.status || 'bad status');
      break;
    } catch (err) {
      console.warn(`  batch ${i / 100} attempt ${attempt + 1}: ${err.message}`);
      await sleep(4000 + attempt * 3000);
    }
  }
  if (!data) {
    console.error(`  !! batch ${i / 100} failed, skipping`);
    continue;
  }
  for (let k = 0; k < batch.length; k++) {
    const q = batch[k];
    const el = data.results[k]?.elevation;
    if (el == null) continue;
    const rec = (store[q.adcode] ||= { samples: 0, values: [] });
    rec.values.push(Number(el));
    rec.samples = rec.values.length;
  }
  done++;
  if (done % 5 === 0) {
    await fs.writeFile(OUT, JSON.stringify(store));
    console.log(`  ${done}/${Math.ceil(flat.length / 100)} batches, ${Object.keys(store).length} counties`);
  }
  await sleep(1250);
}
await fs.writeFile(OUT, JSON.stringify(store));
console.log(`done: ${Object.keys(store).length} counties`);
