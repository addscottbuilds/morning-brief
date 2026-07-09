// Daily 5x5 mini: a word square where every row AND column is a word.
// Uses its own on-screen keyboard (like Wordle) instead of text inputs, so
// the iOS system keyboard never opens — the clue bar, grid, and keys all
// stay visible while solving. Progress and stats persist on-device.
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const gridEl = $("x-grid"), clueBar = $("x-clue-bar"), status = $("xword-status"), kbd = $("x-kbd");
  const N = 5;
  const DAY = window.MB_DAYNUM || 0;
  let puzzle = null, solution = "", letters = new Array(N * N).fill("");
  let active = 0, dir = "across"; // or "down"
  let startedAt = null, revealed = false, recorded = false, todayMs = null;
  const wrongMarks = new Set(); // set by Check, cleared as cells are edited
  const todayKey = new Date().toDateString();
  const cells = [];

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

  // ------- persistence -------
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

  // ------- setup -------
  fetch("data/crosswords.json").then(r => r.json()).then(({ puzzles }) => {
    puzzle = puzzles[DAY % puzzles.length];
    solution = puzzle.rows.join("");
    restore();
    build();
    render();
  }).catch(() => { clueBar.textContent = "Couldn't load today's puzzle."; });

  function build() {
    gridEl.innerHTML = "";
    for (let i = 0; i < N * N; i++) {
      const cell = document.createElement("div");
      cell.className = "x-cell";
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", `Row ${Math.floor(i / N) + 1} column ${(i % N) + 1}`);
      if (i < N || i % N === 0) {
        const num = document.createElement("span");
        num.className = "x-num";
        num.textContent = i < N && i % N === 0 ? "1" : i < N ? String(i + 1) : String(Math.floor(i / N) + 1);
        cell.appendChild(num);
      }
      const letter = document.createElement("span");
      letter.className = "x-letter";
      cell.appendChild(letter);
      cell.addEventListener("click", () => {
        if (i === active) dir = dir === "across" ? "down" : "across";
        else active = i;
        render();
      });
      gridEl.appendChild(cell);
      cells.push(cell);
    }

    // on-screen keyboard (no system keyboard — nothing to cover the clues)
    const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm<"];
    kbd.innerHTML = "";
    for (const r of rows) {
      const div = document.createElement("div");
      div.className = "krow";
      for (const ch of r) {
        const b = document.createElement("button");
        b.type = "button";
        if (ch === "<") { b.textContent = "⌫"; b.className = "wide"; b.dataset.k = "back"; }
        else { b.textContent = ch; b.dataset.k = ch; }
        b.addEventListener("click", () => key(b.dataset.k));
        div.appendChild(b);
      }
      kbd.appendChild(div);
    }

    const across = $("x-across"), down = $("x-down");
    across.innerHTML = puzzle.across.map((c, r) => `<li data-dir="across" data-n="${r}"><b>${r + 1}</b> ${escText(c)}</li>`).join("");
    down.innerHTML = puzzle.down.map((c, col) => `<li data-dir="down" data-n="${col}"><b>${col + 1}</b> ${escText(c)}</li>`).join("");
    document.querySelectorAll(".x-clues li").forEach(li => {
      li.addEventListener("click", () => {
        dir = li.dataset.dir;
        const n = Number(li.dataset.n);
        active = dir === "across" ? n * N : n;
        render();
      });
    });

    $("x-check").addEventListener("click", check);
    $("x-reveal").addEventListener("click", () => {
      if (!confirm("Reveal the whole grid? (Doesn't count toward your streak.)")) return;
      letters = solution.split("");
      revealed = true;
      wrongMarks.clear();
      stateSave();
      render();
    });
    $("x-clear").addEventListener("click", () => {
      if (!confirm("Clear all your letters?")) return;
      letters = new Array(N * N).fill("");
      wrongMarks.clear();
      stateSave();
      render();
    });
  }

  // ------- input -------
  function key(k) {
    if (!puzzle) return;
    if (k === "back") {
      if (letters[active]) letters[active] = "";
      else { step(-1); letters[active] = ""; }
      wrongMarks.delete(active);
    } else {
      letters[active] = k;
      if (!startedAt) { startedAt = Date.now(); }
      wrongMarks.delete(active);
      step(1);
    }
    stateSave();
    render();
  }

  function step(delta) {
    const r = Math.floor(active / N), c = active % N;
    if (dir === "across") {
      const nc = c + delta;
      if (nc >= 0 && nc < N) active = r * N + nc;
    } else {
      const nr = r + delta;
      if (nr >= 0 && nr < N) active = nr * N + c;
    }
  }

  function move(dx, dy) {
    const r = Math.floor(active / N), c = active % N;
    active = Math.min(N - 1, Math.max(0, r + dy)) * N + Math.min(N - 1, Math.max(0, c + dx));
  }

  // physical keyboard support (desktop)
  document.addEventListener("keydown", e => {
    if ($("xword-game").hidden || !puzzle) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.tagName === "INPUT") return; // e.g. the focus-list field
    if (/^[a-zA-Z]$/.test(e.key)) { key(e.key.toLowerCase()); e.preventDefault(); }
    else if (e.key === "Backspace") { key("back"); e.preventDefault(); }
    else if (e.key === "ArrowRight") { dir = "across"; move(1, 0); render(); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { dir = "across"; move(-1, 0); render(); e.preventDefault(); }
    else if (e.key === "ArrowDown") { dir = "down"; move(0, 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { dir = "down"; move(0, -1); render(); e.preventDefault(); }
  });

  // ------- check / render -------
  function check() {
    let allFilled = true;
    for (let i = 0; i < N * N; i++) {
      if (!letters[i]) { allFilled = false; continue; }
      if (letters[i] !== solution[i]) wrongMarks.add(i);
    }
    render();
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
      const cell = cells[i];
      cell.querySelector(".x-letter").textContent = (letters[i] || "").toUpperCase();
      cell.classList.toggle("active", i === active);
      cell.classList.toggle("in-word",
        i !== active && (dir === "across" ? Math.floor(i / N) === r : i % N === c));
      cell.classList.toggle("wrong", wrongMarks.has(i));
      cell.classList.toggle("solved", solved);
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
