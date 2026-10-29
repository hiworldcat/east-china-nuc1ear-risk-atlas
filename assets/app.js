/* =========================================================
   华东核战避难风险图 —— 交互逻辑
   数据：window.NUKE_DATA（构建脚本生成）
   模型：window.RiskModel（与构建脚本共用）
   ========================================================= */
(function () {
  'use strict';

  const DATA = window.NUKE_DATA;
  const Risk = window.RiskModel;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  if (!DATA || !Risk) {
    document.getElementById('boot').innerHTML = '<div style="color:#ff8a8a;font:14px sans-serif">数据载入失败：请确认 data/database.js 与 assets/risk.js 存在。</div>';
    return;
  }

  const ORIGINS = {
    上海: [121.475, 31.232],
    南京: [118.797, 32.041],
    杭州: [120.155, 30.274],
    合肥: [117.227, 31.821],
    福州: [119.296, 26.074],
    南昌: [115.858, 28.683],
    济南: [117.000, 36.651],
    徐州: [117.184, 34.261],
    宁波: [121.550, 29.874],
    青岛: [120.382, 36.067],
    厦门: [118.089, 24.479],
    温州: [120.699, 27.994],
  };

  const state = {
    scenario: 'full',
    season: 'winter',
    metric: 'hazard',
    origin: { name: '上海', center: ORIGINS['上海'] },
    selected: null,
    routeMode: 'local',
    layers: { targets: true, plume: true, water: true, expressway: true, national: true, military: false, rings: false, havens: true, labels: true },
    basemap: 'dark',
    rankSort: 'hazard-desc',
    rankProvince: '',
    rankQuery: '',
    rankLevel: 'county',
    searchIndex: [],
    plumeKey: '',
    plumeUrl: '',
  };

  const QP = new URLSearchParams(location.search);
  if (['full', 'limited', 'edge'].includes(QP.get('scenario'))) state.scenario = QP.get('scenario');
  if (['winter', 'summer', 'shoulder'].includes(QP.get('season'))) state.season = QP.get('season');
  if (['hazard', 'survival', 'recommend', 'reach'].includes(QP.get('metric'))) state.metric = QP.get('metric');
  if (['dark', 'sat', 'none'].includes(QP.get('basemap'))) state.basemap = QP.get('basemap');

  const counties = DATA.counties.map((c) => ({ ...c, cur: null }));
  const byCode = Object.fromEntries(counties.map((c) => [c.code, c]));
  const byTarget = Object.fromEntries(DATA.targets.map((t) => [t.id, t]));
  const provinceList = [...new Set(counties.map((c) => c.province))];

  let map;
  let countyLayer;
  let countyLayers = {};
  let targetGroup;
  let havenGroup;
  let labelGroup;
  let ringGroup;
  let routeGroup;
  let plumeLayer;
  let waterGroup;
  let waterLabelGroup;
  let riverLayer;
  let lakeLayer;
  let expresswayGroup;
  let nationalGroup;
  let roadLabelGroup;
  let militaryGroup;
  let militaryLabelGroup;
  let militaryData = null;
  let originMarker;
  let targetMarkers = {};
  let havenMarkers = [];
  let darkTiles, satTiles;
  let tileErrorShown = false;

  const COLORS = {
    hazard: [[0, '#2c6e5a'], [6, '#4f8f66'], [14, '#8aa34e'], [28, '#c9a63e'], [45, '#db7a32'], [62, '#c93a2c'], [80, '#9e1225'], [100, '#5a0612']],
    survival: [[0, '#3b1b1b'], [30, '#5b3a1f'], [45, '#6d6329'], [60, '#3f7d52'], [75, '#66b27f'], [100, '#b9f0c9']],
    recommend: [[0, '#3b1b1b'], [30, '#633f1c'], [50, '#8f7326'], [65, '#5f9a63'], [80, '#8bd39b'], [100, '#d4f5d9']],
    reach: [[0, '#2a1c2b'], [30, '#4b2b3d'], [50, '#7a4a38'], [65, '#8a7a35'], [80, '#5fae9c'], [100, '#9ff0dd']],
  };

  const LEGENDS = {
    hazard: {
      note: '0–100 相对指数',
      rows: [[0, 14, '极低'], [14, 28, '低'], [28, 45, '中'], [45, 62, '较高'], [62, 80, '高'], [80, 100, '极高']],
    },
    survival: {
      note: '地形 / 自持 / 服务',
      rows: [[0, 30, '很差'], [30, 45, '较差'], [45, 60, '一般'], [60, 72, '较好'], [72, 85, '好'], [85, 100, '很好']],
    },
    recommend: {
      note: '安全 × 生存 − 平原惩罚',
      rows: [[0, 35, '不推荐'], [35, 50, '谨慎'], [50, 65, '可用'], [65, 75, '较好'], [75, 85, '推荐'], [85, 100, '优先']],
    },
    reach: {
      note: '推荐 − 路途成本',
      rows: [[0, 35, '不推荐'], [35, 50, '偏远'], [50, 65, '可考虑'], [65, 75, '合适'], [75, 85, '推荐'], [85, 100, '优先']],
    },
  };

  /* ---------- 基础工具 ---------- */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ll(p) { return [p[1], p[0]]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function fmt1(v) { return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
  function fmtInt(v) { return Math.round(v).toLocaleString('zh-CN'); }
  function fmtPop(v) { return v >= 10000 ? (v / 10000).toFixed(1).replace(/\.0$/, '') + ' 万' : fmtInt(v); }
  function mixColor(a, b, t) {
    const pa = a.replace('#', ''), pb = b.replace('#', '');
    const ar = parseInt(pa.slice(0, 2), 16), ag = parseInt(pa.slice(2, 4), 16), ab = parseInt(pa.slice(4, 6), 16);
    const br = parseInt(pb.slice(0, 2), 16), bg = parseInt(pb.slice(2, 4), 16), bb = parseInt(pb.slice(4, 6), 16);
    return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
  }
  function colorAt(stops, v) {
    v = clamp(Number(v) || 0, 0, 100);
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const [v0, c0] = stops[i - 1], [v1, c1] = stops[i];
        return mixColor(c0, c1, (v - v0) / (v1 - v0 || 1));
      }
    }
    return stops[stops.length - 1][1];
  }
  function metricColor(metric, v) { return colorAt(COLORS[metric] || COLORS.hazard, v); }

  function hazardTier(h) {
    if (h >= 80) return { label: '极高', color: '#ff5d5d' };
    if (h >= 62) return { label: '高', color: '#ff8a4c' };
    if (h >= 45) return { label: '较高', color: '#e6b34a' };
    if (h >= 28) return { label: '中', color: '#c9cf5a' };
    if (h >= 14) return { label: '低', color: '#8fe3b0' };
    return { label: '极低', color: '#5ad1e6' };
  }
  function gradeColor(g) {
    return { S: '#b9f5d0', A: '#8fe3b0', B: '#e6c36a', C: '#c79a5b', D: '#a08080' }[g] || '#8fe3b0';
  }
  function typeMeta(type) { return DATA.meta.types[type] || { label: type, icon: '•', color: '#9aa' }; }
  function metricValue(c) {
    if (state.metric === 'survival') return c.cur.survival;
    if (state.metric === 'recommend') return c.cur.recommend;
    if (state.metric === 'reach') return c.cur.reach;
    return c.cur.hazard;
  }
  function metricName() {
    return { hazard: '危险度', survival: '生存条件', recommend: '综合推荐', reach: '可达推荐' }[state.metric];
  }
  function wind() { return DATA.meta.seasons[state.season]; }
  function travelHours(a, b) {
    const d = Risk.haversine(a, b);
    return Math.round((d * 1.25 / 85 + (b.terrain > 55 ? 0.35 : 0) + 0.2) * 10) / 10;
  }
  function travelHoursCounty(origin, c) { return travelHours(origin, c.center); }

  /* ---------- 评分 ---------- */
  function computeAll() {
    const t0 = performance.now();
    for (const c of counties) {
      const r = Risk.compute(c.center, DATA.targets, { scenario: state.scenario, season: state.season });
      c.cur = {
        hazard: r.hazard, strike: r.strike, fallout: r.fallout, secondary: r.secondary,
        seasonal: r.seasonal, top: r.top,
        survival: Math.round(Math.min(100, 0.34 * (100 - r.hazard) + 0.26 * c.terrain + 0.22 * c.selfSuff + 0.10 * c.access + 0.08 * c.service)),
        plainPenalty: Math.max(0, 40 - c.terrain) * 0.18,
      };
      c.cur.recommend = Math.round(0.58 * (100 - r.hazard) + 0.42 * c.cur.survival - c.cur.plainPenalty);
      c.cur.grade = c.cur.recommend >= 85 ? 'S' : c.cur.recommend >= 75 ? 'A' : c.cur.recommend >= 65 ? 'B' : c.cur.recommend >= 50 ? 'C' : 'D';
    }
    computeReach();
    console.debug(`[risk] ${counties.length} counties in ${(performance.now() - t0).toFixed(0)} ms`);
  }

  function computeReach() {
    const o = state.origin.center;
    for (const c of counties) {
      const dist = Risk.haversine(o, c.center);
      const hours = travelHoursCounty(o, c);
      const cost = 0.032 * dist + 1.0 * Math.max(0, hours - 1.5);
      c.cur.originDist = Math.round(dist);
      c.cur.originHours = hours;
      c.cur.reach = Math.round(c.cur.recommend - cost);
    }
  }

  function buildPlan(c) {
    const pool = counties.filter((x) => x.code !== c.code && x.city !== c.city && (x.haven || (x.cur.hazard < 26 && x.cur.survival > 58 && x.terrain >= 50)));
    const all = pool.map((x) => ({ x, dist: Risk.haversine(c.center, x.center), hours: travelHours(c.center, x.center) }))
      .filter((d) => d.x.cur.hazard < (c.cur.hazard > 65 ? 24 : 34))
      .sort((a, b) => scoreDest(b) - scoreDest(a));
    let near = all.filter((d) => d.dist <= 350);
    if (!near.length) near = all.filter((d) => d.dist <= 430);
    const backupPool = all.filter((d) => d.dist <= 420 && (d.x.haven || d.x.terrain >= 55));
    const hold = c.cur.hazard < 26;
    const nearestBackup = (pool2, excludeCode) => pool2
      .filter((d) => d.x.code !== excludeCode)
      .sort((a, b) => (a.dist + a.hours * 8) - (b.dist + b.hours * 8))[0] || null;
    if (hold || !near.length) {
      const holdBackup = nearestBackup(backupPool, c.code);
      return {
        mode: 'hold',
        headline: hold
          ? (c.terrain < 30 ? '本地直接风险较低，但平原无遮蔽：就地准备＋预设山区转移' : '本地风险较低，建议留守并建立接收能力')
          : '附近无合适低危目的地，建议就地掩蔽',
        primary: {
          code: c.code, name: c.name, city: c.city, province: c.province, region: c.region,
          distKm: 0, hours: 0, hazard: c.cur.hazard, survival: c.cur.survival, haven: c.haven, havenNote: c.havenNote,
          route: hold ? '留在本县：优先选择山腰台地、乡镇驻地或有井水/山泉的村落；避开谷底、坝下、化工园与交通枢纽。' : '就地进入人防工程/地下室，关窗关通风。',
          bottleneck: '',
        },
        backup: holdBackup ? packDest(holdBackup) : null,
        alert: '听到警报后立即进入人防工程、地下室或地铁站，关闭通风，停留至少 14 天；不要顺风转移。',
      };
    }
    const primary = near[0];
    const backup = nearestBackup(backupPool, primary.x.code);
    return {
      mode: 'evacuate',
      headline: `战前向${primary.x.region}低危县转移`,
      primary: packDest(primary),
      backup: backup ? packDest(backup) : null,
      alert: '洲际导弹预警只有 10–20 分钟。警报发布后不要再上高速，立即就近进入人防工程/地下室，停留至少 14 天。',
    };
  }
  function scoreDest(d) {
    return 0.50 * (100 - d.x.cur.hazard) + 0.30 * d.x.cur.survival - 0.45 * d.hours - 0.02 * d.dist + (d.x.haven ? 8 : 0);
  }
  function packDest(d) {
    const x = d.x;
    const cor = (DATA.meta.corridors || {})[x.region] || { hw: '高速/国道', via: '就近通道', bottleneck: '山区路段' };
    const near = d.dist < 80;
    return {
      code: x.code, name: x.name, city: x.city, province: x.province, region: x.region,
      distKm: Math.round(d.dist), hours: d.hours, hazard: x.cur.hazard, survival: x.cur.survival,
      haven: x.haven, havenNote: x.havenNote,
      route: near ? `县道/省道（约 ${Math.round(d.dist)} km），避开坝下、隧道口与集镇拥堵` : `${cor.hw}（经 ${cor.via}）`,
      bottleneck: near ? '山区弯道与集镇路段' : cor.bottleneck,
    };
  }

  /* ---------- 地图 ---------- */
  function initMap() {
    map = L.map('map', {
      center: [30.4, 119.2],
      zoom: window.innerWidth < 760 ? 5.5 : 6.2,
      minZoom: 5,
      maxZoom: 12,
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.25,
      maxBounds: [[19.5, 105], [45.5, 128]],
      maxBoundsViscosity: 0.55,
      preferCanvas: false,
    });

    map.createPane('contextPane').style.zIndex = 300;
    map.createPane('countyPane').style.zIndex = 400;
    map.createPane('waterPane').style.zIndex = 430;
    map.createPane('roadPane').style.zIndex = 435;
    map.createPane('militaryPane').style.zIndex = 438;
    map.createPane('plumePane').style.zIndex = 450;
    map.createPane('ringPane').style.zIndex = 460;
    map.createPane('routePane').style.zIndex = 620;
    map.createPane('targetPane').style.zIndex = 640;
    map.createPane('havenPane').style.zIndex = 650;
    map.createPane('labelPane').style.zIndex = 660;

    darkTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18, attribution: '&copy; Esri &copy; HERE &copy; OpenStreetMap', crossOrigin: true,
    });
    satTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18, attribution: '&copy; Esri &copy; Maxar', crossOrigin: true,
    });
    darkTiles.on('tileerror', onTileError);
    satTiles.on('tileerror', onTileError);
    if (state.basemap === 'sat') satTiles.addTo(map);
    else if (state.basemap === 'dark') darkTiles.addTo(map);
    const baseSelect = $('#basemap-select');
    if (baseSelect) baseSelect.value = state.basemap;

    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 90 }).addTo(map);

    initContext();
    initCountyLayer();
    initPlume();
    initHydro();
    initRoads();
    initMilitary();
    initTargets();
    initHavens();
    initOriginMarker();

    labelGroup = L.layerGroup().addTo(map);
    routeGroup = L.layerGroup().addTo(map);
    ringGroup = L.layerGroup();

    map.on('zoomend', () => { rebuildTargets(); rebuildHavens(); rebuildWaterLabels(); updateWaterStyle(); rebuildRoadLabels(); updateRoadVisibility(); rebuildMilitaryLabels(); updateLabels(); updateContextLabels(); });
    map.on('click', () => {
      if (window.innerWidth <= 900) closeLeftPanel();
    });
    updateLabels();
    setTimeout(() => map.invalidateSize(), 120);
  }

  function onTileError() {
    if (tileErrorShown) return;
    tileErrorShown = true;
    toast('底图瓦片加载失败，已保留矢量图层；不影响风险数据。');
  }

  let contextLabelGroup;
  function initContext() {
    if (!window.NUMA_CONTEXT) return;
    L.geoJSON(window.NUMA_CONTEXT, {
      pane: 'contextPane', interactive: false,
      style: { fillColor: '#0a1418', fillOpacity: 0.62, color: 'rgba(180,210,215,.10)', weight: 0.7 },
    }).addTo(map);

    contextLabelGroup = L.layerGroup().addTo(map);
    const east = new Set(['上海市', '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省']);
    for (const f of window.NUMA_CONTEXT.features) {
      if (east.has(f.properties.name)) continue;
      const c = f.properties.center;
      if (!c) continue;
      L.marker(ll(c), {
        icon: L.divIcon({ className: 'context-label', html: esc(f.properties.name.replace(/(省|市|自治区|壮族|回族|维吾尔)/g, '')), iconSize: [120, 18], iconAnchor: [60, 9] }),
        pane: 'labelPane', interactive: false, keyboard: false, zIndexOffset: 100000,
      }).addTo(contextLabelGroup);
    }
    // 海域标注
    for (const [name, lng, lat] of [['黄海', 123.1, 35.2], ['东海', 124.4, 28.4], ['台湾海峡', 118.7, 23.8], ['长江口', 122.4, 31.5]]) {
      L.marker([lat, lng], {
        icon: L.divIcon({ className: 'sea-label', html: esc(name), iconSize: [100, 16], iconAnchor: [50, 8] }),
        pane: 'labelPane', interactive: false, keyboard: false, zIndexOffset: 100000,
      }).addTo(contextLabelGroup);
    }

    // 距上海 200 / 400 / 600 km 参考环
    const group = L.layerGroup().addTo(map);
    for (const km of [200, 400, 600]) {
      L.circle([31.232, 121.475], { radius: km * 1000, color: 'rgba(120,205,215,.17)', weight: 1, dashArray: '2 9', fill: false, pane: 'ringPane', interactive: false }).addTo(group);
      const p = destPoint([121.475, 31.232], 108, km);
      L.marker(ll(p), {
        icon: L.divIcon({ className: 'range-label', html: `${km} km`, iconSize: [60, 14], iconAnchor: [30, 7] }),
        pane: 'labelPane', interactive: false, keyboard: false, zIndexOffset: 100000,
      }).addTo(group);
    }
    updateContextLabels();
  }

  function destPoint(center, bearingDeg, distKm) {
    const R = 6371.0088, br = bearingDeg * Math.PI / 180, lat1 = center[1] * Math.PI / 180, lng1 = center[0] * Math.PI / 180;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distKm / R) + Math.cos(lat1) * Math.sin(distKm / R) * Math.cos(br));
    const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(distKm / R) * Math.cos(lat1), Math.cos(distKm / R) - Math.sin(lat1) * Math.sin(lat2));
    return [lng2 * 180 / Math.PI, lat2 * 180 / Math.PI];
  }

  function updateContextLabels() {
    if (!contextLabelGroup) return;
    const show = map.getZoom() < 7.4;
    const el = contextLabelGroup.getLayers();
    for (const l of el) {
      if (!l.getElement || !l.getElement()) continue;
      l.getElement().style.opacity = show ? '1' : '0';
      l.getElement().style.pointerEvents = 'none';
    }
  }

  /* ---------- 水系与路网 ---------- */
  function initHydro() {
    const H = window.NUMA_HYDRO;
    if (!H) return;
    const lakes = L.geoJSON(H.lakes, {
      pane: 'waterPane', interactive: false,
      style: { color: '#2f7f96', weight: 0.6, opacity: 0.6, fillColor: '#0b2c39', fillOpacity: 0.55 },
    });
    const rivers = L.geoJSON(H.rivers, {
      pane: 'waterPane', interactive: false,
      style: (f) => ({ color: f.properties.rank === 1 ? '#2a7189' : '#2f5c6b', weight: f.properties.rank === 1 ? 1.2 : 0.7, opacity: f.properties.rank === 1 ? 0.58 : 0.32, fill: false }),
    });
    lakeLayer = lakes;
    riverLayer = rivers;
    waterGroup = L.layerGroup([lakes, rivers]).addTo(map);
    waterLabelGroup = L.layerGroup().addTo(map);
    updateWaterStyle();
    rebuildWaterLabels();
  }

  function updateWaterStyle() {
    if (!riverLayer || !lakeLayer) return;
    const z = map.getZoom();
    const minor = z >= 7.8;
    riverLayer.setStyle((f) => ({
      color: f.properties.rank === 1 ? '#2a7189' : '#2f5c6b',
      weight: f.properties.rank === 1 ? 1.2 : 0.7,
      opacity: f.properties.rank === 1 ? 0.58 : (minor ? 0.34 : 0),
      fill: false,
    }));
    lakeLayer.setStyle((f) => ({
      color: '#2f7f96',
      weight: 0.6,
      opacity: f.properties.rank === 1 ? 0.6 : (minor ? 0.4 : 0),
      fillColor: '#0b2c39',
      fillOpacity: f.properties.rank === 1 ? 0.55 : (minor ? 0.4 : 0),
    }));
  }

  function rebuildWaterLabels() {
    if (!waterLabelGroup || !window.NUMA_HYDRO) return;
    waterLabelGroup.clearLayers();
    if (!state.layers.water) return;
    const z = map.getZoom();
    const keyWater = new Set(['长江', '黄河', '淮河', '钱塘江', '京杭大运河']);
    for (const f of window.NUMA_HYDRO.rivers.features) {
      const major = f.properties.rank === 1;
      if (major ? (z < 6.5 && !keyWater.has(f.properties.name)) : z < 8.2) continue;
      L.marker(ll(f.properties.labelPoint), {
        icon: L.divIcon({ className: 'water-label river-label' + (major ? ' major' : ''), html: esc(f.properties.name), iconSize: [92, 15], iconAnchor: [46, 7] }),
        pane: 'labelPane', interactive: false, keyboard: false, zIndexOffset: 100000,
      }).addTo(waterLabelGroup);
    }
    for (const f of window.NUMA_HYDRO.lakes.features) {
      const major = f.properties.rank === 1;
      if (major ? z < 6.0 : z < 7.8) continue;
      L.marker(ll(f.properties.labelPoint), {
        icon: L.divIcon({ className: 'water-label lake-label' + (major ? ' major' : ''), html: esc(f.properties.name), iconSize: [84, 16], iconAnchor: [42, 8] }),
        pane: 'labelPane', interactive: false, keyboard: false, zIndexOffset: 100000,
      }).addTo(waterLabelGroup);
    }
  }

  function initRoads() {
    const R = window.NUMA_ROADS;
    if (!R) return;
    const casing = L.geoJSON(R.expressways, {
      pane: 'roadPane', interactive: false,
      style: { color: '#05090b', weight: 3.2, opacity: 0.38, fill: false },
    });
    const lines = L.geoJSON(R.expressways, {
      pane: 'roadPane', interactive: false,
      style: { color: '#c98f35', weight: 1.35, opacity: 0.72, fill: false },
      onEachFeature: (f, layer) => layer.bindTooltip(`<b>${esc(f.properties.ref)} ${esc(f.properties.name)}</b><br><span>高速走廊 · ${f.properties.distanceKm} km · 示意</span>`, { className: 'nuke-tip', sticky: true }),
    });
    expresswayGroup = L.layerGroup([casing, lines]).addTo(map);
    nationalGroup = L.geoJSON(R.national, {
      pane: 'roadPane', interactive: false,
      style: { color: '#b6d07a', weight: 1.15, opacity: 0.78, dashArray: '7 5', fill: false },
      onEachFeature: (f, layer) => layer.bindTooltip(`<b>${esc(f.properties.ref)} ${esc(f.properties.name)}</b><br><span>国道走廊 · ${f.properties.distanceKm} km · 示意</span>`, { className: 'nuke-tip', sticky: true }),
    });
    roadLabelGroup = L.layerGroup().addTo(map);
    updateRoadVisibility();
    rebuildRoadLabels();
  }

  function updateRoadVisibility() {
    if (!map || !nationalGroup) return;
    const z = map.getZoom();
    if (state.layers.national && z >= 4.0) {
      if (!map.hasLayer(nationalGroup)) nationalGroup.addTo(map);
    } else if (map.hasLayer(nationalGroup)) {
      map.removeLayer(nationalGroup);
    }
    if (state.layers.expressway) {
      if (!map.hasLayer(expresswayGroup)) expresswayGroup.addTo(map);
    } else if (map.hasLayer(expresswayGroup)) {
      map.removeLayer(expresswayGroup);
    }
  }

  function rebuildRoadLabels() {
    if (!roadLabelGroup || !window.NUMA_ROADS) return;
    roadLabelGroup.clearLayers();
    const z = map.getZoom();
    const keyRoads = new Set(['G2', 'G15', 'G60', 'G50', 'G40']);
    if (state.layers.expressway && z >= 4.0) {
      for (const f of window.NUMA_ROADS.expressways) {
        if (z < 6.6 && !keyRoads.has(f.properties.ref)) continue;
        L.marker(ll(f.properties.labelPoint), {
          icon: L.divIcon({ className: 'road-label expressway-label', html: esc(f.properties.ref), iconSize: [52, 14], iconAnchor: [26, 7] }),
          pane: 'labelPane', interactive: false, keyboard: false, zIndexOffset: 100000,
        }).addTo(roadLabelGroup);
      }
    }
    if (state.layers.national && z >= 7.3) {
      for (const f of window.NUMA_ROADS.national) {
        L.marker(ll(f.properties.labelPoint), {
          icon: L.divIcon({ className: 'road-label national-label', html: esc(f.properties.ref), iconSize: [52, 14], iconAnchor: [26, 7] }),
          pane: 'labelPane', interactive: false, keyboard: false, zIndexOffset: 100000,
        }).addTo(roadLabelGroup);
      }
    }
  }

  /* ---------- 军事背景层（空接口，默认无数据） ---------- */
  const MILITARY_COLOR = '#e0a06a';

  function militaryItems(d) {
    const out = [];
    if (!d) return out;
    for (const z of Array.isArray(d.zones) ? d.zones : []) {
      if (!Array.isArray(z.center) || z.center.length !== 2) continue;
      out.push({ ...z, kind: 'zone', color: z.color || MILITARY_COLOR });
    }
    for (const p of Array.isArray(d.points) ? d.points : []) {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
      out.push({ ...p, kind: 'point', color: p.color || MILITARY_COLOR });
    }
    return out;
  }

  function militaryTooltip(it) {
    const tags = Array.isArray(it.tags) ? it.tags.filter(Boolean) : [];
    let html = `<b>${esc(it.label || '未命名')}</b>`;
    if (tags.length) html += `<br><span>${esc(tags.join(' / '))}</span>`;
    if (it.kind === 'zone') html += `<br><span>范围半径约 ${Number(it.radiusKm) || 0} km</span>`;
    if (it.note) html += `<br><span>${esc(it.note)}</span>`;
    return html;
  }

  function initMilitary() {
    militaryData = window.NUMA_MILITARY || null;
    const items = militaryItems(militaryData);
    militaryGroup = L.layerGroup();
    militaryLabelGroup = L.layerGroup().addTo(map);

    const badge = $('#count-military');
    if (badge) badge.textContent = items.length ? String(items.length) : '空';

    for (const it of items) {
      const tip = militaryTooltip(it);
      if (it.kind === 'zone') {
        L.circle(ll(it.center), {
          radius: (Number(it.radiusKm) || 0) * 1000,
          pane: 'militaryPane',
          color: it.color,
          weight: 1.35,
          opacity: 0.78,
          dashArray: '5 6',
          fillColor: it.color,
          fillOpacity: 0.08,
          interactive: true,
        }).bindTooltip(tip, { className: 'nuke-tip', sticky: true }).addTo(militaryGroup);
      } else {
        L.circleMarker([it.lat, it.lng], {
          radius: 5,
          pane: 'militaryPane',
          color: it.color,
          weight: 1.4,
          fillColor: it.color,
          fillOpacity: 0.5,
          interactive: true,
        }).bindTooltip(tip, { className: 'nuke-tip', sticky: true }).addTo(militaryGroup);
      }
    }

    if (!items.length && state.layers.military) {
      state.layers.military = false;
      const cb = $('#layer-military');
      if (cb) cb.checked = false;
    } else if (items.length && state.layers.military) {
      militaryGroup.addTo(map);
    }

    updateMilitaryStatus(items);
    rebuildMilitaryLabels();
  }

  function showMilitaryStep(n) {
    const s1 = $('#military-step1');
    const s2 = $('#military-step2');
    if (s1) s1.hidden = n !== 1;
    if (s2) s2.hidden = n !== 2;
  }

  function updateMilitaryStatus(items) {
    const el = $('#crab-status');
    if (!el) return;
    const zones = items.filter((i) => i.kind === 'zone').length;
    const points = items.filter((i) => i.kind === 'point').length;
    el.textContent = items.length
      ? `已接入 ${items.length} 条（范围 ${zones} · 点 ${points}）。本层只做叠加显示，不进入危险度评分。`
      : '本层当前没有任何数据，打开开关只会看到这句话。接入方式见 data/military.js 顶部的结构说明。';
  }

  function rebuildMilitaryLabels() {
    if (!militaryLabelGroup) return;
    militaryLabelGroup.clearLayers();
    if (!state.layers.military || map.getZoom() < 6.9) return;
    for (const it of militaryItems(militaryData)) {
      if (it.kind !== 'zone') continue;
      const tag = Array.isArray(it.tags) && it.tags[0] ? `<span>${esc(it.tags[0])}</span>` : '';
      L.marker(ll(it.center), {
        icon: L.divIcon({
          className: 'military-label',
          html: `<b>${esc(it.label || '未命名')}</b>${tag}`,
          iconSize: [150, 17],
          iconAnchor: [75, 8],
        }),
        pane: 'labelPane', interactive: false, keyboard: false, zIndexOffset: 100000,
      }).addTo(militaryLabelGroup);
    }
  }

  function initCountyLayer() {
    const features = counties.filter((c) => c.geometry).map((c) => ({ type: 'Feature', properties: { code: c.code }, geometry: c.geometry }));
    countyLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
      pane: 'countyPane',
      style: (f) => baseStyle(byCode[f.properties.code]),
      onEachFeature: (f, layer) => {
        const c = byCode[f.properties.code];
        countyLayers[c.code] = layer;
        layer.bindTooltip(() => countyTip(c), { sticky: true, className: 'nuke-tip', direction: 'top', offset: [0, -3] });
        layer.on('mouseover', () => {
          if (state.selected !== c.code) layer.setStyle({ weight: 1.4, color: 'rgba(235,255,245,.9)' });
        });
        layer.on('mouseout', () => {
          if (state.selected !== c.code) layer.setStyle({ weight: 0.55, color: 'rgba(4,9,11,.55)' });
        });
        layer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          selectCounty(c.code, { fly: false, fromOrigin: false });
        });
      },
    }).addTo(map);
  }

  function baseStyle(c) {
    const v = metricValue(c);
    const selected = state.selected === c.code;
    return {
      fillColor: metricColor(state.metric, v),
      fillOpacity: selected ? 0.94 : state.metric === 'hazard' ? 0.78 : 0.72,
      color: selected ? '#f4fff8' : 'rgba(4,9,11,.55)',
      weight: selected ? 2.2 : 0.55,
      opacity: 1,
    };
  }

  function restyleAll() {
    if (!countyLayer) return;
    countyLayer.eachLayer((layer) => {
      const c = byCode[layer.feature.properties.code];
      if (c) layer.setStyle(baseStyle(c));
    });
    if (state.selected && countyLayers[state.selected]) countyLayers[state.selected].bringToFront();
  }

  function countyTip(c) {
    const tier = hazardTier(c.cur.hazard);
    return `<b>${esc(c.name)}</b> <span>${esc(c.city)}</span><br>` +
      `<span style="color:${tier.color}">危险 ${fmt1(c.cur.hazard)} · ${tier.label}</span>　` +
      `<span>生存 ${c.cur.survival} · 推荐 ${c.cur.recommend}${c.cur.grade}</span><br>` +
      `<span>海拔 ${c.meanElev} m · 人口 ${fmtPop(c.pop)}</span>`;
  }

  function initTargets() {
    for (const t of DATA.targets) {
      const tm = typeMeta(t.type);
      const html = `<div class="target-marker ${t.type}${t.peripheral ? ' peripheral' : ''}" style="--c:${tm.color}">${tm.icon}</div>`;
      const m = L.marker([t.lat, t.lng], {
        icon: L.divIcon({ className: 'target-wrap', html, iconSize: [20, 20], iconAnchor: [10, 10] }),
        pane: 'targetPane', riseOnHover: true, keyboard: false,
      });
      m.bindTooltip(
        `<b>${esc(t.name)}</b><br><span>${tm.label} · 权重 ${fmt1(t.weight)} · 假设 ${t.yieldKt} kt</span><br><span>${esc(t.note)}</span><br><span style="color:#61727a">置信度：${esc(t.confidence)}${t.peripheral ? ' · 外围背景目标' : ''}</span>`,
        { className: 'nuke-tip', direction: 'top', offset: [0, -12], opacity: 1 }
      );
      m.on('click', () => {
        map.flyTo([t.lat, t.lng], Math.max(map.getZoom(), 8.5), { duration: 0.7 });
        m.openTooltip();
      });
      targetMarkers[t.id] = m;
    }
    targetGroup = L.layerGroup().addTo(map);
    rebuildTargets();
  }

  function targetMinZoom(t) {
    if (t.peripheral) return 9;
    if (t.type === 'nuclear' || t.type === 'naval' || t.type === 'command') return 5.4;
    if (t.type === 'port' || t.type === 'airbase' || t.type === 'steel' || t.type === 'petrochem') return 7.1;
    if (t.type === 'chem') return t.weight >= 0.65 ? 6.0 : t.weight >= 0.55 ? 6.9 : 7.8;
    if (t.type === 'factory') return t.weight >= 0.55 ? 7.6 : 8.6;
    return 8.1;
  }

  function rebuildTargets() {
    if (!targetGroup || !map) return;
    targetGroup.clearLayers();
    const z = map.getZoom();
    let n = 0;
    for (const t of DATA.targets) {
      if (z + 0.001 < targetMinZoom(t)) continue;
      const m = targetMarkers[t.id];
      if (m) { targetGroup.addLayer(m); n++; }
    }
    updateTargetDim();
    const el = $('#count-targets');
    if (el) el.textContent = `${n}/${DATA.targets.length}`;
  }

  function updateTargetDim() {
    const sc = Risk.SCENARIOS[state.scenario];
    const active = sc.types ? new Set(sc.types) : null;
    for (const t of DATA.targets) {
      const m = targetMarkers[t.id];
      if (!m) continue;
      const on = !active || active.has(t.type);
      m.setOpacity(on ? (t.peripheral ? 0.55 : 1) : 0.18);
    }
  }

  function initHavens() {
    havenMarkers = [];
    for (const c of counties.filter((x) => x.haven)) {
      const m = L.marker(ll(c.center), {
        icon: L.divIcon({ className: 'haven-wrap', html: '<div class="haven-marker"></div>', iconSize: [10, 10], iconAnchor: [5, 5] }),
        pane: 'havenPane', riseOnHover: true, keyboard: false,
      });
      m.bindTooltip(`<b>${esc(c.name)}</b><br><span>${esc(c.havenNote || '山区避难节点')}</span><br><span>危险 ${fmt1(c.cur.hazard)} · 生存 ${c.cur.survival}</span>`, { className: 'nuke-tip', direction: 'top', offset: [0, -6] });
      m.on('click', () => selectCounty(c.code, { fly: true, fromOrigin: false }));
      havenMarkers.push({ c, m, minZoom: 7.2 });
    }
    havenMarkers.sort((a, b) => b.c.cur.recommend - a.c.cur.recommend);
    havenMarkers.forEach((x, i) => { x.minZoom = i < 12 ? 5.4 : 7.2; });
    havenGroup = L.layerGroup().addTo(map);
    rebuildHavens();
  }

  function rebuildHavens() {
    if (!havenGroup || !map) return;
    havenGroup.clearLayers();
    if (!state.layers.havens) return;
    const z = map.getZoom();
    for (const x of havenMarkers) {
      if (z + 0.001 >= x.minZoom) havenGroup.addLayer(x.m);
    }
  }

  function initOriginMarker() {
    originMarker = L.marker(ll(state.origin.center), {
      icon: L.divIcon({
        className: 'origin-wrap',
        html: '<div class="origin-marker"><i></i><span>我的位置</span></div>',
        iconSize: [22, 22], iconAnchor: [11, 11],
      }),
      pane: 'targetPane', interactive: false, keyboard: false,
    }).addTo(map);
  }

  function moveOriginMarker() {
    if (!originMarker) return;
    originMarker.setLatLng(ll(state.origin.center));
    const el = originMarker.getElement();
    if (el) el.querySelector('span').textContent = state.origin.name;
  }

  function updateLabels() {
    if (!labelGroup) return;
    labelGroup.clearLayers();
    if (!state.layers.labels) return;
    const z = map.getZoom();
    if (z < 7.1) {
      DATA.cities.filter((c) => c.pop > 2600000).slice(0, 22).forEach((c) => addCityLabel(c));
    } else if (z < 8.1) {
      DATA.cities.filter((c) => c.pop > 1500000).forEach((c) => addCityLabel(c));
    } else if (z < 8.8) {
      counties.filter((c) => c.haven || c.pop > 180000).forEach((c) => addCountyLabel(c));
    } else if (z < 9.8) {
      counties.filter((c) => c.haven || c.area >= 500).forEach((c) => addCountyLabel(c));
    } else {
      counties.forEach((c) => addCountyLabel(c));
    }
  }
  function addCityLabel(c) {
    L.marker(ll(c.center), {
      icon: L.divIcon({ className: 'city-label', html: `<b>${esc(c.name)}</b><span>${fmt1(c.avgHazard)}</span>`, iconSize: [150, 18], iconAnchor: [75, 9] }),
      pane: 'labelPane', interactive: false, keyboard: false, zIndexOffset: 100000,
    }).addTo(labelGroup);
  }
  function addCountyLabel(c) {
    L.marker(ll(c.center), {
      icon: L.divIcon({ className: 'county-label' + (c.haven ? ' major' : ''), html: esc(c.name), iconSize: [110, 16], iconAnchor: [55, 8] }),
      pane: 'labelPane', interactive: false, keyboard: false, zIndexOffset: 100000,
    }).addTo(labelGroup);
  }

  /* ---------- 沉降热区 ---------- */
  function initPlume() {
    plumeLayer = L.imageOverlay('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', [[23.0, 112.0], [39.3, 123.6]], {
      opacity: 0.5, pane: 'plumePane', interactive: false, className: 'plume-image',
    });
    if (state.layers.plume) plumeLayer.addTo(map);
    setTimeout(renderPlume, 80);
  }

  function renderPlume() {
    if (!plumeLayer) return;
    const key = state.scenario + '|' + state.season;
    if (state.plumeKey === key && state.plumeUrl) {
      plumeLayer.setUrl(state.plumeUrl);
      return;
    }
    const targets = DATA.targets.filter((t) => t.type === 'nuclear' || t.type === 'petrochem');
    const fieldTargets = Risk.prepareField ? Risk.prepareField(targets, state.scenario) : targets;
    const W = 360, H = 260;
    const bounds = [[23.0, 112.0], [39.3, 123.6]];
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const data = img.data;
    const latTop = bounds[1][0], latBottom = bounds[0][0], lngLeft = bounds[0][1], lngRight = bounds[1][1];
    for (let y = 0; y < H; y++) {
      const lat = latTop + (latBottom - latTop) * (y / (H - 1));
      for (let x = 0; x < W; x++) {
        const lng = lngLeft + (lngRight - lngLeft) * (x / (W - 1));
        const f = Risk.fieldAt ? Risk.fieldAt(fieldTargets, [lng, lat], state.season) : Risk.falloutField([lng, lat], targets, state.scenario, state.season).value;
        const i = (y * W + x) * 4;
        if (f < 3) { data[i + 3] = 0; continue; }
        const a = Math.min(96, Math.pow(f / 100, 0.78) * 120);
        data[i] = 212;
        data[i + 1] = Math.max(52, 118 - f * 0.72);
        data[i + 2] = 58;
        data[i + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    state.plumeKey = key;
    state.plumeUrl = canvas.toDataURL('image/png');
    plumeLayer.setUrl(state.plumeUrl);
  }

  /* ---------- 选择与详情 ---------- */
  function selectCounty(code, opts = {}) {
    const c = byCode[code];
    if (!c) return;
    state.selected = code;
    state.routeMode = opts.fromOrigin ? 'origin' : 'local';
    restyleAll();
    renderDetail(c);
    drawPlan(c);
    if (opts.fly) {
      const layer = countyLayers[code];
      if (layer) map.flyToBounds(layer.getBounds().pad(0.25), { maxZoom: 9.2, duration: 0.8 });
      else map.flyTo(ll(c.center), 9, { duration: 0.8 });
    }
    if (window.innerWidth <= 900) {
      $('#detail-panel').classList.add('open');
      closeLeftPanel();
    }
  }

  function closeDetail() {
    state.selected = null;
    restyleAll();
    clearRoutes();
    $('#detail-content').hidden = true;
    $('#detail-empty').hidden = false;
    $('#detail-panel').classList.remove('open');
  }

  function renderDetail(c) {
    const h = c.cur.hazard, s = c.cur.survival, r = c.cur.recommend, reach = c.cur.reach;
    const tier = hazardTier(h);
    const plan = buildPlan(c);
    const seasonal = c.cur.seasonal || {};
    const top = (c.cur.top || []).slice(0, 5);
    const distOrigin = c.cur.originDist, hoursOrigin = c.cur.originHours;
    const isOrigin = Math.abs(c.center[0] - state.origin.center[0]) < 0.01 && Math.abs(c.center[1] - state.origin.center[1]) < 0.01;

    const seasonChips = ['winter', 'summer', 'shoulder'].map((k) => {
      const w = DATA.meta.seasons[k];
      return `<div class="season-chip ${state.season === k ? 'on' : ''}"><span>${esc(w.short)}</span><b style="color:${metricColor('hazard', seasonal[k] || 0)}">${fmt1(seasonal[k] || 0)}</b></div>`;
    }).join('');

    const bars = [
      ['直接打击', c.cur.strike, '#ff6b5e'],
      ['放射性沉降', c.cur.fallout, '#d9a441'],
      ['次生灾害', c.cur.secondary, '#b07be0'],
    ].map(([label, v, col]) => `<div class="metric-row"><span>${label}</span><div class="bar"><i style="width:${clamp(v, 0, 100)}%;--bar:${col}"></i></div><b>${fmt1(v)}</b></div>`).join('');

    const survBars = [
      ['地形遮蔽', c.terrain, '#8fe3b0'],
      ['自持能力', c.selfSuff, '#5ad1e6'],
      ['低密度', c.lowDensity, '#a8d8a0'],
      ['交通可达', c.access, '#e6c36a'],
      ['公共服务', c.service, '#c9a7e8'],
    ].map(([label, v, col]) => `<div class="metric-row"><span>${label}</span><div class="bar"><i style="width:${clamp(v, 0, 100)}%;--bar:${col}"></i></div><b>${Math.round(v)}</b></div>`).join('');

    const threatHtml = top.length ? top.map((t) => {
      const tm = typeMeta(t.type);
      return `<div class="threat-item">
        <div class="threat-sym" style="color:${tm.color}">${tm.icon}</div>
        <div class="threat-name">${esc(t.short || t.name)}<small>${tm.label}</small></div>
        <div class="threat-dist">${fmt1(t.dist)} km<i>威胁 ${fmt1(t.total)}</i></div>
      </div>`;
    }).join('') : '<div class="threat-empty">附近没有计入的目标</div>';

    const planCard = (d, backup) => {
      if (!d) return '';
      const badge = d.haven ? '<span style="color:#e6c36a">避难节点</span>' : '';
      return `<div class="plan-card${backup ? ' backup' : ''}">
        <div class="plan-card-top"><b>${esc(d.name)}</b><span>${badge}${d.code !== c.code ? `${d.distKm} km · 约 ${fmt1(d.hours)} h` : '就地'}</span></div>
        <div class="plan-geo">${esc(d.province)} ${esc(d.city)} · 危险 ${fmt1(d.hazard)} · 生存 ${d.survival}</div>
        <div class="plan-route">${esc(d.route)}</div>
        ${d.bottleneck ? `<div class="plan-bottleneck">${esc(d.bottleneck)}</div>` : ''}
        ${d.havenNote ? `<div class="plan-geo" style="margin-top:5px;color:#8d9b7a">${esc(d.havenNote)}</div>` : ''}
      </div>`;
    };

    const reachCard = !isOrigin ? `<div class="reach-card">从 <b>${esc(state.origin.name)}</b> 到 ${esc(c.name)}：约 <b>${fmtInt(distOrigin)} km / ${fmt1(hoursOrigin)} h</b>。扣除路途成本后的可达推荐为 <b>${reach}</b>；若只为短时躲避，单程超过 4 小时要谨慎，长期转移可接受 5–7 小时。</div>` : '';

    const html = `
      <div class="detail-head">
        <button class="detail-close" id="detail-close" title="关闭">✕</button>
        <div class="detail-crumb">${esc(c.province)} / ${esc(c.city)} / ${esc(c.region)}</div>
        <div class="detail-title-row"><h2>${esc(c.name)}</h2><span class="tier-badge" style="color:${tier.color}">${tier.label}危险</span></div>
        <div class="detail-sub">${fmtPop(c.pop)}人 · ${fmtInt(c.area)} km² · 密度 ${fmt1(c.density)}/km² <span>·</span> 海拔 ${c.meanElev} m</div>
      </div>
      <div class="score-board">
        <div class="ring" style="--v:${clamp(h, 0, 100)};--c:${metricColor('hazard', h)}">
          <div class="ring-inner"><b>${fmt1(h)}</b><span>危险度</span></div>
        </div>
        <div class="score-side">
          <div class="score-line"><span>生存条件</span><b class="green">${s}</b></div>
          <div class="score-line"><span>综合推荐</span><b class="gold">${r} · ${c.cur.grade}</b></div>
          <div class="score-line"><span>可达推荐</span><b>${reach}</b></div>
          <div class="score-line"><span>距${esc(state.origin.name)}</span><b>${fmtInt(distOrigin)} km / ${fmt1(hoursOrigin)} h</b></div>
        </div>
      </div>
      <div class="season-strip">${seasonChips}</div>
      <div class="detail-section">
        <h4>撤离方案 <em>${plan.mode === 'hold' ? '留守 / 就地掩蔽' : '战前转移'}</em></h4>
        <div class="plan-mode">${esc(plan.headline)}</div>
        ${planCard(plan.primary, false)}
        ${plan.backup ? `<div class="plan-backup-label">备选 / BACKUP</div>${planCard(plan.backup, true)}` : ''}
        ${reachCard}
        <div class="alert-box"><b>警报后：</b>${esc(plan.alert)}</div>
      </div>
      <div class="detail-section">
        <h4>威胁构成 <em>当前情景 / 当前风季</em></h4>
        <div class="metric-bars">${bars}</div>
      </div>
      <div class="detail-section">
        <h4>附近目标 <em>TOP ${top.length}</em></h4>
        <div class="threat-list">${threatHtml}</div>
      </div>
      <div class="detail-section">
        <h4>生存条件 <em>0–100</em></h4>
        <div class="metric-bars">${survBars}</div>
      </div>
      <div class="detail-section">
        <h4>本地速览</h4>
        <div class="facts">
          <div class="fact"><span>地形起伏</span><b>${c.relief} m</b></div>
          <div class="fact"><span>平均海拔</span><b>${c.meanElev} m</b></div>
          <div class="fact"><span>人口密度</span><b>${fmt1(c.density)}<em>/km²</em></b></div>
          <div class="fact"><span>到上海</span><b>${fmt1(c.hoursFromShanghai)}<em>h</em></b></div>
          <div class="fact"><span>行政等级</span><b>${c.name.endsWith('区') ? '市辖区' : c.name.endsWith('市') ? '县级市' : '县'}</b></div>
          <div class="fact"><span>数据口径</span><b>${c.popEstimated ? '人口估算' : '七普 2020'}</b></div>
        </div>
        ${c.haven ? `<div class="reach-card" style="border-color:rgba(230,195,106,.2);background:rgba(230,195,106,.05)"><b style="color:#e6c36a">山区避难节点</b> · ${esc(c.havenNote)}</div>` : ''}
      </div>
    `;

    const box = $('#detail-content');
    box.innerHTML = html;
    box.hidden = false;
    $('#detail-empty').hidden = true;
    box.scrollTop = 0;
    $('#detail-close').addEventListener('click', closeDetail);
    $('#detail-panel').classList.add('open');
  }

  function clearRoutes() {
    if (routeGroup) routeGroup.clearLayers();
  }

  function drawPlan(c) {
    clearRoutes();
    if (!routeGroup) return;
    const plan = buildPlan(c);
    if (state.routeMode === 'origin') {
      drawLine(ll(state.origin.center), ll(c.center), '#5ad1e6', 2.4, '从 ' + state.origin.name + ' 到 ' + c.name);
      addPoint(ll(state.origin.center), '#5ad1e6', 5);
      addPoint(ll(c.center), '#5ad1e6', 6);
      return;
    }
    if (plan.mode === 'hold') {
      L.circle(ll(c.center), { radius: 9000, color: '#8fe3b0', weight: 1.2, dashArray: '4 5', fill: false, opacity: 0.7, pane: 'routePane' }).addTo(routeGroup);
      addPoint(ll(c.center), '#8fe3b0', 6);
      if (plan.backup) drawLine(ll(c.center), ll(byCode[plan.backup.code].center), '#e6c36a', 1.4, `备选 ${plan.backup.name}`);
      return;
    }
    drawLine(ll(c.center), ll(byCode[plan.primary.code].center), '#8fe3b0', 2.2, `${plan.primary.name} · ${plan.primary.distKm} km`);
    addPoint(ll(c.center), '#ff8a4c', 6);
    addPoint(ll(byCode[plan.primary.code].center), '#8fe3b0', 7);
    if (plan.backup) drawLine(ll(c.center), ll(byCode[plan.backup.code].center), '#e6c36a', 1.4, `备选 ${plan.backup.name}`);
  }

  function drawLine(a, b, color, weight, label) {
    const line = L.polyline([a, b], { color, weight, opacity: 0.9, dashArray: '7 8', className: 'route-line', pane: 'routePane' }).addTo(routeGroup);
    if (label) {
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      L.marker(mid, {
        icon: L.divIcon({ className: 'route-label-wrap', html: `<div class="route-label">${esc(label)}</div>`, iconSize: [180, 18], iconAnchor: [90, 9] }),
        pane: 'routePane', interactive: false, keyboard: false, zIndexOffset: 100000,
      }).addTo(routeGroup);
    }
    return line;
  }
  function addPoint(center, color, radius) {
    L.circleMarker(center, { radius, color, weight: 1.5, fillColor: '#071014', fillOpacity: 0.9, pane: 'routePane' }).addTo(routeGroup);
  }

  /* ---------- 统计 / 图例 / 顶栏 ---------- */
  function renderAll() {
    restyleAll();
    renderStats();
    renderLegend();
    renderOriginTop();
    updateWind();
    updateTargetDim();
    updateHud();
    updateSwitchGlow();
    if (state.selected && byCode[state.selected]) renderDetail(byCode[state.selected]);
    renderPlume();
  }

  function renderStats() {
    const extreme = counties.filter((c) => c.cur.hazard >= 80).length;
    const safe = counties.filter((c) => c.cur.hazard < 28).length;
    const havens = counties.filter((c) => c.haven).length;
    $('#stat-extreme').textContent = extreme;
    $('#stat-safe').textContent = safe;
    $('#stat-haven').textContent = havens;
    $('#stat-wind').textContent = wind().short;
    $('#hud-count').textContent = `${counties.length} 县 · 极高危 ${extreme}`;
  }

  function renderLegend() {
    const lg = LEGENDS[state.metric];
    $('#legend-note').textContent = lg.note;
    $('#legend').innerHTML = lg.rows.map(([a, b, label]) => {
      const mid = (a + b) / 2;
      return `<div class="legend-row"><i style="background:${metricColor(state.metric, mid)}"></i><span>${label}</span><b>${a}–${b}</b></div>`;
    }).join('');
  }

  function renderOriginTop() {
    const pool = counties.filter((c) => c.cur.hazard < 32 && (c.haven || (c.cur.survival >= 58 && c.terrain >= 50)));
    const top = pool.sort((a, b) => b.cur.reach - a.cur.reach || b.cur.recommend - a.cur.recommend).slice(0, 6);
    $('#origin-top').innerHTML = top.map((c, i) => `
      <button class="dest-item" data-code="${c.code}">
        <span class="dest-rank">${String(i + 1).padStart(2, '0')}</span>
        <span class="dest-name">${esc(c.name)}<small>${esc(c.city.replace('市', ''))}</small></span>
        <span class="dest-meta"><b class="dest-score" style="color:${gradeColor(c.cur.grade)}">${c.cur.reach}</b><span class="dest-sub">${c.cur.grade} · 险${fmt1(c.cur.hazard)} · <b>${fmtInt(c.cur.originDist)}km</b></span></span>
      </button>`).join('') || '<div style="color:#61727a;font-size:10px;padding:6px 0">该出发地附近没有满足条件的低危县。</div>';
    $$('#origin-top .dest-item').forEach((btn) => btn.addEventListener('click', () => {
      selectCounty(btn.dataset.code, { fly: true, fromOrigin: true });
    }));
    renderEmptyRoutes(top);
  }

  function renderEmptyRoutes(top) {
    if (!top) top = counties.filter((c) => c.cur.hazard < 32 && (c.haven || (c.cur.survival >= 58 && c.terrain >= 50))).sort((a, b) => b.cur.reach - a.cur.reach).slice(0, 3);
    const three = top.slice(0, 3);
    const box = $('#empty-routes');
    if (!box) return;
    box.innerHTML = three.map((c) => {
      const cor = (DATA.meta.corridors || {})[c.region] || { hw: '高速走廊' };
      return `<button class="empty-route" data-code="${c.code}">
        <div class="empty-route-top"><b>${esc(c.name)}</b><span>${fmtInt(c.cur.originDist)} km · ${fmt1(c.cur.originHours)} h</span></div>
        <div class="empty-route-sub">${esc(c.province)} ${esc(c.city)} · 危险 ${fmt1(c.cur.hazard)} · ${esc(cor.hw)}</div>
      </button>`;
    }).join('');
    $$('#empty-routes .empty-route').forEach((btn) => btn.addEventListener('click', () => {
      selectCounty(btn.dataset.code, { fly: true, fromOrigin: true });
    }));
  }

  function setSeason(season, announce = true) {
    state.season = season;
    $('#season-select').value = season;
    computeAll();
    renderAll();
    if (state.selected) { renderDetail(byCode[state.selected]); drawPlan(byCode[state.selected]); }
    if (announce) toast(`${wind().label}：${wind().desc}`);
  }

  function updateWind() {
    const w = wind();
    $('#wind-title').textContent = w.label;
    $('#wind-desc').textContent = w.desc;
    $('#compass-arrow').style.transform = `translate(-50%, -100%) rotate(${w.to}deg)`;
    $('#hud-season').textContent = w.label;
    $('#hud-scenario').textContent = (Risk.SCENARIOS[state.scenario] || {}).label || '';
    $('#stat-wind').textContent = w.short;
    const mb = $('#btn-mobile-season');
    if (mb) mb.textContent = `风季·${w.short}`;
  }

  function updateHud() {
    const sc = Risk.SCENARIOS[state.scenario] || {};
    $('#hud-scenario').textContent = sc.label || '';
    $('#hud-season').textContent = wind().label;
  }

  function updateSwitchGlow() {
    const active = $('.scenario-switch button.active');
    const glow = $('.switch-glow');
    if (!active || !glow) return;
    glow.style.width = active.offsetWidth + 'px';
    glow.style.transform = `translateX(${active.offsetLeft - 3}px)`;
  }

  /* ---------- 事件 ---------- */
  function bindUI() {
    $$('.scenario-switch button').forEach((btn) => btn.addEventListener('click', () => {
      $$('.scenario-switch button').forEach((b) => b.classList.toggle('active', b === btn));
      state.scenario = btn.dataset.scenario;
      updateSwitchGlow();
      computeAll();
      renderAll();
      updateTargetDim();
      if (state.selected) renderDetail(byCode[state.selected]);
    }));

    $('#season-select').addEventListener('change', (e) => setSeason(e.target.value));
    $('#btn-mobile-season').addEventListener('click', () => {
      const order = ['winter', 'summer', 'shoulder'];
      const i = order.indexOf(state.season);
      setSeason(order[(i + 1) % order.length]);
    });

    $('#metric-select').addEventListener('change', (e) => {
      state.metric = e.target.value;
      restyleAll();
      renderLegend();
      if (state.selected) renderDetail(byCode[state.selected]);
    });

    $('#origin-select').addEventListener('change', (e) => {
      const name = e.target.value;
      state.origin = { name, center: ORIGINS[name] };
      moveOriginMarker();
      computeReach();
      renderOriginTop();
      updateOriginHint();
      restyleAll();
      if (state.selected) renderDetail(byCode[state.selected]);
      if (state.metric === 'reach') renderLegend();
    });

    $('#btn-locate').addEventListener('click', locateMe);

    $('#btn-search').addEventListener('click', openSearch);
    $('#search-close').addEventListener('click', closeSearch);
    $('#search-overlay').addEventListener('click', (e) => { if (e.target.id === 'search-overlay') closeSearch(); });
    $('#search-input').addEventListener('input', (e) => runSearch(e.target.value));
    $('#search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = $('#search-results .search-item'); if (first) first.click(); }
    });

    $('#btn-rank').addEventListener('click', openRank);
    $('#btn-mobile-rank').addEventListener('click', openRank);
    $('#btn-about').addEventListener('click', () => openModal('modal-about'));
    $('#btn-mobile-about').addEventListener('click', () => openModal('modal-about'));

    $$('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(b.dataset.close)));
    $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModal(m.id); }));

    $('#rank-search').addEventListener('input', (e) => { state.rankQuery = e.target.value.trim(); renderRank(); });
    $('#rank-level').addEventListener('change', (e) => { state.rankLevel = e.target.value; renderRank(); });
    $('#rank-province').addEventListener('change', (e) => { state.rankProvince = e.target.value; renderRank(); });
    $('#rank-sort').addEventListener('change', (e) => { state.rankSort = e.target.value; renderRank(); });
    $('#btn-export').addEventListener('click', exportCSV);

    $('#layer-targets').addEventListener('change', (e) => setLayer('targets', e.target.checked));
    $('#layer-plume').addEventListener('change', (e) => setLayer('plume', e.target.checked));
    $('#layer-water').addEventListener('change', (e) => setLayer('water', e.target.checked));
    $('#layer-expressway').addEventListener('change', (e) => setLayer('expressway', e.target.checked));
    $('#layer-national').addEventListener('change', (e) => setLayer('national', e.target.checked));
    $('#layer-military').addEventListener('change', (e) => {
      setLayer('military', e.target.checked);
      if (!e.target.checked) return;
      updateMilitaryStatus(militaryItems(militaryData));
      showMilitaryStep(1);
      openModal('modal-military');
    });
    const quitMilitary = () => {
      closeModal('modal-military');
      $('#layer-military').checked = false;
      setLayer('military', false);
    };
    $('#btn-military-off').addEventListener('click', quitMilitary);
    $('#btn-military-off2').addEventListener('click', quitMilitary);
    $('#btn-military-continue').addEventListener('click', () => showMilitaryStep(2));
    $('#btn-military-silent').addEventListener('click', () => closeModal('modal-military'));
    $('#layer-rings').addEventListener('change', (e) => setLayer('rings', e.target.checked));
    $('#layer-havens').addEventListener('change', (e) => setLayer('havens', e.target.checked));
    $('#layer-labels').addEventListener('change', (e) => setLayer('labels', e.target.checked));
    $('#basemap-select').addEventListener('change', (e) => setBasemap(e.target.value));

    $('#btn-left-collapse').addEventListener('click', () => {
      if (window.innerWidth <= 900) closeLeftPanel();
      else $('#left-panel').classList.add('collapsed');
    });
    $('#left-reopen').addEventListener('click', () => $('#left-panel').classList.remove('collapsed'));
    $('#btn-mobile-layers').addEventListener('click', () => {
      const p = $('#left-panel');
      p.classList.remove('collapsed');
      p.classList.toggle('open');
    });

    $('#zoom-in').addEventListener('click', () => map.zoomIn());
    $('#zoom-out').addEventListener('click', () => map.zoomOut());
    $('#btn-reset').addEventListener('click', resetView);

    $$('.empty-links button').forEach((b) => b.addEventListener('click', () => flyToCity(b.dataset.fly)));

    $('#detail-content').addEventListener('click', (e) => {
      if (e.target.closest('#detail-close')) closeDetail();
    });

    window.addEventListener('resize', () => {
      updateSwitchGlow();
      setTimeout(() => map && map.invalidateSize(), 120);
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
      if (e.key === 'Escape') {
        if (!$('#search-overlay').hidden) closeSearch();
        else if ($('.modal:not([hidden])')) closeModal($('.modal:not([hidden])').id);
        else if (state.selected) closeDetail();
        else closeLeftPanel();
      }
    });
  }

  function setLayer(name, on) {
    state.layers[name] = on;
    if (name === 'targets') { if (on) targetGroup.addTo(map); else map.removeLayer(targetGroup); }
    if (name === 'havens') { if (on) { havenGroup.addTo(map); rebuildHavens(); } else map.removeLayer(havenGroup); }
    if (name === 'plume') { if (on) plumeLayer.addTo(map); else map.removeLayer(plumeLayer); }
    if (name === 'water') {
      if (on) waterGroup.addTo(map); else map.removeLayer(waterGroup);
      if (on) waterLabelGroup.addTo(map); else map.removeLayer(waterLabelGroup);
      rebuildWaterLabels();
    }
    if (name === 'expressway') {
      if (on) expresswayGroup.addTo(map); else map.removeLayer(expresswayGroup);
      updateRoadVisibility();
      rebuildRoadLabels();
    }
    if (name === 'national') {
      if (on) nationalGroup.addTo(map); else map.removeLayer(nationalGroup);
      updateRoadVisibility();
      rebuildRoadLabels();
    }
    if (name === 'military') {
      if (on) militaryGroup.addTo(map); else map.removeLayer(militaryGroup);
      rebuildMilitaryLabels();
    }
    if (name === 'rings') { if (on) { renderRings(); ringGroup.addTo(map); } else map.removeLayer(ringGroup); }
    if (name === 'labels') updateLabels();
  }

  function renderRings() {
    ringGroup.clearLayers();
    for (const t of DATA.targets) {
      if (t.peripheral || !['nuclear', 'naval', 'command', 'port'].includes(t.type)) continue;
      const tm = typeMeta(t.type);
      const rr = Risk.severityRadii(t.yieldKt);
      L.circle([t.lat, t.lng], { radius: rr.severe * 1000, color: tm.color, weight: 1, opacity: 0.55, fill: false, dashArray: '2 4', pane: 'ringPane' }).addTo(ringGroup);
      L.circle([t.lat, t.lng], { radius: rr.light * 1000, color: tm.color, weight: 0.7, opacity: 0.22, fill: false, dashArray: '1 6', pane: 'ringPane' }).addTo(ringGroup);
    }
  }

  function setBasemap(kind) {
    state.basemap = kind;
    if (map.hasLayer(darkTiles)) map.removeLayer(darkTiles);
    if (map.hasLayer(satTiles)) map.removeLayer(satTiles);
    if (kind === 'dark') darkTiles.addTo(map);
    else if (kind === 'sat') satTiles.addTo(map);
  }

  function resetView() {
    const b = window.innerWidth < 760 ? [[24.2, 113.5], [37.4, 122.2]] : [[24.0, 112.8], [37.8, 123.0]];
    map.fitBounds(b, { padding: [16, 16], duration: 0.6 });
  }

  function flyToCity(name) {
    const c = DATA.cities.find((x) => x.name === name || x.name.replace('市', '') === name);
    if (c) { map.flyTo(ll(c.center), 8.5, { duration: 0.8 }); }
  }

  function updateOriginHint() {
    const c = state.origin;
    $('#origin-hint').textContent = `从${c.name}出发 · 已按公路距离与时间修正“可达推荐”`;
    const sel = $('#origin-select');
    if (![...sel.options].some((o) => o.value === c.name)) {
      const opt = document.createElement('option');
      opt.value = c.name; opt.textContent = c.name + ' · 自定义位置';
      sel.appendChild(opt);
    }
    sel.value = c.name;
  }

  /* ---------- 搜索 ---------- */
  function buildSearchIndex() {
    const idx = [];
    for (const c of counties) idx.push({ kind: 'county', id: c.code, name: c.name, sub: `${c.province} ${c.city} · 危险 ${fmt1(c.cur.hazard)}`, center: c.center });
    for (const city of DATA.cities) idx.push({ kind: 'city', id: city.name, name: city.name, sub: `${city.province} · ${city.count} 区县`, center: city.center });
    for (const t of DATA.targets) idx.push({ kind: 'target', id: t.id, name: t.name, sub: `${typeMeta(t.type).label} · ${t.city || ''}`, center: [t.lng, t.lat] });
    for (const c of counties.filter((x) => x.haven)) idx.push({ kind: 'haven', id: c.code, name: c.name + ' 避难节点', sub: c.havenNote, center: c.center });
    state.searchIndex = idx;
  }

  function openSearch() {
    $('#search-overlay').hidden = false;
    const input = $('#search-input');
    input.value = '';
    runSearch('');
    setTimeout(() => input.focus(), 20);
  }
  function closeSearch() { $('#search-overlay').hidden = true; }

  function runSearch(q) {
    q = (q || '').trim();
    let list;
    if (!q) {
      list = counties.slice().sort((a, b) => b.cur.recommend - a.cur.recommend).slice(0, 8).map((c) => ({ kind: 'county', id: c.code, name: c.name, sub: `${c.province} ${c.city} · 推荐 ${c.cur.recommend}`, center: c.center }));
    } else {
      const lq = q.toLowerCase();
      list = state.searchIndex.filter((x) => x.name.toLowerCase().includes(lq) || (x.sub || '').toLowerCase().includes(lq) || x.id === q);
      list.sort((a, b) => {
        const an = a.name === q ? 0 : a.name.startsWith(q) ? 1 : 2;
        const bn = b.name === q ? 0 : b.name.startsWith(q) ? 1 : 2;
        return an - bn;
      });
      list = list.slice(0, 16);
    }
    const kindIcon = { county: '县', city: '市', target: '☢', haven: '◆' };
    $('#search-results').innerHTML = list.length ? list.map((x) => `
      <button class="search-item" data-kind="${x.kind}" data-id="${esc(x.id)}">
        <span class="s-icon">${kindIcon[x.kind] || '·'}</span>
        <span class="s-main"><span class="s-name">${esc(x.name)}<small>${x.kind === 'county' ? '区县' : x.kind === 'target' ? '目标' : x.kind === 'city' ? '城市' : '避难节点'}</small></span><span class="s-sub">${esc(x.sub || '')}</span></span>
        <span class="s-score">${x.kind === 'county' ? fmt1(byCode[x.id].cur.hazard) : '›'}</span>
      </button>`).join('') : '<div class="search-empty">没有找到。试试“绩溪”“黄山”“秦山”“丽水”。</div>';

    $$('#search-results .search-item').forEach((btn) => btn.addEventListener('click', () => {
      const kind = btn.dataset.kind, id = btn.dataset.id;
      closeSearch();
      if (kind === 'county' || kind === 'haven') selectCounty(id, { fly: true, fromOrigin: false });
      else if (kind === 'city') flyToCity(id);
      else if (kind === 'target') {
        const t = byTarget[id];
        if (t) { map.flyTo([t.lat, t.lng], 9, { duration: 0.8 }); setTimeout(() => targetMarkers[id] && targetMarkers[id].openTooltip(), 700); }
      }
    }));
  }

  /* ---------- 排行 / 导出 ---------- */
  function openRank() {
    if (!$('#rank-province').dataset.ready) {
      $('#rank-province').innerHTML = '<option value="">全部省份</option>' + provinceList.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
      $('#rank-province').dataset.ready = '1';
    }
    $('#modal-rank').hidden = false;
    renderRank();
  }

  function cityRows() {
    const m = new Map();
    for (const c of counties) {
      let x = m.get(c.city);
      if (!x) { x = { name: c.city, province: c.province, count: 0, pop: 0, hazard: 0, maxHazard: 0, survival: 0, recommend: 0, reach: 0, lng: 0, lat: 0 }; m.set(c.city, x); }
      x.count++; x.pop += c.pop; x.hazard += c.cur.hazard; x.maxHazard = Math.max(x.maxHazard, c.cur.hazard); x.survival += c.cur.survival; x.recommend += c.cur.recommend; x.reach += c.cur.reach;
      x.lng += c.center[0] * c.pop; x.lat += c.center[1] * c.pop;
    }
    return [...m.values()].map((x) => ({
      kind: 'city', name: x.name, province: x.province, count: x.count, pop: x.pop,
      center: [x.lng / x.pop, x.lat / x.pop],
      cur: { hazard: x.maxHazard, avgHazard: x.hazard / x.count, survival: x.survival / x.count, recommend: x.recommend / x.count, reach: x.reach / x.count },
      plan: null,
    }));
  }

  function rankList() {
    let list = state.rankLevel === 'city' ? cityRows() : counties.slice();
    if (state.rankProvince) list = list.filter((c) => c.province === state.rankProvince);
    if (state.rankQuery) {
      const q = state.rankQuery.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.city || '').toLowerCase().includes(q) || c.province.toLowerCase().includes(q));
    }
    const [key, dir] = state.rankSort.split('-');
    const dirN = dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (key === 'name') return a.name.localeCompare(b.name, 'zh-CN') * dirN;
      const av = key === 'reach' ? a.cur.reach : key === 'recommend' ? a.cur.recommend : key === 'survival' ? a.cur.survival : a.cur.hazard;
      const bv = key === 'reach' ? b.cur.reach : key === 'recommend' ? b.cur.recommend : key === 'survival' ? b.cur.survival : b.cur.hazard;
      return (av - bv) * dirN;
    });
    return list;
  }

  function renderRank() {
    const list = rankList();
    const isCity = state.rankLevel === 'city';
    $('#rank-title').textContent = isCity ? '华东城市风险总表' : '华东县级风险总表';
    $('#th-name').textContent = isCity ? '城市' : '区县';
    $('#th-city').textContent = isCity ? '省份' : '城市';
    $('#th-hazard').textContent = isCity ? '危险度(最高)' : '危险度';
    $('#rank-body').innerHTML = list.map((c, i) => {
      const plan = !isCity && c.plan && c.plan.primary ? c.plan.primary.name : (isCity ? '点击查看' : '—');
      const grade = isCity
        ? (c.cur.recommend >= 85 ? 'S' : c.cur.recommend >= 75 ? 'A' : c.cur.recommend >= 65 ? 'B' : c.cur.recommend >= 50 ? 'C' : 'D')
        : c.cur.grade;
      const nameSub = isCity ? `${c.count} 区县` : c.province.replace('省', '').replace('市', '');
      const cityCell = isCity ? c.province : c.city;
      const attr = isCity ? `data-city="${esc(c.name)}"` : `data-code="${c.code}"`;
      return `<tr ${attr}>
        <td class="num" style="color:#61727a">${i + 1}</td>
        <td class="r-name">${esc(c.name)}<small>${esc(nameSub)}</small></td>
        <td style="color:#93a3a9">${esc(cityCell)}</td>
        <td class="num" style="color:${metricColor('hazard', c.cur.hazard)}">${fmt1(c.cur.hazard)}</td>
        <td class="num">${Math.round(c.cur.survival)}</td>
        <td class="num" style="color:${gradeColor(grade)}">${Math.round(c.cur.recommend)}</td>
        <td><span class="grade-badge" style="color:${gradeColor(grade)}">${grade}</span></td>
        <td style="color:#93a3a9">${esc(plan)}</td>
      </tr>`;
    }).join('');
    $('#rank-foot').innerHTML = `<span>显示 ${list.length} / ${isCity ? DATA.cities.length + ' 个城市' : counties.length + ' 个县级单元'} · ${esc((Risk.SCENARIOS[state.scenario] || {}).label || '')} · ${esc(wind().label)} · 主方案为基线，点击行查看当前重算</span><span>点击定位</span>`;
    $$('#rank-body tr').forEach((tr) => tr.addEventListener('click', () => {
      closeModal('modal-rank');
      if (tr.dataset.city) {
        const city = DATA.cities.find((x) => x.name === tr.dataset.city);
        if (city) { map.flyTo(ll(city.center), 8.2, { duration: 0.8 }); toast(`${city.name} · ${city.count} 个区县`); }
      } else {
        selectCounty(tr.dataset.code, { fly: true, fromOrigin: false });
      }
    }));
  }

  function exportCSV() {
    const list = rankList();
    const isCity = state.rankLevel === 'city';
    const cols = isCity
      ? ['name', 'province', 'counties', 'pop', 'hazard', 'survival', 'recommend', 'reach']
      : ['code', 'name', 'province', 'city', 'region', 'hazard', 'strike', 'fallout', 'secondary', 'survival', 'recommend', 'grade', 'reach', 'origin', 'originKm', 'originHours', 'plan', 'backup'];
    const rows = [cols.join(',')];
    for (const c of list) {
      const row = isCity
        ? [c.name, c.province, c.count, c.pop, c.cur.hazard, c.cur.survival, c.cur.recommend, c.cur.reach]
        : [
          c.code, c.name, c.province, c.city, c.region, c.cur.hazard, c.cur.strike, c.cur.fallout, c.cur.secondary,
          c.cur.survival, c.cur.recommend, c.cur.grade, c.cur.reach, state.origin.name, c.cur.originDist, c.cur.originHours,
          c.plan && c.plan.primary ? c.plan.primary.name : '', c.plan && c.plan.backup ? c.plan.backup.name : '',
        ];
      rows.push(row.map((v) => {
        const s = String(v == null ? '' : v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','));
    }
    const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `华东${isCity ? '城市' : '县级'}风险_${state.scenario}_${state.season}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`已导出 ${list.length} 条记录`);
  }

  /* ---------- 模态 / 提示 ---------- */
  function openModal(id) { const m = document.getElementById(id); if (m) m.hidden = false; }
  function closeModal(id) { const m = document.getElementById(id); if (m) m.hidden = true; }

  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function locateMe() {
    if (!navigator.geolocation) { toast('浏览器不支持定位，请手动选择出发地。'); return; }
    toast('正在定位…');
    navigator.geolocation.getCurrentPosition((pos) => {
      const pt = [pos.coords.longitude, pos.coords.latitude];
      let best = counties[0], bd = Infinity;
      for (const c of counties) { const d = Risk.haversine(pt, c.center); if (d < bd) { bd = d; best = c; } }
      state.origin = { name: '我的位置', center: pt };
      moveOriginMarker();
      computeReach();
      updateOriginHint();
      renderOriginTop();
      restyleAll();
      if (state.selected) renderDetail(byCode[state.selected]);
      map.flyTo(ll(pt), 8, { duration: 0.8 });
      toast(`已定位，最近县城：${best.name}（约 ${Math.round(bd)} km）`);
    }, () => toast('定位失败或被拒绝。请手动选择出发地。'), { timeout: 8000 });
  }

  function closeLeftPanel() { $('#left-panel').classList.remove('open'); }

  /* ---------- 启动 ---------- */
  function boot() {
    document.getElementById('app').hidden = false;
    if (window.innerWidth <= 900) {
      const c = $('#btn-left-collapse');
      if (c) { c.textContent = '✕'; c.title = '关闭面板'; }
    }
    computeAll();
    initMap();
    buildSearchIndex();
    bindUI();
    $$('.scenario-switch button').forEach((b) => b.classList.toggle('active', b.dataset.scenario === state.scenario));
    $('#season-select').value = state.season;
    $('#metric-select').value = state.metric;
    updateSwitchGlow();
    renderAll();
    updateOriginHint();
    resetView();
    const qz = Number(QP.get('zoom'));
    if (Number.isFinite(qz) && qz >= 5 && qz <= 12) {
      map.setView([Number(QP.get('lat')) || 30.5, Number(QP.get('lng')) || 119.5], qz, { animate: false });
    }
    const qc = QP.get('county');
    if (qc) {
      const c = counties.find((x) => x.code === qc || x.name === qc);
      if (c) setTimeout(() => selectCounty(c.code, { fly: true, fromOrigin: false }), 420);
    }
    setTimeout(() => {
      document.getElementById('boot').classList.add('gone');
      setTimeout(() => { const b = document.getElementById('boot'); if (b) b.style.display = 'none'; }, 700);
    }, 320);
    console.info('[atlas] ready', DATA.meta.countyCount, 'counties');
    window.__atlas = { state, counties, byCode, DATA, map, routeGroup, countyLayer, selectCounty, computeAll, buildPlan };
  }

  try { boot(); } catch (err) {
    console.error(err);
    document.getElementById('boot').innerHTML = `<div style="color:#ff8a8a;font:13px/1.6 sans-serif;max-width:520px;text-align:center">初始化失败：${esc(err.message)}<br>请用本地 HTTP 服务打开，或检查 data/database.js。</div>`;
  }
})();
