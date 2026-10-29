// 构建主要河流与湖泊图层：Natural Earth 10m + 人工校核补充
import fs from 'node:fs/promises';

const BBOX = [110, 18, 126, 40];
const RIVER_NAMES = {
  'Chang Jiang': '长江', Yangtze: '长江', Huang: '黄河', Yellow: '黄河',
  Huai: '淮河', Gan: '赣江', Fuchun: '富春江', Min: '闽江', Ou: '瓯江',
  Jiulong: '九龙江', Mei: '梅江', Ying: '颍河', Quan: '泉江', Han: '汉江',
  Xiang: '湘江', Yuan: '沅江', Xi: '西江', Dan: '丹江', Luan: '滦河',
  Yongding: '永定河', Hai: '海河', Wei: '渭河', Qin: '沁河', Zhang: '漳河',
  Wuding: '无定河', Fen: '汾河', Yi: '沂河', Sanggan: '桑干河', Hudi: '淮河入江水道',
};
const LAKE_NAMES = {
  'Hongze Hu': '洪泽湖', 'Tai Hu': '太湖', 'Poyang Hu': '鄱阳湖', 'Chao Hu': '巢湖',
  'Gaoyou Hu': '高邮湖', 'Weishan Hu': '微山湖', 'Dongting Hu': '洞庭湖',
  'Xinanjiang Shuiku': '千岛湖', 'Dongping Hu': '东平湖', 'Luoma Hu': '骆马湖',
  'Ge Hu': '滆湖', 'Shijiu Hu': '石臼湖', 'Hong Hu': '洪湖', 'Liangzi Hu': '梁子湖',
  'Long Hu': '龙感湖', 'Daguan Hu': '大官湖', 'Huangtang Hu': '斧头湖',
  'Wuchang Hu': '武昌湖', 'Baidagang Shuiku': '北大港水库', 'Po Hu': '鄱阳湖',
};
const MAJOR_RIVERS = new Set(['长江', '黄河', '淮河', '赣江', '闽江', '瓯江', '富春江', '钱塘江', '新安江', '京杭大运河', '沂河', '九龙江']);
const MAJOR_LAKES = new Set(['太湖', '洪泽湖', '鄱阳湖', '巢湖', '千岛湖', '微山湖', '高邮湖']);

function inBox(c) { return c[0] >= BBOX[0] && c[0] <= BBOX[2] && c[1] >= BBOX[1] && c[1] <= BBOX[3]; }
function intersects(g) {
  if (!g) return false;
  if (g.type === 'LineString') return g.coordinates.some(inBox);
  if (g.type === 'MultiLineString') return g.coordinates.some((r) => r.some(inBox));
  if (g.type === 'Polygon') return g.coordinates.some((r) => r.some(inBox));
  if (g.type === 'MultiPolygon') return g.coordinates.some((p) => p.some((r) => r.some(inBox)));
  return false;
}
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
  if (points.length <= 6) return points;
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
function geoSimplify(g, tol) {
  if (!g) return null;
  if (g.type === 'LineString') return { type: 'LineString', coordinates: simplify(g.coordinates, tol) };
  if (g.type === 'MultiLineString') return { type: 'MultiLineString', coordinates: g.coordinates.map((r) => simplify(r, tol)).filter((r) => r.length > 1) };
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.coordinates.map((r) => simplify(r, tol)).filter((r) => r.length > 3) };
  if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map((r) => simplify(r, tol)).filter((r) => r.length > 3)).filter((p) => p.length) };
  return null;
}
function longestLine(g) {
  let best = null;
  if (g.type === 'LineString') best = g.coordinates;
  if (g.type === 'MultiLineString') for (const r of g.coordinates) if (!best || r.length > best.length) best = r;
  return best;
}

const rivers = [];
const riverSrc = JSON.parse(await fs.readFile('data/raw/ne_rivers.geojson', 'utf8'));
for (const f of riverSrc.features) {
  if (!intersects(f.geometry)) continue;
  const p = f.properties || {};
  const cn = RIVER_NAMES[p.name] || RIVER_NAMES[p.name_en];
  if (!cn) continue;
  const g = geoSimplify(f.geometry, 0.008);
  const line = g && longestLine(g);
  if (!line || line.length < 2) continue;
  rivers.push({ type: 'Feature', properties: { name: cn, nameEn: p.name_en || p.name, rank: MAJOR_RIVERS.has(cn) ? 1 : 2, labelPoint: line[Math.floor(line.length / 2)] }, geometry: g });
}

