// Structural check for the Connections bank: 4 groups of 4, 16 unique words
// per puzzle, no empty themes.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { puzzles } = JSON.parse(readFileSync(join(root, "data/connections.json"), "utf8"));

let failed = false;
puzzles.forEach((p, i) => {
  const problems = [];
  if (!Array.isArray(p.groups) || p.groups.length !== 4) problems.push("needs exactly 4 groups");
  const all = [];
  for (const g of p.groups || []) {
    if (!g.theme || !g.theme.trim()) problems.push("empty theme");
    if (!Array.isArray(g.words) || g.words.length !== 4) problems.push(`group "${g.theme}" needs 4 words`);
    for (const w of g.words || []) {
      if (!w || !w.trim()) problems.push("empty word");
      all.push(w.toUpperCase().trim());
    }
  }
  if (new Set(all).size !== all.length) {
    const seen = new Set(), dups = new Set();
    for (const w of all) { if (seen.has(w)) dups.add(w); seen.add(w); }
    problems.push("duplicate words: " + [...dups].join(", "));
  }
  if (problems.length) { failed = true; console.log(`puzzle ${i}: ${problems.join("; ")}`); }
  else console.log(`puzzle ${i}: OK (${p.groups.map(g => g.theme).join(" | ")})`);
});
console.log(`total: ${puzzles.length} puzzles`);
process.exit(failed ? 1 : 0);
