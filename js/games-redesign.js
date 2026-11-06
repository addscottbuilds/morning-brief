// The lobby reads the three daily engines' existing status and opens their own tabs.
// Table talk is an optional, original puzzle with independent, in-memory progress.
const games = [
  {
    key: "wordle", name: "Wordle", pane: "wordle-game", board: "w-board",
    message: "w-msg", status: "wordle-status", mark: "word",
    description: "Find the five-letter word in six guesses.",
    progress: (current, total) => `${current} of ${total} guesses used`,
    rules: "Enter a five-letter word. A tick means the letter is in the right spot, an arrow means it belongs somewhere else, and a cross means it is absent."
  },
  {
    key: "xword", name: "Mini crossword", pane: "xword-game", board: "x-grid",
    message: "x-clue-bar", status: "xword-status", mark: "cross",
    description: "Fill a compact five-by-five grid.",
    progress: (current, total) => `${current} of ${total} squares filled`,
    rules: "Choose a square or clue and type with either keyboard. Select the same square again to switch between Across and Down."
  },
  {
    key: "conn", name: "Connections", pane: "conn-game", board: "c-grid",
    message: "c-msg", status: "conn-status", mark: "groups",
    description: "Sort 16 words into four groups.",
    progress: (current, total) => `${current} of ${total} groups found`,
    rules: "Select four words and submit a group. A word can seem to fit more than one idea. The game ends after four mistakes."
  }
];

const challengeGroups = [
  {
    name: "Part of a place setting",
    words: ["GLASS", "KNIFE", "NAPKIN", "SPOON"],
    candidates: ["FORK", "GLASS", "KNIFE", "NAPKIN", "SPOON"]
  },
  {
    name: "Poker table terms",
    words: ["ANTE", "CALL", "FOLD", "RAISE"],
    candidates: ["ANTE", "CALL", "CHECK", "FOLD", "RAISE", "WILD"]
  },
  {
    name: "Chess terms",
    words: ["CHECK", "FORK", "MATE", "PIN"],
    candidates: ["CHECK", "FORK", "MATE", "PIN"]
  },
  {
    name: "Words before CARD",
    words: ["CREDIT", "FLASH", "GREETING", "WILD"],
    candidates: ["CREDIT", "FLASH", "GREETING", "WILD"]
  }
];
const challengeOrder = [
  "CHECK", "GLASS", "FLASH", "RAISE",
  "NAPKIN", "ANTE", "FORK", "WILD",
  "GREETING", "CALL", "PIN", "KNIFE",
  "FOLD", "SPOON", "CREDIT", "MATE"
];

// Count every partition of the 16 tiles across the four named category memberships.
// This proves uniqueness relative to the encoded plausible fits, not to every imaginable theme.
export function challengeEvidence() {
  const all = (1 << challengeOrder.length) - 1;
  const fits = challengeGroups.map(group => {
    const indices = group.candidates.map(word => challengeOrder.indexOf(word));
    const masks = [];
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        for (let c = b + 1; c < indices.length; c++) {
          for (let d = c + 1; d < indices.length; d++) {
            masks.push((1 << indices[a]) | (1 << indices[b]) | (1 << indices[c]) | (1 << indices[d]));
          }
        }
      }
    }
    return masks;
  });
  function count(group, used) {
    if (group === fits.length) return used === all ? 1 : 0;
    return fits[group].reduce((total, mask) => (used & mask) ? total : total + count(group + 1, used | mask), 0);
  }
  return {
    covers: count(0, 0),
    overlaps: challengeOrder.filter(word => challengeGroups.filter(group => group.candidates.includes(word)).length > 1),
    tiles: [...challengeOrder],
    groups: challengeGroups.map(({ name, words }) => ({ name, words: [...words] }))
  };
}

function shuffle(words) {
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
}

