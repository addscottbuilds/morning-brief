// Morning Brief core: header, weather (GPS), markets + news (data.json),
// countdowns, and the focus checklist. Games live in wordle.js / crossword.js.
(function () {
  "use strict";
  const CFG = window.MB_CONFIG;
  const $ = id => document.getElementById(id);

  // ----------------------------------------------------------------- pager --
  // Three-page swipe layout: 0 = news (left), 1 = overview, 2 = games (right)
  const pager = $("pager");
  const dots = document.querySelectorAll("#dots span");
  let curPage = 1;
  function goTo(i, smooth = true) {
    curPage = i;
    pager.scrollTo({ left: i * pager.clientWidth, behavior: smooth ? "smooth" : "auto" });
    dots.forEach((d, n) => d.classList.toggle("on", n === i));
  }
  pager.addEventListener("scroll", () => {
    requestAnimationFrame(() => {
      const i = Math.round(pager.scrollLeft / pager.clientWidth);
      if (i !== curPage) {
        curPage = i;
        dots.forEach((d, n) => d.classList.toggle("on", n === i));
      }
    });
  }, { passive: true });
  window.addEventListener("resize", () => goTo(curPage, false));
  dots.forEach(d => d.addEventListener("click", () => goTo(+d.dataset.p)));
  $("goto-news").addEventListener("click", () => goTo(0));
  $("goto-games").addEventListener("click", () => goTo(2));
  goTo(1, false); // start on the overview

  // ---------------------------------------------------------------- header --
  const now = new Date();
  $("date-line").textContent = now.toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // shared day number for games + rotations
  window.MB_DAYNUM = Math.max(0, Math.round(
    (startOfDay(now) - startOfDay(new Date(CFG.gameEpoch + "T00:00:00"))) / 86400000
  ));
  function startOfDay(d) { const c = new Date(d); c.setHours(0, 0, 0, 0); return +c; }

  // --------------------------------------------------------------- weather --
  const WMO = {
    0: ["Clear sky", "☀"], 1: ["Mostly clear", "🌤"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁"],
    45: ["Foggy", "🌫"], 48: ["Icy fog", "🌫"], 51: ["Light drizzle", "🌦"], 53: ["Drizzle", "🌦"],
    55: ["Heavy drizzle", "🌧"], 61: ["Light rain", "🌦"], 63: ["Rain", "🌧"], 65: ["Heavy rain", "🌧"],
    66: ["Freezing rain", "🌧"], 67: ["Freezing rain", "🌧"], 71: ["Light snow", "🌨"], 73: ["Snow", "🌨"],
    75: ["Heavy snow", "🌨"], 77: ["Snow grains", "🌨"], 80: ["Light showers", "🌦"], 81: ["Showers", "🌧"],
    82: ["Heavy showers", "🌧"], 85: ["Snow showers", "🌨"], 86: ["Snow showers", "🌨"],
    95: ["Thunderstorm", "⛈"], 96: ["Storm with hail", "⛈"], 99: ["Storm with hail", "⛈"],
  };

  // Cache-first location so iOS doesn't prompt on every open: the saved fix
  // is used silently; GPS is only requested on first run, when the fix is
  // over a week old, or when the location name is tapped.
  const LOC_MAX_AGE = 7 * 24 * 3600 * 1000;
  function getLocation(force) {
    return new Promise(resolve => {
      const cached = safeParse(localStorage.getItem("mb_loc"));
      const fresh = cached && cached.at && Date.now() - cached.at < LOC_MAX_AGE;
      if (cached && fresh && !force) return resolve(cached);
      if (!("geolocation" in navigator)) return resolve(cached || CFG.fallback);
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: null, at: Date.now() }),
        () => resolve(cached || CFG.fallback),
        { timeout: 8000, maximumAge: 15 * 60 * 1000 }
      );
    });
  }

  async function placeName(lat, lon) {
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
      const j = await r.json();
      return j.locality || j.city || j.principalSubdivision || "Your location";
    } catch { return "Your location"; }
  }

  async function loadWeather(force) {
    const loc = await getLocation(force);
    if (!loc.name) loc.name = await placeName(loc.lat, loc.lon);
    if (!loc.at) loc.at = Date.now();
    localStorage.setItem("mb_loc", JSON.stringify(loc));
    $("wx-loc").textContent = "· " + loc.name + " ⌖";

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset` +
      `&hourly=temperature_2m,precipitation_probability&forecast_days=1&timezone=auto`;
    let w;
    try { w = await (await fetch(url)).json(); }
    catch {
      $("wx-desc").textContent = "Weather unavailable right now — check your connection.";
      return;
    }

    const cur = w.current, day = w.daily;
    const [desc] = WMO[cur.weather_code] || ["", ""];
    const rain = day.precipitation_probability_max[0];
    const tips = [];
    tips.push(`Feels like ${round1(cur.apparent_temperature)}°.`);
    tips.push(rain >= 40 ? `${rain}% chance of rain — take a jacket or umbrella.` : "Dry day — no umbrella.");
    const max = day.temperature_2m_max[0];
    if (cur.temperature_2m <= 8) tips.push(`Cold start; ${Math.round(max)}° later.`);
    else if (max >= 30) tips.push(`Heating up to ${Math.round(max)}°.`);
    else tips.push(`Top of ${Math.round(max)}°.`);
    if (day.uv_index_max[0] >= 6) tips.push(`UV ${Math.round(day.uv_index_max[0])} — sunscreen if you're out.`);

    $("wx-temp").textContent = round1(cur.temperature_2m) + "°";
    $("wx-desc").innerHTML = `<strong>${desc}.</strong> ${tips.join(" ")}`;
    $("strip-now").textContent = round1(cur.temperature_2m) + "°";
    $("strip-top").textContent = Math.round(max) + "°";

    // hourly sparkline
    const temps = w.hourly.temperature_2m.slice(0, 24);
    const lo = Math.min(...temps), hi = Math.max(...temps), span = Math.max(1, hi - lo);
    const pts = temps.map((t, i) => {
      const x = (i * 580) / (temps.length - 1);
      const y = 60 - ((t - lo) / span) * 50;
      return [x, y];
    });
    const maxIdx = temps.indexOf(hi);
    $("wx-spark").innerHTML =
      `<line x1="0" y1="60" x2="580" y2="60" stroke="#243040" stroke-width="1"/>` +
      `<polyline fill="none" stroke="#f2a65a" stroke-width="2" stroke-linejoin="round" points="${pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ")}"/>` +
      `<circle cx="${pts[maxIdx][0].toFixed(1)}" cy="${pts[maxIdx][1].toFixed(1)}" r="3" fill="#f2a65a"/>`;

    // hourly rain-chance bars
    const probs = (w.hourly.precipitation_probability || []).slice(0, 24);
    if (probs.length) {
      $("rain-wrap").hidden = false;
      const bw = 580 / probs.length;
      $("wx-rain").innerHTML = probs.map((p, i) => {
        const h = Math.max(1.5, (p / 100) * 40);
        const strong = p >= 40;
        return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(42 - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${strong ? "#7aa2d6" : "#3d5471"}"/>`;
      }).join("") + `<line x1="0" y1="42.5" x2="580" y2="42.5" stroke="#243040" stroke-width="1"/>`;
    }

    const fmtT = iso => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
    $("wx-meta").innerHTML =
      `<span>Low <b>${round1(day.temperature_2m_min[0])}°</b></span>` +
      `<span>Rain <b>${rain}%</b></span>` +
      `<span>UV <b>${Math.round(day.uv_index_max[0])}</b></span>` +
      `<span>Sunrise <b>${fmtT(day.sunrise[0])}</b></span>` +
      `<span>Sunset <b>${fmtT(day.sunset[0])}</b></span>`;
  }

  // ------------------------------------------------------- markets & news --
  async function loadData() {
    let d;
    try { d = await (await fetch("data/data.json", { cache: "no-cache" })).json(); }
    catch {
      $("mkt-body").innerHTML = `<tr><td colspan="3" class="muted-cell">Market data unavailable.</td></tr>`;
      $("news-list").innerHTML = `<div class="muted-cell">News digest unavailable.</div>`;
      return;
    }

    const age = Date.now() - Date.parse(d.generatedAt);
    const ageH = Math.round(age / 3600000);
    const updatedText =
      `Data refreshed ${new Date(d.generatedAt).toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" })}` +
      (ageH > 26 ? ` — ${ageH}h old, refresh may have failed` : "");
    $("updated-line").textContent = updatedText;
    $("news-updated-line").textContent = updatedText;

    renderMarkets(d.markets);
    renderNews(d.news);
  }

  function fmtPrice(i) {
    if (i.fmt === "index") return Math.round(i.price).toLocaleString();
    if (i.fmt === "fx") return i.price.toFixed(4);
    return "$" + i.price.toFixed(2);
  }

  function renderMarkets(m) {
    if (!m || !m.items || !m.items.length) return;
    $("mkt-body").innerHTML = m.items.map(i => {
      const chg = i.chgPct == null ? "" :
        `<td class="r ${i.chgPct >= 0 ? "chg-up" : "chg-down"}">${i.chgPct >= 0 ? "+" : "−"}${Math.abs(i.chgPct).toFixed(1)}%</td>`;
      return `<tr><td>${i.label}<span class="name">${i.name}</span></td><td class="r">${fmtPrice(i)}</td>${chg || '<td class="r">–</td>'}</tr>`;
    }).join("");
    const asx = m.items.find(i => i.sym === "^AXJO");
    if (asx && asx.chgPct != null) {
      const el = $("strip-asx");
      el.textContent = `${asx.chgPct >= 0 ? "+" : "−"}${Math.abs(asx.chgPct).toFixed(1)}%`;
      el.className = "num " + (asx.chgPct >= 0 ? "chg-up" : "chg-down");
    }
    if (m.note) {
      $("mkt-note").hidden = false;
      $("mkt-note").innerHTML = `<b>Buy-plan note:</b> ${esc(m.note)}`;
    }
  }

  let newsData = null;

  function renderNews(n) {
    // tolerate the pre-tabs data shape from a cached data.json
    if (n && n.stories && !n.categories) {
      n = { ...n, categories: [{ key: "top", label: "Top", stories: n.stories }] };
    }
    if (!n || !n.categories || !n.categories.length) {
      $("news-list").innerHTML = `<div class="muted-cell">No stories in today's digest.</div>`;
      return;
    }
    newsData = n;
    $("news-mode").textContent = n.mode === "llm" ? "· neutral digest" : "· cross-spectrum digest";

    const tabs = $("news-tabs");
    const keys = n.categories.map(c => c.key);
    const saved = localStorage.getItem("mb_news_tab");
    const activeKey = keys.includes(saved) ? saved : keys[0];
    tabs.innerHTML = "";
    for (const c of n.categories) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.textContent = c.label;
      b.classList.toggle("active", c.key === activeKey);
      b.addEventListener("click", () => {
        localStorage.setItem("mb_news_tab", c.key);
        tabs.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
        renderStories(c.key);
      });
      tabs.appendChild(b);
    }
    renderStories(activeKey);
    renderNewsOverview(n);
  }

  function renderNewsOverview(n) {
    const topCat = n.categories.find(c => c.key === "top") || n.categories[0];
    const box = $("news-overview");
    if (!topCat || !topCat.stories.length) {
      box.innerHTML = `<div class="muted-cell">No headlines yet.</div>`;
      return;
    }
    box.innerHTML = topCat.stories.slice(0, 4).map(s => {
      const meta = `${s.sources.length} outlet${s.sources.length === 1 ? "" : "s"}` +
        (s.divergent ? ` · <span class="split-flag">narrative split</span>` : "");
      return `<div class="mini-story" role="button" tabindex="0"><h3>${esc(s.headline)}</h3><div class="src">${meta}</div></div>`;
    }).join("");
    box.querySelectorAll(".mini-story").forEach(el => {
      el.addEventListener("click", () => goTo(0));
      el.addEventListener("keydown", e => { if (e.key === "Enter") goTo(0); });
    });
  }

  function renderStories(key) {
    const cat = newsData.categories.find(c => c.key === key);
    const stories = cat ? cat.stories : [];
    if (!stories.length) {
      $("news-list").innerHTML = `<div class="muted-cell">No ${cat ? cat.label.toLowerCase() : ""} stories today.</div>`;
      return;
    }
    const n = newsData;
    $("news-list").innerHTML = stories.map(s => {
      const outlets = s.sources.map(x =>
        `<a href="${esc(x.link)}" target="_blank" rel="noopener"><span class="lean-dot lean-${x.lean}"></span>${esc(x.outlet)}</a>`
      ).join(" ");

      let extra = "";
      if (s.divergent) {
        extra = `<div class="split">
          <div class="tag">Narrative split</div>
          <div class="view left"><b>Left-leaning outlets:</b> ${esc(s.left_view || "")}</div>
          <div class="view right"><b>Right-leaning outlets:</b> ${esc(s.right_view || "")}</div>
          ${s.common_ground ? `<div class="view common"><b>Both agree:</b> ${esc(s.common_ground)}</div>` : ""}
        </div>`;
      } else if (s.hasBothSides && n.mode !== "llm") {
        const items = s.sources
          .filter(x => x.lean !== "centre")
          .map(x => `<div class="cmp-item"><span class="lean-dot lean-${x.lean}"></span><b>${esc(x.outlet)}:</b> ${esc(x.title)}</div>`)
          .join("");
        extra = `<details class="compare"><summary>Compare left/right coverage</summary>${items}</details>`;
      }

      return `<div class="story">
        <h2>${esc(s.headline)}</h2>
        ${s.summary ? `<div class="sum">${esc(s.summary)}</div>` : ""}
        ${extra}
        <div class="outlets">${outlets}</div>
      </div>`;
    }).join("");
  }

  // ------------------------------------------------------------ world cup --
  async function loadWorldCup() {
    const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, "");
    const from = new Date(Date.now() - 40 * 3600 * 1000); // yesterday's results
    const to = new Date(Date.now() + 4 * 86400 * 1000);   // next few fixtures
    let d;
    try {
      d = await (await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${fmt(from)}-${fmt(to)}`
      )).json();
    } catch { return; } // offline or API gone — section stays hidden
    const events = (d.events || []).slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    if (!events.length) return;

    $("wc-section").hidden = false;
    const live = events.some(e => e.status && e.status.type && e.status.type.state === "in");
    if (live) $("wc-round").textContent = "· live";

    $("wc-list").innerHTML = events.slice(0, 8).map(e => {
      const comp = (e.competitions || [])[0] || {};
      const cs = comp.competitors || [];
      const home = cs.find(c => c.homeAway === "home") || cs[0] || {};
      const away = cs.find(c => c.homeAway === "away") || cs[1] || {};
      const state = e.status && e.status.type ? e.status.type.state : "pre"; // pre | in | post
      const note = comp.notes && comp.notes[0] && comp.notes[0].headline || "";

      const team = (t, side) => {
        const logo = t.team && t.team.logo ? `<img src="${esc(t.team.logo)}" alt="" loading="lazy">` : "";
        const winner = state === "post" && t.winner ? " wc-winner" : "";
        return `<div class="wc-team ${side}${winner}">${side === "home" ? logo : ""}<span class="nm">${esc(t.team ? t.team.shortDisplayName : "?")}</span>${side === "away" ? logo : ""}</div>`;
      };

      let mid;
      if (state === "post") {
        mid = `<div class="wc-mid"><div class="wc-score">${esc(home.score ?? "")}–${esc(away.score ?? "")}</div><div class="wc-when">${esc(e.status.type.shortDetail || "FT")}</div></div>`;
      } else if (state === "in") {
        mid = `<div class="wc-mid"><div class="wc-score live">${esc(home.score ?? "")}–${esc(away.score ?? "")}</div><div class="wc-when live">${esc(e.status.displayClock || "LIVE")}</div></div>`;
      } else {
        const ko = new Date(e.date);
        const when = ko.toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" });
        mid = `<div class="wc-mid"><div class="wc-score" style="color:var(--muted)">v</div><div class="wc-when">${esc(when)}</div></div>`;
      }

      const noteRow = note ? `<div class="wc-when" style="grid-column:1/-1;text-align:center">${esc(note)}</div>` : "";
      return `<div class="wc-match">${team(home, "home")}${mid}${team(away, "away")}${noteRow}</div>`;
    }).join("");
  }

  // ------------------------------------------------------------ deadlines --
  function daysUntil(iso) {
    return Math.ceil((startOfDay(new Date(iso + "T00:00:00")) - startOfDay(new Date())) / 86400000);
  }

  function renderDeadlines() {
    const wrap = $("deadline-list");
    wrap.innerHTML = "";
    let stripSet = false;
    for (const d of CFG.deadlines) {
      const days = d.deadline ? daysUntil(d.deadline) : null;
      if (days != null && days < -30) continue; // long past — drop
      if (d.hideUntilDays && days != null && days > d.hideUntilDays) continue;

      const item = document.createElement("div");
      item.className = "item";
      const badge = d.badge || (days != null ? (days >= 0 ? `${days} days left` : "overdue") : "");
      let inner = `<div class="head"><div class="title">${esc(d.title)}</div><div class="days">${esc(badge)}</div></div>`;

      if (d.progressKey && d.target) {
        const spent = parseFloat(localStorage.getItem(d.progressKey) || "0") || 0;
        const pct = Math.min(100, Math.round((spent / d.target) * 100));
        inner += `<div class="bar"><div style="width:${pct}%"></div></div>`;
        inner += `<div class="sub">${esc(d.sub || "")}</div>`;
        inner += `<div class="spent-edit">Progress: <button data-key="${d.progressKey}" data-target="${d.target}">$${spent.toLocaleString()} of $${d.target.toLocaleString()} (${pct}%) — tap to update</button></div>`;
      } else if (d.sub) {
        inner += `<div class="sub">${esc(d.sub)}</div>`;
      }
      item.innerHTML = inner;
      wrap.appendChild(item);

      if (!stripSet && days != null && days >= 0) {
        $("strip-days").textContent = days;
        $("strip-days-lbl").textContent = d.stripLabel || "days left";
        stripSet = true;
      }
    }
    wrap.querySelectorAll(".spent-edit button").forEach(btn => {
      btn.addEventListener("click", () => {
        const cur = localStorage.getItem(btn.dataset.key) || "0";
        const v = prompt("Total so far ($):", cur);
        if (v === null) return;
        const n = parseFloat(v.replace(/[^0-9.]/g, ""));
        if (!isNaN(n) && n >= 0) { localStorage.setItem(btn.dataset.key, String(n)); renderDeadlines(); }
      });
    });
  }

  // ---------------------------------------------------------------- focus --
  function focusLoad() { return safeParse(localStorage.getItem("mb_focus")) || []; }
  function focusSave(items) { localStorage.setItem("mb_focus", JSON.stringify(items)); }
  function renderFocus() {
    const list = $("focus-list");
    const items = focusLoad();
    list.innerHTML = "";
    if (!items.length) {
      list.innerHTML = `<div class="focus-row"><span style="color:var(--muted)">Nothing yet — add the one thing today needs.</span></div>`;
      return;
    }
    items.forEach((it, i) => {
      const row = document.createElement("div");
      row.className = "focus-row" + (it.done ? " done" : "");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = !!it.done;
      cb.setAttribute("aria-label", "Mark done: " + it.text);
      cb.addEventListener("change", () => { items[i].done = cb.checked; focusSave(items); renderFocus(); });
      const span = document.createElement("span");
      span.textContent = it.text;
      const del = document.createElement("button");
      del.className = "del"; del.textContent = "×";
      del.setAttribute("aria-label", "Remove: " + it.text);
      del.addEventListener("click", () => { items.splice(i, 1); focusSave(items); renderFocus(); });
      row.append(cb, span, del);
      list.appendChild(row);
    });
  }
  function focusAdd() {
    const input = $("focus-input");
    const t = input.value.trim();
    if (!t) return;
    const items = focusLoad();
    items.push({ text: t, done: false });
    focusSave(items);
    input.value = "";
    renderFocus();
  }
  $("focus-btn").addEventListener("click", focusAdd);
  $("focus-input").addEventListener("keydown", e => { if (e.key === "Enter") focusAdd(); });

  // ---------------------------------------------------------------- utils --
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function round1(n) { return Math.round(n * 10) / 10; }
  function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

  // ------------------------------------------------------------ game tabs --
  const gameTabs = document.querySelectorAll("#game-tabs button");
  function showGame(g) {
    $("wordle-game").hidden = g !== "wordle";
    $("xword-game").hidden = g !== "xword";
    gameTabs.forEach(b => b.classList.toggle("active", b.dataset.g === g));
    localStorage.setItem("mb_game_tab", g);
  }
  gameTabs.forEach(b => b.addEventListener("click", () => showGame(b.dataset.g)));
  showGame(localStorage.getItem("mb_game_tab") === "xword" ? "xword" : "wordle");

  // ----------------------------------------------------------------- init --
  $("games-date-line").textContent =
    `Puzzle #${(window.MB_DAYNUM || 0) + 1} · new Wordle and mini daily`;
  $("wx-loc").addEventListener("click", () => {
    $("wx-loc").textContent = "· updating…";
    loadWeather(true);
  });
  renderDeadlines();
  renderFocus();
  loadWeather();
  loadData();
  loadWorldCup();
})();
