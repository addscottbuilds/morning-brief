// Build data/words.json from the raw word lists.
// Answers are shuffled with a fixed seed so the daily sequence is stable
// but not alphabetical; the allowed list is every valid guess.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const answers = readFileSync(join(root, "data/wordle-answers.txt"), "utf8")
  .split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => /^[a-z]{5}$/.test(w));
const guesses = readFileSync(join(root, "data/wordle-guesses.txt"), "utf8")
  .split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => /^[a-z]{5}$/.test(w));

// mulberry32 PRNG with fixed seed for a deterministic shuffle
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260709);
for (let i = answers.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [answers[i], answers[j]] = [answers[j], answers[i]];
}

const allowed = [...new Set([...guesses, ...answers])].sort();
writeFileSync(join(root, "data/words.json"), JSON.stringify({ answers, allowed }));
console.log(`answers: ${answers.length}, allowed: ${allowed.length}`);
