/* 诊断报告渲染（阶段1）
 * 输入 result: { P, tier:{key,label,color,advice}, mastery, weak:[{kp,ratio,mastery,drag}], teacherEstimate }
 * 依赖 Membership.renderCTA 做转化钩子；kp 名称由传入的 nameMap 解析。
 */
(function (global) {
  'use strict';
  function pct(x) { return Math.round(x * 100) + '%'; }

  function render(result, container, opts) {
    opts = opts || {};
    if (!container) return;
    var t = result.tier;
    var weakHtml = (result.weak || []).map(function (w) {
      var name = (opts.nameMap && opts.nameMap[w.kp]) || w.kp;
      return '<li class="wk"><span class="wkname">' + name + '</span>' +
        '<span class="wkbar"><i style="width:' + pct(w.mastery) + '"></i></span>' +
        '<span class="wkval">' + pct(w.mastery) + '</span></li>';
    }).join('') || '<li class="wk none">暂无显著薄弱考点，基础较均衡</li>';

    container.innerHTML =
      '<div class="report-card">' +
        '<div class="r-gauge" style="--c:' + t.color + '">' +
          '<div class="r-p">' + pct(result.P) + '</div>' +
          '<div class="r-label" style="color:' + t.color + '">' + t.label + '</div>' +
          '<div class="r-sub">预估 GESP 该级别通过概率</div>' +
        '</div>' +
        '<div class="r-advice">' + t.advice + '</div>' +
        '<div class="r-sec"><div class="r-h">薄弱考点 Top ' + (result.weak || []).length +
          '（按对通过概率拖累排序）</div>' +
          '<ul class="wklist">' + weakHtml + '</ul></div>' +
        '<div class="r-note">规则版 V1（未含真实标注时按均匀权重估算），阶段3 用教师拍区间校准后更准。</div>' +
      '</div>';


    if (window.Analytics) window.Analytics.track(window.Analytics.EVENTS.VIEW_REPORT, { P: result.P, tier: t.key });
  }

  var API = { render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Report = API;
})(typeof window !== 'undefined' ? window : this);
