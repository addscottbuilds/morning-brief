// Crossword factory: generate new 5x5 double word squares (rows AND columns
// all common words), auto-clue every word from the free dictionary API, and
// append fully-clued puzzles to data/crosswords.json. Grids with any
// uncluable word are dropped. Re-run any time the bank needs topping up.
//
//   node scripts/gen-crosswords.mjs [gridTarget] [maxAppend]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gridTarget = Number(process.argv[2] || 200);
const maxAppend = Number(process.argv[3] || 100);

const { answers } = JSON.parse(readFileSync(join(root, "data/words.json"), "utf8"));
const bank = JSON.parse(readFileSync(join(root, "data/crosswords.json"), "utf8"));

// ---- grid generation (same approach as gen-squares.mjs) ----
const commonSet = new Set(answers);
const prefixes = new Set();
for (const w of answers) for (let i = 1; i <= 5; i++) prefixes.add(w.slice(0, i));

const existing = new Set(bank.puzzles.map(p => p.rows.join(",")));
const results = [];
let seedLimit = Infinity;

function colPrefix(rows, col, depth) {
  let s = "";
  for (let r = 0; r < depth; r++) s += rows[r][col];
  return s;
}
function search(rows) {
  if (results.length >= seedLimit) return;
  const depth = rows.length;
  if (depth === 5) {
    for (let c = 0; c < 5; c++) if (!commonSet.has(colPrefix(rows, c, 5))) return;
    const cols = [0, 1, 2, 3, 4].map(c => colPrefix(rows, c, 5));
    const all = [...rows, ...cols];
    if (new Set(all).size !== 10) return;
    if (existing.has(rows.join(","))) return;
    results.push({ rows: [...rows], cols });
    return;
  }
  for (const w of answers) {
    if (rows.includes(w)) continue;
    let ok = true;
    for (let c = 0; c < 5; c++) {
      if (!prefixes.has(colPrefix([...rows, w], c, depth + 1))) { ok = false; break; }
    }
    if (ok) {
      rows.push(w);
      search(rows);
      rows.pop();
      if (results.length >= seedLimit) return;
    }
  }
}
for (const s of answers) {
  if (results.length >= gridTarget) break;
  seedLimit = results.length + 1; // one grid per seed keeps variety
  search([s]);
}
console.log(`grids generated: ${results.length}`);

// ---- auto-cluing from Wiktionary definitions (Wikimedia REST API) ----
const defCache = new Map();
function cleanDef(html) {
  return (html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\.mw-parser-output[^}]*\}/g, " ")   // stray inline CSS blobs
    .replace(/\[\d+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+\./g, ".")
    .replace(/\.+$/, "");
}
async function lookup(word) {
  if (defCache.has(word)) return defCache.get(word);
  let clue = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`, {
        headers: { "User-Agent": "MorningBrief/1.0 (personal puzzle app)" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) { await new Promise(r => setTimeout(r, 30000)); continue; }
      if (res.ok) {
        const data = await res.json();
        const candidates = [];
        for (const pos of data.en || []) {
          for (const d of pos.definitions || []) {
            const text = cleanDef(d.definition);
            if (text) candidates.push(text);
          }
        }
        clue = pickClue(word, candidates);
      }
      break;
    } catch { /* retry */ }
  }
  defCache.set(word, clue);
  await new Promise(r => setTimeout(r, 1100)); // ~1 req/s keeps Wikimedia happy
  return clue;
}

function shapeClue(def) {
  let c = def.replace(/\s+/g, " ").trim();
  c = c.replace(/^To\s+(?=[a-z])/, "");        // verb defs read better bare
  c = c.replace(/^A[n]?\s+(?=[a-z])/, "");     // and so do noun defs
  c = c.charAt(0).toUpperCase() + c.slice(1);
  c = c.replace(/\.$/, "");
  if (c.length > 78) {
    const cut = c.slice(0, 78);
    c = cut.slice(0, Math.max(cut.lastIndexOf(" "), 50)) + "…";
  }
  return c;
}

function pickClue(word, candidates) {
  const inflected = /^\s*(simple past|past (tense|participle)|plural|third-person|present participle|(alternative|obsolete|archaic|dated|informal) (form|spelling)|initialism|abbreviation|misspelling)/i;
  // prefer a real definition over "past tense of X" style entries; skip
  // self-referential ones that would give the answer away
  const real = candidates.find(d =>
    !inflected.test(d) && d.length >= 10 && !d.toLowerCase().includes(word.toLowerCase()));
  if (real) return shapeClue(real);
  const infl = candidates.find(d => inflected.test(d) && /\bof\b/i.test(d));
  if (infl) {
    const base = infl.match(/of\s+(?:["“]?)([a-zA-Z]+)/);
    if (base && base[1].toLowerCase() !== word.toLowerCase()) {
      return shapeClue(`Form of “${base[1]}”`);
    }
  }
  return null;
}

const puzzles = [];
for (const g of results) {
  if (puzzles.length >= maxAppend) break;
  const words = [...g.rows, ...g.cols];
  const clues = [];
  for (const w of words) clues.push(await lookup(w));
  if (clues.some(c => !c)) continue; // a word the dictionary can't clue — drop grid
  puzzles.push({ rows: g.rows, across: clues.slice(0, 5), down: clues.slice(5, 10) });
  if (puzzles.length % 10 === 0) console.log(`clued: ${puzzles.length} (dict cache: ${defCache.size} words)`);
}

bank.puzzles.push(...puzzles);
writeFileSync(join(root, "data/crosswords.json"), JSON.stringify(bank, null, 1));
console.log(`appended ${puzzles.length} puzzles — bank now ${bank.puzzles.length}`);