// 人工校核：NE 未覆盖或名称缺失的华东重要河流
const curatedRivers = [
  ['钱塘江', [[121.10, 30.32], [120.55, 30.28], [120.20, 30.20], [119.95, 30.05], [119.68, 29.80], [119.28, 29.48]]],
  ['新安江', [[119.28, 29.48], [119.16, 29.54], [119.04, 29.61]]],
  ['京杭大运河', [[116.30, 37.45], [116.00, 36.45], [116.59, 35.41], [117.32, 34.81], [117.18, 34.26], [118.28, 33.96], [119.02, 33.61], [119.42, 32.39], [119.45, 32.20], [119.95, 31.78], [120.30, 31.57], [120.58, 31.30], [120.75, 30.75], [120.15, 30.27]]],
  ['椒江', [[121.60, 28.60], [121.35, 28.72], [121.14, 28.85], [120.95, 28.92]]],
  ['甬江', [[121.72, 29.95], [121.62, 29.91], [121.55, 29.87], [121.45, 29.80]]],
  ['飞云江', [[120.65, 27.78], [120.45, 27.83], [120.25, 27.90], [120.05, 27.98]]],
  ['鳌江', [[120.57, 27.58], [120.48, 27.64], [120.35, 27.72], [120.20, 27.80]]],
  ['木兰溪', [[119.01, 25.43], [118.85, 25.40], [118.69, 25.36]]],
  ['晋江', [[118.58, 24.91], [118.38, 24.98], [118.18, 25.08]]],
  ['九龙江', [[117.65, 24.51], [117.35, 24.65], [117.02, 25.08]]],
  ['抚河', [[116.36, 27.95], [116.10, 28.20], [115.89, 28.68]]],
  ['信江', [[117.97, 28.45], [117.50, 28.38], [117.07, 28.27], [116.70, 28.60]]],
  ['饶河', [[117.86, 29.25], [117.50, 29.20], [117.18, 29.27], [116.80, 29.10]]],
  ['修河', [[114.55, 29.03], [115.10, 29.05], [115.81, 29.02]]],
  ['沂河', [[118.17, 36.19], [118.35, 35.60], [118.35, 35.10], [118.35, 34.37], [118.28, 33.96]]],
  ['沭河', [[118.60, 36.20], [118.55, 35.60], [118.45, 35.00], [118.40, 34.40]]],
];
for (const [name, coords] of curatedRivers) {
  rivers.push({ type: 'Feature', properties: { name, nameEn: name, rank: MAJOR_RIVERS.has(name) ? 1 : 2, labelPoint: coords[Math.floor(coords.length / 2)] }, geometry: { type: 'LineString', coordinates: coords } });
}

// 去重同名的重复分段（保留最长）
const byName = new Map();
for (const f of rivers) {
  const k = f.properties.name;
  const len = JSON.stringify(f.geometry).length;
  if (!byName.has(k) || len > byName.get(k).len) byName.set(k, { f, len });
}
const riverFeatures = [...byName.values()].map((x) => x.f);

const lakes = [];
const lakeSrc = JSON.parse(await fs.readFile('data/raw/ne_lakes.geojson', 'utf8'));
for (const f of lakeSrc.features) {
  if (!intersects(f.geometry)) continue;
  const p = f.properties || {};
  const cn = LAKE_NAMES[p.name] || LAKE_NAMES[p.name_en];
  if (!cn) continue;
  const g = geoSimplify(f.geometry, 0.006);
  if (!g) continue;
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0] && g.coordinates[0][0];
  if (!ring || ring.length < 3) continue;
  let sx = 0, sy = 0;
  for (const [x, y] of ring) { sx += x; sy += y; }
  lakes.push({ type: 'Feature', properties: { name: cn, nameEn: p.name_en || p.name, rank: MAJOR_LAKES.has(cn) ? 1 : 2, labelPoint: [sx / ring.length, sy / ring.length] }, geometry: g });
}

const lakeByName = new Map();
for (const f of lakes) {
  const k = f.properties.name;
  const len = JSON.stringify(f.geometry).length;
  if (!lakeByName.has(k) || len > lakeByName.get(k).len) lakeByName.set(k, { f, len });
}
const lakeFeatures = [...lakeByName.values()].map((x) => x.f);

const out = {
  type: 'FeatureCollection',
  meta: { source: 'Natural Earth 10m + 人工校核补充', generatedAt: new Date().toISOString() },
  rivers: { type: 'FeatureCollection', features: riverFeatures },
  lakes: { type: 'FeatureCollection', features: lakeFeatures },
};
await fs.writeFile('data/hydro.js', 'window.NUMA_HYDRO = ' + JSON.stringify(out) + ';\n');
console.log('rivers', riverFeatures.length, 'lakes', lakeFeatures.length, 'size', (JSON.stringify(out).length / 1024).toFixed(0) + ' KB');
console.log('river names:', riverFeatures.map((f) => f.properties.name).join('、'));
console.log('lake names:', lakeFeatures.map((f) => f.properties.name).join('、'));
