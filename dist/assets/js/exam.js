/* 开始考试: 计时 + 逐题作答 + 判卷 + 错题收录 + 收藏 + 进展更新 */
(function () {
  const E = EXAM, $ = E.qs;
  if (!E.requireLogin()) return;
  E.renderNav("home");

  const pid = new URLSearchParams(location.search).get("pid");
    if (!pid) { location.href = "/index.html"; return; }

    // 监听 hash 变化(用户直接改 URL / 浏览器前进后退 / 滚动到 #qN)
    function jumpFromHash() {
      const m = (location.hash || "").match(/^#q(\d+)$/);
      if (!m) return false;
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= PAPER.questions.length) {
        if (curIdx !== n - 1) { curIdx = n - 1; renderQnav(); renderCurrent(); return true; }
      }
      return false;
    }
    window.addEventListener("hashchange", jumpFromHash);

    let PAPER = null, META = null;
    let answers = {};            // 数组下标 -> string | string[]   按 idx 存,避免 q.no 题型分块重复时冲突
    let curIdx = 0, timer = null, remaining = 0, submitted = false;

    async function init() {
      try {
        const idx = await E.loadJSON("data/index.json");
        META = idx.find(d => d.id === pid);
        PAPER = await E.loadJSON("data/papers/" + pid + ".json");
      } catch (e) { E.toast("加载失败: " + e.message); return; }
      $("#examTitle").textContent = PAPER.title;
      // 先按 URL hash 定位初始题(分享/书签/前进后退),若无 hash 默认第 1 题并写入 hash 保持一致
      const fromHash = jumpFromHash();
      if (!fromHash) location.hash = "q1";
      E.setProgress(pid, "进行中");
      startTimer((META ? META.durationMin : 60) * 60);
      renderQnav();
      renderCurrent();
      bind();
    }

  /* ---------- 计时 ---------- */
  function startTimer(sec) {
    remaining = sec;
    updateTimer();
    timer = setInterval(() => {
      remaining--;
      updateTimer();
      if (remaining <= 0) { clearInterval(timer); submit(true); }
    }, 1000);
  }
  function updateTimer() {
    const t = $("#timer");
    t.textContent = E.fmtTime(remaining);
    t.classList.toggle("warn", remaining <= 300);
  }

  /* ---------- 渲染 ---------- */
  function renderQnav() {
    $("#qnav").innerHTML = PAPER.questions.map((q, i) => {
      const ans = answers[i];
      const done = ans !== undefined && (Array.isArray(ans) ? ans.length : ans);
      const cur = i === curIdx ? " cur" : "";
      const d = done ? " done" : "";
      return `<span class="qn${cur}${d}" data-i="${i}">${i + 1}</span>`;
    }).join("");
    E.qsa("#qnav .qn").forEach(n => n.onclick = () => {
      curIdx = +n.dataset.i;
      location.hash = "q" + (curIdx + 1);
      renderQnav(); renderCurrent();
    });
  }
  function renderCurrent() {
    const q = PAPER.questions[curIdx];
    const ans = answers[curIdx];
    $("#examArea").innerHTML = E.renderQuestion(q, { mode: "exam", paperId: pid, showFav: true, selected: ans, seq: curIdx + 1 });
    bindQuestion(q, curIdx);
  }
  function bindQuestion(q, idx) {
    const area = $("#examArea");
    area.querySelectorAll("[data-pick]").forEach(el => {
      el.onclick = () => {
        const key = el.dataset.key, multi = el.dataset.pick === "multi";
        if (multi) {
          let arr = Array.isArray(answers[idx]) ? answers[idx].slice() : [];
          const i = arr.indexOf(key);
          if (i >= 0) arr.splice(i, 1); else arr.push(key);
          answers[idx] = arr.sort();
        } else {
          answers[idx] = key;
        }
        renderCurrent(); renderQnav();
      };
    });
    const fb = area.querySelector("[data-fav]");
    if (fb) fb.onclick = () => {
      const on = E.toggleFav({ paperId: pid, title: PAPER.title, no: q.no, type: q.type, stem: q.stem, options: q.options, answer: q.answer, analysis: q.analysis });
      fb.classList.toggle("on", on);
      fb.innerHTML = on ? '<i data-lucide="star"></i> 已收藏' : '<i data-lucide="star" class="icon-star-empty"></i> 收藏';
      E.toast(on ? "已加入收藏" : "已取消收藏");
    };
  }

  function bind() {
    $("#prevBtn").onclick = () => { if (curIdx > 0) { curIdx--; location.hash = "q" + (curIdx + 1); renderQnav(); renderCurrent(); } };
    $("#nextBtn").onclick = () => { if (curIdx < PAPER.questions.length - 1) { curIdx++; location.hash = "q" + (curIdx + 1); renderQnav(); renderCurrent(); } };
    $("#submitBtn").onclick = () => submit(false);
    $("#reviewBtn").onclick = () => { $("#resultModal").style.display = "none"; location.hash = "q" + (curIdx + 1); window.scrollTo(0, 0); };
  }

  /* ---------- 判卷 ---------- */
  function grade() {
    let correct = 0, wrong = 0, auto = 0, manual = 0;
    const detail = [];
    PAPER.questions.forEach(q => {
      if (!q.auto) { manual++; detail.push({ no: q.no, correct: null }); return; }
      auto++;
      const sel = answers[q.no];
      const right = Array.isArray(q.answer) ? q.answer.slice().sort().join("") : q.answer;
      const got = Array.isArray(sel) ? sel.slice().sort().join("") : (sel || "");
      const ok = got === right;
      if (ok) correct++; else wrong++;
      detail.push({ no: q.no, correct: ok, selected: sel });
      if (!ok) E.addWrong({ paperId: pid, title: PAPER.title, no: q.no, type: q.type, stem: q.stem, options: q.options, answer: q.answer, analysis: q.analysis, yourAnswer: sel || "（未作答）" });
    });
    const score = auto ? Math.round(correct / auto * 100) : 0;
    return { correct, wrong, auto, manual, score, detail };
  }

  function submit(auto) {
    if (submitted) return;
    submitted = true;
    clearInterval(timer);
    const r = grade();
    E.addExamRecord({
      paperId: pid, title: PAPER.title, date: new Date().toISOString(),
      score: r.score, correct: r.correct, wrong: r.wrong, auto: r.auto, manual: r.manual,
      usedSec: (META ? META.durationMin : 60) * 60 - remaining,
      detail: r.detail,
    });
    E.setProgress(pid, "已完成");
    showResult(r, auto);
  }

  function showResult(r, auto) {
    const pass = META ? META.passScore : 60;
    const passed = r.score >= pass;
    $("#resultBody").innerHTML = `
      <div class="scorebig" style="color:${passed ? "var(--color-success)" : "var(--color-danger)"}">${r.score} 分</div>
      <div class="m" style="color:var(--color-text-meta)">${passed ? '<i data-lucide="party-popper"></i> 恭喜，已及格！' : "未及格，继续加油！"}（及格线 ${pass}）</div>
      <div class="reitem" style="margin-top:12px">
        <div class="t">答题统计</div>
        <div class="m">自动判分：${r.auto} 题 · 正确 <b style="color:var(--color-success)">${r.correct}</b> · 错误 <b style="color:var(--color-danger)">${r.wrong}</b></div>
        <div class="m">编程/操作题（人工判分）：${r.manual} 题</div>
        <div class="m">错题已自动收录到「错题记录」</div>
      </div>`;
    $("#resultModal").style.display = "flex";
    // 复盘: 用阅卷高亮重渲染全部题目
    $("#examArea").innerHTML = PAPER.questions.map(q => {
      const d = r.detail.find(x => x.no === q.no);
      return E.renderQuestion(q, { mode: "exam", paperId: pid, selected: d ? d.selected : undefined, review: q.auto, showFav: false });
    }).join("");
  }

  init();
})();
