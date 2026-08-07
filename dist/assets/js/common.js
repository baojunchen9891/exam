/* 真题考试通 - 公共逻辑 (HTTP API 账号 / 本地进度记录 / 导航 / 题目渲染)
 * 数据层已切换为独立 HTTP API（见 api.js），不再依赖 CloudBase。
 */
// 站点部署在根路径 "/"，所有内部页面跳转统一以 BASE 拼接，避免子目录页面相对路径解析 404
const BASE = "";
// 防御性获取 ExamAPI：api.js 可能未加载或执行失败，此时降级为空壳
var _API = (typeof window !== "undefined" && window.ExamAPI) || null;
var _safeAPI = _API || {
  getToken: function(){ return ""; },
  setToken: function(){},
  clearTokens: function(){},
  getRefresh: function(){ return ""; },
  setRefresh: function(){},
  refreshOnce: function(){ return Promise.resolve(""); },
  request: function(){ return Promise.resolve({code:-1,message:"API 未加载"}); },
  get: function(){ return Promise.resolve({code:-1,message:"API 未加载"}); },
  post: function(){ return Promise.resolve({code:-1,message:"API 未加载"}); },
  put: function(){ return Promise.resolve({code:-1,message:"API 未加载"}); }
};

const EXAM = (() => {
  const TOKEN_KEY = "exam_token";
  const REFRESH_KEY = "exam_refresh";
  const USER_KEY = "exam_user";
  const API = _safeAPI;

  const getToken = API.getToken;
  const setToken = API.setToken;
  const clearTokens = API.clearTokens;

  const getUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch (e) { return null; } };
  const setUser = (u) => { try { localStorage.setItem(USER_KEY, JSON.stringify(u || null)); } catch (e) {} };
  const clearUser = () => { try { localStorage.removeItem(USER_KEY); } catch (e) {} };

  // 解码 JWT payload（第 2 段）用于 exp 判断；真正鉴权在服务端
  function parseToken(token) {
    if (!token || !token.includes(".")) return null;
    try {
      const seg = token.split(".")[1] || "";
      const p = seg.replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(p);
      const bytes = new Uint8Array([...bin].map((c) => c.charCodeAt(0)));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return null; }
  }

  /* ---------- 账号(HTTP API) ---------- */
  const current = () => {
    const u = getUser();
    if (u) return u.username || u.phone || u.nickname || "";
    const p = parseToken(getToken());
    return p ? (p.username || p.phone || p.sub || "") : "";
  };
  const isLogin = () => {
    const t = getToken();
    if (!t) return false;
    const p = parseToken(t);
    if (!p) return true; // 无法解码也视为已登录（由服务端鉴权兜底）
    if (p.exp && Date.now() >= p.exp * 1000) return false;
    return true;
  };
  const currentUserObj = () => {
    const u = getUser();
    if (u) return { name: u.username || u.phone, role: u.role || "user", status: u.status || "approved" };
    return null;
  };
  // 新后端 User 无 status 字段，登录用户默认可用；role 缺失则非管理员
  const isApproved = () => isLogin();
  const isAdmin = () => { const u = getUser(); return !!(u && u.role === "admin"); };
  const canAccess = () => isLogin();

  // 注册：新后端暂以手机号体系为主，这里对接 /auth/register（若后端未开放则返回明确提示）
  async function register(name, pw, phone) {
    const r = await API.post("/auth/register", { username: name, phone: phone, password: pw });
    if (r.code !== 0) {
      const msg = r.code === 404 ? "注册服务暂未开通，请使用手机号登录" : (r.message || "注册失败");
      return { ok: false, msg };
    }
    return { ok: true, pending: true };
  }
  async function login(name, pw) {
    const r = await API.post("/auth/login", { grant_type: "password", platform: "h5", phone: name, password: pw });
    if (r.code !== 0) return { ok: false, msg: r.message || "登录失败" };
    const d = r.data || {};
    setToken(d.access_token);
    if (d.refresh_token) API.setRefresh(d.refresh_token);
    const user = d.user || {};
    setUser(user);
    studyCache = defaultStudy();
    studyLoadPromise = null;
    await loadStudy();
    try {
      user.force_reset_pwd ? localStorage.setItem("exam_force_pw", "1") : localStorage.removeItem("exam_force_pw");
    } catch (e) {}
    return { ok: true, forceChangePw: !!user.force_reset_pwd, needsPhoneBind: !!user.needs_phone_bind, user };
  }
  function logout() { clearTokens(); clearUser(); studyCache = defaultStudy(); studyLoadPromise = null; }
  async function setStatus(n, status) {
    const r = await API.post("/admin/approve", { name: n, status });
    return r.code === 0;
  }
  async function delUser(n) {
    const r = await API.post("/admin/del", { name: n });
    return r.code === 0;
  }
  async function resetPw(n) {
    const r = await API.post("/admin/reset-pw", { name: n });
    return { ok: r.code === 0, msg: r.message || "", pw: (r.data || {}).pw };
  }
  async function changePw(oldPw, newPw) {
    const r = await API.put("/me/password", { current_password: oldPw || undefined, new_password: newPw });
    if (r.code !== 0) return { ok: false, msg: r.message || "修改失败" };
    return { ok: true };
  }
  async function adminList() {
    const r = await API.get("/admin/users");
    if (r.code !== 0) return [];
    return r.data || [];
  }
  async function getStats() {
    const r = await API.get("/admin/stats");
    return r || { code: -1, message: "管理统计获取失败" };
  }
  function users() { return {}; }

  /* ---------- 存储 ---------- */
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const raw = (k) => localStorage.getItem(k);
  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return "h" + h.toString(16); }

  /* ---------- 用户记录 (HTTP API 同步，localStorage 作离线缓存) ---------- */
  const STUDY_KINDS = ["progress", "wrong", "fav", "records"];
  const defaultStudy = () => ({ progress: {}, wrong: [], fav: [], records: [] });
  let studyCache = defaultStudy();
  let studyLoadPromise = null;

  function studyKey(kind) { return `exam_${kind}_${current()}`; }
  function readLocalStudy(kind) {
    try { const v = JSON.parse(localStorage.getItem(studyKey(kind))); return v != null ? v : defaultStudy()[kind]; } catch (e) { return defaultStudy()[kind]; }
  }
  function writeLocalStudy(kind, v) { try { localStorage.setItem(studyKey(kind), JSON.stringify(v)); } catch (e) {} }

  function getRec(kind) {
    if (isLogin() && studyCache[kind] != null) return studyCache[kind];
    return readLocalStudy(kind);
  }
  function setRec(kind, v) {
    studyCache[kind] = v;
    writeLocalStudy(kind, v);
  }

  // 错题/收藏：云端存储的是完整题目对象，仅做字段归一（paperId/no），切勿丢弃内容字段
  function normStudyItem(x) {
    if (!x || typeof x !== "object") return x;
    var paperId = x.paperId || x.paper_id || "";
    var no = (x.no != null ? x.no : x.question_id) || "";
    if (paperId === "" && no === "") return x; // 无法识别的条目原样保留
    return Object.assign({}, x, { paperId: paperId, no: no });
  }
  function mapWrong(list) { return (list || []).map(normStudyItem); }
  function mapFav(list) { return (list || []).map(normStudyItem); }
  function mapRecords(list) {
    // 兼容两种数据格式：
    //   A) 原始 CloudBase NoSQL 格式（当前线上数据）：{paperId, score, date, usedSec, correct, wrong, auto, manual, title}
    //   B) HTTP API / MySQL 格式（预留）：{paper_id, score, submitted_at, duration_ms, correct_count, total_questions}
    return (list || []).map(function (x) {
      // 检测格式 A（原始 NoSQL）—— 保留全部原始字段，仅补齐缺失的标准化字段
      if (x.paperId || x.date || x.usedSec !== undefined) {
        return Object.assign({}, x, {
          id: x.id || (x.paperId || "") + "_" + (x.date || ""),
          // 标准化别名（供其他模块使用）
          submittedAt: x.submittedAt || x.date || "",
          duration: x.duration || (typeof x.usedSec === "number" ? x.usedSec * 1000 : 0),
          total: x.total || (x.auto || 0) + (x.manual || 0) || x.total_questions || 0,
          correct_count: x.correct_count !== undefined ? x.correct_count : x.correct,
        });
      }
      // 格式 B（HTTP API 风格）—— 补齐原始字段别名
      return Object.assign({}, x, {
        id: x.id,
        paperId: x.paperId || x.paper_id || "",
        date: x.date || x.submitted_at || "",
        usedSec: x.usedSec || (typeof x.duration_ms === "number" ? Math.round(x.duration_ms / 1000) : 0),
        wrong: x.wrong || ((x.total_questions || 0) - (x.correct_count || 0)) || 0,
        manual: x.manual || 0,
        title: x.title || "",
      });
    });
  }

  // 从云端拉取学习数据并刷新缓存（云端权威，localStorage 兜底）
  async function loadStudy() {
    if (!isLogin()) return;
    if (studyLoadPromise) return studyLoadPromise;
    studyLoadPromise = (async () => {
      try {
        const [wrong, fav, recs, prog] = await Promise.all([
          API.get("/wrong-questions"),
          API.get("/favorites"),
          API.get("/exam-records"),
          API.get("/progress"),
        ]);
        if (wrong.code === 0) { studyCache.wrong = mapWrong(wrong.data); writeLocalStudy("wrong", studyCache.wrong); }
        if (fav.code === 0) { studyCache.fav = mapFav(fav.data); writeLocalStudy("fav", studyCache.fav); }
        if (recs.code === 0) { studyCache.records = mapRecords((recs.data || {}).items || recs.data || []); writeLocalStudy("records", studyCache.records); }
        if (prog.code === 0) { studyCache.progressApi = prog.data || []; }
      } catch (e) { /* 保留 localStorage 兜底 */ }
    })();
    return studyLoadPromise;
  }
  function ensureStudy() { return loadStudy(); }

  // 考试记录
  const examRecords = () => getRec("records");
  function addExamRecord(r) {
    const a = (examRecords() || []).slice();
    a.unshift(r);
    setRec("records", a);
    // 同步到云端
    API.post("/exam-records", {
      paper_id: r.paperId, score: r.score, total_questions: r.total,
      correct_count: r.correct, duration_ms: r.duration || 0, submitted_at: r.submittedAt || new Date().toISOString()
    }).catch(() => {});
    // 进度 best-effort（需 subject/grade 上下文）
    if (r.subject && r.grade) {
      API.put("/progress", { subject: r.subject, grade: r.grade, total_done: r.total || 0, correct_done: r.correct || 0 }).catch(() => {});
    }
  }
  // 错题
  const wrongs = () => getRec("wrong");
  function addWrong(w) {
    const a = (wrongs() || []).slice();
    if (!a.find((x) => x.paperId === w.paperId && x.no === w.no)) {
      a.unshift(w); setRec("wrong", a);
      // 云端保存完整题目对象（与渲染所需字段一致），字段名归一为 paperId/no
      API.post("/wrong-questions", Object.assign({}, w, { action: "mark" })).catch(() => {});
    }
  }
  // 收藏
  const favs = () => getRec("fav");
  function toggleFav(f) {
    const a = (favs() || []).slice();
    const i = a.findIndex((x) => x.paperId === f.paperId && x.no === f.no);
    let on;
    if (i >= 0) { a.splice(i, 1); on = false; }
    else { a.unshift(f); on = true; }
    setRec("fav", a);
    // 云端保存完整题目对象（与渲染所需字段一致），字段名归一为 paperId/no
    API.post("/favorites", Object.assign({}, f, { action: on ? "add" : "remove" })).catch(() => {});
    return on;
  }
  const isFav = (pid, no) => !!favs().find((x) => x.paperId === pid && x.no === no);
  // 学习进展（本地缓存，按试卷维度）
  const progress = () => getRec("progress");
  function setProgress(pid, val) { const p = (progress() || {}); p[pid] = val; setRec("progress", p); }
  const getProgress = (pid) => progress()[pid] || "未开始";

  /* ---------- 工具 ---------- */
  const ASSET_VER = "202608052350";
  const loadJSON = (p) => { const sep = p.includes("?") ? "&" : "?"; return fetch(p + sep + "v=" + ASSET_VER).then((r) => { if (!r.ok) throw new Error(p + " " + r.status); return r.json(); }); };
  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => [...r.querySelectorAll(s)];
  function toast(msg) {
    let t = qs("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  function fmtTime(sec) { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, "0")}`; }
  const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // segment -> html  (segment: {t} 或 {img})
  function segHtml(segs) {
    if (!segs || !segs.length) return "";
    return segs.map((s) => s.img ? `<img src="${esc(s.img)}" loading="lazy" alt="" referrerpolicy="no-referrer">` : esc(s.t)).join(" ");
  }

  const PROG_CLASS = { "未开始": "s0", "进行中": "s1", "已完成": "s2", "已掌握": "s3" };
  function tagHtml(t) {
    const pcls = PROG_CLASS[t.progress] || "s0";
    return `<span class="tag year">${esc(t.year)}年</span>`
      + `<span class="tag type">${esc(t.type)}</span>`
      + `<span class="tag prog ${pcls}">${esc(t.progress)}</span>`;
  }

  // 渲染题目主体(题干+选项), mode: 'view' 静态 / 'exam' 带选择
  // opts.seq 显示题号(默认 = q.no, 列表页可传 i+1 避免原卷题型分块重复)
  function renderQuestion(q, opts = {}) {
    const typeClass = q.type.includes("判断") ? "judge" : (q.type.includes("编程") || q.type.includes("操作") ? "code" : "");
    const seq = opts.seq !== undefined ? opts.seq : q.no;
    const favOn = isFav(opts.paperId, q.no) ? "on" : "";
    let h = `<div class="qcard" id="q${seq}">
      <div class="qhead"><span class="qno">第 ${seq} 题</span><span class="qtype ${typeClass}">${esc(q.type)}</span>`;
    if (opts.showFav) h += `<button class="favbtn ${favOn}" data-fav="${q.no}" type="button"><i data-lucide="star"></i><span>${favOn ? "已收藏" : "收藏"}</span></button>`;
    h += `</div><div class="qstem">${segHtml(q.stem)}</div>`;
    if (q.options && q.options.length) {
      const multi = (q.answer || "").length > 1;
      h += `<div class="qopt">`;
      q.options.forEach((o) => {
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
      h += `<div class="qstem" style="color:var(--color-text-meta)">${isCode ? "（编程/操作题，请自行完成，提交后人工判分）" : "（本题未提供标准答案，不计入成绩）"}</div>`;
    }
    if ((opts.showAnswer || opts.review) && q.answer) {
      h += `<div class="ansbox"><b>正确答案：</b><span class="ra">${esc(q.answer)}</span>`;
      if (q.analysis) h += `<div class="ax" style="margin-top:6px;color:var(--color-text-secondary)">解析：${esc(q.analysis)}</div>`;
      h += `</div>`;
    }
    h += `</div>`;
    return h;
  }

  // Lucide 图标刷新（DOM 动态插入后调用）
  function refreshIcons() { try { if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); } catch (e) {} }

  /* ---------- 修改密码弹窗 (登录用户可用, 可关闭) ---------- */
  function showChangePwModal() {
    let m = document.getElementById("changePwModal");
    if (!m) {
      m = document.createElement("div");
      m.id = "changePwModal";
      m.style.cssText = "position:fixed;inset:0;background:var(--color-overlay);display:none;align-items:center;justify-content:center;z-index:9999";
      document.body.appendChild(m);
    }
    m.innerHTML = `
      <div style="background:var(--color-surface);border-radius:var(--radius-lg);padding:28px;max-width:420px;width:90%;box-shadow:var(--shadow-raised)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <i data-lucide="lock" style="width:22px;height:22px;color:var(--color-primary)"></i>
          <h3 style="margin:0;font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);color:var(--color-text)">修改密码</h3>
        </div>
        <p style="color:var(--color-text-secondary);font-size:13px;margin:0 0 16px">请输入当前密码与新的登录密码（至少 8 位）。</p>
        <label style="display:block;font-size:13px;color:var(--color-text-secondary);margin-bottom:6px">当前密码</label>
        <input id="cpwOld" type="password" autocomplete="current-password" style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);margin-bottom:14px;font-size:14px;box-sizing:border-box;background:var(--color-surface-warm)">
        <label style="display:block;font-size:13px;color:var(--color-text-secondary);margin-bottom:6px">新密码</label>
        <input id="cpwNew" type="password" autocomplete="new-password" style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:14px;box-sizing:border-box;background:var(--color-surface-warm)">
        <label style="display:block;font-size:13px;color:var(--color-text-secondary);margin-bottom:6px;margin-top:8px">确认新密码</label>
        <input id="cpwNew2" type="password" autocomplete="new-password" style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);margin-bottom:14px;font-size:14px;box-sizing:border-box;background:var(--color-surface-warm)">
        <div id="cpwErr" style="color:var(--color-danger);font-size:13px;min-height:18px;margin-bottom:8px;display:flex;align-items:center;gap:6px"></div>
        <div style="display:flex;gap:8px">
          <button id="cpwCancel" style="flex:1;padding:11px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);color:var(--color-text-secondary);cursor:pointer;font-size:14px">取消</button>
          <button id="cpwSubmit" style="flex:1;padding:11px;border:0;border-radius:var(--radius-md);background:var(--color-primary);color:var(--color-primary-on);cursor:pointer;font-size:14px;font-weight:var(--font-weight-medium)">确认修改</button>
        </div>
      </div>`;
    refreshIcons();
    m.style.display = "flex";
    const close = () => { m.style.display = "none"; };
    m.querySelector("#cpwCancel").onclick = close;
    m.onclick = (e) => { if (e.target === m) close(); };
    bindModalInputs(m);
    m.querySelector("#cpwSubmit").onclick = submit;
    setTimeout(() => m.querySelector("#cpwOld").focus(), 30);

    function bindModalInputs(root) {
      root.querySelectorAll("input").forEach((i) => {
        i.addEventListener("focus", () => { i.style.borderColor = "var(--color-primary)"; i.style.boxShadow = "0 0 0 3px var(--color-focus-ring)"; });
        i.addEventListener("blur", () => { i.style.borderColor = "var(--color-border)"; i.style.boxShadow = "none"; });
      });
    }
    async function submit() {
      const err = m.querySelector("#cpwErr");
      err.textContent = ""; err.innerHTML = "";
      const o = m.querySelector("#cpwOld").value, np = m.querySelector("#cpwNew").value, np2 = m.querySelector("#cpwNew2").value;
      if (!o) { return fail(err, "请输入当前密码"); }
      if (np.length < 8) { return fail(err, "新密码至少 8 位"); }
      if (np !== np2) { return fail(err, "两次输入的新密码不一致"); }
      const btn = m.querySelector("#cpwSubmit");
      btn.disabled = true; btn.style.opacity = ".6"; btn.textContent = "提交中…";
      const r = await changePw(o, np);
      btn.disabled = false; btn.style.opacity = "1"; btn.textContent = "确认修改";
      if (!r.ok) { return fail(err, r.msg || "修改失败"); }
      clearForcePw();
      close();
      toast("密码修改成功，请使用新密码重新登录");
    }
    function fail(err, msg) {
      err.innerHTML = `<i data-lucide="alert-circle" style="width:14px;height:14px"></i><span>${esc(msg)}</span>`;
      refreshIcons();
    }
  }

  /* ---------- 强制改密 (D4：password_hash IS NULL 的存量账号首次登录) ---------- */
  function clearForcePw() { try { localStorage.removeItem("exam_force_pw"); } catch (e) {} }
  function forcePwPending() { try { return localStorage.getItem("exam_force_pw") === "1"; } catch (e) { return false; } }

  // 不可关闭：无取消按钮，点击遮罩与 Esc 均不关闭，必须设密才能继续
  function showForceChangePwModal() {
    let m = document.getElementById("forcePwModal");
    if (!m) {
      m = document.createElement("div");
      m.id = "forcePwModal";
      m.style.cssText = "position:fixed;inset:0;background:var(--color-overlay);display:none;align-items:center;justify-content:center;z-index:10000";
      document.body.appendChild(m);
    }
    const user = getUser() || {};
    const needPhone = !!user.needs_phone_bind;

    function bindInputs(root) {
      root.querySelectorAll("input").forEach((i) => {
        i.addEventListener("focus", () => { i.style.borderColor = "var(--color-primary)"; i.style.boxShadow = "0 0 0 3px var(--color-focus-ring)"; });
        i.addEventListener("blur", () => { i.style.borderColor = "var(--color-border)"; i.style.boxShadow = "none"; });
      });
    }

    function renderStep1() {
      m.innerHTML = `
        <div style="background:var(--color-surface);border-radius:var(--radius-lg);padding:28px;max-width:440px;width:92%;box-shadow:var(--shadow-raised)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <i data-lucide="key-round" style="width:22px;height:22px;color:var(--color-primary)"></i>
            <h3 style="margin:0;font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);color:var(--color-text)">首次登录，请设置密码</h3>
          </div>
          <p style="color:var(--color-text-secondary);font-size:13px;margin:0 0 16px">您的账号由管理员批量导入，尚未设置登录密码。为保护账号安全，请先设置专属密码，再开始练习。</p>
          <label style="display:block;font-size:13px;color:var(--color-text-secondary);margin-bottom:6px">新密码</label>
          <input id="fpwNew" type="password" autocomplete="new-password" style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);margin-bottom:6px;font-size:14px;box-sizing:border-box;background:var(--color-surface-warm)">
          <label style="display:block;font-size:13px;color:var(--color-text-secondary);margin-bottom:6px;margin-top:8px">确认新密码</label>
          <input id="fpwNew2" type="password" autocomplete="new-password" style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);margin-bottom:14px;font-size:14px;box-sizing:border-box;background:var(--color-surface-warm)">
          <div id="fpwErr" style="color:var(--color-danger);font-size:13px;min-height:18px;margin-bottom:8px;display:flex;align-items:center;gap:6px"></div>
          <button id="fpwSubmit" style="width:100%;padding:11px;border:0;border-radius:var(--radius-md);background:var(--color-primary);color:var(--color-primary-on);cursor:pointer;font-size:14px;font-weight:var(--font-weight-medium)" disabled>确认设置新密码</button>
        </div>`;
      refreshIcons();
      bindInputs(m);
      const n1 = m.querySelector("#fpwNew"), n2 = m.querySelector("#fpwNew2"), btn = m.querySelector("#fpwSubmit"), err = m.querySelector("#fpwErr");
      function validate() { btn.disabled = !(n1.value.length >= 8 && n1.value === n2.value); }
      [n1, n2].forEach((i) => i.addEventListener("input", validate));
      btn.onclick = () => submitStep1(n1.value, n2.value, err, btn);
      setTimeout(() => n1.focus(), 30);
    }

    async function submitStep1(np, np2, err, btn) {
      err.innerHTML = "";
      if (np.length < 8) { return fail(err, "新密码至少 8 位"); }
      if (np !== np2) { return fail(err, "两次输入的新密码不一致"); }
      btn.disabled = true; btn.style.opacity = ".6"; btn.innerHTML = `<i data-lucide="loader-2" class="spin" style="width:14px;height:14px;vertical-align:-2px"></i> 提交中…`; refreshIcons();
      const r = await API.put("/me/password", { new_password: np });
      if (r.code !== 0) { btn.disabled = false; btn.style.opacity = "1"; btn.textContent = "确认设置新密码"; return fail(err, r.message || "设置失败"); }
      clearForcePw();
      if (needPhone) { renderStep2(); }
      else { m.style.display = "none"; toast("密码设置成功，您可以开始练习了"); }
    }

    function renderStep2() {
      m.innerHTML = `
        <div style="background:var(--color-surface);border-radius:var(--radius-lg);padding:28px;max-width:440px;width:92%;box-shadow:var(--shadow-raised)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <i data-lucide="smartphone" style="width:22px;height:22px;color:var(--color-primary)"></i>
            <h3 style="margin:0;font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);color:var(--color-text)">绑定手机号</h3>
          </div>
          <p style="color:var(--color-text-secondary);font-size:13px;margin:0 0 16px">为方便跨端同步学习记录，请绑定您的手机号（验证码登录可免密使用）。</p>
          <label style="display:block;font-size:13px;color:var(--color-text-secondary);margin-bottom:6px">手机号</label>
          <input id="bpPhone" type="tel" inputmode="numeric" autocomplete="tel" style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);margin-bottom:14px;font-size:14px;box-sizing:border-box;background:var(--color-surface-warm)">
          <label style="display:block;font-size:13px;color:var(--color-text-secondary);margin-bottom:6px">短信验证码</label>
          <input id="bpCode" type="text" inputmode="numeric" autocomplete="one-time-code" style="width:100%;padding:10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);margin-bottom:14px;font-size:14px;box-sizing:border-box;background:var(--color-surface-warm)">
          <div id="bpErr" style="color:var(--color-danger);font-size:13px;min-height:18px;margin-bottom:8px;display:flex;align-items:center;gap:6px"></div>
          <button id="bpSubmit" style="width:100%;padding:11px;border:0;border-radius:var(--radius-md);background:var(--color-primary);color:var(--color-primary-on);cursor:pointer;font-size:14px;font-weight:var(--font-weight-medium)">完成绑定</button>
        </div>`;
      refreshIcons();
      bindInputs(m);
      const err = m.querySelector("#bpErr"), btn = m.querySelector("#bpSubmit");
      btn.onclick = async () => {
        err.innerHTML = "";
        const phone = m.querySelector("#bpPhone").value.trim(), code = m.querySelector("#bpCode").value.trim();
        if (!/^\d{6,}$/.test(phone)) { return fail(err, "请输入有效手机号"); }
        if (!code) { return fail(err, "请输入短信验证码"); }
        btn.disabled = true; btn.style.opacity = ".6"; btn.innerHTML = `<i data-lucide="loader-2" class="spin" style="width:14px;height:14px;vertical-align:-2px"></i> 绑定中…`; refreshIcons();
        const r = await API.post("/auth/bind-phone", { phone, sms_code: code });
        if (r.code !== 0) { btn.disabled = false; btn.style.opacity = "1"; btn.textContent = "完成绑定"; return fail(err, r.message || "绑定失败"); }
        if (r.data) setUser(r.data);
        m.style.display = "none"; toast("手机号绑定成功");
      };
      setTimeout(() => m.querySelector("#bpPhone").focus(), 30);
    }

    function fail(err, msg) { err.innerHTML = `<i data-lucide="alert-circle" style="width:14px;height:14px"></i><span>${esc(msg)}</span>`; refreshIcons(); }

    renderStep1();
    m.style.display = "flex";
    m.onclick = (e) => { if (e.target === m) e.stopPropagation(); };  // 遮罩不可关闭
  }

  function enforceForceChangePw() {
    if (!isLogin()) return;
    const u = getUser();
    if (!(u && u.force_reset_pwd) && !forcePwPending()) return;
    showForceChangePwModal();
  }

  /* ---------- 顶部导航 ---------- */
  function renderNav(active) {
    const u = current();
    const nav = document.getElementById("nav");
    if (!nav) return;
    const loggedIn = isLogin();

    let navActive = active;
    if (navActive === "records") {
      const hash = (location.hash || "#exam").slice(1);
      navActive = "rec-" + (["exam", "wrong", "fav"].includes(hash) ? hash : "exam");
    }
    const activeClass = (k) => navActive === k ? "active" : "";

    const leftNav = `
      <div class="brand">
        <div class="logo"><span class="dot"></span>真题考试通</div>
        <div class="navtabs">
          <a href="${BASE}index.html" class="${activeClass("home")}">首页</a>
          <a href="${BASE}curriculum.html" class="${activeClass("curriculum")}">课程体系</a>
          <a href="${BASE}diagnostic.html" class="${activeClass("diagnose")}">免费诊断</a>
          <a href="${BASE}cspjsjixun.html" class="${activeClass("csp")}">CSP集训</a>
          ${loggedIn ? `
          <div class="nav-dropdown ${["rec-exam","rec-wrong","rec-fav"].includes(navActive) ? "open" : ""}">
            <a href="${BASE}records.html#exam" class="${activeClass("records") || ["rec-exam","rec-wrong","rec-fav"].includes(navActive) ? "active" : ""} nav-drop-toggle">学习记录 &#9662;</a>
            <div class="nav-drop-menu">
              <a href="${BASE}records.html#exam" class="${activeClass("rec-exam")}">&#128203; 考试记录</a>
              <a href="${BASE}records.html#wrong" class="${activeClass("rec-wrong")}">&#10060; 错题记录</a>
              <a href="${BASE}records.html#fav" class="${activeClass("rec-fav")}">&#11088; 收藏记录</a>
            </div>
          </div>
          ` : `<a href="${BASE}index.html#login" class="nav-login-hint">学习记录</a>`}
          ${isAdmin() ? `<a href="${BASE}admin.html" class="${activeClass("admin")}">管理员后台</a>` : ""}
        </div>
      </div>`;

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
            <div class="user-actions">
              <button class="cpw" id="changePwBtn" type="button">修改密码</button>
              <button class="logout" id="logoutBtn" type="button">退出</button>
            </div>
          </div>
        </div>`;
    } else {
      rightNav = `
        <div class="toplinks">
          <a href="${BASE}index.html#login">登陆</a>
          <span class="sep">|</span>
          <a href="${BASE}index.html#register">注册</a>
          <span class="sep">|</span>
          <a href="${BASE}admin-reset.html">忘记密码</a>
        </div>`;
    }

    nav.innerHTML = `<div class="bar">${leftNav}${rightNav}</div>`;
    refreshIcons();

    const lb = document.getElementById("logoutBtn");
    if (lb) lb.onclick = () => { logout(); location.href = BASE + "index.html"; };
    const cpb = document.getElementById("changePwBtn");
    if (cpb) cpb.onclick = () => showChangePwModal();
    enforceForceChangePw();
  }

  function requireLogin() { if (!canAccess()) { location.href = BASE + "index.html"; return false; } return true; }
  function requireAdmin() { if (!isAdmin()) { location.href = BASE + "index.html"; return false; } return true; }

  // 初始化：已登录用户预热云端学习数据（先用 localStorage 兜底即时渲染）
  if (isLogin()) {
    STUDY_KINDS.forEach((k) => { if (k !== "progress") studyCache[k] = readLocalStudy(k); });
    loadStudy();
  }

  // Lucide：DOM 就绪 + 动态插入自动渲染图标
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => refreshIcons());
  } else {
    refreshIcons();
  }
  if (window.MutationObserver) {
    let _iconTimer = null;
    const mo = new MutationObserver((muts) => {
      let hit = false;
      for (const mu of muts) {
        for (const node of mu.addedNodes) {
          if (node.nodeType === 1 && node.querySelector && node.querySelector("[data-lucide]")) { hit = true; break; }
        }
        if (hit) break;
      }
      if (hit) {
        if (_iconTimer) clearTimeout(_iconTimer);
        _iconTimer = setTimeout(refreshIcons, 50); // 动态注入的 Lucide 图标：debounce ~50ms
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---- 全站底部（微信二维码 + 口号） ----
  function renderFooter() {
    if (document.getElementById('siteFooter')) return; // 防重复
    var footer = document.createElement('footer');
    footer.id = 'siteFooter';
    footer.innerHTML =
      '<div class="sf-inner">' +
        '<div class="sf-qrcode"><img src="' + BASE + 'assets/images/wechat-qrcode.png" alt="微信扫码" loading="lazy"></div>' +
        '<div class="sf-text">' +
          '<div class="sf-slogan">学编程，不迷路。</div>' +
          '<div class="sf-hint">扫码添加老师微信，获取专属学习规划</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(footer);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderFooter);
  } else {
    renderFooter();
  }

  return {
    get, set, raw, hash, users, register, login, logout, current, isLogin,
    currentUserObj, isApproved, isAdmin, canAccess, setStatus, delUser, adminList,
    getRec, setRec, ensureStudy, getStats, resetPw, changePw, showChangePwModal,
    showForceChangePwModal, enforceForceChangePw, clearForcePw, forcePwPending,
    examRecords, addExamRecord, wrongs, addWrong, favs, toggleFav, isFav,
    progress, setProgress, getProgress, loadJSON, qs, qsa, toast, fmtTime, esc,
    segHtml, tagHtml, renderQuestion, renderNav, requireLogin, requireAdmin, refreshIcons,
  };
})();

// 暴露到全局 window，供各页面通过 window.EXAM.renderNav(...) 调用。
// 注意：顶层 const 声明不会自动成为 window 的属性，必须显式赋值，
// 否则 curriculum / cspjsjixun / kp-practice-list / schedule 等页面的
// `if (window.EXAM) EXAM.renderNav(...)` 守卫永远为假，导航栏不渲染。
window.EXAM = EXAM;
if (typeof module !== "undefined") module.exports = EXAM;
