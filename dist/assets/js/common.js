/* 真题考试通 - 公共逻辑 (云端账号 / 本地进度记录 / 导航 / 题目渲染) */
const EXAM = (() => {
  const TOKEN_KEY = "exam_token";

  /* ---------- CloudBase 初始化 (SDK 由页面本地引入 assets/js/cloudbase.js) ---------- */
  const cloudbase = window.cloudbase;
  // accessKey 为环境"发布密钥/免登录密钥"，用于为匿名访客建立轻量会话，
  // 从而可调用 invoke 规则为 true 的云函数 examApi（无需开启匿名登录）。
  const ACCESS_KEY = "eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJpc3MiOiJodHRwczovL2thb2ppLWQyZzkyd2x2MzQ0NTNmZTU1LmFwLXNoYW5naGFpLnRjYi1hcGkudGVuY2VudGNsb3VkYXBpLmNvbSIsInN1YiI6ImFub24iLCJhdWQiOiJrYW9qaS1kMmc5MndsdjM0NDUzZmU1NSIsImV4cCI6NDA4OTQ5NDgyOCwiaWF0IjoxNzg1ODExNjI4LCJub25jZSI6IjZrNlIzWS1pVGw2UDJMaWprbl93SHciLCJhdF9oYXNoIjoiNms2UjNZLWlUbDZQMkxpamtuX3dIdyIsIm5hbWUiOiJBbm9ueW1vdXMiLCJzY29wZSI6ImFub255bW91cyIsInByb2plY3RfaWQiOiJrYW9qaS1kMmc5MndsdjM0NDUzZmU1NSIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJ1c2VyX3R5cGUiOiIiLCJjbGllbnRfdHlwZSI6ImNsaWVudF91c2VyIiwiaXNfc3lzdGVtX2FkbWluIjpmYWxzZX0.rImN4cZHAKJTIFFIC4BFxUQRskoUjGb-nDahWZ93XExKq0Kcygnv7CRHpXkO1iIPImNCChkTaKG4lDdLXXh1RPrq0ls71XTMaZuibRJHBqJls1KblvGUctkWAuw8-FQmCfdWN_E1BodCiSzMjdpBDMsvAnfSJH1YrMTy2t4ZXIhgKZiPDQR8zl5qjuVzhxAEfjweA_0JA9vSXPA51lhKsUfVbT26_M7k8MWjXunf1DN-LNgT4WKJMEkaFDfVYW16w6uYRG_WyMZlY6XjVjK0pgAHAgXXYiUJEpyG_WkFuY0IAfAGsnSpsFV8TPG3X03SsRZIeefO3FXkkknXPEpkUw";
  const app = cloudbase.init({ env: "kaoji-d2g92wlv34453fe55", accessKey: ACCESS_KEY });
  const FUNC = "examApi";

  // 统一调用聚合云函数；返回函数返回值 {code, message, data}
  async function callApi(action, data = {}) {
    try {
      const res = await app.callFunction({ name: FUNC, data: { action, ...data } });
      return (res && res.result) ? res.result : (res || {});
    } catch (e) {
      return { code: -1, message: (e && e.message) || "网络异常，请稍后重试" };
    }
  }

  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
  const setToken = (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch {} };
  const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} };

  // 前端仅解码 token 用于 UI 展示与守卫；真正鉴权在服务端 verifyToken（HMAC 校验）
  function parseToken(token) {
    if (!token || !token.includes(".")) return null;
    try {
      let p = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(p);
      const bytes = new Uint8Array([...bin].map((c) => c.charCodeAt(0)));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch { return null; }
  }

  /* ---------- 账号(云端) ---------- */
  const current = () => { const p = parseToken(getToken()); return p ? p.username : ""; };
  const isLogin = () => { const p = parseToken(getToken()); return !!(p && (!p.exp || Date.now() < p.exp)); };
  const currentUserObj = () => { const p = parseToken(getToken()); return p ? { name: p.username, role: p.role, status: p.status } : null; };
  const isApproved = () => { const p = currentUserObj(); return !!p && (p.status === "approved" || p.role === "admin"); };
  const isAdmin = () => { const p = currentUserObj(); return !!p && p.role === "admin"; };
  const canAccess = () => isLogin() && isApproved();

  async function register(name, pw) {
    const r = await callApi("register", { name, pw });
    if (r.code !== 0) return { ok: false, msg: r.message || "注册失败" };
    return { ok: true, pending: true };
  }
  async function login(name, pw) {
    const r = await callApi("login", { name, pw });
    if (r.code !== 0) return { ok: false, msg: r.message || "登录失败" };
    setToken(r.data.token);
    studyCache = defaultStudy();
    studyLoadPromise = null;
    await loadStudy();
    return { ok: true };
  }
  function logout() { clearToken(); studyCache = defaultStudy(); studyLoadPromise = null; }
  async function setStatus(name, status) {
    const r = await callApi("approve", { token: getToken(), name, status });
    return r.code === 0;
  }
  async function delUser(name) {
    const r = await callApi("delUser", { token: getToken(), name });
    return r.code === 0;
  }
  async function adminList() {
    const r = await callApi("adminList", { token: getToken() });
    return r.code === 0 ? (r.data || []) : [];
  }
  async function getStats() {
    const r = await callApi("getStats", { token: getToken() });
    return r;
  }
  // 兼容旧引用：云端列表需异步 adminList，这里返回空对象
  function users() { return {}; }

  /* ---------- 存储 ---------- */
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const raw = (k) => localStorage.getItem(k);
  // 弱哈希仅作兼容保留，密码已改在服务端用 scrypt 处理
  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return "h" + h.toString(16); }

  /* ---------- 用户记录 (云端同步，localStorage 作离线缓存) ---------- */
  const STUDY_KINDS = ["progress", "wrong", "fav", "records"];
  const defaultStudy = () => ({ progress: {}, wrong: [], fav: [], records: [] });
  let studyCache = defaultStudy();   // 已登录用户的内存缓存（云端权威，localStorage 兜底）
  let studySaving = false;
  let studySaveTimer = null;
  let studyLoadPromise = null;

  function studyKey(kind) { return `exam_${kind}_${current()}`; }
  function readLocalStudy(kind) {
    try { const v = JSON.parse(localStorage.getItem(studyKey(kind))); return v != null ? v : defaultStudy()[kind]; } catch { return defaultStudy()[kind]; }
  }
  function writeLocalStudy(kind, v) { try { localStorage.setItem(studyKey(kind), JSON.stringify(v)); } catch {} }

  // 登录态下优先返回云端缓存；未同步完成前先用 localStorage 兜底，保证首屏即时渲染
  function getRec(kind) {
    if (isLogin() && isApproved()) return studyCache[kind] != null ? studyCache[kind] : readLocalStudy(kind);
    return readLocalStudy(kind);
  }
  function setRec(kind, v) {
    if (!(isLogin() && isApproved())) { writeLocalStudy(kind, v); return; }
    studyCache[kind] = v;
    writeLocalStudy(kind, v);
    scheduleStudySave();
  }

  // 从云端拉取学习数据并刷新缓存（云端权威）
  async function loadStudy() {
    if (!(isLogin() && isApproved())) return;
    if (studyLoadPromise) return studyLoadPromise;
    studyLoadPromise = (async () => {
      try {
        const r = await callApi("getStudy", { token: getToken() });
        if (r.code === 0 && r.data) {
          STUDY_KINDS.forEach(k => { studyCache[k] = (r.data[k] != null) ? r.data[k] : defaultStudy()[k]; writeLocalStudy(k, studyCache[k]); });
        }
      } catch (e) { /* 保留 localStorage 兜底 */ }
    })();
    return studyLoadPromise;
  }
  // 供页面在渲染前确保数据已从云端加载
  function ensureStudy() { return loadStudy(); }

  // 防抖写回云端（避免每次小题操作都打一次云函数）
  function scheduleStudySave() {
    if (studySaving) return;
    clearTimeout(studySaveTimer);
    studySaveTimer = setTimeout(async () => {
      if (!(isLogin() && isApproved())) return;
      studySaving = true;
      try {
        const patch = {};
        STUDY_KINDS.forEach(k => { patch[k] = studyCache[k]; });
        await callApi("saveStudy", { token: getToken(), patch });
      } catch (e) { /* 失败不抛，localStorage 已保存 */ }
      finally { studySaving = false; }
    }, 800);
  }

  // 考试记录
  const examRecords = () => getRec("records");
  const addExamRecord = (r) => { const a = (examRecords() || []).slice(); a.unshift(r); setRec("records", a); };
  // 错题
  const wrongs = () => getRec("wrong");
  function addWrong(w) {
    const a = (wrongs() || []).slice();
    if (!a.find(x => x.paperId === w.paperId && x.no === w.no)) { a.unshift(w); setRec("wrong", a); }
  }
  // 收藏
  const favs = () => getRec("fav");
  function toggleFav(f) {
    const a = (favs() || []).slice();
    const i = a.findIndex(x => x.paperId === f.paperId && x.no === f.no);
    if (i >= 0) { a.splice(i, 1); setRec("fav", a); return false; }
    a.unshift(f); setRec("fav", a); return true;
  }
  const isFav = (pid, no) => !!favs().find(x => x.paperId === pid && x.no === no);
  // 学习进展
  const progress = () => getRec("progress");
  function setProgress(pid, val) { const p = (progress() || {}); p[pid] = val; setRec("progress", p); }
  const getProgress = (pid) => progress()[pid] || "未开始";

  /* ---------- 工具 ---------- */
  const loadJSON = (p) => fetch(p).then(r => { if (!r.ok) throw new Error(p + " " + r.status); return r.json(); });
  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => [...r.querySelectorAll(s)];
  function toast(msg) {
    let t = qs("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  function fmtTime(sec) { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, "0")}`; }
  const esc = (s) => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // segment -> html  (segment: {t} 或 {img})
  function segHtml(segs) {
    if (!segs || !segs.length) return "";
    return segs.map(s => s.img ? `<img src="${esc(s.img)}" loading="lazy" alt="" referrerpolicy="no-referrer">` : esc(s.t)).join(" ");
  }

  const PROG_CLASS = { "未开始": "s0", "进行中": "s1", "已完成": "s2", "已掌握": "s3" };
  function tagHtml(t) {
    const pcls = PROG_CLASS[t.progress] || "s0";
    return `<span class="tag year">${esc(t.year)}年</span>`
      + `<span class="tag type">${esc(t.type)}</span>`
      + `<span class="tag prog ${pcls}">${esc(t.progress)}</span>`;
  }

  // 渲染题目主体(题干+选项), mode: 'view' 静态 / 'exam' 带选择
  function renderQuestion(q, opts = {}) {
    const typeClass = q.type.includes("判断") ? "judge" : (q.type.includes("编程") || q.type.includes("操作") ? "code" : "");
    const favOn = isFav(opts.paperId, q.no) ? "on" : "";
    let h = `<div class="qcard" id="q${q.no}">
      <div class="qhead"><span class="qno">第 ${q.no} 题</span><span class="qtype ${typeClass}">${esc(q.type)}</span>`;
    if (opts.showFav) h += `<button class="favbtn ${favOn}" data-fav="${q.no}">${favOn ? "★ 已收藏" : "☆ 收藏"}</button>`;
    h += `</div><div class="qstem">${segHtml(q.stem)}</div>`;
    if (q.options && q.options.length) {
      const multi = (q.answer || "").length > 1;
      h += `<div class="qopt">`;
      q.options.forEach(o => {
        const sel = opts.selected === o.key || (Array.isArray(opts.selected) && opts.selected.includes(o.key));
        let cls = "opt";
        if (opts.review) { if (o.key === q.answer) cls += " correct"; else if (sel) cls += " wrong"; }
        else if (sel) cls += " sel";
        h += `<div class="${cls}" data-key="${o.key}" ${opts.mode === "exam" ? `data-pick="${multi ? "multi" : "single"}"` : ""}>
          <span class="k">${o.key}.</span>${segHtml(o.content)}</div>`;
      });
      h += `</div>`;
    } else {
      const isCode = q.type.includes("编程") || q.type.includes("操作") || q.type.includes("问答");
      h += `<div class="qstem" style="color:var(--muted)">${isCode ? "（编程/操作题，请自行完成，提交后人工判分）" : "（本题未提供标准答案，不计入成绩）"}</div>`;
    }
    if ((opts.showAnswer || opts.review) && q.answer) {
      h += `<div class="ansbox"><b>正确答案：</b><span class="ra">${esc(q.answer)}</span>`;
      if (q.analysis) h += `<div class="ax" style="margin-top:6px;color:#475569">解析：${esc(q.analysis)}</div>`;
      h += `</div>`;
    }
    h += `</div>`;
    return h;
  }

  /* ---------- 顶部导航 ---------- */
  function renderNav(active) {
    const u = current();
    const nav = document.getElementById("nav");
    if (!nav) return;
    const loggedIn = isLogin() && isApproved();

    // 在 records 页面根据 hash 定位具体子标签
    let navActive = active;
    if (navActive === "records") {
      const hash = (location.hash || "#exam").slice(1);
      navActive = "rec-" + (["exam", "wrong", "fav"].includes(hash) ? hash : "exam");
    }
    const activeClass = (k) => navActive === k ? "active" : "";

    // 左侧固定导航（与截图一致）
    const leftNav = `
      <div class="brand">
        <div class="logo"><span class="dot"></span>真题考试通</div>
        <div class="navtabs">
          <a href="index.html" class="${activeClass("home")}">网站首页</a>
          <a href="records.html#exam" class="${activeClass("rec-exam")}">考试记录</a>
          <a href="records.html#wrong" class="${activeClass("rec-wrong")}">错题记录</a>
          <a href="records.html#fav" class="${activeClass("rec-fav")}">收藏记录</a>
          <a href="diagnostic.html" class="${activeClass("diagnose")}">免费诊断<span class="nav-soon">内测</span></a>
          <a href="cspjsjixun.html" class="${activeClass("csp")}">CSP 集训</a>
          ${isAdmin() ? `<a href="admin.html" class="${activeClass("admin")}">管理员后台</a>` : ""}
        </div>
      </div>`;

    // 右侧：未登录显示 登陆 | 注册 | 忘记密码 | 激活码；登录后显示用户信息
    let rightNav;
    if (loggedIn) {
      const name = String(u || "").trim() || "?";
      const isNum = /^\d+$/.test(name);
      const avatar = isNum ? name.slice(-2) : (name[0] || "?").toUpperCase();
      const display = name.length > 13 ? name.slice(0, 12) + "…" : name;
      const adminTag = isAdmin() ? `<span class="role-tag">管理员</span>` : "";
      rightNav = `
        <div class="userbox">
          <div class="avatar" title="${esc(name)}">${esc(avatar)}</div>
          <div class="user-meta">
            <div class="uname-line"><span class="uname-txt" title="${esc(name)}">${esc(display)}</span>${adminTag}</div>
            <button class="logout" id="logoutBtn" type="button">退出</button>
          </div>
        </div>`;
    } else {
      rightNav = `
        <div class="toplinks">
          <a href="index.html#login">登陆</a>
          <span class="sep">|</span>
          <a href="index.html#register">注册</a>
          <span class="sep">|</span>
          <a href="admin-reset.html">忘记密码</a>
          <span class="sep">|</span>
          <a href="#" id="activeCodeLink">激活码</a>
        </div>`;
    }

    nav.innerHTML = `<div class="bar">${leftNav}${rightNav}</div>`;

    const lb = document.getElementById("logoutBtn");
    if (lb) lb.onclick = () => { logout(); location.href = "index.html"; };

    const ac = document.getElementById("activeCodeLink");
    if (ac) ac.onclick = (e) => { e.preventDefault(); toast("激活码功能正在开发中"); };
  }

  function requireLogin() { if (!canAccess()) { location.href = "index.html"; return false; } return true; }
  function requireAdmin() { if (!isAdmin()) { location.href = "index.html"; return false; } return true; }

  // 初始化：已登录用户预热云端学习数据（先用 localStorage 兜底即时渲染）
  if (isLogin() && isApproved()) {
    STUDY_KINDS.forEach(k => { studyCache[k] = readLocalStudy(k); });
    loadStudy();
  }

  return {
    get, set, raw, hash, users, register, login, logout, current, isLogin,
    currentUserObj, isApproved, isAdmin, canAccess, setStatus, delUser, adminList,
    getRec, setRec, ensureStudy, getStats,
    examRecords, addExamRecord, wrongs, addWrong, favs, toggleFav, isFav,
    progress, setProgress, getProgress, loadJSON, qs, qsa, toast, fmtTime, esc,
    segHtml, tagHtml, renderQuestion, renderNav, requireLogin, requireAdmin,
  };
})();
if (typeof module !== "undefined") module.exports = EXAM;
