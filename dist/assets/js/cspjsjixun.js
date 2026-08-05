/* CSP-J/S 初赛集训 — 前端驱动（着陆/模块/考点/工具/sprint 刷题） */
(function () {
  "use strict";
  var path = location.pathname;
  var inSub = path.indexOf("/cspjsjixun/") >= 0;
  var BASE = inSub ? "../data/cspjsjixun/" : "data/cspjsjixun/";
  var WRONG_KEY = "csp_wrong_v1";

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function getJSON(url) {
    return fetch(url + "?v=" + Date.now()).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  function getText(url) {
    return fetch(url + "?v=" + Date.now()).then(function (r) { return r.text(); });
  }
  function qidOf(path) { return path.replace(/\.php$/, "").replace(/\//g, "_"); }
  function modName(id) {
    return { logic: "计算机基础与逻辑", cpp: "C++ 程序语法", algo: "初赛基础算法",
      math: "竞赛专用数学", paper: "真题应试集训", onsite: "复赛实战体系" }[id] || id;
  }

  /* ---------- 着陆页 ---------- */
  function renderLanding() {
    getJSON(BASE + "cspjsjixun_index.json").then(function (idx) {
      // 模块
      var mg = $("#cspModuleGrid");
      mg.innerHTML = "";
      idx.modules.forEach(function (m) {
        var a = el("a", "csp-card", "");
        a.href = "/cspjsjixun/module.html?id=" + m.id;
        a.innerHTML =
          '<div class="csp-card-ico">📘</div>' +
          "<h3>" + esc(m.title) + "</h3>" +
          '<p>' + esc(m.desc) + "</p>" +
          '<div class="csp-card-meta"><span>📚 ' + m.kp + " 考点</span></div>";
        mg.appendChild(a);
      });
      // 工具
      var tg = $("#cspToolGrid");
      tg.innerHTML = "";
      idx.tools.forEach(function (t) {
        var a = el("a", "csp-card csp-card-cool", "");
        a.href = "/cspjsjixun/tool.html?id=" + t.id;
        a.innerHTML = "<h3>" + esc(t.title) + "</h3><p>" + esc(t.desc) + "</p>";
        tg.appendChild(a);
      });
      // 工具箱
      var bg = $("#cspToolboxGrid");
      bg.innerHTML = "";
      idx.toolbox.forEach(function (t) {
        var a = el("a", "csp-card csp-card-cool", "");
        a.href = "/cspjsjixun/tool.html?id=" + t.id;
        a.innerHTML = "<h3>" + esc(t.title) + "</h3><p>" + esc(t.desc) + "</p>";
        bg.appendChild(a);
      });
      renderProfile();
    }).catch(function (e) {
      ["#cspModuleGrid", "#cspToolGrid", "#cspToolboxGrid"].forEach(function (s) {
        var n = $(s); if (n) n.innerHTML = '<div class="csp-error">加载失败：' + esc(e.message) + "</div>";
      });
    });
  }

  function renderProfile() {
    var box = $("#cspProfile");
    if (!box) return;
    var wrong = readWrong();
    if (!wrong.length) { box.innerHTML = '<div class="csp-empty">完成一次冲刺后，失分画像将自动生成</div>'; return; }
    var byMod = {}, byType = {};
    wrong.forEach(function (w) {
      byMod[w.module] = (byMod[w.module] || 0) + 1;
      byType[w.type] = (byType[w.type] || 0) + 1;
    });
    var html = '<div class="csp-profile-grid">';
    html += '<div class="csp-profile-card"><h4>按题型</h4><ul>';
    Object.keys(byType).forEach(function (k) { html += "<li>" + esc(k) + "：<b>" + byType[k] + "</b></li>"; });
    html += "</ul></div>";
    html += '<div class="csp-profile-card"><h4>按模块</h4><ul>';
    Object.keys(byMod).forEach(function (k) { html += "<li>" + esc(modName(k)) + "：<b>" + byMod[k] + "</b></li>"; });
    html += "</ul></div></div>";
    html += '<a class="csp-btn-ghost" href="/cspjsjixun/sprint.html">去刷题补弱 →</a>';
    box.innerHTML = html;
  }

  /* ---------- 模块页 ---------- */
  function renderModule() {
    var id = new URLSearchParams(location.search).get("id") || "logic";
    getJSON(BASE + "cspjsjixun_index.json").then(function (idx) {
      var m = idx.modules.filter(function (x) { return x.id === id; })[0];
      if (!m) throw new Error("未知模块");
      $("#cspCrumbMod").textContent = m.title;
      $("#cspModTitle").textContent = m.title;
      $("#cspModMeta").innerHTML = '<span class="chip">📚 ' + m.kp + " 考点</span>";
      document.title = m.title + " · CSP-J/S 初赛集训";
      return getJSON(BASE + m.file).then(function (d) {
        $("#cspModIntro").innerHTML = '<p class="csp-lead">' + esc(d.intro || m.desc) + "</p>";
        var g = $("#cspLeafGrid");
        g.innerHTML = "";
        (d.leaves || []).forEach(function (lf) {
          var qid = qidOf(lf.path);
          var a = el("a", "csp-leaf-card", "");
          a.href = "/cspjsjixun/knowledge.html?id=" + qid;
          a.innerHTML = "<h4>" + esc(lf.title) + "</h4><p>" + esc(lf.desc || "查看考点详解") + "</p>";
          g.appendChild(a);
        });
        if (!d.leaves || !d.leaves.length) g.innerHTML = '<div class="csp-empty">该模块暂无叶子考点</div>';
      });
    }).catch(function (e) { $("#cspLeafGrid").innerHTML = '<div class="csp-error">加载失败：' + esc(e.message) + "</div>"; });
  }

  /* ---------- 考点页 ---------- */
  function renderKnowledge() {
    var id = new URLSearchParams(location.search).get("id");
    if (!id) { $("#cspLeafBody").innerHTML = '<div class="csp-error">缺少 id</div>'; return; }
    getJSON(BASE + "knowledge/" + id + ".json").then(function (d) {
      var mod = d.module || "paper";
      $("#cspCrumbMod").textContent = modName(mod);
      $("#cspCrumbMod").href = "/cspjsjixun/module.html?id=" + ({ logic: "logic", cpp: "cppbase", algo: "algorithm", math: "math", paper: "readpaper", onsite: "onsite" }[mod] || "logic");
      $("#cspCrumbLeaf").textContent = d.title || "考点";
      $("#cspLeafTitle").textContent = d.title || "考点";
      document.title = (d.title || "考点") + " · CSP-J/S 初赛集训";
      var info = [];
      if (d.score) info.push("分值 " + d.score);
      if (d.difficulty) info.push("难度 " + d.difficulty);
      if (d.frequency) info.push("考频 " + d.frequency);
      $("#cspLeafInfo").innerHTML = info.map(function (s) { return '<span class="chip">' + esc(s) + "</span>"; }).join("");
      // TOC
      var toc = $("#cspToc");
      toc.innerHTML = "";
      (d.sections || []).forEach(function (s, i) {
        var a = el("a", "csp-toc-item", esc(s.title));
        a.href = "#sec-" + (s.id || i);
        toc.appendChild(a);
      });
      // body
      var body = $("#cspLeafBody");
      body.innerHTML = "";
      (d.sections || []).forEach(function (s, i) {
        var sec = el("section", "csp-sec");
        sec.id = "sec-" + (s.id || i);
        sec.innerHTML = "<h3>" + esc(s.title) + "</h3>" + rewriteLinks(s.html || "");
        body.appendChild(sec);
      });
      if (!d.sections || !d.sections.length) body.innerHTML = '<div class="csp-empty">暂无内容</div>';
      $("#cspLeafFoot").innerHTML = '<a class="csp-btn-ghost" href="/cspjsjixun/sprint.html">📝 做几道相关题巩固一下</a>';
    }).catch(function (e) { $("#cspLeafBody").innerHTML = '<div class="csp-error">加载失败：' + esc(e.message) + "</div>"; });
  }

  function rewriteLinks(html) {
    // knowledge/X.php -> knowledge.html?id=knowledge_X ; cspjsjixun/... keep
    return html.replace(/href="(knowledge\/[^"]+\.php)"/g, function (_, p) {
      return 'href="/cspjsjixun/knowledge.html?id=' + qidOf(p) + '"';
    });
  }

  /* ---------- 工具页 ---------- */
  function renderTool() {
    var id = new URLSearchParams(location.search).get("id");
    if (!id) { $("#cspToolBody").innerHTML = '<div class="csp-error">缺少 id</div>'; return; }
    getJSON(BASE + "cspjsjixun_index.json").then(function (idx) {
      var t = (idx.tools || []).concat(idx.toolbox || []).filter(function (x) { return x.id === id; })[0];
      if (!t) throw new Error("未知工具");
      $("#cspToolCrumb").textContent = t.title;
      $("#cspToolTitle").textContent = t.title;
      $("#cspToolDesc").textContent = t.desc || "";
      document.title = t.title + " · CSP-J/S 初赛集训";
      var body = $("#cspToolBody");
      if (t.type === "content") {
        return getJSON(BASE + t.content).then(function (c) {
          body.innerHTML = '<div class="csp-tool-content">' + rewriteLinks(c.html || "") + "</div>";
        });
      } else {
        // questions launcher
        return getJSON(BASE + t.bank + "_questions.json").then(function (qd) {
          var n = (qd.questions || []).length;
          body.innerHTML =
            '<div class="csp-launch">' +
            '<p class="csp-lead">本工具共 <b>' + n + "</b> 道题，支持即时判分、错题入本。</p>" +
            '<a class="csp-btn" href="/cspjsjixun/sprint.html?bank=' + t.bank + '">▶ 开始练习（' + n + " 题）</a>" +
            '<a class="csp-btn-ghost" href="/cspjsjixun/sprint.html?bank=' + t.bank + '&mode=mock">⏱ 全真模考模式</a>' +
            "</div>";
        });
      }
    }).catch(function (e) { $("#cspToolBody").innerHTML = '<div class="csp-error">加载失败：' + esc(e.message) + "</div>"; });
  }

  /* ---------- sprint 刷题引擎 ---------- */
  function wrongAdd(q) {
    var w = readWrong();
    if (!w.some(function (x) { return x.qid === q.qid; })) { w.push({ qid: q.qid, module: q.module, type: q.type, stem: q.stem[0].t }); saveWrong(w); }
  }
  function readWrong() { try { return JSON.parse(localStorage.getItem(WRONG_KEY) || "[]"); } catch (e) { return []; } }
  function saveWrong(w) { try { localStorage.setItem(WRONG_KEY, JSON.stringify(w)); } catch (e) {} }

  function renderSprint() {
    var p = new URLSearchParams(location.search);
    var bank = p.get("bank") || "sprint";
    var mode = p.get("mode") || "practice";
    var body = $("#cspSprintBody");
    body.innerHTML = '<div class="csp-loading">加载题库…</div>';
    getJSON(BASE + bank + "_questions.json").then(function (qd) {
      var qs = qd.questions || [];
      if (!qs.length) { body.innerHTML = '<div class="csp-empty">暂无题目</div>'; return; }
      buildQuizUI(body, qs, bank, mode);
    }).catch(function (e) { body.innerHTML = '<div class="csp-error">加载失败：' + esc(e.message) + "</div>"; });
  }

  function buildQuizUI(body, qs, bank, mode) {
    var state = { idx: 0, right: 0, wrong: 0, answered: 0 };
    var wrong = [];
    var wrap = el("div", "csp-quiz");
    body.innerHTML = "";
    body.appendChild(wrap);

    function renderQ() {
      var q = qs[state.idx];
      var total = qs.length;
      wrap.innerHTML = "";
      var head = el("div", "csp-quiz-head");
      head.innerHTML =
        '<div class="csp-quiz-prog">第 <b>' + (state.idx + 1) + "</b> / " + total + " 题 · " +
        '<span class="csp-tag">' + esc(q.type) + "</span> · " +
        '<span class="csp-tag csp-tag-mod">' + esc(modName(q.module)) + "</span></div>";
      if (mode === "mock") {
        head.innerHTML += '<div class="csp-quiz-timer" id="cspTimer">⏱ 不限时</div>';
      }
      wrap.appendChild(head);

      var card = el("div", "csp-q-card");
      card.innerHTML = '<div class="csp-q-stem">' + esc(q.stem[0] ? q.stem[0].t : "") + "</div>";
      var opts = el("div", "csp-q-opts");
      if (q.type === "填空题") {
        var inp = el("input", "csp-q-fill");
        inp.type = "text"; inp.placeholder = "输入答案（多个答案用 / 分隔）";
        opts.appendChild(inp);
      } else {
        var multi = q.type === "多选题";
        (q.options || []).forEach(function (o) {
          var lab = el("label", "csp-q-opt");
          var input = el("input");
          input.type = multi ? "checkbox" : "radio";
          input.name = "quiz_" + state.idx;
          input.value = o.key;
          lab.appendChild(input);
          lab.appendChild(el("span", "csp-q-key", o.key));
          lab.appendChild(el("span", "csp-q-text", o.content[0] ? o.content[0].t : ""));
          opts.appendChild(lab);
        });
      }
      card.appendChild(opts);
      wrap.appendChild(card);

      var act = el("div", "csp-q-act");
      var submit = el("button", "csp-btn", "提交答案");
      var fb = el("div", "csp-q-fb");
      act.appendChild(submit);
      act.appendChild(fb);
      wrap.appendChild(act);

      var explain = el("div", "csp-q-explain");
      explain.style.display = "none";
      wrap.appendChild(explain);

      function getSel() {
        if (q.type === "填空题") return inp.value.trim();
        var sel = $all('input[name="quiz_' + state.idx + '"]:checked', wrap).map(function (x) { return x.value; });
        return multi ? sel.sort().join("") : (sel[0] || "");
      }
      function checkAns(sel) {
        if (q.type === "填空题") {
          var acc = String(q.answer).split("/").map(function (s) { return s.trim().toLowerCase(); });
          return acc.indexOf(sel.toLowerCase()) >= 0;
        }
        return sel === q.answer;
      }
      submit.onclick = function () {
        var sel = getSel();
        if (!sel && q.type !== "填空题") { fb.innerHTML = '<span class="csp-warn">请先选择答案</span>'; return; }
        var ok = checkAns(sel);
        state.answered++;
        if (ok) { state.right++; fb.innerHTML = '<span class="csp-ok">✅ 回答正确</span>'; }
        else {
          state.wrong++; fb.innerHTML = '<span class="csp-bad">❌ 回答错误，正确答案：<b>' + esc(q.answer) + "</b></span>";
          wrongAdd(q);
        }
        explain.style.display = "block";
        explain.innerHTML = "<h4>解析</h4><p>" + esc(q.analysis || "（无解析）") + "</p>";
        submit.disabled = true;
        // next button
        var next = el("button", "csp-btn csp-btn-next", state.idx + 1 >= total ? "查看成绩" : "下一题 →");
        act.appendChild(next);
        next.onclick = function () {
          if (state.idx + 1 >= total) { renderResult(); }
          else { state.idx++; renderQ(); }
        };
      };
    }

    function renderResult() {
      wrap.innerHTML = "";
      var r = el("div", "csp-result");
      var rate = state.answered ? Math.round(100 * state.right / state.answered) : 0;
      r.innerHTML =
        "<h2>练习完成 🎉</h2>" +
        '<div class="csp-result-score">正确率 <b>' + rate + "%</b></div>" +
        '<div class="csp-result-stats">共 ' + state.answered + " 题 · 对 " + state.right + " · 错 " + state.wrong + "</div>" +
        '<div class="csp-result-actions">' +
        '<button class="csp-btn" id="cspRetry">🔄 再来一次</button>' +
        '<a class="csp-btn-ghost" href="/cspjsjixun.html">返回集训首页</a>' +
        "</div>";
      wrap.appendChild(r);
      var retry = $("#cspRetry");
      if (retry) retry.onclick = function () { state.idx = 0; state.right = 0; state.wrong = 0; state.answered = 0; renderQ(); };
    }

    renderQ();
  }

  /* ---------- 路由 ---------- */
  function boot() {
    if (path.endsWith("cspjsjixun.html")) renderLanding();
    else if (path.indexOf("module.html") >= 0) renderModule();
    else if (path.indexOf("knowledge.html") >= 0) renderKnowledge();
    else if (path.indexOf("tool.html") >= 0) renderTool();
    else if (path.indexOf("sprint.html") >= 0) renderSprint();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
