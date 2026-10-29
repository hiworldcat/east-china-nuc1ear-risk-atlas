/* 华东核战风险桌面推演 —— 共享评分模型
 * 同时供 Node 构建脚本与浏览器前端使用（UMD）。
 * 所有参数均为公开资料上的分析假设，不是情报结论。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RiskModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const R = 6371.0088;
  const RAD = Math.PI / 180;

  const WIND = {
    winter: { from: 315, to: 135, label: '冬季 · 西北风', short: '西北风', desc: '沉降主轴向东南，压向苏南、上海、浙北' },
    summer: { from: 135, to: 315, label: '夏季 · 东南风', short: '东南风', desc: '沉降主轴向西北，压向苏锡常、南京方向' },
    shoulder: { from: 45, to: 225, label: '春秋 · 东北风', short: '东北风', desc: '沉降主轴向西南，压向青浦、嘉兴、湖州' },
  };

  const SCENARIOS = {
    full: {
      key: 'full', label: '全面核交换', short: '全面',
      desc: '所有战略、军事、港口、工业与水利节点均可能被打击。',
      types: null, noBlast: false,
      typeFactor: {},
    },
    limited: {
      key: 'limited', label: '有限打击', short: '有限',
      desc: '只打击核设施、军港、指挥枢纽、机场、港口、铁路、钢铁与重点化工等硬目标。',
      types: ['nuclear', 'naval', 'command', 'airbase', 'port', 'rail', 'steel', 'chem', 'factory'],
      noBlast: false,
      typeFactor: { airbase: 0.55, port: 0.8, rail: 0.7, steel: 0.7, chem: 0.7, factory: 0.45 },
    },
    edge: {
      key: 'edge', label: '边缘波及', short: '波及',
      desc: '假定主要爆心在邻近区域，只计算放射性沉降、化工与水利次生灾害。',
      types: ['nuclear', 'petrochem', 'chem', 'dam'],
      noBlast: true,
      typeFactor: {},
    },
  };

  const TYPE_WEIGHT = {
    nuclear: 1.0, naval: 0.95, command: 1.0, airbase: 0.78, port: 0.82,
    steel: 0.62, petrochem: 0.72, chem: 0.62, factory: 0.5, dam: 0.45, rail: 0.5, industry: 0.48,
  };

  function toRad(d) { return d * RAD; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function haversine(a, b) {
    const [lng1, lat1] = a, [lng2, lat2] = b;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function bearing(a, b) {
    const [lng1, lat1] = a, [lng2, lat2] = b;
    const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lng2 - lng1);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }

  function angularDiff(a, b) {
    let d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  function severityRadii(yieldKt) {
    const s = Math.cbrt((yieldKt || 150) / 150);
    return { severe: 4.2 * s, light: 11.0 * s };
  }

  function blastKernel(dist, radii) {
    if (dist <= radii.severe) return 1;
    if (dist <= radii.light) return 0.85 - 0.35 * (dist - radii.severe) / (radii.light - radii.severe);
    return 0.5 * Math.exp(-(dist - radii.light) / 38);
  }

  function falloutAt(dist, brg, target, windTo) {
    const x = dist * Math.cos(toRad(brg - windTo));
    const y = Math.abs(dist * Math.sin(toRad(brg - windTo)));
    const width = 9 + 0.11 * Math.max(0, x);
    let along;
    if (x >= 0) along = Math.exp(-x / 140);
    else along = Math.exp(x / 16);
    const cross = Math.exp(-((y / width) ** 2));
    let f = along * cross;
    if (dist < 28) f = Math.max(f, 0.9 * Math.exp(-dist / 12));
    const typeFallout = (target.type && target.typeFallout != null) ? target.typeFallout : 0.6;
    return 100 * f * (target.weight || 0.6) * typeFallout;
  }

  function secondaryAt(dist, target) {
    const w = target.weight || 0.6;
    switch (target.type) {
      case 'petrochem': return 48 * w * Math.exp(-dist / 9);
      case 'chem': return 42 * w * Math.exp(-dist / 10);
      case 'nuclear': return 34 * w * Math.exp(-dist / 18);
      case 'dam': return 34 * w * Math.exp(-dist / 16);
      case 'port': case 'steel': return 18 * w * Math.exp(-dist / 7);
      case 'factory': return 13 * w * Math.exp(-dist / 6);
      case 'rail': return 11 * w * Math.exp(-dist / 5);
      default: return 7 * w * Math.exp(-dist / 6);
    }
  }

  function activeTargets(targets, scenarioKey) {
    const sc = SCENARIOS[scenarioKey] || SCENARIOS.full;
    return targets.filter((t) => !sc.types || sc.types.includes(t.type)).map((t) => {
      const factor = sc.typeFactor[t.type] != null ? sc.typeFactor[t.type] : 1;
      return { ...t, _factor: factor };
    });
  }

  function computeForSeason(center, targets, scenarioKey, seasonKey) {
    const sc = SCENARIOS[scenarioKey] || SCENARIOS.full;
    const wind = WIND[seasonKey] || WIND.winter;
    const list = activeTargets(targets, scenarioKey);
    const per = [];
    let maxStrike = 0, sumStrike = 0, maxFall = 0, sumFall = 0, maxSec = 0, sumSec = 0;

    for (const t of list) {
      const dist = haversine(center, [t.lng, t.lat]);
      if (dist > 620) continue;
      const radii = severityRadii(t.yieldKt);
      const brg = bearing([t.lng, t.lat], center);
      const blast = sc.noBlast ? 0 : 100 * blastKernel(dist, radii) * (t.weight || 0.6) * TYPE_WEIGHT[t.type] * t._factor;
      const fall = falloutAt(dist, brg, t, wind.to);
      const sec = sc.noBlast ? secondaryAt(dist, t) * (t.type === 'nuclear' || t.type === 'petrochem' || t.type === 'chem' || t.type === 'dam' ? 1.15 : 0.2) : secondaryAt(dist, t);

      if (blast > maxStrike) { sumStrike += maxStrike; maxStrike = blast; } else sumStrike += blast;
      if (fall > maxFall) { sumFall += maxFall; maxFall = fall; } else sumFall += fall;
      if (sec > maxSec) { sumSec += maxSec; maxSec = sec; } else sumSec += sec;

      if (blast + fall + sec > 0.5) {
        per.push({ id: t.id, name: t.name, short: t.short, type: t.type, dist, blast, fallout: fall, secondary: sec, total: 0.54 * blast + 0.32 * fall + 0.14 * sec });
      }
    }

    const strike = clamp(maxStrike * 0.85 + sumStrike * 0.10, 0, 100);
    const fallout = clamp(maxFall * 0.72 + sumFall * 0.15, 0, 100);
    const secondary = clamp(maxSec * 0.70 + sumSec * 0.18, 0, 100);
    const raw = 0.54 * strike + 0.32 * fallout + 0.14 * secondary;
    const hazard = 100 * (1 - Math.exp(-raw / 45));
    per.sort((a, b) => b.total - a.total);

    return {
      hazard: round1(hazard), strike: round1(strike), fallout: round1(fallout), secondary: round1(secondary), raw: round1(raw),
      top: per.slice(0, 8).map((p) => ({ ...p, dist: round1(p.dist), blast: round1(p.blast), fallout: round1(p.fallout), secondary: round1(p.secondary), total: round1(p.total) })),
    };
  }

  function compute(center, targets, opts) {
    const scenario = (opts && opts.scenario) || 'full';
    const season = (opts && opts.season) || 'winter';
    const main = computeForSeason(center, targets, scenario, season);
    const seasonal = {};
    for (const k of Object.keys(WIND)) seasonal[k] = computeForSeason(center, targets, scenario, k).hazard;
    return { ...main, scenario, season, seasonal };
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  function prepareField(targets, scenarioKey) {
    return activeTargets(targets, scenarioKey);
  }

  function fieldAt(list, point, seasonKey) {
    const wind = WIND[seasonKey] || WIND.winter;
    let maxF = 0, sumF = 0;
    for (const t of list) {
      const dist = haversine(point, [t.lng, t.lat]);
      if (dist > 620) continue;
      const brg = bearing([t.lng, t.lat], point);
      const f = falloutAt(dist, brg, t, wind.to);
      if (f > maxF) { sumF += maxF; maxF = f; } else sumF += f;
    }
    return clamp(maxF * 0.72 + sumF * 0.12, 0, 100);
  }

  function falloutField(point, targets, scenarioKey, seasonKey) {
    return { value: fieldAt(prepareField(targets, scenarioKey), point, seasonKey) };
  }

  return { compute, computeForSeason, falloutField, fieldAt, prepareField, haversine, bearing, angularDiff, severityRadii, WIND, SCENARIOS, TYPE_WEIGHT, round1 };
});
