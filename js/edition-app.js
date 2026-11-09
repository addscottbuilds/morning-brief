// Morning Brief core: header, weather (GPS), markets + news (data.json),
// countdowns, and the focus checklist. Games live in wordle.js / crossword.js.
(function () {
  "use strict";
  const CFG = window.MB_CONFIG;
  const $ = id => document.getElementById(id);

  // The phone uses native scroll snapping. Each page keeps its vertical position.
  const pager = $("pager");
  const pages = [...pager.querySelectorAll(".page")];
  const links = [...document.querySelectorAll(".app-nav a")];
  const backToTodayStory = $("back-to-today-story");
  const phoneLayout = matchMedia("(max-width: 760px), (max-width: 950px) and (pointer: coarse)");
  const routes = ["#news", "#today", "#games"];
  let curPage = 1;
  let swipeTimer;

  function showPage(index) {
    curPage = index;
    if (index !== 0) backToTodayStory.hidden = true;
    pages.forEach((page, i) => {
      page.hidden = !phoneLayout.matches && i !== index;
      page.inert = i !== index;
    });
    for (const link of links) {
      const selected = Number(link.dataset.page) === index;
      if (selected) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  }

  function alignPager() {
    clearTimeout(swipeTimer);
    if (phoneLayout.matches) pager.scrollLeft = curPage * pager.clientWidth;
  }

  function routeHeading(index) {
    if (index === 2 && window.MBGamesRedesign) return window.MBGamesRedesign.focusTarget() || pages[index].querySelector("h1");
    return pages[index].querySelector("h1");
  }

  function focusPage(target, pointer = false) {
    target.tabIndex = -1;
    target.toggleAttribute("data-pointer-focus", pointer);
    target.focus({ preventScroll: true });
  }
  pager.addEventListener("focusout", event => event.target.removeAttribute("data-pointer-focus"));

  const desktopScroll = new Map();

  function focusVisiblePage(index, pointer) {
    const heading = routeHeading(index);
    const title = heading.getBoundingClientRect();
    const pane = phoneLayout.matches ? pages[index].getBoundingClientRect() : { top: 0, bottom: innerHeight };
    if (title.top >= pane.top && title.bottom <= pane.bottom) focusPage(heading, pointer);
    else links.find(link => link.getAttribute("aria-current") === "page")?.focus({ preventScroll: true });
  }

  function goTo(index, { focus = true, keepPlace = false, pointer = false } = {}) {
    const switching = index !== curPage;
    if (switching && !phoneLayout.matches) desktopScroll.set(curPage, window.scrollY);
    showPage(index);
    alignPager();
    if (!focus) return;

    history.replaceState(null, "", routes[index]);

    const restorePlace = keepPlace && switching;
    if (!phoneLayout.matches) window.scrollTo({ top: restorePlace ? desktopScroll.get(index) || 0 : 0, behavior: "instant" });
    else if (!restorePlace) pages[index].scrollTo({ top: 0, behavior: "instant" });
    focusVisiblePage(index, pointer);
  }

  function settleSwipe() {
    if (!phoneLayout.matches || !pager.clientWidth) return;
    const index = Math.min(pages.length - 1, Math.max(0, Math.round(pager.scrollLeft / pager.clientWidth)));
    if (index === curPage) return;
    const focusWasOnOldPage = pages[curPage].contains(document.activeElement);
    showPage(index);
    history.replaceState(null, "", routes[index]);
    if (focusWasOnOldPage) focusVisiblePage(index, true);
  }

  pager.addEventListener("scroll", () => {
    clearTimeout(swipeTimer);
    swipeTimer = setTimeout(settleSwipe, 140);
  }, { passive: true });
  pager.addEventListener("scrollend", () => {
    clearTimeout(swipeTimer);
    settleSwipe();
  });
  phoneLayout.addEventListener("change", () => {
    showPage(curPage);
    alignPager();
  });
  window.addEventListener("resize", alignPager);

  for (const link of links) {
    link.addEventListener("click", event => {
      event.preventDefault();
      backToTodayStory.hidden = true;
      goTo(Number(link.dataset.page), { keepPlace: true, pointer: event.detail > 0 });
    });
  }
  const startPage = routes.indexOf(location.hash);
  goTo(startPage < 0 ? 1 : startPage, { focus: false });
  document.querySelector(".skip-link").addEventListener("click", event => {
    event.preventDefault();
    focusPage(routeHeading(curPage));
    if (phoneLayout.matches) pages[curPage].scrollTop = 0;
    else window.scrollTo({ top: 0, behavior: "instant" });
  });

  let openSheetId = null, sheetOpener = null;
  function openSheet(id, trigger = document.activeElement) {
    const previous = openSheetId && $(openSheetId);
    if (!previous) sheetOpener = trigger;
    openSheetId = id;
    if (previous) previous.close();
    $(id).showModal();
  }
  function closeSheet() { if (openSheetId) $(openSheetId).close(); }
  function leaveSheet(page) {
    sheetOpener = null;
    closeSheet();
    goTo(page);
  }
  document.querySelectorAll("dialog.sheet").forEach(d=>{
    d.addEventListener("close",()=>{
      if (d.id === "sheet-section" && !d.open) $("section-bank").append(...$("section-content").children);
      if(openSheetId!==d.id || d.open)return;
      openSheetId=null;
      if (d.id === "sheet-section" && secondaryRoute()) history.replaceState(null, "", routes[curPage]);
      if (sheetOpener?.isConnected && !sheetOpener.closest("[hidden]")) sheetOpener.focus();
      else if (sheetOpener?.id === "today-deadline") $("today-focus").focus();
      else if (sheetOpener?.id === "today-word-link") $("today-news-edition").focus();
    });
    d.addEventListener("click",e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeSheet();});
  });
  document.querySelectorAll(".sheet-close").forEach(b=>b.addEventListener("click",closeSheet));
  $("open-more").addEventListener("click", event => openSheet("sheet-more", event.currentTarget));
  $("more-deals").addEventListener("click",()=>openSheet("sheet-deals"));
  $("more-settings").addEventListener("click",()=>openSheet("sheet-settings"));
  $("more-data-status").addEventListener("click", () => openSheet("sheet-data-status"));
  let activeSection = "";
  $("back-to-more").addEventListener("click", () => {
    if (secondaryRoute()) history.replaceState(null, "", routes[curPage]);
    openSheet("sheet-more");
    $("sheet-more").querySelector('[data-more-section="' + activeSection + '"]:not([hidden])')?.focus();
  });
  const secondarySections = {
    "markets-section": "Markets", "sport-section": "Sport", "deadlines-section": "Coming up",
    "focus-section": "Your focus", "wotd-section": "Word of the Day", "cg-section": "Commonwealth Games",
  };
  function secondaryRoute() {
    const id = location.hash === "#markets" ? "markets-section" : location.hash.slice(1);
    return Object.hasOwn(secondarySections, id) ? id : "";
  }
  function openSection(id, trigger = $("open-more")) {
    activeSection = id;
    $("section-bank").append(...$("section-content").children);
    $("section-content").append($(id));
    $("more-section-title").textContent = secondarySections[id];
    if (id === "markets-section") $("market-detail").open = true;
    if (id === "sport-section") $("sport-detail").open = true;
    if (id === "focus-section") $("focus-section").querySelector("details").open = true;
    if (id === "deadlines-section") renderDeadlines();
    openSheet("sheet-section", trigger);
  }
  document.querySelectorAll("[data-more-section]").forEach(button =>
    button.addEventListener("click", () => openSection(button.dataset.moreSection, button)));
  $("section-bank").append(...Object.keys(secondarySections).map($));

  const defaultOrder=["weather-section","news-overview-section","focus-section","markets-section","sport-section","wotd-section","deadlines-section","cg-section"];
  const todayShortcuts={"markets-section":"today-markets","sport-section":"today-sport"};
  const summaryControl=$("show-today-summaries");
  let sectionOrder;
  try { sectionOrder=JSON.parse(localStorage.getItem("mb_section_order_v1")); } catch {}
  try { summaryControl.checked=localStorage.getItem("mb_today_summaries_v1")==="true"; } catch {}
  if(!Array.isArray(sectionOrder)||sectionOrder.length!==defaultOrder.length||new Set(sectionOrder).size!==defaultOrder.length||sectionOrder.some(id=>!defaultOrder.includes(id)))sectionOrder=[...defaultOrder];
  function todayOrder() {
    return summaryControl.checked ? sectionOrder.filter(id => Object.hasOwn(todayShortcuts,id)) : [];
  }
  function applyOrder() {
    const ordered=todayOrder();
    $("today-extras").hidden=!summaryControl.checked;
    $("today-extras").append(...ordered.map(id=>$(todayShortcuts[id])));
    $("section-order").hidden=!ordered.length;
    $("reset-order").hidden=!ordered.length;
    $("section-order").innerHTML=ordered.map((id,i)=>'<li><span>'+secondarySections[id]+'</span><button data-move="-1" data-section="'+id+'" aria-label="Move '+secondarySections[id]+' up" '+(i===0?'disabled':'')+'>Up</button><button data-move="1" data-section="'+id+'" aria-label="Move '+secondarySections[id]+' down" '+(i===ordered.length-1?'disabled':'')+'>Down</button></li>').join("");
  }
  function saveOrder(){try{localStorage.setItem("mb_section_order_v1",JSON.stringify(sectionOrder));$("order-feedback").textContent="Section order saved on this device.";}catch{$("order-feedback").textContent="Order changed in this tab only; device storage could not save it.";}applyOrder();}
  $("section-order").addEventListener("click",e=>{
    const b=e.target.closest("[data-move]");if(!b)return;
    const ordered=todayOrder();
    const other=ordered[ordered.indexOf(b.dataset.section)+Number(b.dataset.move)];
    if(!other)return;
    const from=sectionOrder.indexOf(b.dataset.section),to=sectionOrder.indexOf(other);
    [sectionOrder[from],sectionOrder[to]]=[sectionOrder[to],sectionOrder[from]];saveOrder();
    const rowButtons = [...$("section-order").querySelectorAll("button:not(:disabled)")]
      .filter(button => button.dataset.section === b.dataset.section);
    (rowButtons.find(button => button.dataset.move === b.dataset.move) || rowButtons[0])?.focus();
  });
  summaryControl.addEventListener("change",()=>{
    try {localStorage.setItem("mb_today_summaries_v1",String(summaryControl.checked));$("order-feedback").textContent="Today summaries saved on this device.";}
    catch {$("order-feedback").textContent="Summary preference changed in this tab.";}
    applyOrder();
  });
  $("reset-order").addEventListener("click",()=>{sectionOrder=[...defaultOrder];saveOrder();});
  applyOrder();
  function syncTodaySummaries() {
    for (const [name, glance] of [["markets","market-glance"],["sport","sport-glance"]]) {
      const source=$("source-"+name);
      const summary=$(glance).hidden ? "" : $(glance).textContent;
      const qualifier=source.dataset.state==="saved" ? "Saved snapshot" : source.dataset.state==="previous" ? "Previous edition" : "";
      $("today-"+name).querySelector("span").textContent=[summary,qualifier].filter(Boolean).join(" · ");
    }
    document.querySelector('[data-more-section="cg-section"]').hidden=$("cg-section").hidden;
  }
  const summaryObserver=new MutationObserver(syncTodaySummaries);
  for (const id of ["market-glance","sport-glance","source-markets","source-sport","cg-section"]) {
    summaryObserver.observe($(id),{childList:true,attributes:true,attributeFilter:["hidden","data-state"]});
  }
  syncTodaySummaries();
  if (secondaryRoute()) openSection(secondaryRoute());
  function checkTime(v){return new Intl.DateTimeFormat("en-AU",{weekday:"short",hour:"numeric",minute:"2-digit"}).format(new Date(v));}
  const editionDate = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
  const editionTime = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit",
  });
  function health(id, text) {
    const element = $(id);
    element.hidden = !text;
    element.querySelector("span").textContent = text;
  }
  function sourceStatus(name, state, text) {
    const row = $("source-" + name);
    row.dataset.state = state;
    row.textContent = text;
  }
  document.querySelectorAll("[data-retry]").forEach(button => button.addEventListener("click", async event => {
    const kind = button.dataset.retry;
    const keyboardFocus = button.matches(":focus-visible") ||
      (event.detail === 0 && document.activeElement === button);
    const buttons = document.querySelectorAll('[data-retry="' + kind + '"]');
    for (const retry of buttons) {
      retry.disabled = true;
      retry.textContent = "Checking…";
    }
    try {
      await ({ digest: loadData, weather: () => loadWeather(false), sport: loadSports })[kind]();
    } finally {
      for (const retry of buttons) {
        retry.disabled = false;
        retry.textContent = "Try again";
      }
      const page = button.closest(".page");
      const dialog = button.closest("dialog");
      const active = document.activeElement;
      if (keyboardFocus && !page?.inert && (dialog ? dialog.open : !document.querySelector("dialog[open]")) &&
          (active === document.body || active === button)) {
        const heading = page?.querySelector("h1") || dialog?.querySelector(".sheet-head h2");
        const target = button.parentElement.hidden ? (kind === "weather" ? $("wx-loc") : heading) : button;
        if (target) {
          if (target === heading) target.tabIndex = -1;
          target.focus({ preventScroll: true });
        }
      }
    }
  }));
  let sportsCheckedAt="",lastData=null, digestWasSaved=false;
  // ---------------------------------------------------------------- header --
  const now = new Date();
  let displayedEditionDay = editionDate.format(now);
  const localDate = new Intl.DateTimeFormat("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  $("date-line").textContent = localDate.format(now);

  // shared day number for games + rotations
  window.MB_DAYNUM = Math.max(0, Math.round(
    (startOfDay(now) - startOfDay(new Date(CFG.gameEpoch + "T00:00:00"))) / 86400000
  ));
  function startOfDay(d) { const c = new Date(d); c.setHours(0, 0, 0, 0); return +c; }

  // iOS keeps a home-screen app alive in the background for days, so a page
  // opened last night would come back with yesterday's date, data and puzzle
  // (a tapped notification only refocuses it). Reload on return if the day
  // has changed or it's been away over an hour; game progress lives in
  // localStorage, so nothing is lost.
  const loadedDay = now.toDateString();
  let hiddenAt = null;
  const staleOnReturn = () => new Date().toDateString() !== loadedDay ||
    (hiddenAt != null && Date.now() - hiddenAt > 3600000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (staleOnReturn()) location.reload();
  });
  window.addEventListener("pageshow", e => { if (e.persisted && staleOnReturn()) location.reload(); });

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

  // Use a recent saved location without prompting again. Keep its origin
  // distinguishable from the configured default when permission is unavailable.
  const LOC_MAX_AGE = 7 * 24 * 3600 * 1000;
  let weatherReport, weatherRequest, weatherRetryLocation;

  function getLocation(force) {
    let cached;
    try { cached = safeParse(localStorage.getItem("mb_loc")); } catch {}
    const valid = Number.isFinite(cached?.lat) && Number.isFinite(cached?.lon);
    const fallback = valid
      ? { ...cached, source: cached.source === "default" ? "default" : "saved" }
      : { ...CFG.fallback, source: "default", at: Date.now() };
    const fresh = valid && cached.at && Date.now() - cached.at < LOC_MAX_AGE;
    if ((!force && fresh) || !navigator.geolocation) return Promise.resolve(fallback);

    return new Promise(resolve => {
      try {
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: null, at: Date.now(), source: "device" }),
          () => resolve(fallback),
          { timeout: 8000, maximumAge: 15 * 60 * 1000 }
        );
      } catch { resolve(fallback); }
    });
  }

  async function placeName(loc, signal) {
    const lookup = new AbortController();
    const abort = () => lookup.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 2500);
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${loc.lat}&longitude=${loc.lon}&localityLanguage=en`, { signal: lookup.signal });
      if (!r.ok) return null;
      const j = await r.json();
      return j.locality || j.city || j.principalSubdivision || null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    }
  }

  function saveWeatherLocation(loc) {
    try { localStorage.setItem("mb_loc", JSON.stringify(loc)); } catch {}
  }

  function setWeatherLocation(loc) {
    const label = (loc.name || "Your location") + (loc.source === "default" ? " (default)" : "");
    $("wx-loc").textContent = label;
    $("wx-loc").setAttribute("aria-label", "Update weather location. Showing " + label);
  }

  function weatherStatus(state, message) {
    const loading = state === "loading";
    health("weather-health", loading && !weatherReport ? "" : message);
    $("weather-health").querySelector("button").hidden = loading;
    sourceStatus("weather", state, message);
    if (!weatherReport) {
      $("weather-stamp").textContent = loading ? "Checking the hourly forecast…" : "";
      $("chart-unavailable").hidden = loading;
    }
    if (state !== "ready") {
      $("weather-priority").hidden = true;
      if (weatherReport) updateWeatherAdvice(weatherReport.weather);
      updateWeatherMarker();
    }
  }

  async function loadWeather(force = false) {
    weatherRequest?.abort();
    const request = new AbortController();
    weatherRequest = request;
    const { signal } = request;
    weatherStatus("loading", "Checking the forecast…");

    const loc = !force && weatherRetryLocation ? weatherRetryLocation : await getLocation(force);
    if (weatherRequest !== request) return;

    // Keep a device fix across reloads even if its forecast fails.
    if (loc.source === "device") saveWeatherLocation(loc);
    const lookup = loc.name || placeName(loc, signal);
    if (!weatherReport) setWeatherLocation(loc);
    weatherStatus("loading", "Checking the forecast for " + (loc.name || "your location") + "…");
    const timeout = setTimeout(() => request.abort(), 12000);
    let weather = null;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
        `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset` +
        `&hourly=temperature_2m,precipitation_probability&forecast_days=2&timezone=auto`;
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error("Forecast request failed");
      const data = await response.json();
      if (!Number.isFinite(data.current?.temperature_2m) ||
          !Number.isFinite(data.daily?.temperature_2m_max?.[0]) ||
          !Array.isArray(data.hourly?.temperature_2m)) throw new Error("Forecast is incomplete");
      weather = data;
    } catch {
      // Keep the last complete report below.
    } finally {
      clearTimeout(timeout);
    }

    const resolvedName = await lookup;
    if (weatherRequest !== request) return;
    loc.name = resolvedName;
    // A temporary GPS failure must not make the default look like a recent fix.
    if (weather || loc.source === "device") saveWeatherLocation(loc);
    if (!weather) {
      weatherRetryLocation = loc;
      const unavailable = "Forecast unavailable for " + (loc.name || "your location") + ".";
      if (weatherReport) {
        const { location, checkedAt } = weatherReport;
        const samePlace = location.lat === loc.lat && location.lon === loc.lon;
        const retained = samePlace ? "Showing the forecast checked " : "Showing the forecast for " + (location.name || "the last location") + ", checked ";
        weatherStatus("saved", unavailable + " " + retained + checkTime(checkedAt) + ".");
      } else {
        setWeatherLocation(loc);
        $("wx-advice").textContent = "Forecast unavailable";
        weatherStatus("unavailable", unavailable);
      }
      return;
    }

    weatherRetryLocation = null;
    const checkedAt = new Date().toISOString();
    weatherReport = { location: loc, checkedAt, weather };
    setWeatherLocation(loc);
    renderWeather(weatherReport);
  }

  function renderWeather({ location, checkedAt, weather: w }) {
    health("weather-health", "");
    const modelTime = typeof w.current.time === "string"
      ? (w.current.time.replace("T", " ") + " " + (w.timezone_abbreviation || "")).trim()
      : "";
    const place = location.source === "default" ? "Default location: "
      : location.source === "saved" ? "Saved location: " : "";
    const checked = place + (location.name || "Your location") + ". Checked " + checkTime(checkedAt) +
      (modelTime ? ". Model estimate at " + modelTime + "." : ".");
    $("weather-stamp").textContent = "Open-Meteo. " + checked;
    sourceStatus("weather", "ready", checked);
    $("hourly-table").innerHTML = '<table><caption>Today’s hourly forecast</caption><thead><tr><th>Time</th><th>Temperature</th><th>Rain chance</th></tr></thead><tbody>' + w.hourly.temperature_2m.slice(0,24).map((t,i) => `<tr><td>${esc((w.hourly.time?.[i] || "").split("T")[1] || i + ":00")}</td><td>${Number.isFinite(t) ? round1(t) + "°C" : "Unavailable"}</td><td>${Number.isFinite(w.hourly.precipitation_probability?.[i]) ? w.hourly.precipitation_probability[i] + "%" : "Unavailable"}</td></tr>`).join("") + '</tbody></table>';
    hourlyDetails.querySelector(".hourly-values").hidden = false;
    const cur = w.current, day = w.daily;
    const [desc] = WMO[cur.weather_code] || ["Current conditions"];
    const uv = day.uv_index_max?.[0];

    $("wx-temp").textContent = Math.round(cur.temperature_2m) + "°";
    $("weather-line").hidden = false;
    $("wx-desc").textContent = Number.isFinite(cur.apparent_temperature)
      ? desc + ". Feels like " + Math.round(cur.apparent_temperature) + "°." : desc;

    renderWeatherCharts(w);
    renderDayline(w.hourly);
    updateWeatherAdvice(w);

    const formatHour = value => {
      const local = typeof value === "string" ? value.split("T")[1] : "";
      if (!local) return "";
      const [hour, minute] = local.split(":").map(Number);
      return (hour % 12 || 12) + ":" + String(minute).padStart(2, "0") + (hour < 12 ? " am" : " pm");
    };
    const sunrise = formatHour(day.sunrise?.[0]);
    const sunset = formatHour(day.sunset?.[0]);
    $("weather-observations").innerHTML =
      (Number.isFinite(uv) ? `<span>UV <b>${Math.round(uv)}</b></span>` : "") +
      (sunrise ? `<span>Sunrise <b>${esc(sunrise)}</b></span>` : "") +
      (sunset ? `<span>Sunset <b>${esc(sunset)}</b></span>` : "");
  }

  const WEATHER_HOUR = 3600000;
  const WEATHER_WIDTH = 580;
  const forecastTime = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric", minute: "2-digit", timeZone: "UTC",
  });
  let weatherTimeline;
  const hourlyDetails = document.querySelector(".hourly-details");
  const weatherMetrics = [...hourlyDetails.querySelectorAll("[data-metric]")];
  let preferredMetric = "rain";
  let chartAvailable = { rain: false, temperature: false };
  function selectMetric() {
    const selected = chartAvailable[preferredMetric] ? preferredMetric : weatherMetrics.find(button => chartAvailable[button.dataset.metric])?.dataset.metric;
    for (const button of weatherMetrics) {
      const metric = button.dataset.metric;
      button.disabled = !chartAvailable[metric];
      button.setAttribute("aria-pressed", String(metric === selected));
      $(metric + "-wrap").hidden = metric !== selected;
    }
    $("chart-unavailable").hidden = Boolean(selected) || !weatherReport;
  }
  for (const button of weatherMetrics) button.addEventListener("click", () => {
    preferredMetric = button.dataset.metric;
    selectMetric();
    updateWeatherMarker();
  });
  selectMetric();

  function updateWeatherAdvice({ current, daily, hourly, utc_offset_seconds }) {
    const clock = weatherTimeline;
    const currentTime = typeof current.time === "string" ? current.time : "";
    const forecastDay = daily.time?.[0] || currentTime.slice(0, 10) || hourly.time?.[0]?.slice?.(0, 10);
    const localNow = Date.now() + utc_offset_seconds * 1000;
    const sameDay = Number.isFinite(utc_offset_seconds) && Math.abs(utc_offset_seconds) <= 86400 && new Date(localNow).toISOString().slice(0, 10) === forecastDay;
    const hours = clock ? (Date.now() + clock.offset * 1000 - clock.start) / WEATHER_HOUR : NaN;
    const inRange = sameDay && hours >= 0 && hours < clock.duration / WEATHER_HOUR;
    // Each rain value covers the hour ending at its timestamp. Ignore hours
    // that have already ended, even when they set the whole day's peak.
    const start = inRange ? Math.floor(hours) + 1 : 0;
    const day = 24 * WEATHER_HOUR;
    const midnight = inRange ? (Math.floor(clock.start / day) + 1) * day : NaN;
    const end = inRange ? (midnight - clock.start) / WEATHER_HOUR : -1;
    const chances = inRange && Array.isArray(hourly.precipitation_probability)
      ? hourly.precipitation_probability.slice(start, end + 1) : [];
    const valid = chances.flatMap((chance, i) => {
      const time = Date.parse(hourly.time?.[start + i] + "Z");
      return time === clock.start + (start + i) * WEATHER_HOUR &&
        Number.isFinite(chance) && chance >= 0 && chance <= 100 ? [{chance, time, i}] : [];
    });
    const complete = valid.length > 0 && valid.length === end - start + 1;
    const rain = valid.length ? Math.max(...valid.map(hour => hour.chance)) : null;
    const firstRain = valid.find(hour => hour.chance >= 40);
    const warmest = inRange ? Math.max(current.temperature_2m, ...hourly.temperature_2m.slice(start, end).filter(Number.isFinite)) : null;
    let advice = sameDay ? "Today’s forecast" : "Forecast needs a fresh check";
    if (firstRain) advice = firstRain.i === 0 ? "Rain chance in the next hour" : "Rain chance rises by " + forecastTime.format(firstRain.time);
    else if (rain >= 25) advice = "A shower is possible";
    else if (warmest >= 30) advice = "Hot conditions ahead";
    else if (inRange && current.temperature_2m <= 8) advice = "Cold conditions";
    else if (complete) advice = "Low rain chance ahead";
    const fresh = sameDay && $("source-weather").dataset.state === "ready";
    const dry = fresh && complete && rain === 0 && warmest < 30 && current.temperature_2m > 8;
    if (dry) {
      advice = localNow < midnight - 6 * WEATHER_HOUR ? "Dry through this evening" : "Dry for the rest of today";
    }
    const estimateAge = localNow - Date.parse(currentTime + "Z");
    $("wx-temp-label").textContent = fresh && estimateAge >= 0 && estimateAge < WEATHER_HOUR ? "now" : "last checked";
    $("wx-meta").hidden = !sameDay;
    if (!fresh && sameDay) advice = "Last checked forecast";
    const dayline = $("weather-dayline");
    dayline.hidden = !inRange || !dayline.children.length;
    dayline.toggleAttribute("data-dry", dry);
    const adviceLine = $("wx-advice");
    if (adviceLine.textContent !== advice) adviceLine.textContent = advice;
    const priority = $("weather-priority");
    const urgent = firstRain?.i === 0 && firstRain.chance >= 60 && fresh;
    if (urgent) {
      const text = firstRain.chance + "% rain chance by " + forecastTime.format(firstRain.time) +
        " in " + (weatherReport?.location.name || "your area") + ". Take an umbrella if you are heading out.";
      if (priority.textContent !== text) priority.textContent = text;
    }
    priority.hidden = !urgent;

    const min = daily.temperature_2m_min?.[0];

    const details = `<span>High <b>${Math.round(daily.temperature_2m_max[0])}°</b></span>` +
      (Number.isFinite(min) ? `<span>Low <b>${Math.round(min)}°</b></span>` : "");
    if ($("wx-meta").innerHTML !== details) $("wx-meta").innerHTML = details;
  }

  function renderDayline(hourly) {
    const list = $("weather-dayline");
    list.replaceChildren();
    const clock = weatherTimeline;
    if (!clock || clock.start % (24 * WEATHER_HOUR) !== 0) return;
    const rainValues = Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability : [];
    for (const [name, start, end] of [["Morning", 6, 12], ["Afternoon", 12, 18], ["Evening", 18, 24]]) {
      const temperatures = hourly.temperature_2m.slice(start, end);
      const chances = rainValues.slice(start + 1, end + 1);
      const haveTemperature = temperatures.length === end - start && temperatures.every(Number.isFinite);
      const haveRain = chances.length === end - start && chances.every((chance, i) =>
        Number.isFinite(chance) && chance >= 0 && chance <= 100 &&
        Date.parse(hourly.time[start + i + 1] + "Z") === clock.start + (start + i + 1) * WEATHER_HOUR);
      if (!haveTemperature && !haveRain) continue;
      const row = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = name;
      row.append(label);
      if (haveTemperature) {
        const temperature = document.createElement("span");
        temperature.className = "period-temp";
        temperature.textContent = "Up to " + Math.round(Math.max(...temperatures)) + "°";
        row.append(temperature);
      }
      if (haveRain) {
        const rain = document.createElement("small");
        const peak = Math.max(...chances);
        rain.textContent = "Up to " + peak + "% rain";
        rain.classList.toggle("dry-period", haveTemperature && peak === 0);
        row.append(rain);
      }
      list.append(row);
    }
  }

  function updateWeatherMarker() {
    const clock = weatherTimeline;
    const localNow = clock ? Date.now() + clock.offset * 1000 : NaN;
    const fraction = clock ? (localNow - clock.start) / clock.duration : NaN;
    const inRange = fraction >= 0 && fraction < 1 && $("source-weather").dataset.state === "ready";
    for (const marker of hourlyDetails.querySelectorAll(".weather-now")) {
      marker.hidden = !inRange;
      if (inRange) {
        marker.style.setProperty("--weather-now", (fraction * 100).toFixed(2) + "%");
        marker.firstElementChild.textContent = "Now " + forecastTime.format(localNow);
      }
      const chart = marker.previousElementSibling;
      chart.setAttribute("aria-label", (chart.dataset.description || chart.getAttribute("aria-label")) +
        (inRange ? ". Current local time " + forecastTime.format(localNow) : ""));
    }
  }

  hourlyDetails.addEventListener("toggle", () => {
    if (hourlyDetails.open) updateWeatherMarker();
  });
  function updateClockLabels() {
    if (document.hidden) return;
    const date = localDate.format(Date.now());
    if ($("date-line").textContent !== date) {
      $("date-line").textContent = date;
      renderDeadlines();
      updateTodayFocus(focusLoad());
    }
    if (weatherReport) {
      if ($("source-weather").dataset.state === "ready" && Date.now() - Date.parse(weatherReport.checkedAt) >= WEATHER_HOUR) {
        weatherStatus("saved", "Forecast checked " + checkTime(weatherReport.checkedAt) + ". Conditions may have changed.");
      } else {
        updateWeatherAdvice(weatherReport.weather);
        if (hourlyDetails.open) updateWeatherMarker();
      }
    }
    if (lastData && editionDate.format(Date.now()) !== displayedEditionDay) {
      renderDigestStatus(lastData, digestWasSaved);
    }
  }
  setInterval(updateClockLabels, 60_000);
  document.addEventListener("visibilitychange", updateClockLabels);

  function renderWeatherCharts(weather) {
    const { hourly, utc_offset_seconds: offset } = weather;
    const temps = hourly.temperature_2m.slice(0, 24);
    const rain = Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability.slice(0, 24) : [];
    const count = Math.max(temps.length, rain.length);
    // Open-Meteo timestamps use the forecast location's fixed UTC offset.
    const times = Array.isArray(hourly.time) ? hourly.time.slice(0, count).map(time => Date.parse(time + "Z")) : [];
    const start = times[0];
    const duration = count * WEATHER_HOUR;
    const hasTimes = times.length === count && Number.isFinite(start) &&
      times.every((time, i) => time === start + i * WEATHER_HOUR);
    weatherTimeline = hasTimes && Number.isFinite(offset) ? { start, duration, offset } : null;

    for (const axis of hourlyDetails.querySelectorAll("[data-weather-axis]")) {
      axis.replaceChildren();
      if (!hasTimes) continue;
      for (const position of [0, 0.5, 1]) {
        const tick = document.createElement("span");
        tick.textContent = forecastTime.format(start + duration * position);
        axis.append(tick);
      }
    }

    const spark = $("wx-spark");
    const hasTemperature = temps.length >= 2 && temps.every(Number.isFinite);
    spark.dataset.description = "Hourly temperature";
    if (hasTemperature) {
      const low = Math.min(...temps);
      const high = Math.max(...temps);
      const span = Math.max(1, high - low);
      const points = temps.map((temperature, i) => [
        (i / count) * WEATHER_WIDTH,
        59 - ((temperature - low) / span) * 47,
      ]);
      const highIndex = temps.indexOf(high);
      const [peakX, y] = points[highIndex];
      const x = Math.max(4, peakX);
      const highLabel = "High " + round1(high) + "°C" +
        (hasTimes ? " at " + forecastTime.format(times[highIndex]) : "");
      $("temperature-lbl").textContent = "Hourly temperature · " + highLabel;
      spark.dataset.description += ". " + highLabel;
      spark.innerHTML =
        '<line x1="0" y1="59" x2="580" y2="59" class="weather-grid"/>' +
        `<polyline fill="none" stroke="var(--edition-accent)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" points="${points.map(point => point.map(value => value.toFixed(1)).join(",")).join(" ")}"/>` +
        `<path class="weather-peak" d="M ${x} ${y - 4} l 4 4 l -4 4 l -4 -4 z"/>`;
    }

    const rainGraph = $("wx-rain");
    const hasRain = rain.length > 0 && rain.every(Number.isFinite);
    rainGraph.dataset.description = "Hourly rain chance";
    if (hasRain) {
      const peak = Math.max(...rain);
      const peakLabel = "Peak " + peak + "%" +
        (hasTimes ? " at " + forecastTime.format(times[rain.indexOf(peak)]) : "");
      $("rain-lbl").textContent = "Hourly rain chance · " + peakLabel;
      rainGraph.dataset.description += ". " + peakLabel;
      const width = WEATHER_WIDTH / count;
      rainGraph.innerHTML =
        '<path class="weather-grid" stroke-dasharray="3 4" d="M0 2h580 M0 22h580"/>' +
        rain.map((chance, i) => {
          const height = Math.max(1.5, (chance / 100) * 40);
          return `<rect x="${(i * width + 1).toFixed(1)}" y="${(42 - height).toFixed(1)}" width="${(width - 2).toFixed(1)}" height="${height.toFixed(1)}" rx="1.5" fill="${chance >= 40 ? "var(--edition-accent)" : "var(--sky-stroke)"}"/>`;
        }).join("") + '<path class="weather-grid" d="M0 42.5h580"/>' +
        '<text x="4" y="11" font-size="9" fill="var(--ink-soft)">100%</text><text x="4" y="31" font-size="9" fill="var(--ink-soft)">50%</text>';
    }
    chartAvailable = { rain: hasRain, temperature: hasTemperature };
    selectMetric();
    updateWeatherMarker();
  }

  // ------------------------------------------------------- markets & news --
  let digestCheck;
  function loadData() {
    digestCheck ??= fetchDigest().finally(() => { digestCheck = null; });
    return digestCheck;
  }

  async function fetchDigest() {
    let d, savedResponse = false, retainedInMemory = false;
    try {
      const response = await fetch("data/data.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("Digest request failed");
      savedResponse = response.headers.get("X-Morning-Cache") === "saved";
      d = await response.json();
      if (!Number.isFinite(Date.parse(d?.generatedAt)) || !Array.isArray(d.markets?.items)
        || (!Array.isArray(d.news?.categories) && !Array.isArray(d.news?.stories))) {
        throw new Error("Invalid digest");
      }
      lastData = d;
    }
    catch {
      if (!lastData) {
        const message = "The digest is unavailable. Check your connection and try again.";
        for (const id of ["digest-health", "news-health"]) health(id, message);
        sourceStatus("digest", "unavailable", message);
        sourceStatus("markets", "unavailable", "No market snapshot available.");
        sourceStatus("deals", "unavailable", "No deals available.");
        $("news-updated-line").textContent = "Digest unavailable";
        $("today-news-edition").textContent = "News unavailable";
        $("markets-stamp").textContent = "Market snapshot unavailable";
        $("mkt-body").innerHTML = '<tr><td colspan="3">Market data unavailable.</td></tr>';
        $("deals-list").textContent = "Deals are unavailable until the digest loads.";
        window.MorningBriefNews?.showUnavailable({ list: $("news-list"), status: $("news-results-status") });
        return;
      }
      d = lastData;
      savedResponse = true;
      retainedInMemory = true;
    }

    digestWasSaved = savedResponse;
    renderDigestStatus(d, savedResponse);
    if (retainedInMemory) return;
    releasesData = d.releases || null;
    // each section renders independently: one bad field must not leave the
    // rest of the page stuck on its loading text
    const sections = [
      ["markets", () => renderMarkets(d.markets)],
      ["news", () => renderNews(d.news)],
      ["wotd", () => renderWotd(d.wotd)],
      ["commGames", () => renderCommGames(d.commGames)],
      ["deals", () => renderDeals(d.deals)],
    ];
    for (const [name, render] of sections) {
      try { render(); } catch (e) { console.error(`render ${name} failed:`, e); }
    }
  }

  function renderDigestStatus(d, savedResponse) {
    const generated = new Date(d.generatedAt);
    const current = new Date();
    displayedEditionDay = editionDate.format(current);
    const generatedDay = editionDate.format(generated);
    const sameDay = generatedDay === displayedEditionDay;
    const previousEdition = !sameDay && generated <= current;
    const time = editionTime.format(generated);
    const prepared = (sameDay ? "today" : generatedDay) + " at " + time + " Sydney time";
    const digestState = savedResponse ? "saved" : previousEdition ? "previous" : "ready";
    const label = savedResponse ? (navigator.onLine ? "Saved edition" : "Saved offline")
      : previousEdition ? "Previous edition" : sameDay ? "Today’s edition" : "Edition";
    const updatedText = label + " · " + (sameDay ? "" : generatedDay + ", ") + time;
    $("news-updated-line").textContent = updatedText;
    $("today-news-edition").textContent = !savedResponse && sameDay ? "News updated at " + time : updatedText;
    const reusedWord = d.wotd?.carried === true;
    $("today-word-edition").textContent = reusedWord ? "Word from a previous edition" : updatedText;
    $("today-word-edition").hidden = !reusedWord && !savedResponse && sameDay;
    const marketLabel = savedResponse ? "Saved snapshot from " : previousEdition ? "Previous snapshot from " : "Snapshot published ";
    $("markets-stamp").textContent = marketLabel + prepared + ". Quotes may be from an earlier trading session.";
    const warning = savedResponse ? "Showing the saved edition from " + prepared + "."
      : previousEdition ? "Today’s edition hasn’t arrived yet. Showing the previous edition." : "";
    for (const id of ["digest-health", "news-health"]) health(id, warning);
    sourceStatus("digest", digestState, savedResponse ? warning : "Prepared " + prepared + ".");
    if (d.markets.items.some(item => Number.isFinite(item?.price))) {
      sourceStatus("markets", digestState, $("markets-stamp").textContent);
    } else {
      sourceStatus("markets", "unavailable", "No prices were published in this edition.");
    }
    const retainedDeals = d.carried?.deals;
    if (retainedDeals && Number.isFinite(Date.parse(retainedDeals))) {
      sourceStatus("deals", "saved", "Showing the last available offers. Reuse began " + checkTime(retainedDeals) + ".");
    } else {
      const dealLabel = savedResponse ? "Included with the saved edition from " : "Included with the edition from ";
      sourceStatus("deals", digestState, dealLabel + prepared + ".");
    }

  }

  function renderDeals(deals) {
    const list = $("deals-list");
    const offers = Array.isArray(deals) ? deals.filter(deal => deal?.title && safeWebURL(deal.link)) : [];
    if (!offers.length) {
      list.textContent = "No offers in this edition. Check again after the next refresh.";
      sourceStatus("deals", "unavailable", "No offers were included with this edition.");
      return;
    }
    list.innerHTML = offers.map(dl => {
      const ageH = dl.ts ? (Date.now() - dl.ts) / 3600000 : null;
      const age = ageH == null ? null :
        ageH < 1 ? "just posted" : ageH < 48 ? `${Math.round(ageH)}h ago` : `${Math.round(ageH / 24)}d ago`;
      const meta = [dl.category, age, dl.neg ? `${dl.neg}↓` : null].filter(Boolean).join(" · ");
      const votes = Number.isFinite(dl.votes) ? `<span class="deal-votes">+${dl.votes}</span>` : "";
      return `<a class="deal" href="${esc(safeWebURL(dl.link))}" target="_blank" rel="noopener noreferrer">` + votes +
        `<span class="deal-main"><span class="deal-t">${esc(dl.title)}</span>` +
        (meta ? `<span class="deal-meta">${esc(meta)}</span>` : "") + `</span></a>`;
    }).join("");
  }

  function renderCommGames(cg) {
    if (!cg) return; // games over (or feature absent) — section stays hidden
    if (Date.now() > Date.parse(cg.end) + 4 * 86400000) return;
    $("cg-section").hidden = false;

    if (cg.medals && cg.medals.length) {
      const aus = cg.medals.find(m => m.code === "AUS");
      $("cg-sub").textContent = aus ? `· AUS ${ordinal(aus.rank)}` : "· medal tally";
      $("cg-medals").hidden = false;
      $("cg-medals").innerHTML = `<table class="cg-table">
        <thead><tr><th></th><th>Nation</th><th class="r m-g">G</th><th class="r m-s">S</th><th class="r m-b">B</th><th class="r">Tot</th></tr></thead>
        <tbody>` + cg.medals.map(m =>
          `<tr${m.code === "AUS" ? ' class="aus"' : ""}><td class="r">${m.rank}</td><td>${esc(m.country)}</td>` +
          `<td class="r m-g">${m.g}</td><td class="r m-s">${m.s}</td><td class="r m-b">${m.b}</td><td class="r"><b>${m.total}</b></td></tr>`
        ).join("") + `</tbody></table>`;
    } else {
      const days = Math.ceil((Date.parse(cg.start + "T00:00:00") - Date.now()) / 86400000);
      const startTxt = new Date(cg.start + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long" });
      $("cg-sub").textContent = days > 0 ? `· ${cg.host} · starts ${startTxt} — in ${days} day${days === 1 ? "" : "s"}` : `· ${cg.host} · under way`;
    }

    // upcoming: Glasgow's next two competition days (their evening sessions
    // land in Melbourne's morning, so "today" here is tonight/overnight)
    $("cg-upcoming").innerHTML = (cg.upcoming || []).map((d, i) => {
      const dt = new Date(d.date + "T12:00:00");
      const label = (i === 0 ? "Today in Glasgow — " : "Tomorrow — ") +
        dt.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long" });
      const finals = d.finals.length
        ? `<div class="cg-finals">🥇 ${d.finals.map(f => `${esc(f.sport)}${f.golds > 1 ? ` ×${f.golds}` : ""}`).join(" · ")}</div>`
        : "";
      const comp = d.competing.length
        ? `<div class="cg-comp">Also on: ${d.competing.map(esc).join(", ")}</div>`
        : "";
      return `<div class="cg-day"><div class="cg-day-h">${esc(label)}</div>${finals}${comp}</div>`;
    }).join("");
  }

  function renderWotd(w) {
    const available = typeof w?.word === "string" && w.word.trim();
    if (!available && document.activeElement === $("today-word-link")) $("today-news-edition").focus();
    $("today-word").hidden = $("wotd-section").hidden = !available;
    if (!available) return;
    const preview = $("today-word-link");
    preview.querySelector("strong").textContent = w.word;
    preview.querySelector("small").textContent = w.def || "Open word details";
    $("wotd-word").textContent = w.word;
    $("wotd-phon").textContent = w.phonetic || "";
    $("wotd-pos").textContent = w.pos || "";
    $("wotd-def").textContent = w.def;
    $("wotd-ex").hidden = !w.example;
    $("wotd-ex").textContent = w.example ? "“" + w.example + "”" : "";
    const btn = $("wotd-audio");
    btn.hidden = false;
    const clip = w.audio ? new Audio(w.audio) : null;
    let broken = !clip;
    if (clip) {
      clip.preload = "auto";
      clip.addEventListener("error", () => { broken = true; });
    }
    const speak = () => {
      // no recording (or it failed to load) — the device voice still works,
      // including offline
      try {
        const u = new SpeechSynthesisUtterance(w.word);
        u.lang = "en-AU";
        u.rate = 0.85;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      } catch { /* no speech support either */ }
    };
    btn.onclick = () => {
      if (broken) { speak(); return; }
      clip.currentTime = 0;
      clip.play().catch(() => { broken = true; speak(); });
    };
  }

  function fmtPrice(i) {
    if (i.fmt === "index") return Math.round(i.price).toLocaleString();
    if (i.fmt === "fx") return i.price.toFixed(4);
    return "$" + i.price.toFixed(2);
  }

  function renderMarkets(m) {
    const quotes = Array.isArray(m?.items) ? m.items.filter(item => Number.isFinite(item?.price)) : [];
    $("mkt-note").hidden = true;
    $("mkt-movers").hidden = true;
    const glance = $("market-glance");
    glance.hidden = true;
    if (!quotes.length) {
      $("mkt-body").innerHTML = '<tr><td colspan="3" class="muted-cell">No prices in this snapshot.</td></tr>';
      sourceStatus("markets", "unavailable", "No prices were published in this edition.");
      return;
    }
    const lead = quotes.find(item => item.sym === "^AXJO") || quotes[0];
    const move = Number.isFinite(lead.chgPct)
      ? "  " + (lead.chgPct >= 0 ? "+" : "−") + Math.abs(lead.chgPct).toFixed(1) + "%" : "";
    glance.textContent = lead.label + "  " + fmtPrice(lead) + move;
    glance.hidden = false;
    $("mkt-body").innerHTML = quotes.map(i => {
      const chg = Number.isFinite(i.chgPct)
        ? `<td class="r ${i.chgPct >= 0 ? "chg-up" : "chg-down"}">${i.chgPct >= 0 ? "+" : "−"}${Math.abs(i.chgPct).toFixed(1)}%</td>`
        : '<td class="r">—</td>';
      return `<tr><td>${esc(i.label)}<span class="name">${esc(i.name)}</span></td><td class="r">${fmtPrice(i)}</td>${chg}</tr>`;
    }).join("");
    if (m.note) {
      $("mkt-note").hidden = false;
      $("mkt-note").innerHTML = `<b>Buy-plan note:</b> ${esc(m.note)}`;
    }
    const movers = Array.isArray(m.movers) ? m.movers.filter(item => Number.isFinite(item?.price) && Number.isFinite(item?.chgPct)) : [];
    if (movers.length) {
      $("mkt-movers").hidden = false;
      $("mkt-movers").innerHTML = '<h3 class="movers-h">Big movers</h3>' + movers.map(x => {
        const up = x.chgPct >= 0;
        const price = x.currency === "USD" ? `US$${x.price.toFixed(2)}` : `$${x.price.toFixed(2)}`;
        return `<div class="mover"><span class="mv-name">${esc(x.name)} <span class="mv-mkt">${esc(x.market)}</span></span>` +
          `<span class="mv-price">${price}</span>` +
          `<span class="${up ? "chg-up" : "chg-down"} mv-chg">${up ? "+" : "−"}${Math.abs(x.chgPct).toFixed(1)}%</span></div>`;
      }).join("");
    }
  }

  let newsData = null;
  let newsFresh = new Set(); // story ids first seen on this open
  let releasesData = null;

  function renderNews(n) {
    // tolerate the pre-tabs data shape from a cached data.json
    if (Array.isArray(n?.stories) && !Array.isArray(n.categories)) {
      n = { ...n, categories: [{ key: "top", label: "Top", stories: n.stories }] };
    }
    const top = Array.isArray(n?.categories) ? n.categories.find(category => category?.key === "top") : null;
    const lead = Array.isArray(top?.stories) ? top.stories.find(story => typeof story?.headline === "string" && story.headline.trim()) : null;
    renderTodayStory(lead, n?.mode);
    if (!Array.isArray(n?.categories) || !n.categories.length) {
      newsData = null;
      backToTodayStory.hidden = true;
      $("news-tabs").replaceChildren();
      $("news-topics").hidden = true;
      $("news-mode").textContent = "";
      window.MorningBriefNews?.render({list: $("news-list"), status: $("news-results-status"), category: null});
      return;
    }
    newsData = n;
    $("news-topics").hidden = false;
    $("news-mode").textContent = n.mode === "llm" ? "Generated summaries" : "Publisher snippets";

    // stories not present last time the app was opened get a NEW pill; the
    // seen list persists on-device (capped so it never grows unbounded)
    // a story counts as seen if ANY of its outlets' links was seen, so a new
    // outlet joining a known story doesn't make it look new again
    const fps = s => { const l = (s.sources || []).map(x => x.link).filter(Boolean); return l.length ? l : [s.headline]; };
    const all = n.categories.flatMap(c => c.stories);
    const seen = new Set(safeParse(localStorage.getItem("mb_news_seen")) || []);
    newsFresh = new Set(seen.size ? all.filter(s => !fps(s).some(f => seen.has(f))).map(s => s.id) : []);
    localStorage.setItem("mb_news_seen", JSON.stringify([...new Set([...seen, ...all.flatMap(fps)])].slice(-1500)));

    const tabs = $("news-tabs");
    const focusedTopic = tabs.contains(document.activeElement) ? document.activeElement.dataset.category : "";
    const keys = n.categories.map(c => c.key);
    const saved = localStorage.getItem("mb_news_tab");
    const activeKey = !backToTodayStory.hidden && lead ? "top" : keys.includes(saved) ? saved : keys[0];
    $("news-topic-label").textContent = "Topics · " + n.categories.find(category => category.key === activeKey).label;
    tabs.innerHTML = "";
    for (const c of n.categories) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.category = c.key;
      b.setAttribute("aria-pressed", String(c.key === activeKey));
      b.textContent = c.label;
      b.classList.toggle("active", c.key === activeKey);
      b.addEventListener("click", () => {
        localStorage.setItem("mb_news_tab", c.key);
        backToTodayStory.hidden = true;
        const restoreFocus = tabs.contains(document.activeElement);
        selectNewsTopic(c.key);
        if (restoreFocus) $("news-topic-label").focus({ preventScroll: true });
      });
      tabs.appendChild(b);
    }
    if (focusedTopic) [...tabs.children].find(button => button.dataset.category === focusedTopic)?.focus({ preventScroll: true });
    renderStories(activeKey);
  }

  function renderTodayStory(story, mode) {
    const link = $("today-story-link");
    const summary = $("today-story-summary");
    const kind = $("today-story-kind");
    const sources = $("today-story-sources");
    if (!story && document.activeElement === link) $("today-news-edition").focus();
    $("today-top-story").hidden = !story;
    link.textContent = story?.headline || "";
    summary.textContent = typeof story?.summary === "string" ? story.summary.trim() : "";
    summary.hidden = !summary.textContent;
    kind.textContent = summary.hidden ? "" : window.MorningBriefNews?.summaryAttribution?.(story, mode) || "";
    kind.hidden = !kind.textContent;
    const count = Array.isArray(story?.sources) ? story.sources.filter(source => source && typeof source === "object").length : 0;
    sources.hidden = !count;
    sources.textContent = count + (count === 1 ? " source" : " sources");
    if (!story) backToTodayStory.hidden = true;
  }

  function selectNewsTopic(key) {
    const category = newsData.categories.find(entry => entry.key === key);
    $("news-tabs").querySelectorAll("button").forEach(button => {
      const selected = button.dataset.category === key;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    $("news-topic-label").textContent = "Topics · " + category.label;
    $("news-topics").open = false;
    renderStories(key);
  }

  $("today-news-edition").addEventListener("click", event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    goTo(0, { pointer: event.detail > 0 });
  });
  $("today-story-link").addEventListener("click", event => {
    const pointer = event.detail > 0;
    selectNewsTopic("top");
    goTo(0, { pointer });
    backToTodayStory.hidden = false;
    const heading = $("news-list").querySelector(".news-headline");
    if (heading) focusPage(heading, pointer);
    backToTodayStory.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
  });
  backToTodayStory.addEventListener("click", event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    goTo(1, { keepPlace: true, pointer: event.detail > 0 });
    const story = $("today-story-link");
    if (story.offsetWidth) story.focus();
  });

  function renderStories(key) {
    window.MorningBriefNews?.render({
      list: $("news-list"),
      status: $("news-results-status"),
      category: newsData.categories.find(category => category.key === key),
      mode: newsData.mode,
      newIds: newsFresh,
      releases: key === "entertainment" ? releasesData : null,
    });
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
    if (lg.type === "cricket") return cricketDetail(e); // header-feed event — everything's inline
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
      const logoURL = safeWebURL(t.team?.logo);
      const logo = logoURL ? `<img src="${esc(logoURL)}" alt="" loading="lazy">` : "";
      const winner = state === "post" && t.winner ? " wc-winner" : "";
      return `<span class="wc-team ${side}${winner}">${side === "home" ? logo : ""}<span class="nm">${esc(t.team ? t.team.shortDisplayName : "?")}</span>${side === "away" ? logo : ""}</span>`;
    };

    let mid;
    if (state === "post") {
      mid = `<span class="wc-mid"><span class="wc-score">${esc(home.score ?? "")}–${esc(away.score ?? "")}</span><span class="wc-when">${esc(e.status.type.shortDetail || "FT")}</span></span>`;
    } else if (state === "in") {
      mid = `<span class="wc-mid"><span class="wc-score live">${esc(home.score ?? "")}–${esc(away.score ?? "")}</span><span class="wc-when live">${esc(e.status.displayClock || "LIVE")}</span></span>`;
    } else {
      const when = new Date(e.date).toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" });
      mid = `<span class="wc-mid"><span class="wc-score" style="color:var(--muted)">v</span><span class="wc-when">${esc(when)}</span></span>`;
    }

    const noteRow = note ? `<span class="wc-when" style="grid-column:1/-1;text-align:center">${esc(note)}</span>` : "";
    return `<button type="button" class="wc-match" data-eid="${esc(e.id)}" aria-expanded="false">${team(home, "home")}${mid}${team(away, "away")}${noteRow}</button>`;
  }

  // Cricket comes from ESPN's cricket header feed (site.web.api — the main
  // site API has no cricket). Scores are innings strings ("290 & 81/3"), so
  // rows stack the two teams instead of using the home–away grid.
  const CRICKET_NATIONS = ["Australia", "England", "India", "Pakistan", "South Africa", "New Zealand", "Sri Lanka", "West Indies", "Bangladesh", "Afghanistan", "Zimbabwe", "Ireland"];

  function cricketRow(e, league) {
    const state = e.status; // "pre" | "in" | "post"
    const team = c => {
      const win = state === "post" && c.winner ? " wc-winner" : "";
      return `<span class="ckt-team${win}"><span class="nm">${esc(c.displayName || "?")}</span><span class="ckt-score">${esc(c.score || "")}</span></span>`;
    };
    const stat = state === "pre"
      ? new Date(e.date).toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" })
      : (e.summary || (state === "in" ? "Live" : "Result"));
    return `<button type="button" class="wc-match ckt" data-eid="${esc(e.id)}" aria-expanded="false">` +
      (e.competitors || []).slice(0, 2).map(team).join("") +
      `<span class="ckt-status"><span class="ckt-league">${esc(league)}</span><span class="ckt-state${state === "in" ? " live" : ""}">${esc(stat)}</span></span></button>`;
  }

  function cricketDetail(e) {
    const parts = [];
    if (e.name) parts.push(`<div><b>Match:</b> ${esc(e.name)}</div>`);
    for (const c of e.competitors || []) {
      if (c.score) parts.push(`<div><b>${esc(c.displayName)}:</b> ${esc(c.score)}${c.winner ? " — won" : ""}</div>`);
    }
    if (e.summary) parts.push(`<div><b>Status:</b> ${esc(e.summary)}</div>`);
    const loc = typeof e.location === "string" ? e.location : (e.location && (e.location.fullName || e.location.name)) || "";
    if (loc) parts.push(`<div><b>Venue:</b> ${esc(loc)}</div>`);
    parts.push(`<div><b>Start:</b> ${esc(new Date(e.date).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</div>`);
    return parts.join("") || `<div>No extra detail available for this one.</div>`;
  }

  // An F1 "event" is the whole weekend: competitions[] holds FP1 through the
  // Race, and ESPN flags the event Final once practice ends. Every race-level
  // field (state, start time, podium) must come from the Race session itself.
  function raceComp(e) {
    const comps = e.competitions || [];
    return comps.find(c => c.type && /^race$/i.test(c.type.abbreviation || c.type.text || "")) ||
      comps[comps.length - 1] || {};
  }
  function raceState(e) {
    const c = raceComp(e);
    return c.status && c.status.type ? c.status.type.state : "pre";
  }

  // ESPN race names carry title sponsors and there's no clean field. Strip
  // the known ones (from the 2026 calendar); an unknown sponsor just shows
  // the full name, which is long but never wrong.
  const F1_SPONSORS = /^(Qatar Airways|Singapore Airlines|Etihad Airways|Gulf Air|MSC Cruises|Moët & Chandon|Tag Heuer|Crypto\.com|Heineken|Aramco|Lenovo|Pirelli|STC|AWS)\s+/i;

  function raceRow(e) {
    const race = raceComp(e);
    const state = raceState(e);
    const name = (e.name || e.shortName || "").replace(F1_SPONSORS, "");
    const start = race.date || e.date;
    if (state === "post") {
      const podium = (race.competitors || [])
        .filter(c => c.order >= 1 && c.order <= 3)
        .sort((a, b) => a.order - b.order)
        .map(c => `${c.order}. ${esc(c.athlete ? (c.athlete.shortName || c.athlete.displayName) : "?")}`)
        .join(" · ");
      return `<div class="wc-match race"><div class="race-name wc-winner">${esc(name)}</div><div class="race-detail">${podium || "Finished"}</div></div>`;
    }
    const when = new Date(start).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const days = Math.round((startOfDay(start) - startOfDay(Date.now())) / 86400000); // calendar days, DST-safe
    const rel = state === "in" ? "" : days === 0 ? " · today" : days === 1 ? " · tomorrow" : days > 1 ? ` · in ${days} days` : "";
    return `<div class="wc-match race"><div class="race-name">${esc(name)}</div><div class="race-detail">${esc(when)}${rel}${state === "in" ? ` · <span class="chg-up">LIVE</span>` : ""}</div></div>`;
  }

  // ESPN answers dates=YYYYMMDD-YYYYMMDD with HTTP 400 for team sports since
  // Sept 2026; month queries (dates=YYYYMM) still work. Fetch every month the
  // window touches (padded a day for timezone edges), merge, and let the
  // caller filter to the exact window.
  async function espnWindow(path, from, to) {
    const lo = new Date(from.getTime() - 86400000), hi = new Date(to.getTime() + 86400000);
    const months = [];
    for (let y = lo.getUTCFullYear(), m = lo.getUTCMonth();
      y < hi.getUTCFullYear() || (y === hi.getUTCFullYear() && m <= hi.getUTCMonth());
      m === 11 ? (y++, m = 0) : m++) {
      months.push(`${y}${String(m + 1).padStart(2, "0")}`);
    }
    const pages = await Promise.all(months.map(async ym => {
      try {
        const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${ym}`);
        if (!r.ok) return null;
        const { events } = await r.json();
        return Array.isArray(events) ? events : null;
      } catch { return null; }
    }));
    const byId = new Map();
    for (const page of pages) for (const event of page || []) byId.set(String(event.id), event);
    return { events: [...byId.values()], incomplete: pages.includes(null) };
  }

  async function loadSports() {
    let anyLive = false, failed = 0;
    const checkedEvents = new Map();

    // Australia matches always; Big Bash / Ashes / World Cups by name; plus
    // any international between two full-member nations so the section has
    // life when Australia is between series.
    async function cricketBlock(lg) {
      const response = await fetch("https://site.web.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&lang=en&region=au");
      if (!response.ok) throw new Error("Cricket scores unavailable");
      const data = await response.json();
      const leagues = data?.sports?.[0]?.leagues;
      if (!Array.isArray(leagues)) throw new Error("Invalid cricket scores");
      const evs = [];
      for (const l of leagues) for (const e of l.events || []) evs.push({ e, league: l.name || "" });
      const isAus = t => /^Australia( Women| A)?$/.test(t);
      const isNation = t => CRICKET_NATIONS.some(n => t === n || t === n + " Women");
      const marquee = /big bash|bbl|ashes|world cup|champions trophy/i;
      const picked = evs.filter(({ e, league }) => {
        const teams = (e.competitors || []).map(c => c.displayName || "");
        return teams.some(isAus) || marquee.test(league + " " + (e.name || "")) ||
          (teams.length >= 2 && teams.every(isNation));
      }).sort((a, b) => Date.parse(a.e.date) - Date.parse(b.e.date));
      if (!picked.length) return "";
      if (picked.some(x => x.e.status === "in")) anyLive = true;
      const post = picked.filter(x => x.e.status === "post").slice(-(lg.results || 3));
      const rest = picked.filter(x => x.e.status !== "post").slice(0, lg.upcoming || 3);
      const rows = [...post, ...rest].map(({ e, league }) => {
        checkedEvents.set(String(e.id), { e, lg });
        return cricketRow(e, league);
      });
      return `<div class="sport-league"><div class="sport-lg-label">${esc(lg.label)}</div><div class="wc-list">${rows.join("")}</div></div>`;
    }

    const blocks = await Promise.all((CFG.sports || []).map(async lg => {
      if (lg.type === "cricket") {
        try {
          return await cricketBlock(lg);
        } catch {
          failed++;
          return "";
        }
      }
      const from = new Date(Date.now() - lg.pastH * 3600 * 1000);
      const to = new Date(Date.now() + lg.futureD * 86400 * 1000);
      const { events: all, incomplete } = await espnWindow(lg.path, from, to);
      if (incomplete) failed++;
      const isRace = lg.type === "race";
      const when = e => Date.parse(isRace ? (raceComp(e).date || e.date) : e.date);
      const state = isRace ? raceState : e => (e.status && e.status.type ? e.status.type.state : "pre");
      const events = all
        .filter(e => state(e) === "in" || (when(e) >= +from && when(e) <= +to))
        .sort((a, b) => when(a) - when(b));
      if (!events.length) return "";
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
          checkedEvents.set(String(ev.id), { e: ev, lg });
          return matchRow(ev);
        });
      }
      if (!rows.length) return "";
      return `<div class="sport-league"><div class="sport-lg-label">${esc(lg.label)}</div><div class="wc-list">${rows.join("")}</div></div>`;
    }));

    const html = blocks.filter(Boolean).join("");
    $("sport-section").hidden=false;
    if (failed) {
      const message = failed === 1 ? "One league check was incomplete." : failed + " league checks were incomplete.";
      health("sport-health", message + " " + (sportsCheckedAt ? "Keeping results checked " + checkTime(sportsCheckedAt) + "." : "Some scores may be unavailable. Try again."));
      sourceStatus("sport", sportsCheckedAt ? "saved" : "unavailable", message + (sportsCheckedAt ? " Showing results checked " + checkTime(sportsCheckedAt) + "." : " Available leagues are shown."));
      if (sportsCheckedAt) {
        $("sport-live").textContent = "";
        return;
      }
    }
    else {
      sportsCheckedAt = new Date().toISOString();
      health("sport-health", "");
      sourceStatus("sport", "ready", "Checked " + checkTime(sportsCheckedAt) + ".");
    }
    $("sport-stamp").textContent=sportsCheckedAt?"ESPN · Checked "+checkTime(sportsCheckedAt):"ESPN · Incomplete source check";
    $("sport-live").textContent = anyLive ? "· live" : "";
    sportEvents.clear();
    for (const [id, event] of checkedEvents) sportEvents.set(id, event);
    $("sport-detail").hidden = !html;
    if (!html) {
      $("sport-glance").textContent = failed ? "Scores are unavailable." : "No matches in this period.";
      $("sport-list").replaceChildren();
      return;
    }
    const leagueCount = blocks.filter(Boolean).length;
    $("sport-glance").textContent = leagueCount === 1 ? "Scores and fixtures from one league" : "Scores and fixtures from " + leagueCount + " leagues";
    $("sport-list").innerHTML = html;

    // tap a match to expand its detail panel (one open at a time)
    $("sport-list").querySelectorAll(".wc-match[data-eid]").forEach(el => {
      el.addEventListener("click", async () => {
        const next = el.nextElementSibling;
        if (next && next.classList.contains("wc-detail")) { next.remove(); el.setAttribute("aria-expanded", "false"); return; }
        el.setAttribute("aria-expanded", "true");
        $("sport-list").querySelectorAll(".wc-detail").forEach(d => {d.previousElementSibling?.setAttribute("aria-expanded","false");d.remove();});
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
    return Math.round((startOfDay(new Date(iso + "T00:00:00")) - startOfDay(new Date())) / 86400000); // round: DST days are 23/25h
  }

  function updateNextUp() {
    const due = CFG.deadlines.find(entry => entry.title && entry.deadline && daysUntil(entry.deadline) === 0);
    const deadline = $("today-deadline");
    const focus = $("today-focus");
    const previous = document.activeElement;
    if (due) deadline.querySelector("strong").textContent = due.title;
    deadline.hidden = !due;
    focus.hidden = Boolean(due);
    $("next-up").hidden = false;
    if (previous === deadline && deadline.hidden) focus.focus();
    if (previous === focus && focus.hidden) deadline.focus();
  }

  function renderDeadlines() {
    updateNextUp();
    const wrap = $("deadline-list");
    const focusedKey = wrap.contains(document.activeElement) ? document.activeElement.dataset.key : "";
    wrap.innerHTML = "";
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

    }
    const progressButtons = [...wrap.querySelectorAll(".spent-edit button")];
    if (focusedKey) {
      const replacement = progressButtons.find(button => button.dataset.key === focusedKey);
      if (replacement) replacement.focus();
      else focusPage($("deadlines-section").querySelector("h2"));
    }
    progressButtons.forEach(btn => {
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
  let removedFocus = null;
  function focusLoad() {
    try {
      const items = safeParse(localStorage.getItem("mb_focus"));
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }
  function focusSave(items) {
    try {
      localStorage.setItem("mb_focus", JSON.stringify(items));
      return true;
    } catch {
      setFocusFeedback("Couldn’t save. Check your browser storage and try again.");
      return false;
    }
  }
  function setFocusFeedback(text) {
    const feedback = $("focus-feedback");
    feedback.textContent = text;
    feedback.hidden = !text;
  }
  function updateFocusCount(items) {
    const completed = items.filter(item => item.done).length;
    $("focus-count").textContent = items.length ? completed + " of " + items.length + " done" : "";
    $("focus-preview").textContent = items.find(item => !item.done)?.text ||
      (items.length ? "All items done · Open focus list" : "Open your focus list");
    updateTodayFocus(items);
  }
  function updateTodayFocus(items) {
    const day = localDate.format(Date.now());
    const chosen = items.findIndex(item => !item.done && item.today === day);
    const select = $("focus-today-select");
    const options = items.flatMap((item, index) => item.done ? [] : [new Option(item.text, String(index))]);
    select.replaceChildren(new Option("No focus selected", ""), ...options);
    select.value = chosen < 0 ? "" : String(chosen);
    $("focus-today-choice").hidden = !options.length;
    const preview = $("today-focus");
    preview.querySelector("strong").textContent = items[chosen]?.text || "Pick one focus";
    preview.querySelector("small").hidden = chosen < 0;
  }
  $("focus-today-select").addEventListener("change", event => {
    const select = event.currentTarget;
    const items = focusLoad();
    const chosen = select.value === "" ? -1 : Number(select.value);
    const current = items[chosen];
    if (chosen >= 0 && (!current || current.done || current.text !== select.selectedOptions[0].textContent)) {
      renderFocus();
      return;
    }
    const day = localDate.format(Date.now());
    for (const item of items) if (item.today === day) delete item.today;
    if (current) current.today = day;
    const saved = focusSave(items);
    renderFocus();
    if (saved) setFocusFeedback(current ? "Focus set for today." : "Today’s focus cleared.");
  });
  function renderFocus() {
    const list = $("focus-list");
    const items = focusLoad();
    list.replaceChildren();
    updateFocusCount(items);
    if (!items.length) {
      list.innerHTML = '<p class="focus-empty">Pick one thing to make time for today.</p>';
      return;
    }
    items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "focus-row" + (item.done ? " done" : "");
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(item.done);
      const text = document.createElement("span");
      text.textContent = item.text;
      label.append(checkbox, text);
      checkbox.addEventListener("change", () => {
        const wasDone = Boolean(item.done);
        const wasToday = item.today;
        item.done = checkbox.checked;
        if (item.done) delete item.today;
        if (!focusSave(items)) {
          checkbox.checked = wasDone;
          item.done = wasDone;
          if (wasToday) item.today = wasToday;
          return;
        }
        row.classList.toggle("done", item.done);
        updateFocusCount(items);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "del";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove " + item.text);
      remove.addEventListener("click", () => {
        const latest = focusLoad();
        const [deleted] = latest.splice(index, 1);
        if (!deleted || !focusSave(latest)) return;
        removedFocus = { item: deleted, index };
        $("focus-undo").hidden = false;
        renderFocus();
        setFocusFeedback("Focus item removed.");
        $("focus-undo").focus();
        $("focus-undo").scrollIntoView({ block: "nearest", behavior: "instant" });
      });
      row.append(label, remove);
      list.append(row);
    });
  }
  $("focus-form").addEventListener("submit", event => {
    event.preventDefault();
    const input = $("focus-input");
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    const items = focusLoad();
    items.push({ text, done: false });
    if (!focusSave(items)) return;
    input.value = "";
    renderFocus();
    setFocusFeedback("Focus item added.");
    input.focus({ preventScroll: true });
  });
  $("focus-undo").addEventListener("click", () => {
    if (!removedFocus) return;
    const items = focusLoad();
    const restored = { ...removedFocus.item };
    if (restored.today && items.some(item => !item.done && item.today === restored.today)) delete restored.today;
    items.splice(removedFocus.index, 0, restored);
    if (!focusSave(items)) return;
    removedFocus = null;
    $("focus-undo").hidden = true;
    renderFocus();
    setFocusFeedback("Focus item restored.");
    $("focus-input").focus({ preventScroll: true });
  });

  // ---------------------------------------------------------------- utils --
  function safeWebURL(value) {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch {
      return "";
    }
  }
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
    gameTabs.forEach(b => { b.classList.toggle("active", b.dataset.g === g); b.setAttribute("aria-pressed", String(b.dataset.g === g)); });
    localStorage.setItem("mb_game_tab", g);
  }
  gameTabs.forEach(button => button.addEventListener("click", () => {
    const game = button.dataset.g;
    showGame(game);
    if (game === "wordle" || game === "xword") $(GAME_PANES[game]).focus({ preventScroll: true });
  }));
  showGame(localStorage.getItem("mb_game_tab") || "wordle");

  // ----------------------------------------------------------------- init --
  $("games-date-line").textContent =
    `Puzzle #${(window.MB_DAYNUM || 0) + 1} · new puzzles daily`;
  $("wx-loc").addEventListener("click", () => loadWeather(true));
  $("set-loc").addEventListener("click", () => {
    leaveSheet(1);
    loadWeather(true);
  });
  renderDeadlines();
  renderFocus();
  window.addEventListener("storage", event => {
    if (event.key === "mb_focus") renderFocus();
  });
  loadWeather();
  loadData();
  loadSports();
})();
