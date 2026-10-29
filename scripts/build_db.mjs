// 构建华东县级风险数据库：地形、人口、风险评分、撤离方案、前端数据
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Risk = require('../assets/risk.js');

const RAW = 'data/raw/east_china_counties_pop.geojson';
const ELEV = 'data/raw/elevations.json';
const TARGETS_FILE = 'data/model/targets.json';
const OUT_JS = 'data/database.js';
const OUT_CSV = 'data/county_database.csv';
const OUT_GEO = 'data/counties_scored.geojson';
const OUT_SUMMARY = 'data/summary.json';

const SHANGHAI = [121.475, 31.232];

// 2020 七普中部分新设/合并区未单列，按公开口径与区划面积估算（标注 estimated）
const POP_OVERRIDES = {
  320302: 420000, 320305: 460000, 320312: 1050000,
  320602: 1216000, 320684: 900000,
  320803: 780000, 320812: 600000, 320813: 360000,
  320902: 820000, 321102: 400000, 321202: 500000, 321203: 280000,
  321302: 850000, 321311: 620000,
  330102: 1320000, 330105: 1120000, 330109: 2010000, 330113: 1170000, 330114: 770000,
  330402: 630000, 330411: 570000,
  340102: 1010000, 340104: 1050000, 340211: 300000,
  340302: 260000, 340303: 360000, 340304: 310000, 340311: 250000,
  340802: 300000, 340811: 260000, 341102: 400000, 341103: 460000,
  341802: 780000, 341881: 400000,
  370102: 820000, 370105: 720000, 370112: 1050000, 370113: 600000, 370114: 1070000, 370115: 500000,
  370302: 600000, 370303: 800000, 370306: 350000, 370502: 800000, 370503: 250000,
  370611: 500000, 370612: 500000, 370613: 400000, 370614: 450000, 370703: 400000,
  370811: 1200000, 370812: 550000, 370902: 800000, 370911: 900000, 370982: 1200000,
  371002: 600000, 371102: 900000, 371302: 1500000, 371311: 700000, 371402: 700000, 371702: 1300000,
};

// 精选山区避难节点（县/区驻地）：低目标价值 + 有基本民用设施 + 可长期自持
const HAVENS = {
  331126: '庆元县城·闽浙边高山盆地，香菇与竹木产区，小水电多',
  331181: '龙泉县城·仙霞岭深处，有市人民医院与粮储，山路多',
  331127: '景宁县城·浙南高山峡谷，畲乡山区，水源足',
  331123: '遂昌县城·仙霞岭北麓，有小型工业但非战略目标',
  331125: '云和县城·瓯江上游，木玩产业，人口少',
  331124: '松阳县城·松古平原盆地，农业条件好，四面低山',
  341023: '黟县县城·黄山南麓，旅游县，耕地少但隐蔽好',
  341024: '祁门县城·皖赣边山区，茶叶与林业，水源好',
  341022: '休宁县城·黄山南麓，有县医院与高速互通',
  341003: '黄山区（甘棠）·黄山北麓，旅游接待能力较强',
  341824: '绩溪县城·皖南深山，小三线历史纵深，有高铁站',
  341823: '泾县县城·青弋江上游，皖南山区，有云岭与茂林',
  341825: '旌德县城·黄山余脉，人口少，农业与林业为主',
  341722: '石台县城·皖南深山，富硒农业，人口密度低',
  340828: '岳西县城·大别山腹地，高山蔬菜与药材',
  341524: '金寨县城·大别山北麓，水库与红色旅游，县域面积大',
  341525: '霍山县城·大别山北坡，有县医院与佛子岭水库',
  361130: '婺源县城·皖赣浙交界，山区盆地，旅游接待强',
  330824: '开化县城·钱江源头，山区，避开水坝下游',
  330127: '淳安县城（千岛湖镇）·需避开新安江坝下，选山腰台地',
  330329: '泰顺县城·浙闽边深山，廊桥山区，人口少',
  330328: '文成县城·飞云江上游，山区，有百丈漈水库需避坝下',
  350924: '寿宁县城·闽浙边高山，茶叶与硒锌农业',
  350926: '柘荣县城·闽东高山，人口少，有县医院',
  350782: '武夷山市区·武夷山脉，旅游接待强，需避景区核心',
  350722: '浦城县城·闽北门户，盆地农业，有高速与铁路',
  350723: '光泽县城·闽赣边山区，人口少，林业为主',
  350430: '建宁县城·闽西北深山，莲业与林业',
  350429: '泰宁县城·丹霞山区，旅游接待能力较好',
  361028: '资溪县城·赣闽边山区，面包产业，人口少',
  361022: '黎川县城·赣东山区，瓷业与农业',
  360424: '修水县城·赣西北山区，面积大，有县医院',
  360926: '铜鼓县城·湘赣边深山，人口少，林业为主',
  371328: '蒙阴县城·沂蒙山腹地，蜜桃与林业，有高速',
  371323: '沂水县城·沂蒙山北麓，人口较多但目标价值低',
  371121: '五莲县城·鲁东南山区，生态县',
  370724: '临朐县城·沂山北麓，山区农业',
  370686: '栖霞市区·胶东丘陵，苹果产区，无重化',
  370406: '山亭区·鲁南山区，人口密度低',
  370323: '沂源县城·鲁山腹地，山区农业',
  350821: '长汀县城·闽西山区，客家首府，有县医院',
  350825: '连城县城·闽西山区，冠豸山，农业为主',
  350628: '平和县城·闽南山区，蜜柚产区，避古雷下风',
  350629: '华安县城·闽南山区，九龙江上游，人口少',
  360827: '遂川县城·罗霄山脉，山区农业',
  360881: '井冈山市区·罗霄山中段，旅游接待强',
  360725: '崇义县城·赣南山区，林业与钨矿（非冶炼）',
  360724: '上犹县城·赣南山区，水库多，需避坝下',
  360734: '寻乌县城·赣闽粤边山区，人口少',
  371083: '乳山市区·胶东丘陵海滨，需避核电站下风',
};

