// Generate candidate 5x5 double word squares: all 5 rows AND all 5 columns
// are valid words. Rows are drawn from the common answers list so the fill
// stays friendly; columns may come from the broader allowed list.
// Prints candidates so clue-writing can happen against known-valid grids.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { answers, allowed } = JSON.parse(readFileSync(join(root, "data/words.json"), "utf8"));

const commonSet = new Set(answers);
const allowedSet = new Set(allowed);

// Prefix index over the common list for column validation
const prefixes = new Set();
for (const w of answers) {
  for (let i = 1; i <= 5; i++) prefixes.add(w.slice(0, i));
}

const target = Number(process.argv[2] || 20);
const results = [];
let seedLimit = Infinity; // stop searching the current seed once results reach this

function colPrefix(rows, col, depth) {
  let s = "";
  for (let r = 0; r < depth; r++) s += rows[r][col];
  return s;
}

function search(rows) {
  if (results.length >= seedLimit) return;
  const depth = rows.length;
  if (depth === 5) {
    // every column must also be a common (answers-list) word
    for (let c = 0; c < 5; c++) {
      if (!commonSet.has(colPrefix(rows, c, 5))) return;
    }
    const cols = [0, 1, 2, 3, 4].map(c => colPrefix(rows, c, 5));
    const all = [...rows, ...cols];
    if (new Set(all).size === 10) results.push({ rows: [...rows], cols });
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

// one grid per starting word so results vary
for (const s of answers) {
  if (results.length >= target) break;
  seedLimit = results.length + 1;
  search([s]);
}

for (const r of results) {
  console.log(r.rows.join(" ") + "  |  " + r.cols.join(" "));
}
console.log(`total: ${results.length}`);
