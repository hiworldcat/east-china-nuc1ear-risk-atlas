// 获取全国省级边界作为邻域上下文，简化后输出 data/context.js
import fs from 'node:fs/promises';

const url = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json';
const res = await fetch(url);
if (!res.ok) throw new Error('HTTP ' + res.status);
const j = await res.json();

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
  return points.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
}
function procRing(r) { return simplify(r, 0.015); }
function procPoly(p) { return p.map(procRing).filter((r) => r.length >= 4); }
function geom(g) {
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: procPoly(g.coordinates) };
  if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: g.coordinates.map(procPoly).filter((p) => p.length) };
  return g;
}

const feats = j.features.map((f) => ({
  type: 'Feature',
  properties: { name: f.properties.name, adcode: f.properties.adcode, center: f.properties.center || f.properties.centroid },
  geometry: geom(f.geometry),
}));
const out = { type: 'FeatureCollection', features: feats };
await fs.writeFile('data/context.js', 'window.NUMA_CONTEXT = ' + JSON.stringify(out) + ';\n');
console.log('provinces', feats.length, (JSON.stringify(out).length / 1024).toFixed(0) + ' KB');
