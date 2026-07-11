// Daily Connections: find four groups of four among 16 words. Four mistakes
// allowed; difficulty runs yellow → purple. Progress and streaks persist
// on-device; puzzles rotate daily through the bank in data/connections.json.
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const gridEl = $("c-grid"), solvedEl = $("c-solved"), msgEl = $("c-msg"),
    livesEl = $("c-lives"), status = $("conn-status");
  const DAY = window.MB_DAYNUM || 0;
  const LEVELS = ["y", "g", "b", "p"];
  const EMOJI = { y: "🟨", g: "🟩", b: "🟦", p: "🟪" };
  const MAX_MISTAKES = 4;
  const todayKey = new Date().toDateString();

  let puzzle = null;          // {groups:[{theme, words[]}]}
  let wordLevel = new Map();  // WORD -> level letter
  let order = [];             // remaining words, display order
  let selected = new Set();
  let found = [];             // level letters of solved groups, in solve order
  let guesses = [];           // arrays of level letters, for the share grid
  let tried = new Set();      // guess signatures, to not charge repeats
  let mistakes = 0, over = false, won = false;

  // ------- stats -------
  function statsLoad() {
    try { return JSON.parse(localStorage.getItem("mb_conn_stats")) || {}; } catch { return {}; }
  }
  function recordResult(w) {
    const s = Object.assign({ played: 0, wins: 0, streak: 0, maxStreak: 0, perfect: 0, lastDay: -9, lastWinDay: -9 }, statsLoad());
    if (s.lastDay === DAY) return;
    s.played++; s.lastDay = DAY;
    if (w) {
      s.wins++;
      s.streak = s.lastWinDay === DAY - 1 ? s.streak + 1 : 1;
      s.lastWinDay = DAY;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
      if (mistakes === 0) s.perfect++;
    } else {
      s.streak = 0;
    }
    localStorage.setItem("mb_conn_stats", JSON.stringify(s));
  }
  function renderStats() {
    const s = Object.assign({ played: 0, wins: 0, streak: 0, maxStreak: 0, perfect: 0 }, statsLoad());
    const el = $("c-stats");
    if (!s.played) { el.innerHTML = ""; return; }
    el.innerHTML =
      `<span>Streak <b>${s.streak}</b></span><span>Max <b>${s.maxStreak}</b></span>` +
      `<span>Won <b>${s.wins}/${s.played}</b></span><span>Perfect <b>${s.perfect}</b></span>` +
      (over ? `<button class="share-btn" id="c-share">Share</button>` : "");
    const btn = $("c-share");
    if (btn) btn.addEventListener("click", share);
  }
  function share() {
    const grid = guesses.map(g => g.map(l => EMOJI[l]).join("")).join("\n");
    const text = `Morning Brief Connections #${DAY + 1} ${won ? (mistakes === 0 ? "🏆" : "✅") : "❌"}\n\n${grid}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => flash("Result copied!")).catch(() => {});
  }

  // ------- persistence -------
  function stateSave() {
    localStorage.setItem("mb_conn", JSON.stringify({ day: todayKey, found, guesses, mistakes, over, won }));
  }
  function restore() {
    try {
      const s = JSON.parse(localStorage.getItem("mb_conn"));
      if (s && s.day === todayKey) {
        found = s.found || []; guesses = s.guesses || [];
        mistakes = s.mistakes || 0; over = !!s.over; won = !!s.won;
        for (const g of guesses) tried.add(g.slice().sort().join(""));
      }
    } catch { /* fresh start */ }
  }

  // ------- setup -------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor((rand ? rand() : Math.random()) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  fetch("data/connections.json").then(r => r.json()).then(({ puzzles }) => {
    puzzle = puzzles[DAY % puzzles.length];
    puzzle.groups.forEach((g, i) => g.words.forEach(w => wordLevel.set(w, LEVELS[i])));
    restore();
    const foundSet = new Set(found);
    order = puzzle.groups
      .filter((_, i) => !foundSet.has(LEVELS[i]))
      .flatMap(g => g.words);
    shuffle(order, mulberry32(20260709 + DAY));
    bind();
    render();
  }).catch(() => { msgEl.textContent = "Couldn't load today's puzzle."; });

  function bind() {
    $("c-shuffle").addEventListener("click", () => { shuffle(order); render(); });
    $("c-deselect").addEventListener("click", () => { selected.clear(); render(); });
    $("c-submit").addEventListener("click", submit);
  }

  // ------- gameplay -------
  function groupOf(level) {
    return puzzle.groups[LEVELS.indexOf(level)];
  }

  function submit() {
    if (over || selected.size !== 4) return;
    const pick = [...selected];
    const wordSig = pick.slice().sort().join(",");
    if (tried.has(wordSig)) { flash("Already guessed that combination."); return; }
    tried.add(wordSig);

    const levels = pick.map(w => wordLevel.get(w));
    guesses.push(levels.slice());
    const counts = {};
    for (const l of levels) counts[l] = (counts[l] || 0) + 1;
    const best = Math.max(...Object.values(counts));

    if (best === 4) {
      const level = levels[0];
      found.push(level);
      order = order.filter(w => wordLevel.get(w) !== level);
      selected.clear();
      if (found.length === 4) {
        over = true; won = true;
        recordResult(true);
        flash(mistakes === 0 ? "Perfect — flawless solve! 🏆" : "Solved it — nice work!");
      } else {
        flash(`${groupOf(level).theme} ✔`);
      }
    } else {
      mistakes++;
      if (best === 3) flash("One away!");
      else flash("Not a group.");
      if (mistakes >= MAX_MISTAKES) {
        over = true; won = false;
        // reveal the remaining groups in difficulty order
        for (const l of LEVELS) if (!found.includes(l)) found.push(l);
        order = [];
        selected.clear();
        recordResult(false);
        flash("Out of guesses — here's how it grouped.");
      }
    }
    stateSave();
    render();
  }

  let flashTimer = null;
  function flash(text) {
    msgEl.textContent = text;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { if (!over) msgEl.textContent = ""; }, 2600);
  }

  // ------- render -------
  function render() {
    if (!puzzle) return;

    solvedEl.innerHTML = found.map(l => {
      const g = groupOf(l);
      return `<div class="c-row lv-${l}"><div class="c-theme">${esc(g.theme)}</div><div class="c-words">${g.words.map(esc).join(", ")}</div></div>`;
    }).join("");

    gridEl.innerHTML = "";
    for (const w of order) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "c-tile" + (selected.has(w) ? " sel" : "");
      tile.textContent = w;
      if (w.length > 9) tile.classList.add("long");
      tile.addEventListener("click", () => {
        if (over) return;
        if (selected.has(w)) selected.delete(w);
        else if (selected.size < 4) selected.add(w);
        tile.classList.toggle("sel", selected.has(w));
        $("c-submit").disabled = selected.size !== 4;
      });
      gridEl.appendChild(tile);
    }

    livesEl.innerHTML = "Mistakes: " + Array.from({ length: MAX_MISTAKES }, (_, i) =>
      `<span class="life${i < MAX_MISTAKES - mistakes ? " on" : ""}"></span>`).join("");

    $("c-submit").disabled = over || selected.size !== 4;
    $("c-shuffle").disabled = over;
    $("c-deselect").disabled = over;
    if (over) msgEl.textContent = won ? (mistakes === 0 ? "Perfect solve! 🏆" : "Solved — nice work!") : "Out of guesses — better luck tomorrow.";
    if (over && won) status.textContent = mistakes === 0 ? "Perfect" : "Solved";
    else if (over) status.textContent = "Done";
    else status.textContent = found.length ? `${found.length}/4` : "";
    renderStats();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