export function createChallenge() {
  const mistakesAllowed = 4;
  const state = {
    words: [...challengeOrder],
    selected: new Set(),
    solved: new Set(),
    attempted: new Set(),
    mistakes: 0
  };
  return {
    state,
    get finished() { return state.mistakes === mistakesAllowed || state.solved.size === challengeGroups.length; },
    get remaining() { return mistakesAllowed - state.mistakes; },
    toggle(word) {
      if (this.finished || !state.words.includes(word)) return false;
      if (state.selected.delete(word)) return true;
      if (state.selected.size === 4) return false;
      state.selected.add(word);
      return true;
    },
    submit() {
      if (this.finished || state.selected.size !== 4) return null;
      const guess = [...state.selected].sort().join(",");
      if (state.attempted.has(guess)) return "You already tried that group. No mistake counted.";
      state.attempted.add(guess);
      const matches = challengeGroups.map(group => group.words.filter(word => state.selected.has(word)).length);
      const solvedIndex = matches.indexOf(4);
      if (solvedIndex !== -1) {
        state.solved.add(solvedIndex);
        state.words = state.words.filter(word => !state.selected.has(word));
        state.selected.clear();
        return this.finished ? "All four groups found. Sample complete." : `Group found. ${state.solved.size} of 4 solved.`;
      }
      state.mistakes += 1;
      if (this.finished) {
        state.selected.clear();
        return "No mistakes left. The answers are below.";
      }
      return matches.includes(3) ? "One away." : "Those four don't make a group.";
    },
    shuffle() { if (!this.finished) shuffle(state.words); }
  };
}

const byId = id => document.getElementById(id);

function dailyProgress(game) {
  const status = byId(game.status).textContent.trim();
  if (/^(solved|perfect)/i.test(status)) return { state: "solved", label: status, action: "Review" };
  if (status === "Done") return { state: "finished", label: "Finished today", action: "Review" };
  const fraction = /^(\d+)\/(\d+)$/.exec(status);
  if (fraction) return { state: "progress", label: game.progress(fraction[1], fraction[2]), action: "Resume" };
  const board = byId(game.board);
  if (game.key === "wordle" && board.querySelector(".w-cell.filled")) {
    return { state: "progress", label: "Guess in progress", action: "Resume" };
  }
  if (board.childElementCount || (game.key === "conn" && byId("c-solved").childElementCount)) {
    return { state: "ready", label: "Ready to play", action: "Play" };
  }
  if (/load|unavailable/i.test(byId(game.message).textContent)) {
    return { state: "error", label: "Couldn't load", action: "Open" };
  }
  return { state: "loading", label: "Loading", action: "Open" };
}

function describeBoard() {
  for (const cell of document.querySelectorAll("#w-board .w-cell")) {
    const letter = cell.textContent.trim().toUpperCase();
    if (!letter) { cell.setAttribute("aria-hidden", "true"); continue; }
    const meaning = cell.classList.contains("correct") ? "right position"
      : cell.classList.contains("present") ? "elsewhere in the word"
      : cell.classList.contains("absent") ? "not in the word" : "entered";
    cell.setAttribute("role", "img");
    cell.setAttribute("aria-label", `${letter}, ${meaning}`);
  }
  for (const button of document.querySelectorAll(".w-kbd button[data-k]")) {
    if (button.dataset.k === "back") button.setAttribute("aria-label", "Delete letter");
    if (button.classList.contains("correct")) button.setAttribute("aria-label", `${button.textContent.toUpperCase()}, right position`);
    else if (button.classList.contains("present")) button.setAttribute("aria-label", `${button.textContent.toUpperCase()}, elsewhere in the word`);
    else if (button.classList.contains("absent")) button.setAttribute("aria-label", `${button.textContent.toUpperCase()}, not in the word`);
  }
}

function describeCrossword() {
  const grid = byId("x-grid");
  const focusInside = grid.contains(document.activeElement);
  let current;
  for (const [index, cell] of Array.from(grid.querySelectorAll(".x-cell")).entries()) {
    const active = cell.classList.contains("active");
    const letter = cell.querySelector(".x-letter").textContent.trim();
    cell.tabIndex = active ? 0 : -1;
    cell.setAttribute("aria-label", `Row ${Math.floor(index / 5) + 1}, column ${index % 5 + 1}, ${letter || "blank"}${cell.classList.contains("wrong") ? ", incorrect" : ""}`);
    if (active) current = cell;
  }
  if (focusInside && current && document.activeElement !== current) current.focus({ preventScroll: true });
  for (const clue of document.querySelectorAll("#xword-game .x-clues li")) {
    let button = clue.querySelector("button");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.append(...clue.childNodes);
      clue.append(button);
    }
    button.setAttribute("aria-pressed", String(clue.classList.contains("active")));
  }
}

