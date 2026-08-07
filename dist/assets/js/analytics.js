/* 前端埋点（阶段1 W6 灰度 / 阶段3 校准前置）
 * V1：事件先落 localStorage（exam_events），阶段3 接 CloudBase diagnoses 集合后改为上报。
 * 教师拍区间(teacher_estimate) 也经此采集，供阶段3 与规则 P 做数据比对。
 */
(function (global) {
  'use strict';
  var KEY = 'exam_events';
  var EVENTS = {
    DIAGNOSE_START: 'diagnose_start',
    ANSWER: 'answer',
    SUBMIT: 'diagnose_submit',
    VIEW_REPORT: 'view_report',
    TEACHER_ESTIMATE: 'teacher_estimate',
    MEMBER_CTA: 'member_cta'
  };
  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function track(event, payload) {
    var rec = { event: event, ts: Date.now(), payload: payload || {} };
    var arr = read();
    arr.push(rec);
    if (arr.length > 500) arr = arr.slice(-500);
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
    // TODO(阶段3): 上报到 CloudBase diagnoses / teacher_estimates 集合
    return rec;
  }
  function drain() { var a = read(); try { localStorage.removeItem(KEY); } catch (e) {} return a; }
  var API = { EVENTS: EVENTS, track: track, drain: drain, read: read };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Analytics = API;
})(typeof window !== 'undefined' ? window : this);
