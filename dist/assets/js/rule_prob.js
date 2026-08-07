/* 规则引擎 V1：能力掌握度 -> 通过概率 P（均匀权重兜底）
 * --------------------------------------------------------------------------
 * 公式（PRD v1.1 §3.1 / §5.2）：
 *   mastery_k = 学生对考点 k 的掌握度(0..1)
 *   expectedScore = Σ( w_k × mastery_k ) / Σ(w_k)  // 权重要按本次被测考点集合重新归一
 *   P = clamp(expectedScore / passLine, 0.05, 0.98)
 *   说明：kp_weight.json 的 ratio 按考试前缀(cpp4/cpp5)各自归一、且抽样只覆盖
 *   部分考点，故全局和≠1；这里以"被测考点权重和"为基准归一，保证 expectedScore∈[0,1]。
 * 档位：<0.4 高 / 0.4–0.65 中 / 0.65–0.85 较稳 / >0.85 稳过
 *
 * 依赖真实 kp_weight.json（阶段0 标注回填后由 kp_stats.py 生成）。
 * 当 kp_weight 缺失/为空时回退"均匀权重"（1/N，N=本题涉及的不同考点数），
 * 保证阶段1 前端在未拿到真实标注数据时也能跑通诊断闭环（阶段3 再校准）。
 *
 * 一题多考点（决策 Q2）：正确性权重在 kp_ids 间分配；primary_kp 可获
 * primaryBoost× 权重，其余考点补平，保证单题总权重恒为 1。
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    passLine: 0.6,      // GESP 及格线 60/100；阶段3 校准可下调
    clampMin: 0.05,
    clampMax: 0.98,
    primaryBoost: 1.5,  // 主考点加权倍数（Q2）
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // 由答题结果计算各考点掌握度
  // answers: [{ kpIds:[...], primaryKp, correct:bool }]
  function computeMastery(answers, opts) {
    opts = opts || {};
    const primaryBoost = opts.primaryBoost != null ? opts.primaryBoost : DEFAULTS.primaryBoost;
    const acc = {}; // kp -> { hit, total }
    (answers || []).forEach(function (a) {
      const kps = a.kpIds || [];
      if (!kps.length) return;
      const n = kps.length;
      const correct = a.correct ? 1 : 0;
      let primary = null;
      if (a.primaryKp && kps.indexOf(a.primaryKp) >= 0) primary = a.primaryKp;

      let primaryShare = 0, otherShare = 0;
      if (primary) {
        const boost = Math.min(primaryBoost, n);
        primaryShare = boost / n;                                  // 主考点份额
        otherShare = (n - boost) / (n * (n - 1));                   // 其余每 kp 份额（总权重=1）
      } else {
        otherShare = 1 / n;                                         // 均分
      }

      kps.forEach(function (kp) {
        if (!acc[kp]) acc[kp] = { hit: 0, total: 0 };
        const share = (primary && kp === primary) ? primaryShare : otherShare;
        acc[kp].hit += correct * share;
        acc[kp].total += share;
      });
    });

    const mastery = {};
    Object.keys(acc).forEach(function (kp) {
      mastery[kp] = acc[kp].total > 0 ? acc[kp].hit / acc[kp].total : 0;
    });
    return mastery;
  }

  // 取某 kp 的权重（兼容 {ratio} 嵌套或裸 number）
  function _weightOf(weights, k) {
    const w = weights[k];
    if (w == null) return 0;
    if (typeof w === 'number') return w;
    if (w && typeof w.ratio === 'number') return w.ratio;
    return 0;
  }

  // 计算通过概率 P
  // mastery: { kp -> 0..1 }；kpWeight: { kp -> ratio | {ratio,...} } 或 {}
  function computePassProbability(mastery, kpWeight, opts) {
    opts = opts || {};
    const passLine = opts.passLine != null ? opts.passLine : DEFAULTS.passLine;
    const clampMin = opts.clampMin != null ? opts.clampMin : DEFAULTS.clampMin;
    const clampMax = opts.clampMax != null ? opts.clampMax : DEFAULTS.clampMax;

    let weights = kpWeight;
    if (!weights || !Object.keys(weights).length) {
      // 均匀权重兜底：未拿到真实标注时，本题涉及考点平分
      const kps = Object.keys(mastery || {});
      const unif = kps.length ? 1 / kps.length : 0;
      weights = {};
      kps.forEach(function (k) { weights[k] = unif; });
    }

    // 权重要按"本次被测考点"重新归一：kp_weight.json 按考试前缀各自归一
    // （cpp4 合计=1、cpp5 合计=1），混合多级诊断时全局和≠1；且一次抽样只
    // 覆盖部分考点。以被测考点权重和为基准归一，保证 expectedScore ∈ [0,1]，
    // P 曲线合理（否则会普遍虚高恒为稳过）。
    const kps = Object.keys(mastery || {});
    let wsum = 0;
    kps.forEach(function (k) { wsum += _weightOf(weights, k); });
    const norm = wsum > 0 ? 1 / wsum : 0;

    let expected = 0;
    kps.forEach(function (k) {
      const w = _weightOf(weights, k);
      const m = mastery[k] != null ? mastery[k] : 0;
      expected += norm * w * m;
    });

    const P = clamp(expected / passLine, clampMin, clampMax);
    return { P: P, expectedScore: expected, passLine: passLine };
  }

  // 档位判定
  function tier(P) {
    if (P < 0.4) return { key: 'high', label: '通过风险高', color: 'var(--color-danger)', advice: '建议先系统补弱，再考虑报考' };
    if (P < 0.65) return { key: 'mid', label: '中等', color: 'var(--color-yellow-500)', advice: '有希望，针对性补弱可明显提升' };
    if (P < 0.85) return { key: 'stable', label: '较稳', color: 'var(--color-success)', advice: '基础较扎实，冲刺高分' };
    return { key: 'safe', label: '稳过', color: 'var(--color-success)', advice: '保持手感即可' };
  }

  // 薄弱考点 TopN：大权重 × 低掌握 优先（= 对通过概率拖累最大）
  function weakKps(mastery, kpWeight, opts) {
    opts = opts || {};
    const top = opts.top || 5;
    const list = [];
    Object.keys(mastery || {}).forEach(function (k) {
      const w = _weightOf(kpWeight || {}, k);
      const m = mastery[k];
      list.push({ kp: k, mastery: m, ratio: w, drag: w * (1 - m) });
    });
    list.sort(function (a, b) { return b.drag - a.drag; });
    return list.slice(0, top);
  }

  // 浏览器端异步加载 kp_weight.json（失败返回 {} 触发均匀兜底）
  function loadWeights(url) {
    url = url || 'data/kp_weight.json';
    if (typeof fetch !== 'function') return Promise.resolve({});
    return fetch(url).then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; });
  }

  const API = {
    DEFAULTS: DEFAULTS,
    clamp: clamp,
    computeMastery: computeMastery,
    computePassProbability: computePassProbability,
    tier: tier,
    weakKps: weakKps,
    loadWeights: loadWeights,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.RuleProb = API;
})(typeof window !== 'undefined' ? window : this);
