// Daily Wordle. Answer rotates through a pre-shuffled list by day number;
// progress for today persists in localStorage.
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const board = $("w-board"), kbd = $("w-kbd"), msg = $("w-msg"), status = $("wordle-status");
  const ROWS = 6, COLS = 5;
  let answer = "", allowedSet = null;
  let guesses = [], current = "", finished = false;
  const todayKey = new Date().toDateString();

  fetch("data/words.json").then(r => r.json()).then(({ answers, allowed }) => {
    allowedSet = new Set(allowed);
    answer = answers[(window.MB_DAYNUM || 0) % answers.length];
    restore();
    render();
  }).catch(() => { msg.textContent = "Couldn't load the word list."; });

  function stateLoad() { try { return JSON.parse(localStorage.getItem("mb_wordle")) || null; } catch { return null; } }
  function stateSave() {
    localStorage.setItem("mb_wordle", JSON.stringify({ day: todayKey, guesses }));
  }
  function restore() {
    const s = stateLoad();
    if (s && s.day === todayKey) {
      guesses = s.guesses || [];
      if (guesses.includes(answer)) finish(true, false);
      else if (guesses.length >= ROWS) finish(false, false);
    }
  }

  function scoreGuess(guess) {
    // standard duplicate-aware scoring
    const res = new Array(COLS).fill("absent");
    const remaining = {};
    for (let i = 0; i < COLS; i++) {
      if (guess[i] === answer[i]) res[i] = "correct";
      else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < COLS; i++) {
      if (res[i] === "correct") continue;
      if (remaining[guess[i]] > 0) { res[i] = "present"; remaining[guess[i]]--; }
    }
    return res;
  }

  function keyStates() {
    const rank = { absent: 0, present: 1, correct: 2 };
    const states = {};
    for (const g of guesses) {
      const sc = scoreGuess(g);
      for (let i = 0; i < COLS; i++) {
        const k = g[i];
        if (!(k in states) || rank[sc[i]] > rank[states[k]]) states[k] = sc[i];
      }
    }
    return states;
  }

  function render() {
    board.innerHTML = "";
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement("div");
      row.className = "w-row";
      const g = guesses[r];
      const isCurrent = r === guesses.length && !finished;
      const sc = g ? scoreGuess(g) : null;
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement("div");
        cell.className = "w-cell";
        if (g) {
          cell.textContent = g[c];
          cell.classList.add(sc[c]);
        } else if (isCurrent && current[c]) {
          cell.textContent = current[c];
          cell.classList.add("filled");
        }
        row.appendChild(cell);
      }
      board.appendChild(row);
    }
    renderKbd();
    status.textContent = finished ? (guesses.includes(answer) ? `Solved in ${guesses.length}` : "Done") :
      guesses.length ? `${guesses.length}/6` : "";
  }

  function renderKbd() {
    const states = keyStates();
    const rows = ["qwertyuiop", "asdfghjkl", "!zxcvbnm<"];
    kbd.innerHTML = "";
    for (const r of rows) {
      const div = document.createElement("div");
      div.className = "krow";
      for (const ch of r) {
        const b = document.createElement("button");
        if (ch === "!") { b.textContent = "Enter"; b.className = "wide"; b.dataset.k = "enter"; }
        else if (ch === "<") { b.textContent = "⌫"; b.className = "wide"; b.dataset.k = "back"; }
        else { b.textContent = ch; b.dataset.k = ch; if (states[ch]) b.classList.add(states[ch]); }
        b.addEventListener("click", () => press(b.dataset.k));
        div.appendChild(b);
      }
      kbd.appendChild(div);
    }
  }

  function press(k) {
    if (finished || !answer) return;
    msg.textContent = "";
    if (k === "back") { current = current.slice(0, -1); }
    else if (k === "enter") {
      if (current.length !== COLS) { msg.textContent = "Not enough letters."; return; }
      if (!allowedSet.has(current)) { msg.textContent = "Not in the word list."; return; }
      guesses.push(current);
      const won = current === answer;
      current = "";
      stateSave();
      if (won) return finish(true, true);
      if (guesses.length >= ROWS) return finish(false, true);
    } else if (/^[a-z]$/.test(k) && current.length < COLS) {
      current += k;
    }
    render();
  }

  function finish(won, announce) {
    finished = true;
    if (announce) msg.textContent = won ? ["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!"][guesses.length - 1] : `It was "${answer.toUpperCase()}".`;
    else msg.textContent = won ? "Solved today's puzzle." : `It was "${answer.toUpperCase()}".`;
    render();
  }

  document.addEventListener("keydown", e => {
    if ($("wordle-game").hidden) return;
    if (e.target.tagName === "INPUT") return;
    if (e.key === "Enter") press("enter");
    else if (e.key === "Backspace") press("back");
    else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
  });
})();
