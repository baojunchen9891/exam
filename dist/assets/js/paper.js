/* 试卷阅览: 展示真题 + 收藏 + 下载Word */
(function () {
  const E = EXAM, $ = E.qs;
  if (!E.requireLogin()) return;
  E.renderNav("home");

  const pid = new URLSearchParams(location.search).get("pid");
  if (!pid) { location.href = "/index.html"; return; }

  let PAPER = null, showAns = false;

  async function init() {
    try {
      const idx = await E.loadJSON("data/index.json");
      const meta = idx.find(d => d.id === pid);
      PAPER = await E.loadJSON("data/papers/" + pid + ".json");
      if (meta) PAPER.meta = meta;
    } catch (e) { E.toast("加载失败: " + e.message); return; }
    renderHead();
    renderQuestions();
    bind();
  }

  function renderHead() {
    const m = PAPER.meta || {};
    $("#headBox").innerHTML = `<h2 class="section-title" style="margin-bottom:6px">${E.esc(PAPER.title)}</h2>
      <div class="meta" style="color:var(--muted)">共 ${PAPER.count} 题 · 时长 ${m.durationMin || 60} 分钟 · 总分 ${m.totalScore || 100} · 及格 ${m.passScore || 60}</div>`;
    $("#stat").textContent = `已收藏 ${E.favs().filter(x => x.paperId === pid).length} 题`;
  }

  function renderQuestions() {
    $("#paperContent").innerHTML = PAPER.questions.map((q, i) =>
      E.renderQuestion(q, { mode: "view", paperId: pid, showFav: true, showAnswer: showAns, seq: i + 1 })).join("");
  }

  function bind() {
    $("#toggleAns").onclick = () => {
      showAns = !showAns;
      $("#toggleAns").textContent = showAns ? "隐藏答案" : "显示答案";
      renderQuestions();
    };
    $("#paperContent").addEventListener("click", (e) => {
      const b = e.target.closest("[data-fav]");
      if (!b) return;
      // q.no 可能重复,改用 qcard 的 id="qN" 解析下标 (seq 与下标差 1)
      const card = b.closest(".qcard");
      let q = null;
      if (card && card.id && /^q\d+$/.test(card.id)) {
        const seq = +card.id.slice(1);
        q = PAPER.questions[seq - 1];
      }
      if (!q) q = PAPER.questions.find(x => x.no === +b.dataset.fav);
      const on = E.toggleFav({ paperId: pid, title: PAPER.title, no: q.no, type: q.type, stem: q.stem, options: q.options, answer: q.answer, analysis: q.analysis });
      b.classList.toggle("on", on);
      b.textContent = on ? "★ 已收藏" : "☆ 收藏";
      $("#stat").textContent = `已收藏 ${E.favs().filter(x => x.paperId === pid).length} 题`;
      E.toast(on ? "已加入收藏" : "已取消收藏");
    });
    $("#dlWord").onclick = downloadWord;
  }

  /* ---------- 生成 Word(.doc, HTML格式) ---------- */
  function downloadWord() {
    const esc = E.esc;
    let body = `<h1 style="text-align:center">${esc(PAPER.title)}</h1>`;
    body += `<p style="text-align:center;color:#666">共 ${PAPER.count} 题</p>`;
    PAPER.questions.forEach((q, i) => {
      body += `<p><b>第 ${i + 1} 题 【${esc(q.type)}】(原题号 ${esc(q.no)})</b></p>`;
      body += `<p>${E.segHtml(q.stem)}</p>`;
      if (q.options && q.options.length) {
        q.options.forEach(o => { body += `<p>${o.key}. ${E.segHtml(o.content)}</p>`; });
      }
    });
    body += `<hr><h2>答案与解析</h2>`;
    PAPER.questions.forEach((q, i) => {
      body += `<p><b>第 ${i + 1} 题</b>(原题号 ${esc(q.no)}) 正确答案：<b>${esc(q.answer || "（编程题，人工判分）")}</b>`;
      if (q.analysis) body += `　解析：${esc(q.analysis)}`;
      body += `</p>`;
    });
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body>${body}</body></html>`;
    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = PAPER.title + ".doc";
    a.click();
    URL.revokeObjectURL(a.href);
    E.toast("Word 已生成");
  }

  init();
})();