function describeConnections() {
  for (const tile of document.querySelectorAll("#c-grid .c-tile")) {
    tile.setAttribute("aria-pressed", String(tile.classList.contains("sel")));
  }
  const lives = byId("c-lives");
  if (!lives.firstChild) return;
  const remaining = lives.querySelectorAll(".life.on").length;
  lives.firstChild.data = `${remaining} mistake${remaining === 1 ? "" : "s"} left `;
  for (const marker of lives.querySelectorAll(".life")) marker.setAttribute("aria-hidden", "true");
}

function attachDailyAccessibility() {
  for (const id of ["w-msg", "x-clue-bar", "c-msg"]) byId(id).setAttribute("role", "status");
  byId("w-board").setAttribute("aria-label", "Wordle board");
  byId("w-board").setAttribute("role", "group");
  byId("x-grid").setAttribute("aria-label", "Crossword grid");
  byId("x-grid").setAttribute("role", "group");
  byId("c-grid").setAttribute("aria-label", "Connections words");
  byId("c-grid").setAttribute("role", "group");
  byId("x-grid").addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const cell = event.target.closest(".x-cell");
    if (!cell) return;
    event.preventDefault();
    cell.click();
  });
  byId("xword-game").querySelector(".x-clues").addEventListener("click", event => {
    if (!event.target.closest("li")) return;
    const cell = byId("x-grid").querySelector(".x-cell.active");
    if (!cell) return;
    cell.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    cell.focus({ preventScroll: true });
  });
  byId("w-kbd").addEventListener("click", event => {
    const key = event.target.closest("button")?.dataset.k;
    if (event.detail !== 0 || !key) return;
    queueMicrotask(() => {
      const replacement = [...byId("w-kbd").querySelectorAll("button")].find(button => button.dataset.k === key);
      replacement?.focus({ preventScroll: true });
    });
  }, { capture: true });
}

function challengePanel() {
  const panel = document.createElement("section");
  panel.className = "game-challenge-play game-pane";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Table talk sample");
  panel.innerHTML = `
    <p class="game-challenge-caption">Original sample. Progress stays in this tab.</p>
    <p class="game-challenge-message" role="status">Select four words that share a connection.</p>
    <div class="game-challenge-found"></div>
    <div class="game-challenge-tiles" role="group" aria-label="Challenge words"></div>
    <p class="game-challenge-counter"></p>
    <div class="game-challenge-actions">
      <button type="button" data-challenge-action="shuffle">Shuffle</button>
      <button type="button" data-challenge-action="clear">Clear</button>
      <button type="button" class="game-primary" data-challenge-action="submit">Submit</button>
    </div>
    <button type="button" class="game-challenge-reset" data-challenge-action="reset" hidden>Play again</button>
  `;
  const tiles = panel.querySelector(".game-challenge-tiles");
  const found = panel.querySelector(".game-challenge-found");
  const message = panel.querySelector(".game-challenge-message");
  const counter = panel.querySelector(".game-challenge-counter");
  const actions = panel.querySelector(".game-challenge-actions");
  const submit = panel.querySelector('[data-challenge-action="submit"]');
  const clear = panel.querySelector('[data-challenge-action="clear"]');
  const reset = panel.querySelector('[data-challenge-action="reset"]');
  let puzzle = createChallenge();
  const buttons = new Map();
  for (const word of challengeOrder) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "game-challenge-word";
    button.textContent = word;
    button.addEventListener("click", () => { if (puzzle.toggle(word)) paint(); });
    buttons.set(word, button);
  }
  function paint(text) {
    if (text) message.textContent = text;
    const { words, selected, solved } = puzzle.state;
    for (const [word, button] of buttons) {
      button.hidden = !words.includes(word);
      button.setAttribute("aria-pressed", String(selected.has(word)));
      button.disabled = puzzle.finished;
    }
    if ([...tiles.children].filter(button => !button.hidden).map(button => button.textContent).join() !== words.join()) {
      tiles.replaceChildren(...words.map(word => buttons.get(word)));
    }
    const showAnswers = puzzle.finished && puzzle.remaining === 0;
    const groupIndices = showAnswers ? challengeGroups.map((_, index) => index) : [...solved];
    const desired = groupIndices.join();
    if (found.dataset.groups !== desired) {
      found.dataset.groups = desired;
      found.replaceChildren(...groupIndices.map(index => {
        const group = challengeGroups[index];
        const row = document.createElement("div");
        row.className = `game-challenge-group game-challenge-group-${index}`;
        const title = document.createElement("strong");
        title.textContent = group.name;
        const words = document.createElement("span");
        words.textContent = group.words.join(" · ");
        row.append(title, words);
        return row;
      }));
    }
    tiles.hidden = puzzle.finished;
    actions.hidden = puzzle.finished;
    counter.textContent = puzzle.finished
      ? `${solved.size} of 4 groups solved`
      : `${selected.size} of 4 selected · ${puzzle.remaining} mistake${puzzle.remaining === 1 ? "" : "s"} left`;
    submit.disabled = selected.size !== 4;
    clear.disabled = selected.size === 0;
    reset.hidden = !puzzle.finished;
  }
  panel.addEventListener("click", event => {
    const action = event.target.closest("[data-challenge-action]")?.dataset.challengeAction;
    if (action === "shuffle") {
      puzzle.shuffle();
      paint();
    } else if (action === "clear") {
      puzzle.state.selected.clear();
      paint("Select four words that share a connection.");
      tiles.querySelector("button:not([hidden])")?.focus({ preventScroll: true });
    } else if (action === "submit") {
      paint(puzzle.submit());
      if (puzzle.finished) reset.focus({ preventScroll: true });
      else if (submit.disabled) tiles.querySelector("button:not([hidden])")?.focus({ preventScroll: true });
    } else if (action === "reset") {
      puzzle = createChallenge();
      paint("Select four words that share a connection.");
      tiles.querySelector("button")?.focus({ preventScroll: true });
    }
  });
  tiles.append(...buttons.values());
  paint();
  return {
    panel,
    started: () => puzzle.state.selected.size > 0 || puzzle.state.attempted.size > 0,
    finished: () => puzzle.finished
  };
}

