/* 会员脚手架（阶段4 变现，阶段1 仅搭展示 + CTA）
 * 定价档位来自 PRD v1.1 定价参考档（已评审沿用）。
 * 合规边界：站内仅会员订阅（小额）；大额/小班课走企微，不在站内闭环支付。
 * V1：isMember 一律 false（会员体系阶段4 落地）；CTA 仅展示档位 + 引导。
 */
(function (global) {
  'use strict';
  var PRICING = [
    { id: 'free', name: '免费体验', price: 0, period: '', tag: '试用', desc: '免费诊断 1 次 + 基础报告', highlight: false },
    { id: 'month', name: '月度会员', price: 39, period: '/月', tag: '灵活', desc: '全考点诊断不限次 + 补弱路径', highlight: false },
    { id: 'quarter', name: '季度会员', price: 99, period: '/季', tag: '主力', desc: '对齐单级备考 8–12 周，最划算', highlight: true },
    { id: 'year', name: '年度会员', price: 299, period: '/年', tag: '省心', desc: '季×4=396 打 7.5 折', highlight: false },
    { id: 'sprint', name: '单级冲刺包', price: 149, period: '/级', tag: '锚定报名费', desc: '针对单级 1–2 月冲刺，约报名费 300 的 1/2', highlight: false }
  ];

  // V1：会员态判断（阶段4 接 CloudBase users 角色/到期字段）
  function isMember() { return false; }
  function currentTier() { return 'free'; }

  function renderCTA(container, opts) {
    opts = opts || {};
    if (!container) return;
    var cards = PRICING.map(function (p) {
      var priceHtml = p.price === 0
        ? '<div class="mprice">免费</div>'
        : '<div class="mprice">¥' + p.price + '<span>' + p.period + '</span></div>';
      return '<div class="mcard' + (p.highlight ? ' hot' : '') + '">' +
        '<div class="mtag">' + p.tag + '</div>' +
        '<div class="mname">' + p.name + '</div>' + priceHtml +
        '<div class="mdesc">' + p.desc + '</div>' +
        '<button class="mbtn" data-tier="' + p.id + '">' + (p.price === 0 ? '免费使用' : '去开通') + '</button>' +
        '</div>';
    }).join('');
    container.innerHTML = '<div class="mhead">会员方案</div><div class="mcards">' + cards + '</div>' +
      '<div class="mcompliance">站内仅支持会员订阅（小额）；大额 / 小班课请加企业微信，不在站内闭环支付。</div>';
    Array.prototype.forEach.call(container.querySelectorAll('.mbtn'), function (b) {
      b.onclick = function () {
        var tier = b.getAttribute('data-tier');
        if (window.Analytics) window.Analytics.track(window.Analytics.EVENTS.MEMBER_CTA, { tier: tier });
        if (tier === 'free') return;
        if (window.EXAM) window.EXAM.toast('会员开通开发中；大额 / 小班课请加企业微信');
      };
    });
  }

  var API = { PRICING: PRICING, isMember: isMember, currentTier: currentTier, renderCTA: renderCTA };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Membership = API;
})(typeof window !== 'undefined' ? window : this);
