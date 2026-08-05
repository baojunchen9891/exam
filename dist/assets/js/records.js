/* 我的记录: 考试记录 / 错题记录 / 收藏记录 */
(function () {
  const E = EXAM, $ = E.qs;
  if (!E.requireLogin()) return;
  E.renderNav("records");

  const KIND_NAME = { exam: "exam", wrong: "wrong", fav: "fav" };
  let kind = (location.hash || "#exam").slice(1);
  if (!KIND_NAME[kind]) kind = "exam";

  // 根据 URL hash 初始化页面 tab 高亮
  E.qsa(".rectabs .tab").forEach(t => {
    t.classList.toggle("active", t.dataset.k === kind);
  });

  function fmtDate(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function render() {
    const box = $("#recList");
    if (kind === "exam") return renderExam(box);
    if (kind === "wrong") return renderWrong(box);
    if (kind === "fav") return renderFav(box);
  }

  function renderExam(box) {
    const list = E.examRecords();
    if (!list.length) { box.innerHTML = empty("还没有考试记录，去首页开始一场模拟考试吧！"); return; }
    box.innerHTML = `<div class="reclist">` + list.map(r => {
      const pass = r.score >= (r.passScore || 60);
      return `<div class="reitem">
        <div class="t">${E.esc(r.title)}</div>
        <div class="m">${fmtDate(r.date)} · 用时 ${E.fmtTime(r.usedSec || 0)}</div>
        <div class="m" style="margin-top:6px">得分 <span class="scorebig" style="font-size:20px;color:${pass ? "var(--green)" : "var(--red)"}">${r.score}</span>
          · 正确 ${r.correct} · 错误 ${r.wrong} · 人工判分 ${r.manual}</div>
        <div class="toolbar" style="margin-top:8px">
          <a class="btn ghost sm" href="/paper.html?pid=${r.paperId}">查看试卷</a>
          <a class="btn amber sm" href="/exam.html?pid=${r.paperId}">重新考试</a>
        </div></div>`;
    }).join("") + `</div>`;
  }

  function renderWrong(box) {
    const list = E.wrongs();
    if (!list.length) { box.innerHTML = empty("还没有错题，继续保持！"); return; }
    box.innerHTML = `<div style="color:var(--muted);font-size:13px;margin-bottom:10px">共 ${list.length} 道错题（自动收录自模拟考试）</div>` +
      `<div class="reclist">` + list.map((w, i) => itemCard(w, "wrong", i)) + `</div>`;
  }

  function renderFav(box) {
    const list = E.favs();
    if (!list.length) { box.innerHTML = empty("还没有收藏题目，在试卷或考试中点击 ☆ 收藏吧！"); return; }
    box.innerHTML = `<div style="color:var(--muted);font-size:13px;margin-bottom:10px">共 ${list.length} 道收藏</div>` +
      `<div class="reclist">` + list.map((f, i) => itemCard(f, "fav", i)) + `</div>`;
  }

  function itemCard(it, k, i) {
    const q = { no: it.no, type: it.type, stem: it.stem, options: it.options, answer: it.answer, analysis: it.analysis };
    const head = `<div class="t" style="font-size:14px">${E.esc(it.title)} · 第 ${i + 1} 条（题型：${E.esc(it.type)}）</div>`;
    const body = E.renderQuestion(q, { mode: "view", showAnswer: true, seq: i + 1 });
    const act = k === "wrong"
      ? `<button class="btn ghost sm" data-rm="wrong" data-i="${i}">移除错题</button>`
      : `<button class="btn ghost sm" data-rm="fav" data-i="${i}">取消收藏</button>`;
    return `<div class="reitem">${head}${body}
      <div class="toolbar" style="margin-top:8px">
        <a class="btn ghost sm" href="/paper.html?pid=${it.paperId}">查看原卷</a>${act}</div></div>`;
  }

  function empty(msg) { return `<div class="empty">${msg}</div>`; }

  // 事件
  E.qsa(".rectabs .tab").forEach(t => t.onclick = () => {
    kind = t.dataset.k;
    location.hash = kind;
    E.qsa(".rectabs .tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    E.renderNav("records");
    render();
  });
  $("#recList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm]");
    if (!b) return;
    const arr = b.dataset.rm === "wrong" ? E.wrongs() : E.favs();
    arr.splice(+b.dataset.i, 1);
    E.setRec(b.dataset.rm, arr);
    E.toast("已移除");
    render();
  });

  (async () => { await E.ensureStudy(); render(); })();
})();
