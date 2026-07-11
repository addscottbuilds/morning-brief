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

    releasesData = d.releases || null;
    renderMarkets(d.markets);
    renderNews(d.news);
    renderWotd(d.wotd);
  }

  function renderWotd(w) {
    if (!w || !w.word) return;
    $("wotd-section").hidden = false;
    $("wotd-word").textContent = w.word;
    $("wotd-phon").textContent = w.phonetic || "";
    $("wotd-pos").textContent = w.pos || "";
    $("wotd-def").textContent = w.def;
    if (w.example) {
      $("wotd-ex").hidden = false;
      $("wotd-ex").textContent = "“" + w.example + "”";
    }
    if (w.audio) {
      const btn = $("wotd-audio");
      btn.hidden = false;
      btn.addEventListener("click", () => { new Audio(w.audio).play().catch(() => {}); });
    }
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
  let releasesData = null;

  const REL_GROUPS = [["Movies", "movies"], ["Shows", "shows"], ["Anime", "anime"]];

  function releasesHtml() {
    if (!releasesData) return "";
    const groups = REL_GROUPS.filter(([, key]) => releasesData[key] && releasesData[key].length);
    if (!groups.length) return "";
    return `<div class="rel-board">` + groups.map(([label, key]) =>
      `<div class="rel-group"><h4>${label}</h4>` +
      releasesData[key].map((r, i) =>
        `<div class="rel-row" data-rel="${key}-${i}" role="button" aria-label="Show synopsis">` +
        `<span class="rel-name">${esc(r.title)}${r.year ? ` <span class="rel-year">${esc(r.year)}</span>` : ""}</span>` +
        `<span class="rel-score">${r.rating != null ? "★ " + r.rating.toFixed(1) : "—"}</span></div>`
      ).join("") + `</div>`
    ).join("") + `<div class="rel-src">Ratings: IMDb (movies, shows) · AniList (anime) · Tap a title for the synopsis</div></div>`;
  }

  function bindReleaseDetails() {
    document.querySelectorAll(".rel-row[data-rel]").forEach(el => {
      el.addEventListener("click", () => {
        const next = el.nextElementSibling;
        if (next && next.classList.contains("rel-detail")) { next.remove(); return; }
        document.querySelectorAll(".rel-detail").forEach(d => d.remove());
        const [key, i] = el.dataset.rel.split("-");
        const r = releasesData && releasesData[key] && releasesData[key][Number(i)];
        if (!r) return;
        const div = document.createElement("div");
        div.className = "rel-detail";
        div.innerHTML =
          (r.genres && r.genres.length ? `<div class="chips">${r.genres.map(g => `<span>${esc(g)}</span>`).join("")}</div>` : "") +
          `<div class="rel-ov">${r.overview ? esc(r.overview) : `<span style="color:var(--muted)">No synopsis available.</span>`}</div>`;
        el.after(div);
      });
    });
  }

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
    const prefix = key === "entertainment" ? releasesHtml() : "";
    const bindAfter = key === "entertainment";
    $("news-list").innerHTML = prefix + stories.map(s => {
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
    if (bindAfter) bindReleaseDetails();
  }

  // ---------------------------------------------------------------- sport --
  // Config-driven leagues from ESPN's public scoreboard API. Each league
  // fetches its own window of results + fixtures; empty leagues hide.
  // Tapping a match expands scorers / quarter scores / odds / ladder spots.
  const sportEvents = new Map();       // event id -> { e, lg }
  const standingsCache = new Map();    // league key -> Map(team id -> rank)

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  async function leagueRanks(lg) {
    if (!lg.standings) return null;
    if (standingsCache.has(lg.key)) return standingsCache.get(lg.key);
    try {
      const d = await (await fetch(`https://site.api.espn.com/apis/v2/sports/${lg.path}/standings`)).json();
      const entries = (d.children && d.children[0] && d.children[0].standings && d.children[0].standings.entries) ||
        (d.standings && d.standings.entries) || [];
      const map = new Map();
      for (const en of entries) {
        const rank = (en.stats || []).find(s => s.name === "rank" || s.type === "rank");
        if (en.team && rank) map.set(String(en.team.id), Number(rank.displayValue || rank.value));
      }
      standingsCache.set(lg.key, map);
      return map;
    } catch { return null; }
  }

  async function buildMatchDetail(e, lg) {
    const comp = (e.competitions || [])[0] || {};
    const cs = comp.competitors || [];
    const home = cs.find(c => c.homeAway === "home") || cs[0] || {};
    const away = cs.find(c => c.homeAway === "away") || cs[1] || {};
    const state = e.status && e.status.type ? e.status.type.state : "pre";
    const parts = [];

    // soccer: goal-by-goal from match details
    const goals = (comp.details || []).filter(d => d.scoringPlay);
    if (goals.length) {
      const side = id => (String(id) === String(home.team && home.team.id) ? "home" : "away");
      const fmt = d => {
        const t = (d.type && d.type.text) || "";
        const mark = /penalty/i.test(t) ? " (pen)" : /own goal/i.test(t) ? " (og)" : "";
        const who = (d.athletesInvolved && d.athletesInvolved[0] && d.athletesInvolved[0].displayName) || "?";
        return `${(d.clock && d.clock.displayValue) || ""} ${esc(who)}${mark}`;
      };
      const h = goals.filter(g => g.team && side(g.team.id) === "home").map(fmt).join("<br>");
      const a = goals.filter(g => g.team && side(g.team.id) === "away").map(fmt).join("<br>");
      parts.push(`<div class="goals"><div>${h || "—"}</div><div class="away">${a || "—"}</div></div>`);
      // half-time score inferred from goal clocks
      if (state !== "pre") {
        const ht = s => goals.filter(g => g.team && side(g.team.id) === s && parseInt(g.clock && g.clock.displayValue) <= 45).length;
        parts.push(`<div><b>HT</b> ${ht("home")}–${ht("away")}</div>`);
      }
    }

    // AFL (and similar): running score by quarter
    const hls = home.linescores || [], als = away.linescores || [];
    if (hls.length >= 2 && als.length >= 2) {
      const cum = ls => ls.reduce((acc, l) => { acc.push((acc[acc.length - 1] || 0) + (l.value || 0)); return acc; }, []);
      const hc = cum(hls), ac = cum(als);
      const names = ["Q1", "HT", "3QT", "FT"];
      parts.push(`<div><b>By quarter:</b> ` + hc.map((v, i) => `${names[i] || "Q" + (i + 1)} ${v}–${ac[i]}`).join(" · ") + `</div>`);
    }

    // stat leaders (AFL provides goals + disposals)
    const leaderLine = t => {
      const ls = (t.leaders || []).slice(0, 2).map(l => {
        const top = l.leaders && l.leaders[0];
        return top ? `${l.name}: ${esc(top.athlete ? top.athlete.shortName || top.athlete.displayName : "?")} ${esc(top.displayValue)}` : null;
      }).filter(Boolean);
      return ls.length ? `<div><b>${esc(t.team ? t.team.abbreviation : "")}</b> — ${ls.join(", ")}</div>` : "";
    };
    if ((home.leaders || []).length || (away.leaders || []).length) {
      parts.push(leaderLine(home) + leaderLine(away));
    }

    // odds (usually on upcoming games)
    const odds = (comp.odds || [])[0];
    if (odds && odds.details) {
      parts.push(`<div><b>Odds:</b> ${esc(odds.details)}${odds.overUnder ? ` · O/U ${esc(odds.overUnder)}` : ""}</div>`);
    }

    // ladder positions
    const ranks = await leagueRanks(lg);
    if (ranks && home.team && away.team) {
      const hr = ranks.get(String(home.team.id)), ar = ranks.get(String(away.team.id));
      if (hr && ar) parts.push(`<div><b>Ladder:</b> ${esc(home.team.abbreviation)} ${ordinal(hr)} · ${esc(away.team.abbreviation)} ${ordinal(ar)}</div>`);
    }

    if (state === "pre" && comp.venue && comp.venue.fullName) {
      parts.push(`<div><b>Venue:</b> ${esc(comp.venue.fullName)}</div>`);
    }

    return parts.filter(Boolean).join("") || `<div>No extra detail available for this one.</div>`;
  }

  function matchRow(e) {
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
      const when = new Date(e.date).toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" });
      mid = `<div class="wc-mid"><div class="wc-score" style="color:var(--muted)">v</div><div class="wc-when">${esc(when)}</div></div>`;
    }

    const noteRow = note ? `<div class="wc-when" style="grid-column:1/-1;text-align:center">${esc(note)}</div>` : "";
    return `<div class="wc-match" data-eid="${esc(e.id)}" role="button" aria-label="Show match details">${team(home, "home")}${mid}${team(away, "away")}${noteRow}</div>`;
  }

  function raceRow(e) {
    const state = e.status && e.status.type ? e.status.type.state : "pre";
    const full = e.name || e.shortName || "";
    const m = full.match(/([A-Za-z]+ Grand Prix)$/); // drop sponsor prefix, keep "<Country> Grand Prix"
    const name = m ? m[1] : full;
    if (state === "post") {
      const comp = (e.competitions || [])[0] || {};
      const podium = (comp.competitors || [])
        .filter(c => c.order >= 1 && c.order <= 3)
        .sort((a, b) => a.order - b.order)
        .map(c => `${c.order}. ${esc(c.athlete ? (c.athlete.shortName || c.athlete.displayName) : "?")}`)
        .join(" · ");
      return `<div class="wc-match race"><div class="race-name wc-winner">${esc(name)}</div><div class="race-detail">${podium || "Finished"}</div></div>`;
    }
    const when = new Date(e.date).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const days = Math.ceil((Date.parse(e.date) - Date.now()) / 86400000);
    return `<div class="wc-match race"><div class="race-name">${esc(name)}</div><div class="race-detail">${esc(when)}${days > 0 ? ` · in ${days} day${days === 1 ? "" : "s"}` : ""}${state === "in" ? ` · <span class="chg-up">LIVE</span>` : ""}</div></div>`;
  }

  async function loadSports() {
    const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, "");
    let anyLive = false;
    const blocks = await Promise.all((CFG.sports || []).map(async lg => {
      const from = new Date(Date.now() - lg.pastH * 3600 * 1000);
      const to = new Date(Date.now() + lg.futureD * 86400 * 1000);
      let d;
      try {
        d = await (await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/${lg.path}/scoreboard?dates=${fmt(from)}-${fmt(to)}`
        )).json();
      } catch { return ""; }
      const events = (d.events || []).slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      if (!events.length) return "";
      const state = e => (e.status && e.status.type ? e.status.type.state : "pre");
      if (events.some(e => state(e) === "in")) anyLive = true;

      let rows;
      if (lg.type === "race") {
        const past = events.filter(e => state(e) === "post").slice(-1);
        const next = events.filter(e => state(e) !== "post").slice(0, 1);
        rows = [...past, ...next].map(raceRow);
      } else {
        const results = events.filter(e => state(e) === "post").slice(-(lg.results || 3));
        const rest = events.filter(e => state(e) !== "post").slice(0, lg.upcoming || 4);
        rows = [...results, ...rest].map(ev => {
          sportEvents.set(String(ev.id), { e: ev, lg });
          return matchRow(ev);
        });
      }
      if (!rows.length) return "";
      return `<div class="sport-league"><div class="sport-lg-label">${esc(lg.label)}</div><div class="wc-list">${rows.join("")}</div></div>`;
    }));

    const html = blocks.filter(Boolean).join("");
    if (!html) return; // nothing on — section stays hidden
    $("sport-section").hidden = false;
    if (anyLive) $("sport-live").textContent = "· live";
    $("sport-list").innerHTML = html;

    // tap a match to expand its detail panel (one open at a time)
    $("sport-list").querySelectorAll(".wc-match[data-eid]").forEach(el => {
      el.addEventListener("click", async () => {
        const next = el.nextElementSibling;
        if (next && next.classList.contains("wc-detail")) { next.remove(); return; }
        $("sport-list").querySelectorAll(".wc-detail").forEach(d => d.remove());
        const reg = sportEvents.get(el.dataset.eid);
        if (!reg) return;
        const div = document.createElement("div");
        div.className = "wc-detail";
        div.innerHTML = `<div>Loading…</div>`;
        el.after(div);
        div.innerHTML = await buildMatchDetail(reg.e, reg.lg);
      });
    });
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

  // -------------------------------------------------------- notifications --
  function b64ToUint8(s) {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  async function enablePush() {
    const note = $("push-note");
    note.hidden = false;
    if (!("Notification" in window) || !("PushManager" in window)) {
      note.textContent = "Notifications need the app installed via Add to Home Screen (iOS 16.4+). Open the installed app and try again.";
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { note.textContent = "Permission not granted — you can allow notifications in Settings later."; return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToUint8(CFG.vapidPublicKey),
        });
      }
      const json = JSON.stringify(sub.toJSON());
      let copied = false;
      try { await navigator.clipboard.writeText(json); copied = true; } catch { /* clipboard blocked */ }
      localStorage.setItem("mb_push_enabled", "1");
      $("push-btn").textContent = "🔔 Notification key copied — tap to copy again";
      note.textContent = (copied ? "Subscription copied to your clipboard. " : "Copy this and ") +
        "Paste it to Claude (or into the repo secret PUSH_SUBSCRIPTION) to finish setup." +
        (copied ? "" : " " + json);
    } catch (e) {
      note.textContent = "Couldn't subscribe: " + e.message;
    }
  }
  $("push-btn").addEventListener("click", enablePush);
  if (localStorage.getItem("mb_push_enabled")) {
    $("push-btn").textContent = "🔔 Morning notification set up — tap to re-copy the key";
  }

  // ------------------------------------------------------------ game tabs --
  const GAME_PANES = { wordle: "wordle-game", xword: "xword-game", conn: "conn-game" };
  const gameTabs = document.querySelectorAll("#game-tabs button");
  function showGame(g) {
    if (!GAME_PANES[g]) g = "wordle";
    for (const [k, id] of Object.entries(GAME_PANES)) $(id).hidden = k !== g;
    gameTabs.forEach(b => b.classList.toggle("active", b.dataset.g === g));
    localStorage.setItem("mb_game_tab", g);
  }
  gameTabs.forEach(b => b.addEventListener("click", () => showGame(b.dataset.g)));
  showGame(localStorage.getItem("mb_game_tab") || "wordle");

  // ----------------------------------------------------------------- init --
  $("games-date-line").textContent =
    `Puzzle #${(window.MB_DAYNUM || 0) + 1} · new puzzles daily`;
  $("wx-loc").addEventListener("click", () => {
    $("wx-loc").textContent = "· updating…";
    loadWeather(true);
  });
  renderDeadlines();
  renderFocus();
  loadWeather();
  loadData();
  loadSports();
})();
