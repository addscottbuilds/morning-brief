// Daily data build: ASX/FX prices from Yahoo Finance + a cross-spectrum news
// digest from RSS feeds. Writes data/data.json, which the app fetches at load.
//
// If ANTHROPIC_API_KEY is set, Claude writes neutral summaries and flags
// stories where left- and right-leaning coverage genuinely diverges.
// Without a key, the digest still works: clustered headlines grouped by lean.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Parser from "rss-parser";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- markets --
const SYMBOLS = [
  { sym: "^AXJO", label: "ASX 200", name: "S&P/ASX 200 index", fmt: "index" },
  { sym: "BGBL.AX", label: "BGBL", name: "Global Shares ETF", fmt: "aud" },
  { sym: "A200.AX", label: "A200", name: "Australia 200 ETF", fmt: "aud" },
  { sym: "NDQ.AX", label: "NDQ", name: "NASDAQ 100 ETF", fmt: "aud" },
  { sym: "SEMI.AX", label: "SEMI", name: "Semiconductor ETF", fmt: "aud" },
  { sym: "AUDUSD=X", label: "AUD/USD", name: "Exchange rate", fmt: "fx" },
];

async function fetchQuote({ sym, label, name, fmt }) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10d&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${sym}: HTTP ${res.status}`);
  const data = (await res.json()).chart.result[0];
  const closes = (data.indicators.quote[0].close || []).filter(v => v != null);
  const price = data.meta.regularMarketPrice;
  // last close in the series may be today's live price; take the close before it
  let prev = closes.length > 1 ? closes[closes.length - 2] : null;
  if (prev != null && Math.abs(closes[closes.length - 1] - price) > Math.abs(price) * 0.02) {
    prev = closes[closes.length - 1]; // series lags; latest close is the previous one
  }
  const chgPct = prev ? ((price - prev) / prev) * 100 : null;
  const high52 = data.meta.fiftyTwoWeekHigh || null;
  const off52 = high52 ? ((price - high52) / high52) * 100 : null;
  return { sym, label, name, fmt, price, chgPct, high52, off52 };
}

async function buildMarkets() {
  const items = [];
  const failed = [];
  for (const s of SYMBOLS) {
    try { items.push(await fetchQuote(s)); }
    catch (e) { failed.push(s.label); console.error(`market fail ${s.label}: ${e.message}`); }
  }
  // buy-plan note: which watched ETF is furthest below its 52-week high
  let note = null;
  const etfs = items.filter(i => i.fmt === "aud" && i.off52 != null);
  if (etfs.length) {
    const dip = etfs.reduce((a, b) => (a.off52 < b.off52 ? a : b));
    if (dip.off52 <= -10) {
      note = `${dip.label} is ${Math.abs(dip.off52).toFixed(0)}% below its 52-week high ($${dip.high52.toFixed(2)}) — the deepest discount on the watchlist.`;
    }
  }
  return { items, failed, note };
}

// ------------------------------------------------------------------- news --
// Lean tags follow common media-bias ratings (AllSides-style). Feeds fail
// gracefully — a dead feed is skipped and reported in sourcesFailed.
// `cat` routes each feed into a tab: top | politics | tech | business.
const CATEGORIES = [
  { key: "top", label: "Top", max: 7 },
  { key: "politics", label: "Politics", max: 6 },
  { key: "tech", label: "Tech", max: 6 },
  { key: "business", label: "Business", max: 6 },
  { key: "sports", label: "Sports", max: 6 },
  { key: "entertainment", label: "Entertainment", max: 6 },
];

const FEEDS = [
  // Top stories
  { outlet: "Guardian Australia", lean: "left", cat: "top", url: "https://www.theguardian.com/au/rss" },
  { outlet: "Crikey", lean: "left", cat: "top", url: "https://www.crikey.com.au/feed/" },
  { outlet: "The Age", lean: "left", cat: "top", url: "https://www.theage.com.au/rss/feed.xml" },
  { outlet: "ABC News", lean: "centre", cat: "top", url: "https://www.abc.net.au/news/feed/51120/rss.xml" },
  { outlet: "SBS News", lean: "centre", cat: "top", url: "https://www.sbs.com.au/news/topic/latest/feed" },
  { outlet: "BBC World", lean: "centre", cat: "top", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { outlet: "7News", lean: "centre", cat: "top", url: "https://7news.com.au/feed" },
  { outlet: "Daily Mail Australia", lean: "right", cat: "top", url: "https://www.dailymail.co.uk/auhome/index.rss" },
  { outlet: "Fox News", lean: "right", cat: "top", url: "https://moxie.foxnews.com/google-publisher/latest.xml" },
  // Politics
  { outlet: "Guardian AU Politics", lean: "left", cat: "politics", url: "https://www.theguardian.com/australia-news/australian-politics/rss" },
  { outlet: "The Age Federal Politics", lean: "left", cat: "politics", url: "https://www.theage.com.au/rss/politics/federal.xml" },
  { outlet: "Fox News Politics", lean: "right", cat: "politics", url: "https://moxie.foxnews.com/google-publisher/politics.xml" },
  // Tech
  { outlet: "Guardian Tech", lean: "left", cat: "tech", url: "https://www.theguardian.com/uk/technology/rss" },
  { outlet: "BBC Tech", lean: "centre", cat: "tech", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { outlet: "Ars Technica", lean: "centre", cat: "tech", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { outlet: "The Verge", lean: "centre", cat: "tech", url: "https://www.theverge.com/rss/index.xml" },
  // Business
  { outlet: "Guardian AU Business", lean: "left", cat: "business", url: "https://www.theguardian.com/au/business/rss" },
  { outlet: "The Age Business", lean: "left", cat: "business", url: "https://www.theage.com.au/rss/business.xml" },
  { outlet: "ABC Business", lean: "centre", cat: "business", url: "https://www.abc.net.au/news/feed/51892/rss.xml" },
  { outlet: "Fox Business", lean: "right", cat: "business", url: "https://moxie.foxbusiness.com/google-publisher/latest.xml" },
  // Sports
  { outlet: "Guardian AU Sport", lean: "left", cat: "sports", url: "https://www.theguardian.com/au/sport/rss" },
  { outlet: "BBC Sport", lean: "centre", cat: "sports", url: "https://feeds.bbci.co.uk/sport/rss.xml" },
  { outlet: "ESPN", lean: "centre", cat: "sports", url: "https://www.espn.com/espn/rss/news" },
  { outlet: "7News Sport", lean: "centre", cat: "sports", url: "https://7news.com.au/sport/feed" },
  // Entertainment: movies, shows, anime
  { outlet: "Variety", lean: "centre", cat: "entertainment", url: "https://variety.com/feed/" },
  { outlet: "Deadline", lean: "centre", cat: "entertainment", url: "https://deadline.com/feed/" },
  { outlet: "Screen Rant", lean: "centre", cat: "entertainment", url: "https://screenrant.com/feed/" },
  { outlet: "Anime News Network", lean: "centre", cat: "entertainment", url: "https://www.animenewsnetwork.com/all/rss.xml" },
  { outlet: "Guardian Film", lean: "left", cat: "entertainment", url: "https://www.theguardian.com/film/rss" },
];

const STOP = new Set(["about", "after", "again", "against", "amid", "another", "australia", "australian", "because", "been", "before", "being", "between", "calls", "could", "does", "down", "during", "every", "first", "from", "have", "here", "his", "into", "just", "life", "like", "live", "made", "make", "more", "most", "much", "need", "news", "over", "part", "says", "should", "some", "such", "take", "than", "that", "their", "them", "then", "there", "these", "they", "this", "those", "through", "under", "until", "warns", "week", "were", "what", "when", "where", "which", "while", "will", "with", "without", "would", "year", "years", "your",
  // tabloid glue words — common enough to bridge unrelated stories
  "accused", "aged", "arrested", "body", "boss", "charged", "claims", "court", "dead", "death", "dies", "family", "fears", "found", "inside", "missing", "moment", "police", "report", "reveals", "revealed", "shock", "slams", "star", "update", "watch", "woman",
  // generic domain words that look "rare" inside a small category
  "game", "games", "match", "million", "season", "soccer", "work", "world"]);

function tokens(title) {
  return new Set(
    title.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
      .filter(w => w.length >= 4 && !STOP.has(w))
  );
}

function stripHtml(s) {
  return (s || "").replace(/<[^>]*>/g, " ").replace(/&[#\w]+;/g, " ").replace(/\s+/g, " ").trim();
}

// Some feeds ship stray "&" characters that break strict XML parsing —
// escape any ampersand that isn't already part of an entity.
function sanitizeXml(xml) {
  return xml.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,30}|#\d{1,7}|#x[0-9a-fA-F]{1,6});)/g, "&amp;");
}

async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MorningBrief/1.0)", Accept: "application/rss+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  if (/^\s*<!doctype html|^\s*<html/i.test(body)) throw new Error("served HTML, not a feed");
  return sanitizeXml(body);
}

function clusterCategory(items, maxStories) {
  // Cluster on shared headline tokens, weighted by rarity (IDF): a match must
  // share at least one story-specific "anchor" word (a name/place that appears
  // in almost no other headline today), not just generic news vocabulary.
  // Cross-lean merges demand a stronger fingerprint match than same-lean ones,
  // so "both sides covered this" is only ever claimed for the same story.
  const toks = items.map(i => tokens(i.title));
  const N = items.length || 1;
  const df = new Map();
  for (const set of toks) for (const t of set) df.set(t, (df.get(t) || 0) + 1);
  const idf = t => Math.log(N / (df.get(t) || 1));
  const RARE = 3; // an "anchor" word appears in at most 3 of the day's headlines

  function sameStory(i, j) {
    let sharedCount = 0, idfSum = 0, anchors = 0;
    for (const t of toks[i]) {
      if (!toks[j].has(t)) continue;
      sharedCount++;
      idfSum += idf(t);
      if ((df.get(t) || N) <= RARE) anchors++;
    }
    if (sharedCount < 2 || anchors < 1) return false;
    if (anchors >= 2) return true; // two story-specific words shared: same story
    const crossLean = items[i].lean !== items[j].lean;
    return idfSum >= (crossLean ? 6 : 4.5);
  }

  // Greedy seed-linkage clustering (no union-find chaining): an item joins a
  // cluster only if it matches the cluster's seed story, or a majority of its
  // members — so A~B and B~C can no longer drag unrelated A and C together.
  const order = items.map((_, i) => i).sort((a, b) => items[a].ts - items[b].ts);
  const rawClusters = []; // arrays of item indexes; [0] is the seed
  for (const i of order) {
    let joined = false;
    for (const cl of rawClusters) {
      const hits = cl.filter(j => sameStory(i, j)).length;
      if (sameStory(i, cl[0]) || hits >= Math.ceil(cl.length / 2)) {
        cl.push(i);
        joined = true;
        break;
      }
    }
    if (!joined) rawClusters.push([i]);
  }
  const groups = rawClusters.map(cl => cl.map(i => items[i]));

  // rank clusters by outlet breadth, then recency
  const clusters = groups
    .map(g => {
      const outlets = new Set(g.map(x => x.outlet));
      return { g, breadth: outlets.size, latest: Math.max(...g.map(x => x.ts)) };
    })
    .sort((a, b) => b.breadth - a.breadth || b.latest - a.latest);

  // multi-outlet clusters first, then fresh single-outlet stories to fill
  const picked = clusters.filter(c => c.breadth >= 2).slice(0, maxStories);
  if (picked.length < maxStories) {
    const singles = clusters.filter(c => !picked.includes(c)).sort((a, b) => b.latest - a.latest);
    for (const c of singles) {
      if (picked.length >= maxStories) break;
      picked.push(c);
    }
  }

  return picked.map(c => {
    // one item per outlet (its most recent in the cluster)
    const byOutlet = new Map();
    for (const it of c.g.sort((a, b) => b.ts - a.ts)) {
      if (!byOutlet.has(it.outlet)) byOutlet.set(it.outlet, it);
    }
    const srcs = [...byOutlet.values()];
    const leans = new Set(srcs.map(s => s.lean));
    const centre = srcs.find(s => s.lean === "centre");
    const lead = centre || srcs.reduce((a, b) => (a.title.length <= b.title.length ? a : b));
    return {
      id: -1, // assigned globally by buildNews
      headline: lead.title,
      summary: lead.desc,
      divergent: null, left_view: null, right_view: null, common_ground: null,
      hasBothSides: leans.has("left") && leans.has("right"),
      sources: srcs.map(s => ({ outlet: s.outlet, lean: s.lean, title: s.title, desc: s.desc, link: s.link })),
    };
  });
}

async function buildNews() {
  const parser = new Parser();
  const itemsByCat = new Map(CATEGORIES.map(c => [c.key, []]));
  const ok = [], failed = [];
  const cutoff = Date.now() - 36 * 3600 * 1000;

  await Promise.all(FEEDS.map(async f => {
    try {
      const feed = await parser.parseString(await fetchFeed(f.url));
      let n = 0;
      for (const it of feed.items || []) {
        if (n >= 25) break;
        const date = it.isoDate || it.pubDate;
        const ts = date ? Date.parse(date) : Date.now();
        if (ts < cutoff) continue;
        itemsByCat.get(f.cat).push({
          outlet: f.outlet, lean: f.lean,
          title: stripHtml(it.title).slice(0, 200),
          desc: stripHtml(it.contentSnippet || it.content || it.summary).slice(0, 400),
          link: it.link || "", ts,
        });
        n++;
      }
      ok.push(f.outlet);
    } catch (e) {
      failed.push(f.outlet);
      console.error(`feed fail ${f.outlet}: ${e.message}`);
    }
  }));

  let nextId = 0;
  const categories = CATEGORIES.map(c => {
    const stories = clusterCategory(itemsByCat.get(c.key), c.max);
    for (const s of stories) s.id = nextId++;
    return { key: c.key, label: c.label, stories };
  });

  let mode = "basic";
  const allStories = categories.flatMap(c => c.stories);
  if (process.env.ANTHROPIC_API_KEY && allStories.length) {
    try {
      await enrichWithClaude(allStories);
      mode = "llm";
    } catch (e) {
      console.error(`claude enrich failed, shipping basic digest: ${e.message}`);
    }
  }

  return { mode, categories, sourcesOk: ok, sourcesFailed: failed };
}

// --------------------------------------------------------------- releases --
// New & popular movies / shows (Cinemeta, IMDb ratings) and currently
// airing anime (AniList, no key). Shown at the top of the Entertainment tab.
async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function buildReleases() {
  const out = { movies: [], shows: [], anime: [] };
  const thisYear = new Date().getFullYear();

  // spoiler-safe blurb: Cinemeta descriptions are official loglines; trim to
  // the first couple of sentences anyway
  const blurb = s => {
    const clean = (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (clean.length <= 240) return clean || null;
    const cut = clean.slice(0, 240);
    return cut.slice(0, Math.max(cut.lastIndexOf(". ") + 1, 180)).trim() + (cut.endsWith(".") ? "" : "…");
  };

  try {
    const m = await fetchJson("https://cinemeta-catalogs.strem.io/top/catalog/movie/top.json");
    out.movies = (m.metas || [])
      .filter(x => Number((x.releaseInfo || "").slice(0, 4)) >= thisYear - 1)
      .slice(0, 5)
      .map(x => ({
        title: x.name, year: (x.releaseInfo || "").slice(0, 4),
        rating: x.imdbRating ? Number(x.imdbRating) : null,
        genres: (x.genres || x.genre || []).slice(0, 3),
        overview: blurb(x.description),
      }));
  } catch (e) { console.error(`releases movies fail: ${e.message}`); }

  try {
    const s = await fetchJson("https://cinemeta-catalogs.strem.io/top/catalog/series/top.json");
    const metas = (s.metas || []).slice(0, 20)
      .map(x => ({
        title: x.name, year: (x.releaseInfo || ""),
        rating: x.imdbRating ? Number(x.imdbRating) : null,
        genres: (x.genres || x.genre || []).slice(0, 3),
        overview: blurb(x.description),
      }));
    // new premieres with ratings first, at most two unrated newcomers,
    // then the best-rated of what's currently popular
    const isNew = x => Number(x.year.slice(0, 4)) >= thisYear - 1;
    out.shows = [
      ...metas.filter(x => isNew(x) && x.rating != null),
      ...metas.filter(x => isNew(x) && x.rating == null).slice(0, 2),
      ...metas.filter(x => !isNew(x) && x.rating != null),
    ].slice(0, 5);
  } catch (e) { console.error(`releases shows fail: ${e.message}`); }

  try {
    const q = `query { Page(perPage: 12) { media(type: ANIME, status: RELEASING, format_in: [TV, ONA], sort: POPULARITY_DESC) { title { english romaji } averageScore startDate { year } genres description(asHtml: false) } } }`;
    const a = await fetchJson("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    });
    out.anime = (a.data.Page.media || [])
      .filter(x => x.startDate && x.startDate.year >= thisYear - 1) // new seasons, not decades-old long-runners
      .slice(0, 5)
      .map(x => ({
        title: x.title.english || x.title.romaji,
        year: String(x.startDate.year),
        rating: x.averageScore ? Math.round(x.averageScore) / 10 : null,
        genres: (x.genres || []).slice(0, 3),
        // AniList descriptions can ramble into episode detail — keep the setup only
        overview: blurb((x.description || "").split(/\n|<br>/)[0]),
      }));
  } catch (e) { console.error(`releases anime fail: ${e.message}`); }

  return out;
}

// ------------------------------------------------------ commonwealth games --
// Glasgow 2026. Before day one: countdown + latest Games headlines. Once the
// Wikipedia medal-table page stops being a redirect (day one), the parsed
// tally takes over. Parser verified against the 2022 table format.
const CG = { start: "2026-07-23", end: "2026-08-02", host: "Glasgow" };
const CGF_NAMES = {
  AUS: "Australia", ENG: "England", CAN: "Canada", IND: "India", NZL: "New Zealand",
  SCO: "Scotland", WAL: "Wales", NIR: "N. Ireland", NGR: "Nigeria", RSA: "South Africa",
  KEN: "Kenya", JAM: "Jamaica", MAS: "Malaysia", SGP: "Singapore", CYP: "Cyprus",
  PAK: "Pakistan", UGA: "Uganda", TTO: "Trinidad & Tobago", BOT: "Botswana", GHA: "Ghana",
  SRI: "Sri Lanka", BAH: "Bahamas", FIJ: "Fiji", PNG: "Papua New Guinea", SAM: "Samoa",
  GRN: "Grenada", BER: "Bermuda", GUY: "Guyana", MRI: "Mauritius", NAM: "Namibia",
  ZAM: "Zambia", BAR: "Barbados", IOM: "Isle of Man", JEY: "Jersey", GGY: "Guernsey",
  MLT: "Malta", CMR: "Cameroon", TAN: "Tanzania", BAN: "Bangladesh", SEY: "Seychelles",
};
async function buildCommGames() {
  const out = { start: CG.start, end: CG.end, host: CG.host, medals: null, upcoming: [] };
  if (Date.now() > Date.parse(CG.end) + 4 * 86400000) return null; // long over

  // upcoming events from the Wikipedia calendar table — each cell carries a
  // <!--day--> comment; gold cells (#ffcc00) hold the day's medal-event count
  try {
    const r = await fetchJson("https://en.wikipedia.org/w/api.php?action=parse&page=" +
      encodeURIComponent("2026 Commonwealth Games") + "&prop=wikitext&format=json&formatversion=2");
    const w = (r.parse && r.parse.wikitext) || "";
    const anchor = w.indexOf("<!--23-->");
    const table = w.slice(w.lastIndexOf("{|", anchor), w.indexOf("|}", anchor));
    const dayToDate = d => (d >= 23 ? `2026-07-${d}` : `2026-08-0${d}`);
    const schedule = {};
    for (const row of table.split(/\n\|-/).slice(1)) {
      const nameMatch = [...row.matchAll(/\[\[[^\]|]*\|([^\]]+)\]\]/g)].pop();
      if (!nameMatch || !row.includes("<!--")) continue;
      const sport = nameMatch[1].trim();
      if (/ceremon/i.test(sport)) continue;
      for (const cell of row.matchAll(/<!--\s*(\d{1,2})\s*-->(.*?)(?=<!--|$)/gs)) {
        const date = dayToDate(Number(cell[1]));
        const body = cell[2];
        if (!schedule[date]) schedule[date] = { date, finals: [], competing: [] };
        if (/ffcc00/.test(body)) {
          const g = body.match(/'''(\d+)'''/);
          schedule[date].finals.push({ sport, golds: g ? Number(g[1]) : 1 });
        } else if (/3399ff/.test(body)) {
          schedule[date].competing.push(sport);
        }
      }
    }
    const glasgowToday = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    out.upcoming = Object.values(schedule)
      .filter(d => d.date >= glasgowToday && (d.finals.length || d.competing.length))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 2);
  } catch (e) { console.error(`cg schedule fail: ${e.message}`); }

  // medal tally from Wikipedia's {{Medals table}} template
  try {
    const r = await fetchJson("https://en.wikipedia.org/w/api.php?action=parse&page=" +
      encodeURIComponent("2026 Commonwealth Games medal table") +
      "&prop=wikitext&format=json&formatversion=2");
    const w = (r.parse && r.parse.wikitext) || "";
    if (!/^\s*#REDIRECT/i.test(w)) {
      const grab = k => {
        const o = {};
        for (const m of w.matchAll(new RegExp(`${k}_([A-Z]{2,3})\\s*=\\s*(\\d+)`, "g"))) o[m[1]] = +m[2];
        return o;
      };
      const g = grab("gold"), s = grab("silver"), b = grab("bronze");
      const rows = [...new Set([...Object.keys(g), ...Object.keys(s), ...Object.keys(b)])]
        .map(c => ({ code: c, country: CGF_NAMES[c] || c, g: g[c] || 0, s: s[c] || 0, b: b[c] || 0, total: (g[c] || 0) + (s[c] || 0) + (b[c] || 0) }))
        .filter(x => x.total > 0)
        .sort((a, b2) => b2.g - a.g || b2.s - a.s || b2.b - a.b);
      rows.forEach((x, i) => { x.rank = i + 1; });
      if (rows.length) {
        const top = rows.slice(0, 3);
        const aus = rows.find(x => x.code === "AUS");
        if (aus && !top.includes(aus)) top.push(aus);
        out.medals = top;
      }
    }
  } catch (e) { console.error(`cg medals fail: ${e.message}`); }

  return out;
}

// ------------------------------------------------------------ word of day --
// Pick today's word from the curated bank (non-adjacent stride so runs of
// days don't walk the list alphabetically) and fetch its definition from the
// free dictionary API. A failed word falls through to the next candidate.
async function buildWotd() {
  try {
    const { words } = JSON.parse(readFileSync(join(root, "data/wotd-words.json"), "utf8"));
    // day boundary must be MELBOURNE's date, not UTC's — the 5-something-am
    // build runs while UTC is still on yesterday's date
    const melbDate = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
    const dayNum = Math.round((Date.parse(melbDate) - Date.parse("2026-07-09")) / 86400000);
    for (let i = 0; i < 6; i++) {
      const word = words[((dayNum + i) * 37) % words.length];
      try {
        const res = await fetch(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (!res.ok) continue;
        const entry = (await res.json())[0];
        const meaning = entry?.meanings?.[0];
        const def = meaning?.definitions?.[0];
        if (!def?.definition) continue;
        return {
          word: entry.word || word,
          phonetic: entry.phonetic || ((entry.phonetics || []).find(p => p.text) || {}).text || "",
          pos: meaning.partOfSpeech || "",
          def: def.definition,
          example: def.example || null,
          audio: ((entry.phonetics || []).find(p => p.audio) || {}).audio || null,
        };
      } catch { /* try the next candidate */ }
    }
  } catch (e) { console.error(`wotd fail: ${e.message}`); }
  return null;
}

// ------------------------------------------------------------- llm enrich --
async function enrichWithClaude(stories) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const input = stories.map(s => ({
    id: s.id,
    coverage: s.sources.map(x => ({ outlet: x.outlet, lean: x.lean, headline: x.title, blurb: x.desc })),
  }));

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["stories"],
    properties: {
      stories: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "headline", "summary", "divergent", "left_view", "right_view", "common_ground"],
          properties: {
            id: { type: "integer" },
            headline: { type: "string" },
            summary: { type: "string" },
            divergent: { type: "boolean" },
            left_view: { anyOf: [{ type: "string" }, { type: "null" }] },
            right_view: { anyOf: [{ type: "string" }, { type: "null" }] },
            common_ground: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
        },
      },
    },
  };

  const prompt = `You are the neutral editor of a personal morning news brief. Below are today's top story clusters, each with coverage from outlets tagged by their general editorial lean (left / centre / right).

