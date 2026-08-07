/* 真题考试通 H5 - CloudBase 云函数封装（examApi）
 * 把原 HTTP API 调用翻译为 examApi callFunction，保持 common.js 的 {code,data,message} 契约不变。
 * 依赖：assets/js/cloudbase.js（window.cloudbase）
 *
 * 调用策略（与原始 account.js 一致，并加自动重试）：
 *  1. 先直接 callFunction（CloudBase 体验版对同一 env 托管域名通常免登录）
 *  2. 若 SDK 报「需登录/未认证」，则自动匿名登录后重试一次
 *  3. 任何异常都把真实错误透出到 message，不再吞掉
 */
(function (global) {
  "use strict";

  var ENV = "kaoji-d2g92wlv34453fe55";
  var FN = "examApi";
  var TOKEN_KEY = "exam_token";     // access_token
  var REFRESH_KEY = "exam_refresh"; // refresh_token

  var app = null;
  var authPromise = null; // 匿名登录 Promise（惰性，仅首次需要时触发）

  function getApp() {
    if (app) return app;
    if (!global.cloudbase) throw new Error("cloudbase SDK 未加载");
    app = global.cloudbase.init({ env: ENV });
    return app;
  }

  // 惰性匿名登录（仅当 callFunction 报未认证时才调用）
  function ensureAnonLogin() {
    if (authPromise) return authPromise;
    try {
      authPromise = getApp().auth({ persistence: "local" })
        .anonymousAuthProvider()
        .signIn()
        .then(function () { return true; })
        .catch(function (e) {
          console.error("[ExamAPI] 匿名登录失败:", e && e.message || e);
          return false;
        });
    } catch (e) {
      authPromise = Promise.resolve(false);
    }
    return authPromise;
  }

  // 把 SDK 抛出的任何错误转成可读字符串
  function errText(e) {
    if (!e) return "未知错误";
    if (typeof e === "string") return e;
    if (e.message) return e.message;
    try { return JSON.stringify(e); } catch (_) { return String(e); }
  }

  // 调用 examApi 云函数；统一把 {code,message,data} 透传为前端契约
  function call(action, data) {
    function doCall() {
      return getApp().callFunction({ name: FN, data: Object.assign({ action: action }, data || {}) })
        .then(function (r) {
          var res = r && r.result;
          if (res && typeof res.code === "number") {
            return { code: res.code, data: res.data === undefined ? null : res.data, message: res.message || "" };
          }
          return { code: -1, data: res, message: (res && res.message) || "UNKNOWN_RESPONSE" };
        })
        .catch(function (e) {
          console.error("[ExamAPI] callFunction 异常:", action, errText(e));
          var msg = errText(e);
          // 关键词命中「未登录/未认证」→ 触发一次匿名登录后重试
          if (/未登录|未认证|not.?login|unauthorized|signin|auth/i.test(msg)) {
            return ensureAnonLogin().then(function (ok) {
              if (!ok) return { code: -1, data: null, message: "认证失败：" + msg };
              return getApp().callFunction({ name: FN, data: Object.assign({ action: action }, data || {}) })
                .then(function (r2) {
                  var res2 = r2 && r2.result;
                  if (res2 && typeof res2.code === "number") {
                    return { code: res2.code, data: res2.data === undefined ? null : res2.data, message: res2.message || "" };
                  }
                  return { code: -1, data: res2, message: (res2 && res2.message) || "UNKNOWN_RESPONSE" };
                })
                .catch(function (e2) { return { code: -1, data: null, message: errText(e2) }; });
            });
          }
          return { code: -1, data: null, message: msg };
        });
    }
    return doCall();
  }

  /* ---------- token 管理（与原 HTTP 版一致） ---------- */
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function getRefresh() { try { return localStorage.getItem(REFRESH_KEY) || ""; } catch (e) { return ""; } }
  function setRefresh(t) { try { localStorage.setItem(REFRESH_KEY, t); } catch (e) {} }
  function clearTokens() { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); } catch (e) {} }

  /* ---------- 返回形态适配 ---------- */
  function adaptLogin(d) {
    var u = d.data || {};
    return {
      code: d.code, message: d.message,
      data: {
        access_token: u.token, refresh_token: u.token,
        user: { username: u.name, role: u.role, status: u.status, force_reset_pwd: !!u.forceChangePw }
      }
    };
  }
  function adaptGetMe(d) {
    var u = d.data || {};
    return {
      code: d.code, message: d.message,
      data: { user: { username: u.name, role: u.role, status: u.status, force_reset_pwd: !!u.forceChangePw } }
    };
  }

  /* ---------- 学习数据：整文档 getStudy/saveStudy ↔ 逐条端点 ---------- */
  // 把任意形状的题目对象归一为 {paperId, no}（保留其余内容字段），与云端存储/渲染一致
  function normalizeStudyItem(x) {
    if (!x || typeof x !== "object") return x;
    var item = {};
    for (var k in x) { if (k !== "action" && k !== "paper_id" && k !== "question_id") item[k] = x[k]; }
    item.paperId = x.paperId || x.paper_id || "";
    item.no = (x.no != null ? x.no : x.question_id) || "";
    return item;
  }
  // 取题目唯一键（兼容 paperId/no 与 paper_id/question_id 两种写法）
  function studyItemKey(x) {
    var p = (x && (x.paperId || x.paper_id)) || "";
    var n = (x && (x.no != null ? x.no : x.question_id) != null) ? (x.no != null ? x.no : x.question_id) : "";
    return String(p) + " " + String(n);
  }
  function studyRoute(method, kind, body) {
    if (method === "GET") {
      return call("getStudy", { token: getToken() }).then(function (d) {
        if (d.code !== 0) return { code: d.code, data: [], message: d.message };
        var doc = d.data || {};
        return { code: 0, data: doc[kind] || [], message: "" };
      });
    }
    return call("getStudy", { token: getToken() }).then(function (d) {
      var doc = (d.code === 0 && d.data) || { progress: {}, wrong: [], fav: [], records: [] };
      var arr = (doc[kind] || []).slice();
      if (kind === "wrong") {
        var we = arr.find(function (x) { return studyItemKey(x) === studyItemKey(body); });
        if (!we) arr.unshift(normalizeStudyItem(body));
      } else if (kind === "fav") {
        var fi = arr.findIndex(function (x) { return studyItemKey(x) === studyItemKey(body); });
        if (body.action === "remove" && fi >= 0) arr.splice(fi, 1);
        else if (body.action !== "remove" && fi < 0) arr.unshift(normalizeStudyItem(body));
      } else if (kind === "records") {
        arr.unshift({
          id: "r" + Date.now(),
          paper_id: body.paper_id, score: body.score,
          total_questions: body.total_questions, correct_count: body.correct_count,
          duration_ms: body.duration_ms, submitted_at: body.submitted_at || new Date().toISOString()
        });
      }
      var patch = {}; patch[kind] = arr;
      return call("saveStudy", { token: getToken(), patch: patch }).then(function (s) {
        return { code: s.code, data: arr, message: s.message };
      });
    });
  }
  function progressRoute(method, body) {
    if (method === "GET") {
      return call("getStudy", { token: getToken() }).then(function (d) {
        return { code: d.code === 0 ? 0 : d.code, data: (d.data && d.data.progress) || {}, message: "" };
      });
    }
    return call("getStudy", { token: getToken() }).then(function (d) {
      var doc = (d.code === 0 && d.data) || { progress: {}, wrong: [], fav: [], records: [] };
      var prog = Object.assign({}, doc.progress || {}, body);
      return call("saveStudy", { token: getToken(), patch: { progress: prog } }).then(function (s) {
        return { code: s.code, data: prog, message: s.message };
      });
    });
  }

  /* ---------- REST 路径 → examApi action 路由 ---------- */
  function route(method, path, body) {
    switch (path) {
      case "/auth/register":
        return call("register", { name: body.username, pw: body.password, phone: body.phone })
          .then(function (d) { return { code: d.code, data: d.data, message: d.message }; });
      case "/auth/login":
        return call("login", { name: body.phone, pw: body.password }).then(adaptLogin);
      case "/auth/refresh":
        // CloudBase 令牌为 7 天长令牌，无需服务端刷新，直接复用
        return Promise.resolve({ code: 0, data: { access_token: getToken(), refresh_token: getToken() }, message: "ok" });
      case "/me":
        return call("getMe", { token: getToken() }).then(adaptGetMe);
      case "/me/password":
        return call("changePassword", { token: getToken(), oldPw: body.current_password, newPw: body.new_password })
          .then(function (d) { return { code: d.code, data: d.data, message: d.message }; });
      case "/auth/bind-phone":
        return call("bindPhone", { token: getToken(), phone: body.phone, smsCode: body.sms_code })
          .then(function (d) { return { code: d.code, data: d.data, message: d.message }; });
      case "/wrong-questions": return studyRoute(method, "wrong", body);
      case "/favorites": return studyRoute(method, "fav", body);
      case "/exam-records": return studyRoute(method, "records", body);
      case "/progress": return progressRoute(method, body);
      // ---------- 后台管理（body 已含 request() 注入的 token） ----------
      case "/admin/users":    return call("adminList", body);
      case "/admin/approve":  return call("approve", Object.assign({}, body, { name: body.name, status: body.status }));
      case "/admin/del":      return call("delUser", Object.assign({}, body, { name: body.name }));
      case "/admin/reset-pw": return call("resetPassword", Object.assign({}, body, { name: body.name }));
      case "/admin/stats":    return call("getStats", body);
      default:
        return Promise.resolve({ code: -1, data: null, message: "未知接口: " + path });
    }
  }

  function request(path, options) {
    options = options || {};
    var method = options.method || "GET";
    var body = options.body;
    // auth 注入：云函数通过 event.token 鉴别，这里统一带上当前令牌
    var tk = getToken();
    var data = Object.assign({}, body || {});
    if (options.auth !== false && tk) data.token = tk;
    return route(method, path, data);
  }

  function get(path, opts) { return request(path, Object.assign({}, opts, { method: "GET" })); }
  function post(path, body, opts) { return request(path, Object.assign({}, opts, { method: "POST", body: body })); }
  function put(path, body, opts) { return request(path, Object.assign({}, opts, { method: "PUT", body: body })); }

  // 兼容旧 refresh 逻辑（长令牌直接复用）
  function refreshOnce() { return Promise.resolve(getToken()); }

  global.ExamAPI = {
    BASE: "", // CloudBase 云函数模式不再走 HTTP BASE
    request: request, get: get, post: post, put: put,
    getToken: getToken, setToken: setToken,
    getRefresh: getRefresh, setRefresh: setRefresh,
    clearTokens: clearTokens, refreshOnce: refreshOnce
  };

  // 图标渲染引导（所有页面统一渲染 Lucide 图标，无需各自调用）
  function renderIcons() { try { if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); } catch (e) {} }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderIcons);
  } else {
    renderIcons();
  }
})(window);
