/* 首页: 登录/注册 + 左侧科目导航 + 筛选 + 试卷卡片 */
(function () {
  const E = EXAM;
  const $ = E.qs;

  /* ---------- 认证 ---------- */
  let mode = "login";
  function renderAuth() {
    const isReg = mode === "register";
    $("#authTitle").textContent = isReg ? "注册账号" : "登录账号";
    $("#authBtn").textContent = isReg ? "注册" : "登录";
    $("#authSub").textContent = isReg
      ? "请填写与小程序一致的手机号，注册后即为跨端同一账号"
      : "青少年软件编程考级真题 · 模拟考试平台";
    const pf = $("#auPhoneField"); if (pf) pf.style.display = isReg ? "block" : "none";
    $("#authSwitch").innerHTML = isReg
      ? '已有账号？<a href="#" id="authToggle">去登录</a>'
      : '还没有账号？<a href="#" id="authToggle">立即注册</a>';
    $("#authErr").textContent = "";
    const t = $("#authToggle"); if (t) t.onclick = (e) => { e.preventDefault(); mode = mode === "login" ? "register" : "login"; renderAuth(); };
  }
  async function doAuth() {
    const u = $("#auUser").value.trim(), p = $("#auPw").value;
    let phone = "";
    if (mode === "register") {
      phone = ($("#auPhone") ? $("#auPhone").value : "").trim();
      if (!/^[\w一-龥]{2,20}$/.test(u)) { $("#authErr").textContent = "用户名需 2-20 位，仅含字母 / 数字 / 中文"; return; }
      if (!/^1\d{10}$/.test(phone)) { $("#authErr").textContent = "请填写正确的 11 位手机号"; return; }
      if (p.length < 6) { $("#authErr").textContent = "密码至少 6 位"; return; }
    }
    let r;
    if (mode === "login") r = await E.login(u, p);
    else r = await E.register(u, p, phone);
    if (!r.ok) { $("#authErr").textContent = r.msg; return; }
    if (mode === "register") { showPending(); return; }
    if (E.isAdmin()) { location.href = "/admin.html"; return; }  // 管理员登录直接进后台
    enterHome();
    if (r.forceChangePw) E.showForceChangePwModal();  // 被管理员重置过密码，强制先改密
  }
  function bindAuth() {
    $("#authBtn").onclick = doAuth;
    $("#auPw").addEventListener("keydown", e => { if (e.key === "Enter") doAuth(); });
    renderAuth();
  }

  function enterHome() {
    $("#authView").style.display = "none";
    $("#homeView").style.display = "block";
    E.renderNav("home");
    initBrowser();
  }

  function showPending() {
    $("#authView").style.display = "none";
    $("#homeView").style.display = "none";
    $("#pendingView").style.display = "flex";
    const pl = $("#pendingLogout");
    if (pl) pl.onclick = () => { E.logout(); location.href = "/index.html"; };
  }

  /* ---------- 试卷中心 ---------- */
  let DATA = [];
  // 完整科目导航（与截图一致）
  const SUBJECT_NAV = [
    { key: "scratch", name: "青少年软件编程（Scratch）", hasData: true },
    { key: "python", name: "青少年软件编程（Python）", hasData: true },
    { key: "robot", name: "青少年软件编程（机器人）", hasData: false },
    { key: "c", name: "青少年软件编程（C语言）", hasData: false },
    { key: "lanqiao-scratch", name: "蓝桥杯大赛（Scratch）", hasData: false },
    { key: "lanqiao-python", name: "蓝桥杯大赛（Python）", hasData: false },
    { key: "lanqiao-c", name: "蓝桥杯大赛（C语言）", hasData: false },
    { key: "gesp-scratch", name: "GESP等级认证（Scratch）", hasData: false },
    { key: "gesp-python", name: "GESP等级认证（Python）", hasData: false },
    { key: "gesp-cpp", name: "GESP等级认证（C++）", hasData: false },
    { key: "oi", name: "信息学奥赛", hasData: false },
    { key: "info-scratch", name: "信息素养大赛（Scratch）", hasData: false },
    { key: "info-python", name: "信息素养大赛（Python）", hasData: false },
    { key: "info-c", name: "信息素养大赛（C语言）", hasData: false },
  ];
  const SUBJECT_META = {
    scratch:        { short: "Scratch",  org: "电子学会", color: "var(--color-blue-500)" },
    python:         { short: "Python",   org: "电子学会", color: "var(--color-primary)" },
    robot:          { short: "机器人",   org: "电子学会", color: "var(--color-sky-500)" },
    c:              { short: "C语言",     org: "电子学会", color: "var(--color-sky-600)" },
    "lanqiao-scratch": { short: "Scratch", org: "蓝桥杯", color: "var(--color-amber-500)" },
    "lanqiao-python":  { short: "Python",  org: "蓝桥杯", color: "var(--color-amber-600)" },
    "lanqiao-c":       { short: "C语言",   org: "蓝桥杯", color: "var(--color-amber-700)" },
    "gesp-scratch":    { short: "Scratch", org: "GESP",  color: "var(--color-violet-500)" },
    "gesp-python":     { short: "Python",  org: "GESP",  color: "var(--color-violet-600)" },
    "gesp-cpp":        { short: "C++",     org: "GESP",  color: "var(--color-violet-700)" },
    oi:             { short: "信息学奥赛", org: "CSP",   color: "var(--color-red-600)" },
    "info-scratch":    { short: "Scratch", org: "信息素养", color: "var(--color-emerald-600)" },
    "info-python":     { short: "Python",  org: "信息素养", color: "var(--color-emerald-700)" },
    "info-c":          { short: "C语言",   org: "信息素养", color: "var(--color-emerald-800)" },
  };
  const metaOf = (k) => SUBJECT_META[k] || { short: k, org: "", color: "var(--color-slate-500)" };
  let cur = { subject: "scratch", level: "all", year: "all", type: "all", q: "" };

  async function initBrowser() {
    try { DATA = await E.loadJSON("data/index.json"); }
    catch (e) { E.toast("题库加载失败: " + e.message); return; }
    renderSubjectNav();
    switchSubject(cur.subject);
  }

  function renderSubjectNav() {
    const list = $("#subjectList");
    const dataSubjects = new Set(DATA.map(d => d.subject));
    list.innerHTML = SUBJECT_NAV.map(s => {
      const has = dataSubjects.has(s.key);
      const active = s.key === cur.subject ? "active" : "";
      const disabled = !has ? "disabled" : "";
      const badge = !has ? '<span class="soon-badge">待上线</span>' : '';
      return `<li class="${active} ${disabled}" data-key="${s.key}" data-has="${has}">
        <span>${s.name}</span>${badge}
      </li>`;
    }).join("");
    E.qsa("#subjectList li").forEach(li => {
      li.onclick = () => {
        if (li.dataset.has !== "true") {
          E.toast("该科目试卷正在整理中，敬请期待");
          return;
        }
        switchSubject(li.dataset.key);
      };
    });
  }

  function switchSubject(sub) {
    cur = { subject: sub, level: "all", year: "all", type: "all", q: "" };
    const navItem = SUBJECT_NAV.find(s => s.key === sub);
    if (navItem) {
      $("#bcSubject").textContent = navItem.name;
      document.title = navItem.name + " · 试卷中心";
    }
    // 更新左侧激活态
    E.qsa("#subjectList li").forEach(li => {
      li.classList.toggle("active", li.dataset.key === sub);
    });
    renderFilters();
    renderPapers();
  }

  function renderFilters() {
    const items = DATA.filter(d => d.subject === cur.subject);
    const levels = [...new Set(items.map(d => d.level))].filter(l => l != null).sort((a, b) => a - b);
    const years = [...new Set(items.map(d => d.year))].sort((a, b) => b - a);

    const lvLabel = (lv) => {
      const p = items.find(d => d.level === lv);
      return (p && p.levelName) ? p.levelName : (lv + "级");
    };
    $("#levelChips").innerHTML = `<span class="chip ${cur.level === "all" ? "active" : ""}" data-lv="all">全部</span>` +
      levels.map(l => `<span class="chip" data-lv="${l}">${lvLabel(l)}</span>`).join("");
    $("#yearChips").innerHTML = `<span class="chip ${cur.year === "all" ? "active" : ""}" data-yr="all">全部</span>` +
      years.map(y => `<span class="chip" data-yr="${y}">${y}</span>`).join("");
    $("#typeChips").innerHTML = `<span class="chip ${cur.type === "all" ? "active" : ""}" data-tp="all">全部</span>` +
      `<span class="chip" data-tp="真题">真题</span><span class="chip" data-tp="模拟">模拟</span>`;

    E.qsa("#levelChips .chip").forEach(c => c.onclick = () => { cur.level = c.dataset.lv; setActive("#levelChips", c); renderPapers(); });
    E.qsa("#yearChips .chip").forEach(c => c.onclick = () => { cur.year = c.dataset.yr; setActive("#yearChips", c); renderPapers(); });
    E.qsa("#typeChips .chip").forEach(c => c.onclick = () => { cur.type = c.dataset.tp; setActive("#typeChips", c); renderPapers(); });
    $("#searchBox").oninput = (e) => { cur.q = e.target.value.trim(); renderPapers(); };
  }
  function setActive(sel, el) { E.qsa(sel + " .chip").forEach(c => c.classList.remove("active")); el.classList.add("active"); }

  function renderPapers() {
    const grid = $("#paperGrid");
    const empty = $("#paperEmpty");
    let items = DATA.filter(d => d.subject === cur.subject);
    if (cur.level !== "all") items = items.filter(d => String(d.level) === cur.level);
    if (cur.year !== "all") items = items.filter(d => d.year === cur.year);
    if (cur.type !== "all") items = items.filter(d => d.tags.type === cur.type);
    if (cur.q) items = items.filter(d => d.title.includes(cur.q));

    if (!items.length) {
      grid.innerHTML = "";
      if (empty) empty.style.display = "block";
      return;
    }
    if (empty) empty.style.display = "none";

    const meta = metaOf(cur.subject);
    grid.innerHTML = items.map(d => {
      const prog = E.getProgress(d.id);
      const cls = ({ "未开始": "s0", "进行中": "s1", "已完成": "s2", "已掌握": "s3" })[prog] || "s0";
      return `<div class="paper-card-blue" data-pid="${d.id}">
        <div class="pcb-head" style="background:${meta.color}">
          <div class="pcb-tag">${meta.org}</div>
          <div class="pcb-lv">${meta.short} ${d.levelName || (d.level + "级")}</div>
          <div class="pcb-sub">${d.year}年 ${d.tags.type}</div>
          <div class="pcb-org">-历年真题-</div>
        </div>
        <div class="pcb-body">
          <h4>${E.esc(d.title)}</h4>
          <div class="pcb-tags">
            <span class="tag year">${d.year}年</span>
            <span class="tag type">${d.tags.type}</span>
            <span class="tag prog ${cls}">${prog}</span>
          </div>
          <div class="pcb-actions">
            <a class="btn ghost sm" href="/paper.html?pid=${d.id}">试卷阅览</a>
            <a class="btn amber sm" href="/exam.html?pid=${d.id}">开始考试</a>
          </div>
        </div>
      </div>`;
    }).join("");
  }

  /* ---------- 启动 ---------- */
  (function start() {
    const cu = E.currentUserObj();
    if (cu && E.isApproved()) { enterHome(); return; }
    if (cu) { showPending(); return; }
    // 未登录：根据 hash 决定显示登录还是注册
    if (location.hash === "#register") mode = "register";
    else mode = "login";
    bindAuth();
  })();
})();