For each story, return:
- "headline": a short, strictly neutral headline (no loaded language from either side).
- "summary": 1-2 sentences stating the established facts all outlets agree on.
- "divergent": true ONLY if the left-leaning and right-leaning coverage frame the story in materially different ways (different villains, different implied causes, meaningfully different emphasis). Mere tone differences or one side simply not covering it yet is NOT divergence.
- If divergent is true: "left_view" and "right_view" (one sentence each, describing fairly how each side is framing it, e.g. "Left-leaning outlets emphasise ...") and "common_ground" (one sentence on what both sides accept as fact). If divergent is false, set all three to null.

Keep every id from the input. Story clusters:

${JSON.stringify(input, null, 1)}`;

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") throw new Error("model refused");
  const text = response.content.find(b => b.type === "text")?.text;
  const parsed = JSON.parse(text);
  const byId = new Map(parsed.stories.map(s => [s.id, s]));
  for (const s of stories) {
    const e = byId.get(s.id);
    if (!e) continue;
    s.headline = e.headline;
    s.summary = e.summary;
    s.divergent = e.divergent;
    s.left_view = e.left_view;
    s.right_view = e.right_view;
    s.common_ground = e.common_ground;
  }
}

// -------------------------------------------------------------------- main --
const [markets, news, releases, wotd, commGames] = await Promise.all([buildMarkets(), buildNews(), buildReleases(), buildWotd(), buildCommGames()]);
const out = {
  generatedAt: new Date().toISOString(),
  markets,
  news,
  releases,
  wotd,
  commGames,
};
writeFileSync(join(root, "data/data.json"), JSON.stringify(out, null, 1));
console.log(`data.json written: ${markets.items.length} quotes, ` +
  news.categories.map(c => `${c.key}:${c.stories.length}`).join(" ") +
  ` (news mode: ${news.mode})`);
if (news.sourcesFailed.length) console.log(`feeds failed: ${news.sourcesFailed.join(", ")}`);