const PROV_AGRI = { 上海市: 35, 江苏省: 78, 浙江省: 62, 安徽省: 82, 福建省: 58, 江西省: 80, 山东省: 78 };

const MACRO = {
  上海市: (c) => ['黄浦区', '徐汇区', '长宁区', '静安区', '普陀区', '虹口区', '杨浦区'].includes(c) ? '上海主城' : '上海郊区',
  南京市: '苏南', 无锡市: '苏南', 常州市: '苏南', 苏州市: '苏南', 镇江市: '苏南',
  南通市: '苏中', 扬州市: '苏中', 泰州市: '苏中',
  徐州市: '苏北', 连云港市: '苏北', 淮安市: '苏北', 盐城市: '苏北', 宿迁市: '苏北',
  杭州市: '浙北', 嘉兴市: '浙北', 湖州市: '浙北', 绍兴市: '浙东沿海',
  宁波市: '浙东沿海', 舟山市: '浙东沿海', 台州市: '浙东沿海', 温州市: '浙东沿海',
  金华市: '浙西南', 衢州市: '浙西南', 丽水市: '浙西南',
  黄山市: '皖南', 宣城市: '皖南', 池州市: '皖南',
  合肥市: '皖中', 芜湖市: '皖中', 马鞍山市: '皖中', 铜陵市: '皖中', 安庆市: '皖中', 滁州市: '皖中', 六安市: '皖西',
  蚌埠市: '皖北', 淮南市: '皖北', 淮北市: '皖北', 阜阳市: '皖北', 宿州市: '皖北', 亳州市: '皖北',
  福州市: '闽东北', 宁德市: '闽东北', 莆田市: '闽东北',
  厦门市: '闽南', 泉州市: '闽南', 漳州市: '闽南',
  南平市: '闽西北', 三明市: '闽西北', 龙岩市: '闽西北',
  南昌市: '赣北', 九江市: '赣北', 景德镇市: '赣东北', 上饶市: '赣东北', 鹰潭市: '赣东北', 抚州市: '赣东',
  宜春市: '赣西', 萍乡市: '赣西', 新余市: '赣西',
  赣州市: '赣南', 吉安市: '赣南',
  济南市: '鲁中', 泰安市: '鲁中', 淄博市: '鲁中',
  青岛市: '胶东', 烟台市: '胶东', 威海市: '胶东', 潍坊市: '胶东', 日照市: '胶东',
  临沂市: '鲁南', 枣庄市: '鲁南', 济宁市: '鲁南', 菏泽市: '鲁西南',
  德州市: '鲁西北', 聊城市: '鲁西北', 滨州市: '鲁西北', 东营市: '鲁西北',
};

