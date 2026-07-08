// Verify every puzzle: rows and derived columns are valid words, no repeats,
// and clue counts match.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { allowed } = JSON.parse(readFileSync(join(root, "data/words.json"), "utf8"));
const { puzzles } = JSON.parse(readFileSync(join(root, "data/crosswords.json"), "utf8"));
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
process.exit(failed ? 1 : 0);
