// 生成主要高速公路与国道走廊（OSRM 实际公路路径 + 简化）
import fs from 'node:fs/promises';

const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXPRESSWAYS = [
  { ref: 'G2', name: '京沪高速', pts: [[117.00, 36.65], [118.35, 35.05], [119.02, 33.61], [120.28, 31.92], [121.47, 31.23]] },
  { ref: 'G15', name: '沈海高速', pts: [[121.40, 37.55], [120.38, 36.07], [119.53, 35.42], [119.22, 34.60], [120.16, 33.35], [120.86, 32.01], [121.47, 31.23], [121.55, 29.87], [121.42, 28.66], [120.70, 27.99], [119.55, 26.66], [119.30, 26.08], [118.09, 24.48]] },
  { ref: 'G25', name: '长深高速', pts: [[119.22, 34.60], [119.02, 33.61], [118.80, 32.06], [120.15, 30.27], [119.65, 29.08], [119.92, 28.45], [118.18, 26.64], [117.64, 26.26]] },
  { ref: 'G40', name: '沪陕高速', pts: [[121.47, 31.23], [118.80, 32.06], [117.23, 31.82], [116.50, 31.75]] },
  { ref: 'G50', name: '沪渝高速', pts: [[121.47, 31.23], [120.09, 30.89], [118.76, 30.94], [118.38, 31.33], [117.81, 30.94], [117.06, 30.54]] },
  { ref: 'G60', name: '沪昆高速', pts: [[121.47, 31.23], [120.15, 30.27], [119.65, 29.08], [118.87, 28.94], [117.94, 28.45], [115.86, 28.68]] },
  { ref: 'G3', name: '京台高速', pts: [[117.00, 36.65], [117.18, 34.26], [117.23, 31.82], [118.34, 29.71], [118.18, 26.64], [119.30, 26.08]] },
  { ref: 'G56', name: '杭瑞高速', pts: [[120.15, 30.27], [118.34, 29.71], [117.18, 29.27], [116.00, 29.72]] },
  { ref: 'G1512', name: '甬金高速', pts: [[121.55, 29.87], [119.65, 29.08]] },
  { ref: 'G1513', name: '温丽高速', pts: [[120.70, 27.99], [119.92, 28.45]] },
  { ref: 'G76', name: '厦蓉高速', pts: [[118.09, 24.48], [117.65, 24.51], [117.02, 25.08], [114.94, 25.83]] },
  { ref: 'G70', name: '福银高速', pts: [[119.30, 26.08], [115.86, 28.68], [116.00, 29.72]] },
  { ref: 'G1511', name: '日兰高速', pts: [[119.53, 35.42], [118.35, 35.05], [116.59, 35.41], [115.48, 35.23]] },
  { ref: 'G4221', name: '沪武高速', pts: [[121.47, 31.23], [119.97, 31.81], [118.80, 32.06], [118.51, 31.67]] },
  { ref: 'G30', name: '连霍高速', pts: [[119.22, 34.60], [117.18, 34.26], [115.65, 34.45]] },
];

const NATIONALS = [
  { ref: 'G104', name: '京岚线', pts: [[117.00, 36.65], [117.18, 34.26], [118.80, 32.06], [120.15, 30.27], [120.70, 27.99], [119.30, 26.08]] },
  { ref: 'G105', name: '京澳线', pts: [[115.65, 34.45], [115.82, 32.90], [116.00, 29.72], [115.86, 28.68]] },
  { ref: 'G206', name: '烟汕线', pts: [[121.40, 37.55], [118.35, 35.05], [117.18, 34.26], [117.23, 31.82], [117.06, 30.54], [117.18, 29.27], [117.07, 28.27], [116.03, 25.89]] },
  { ref: 'G312', name: '沪霍线', pts: [[121.47, 31.23], [120.58, 31.30], [120.30, 31.57], [119.97, 31.81], [118.80, 32.06], [117.23, 31.82], [116.50, 31.75]] },
  { ref: 'G318', name: '沪聂线', pts: [[121.47, 31.23], [120.09, 30.89], [118.76, 30.94], [117.49, 30.66], [117.06, 30.54]] },
  { ref: 'G320', name: '沪瑞线', pts: [[121.47, 31.23], [120.15, 30.27], [119.65, 29.08], [117.94, 28.45], [115.86, 28.68], [114.42, 27.82]] },
  { ref: 'G324', name: '福昆线', pts: [[119.30, 26.08], [119.01, 25.45], [118.68, 24.87], [118.09, 24.48], [117.65, 24.51], [117.02, 25.08]] },
  { ref: 'G327', name: '连菏线', pts: [[119.22, 34.60], [118.35, 35.05], [116.59, 35.41], [115.48, 35.23]] },
];

function sqSegDist(p, a, b) {
  let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x; dy = p[1] - y;
  return dx * dx + dy * dy;
}
function simplify(points, tol) {
  if (points.length <= 5) return points;
  const sq = tol * tol, keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, idx = -1;
    for (let i = a + 1; i < b; i++) { const d = sqSegDist(points[i], points[a], points[b]); if (d > md) { md = d; idx = i; } }
    if (md > sq && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]);
}

async function route(item, kind) {
  const coords = item.pts.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url = `${OSRM}${coords}?geometries=geojson&overview=full&continue_straight=false`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'east-china-risk-map/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j.code !== 'Ok' || !j.routes || !j.routes[0]) throw new Error(j.code || 'no route');
      const r = j.routes[0];
      const line = simplify(r.geometry.coordinates, kind === 'expressway' ? 0.0035 : 0.0045);
      return {
        type: 'Feature',
        properties: {
          ref: item.ref, name: item.name, kind,
          distanceKm: Math.round(r.distance / 1000),
          labelPoint: line[Math.floor(line.length / 2)],
          note: '沿主要公路路径生成，作走廊示意，非官方线位',
        },
        geometry: { type: 'LineString', coordinates: line },
      };
    } catch (err) {
      console.warn(`  ${item.ref} attempt ${attempt + 1}: ${err.message}`);
      await sleep(1500 * (attempt + 1));
    }
  }
  return null;
}

const out = { expressways: [], national: [], meta: { generatedAt: new Date().toISOString(), source: 'OSRM / OpenStreetMap 公路路径，简化后作走廊示意' } };
for (const item of EXPRESSWAYS) {
  const f = await route(item, 'expressway');
  if (f) { out.expressways.push(f); console.log('ok', item.ref, item.name, f.properties.distanceKm + 'km', f.geometry.coordinates.length + 'pts'); }
  await sleep(650);
}
for (const item of NATIONALS) {
  const f = await route(item, 'national');
  if (f) { out.national.push(f); console.log('ok', item.ref, item.name, f.properties.distanceKm + 'km', f.geometry.coordinates.length + 'pts'); }
  await sleep(650);
}
await fs.writeFile('data/roads.js', 'window.NUMA_ROADS = ' + JSON.stringify(out) + ';\n');
console.log('expressways', out.expressways.length, 'national', out.national.length, 'size', (JSON.stringify(out).length / 1024).toFixed(0) + ' KB');
