/* 管理员后台: 登录守卫 + 统计 + 用户审核(云端 account 体系) */
(function () {
  const E = EXAM;
  const $ = E.qs;

  function showLogin(msg) {
    $("#adminMain").style.display = "none";
    const a = $("#adminAuth"); a.style.display = "flex";
    if (msg) $("#adminErr").textContent = msg;
    $("#adminLoginBtn").onclick = doAdminLogin;
    $("#adminPw").addEventListener("keydown", e => { if (e.key === "Enter") doAdminLogin(); });
  }

  async function doAdminLogin() {
    const u = $("#adminUser").value.trim(), p = $("#adminPw").value;
    const r = await E.login(u, p);
    if (!r.ok) { $("#adminErr").textContent = r.msg; return; }
    if (!E.isAdmin()) { E.logout(); $("#adminErr").textContent = "该账号不是管理员，无法进入后台"; return; }
    bootAdmin();
  }

  if (!E.isLogin()) { showLogin("请使用管理员账号登录"); return; }
  if (!E.isAdmin()) { showLogin("当前账号不是管理员，请使用管理员账号登录"); return; }
  bootAdmin();

  // 重置密码结果弹窗：展示新随机密码，支持一键复制并提醒发给用户
  function showResetModal(name, pw) {
    let m = document.getElementById("resetModal");
    if (!m) {
      m = document.createElement("div");
      m.id = "resetModal";
      m.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;z-index:9999";
      document.body.appendChild(m);
    }
    m.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:28px;max-width:420px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,.2)">
        <h3 style="margin:0 0 8px;font-size:20px">已为用户「${E.esc(name)}」重置密码</h3>
        <p style="color:var(--color-slate-500);font-size:13px;margin:0 0 14px">请将下方新密码通过安全方式发给该用户，并提醒其登录后及时修改。</p>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px">
          <code id="rpw" style="flex:1;font-size:22px;letter-spacing:2px;background:var(--color-slate-100);padding:12px;border-radius:10px;text-align:center;font-family:ui-monospace,monospace">${E.esc(pw)}</code>
          <button id="rcopy" style="padding:12px 14px;border:0;border-radius:10px;background:var(--color-primary);color:#fff;cursor:pointer;font-size:14px">复制</button>
        </div>
        <button id="rclose" style="width:100%;padding:11px;border:0;border-radius:10px;background:var(--color-slate-600);color:#fff;cursor:pointer;font-size:14px">关闭</button>
      </div>`;
    m.style.display = "flex";
    const close = () => { m.style.display = "none"; };
    m.querySelector("#rclose").onclick = close;
    m.querySelector("#rcopy").onclick = () => {
      const done = () => E.toast("已复制新密码");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pw).then(done).catch(() => { window.prompt("复制下面的新密码：", pw); });
      } else {
        window.prompt("复制下面的新密码：", pw);
      }
    };
    m.onclick = (e) => { if (e.target === m) close(); };
  }


  async function bootAdmin() {
    try {
      $("#adminAuth").style.display = "none";
      $("#adminMain").style.display = "block";
      E.renderNav("admin");

      let filter = "all";
      let cloudExams = 0;

      function fmtDate(ts) {
        if (!ts) return "—";
        const d = new Date(ts);
        const p = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
      }

      const statusBadge = (u) => {
        if (u.role === "admin") return `<span class="badge admin">管理员</span>`;
        if (u.status === "pending") return `<span class="badge pending">待审核</span>`;
        if (u.status === "approved") return `<span class="badge approved">已通过</span>`;
        return `<span class="badge rejected">已拒绝</span>`;
      };

      // 统计：总用户 / 待审核 / 已通过 / 考试总次数(云端聚合，跨设备)
      function computeStats(list) {
        const total = list.length;
        const pending = list.filter(x => x.status === "pending").length;
        const approved = list.filter(x => x.status === "approved" || x.role === "admin").length;
        return { total, pending, approved, exams: cloudExams };
      }

      function renderStats(list) {
        const s = computeStats(list);
        const el = $("#stats");
        if (!el) return;
        el.innerHTML = `
          <div class="stat-card"><div class="n">${s.total}</div><div class="l">注册用户总数</div></div>
          <div class="stat-card"><div class="n" style="color:var(--amber)">${s.pending}</div><div class="l">待审核</div></div>
          <div class="stat-card"><div class="n" style="color:var(--color-success)">${s.approved}</div><div class="l">已通过 / 管理员</div></div>
          <div class="stat-card"><div class="n">${s.exams}</div><div class="l">累计考试次数</div></div>`;
      }

      function renderUsers(list) {
        let arr = list.slice();
        if (filter === "pending") arr = arr.filter(x => x.status === "pending");
        else if (filter === "approved") arr = arr.filter(x => x.status === "approved" || x.role === "admin");
        else if (filter === "rejected") arr = arr.filter(x => x.status === "rejected");
        arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const tbody = $("#userRows");
        const empty = $("#userEmpty");
        if (!tbody) return;
        if (!arr.length) { tbody.innerHTML = ""; if (empty) empty.style.display = "block"; return; }
        if (empty) empty.style.display = "none";
        tbody.innerHTML = arr.map(x => {
          const isAdmin = x.role === "admin";
          const ops = isAdmin
            ? `<span style="color:var(--color-text-meta)">—</span>`
            : `<button class="btn green sm" data-act="approve" data-n="${E.esc(x.name)}">通过</button>
               <button class="btn amber sm" data-act="reject" data-n="${E.esc(x.name)}">拒绝</button>
               <button class="btn blue sm" data-act="reset" data-n="${E.esc(x.name)}">重置密码</button>
               <button class="btn red sm" data-act="del" data-n="${E.esc(x.name)}">删除</button>`;
          return `<tr>
            <td><b>${E.esc(x.name)}</b></td>
            <td>${isAdmin ? "管理员" : "普通用户"}</td>
            <td>${fmtDate(x.createdAt)}</td>
            <td>${statusBadge(x)}</td>
            <td style="display:flex;gap:6px;flex-wrap:wrap">${ops}</td>
          </tr>`;
        }).join("");

        E.qsa("#userRows button[data-act]").forEach(b => b.onclick = async () => {
          const n = b.dataset.n, act = b.dataset.act;
          if (act === "approve") { await E.setStatus(n, "approved"); E.toast("已通过：" + n); }
          else if (act === "reject") { await E.setStatus(n, "rejected"); E.toast("已拒绝：" + n); }
          else if (act === "reset") {
            const r = await E.resetPw(n);
            if (!r.ok) E.toast("重置失败：" + (r.msg || "未知错误"));
            else showResetModal(n, r.pw);
          }
          else if (act === "del") {
            if (confirm("确认删除用户 " + n + "？")) { await E.delUser(n); E.toast("已删除：" + n); }
          }
          const fresh = await E.adminList();
          renderStats(fresh); renderUsers(fresh);
        });
      }

      function renderDebug(list) {
        const wrap = document.createElement("div");
        wrap.className = "container";
        wrap.style.marginTop = "24px";
        wrap.style.paddingBottom = "40px";
        wrap.innerHTML = `
          <div style="border:1px dashed var(--color-border);border-radius:12px;padding:14px;background:var(--color-slate-50);color:var(--color-slate-600);font-size:13px;line-height:1.6">
            <b>调试信息（云端账号体系）</b><br>
            当前登录：${E.esc(E.current() || "(无)")} &nbsp;|&nbsp; isAdmin：${E.isAdmin()}<br>
            云端用户数量：${list.length}
          </div>`;
        document.body.appendChild(wrap);
      }

      E.qsa(".chip[data-f]").forEach(c => c.onclick = () => {
        E.qsa(".chip[data-f]").forEach(x => x.classList.remove("active"));
        c.classList.add("active"); filter = c.dataset.f;
        E.adminList().then(list => renderUsers(list));
      });

      try { const sr = await E.getStats(); if (sr && sr.code === 0) cloudExams = (sr.data && sr.data.exams) || 0; } catch (e) {}
      const list = await E.adminList();
      renderStats(list);
      renderUsers(list);
      renderDebug(list);
    } catch (err) {
      console.error("bootAdmin error", err);
      const main = $("#adminMain");
      if (main) {
        const box = document.createElement("div");
        box.className = "container";
        box.innerHTML = `<div style="color:var(--color-red-700);background:var(--color-red-100);border:1px solid var(--color-red-200);border-radius:10px;padding:14px;margin-top:20px;font-size:14px">
          <b>后台加载出错</b><br>${E.esc(String(err && err.message || err))}<br>
          请按 F12 打开 Console，把红色报错截图发给开发者。
        </div>`;
        main.appendChild(box);
      }
    }
  }
})();
