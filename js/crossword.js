// Daily 5x5 mini: a word square where every row AND column is a word.
// Puzzle rotates through the bank by day number; progress saves on-device.
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const gridEl = $("x-grid"), clueBar = $("x-clue-bar"), status = $("xword-status");
  const N = 5;
  const DAY = window.MB_DAYNUM || 0;
  let puzzle = null, solution = "", letters = new Array(N * N).fill("");
  let active = 0, dir = "across"; // or "down"
  let startedAt = null, revealed = false, recorded = false, todayMs = null;
  const todayKey = new Date().toDateString();
  const inputs = [];

  // ------- streaks & stats -------
  function statsLoad() {
    try { return JSON.parse(localStorage.getItem("mb_xword_stats")) || {}; } catch { return {}; }
  }
  function recordSolve(legit, ms) {
    const s = Object.assign({ solved: 0, streak: 0, maxStreak: 0, lastSolveDay: -9, bestMs: null }, statsLoad());
    if (legit) {
      s.solved++;
      s.streak = s.lastSolveDay === DAY - 1 ? s.streak + 1 : 1;
      s.lastSolveDay = DAY;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
      if (ms != null && (s.bestMs == null || ms < s.bestMs)) s.bestMs = ms;
    } else {
      s.streak = 0; // revealed answers don't keep a streak alive
    }
    localStorage.setItem("mb_xword_stats", JSON.stringify(s));
  }
  function fmtMs(ms) {
    const t = Math.round(ms / 1000);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  }
  function renderStats() {
    const s = Object.assign({ solved: 0, streak: 0, maxStreak: 0, bestMs: null }, statsLoad());
    const el = $("x-stats");
    if (!s.solved && !recorded) { el.innerHTML = ""; return; }
    el.innerHTML =
      `<span>Streak <b>${s.streak}</b></span><span>Max <b>${s.maxStreak}</b></span>` +
      `<span>Solved <b>${s.solved}</b></span>` +
      (s.bestMs != null ? `<span>Best <b>${fmtMs(s.bestMs)}</b></span>` : "") +
      (todayMs != null ? `<span>Today <b>${fmtMs(todayMs)}</b></span>` : "");
  }

  fetch("data/crosswords.json").then(r => r.json()).then(({ puzzles }) => {
    puzzle = puzzles[(window.MB_DAYNUM || 0) % puzzles.length];
    solution = puzzle.rows.join("");
    restore();
    build();
    render();
  }).catch(() => { clueBar.textContent = "Couldn't load today's puzzle."; });

  function stateSave() {
    localStorage.setItem("mb_xword", JSON.stringify({ day: todayKey, letters, startedAt, revealed, recorded, todayMs }));
  }
  function restore() {
    try {
      const s = JSON.parse(localStorage.getItem("mb_xword"));
      if (s && s.day === todayKey && Array.isArray(s.letters)) {
        letters = s.letters;
        startedAt = s.startedAt || null;
        revealed = !!s.revealed;
        recorded = !!s.recorded;
        todayMs = s.todayMs ?? null;
      }
    } catch { /* fresh start */ }
  }

  function build() {
    gridEl.innerHTML = "";
    for (let i = 0; i < N * N; i++) {
      const cell = document.createElement("div");
      cell.className = "x-cell";
      const inp = document.createElement("input");
      inp.type = "text";
      inp.maxLength = 2; // allow overtype; we keep the last char
      inp.autocomplete = "off";
      inp.autocapitalize = "characters";
      inp.spellcheck = false;
      inp.dataset.i = i;
      inp.setAttribute("aria-label", `Row ${Math.floor(i / N) + 1} column ${(i % N) + 1}`);
      inp.addEventListener("focus", () => { setActive(i, dir, false); });
      inp.addEventListener("mousedown", e => {
        if (i === active) { dir = dir === "across" ? "down" : "across"; render(); e.preventDefault(); inp.focus(); }
      });
      inp.addEventListener("input", () => {
        const v = inp.value.replace(/[^a-zA-Z]/g, "").toLowerCase();
        letters[i] = v ? v[v.length - 1] : "";
        if (letters[i] && !startedAt) startedAt = Date.now(); // solve timer starts on first letter
        inp.classList.remove("wrong");
        stateSave();
        if (letters[i]) advance(1);
        render();
      });
      inp.addEventListener("keydown", e => {
        if (e.key === "Backspace" && !letters[i]) { advance(-1); e.preventDefault(); }
        else if (e.key === "ArrowRight") { dir = "across"; move(i, 1, 0); e.preventDefault(); }
        else if (e.key === "ArrowLeft") { dir = "across"; move(i, -1, 0); e.preventDefault(); }
        else if (e.key === "ArrowDown") { dir = "down"; move(i, 0, 1); e.preventDefault(); }
        else if (e.key === "ArrowUp") { dir = "down"; move(i, 0, -1); e.preventDefault(); }
      });
      // row/col numbers on first row and first column
      if (i < N || i % N === 0) {
        const num = document.createElement("span");
        num.className = "x-num";
        num.textContent = i < N && i % N === 0 ? "1" : i < N ? String(i + 1) : String(Math.floor(i / N) + 1);
        cell.appendChild(num);
      }
      cell.appendChild(inp);
      gridEl.appendChild(cell);
      inputs.push(inp);
    }

    const across = $("x-across"), down = $("x-down");
    across.innerHTML = puzzle.across.map((c, r) => `<li data-dir="across" data-n="${r}"><b>${r + 1}</b> ${escText(c)}</li>`).join("");
    down.innerHTML = puzzle.down.map((c, col) => `<li data-dir="down" data-n="${col}"><b>${col + 1}</b> ${escText(c)}</li>`).join("");
    document.querySelectorAll(".x-clues li").forEach(li => {
      li.addEventListener("click", () => {
        dir = li.dataset.dir;
        const n = Number(li.dataset.n);
        setActive(dir === "across" ? n * N : n, dir, true);
      });
    });

    $("x-check").addEventListener("click", check);
    $("x-reveal").addEventListener("click", () => {
      if (!confirm("Reveal the whole grid? (Doesn't count toward your streak.)")) return;
      letters = solution.split("");
      revealed = true;
      stateSave();
      render();
    });
    $("x-clear").addEventListener("click", () => {
      if (!confirm("Clear all your letters?")) return;
      letters = new Array(N * N).fill("");
      stateSave();
      render();
    });
  }

  function move(i, dx, dy) {
    const r = Math.floor(i / N), c = i % N;
    const nr = Math.min(N - 1, Math.max(0, r + dy));
    const nc = Math.min(N - 1, Math.max(0, c + dx));
    setActive(nr * N + nc, dir, true);
  }

  function advance(step) {
    const r = Math.floor(active / N), c = active % N;
    let ni = active;
    if (dir === "across") {
      const nc = c + step;
      if (nc >= 0 && nc < N) ni = r * N + nc;
    } else {
      const nr = r + step;
      if (nr >= 0 && nr < N) ni = nr * N + c;
    }
    setActive(ni, dir, true);
  }

  function setActive(i, d, focus) {
    active = i; dir = d;
    render();
    if (focus) inputs[i].focus();
  }

  function check() {
    let allFilled = true;
    for (let i = 0; i < N * N; i++) {
      if (!letters[i]) { allFilled = false; continue; }
      inputs[i].classList.toggle("wrong", letters[i] !== solution[i]);
    }
    if (!allFilled) clueBarFlash("Keep going — some cells are empty.");
    else if (letters.join("") !== solution) clueBarFlash("Something's off — wrong letters marked.");
  }

  function clueBarFlash(text) {
    clueBar.textContent = text;
    setTimeout(render, 2500);
  }

  function render() {
    if (!puzzle) return;
    const solved = letters.join("") === solution;
    if (solved && !recorded) {
      recorded = true;
      if (!revealed && startedAt) todayMs = Date.now() - startedAt;
      recordSolve(!revealed, todayMs);
      stateSave();
    }
    const r = Math.floor(active / N), c = active % N;
    for (let i = 0; i < N * N; i++) {
      const inp = inputs[i];
      inp.value = (letters[i] || "").toUpperCase();
      inp.classList.toggle("active", i === active);
      inp.classList.toggle("in-word",
        i !== active && (dir === "across" ? Math.floor(i / N) === r : i % N === c));
      inp.classList.toggle("solved", solved);
    }
    const n = dir === "across" ? r : c;
    const clue = dir === "across" ? puzzle.across[n] : puzzle.down[n];
    clueBar.textContent = solved ? "Solved — nice work! 🌅" : `${n + 1} ${dir === "across" ? "Across" : "Down"}: ${clue}`;
    document.querySelectorAll(".x-clues li").forEach(li => {
      li.classList.toggle("active", li.dataset.dir === dir && Number(li.dataset.n) === n);
    });
    const filled = letters.filter(Boolean).length;
    status.textContent = solved ? "Solved" : filled ? `${filled}/25` : "";
    renderStats();
  }

  function escText(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
})();