const DEST_CORRIDOR = {
  上海主城: { hw: 'G50 沪渝高速 / G60 沪昆高速', via: '虹桥—青浦—湖州/杭州', bottleneck: '延安高架、G50 徐泾、杭州绕城' },
  上海郊区: { hw: 'G15/G50 市域高速', via: '青浦—金泽，或崇明方向', bottleneck: '长江隧桥、G50 徐泾段' },
  苏南: { hw: 'G4221 沪武高速 / G50 沪渝高速', via: '溧水—芜湖—宣城', bottleneck: '南京绕城、马鞍山长江大桥' },
  浙江省: { hw: 'G60 沪昆高速 → G25 长深高速', via: '杭州—金华—丽水', bottleneck: '杭州绕城、金华东枢纽' },
  皖南: { hw: 'G50 沪渝高速 / G56 杭瑞高速', via: '湖州—宣城—泾县，或杭州—黄山', bottleneck: '黄山北站、徽杭高速隧道群、G50 广德段' },
  浙西南: { hw: 'G60 沪昆高速 → G25 长深高速', via: '杭州—金华—丽水', bottleneck: '杭州绕城、金华东枢纽、G25 丽水段长隧道' },
  皖西: { hw: 'G40 沪陕高速 → G35 济广高速', via: '合肥—六安—霍山', bottleneck: '合肥绕城、六安—霍山山路' },
  皖中: { hw: 'G40 沪陕高速 → G35 济广高速', via: '合肥—桐城—岳西', bottleneck: '合肥绕城、G35 山区路段' },
  皖北: { hw: 'G3 京台高速 / G36 宁洛高速', via: '蚌埠—阜阳—亳州', bottleneck: '蚌埠枢纽、淮河大桥' },
  苏中: { hw: 'G15 沈海高速 / G40 沪陕高速', via: '南通—泰州—扬州', bottleneck: '苏通大桥、江阴大桥' },
  浙北: { hw: 'G56 杭瑞高速 / G25 长深高速', via: '杭州—临安—淳安', bottleneck: '杭州绕城、杭徽高速隧道' },
  闽东北: { hw: 'G15 沈海高速 / G1523 甬莞高速', via: '宁德—福安—寿宁', bottleneck: '宁德枢纽、山区路段' },
  赣北: { hw: 'G70 福银高速 / G56 杭瑞高速', via: '九江—修水，或南昌—铜鼓', bottleneck: '南昌绕城、赣西北山路' },
  赣西: { hw: 'G60 沪昆高速 / G45 大广高速', via: '宜春—铜鼓—修水', bottleneck: '宜春枢纽、山区路段' },
  鲁南: { hw: 'G2 京沪高速 → G22 青兰高速', via: '临沂—蒙阴—沂源', bottleneck: '临沂枢纽、沂蒙山隧道' },
  鲁西南: { hw: 'G1511 日兰高速 / G35 济广高速', via: '菏泽—济宁—临沂', bottleneck: '菏泽枢纽、黄河大桥' },
  鲁西北: { hw: 'G2 京沪高速 / G3 京台高速', via: '德州—济南—滨州', bottleneck: '济南绕城、黄河大桥' },
  闽西北: { hw: 'G3 京台高速 / G25 长深高速', via: '南平—建阳—武夷山', bottleneck: '武夷山隧道群、南平枢纽' },
  赣东北: { hw: 'G56 杭瑞高速 / G35 济广高速', via: '景德镇—婺源', bottleneck: '景德镇枢纽、婺源山区路段' },
  鲁中: { hw: 'G2 京沪高速 → G22 青兰高速', via: '临沂—莱芜—沂源', bottleneck: '江阴大桥/苏通大桥、临沂枢纽' },
  胶东: { hw: 'G15 沈海高速', via: '胶州—诸城—五莲', bottleneck: '胶州湾大桥、潍坊枢纽' },
  苏北: { hw: 'G15 沈海高速 / G2 京沪高速', via: '盐城—淮安—宿迁', bottleneck: '崇启大桥、苏通大桥、江阴大桥' },
  浙东沿海: { hw: 'G15 沈海高速 / G1512 甬金高速', via: '宁波—金华—丽水', bottleneck: '杭州湾跨海大桥、甬金高速隧道' },
  赣南: { hw: 'G45 大广高速 / G35 济广高速', via: '吉安—赣州—寻乌', bottleneck: '赣州枢纽、山区长下坡' },
  闽南: { hw: 'G15 沈海高速 → G76 厦蓉高速', via: '漳州—龙岩—长汀', bottleneck: '厦门海沧大桥、漳州枢纽' },
  赣东: { hw: 'G35 济广高速 / G70 福银高速', via: '抚州—资溪—黎川', bottleneck: '抚州枢纽、资溪山区' },
};

