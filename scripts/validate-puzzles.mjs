// Verify every puzzle: rows and derived columns are valid words, no repeats,
// and clue counts match.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { allowed } = JSON.parse(readFileSync(join(root, "data/words.json"), "utf8"));
const bank = JSON.parse(readFileSync(join(root, "data/crosswords.json"), "utf8"));
const { puzzles } = bank;
const dict = new Set(allowed);

let failed = false;
puzzles.forEach((p, i) => {
  const problems = [];
  if (p.rows.length !== 5 || p.rows.some(r => !/^[a-z]{5}$/.test(r))) problems.push("bad rows shape");
  const cols = [0, 1, 2, 3, 4].map(c => p.rows.map(r => r[c]).join(""));
  for (const w of p.rows) if (!dict.has(w)) problems.push(`row not a word: ${w}`);
  for (const w of cols) if (!dict.has(w)) problems.push(`col not a word: ${w}`);
  if (new Set([...p.rows, ...cols]).size !== 10) problems.push("repeated word");
  if (p.across.length !== 5 || p.down.length !== 5) problems.push("clue count wrong");
  if (problems.length) { failed = true; console.log(`puzzle ${i}: ${problems.join("; ")}`); }
  else console.log(`puzzle ${i}: OK (${p.rows.join(",")} | ${cols.join(",")})`);
});

// The play order (days from orderStart walk it in sequence): every entry must
// be a real puzzle, used once, and no two entries may share the same ten
// words (a transposed grid is the same puzzle with across/down swapped).
if (bank.order) {
  const wordSet = p => [...p.rows, ...[0, 1, 2, 3, 4].map(c => p.rows.map(r => r[c]).join(""))].sort().join(",");
  const seenIdx = new Set(), seenWords = new Map();
  if (!Number.isInteger(bank.orderStart)) { failed = true; console.log("order: orderStart missing or not an integer"); }
  bank.order.forEach((idx, k) => {
    if (!Number.isInteger(idx) || !puzzles[idx]) { failed = true; console.log(`order[${k}]: ${idx} is not a puzzle index`); return; }
    if (seenIdx.has(idx)) { failed = true; console.log(`order[${k}]: puzzle ${idx} scheduled twice`); }
    const ws = wordSet(puzzles[idx]);
    if (seenWords.has(ws)) { failed = true; console.log(`order[${k}]: puzzle ${idx} repeats the words of puzzle ${seenWords.get(ws)}`); }
    seenIdx.add(idx); seenWords.set(ws, idx);
  });
  // runway: how many scheduled days are left before the order wraps
  const epoch = Date.parse("2026-07-09T00:00:00+10:00");
  const today = Math.floor((Date.now() - epoch) / 86400000);
  const left = bank.order.length - Math.max(0, today - bank.orderStart);
  const runsOut = new Date(Date.now() + left * 86400000).toLocaleDateString("en-AU", { timeZone: "Australia/Melbourne" });
  console.log(`order: ${bank.order.length} scheduled, ${left} days left (repeats start around ${runsOut})`);
  if (left < 30) console.log("WARNING: under 30 days of crosswords left; run scripts/gen-crosswords.mjs");
}
process.exit(failed ? 1 : 0);
