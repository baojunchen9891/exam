/* 免费能力诊断流程（阶段1 W4）
 * 抽 30–35 题（默认 32）→ 答题 → 规则引擎算 P → 报告 + 会员钩子 + 教师拍区间采集。
 * 依赖：EXAM(common.js) / RuleProb(rule_prob.js) / Report(report.js) / Membership / Analytics。
 * 未登录也可用（免费诊断是获客钩子）；结果可登录后云同步（阶段4）。
 *
 * 说明：V1 阶段0 标注未回填时 kp_weight.json 为空，init 会检测并拦截进入虚假诊断
 * （未标注 → mastery 全空 → P 恒为最低值 0.05，属欺骗性结果，不能上线）。
 * 阶段0 标注完成、kp_weight.json 就绪后，本页无需改代码即自动解锁（入口守卫放行）。
 */
(function () {
  'use strict';
  var E = EXAM, R = window.RuleProb, $ = E.qs, qsa = E.qsa;
  if (!E || !R) { console.error('依赖未加载: EXAM / RuleProb'); return; }
  E.renderNav('diagnose');

  var CFG = { level: 4, count: 32, passLine: 0.6 };
  var PAPERS = [], QBANK = [], SELECTED = [], ANSWERS = {}, CUR = 0, DONE = false, KPNAMES = {};

  function akey(it) { return it.paperId + '#' + it.no; }

  // 抽题：按 paper 轮询保证各卷/各级均衡；kpCoverage 缺失时即"随机均衡"
  // （阶段0 标注回填、kp_weight 就绪后，可在此替换为"考点覆盖均衡"抽样）
  function selectQuestions(bank, n) {
    var byPaper = {};
    bank.forEach(function (it) { (byPaper[it.paperId] = byPaper[it.paperId] || []).push(it); });
    var ids = Object.keys(byPaper);
    var pools = ids.map(function (id) { return byPaper[id].slice(); });
    var out = [], ri = 0;
    while (out.length < n && pools.some(function (p) { return p.length; })) {
      var p = pools[ri % pools.length];
      if (p.length) out.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]);
      ri++;
    }
    while (out.length < n && bank.length) out.push(bank[Math.floor(Math.random() * bank.length)]);
    return out.slice(0, n);
  }

  async function loadBank() {
    var idx = await E.loadJSON('data/index.json');
    PAPERS = idx.filter(function (d) { return d.subject === 'gesp-cpp'; });
    var loaded = await Promise.all(PAPERS.map(function (p) {
      return E.loadJSON('data/papers/' + p.id + '.json')
        .then(function (j) { return { meta: p, json: j }; })
        .catch(function () { return null; });
    }));
    QBANK = [];
    loaded.forEach(function (o) {
      if (!o) return;
      (o.json.questions || []).forEach(function (q) {
        QBANK.push({
          paperId: o.meta.id, level: o.meta.level, no: q.no, q: q,
          kpIds: q.kp_ids || [], primaryKp: q.primary_kp || null
        });
      });
    });
    try {
      // 全 8 级考点名映射（阶段2：诊断范围扩至 L1–L8）
      for (var lv = 1; lv <= 8; lv++) {
        var d = await E.loadJSON('data/kp/gesp-cpp-L' + lv + '.json');
        (d.kp || []).forEach(function (k) { KPNAMES[k.id] = k.name; });
      }
    } catch (e) { /* 名称缺失不影响诊断 */ }
  }

  // 级别选择器（L1–L8，默认 CFG.level），切换即更新高亮，下次开始诊断生效
  function renderLevelSel() {
    var box = document.getElementById('levelSel');
    if (!box) return;
    var html = '<span class="ls-label">诊断级别</span><div class="ls-chips">';
    for (var lv = 1; lv <= 8; lv++) {
      html += '<button class="ls-chip' + (lv === CFG.level ? ' on' : '') + '" data-lv="' + lv + '">L' + lv + '</button>';
    }
    html += '</div>';
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll('.ls-chip'), function (c) {
      c.onclick = function () {
        CFG.level = +c.dataset.lv;
        Array.prototype.forEach.call(box.querySelectorAll('.ls-chip'), function (x) { x.classList.remove('on'); });
        c.classList.add('on');
      };
    });
  }

  function gradeOne(it) {
    var q = it.q;
    if (!q.auto) return null; // 编程/操作题不计
    var sel = ANSWERS[akey(it)];
    var right = Array.isArray(q.answer) ? q.answer.slice().sort().join('') : q.answer;
    var got = Array.isArray(sel) ? sel.slice().sort().join('') : (sel || '');
    return got === right;
  }

  function renderQnav() {
    var qnav = $('#qnav');
    if (!qnav) return;
    qnav.innerHTML = SELECTED.map(function (it, i) {
      var v = ANSWERS[akey(it)];
      var done = v !== undefined && (Array.isArray(v) ? v.length : v);
      var cur = i === CUR ? ' cur' : '';
      var d = done ? ' done' : '';
      return '<span class="qn' + cur + d + '" data-i="' + i + '">' + (i + 1) + '</span>';
    }).join('');
    qsa('#qnav .qn').forEach(function (n) { n.onclick = function () { CUR = +n.dataset.i; renderCurrent(); renderQnav(); }; });
  }

  function renderCurrent() {
    var it = SELECTED[CUR];
    if (!it) return;
    // 传入 seq = CUR+1，与顶部进度条/导航保持一致（不沿用 q.no，避免原卷题型分块重复导致跳号）
    $('#examArea').innerHTML = E.renderQuestion(it.q, { mode: 'exam', paperId: it.paperId, selected: ANSWERS[akey(it)], seq: CUR + 1 });
    qsa('#examArea [data-pick]').forEach(function (el) {
      el.onclick = function () {
        var key = el.dataset.key, multi = el.dataset.pick === 'multi';
        var curVal = ANSWERS[akey(it)];
        if (multi) {
          var arr = Array.isArray(curVal) ? curVal.slice() : [];
          var ix = arr.indexOf(key);
          if (ix >= 0) arr.splice(ix, 1); else arr.push(key);
          ANSWERS[akey(it)] = arr.sort();
        } else {
          ANSWERS[akey(it)] = key;
        }
        renderCurrent(); renderQnav();
      };
    });
    var curNo = $('#curNo');
    if (curNo) curNo.textContent = '第 ' + (CUR + 1) + ' / ' + SELECTED.length + ' 题';
  }

  function bind() {
    $('#prevBtn').onclick = function () { if (CUR > 0) { CUR--; renderQnav(); renderCurrent(); } };
    $('#nextBtn').onclick = function () { if (CUR < SELECTED.length - 1) { CUR++; renderQnav(); renderCurrent(); } };
    $('#submitBtn').onclick = submit;
    var sb = $('#startBtn');
    if (sb) sb.onclick = async function () {
      // 兜底：若数据尚未就绪（用户抢点），先等待题库加载完成再开始，避免 SELECTED 为空导致题目加载失败
      if (!QBANK.length) {
        try { await loadBank(); } catch (e) { E.toast('题库加载失败: ' + e.message); return; }
      }
      if (!QBANK.length) { E.toast('题库尚未就绪，请稍后重试'); return; }
      $('#intro').style.display = 'none'; $('#quiz').style.display = 'block'; start();
    };
  }

  async function submit() {
    if (DONE) return;
    var unanswered = SELECTED.filter(function (it) {
      var v = ANSWERS[akey(it)];
      return v === undefined || (Array.isArray(v) && !v.length);
    }).length;
    if (unanswered > 0 && !confirm('还有 ' + unanswered + ' 题未作答，确定交卷？')) return;

    DONE = true;
    var ans = SELECTED.map(function (it) { return { kpIds: it.kpIds, primaryKp: it.primaryKp, correct: gradeOne(it) }; });
    var weights = await R.loadWeights('data/kp_weight.json');
    var mastery = R.computeMastery(ans);
    var pr = R.computePassProbability(mastery, weights, { passLine: CFG.passLine });
    var t = R.tier(pr.P);
    var weak = R.weakKps(mastery, weights, { top: 5 });
    var levelMix = {};
    SELECTED.forEach(function (it) { levelMix[it.level] = (levelMix[it.level] || 0) + 1; });
    var result = {
      P: pr.P, tier: t, mastery: mastery, weak: weak, level: CFG.level,
      expectedScore: pr.expectedScore, passLine: pr.passLine,
      counts: { total: SELECTED.length, levelMix: levelMix },
      teacherEstimate: { low: null, high: null },
      timestamp: Date.now()
    };
    $('#quiz').style.display = 'none';
    $('#reportWrap').style.display = 'block';
    if (window.Report) window.Report.render(result, $('#report'), { nameMap: KPNAMES });
    renderTeacherEstimate(result);
    if (window.Analytics) window.Analytics.track(window.Analytics.EVENTS.SUBMIT, { P: pr.P, tier: t.key, total: SELECTED.length, levelMix: levelMix });
  }

  // 课程体系入口（替代原教师拍区间采集，V2 改为引导至课程体系详情）
  function renderTeacherEstimate(result) {
    var box = $('#teacherEstimate');
    if (!box) return;
    box.innerHTML =
      '<div class="te-h">📚 GESP / 信奥赛 课程体系</div>' +
      '<p class="te-desc">从编程启蒙到 NOI 国赛，一套完整的 C++ 信奥赛学习路径。了解各阶段知识点、推荐刷题量与备考节奏。</p>' +
      '<div class="te-btns">' +
        '<a href="curriculum.html" class="te-btn te-btn-primary">了解 GESP 课程体系</a>' +
        '<a href="kp-practice-list.html" class="te-btn">阶段·知识点·真题清单</a>' +
        '<a href="schedule.html" class="te-btn">分起点学习课表</a>' +
      '</div>';
  }

  function start() {
    SELECTED = selectQuestions(QBANK.filter(function (it) { return it.level === CFG.level; }), CFG.count);
    CUR = 0; DONE = false; ANSWERS = {};
    if (!SELECTED.length) { E.toast('所选级别暂无可抽题目，请尝试其他级别'); return; }
    renderQnav(); renderCurrent();
  }

  function showComingSoon() {
    var intro = document.getElementById('intro');
    var btn = document.getElementById('startBtn');
    if (btn) { btn.disabled = true; btn.textContent = '考点标注中 · 敬请期待'; btn.style.opacity = '.55'; btn.style.cursor = 'not-allowed'; }
    if (!intro) return;
    var tip = document.createElement('div');
    tip.className = 'diag-comingsoon';
    tip.innerHTML = '<i data-lucide="alert-triangle"></i> 免费诊断内测中：GESP C++ 全 8 级真题考点标注已完成，已开放一至八级诊断。';
    intro.appendChild(tip);
  }

  async function init() {
    bind();
    renderLevelSel();
    // 数据未就绪前禁用"开始免费诊断"按钮，避免用户抢点导致 SELECTED 为空、题目加载失败
    var sb = $('#startBtn');
    function lockStart(loading) {
      if (!sb) return;
      sb.disabled = !!loading;
      sb.textContent = loading ? '题库加载中…' : '开始免费诊断';
      sb.style.opacity = loading ? '.6' : '';
      sb.style.cursor = loading ? 'wait' : '';
    }
    lockStart(true);
    try {
      await loadBank();
      if (!QBANK.length) { E.toast('未加载到 GESP C++ 真题，请稍后重试'); lockStart(false); return; }
      // 入口守卫：阶段0 标注未回填（kp_weight 为空）时，禁止进入虚假诊断
      var weights = await R.loadWeights('data/kp_weight.json');
      if (!weights || !Object.keys(weights).length) { showComingSoon(); return; }
      // 兜底：data/kp 分级文件缺失时，用 kp_weight.json 的 name 字段填充考点名映射，保证报告可读
      if (!Object.keys(KPNAMES).length) {
        Object.keys(weights).forEach(function (k) { if (weights[k] && weights[k].name) KPNAMES[k] = weights[k].name; });
      }
      lockStart(false);
      if (window.Analytics) window.Analytics.track(window.Analytics.EVENTS.DIAGNOSE_START, { bank: QBANK.length });
    } catch (e) { E.toast('加载失败: ' + e.message); lockStart(false); }
  }

  init();
})();