function makeLobby() {
  const lobby = document.createElement("div");
  lobby.className = "game-edition-lobby";
  lobby.innerHTML = `
    <div class="game-edition-count">
      <span class="game-kicker">The daily three</span>
      <span id="game-edition-completion"></span>
    </div>
    <div class="game-edition-cards">
      ${games.map(game => `
        <button type="button" class="game-edition-card" data-edition-game="${game.key}">
          <span class="game-mark game-mark-${game.mark}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="game-edition-copy">
            <span class="game-edition-name">${game.name}</span>
            <span class="game-edition-description">${game.description}</span>
            <span class="game-edition-status" id="game-edition-status-${game.key}">Loading</span>
          </span>
          <span class="game-edition-action" id="game-edition-action-${game.key}">Open</span>
        </button>
      `).join("")}
    </div>
    <details class="game-edition-bonus">
      <summary>Bonus puzzle</summary>
      <div class="game-edition-extra">
        <div class="game-edition-extra-copy">
          <p class="game-kicker">Original bonus</p>
          <h2>Table talk</h2>
          <p>One harder Connections puzzle. Several words pull in two directions.</p>
          <button type="button" data-edition-game="challenge" class="game-edition-extra-action">Try the challenge</button>
          <p class="game-edition-extra-note">Separate from the daily streak.</p>
        </div>
        <div class="game-extra-diagram" aria-hidden="true"><span>T</span><span>A</span><span>L</span><span>K</span></div>
      </div>
    </details>
  `;
  return lobby;
}