const file = JSON.parse(await fs.readFile(RAW, 'utf8'));
const elev = JSON.parse(await fs.readFile(ELEV, 'utf8'));
const tmeta = JSON.parse(await fs.readFile(TARGETS_FILE, 'utf8'));
let ind = { targets: [], meta: {} };
try { ind = JSON.parse(await fs.readFile('data/model/industry_additions.json', 'utf8')); } catch {}
const typeMeta = { ...tmeta.meta.types, ...(ind.meta.types || {}) };
const seenTargets = new Set();
const targets = [];
for (const t of [...tmeta.targets, ...(ind.targets || [])]) {
  if (seenTargets.has(t.name)) continue;
  seenTargets.add(t.name);
  const id = t.id || `${t.type}-${String(targets.length + 1).padStart(3, '0')}`;
  targets.push({ ...t, id, typeFallout: (typeMeta[t.type] || {}).fallout ?? 0.5 });
}
console.log(`targets merged: ${targets.length} (core ${tmeta.targets.length}, industry ${(ind.targets || []).length})`);

// ---------- 人口补全 ----------
const censusText = (await fs.readFile('data/raw/census_county.csv', 'utf8')).replace(/^\uFEFF/, '');
const censusLines = censusText.split(/\r?\n/).filter(Boolean);
const codeGroup = new Map();
for (const line of censusLines.slice(1)) {
  const c = line.split(',').map((s) => s.replace(/^"|"$/g, ''));
  const codes = String(c[1] || '').split(';').filter((x) => /^\d{6}$/.test(x));
  for (const code of codes) codeGroup.set(code, { codes, pop: Number(c[6]) || null });
}

let popFilled = 0;
for (const f of file.features) {
  const p = f.properties;
  if (!p.pop2020) {
    if (POP_OVERRIDES[p.adcode]) {
      p.pop2020 = POP_OVERRIDES[p.adcode];
      p.popEstimated = true;
    } else {
      const g = codeGroup.get(p.adcode);
      if (g && g.pop) {
        p.pop2020 = Math.round(g.pop / g.codes.length);
        p.popEstimated = true;
      } else {
        p.pop2020 = 300000;
        p.popEstimated = true;
        p.popFallback = true;
      }
    }
    popFilled++;
  }
}
console.log(`population filled: ${popFilled}`);

// ---------- 几何工具 ----------
const RX = 6371.0088;
function ringArea(coords) {
  let area = 0;
  for (let i = 0, n = coords.length; i < n - 1; i++) {
    const [x1, y1] = coords[i], [x2, y2] = coords[i + 1];
    area += (x2 - x1) * Math.PI / 180 * (2 + Math.sin(y1 * Math.PI / 180) + Math.sin(y2 * Math.PI / 180));
  }
  return Math.abs(area * RX * RX / 2);
}
function polyArea(coords) {
  let a = ringArea(coords[0]);
  for (let i = 1; i < coords.length; i++) a -= ringArea(coords[i]);
  return Math.max(a, 0);
}
function geometryArea(geom) {
  if (!geom) return 0;
  if (geom.type === 'Polygon') return polyArea(geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.reduce((s, p) => s + polyArea(p), 0);
  return 0;
}

function sqSegDist(p, a, b) {
  let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x; dy = p[1] - y;
  return dx * dx + dy * dy;
}
function simplifyRing(points, tol) {
  if (points.length <= 5) return points;
  const sqTol = tol * tol;
  const first = 0, last = points.length - 1;
  const keep = new Uint8Array(points.length);
  keep[first] = keep[last] = 1;
  const stack = [[first, last]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = sqSegDist(points[i], points[a], points[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > sqTol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}
function quantize(p) { return [Math.round(p[0] * 10000) / 10000, Math.round(p[1] * 10000) / 10000]; }
function simplifyGeometry(geom, tol = 0.004) {
  if (!geom) return null;
  const proc = (poly) => poly.map((ring) => simplifyRing(ring, tol).map(quantize)).filter((r) => r.length >= 4);
  if (geom.type === 'Polygon') {
    const rings = proc(geom.coordinates);
    return rings.length ? { type: 'Polygon', coordinates: rings } : null;
  }
  if (geom.type === 'MultiPolygon') {
    const polys = geom.coordinates.map(proc).filter((p) => p.length);
    return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
  }
  return null;
}

// ---------- 地形与基础属性 ----------
const raw = [];
for (const f of file.features) {
  const p = f.properties;
  const area = geometryArea(f.geometry) || 1;
  const e = elev[p.adcode] || { values: [] };
  const vals = (e.values || []).filter((v) => Number.isFinite(v));
  const meanElev = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 30;
  const relief = vals.length ? Math.max(...vals) - Math.min(...vals) : 10;
  const density = p.pop2020 / area;
  const terrain = Math.round(Risk.round1(Math.min(100, Math.max(4, 100 * (0.68 * Math.min(1, relief / 330) + 0.32 * Math.min(1, Math.max(0, meanElev - 15) / 520))))));
  raw.push({
    code: p.adcode, name: p.name, province: p.province, city: p.city,
    center: p.center, area, pop: p.pop2020, density,
    popEstimated: !!p.popEstimated, meanElev: Math.round(meanElev), relief: Math.round(relief), terrain,
    region: (MACRO[p.city] ? (typeof MACRO[p.city] === 'function' ? MACRO[p.city](p.name) : MACRO[p.city]) : p.province),
    serviceBase: /市$/.test(p.name) && !/城市$/.test(p.name) ? 72 : /区$/.test(p.name) ? 84 : /自治县$/.test(p.name) ? 54 : 62,
    geometry: simplifyGeometry(f.geometry),
  });
}

// 百分位
function pctRank(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return (v) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid; }
    return sorted.length <= 1 ? 50 : (lo / (sorted.length - 1)) * 100;
  };
}
const densityPct = pctRank(raw.map((c) => c.density));

for (const c of raw) {
  const lowDensity = 100 - densityPct(c.density);
  const agri = Math.max(20, Math.min(100, (PROV_AGRI[c.province] ?? 65) - c.terrain * 0.22));
  const water = c.terrain > 45 ? 72 : c.province === '上海市' ? 45 : 58;
  c.selfSuff = Math.round(0.38 * lowDensity + 0.34 * agri + 0.18 * c.terrain + 0.10 * water);
  c.lowDensity = Math.round(lowDensity);
  c.agri = Math.round(agri);

  const dShanghai = Risk.haversine(c.center, SHANGHAI);
  const island = ['舟山市', '上海市'].includes(c.city) && (c.name === '崇明区' || c.city === '舟山市');
  c.hoursFromShanghai = Math.round((dShanghai * 1.25 / 85 + 0.3 + (island ? 0.7 : 0) + (c.terrain > 60 ? 0.3 : 0)) * 10) / 10;
  c.access = Math.round(Math.max(15, Math.min(100, 100 - c.hoursFromShanghai * 7.5 + (c.city === '上海市' ? 15 : 0))));
  c.service = Math.round(Math.min(100, c.serviceBase + (['上海市', '南京市', '杭州市', '合肥市', '福州市', '南昌市', '济南市'].includes(c.city) ? 12 : 0)));
}

// 目标价值/城市密度（仅展示，不直接加危险）
for (const c of raw) {
  c.urban = Math.round(Math.min(100, 12 + Math.log10(c.density + 10) * 22));
}

// ---------- 风险评分 ----------
for (const c of raw) {
  const r = Risk.compute(c.center, targets, { scenario: 'full', season: 'winter' });
  c.hazard = r.hazard; c.strike = r.strike; c.fallout = r.fallout; c.secondary = r.secondary;
  c.top = r.top;
  c.seasonal = r.seasonal;
  c.survival = Math.round(Math.min(100, 0.34 * (100 - c.hazard) + 0.26 * c.terrain + 0.22 * c.selfSuff + 0.10 * c.access + 0.08 * c.service));
  c.plainPenalty = Math.max(0, 40 - c.terrain) * 0.18;
  c.recommend = Math.round(0.58 * (100 - c.hazard) + 0.42 * c.survival - c.plainPenalty);
  c.grade = c.recommend >= 85 ? 'S' : c.recommend >= 75 ? 'A' : c.recommend >= 65 ? 'B' : c.recommend >= 50 ? 'C' : 'D';
  c.tier = hazardTier(c.hazard);
}

function hazardTier(h) {
  if (h >= 80) return { key: 'extreme', label: '极高', color: '#7f1d1d' };
  if (h >= 62) return { key: 'high', label: '高', color: '#dc2626' };
  if (h >= 45) return { key: 'elevated', label: '较高', color: '#f97316' };
  if (h >= 28) return { key: 'medium', label: '中', color: '#eab308' };
  if (h >= 14) return { key: 'low', label: '低', color: '#22c55e' };
  return { key: 'minimal', label: '极低', color: '#0d9488' };
}

// 避难节点
for (const c of raw) {
  if (HAVENS[c.code]) { c.haven = true; c.havenNote = HAVENS[c.code]; }
  else { c.haven = false; c.havenNote = ''; }
}

// ---------- 撤离方案 ----------
function travelHours(a, b) {
  const d = Risk.haversine(a.center, b.center);
  return Math.round((d * 1.25 / 85 + (b.terrain > 55 ? 0.35 : 0) + 0.2) * 10) / 10;
}
function corridor(a, b) {
  const cc = DEST_CORRIDOR[b.region] || DEST_CORRIDOR['苏北'];
  return cc;
}
function planFor(c) {
  const safePool = raw.filter((h) => h.code !== c.code && (h.haven || (h.hazard < 26 && h.survival > 58 && h.terrain >= 50)) && h.city !== c.city);
  const all = safePool
    .map((h) => ({ h, hours: travelHours(c, h), dist: Math.round(Risk.haversine(c.center, h.center)) }))
    .filter((x) => x.h.hazard < (c.hazard > 65 ? 24 : 34))
    .sort((a, b) => {
      const sa = 0.50 * (100 - a.h.hazard) + 0.30 * a.h.survival - 0.45 * a.hours - 0.02 * a.dist + (a.h.haven ? 8 : 0);
      const sb = 0.50 * (100 - b.h.hazard) + 0.30 * b.h.survival - 0.45 * b.hours - 0.02 * b.dist + (b.h.haven ? 8 : 0);
      return sb - sa;
    });
  let near = all.filter((x) => x.dist <= 350);
  if (!near.length) near = all.filter((x) => x.dist <= 430);
  const backupPool = all.filter((x) => x.dist <= 420 && (x.h.haven || x.h.terrain >= 55));
  const hold = c.hazard < 26;
  const nearestBackup = (excludeCode) => backupPool.filter((d) => d.h.code !== excludeCode).sort((a, b) => (a.dist + a.hours * 8) - (b.dist + b.hours * 8))[0] || null;
  if (hold || !near.length) {
    const backup = nearestBackup(c.code);
    return {
      mode: 'hold',
      headline: hold
        ? (c.terrain < 30 ? '本地直接风险较低，但平原无遮蔽：就地准备＋预设山区转移' : '本地风险较低，建议留守并建立接收能力')
        : '附近无合适低危目的地，建议就地掩蔽',
      primary: { code: c.code, name: c.name, city: c.city, province: c.province, region: c.region, distKm: 0, hours: 0, route: hold ? '留在本县：优先选择山腰台地、乡镇驻地或有井水/山泉的村落；避开谷底、坝下、化工园与交通枢纽。' : '就地进入人防工程/地下室，关窗关通风。', bottleneck: '' },
      backup: backup ? packDest(backup) : null,
      alert: '听到警报后立即进入人防工程、地下室或地铁站，关闭通风，停留至少 14 天；不要顺风转移。',
    };
  }
  const primary = near[0];
  const backup = nearestBackup(primary.h.code);
  return {
    mode: 'evacuate',
    headline: `战前向${primary.h.region}低危县转移`,
    primary: packDest(primary),
    backup: backup ? packDest(backup) : null,
    alert: '洲际导弹预警只有 10–20 分钟。警报发布后不要再上高速，立即就近进入人防工程/地下室，停留至少 14 天。',
  };
}
function packDest(x) {
  const c = x.h;
  const cc = corridor(null, c);
  const near = x.dist < 80;
  return {
    code: c.code, name: c.name, city: c.city, province: c.province, region: c.region,
    distKm: x.dist || 0, hours: x.hours || 0,
    route: near ? `县道/省道（约 ${Math.round(x.dist)} km），避开坝下、隧道口与集镇拥堵` : `${cc.hw}（经 ${cc.via}）`,
    bottleneck: near ? '山区弯道与集镇路段' : cc.bottleneck,
    haven: !!c.haven, havenNote: c.havenNote || '',
    hazard: c.hazard, survival: c.survival,
  };
}
for (const c of raw) c.plan = planFor(c);

// 当前方案距离修正（packDest 在排序时已有 dist，重新填）
for (const c of raw) {
  for (const k of ['primary', 'backup']) {
    const d = c.plan[k];
    if (d && d.code !== c.code) {
      d.distKm = Math.round(Risk.haversine(c.center, [raw.find((x) => x.code === d.code).center[0], raw.find((x) => x.code === d.code).center[1]]));
      d.hours = travelHours(c, raw.find((x) => x.code === d.code));
    }
  }
}

// ---------- 城市聚合 ----------
const cityMap = {};
for (const c of raw) {
  const k = c.city;
  if (!cityMap[k]) cityMap[k] = { name: k, province: c.province, count: 0, pop: 0, lng: 0, lat: 0, hazard: 0 };
  const m = cityMap[k];
  m.count++; m.pop += c.pop; m.lng += c.center[0] * c.pop; m.lat += c.center[1] * c.pop; m.hazard += c.hazard;
}
const cities = Object.values(cityMap).map((m) => ({
  name: m.name, province: m.province, count: m.count, pop: m.pop,
  center: [Math.round(m.lng / m.pop * 1000) / 1000, Math.round(m.lat / m.pop * 1000) / 1000],
  avgHazard: Math.round(m.hazard / m.count * 10) / 10,
})).sort((a, b) => b.pop - a.pop);

// ---------- 输出 ----------
const outCounties = raw.map((c) => ({
  code: c.code, name: c.name, province: c.province, city: c.city, region: c.region,
  center: [Math.round(c.center[0] * 10000) / 10000, Math.round(c.center[1] * 10000) / 10000],
  area: Math.round(c.area), pop: c.pop, density: Math.round(c.density * 10) / 10,
  popEstimated: c.popEstimated,
  meanElev: c.meanElev, relief: c.relief, terrain: c.terrain, selfSuff: c.selfSuff, lowDensity: c.lowDensity,
  access: c.access, service: c.service, hoursFromShanghai: c.hoursFromShanghai, urban: c.urban,
  hazard: c.hazard, strike: c.strike, fallout: c.fallout, secondary: c.secondary,
  survival: c.survival, recommend: c.recommend, grade: c.grade,
  tier: c.tier.key, tierLabel: c.tier.label,
  seasonal: c.seasonal,
  top: c.top.slice(0, 6),
  haven: c.haven, havenNote: c.havenNote,
  plan: c.plan,
  geometry: c.geometry,
}));

const meta = {
  title: '华东核战避难地风险地图',
  subtitle: '625 个县级单元 · 公开资料桌面推演',
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  countyCount: outCounties.length,
  provinceCount: 7,
  model: {
    weights: { strike: 0.54, fallout: 0.32, secondary: 0.14 },
    survivalWeights: { hazardInverse: 0.34, terrain: 0.26, selfSuff: 0.22, access: 0.10, service: 0.08 },
    recommendWeights: { safety: 0.58, survival: 0.42, plainPenalty: true },
    assumedYieldKt: 150,
    severeRadiusKm: 4.2,
    lightRadiusKm: 11,
    plumeLengthKm: 320,
    note: '危险度 = 直接打击/冲击波 54% + 放射性沉降 32% + 次生灾害 14%。所有数值为相对指数，不是物理剂量。',
  },
  seasons: Risk.WIND,
  scenarios: Risk.SCENARIOS,
  types: typeMeta,
  corridors: DEST_CORRIDOR,
  disclaimer: '本图是公开地理、工业布局、风向与军事地理常识基础上的桌面推演，不代表任何真实打击计划或情报结论。全面核交换下长三角不存在真正安全之地；战时请以当地人防部门指令为准。',
  sources: [
    '阿里云 DataV.GeoAtlas 行政区划边界（2024）',
    '第七次全国人口普查分县资料（2020）',
    'OpenTopoData / SRTM 90m 地形采样',
    '公开报道的核电、港口、钢铁、石化、机场、水利设施位置',
    '公开气象常识：华东冬季西北风、夏季东南风、春秋东北风',
  ],
};

const payload = { meta, targets, cities, counties: outCounties };
await fs.writeFile(OUT_JS, 'window.NUKE_DATA = ' + JSON.stringify(payload) + ';\n');
await fs.writeFile(OUT_GEO, JSON.stringify({
  type: 'FeatureCollection',
  features: outCounties.map((c) => ({ type: 'Feature', properties: { ...c, geometry: undefined }, geometry: c.geometry })),
}));
await fs.writeFile(OUT_SUMMARY, JSON.stringify({ meta, cities, topSafe: [...outCounties].sort((a, b) => a.hazard - b.hazard).slice(0, 30).map(slim), topRisk: [...outCounties].sort((a, b) => b.hazard - a.hazard).slice(0, 30).map(slim), havens: outCounties.filter((c) => c.haven).map(slim) }, null, 1));

function slim(c) {
  return { code: c.code, name: c.name, city: c.city, province: c.province, region: c.region, hazard: c.hazard, survival: c.survival, recommend: c.recommend, terrain: c.terrain, pop: c.pop, plan: c.plan && { primary: c.plan.primary && c.plan.primary.name, backup: c.plan.backup && c.plan.backup.name, mode: c.plan.mode } };
}

// CSV
const cols = ['code', 'name', 'province', 'city', 'region', 'pop', 'area', 'density', 'meanElev', 'relief', 'terrain', 'selfSuff', 'access', 'service', 'hazard', 'strike', 'fallout', 'secondary', 'survival', 'recommend', 'grade', 'tierLabel', 'planMode', 'primary', 'primaryDistKm', 'primaryHours', 'backup', 'haven'];
const lines = [cols.join(',')];
for (const c of outCounties) {
  const row = {
    ...c,
    planMode: c.plan.mode,
    primary: c.plan.primary ? c.plan.primary.name : '',
    primaryDistKm: c.plan.primary ? c.plan.primary.distKm : '',
    primaryHours: c.plan.primary ? c.plan.primary.hours : '',
    backup: c.plan.backup ? c.plan.backup.name : '',
  };
  lines.push(cols.map((k) => {
    const v = row[k];
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(','));
}
await fs.writeFile(OUT_CSV, '\ufeff' + lines.join('\n'));

// 城市汇总 CSV
const cityAgg = {};
for (const c of outCounties) {
  const m = (cityAgg[c.city] ||= { province: c.province, city: c.city, counties: 0, pop: 0, hazard: 0, maxHazard: 0, survival: 0, recommend: 0, haven: 0 });
  m.counties++; m.pop += c.pop; m.hazard += c.hazard; m.maxHazard = Math.max(m.maxHazard, c.hazard);
  m.survival += c.survival; m.recommend += c.recommend; if (c.haven) m.haven++;
}
const cityCols = ['province', 'city', 'counties', 'pop', 'avgHazard', 'maxHazard', 'avgSurvival', 'avgRecommend', 'havens'];
const cityLines = [cityCols.join(',')];
for (const m of Object.values(cityAgg).sort((a, b) => b.hazard / b.counties - a.hazard / a.counties)) {
  const row = [m.province, m.city, m.counties, m.pop, (m.hazard / m.counties).toFixed(1), m.maxHazard.toFixed(1), (m.survival / m.counties).toFixed(0), (m.recommend / m.counties).toFixed(0), m.haven];
  cityLines.push(row.map((v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(','));
}
await fs.writeFile('data/city_summary.csv', '\ufeff' + cityLines.join('\n'));

// 目标清单 CSV
const tCols = ['id', 'name', 'type', 'lng', 'lat', 'weight', 'yieldKt', 'confidence', 'peripheral', 'note'];
const tLines = [tCols.join(',')];
for (const t of targets) {
  tLines.push(tCols.map((k) => {
    const s = String(t[k] == null ? '' : t[k]);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(','));
}
await fs.writeFile('data/targets.csv', '\ufeff' + tLines.join('\n'));


console.log('\n=== 危险度最高 ===');
console.table([...outCounties].sort((a, b) => b.hazard - a.hazard).slice(0, 15).map((c) => ({ 县: c.name, 市: c.city, 危险: c.hazard, 打击: c.strike, 沉降: c.fallout, 次生: c.secondary, 生存: c.survival })));
console.log('\n=== 最安全（危险度最低） ===');
console.table([...outCounties].sort((a, b) => a.hazard - b.hazard).slice(0, 20).map((c) => ({ 县: c.name, 市: c.city, 危险: c.hazard, 地形: c.terrain, 自持: c.selfSuff, 生存: c.survival, 推荐: c.recommend })));
console.log('\n=== 推荐度最高 ===');
console.table([...outCounties].sort((a, b) => b.recommend - a.recommend).slice(0, 20).map((c) => ({ 县: c.name, 市: c.city, 危险: c.hazard, 地形: c.terrain, 生存: c.survival, 推荐: c.recommend, 方案: c.plan.primary.name })));
console.log(`\nwrote ${OUT_JS} (${(JSON.stringify(payload).length / 1024 / 1024).toFixed(2)} MB), ${OUT_CSV}`);