function mount() {
  const page = byId("page-games");
  const tabs = byId("game-tabs");
  if (!page || !tabs || games.some(game => !byId(game.pane) || !byId(game.status))) return;
  const header = page.querySelector("header");
  const lobby = makeLobby();
  const play = document.createElement("div");
  play.className = "game-edition-play";
  play.hidden = true;
  play.innerHTML = `
    <div class="game-play-top">
      <button type="button" class="game-edition-back"><span aria-hidden="true">←</span> All games</button>
      <span class="game-play-progress"></span>
    </div>
    <h2 id="game-edition-play-title" tabindex="-1"></h2>
    <details class="game-edition-rules">
      <summary>How to play</summary>
      <p></p>
    </details>
  `;
  const challenge = challengePanel();
  const selectedTitle = play.querySelector("h2");
  const selectedProgress = play.querySelector(".game-play-progress");
  const rules = play.querySelector("details");
  const back = play.querySelector("button");
  rules.querySelector("summary").addEventListener("keydown", event => event.stopPropagation());
  const cardList = lobby.querySelector(".game-edition-cards");
  const cards = [...cardList.children];
  const bonus = lobby.querySelector(".game-edition-bonus");
  const challengeButton = lobby.querySelector('[data-edition-game="challenge"]');
  tabs.before(lobby, play);
  tabs.hidden = true;
  page.querySelector(".wrap").append(challenge.panel);
  page.classList.add("has-game-edition");
  let current = null;

  function update() {
    const progressByGame = games.map(dailyProgress);
    const preferred = current || localStorage.getItem("mb_game_tab");
    const featured = cards.find((card, i) => progressByGame[i].state === "progress" && card.dataset.editionGame === preferred)
      || cards.find((card, i) => progressByGame[i].state === "progress");
    let complete = 0;
    games.forEach((game, i) => {
      const progress = progressByGame[i];
      const card = cards[i];
      card.classList.toggle("is-featured", card === featured);
      card.dataset.state = progress.state;
      byId(`game-edition-status-${game.key}`).textContent = progress.label;
      byId(`game-edition-action-${game.key}`).textContent = card === featured ? "Continue" : progress.action;
      if (progress.state === "solved" || progress.state === "finished") complete += 1;
      if (current === game.key) selectedProgress.textContent = progress.label;
    });
    const ordered = featured ? [featured, ...cards.filter(card => card !== featured)] : cards;
    const active = cardList.contains(document.activeElement) ? document.activeElement : null;
    ordered.forEach((card, i) => {
      if (cardList.children[i] !== card) cardList.insertBefore(card, cardList.children[i]);
    });
    if (active && document.activeElement !== active) active.focus({ preventScroll: true });
    byId("game-edition-completion").textContent = `${complete} of ${games.length} finished`;
    challengeButton.textContent = challenge.finished() ? "Review the challenge"
      : challenge.started() ? "Resume challenge" : "Try the challenge";
  }

  function moveToTop() {
    if (page.scrollHeight > page.clientHeight) page.scrollTop = 0;
    else window.scrollTo({ top: 0, behavior: "instant" });
  }

  function openLobby({ focus = true } = {}) {
    const returningFrom = current;
    current = null;
    page.classList.remove("game-edition-playing");
    for (const game of games) byId(game.pane).hidden = true;
    challenge.panel.hidden = true;
    play.hidden = true;
    lobby.hidden = false;
    update();
    if (focus && !page.inert && !page.hidden) {
      moveToTop();
      if (returningFrom === "challenge") {
        bonus.open = true;
        challengeButton.focus();
      } else if (returningFrom) lobby.querySelector(`[data-edition-game="${returningFrom}"]`)?.focus();
      else {
        const heading = header.querySelector("h1");
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  }

  function launch(key) {
    const game = games.find(item => item.key === key);
    if (!game && key !== "challenge") return false;
    current = key;
    page.classList.add("game-edition-playing");
    lobby.hidden = true;
    play.hidden = false;
    rules.open = false;
    selectedTitle.textContent = game?.name || "Table talk";
    rules.querySelector("p").textContent = game?.rules || "Find four groups of four. Each word belongs to just one answer group. You can make four mistakes in this sample.";
    for (const entry of games) byId(entry.pane).hidden = true;
    challenge.panel.hidden = Boolean(game);
    if (game) {
      tabs.querySelector(`button[data-g="${key}"]`)?.click();
      byId(game.pane).hidden = false;
    } else {
      selectedProgress.textContent = "Original bonus";
    }
    update();
    if (!page.inert && !page.hidden) {
      moveToTop();
      selectedTitle.focus({ preventScroll: true });
    }
    return true;
  }

  lobby.addEventListener("click", event => {
    const key = event.target.closest("[data-edition-game]")?.dataset.editionGame;
    if (key) launch(key);
  });
  back.addEventListener("click", () => openLobby());

  attachDailyAccessibility();
  const refresh = () => {
    describeBoard();
    describeCrossword();
    describeConnections();
    update();
  };
  const observer = new MutationObserver(refresh);
  for (const id of ["game-tabs", "w-board", "w-kbd", "w-msg", "xword-game", "c-grid", "c-solved", "c-lives", "c-msg"]) {
    observer.observe(byId(id), { childList: true, subtree: true, characterData: id !== "c-lives", attributes: true, attributeFilter: ["class"] });
  }
  window.MBGamesRedesign = Object.freeze({
    openLobby,
    launch,
    focusTarget: () => current ? selectedTitle : header.querySelector("h1")
  });
  openLobby({ focus: false });
  refresh();
}

if (typeof document !== "undefined") mount();
