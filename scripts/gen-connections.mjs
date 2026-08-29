// Connections factory: assemble new puzzles from the hand-curated category
// bank in data/conn-categories.json — no APIs, no tokens, pure code.
//
// The bank's categories deliberately share words (MERCURY: planet / element /
// Roman god; FROST: poet / weather). A puzzle = 4 categories from different
// "families" with 4 words each, and is only accepted when:
//   * at least one chosen word is listed in two of the chosen categories
//     (a real trap, like NYT), and
//   * an exact-cover count proves exactly ONE valid way to sort the 16 words
//     into the 4 categories — traps mislead but never make it unsolvable.
//
//   node scripts/gen-connections.mjs [count] [seed]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = Number(process.argv[2] || 250);
const seed = Number(process.argv[3] || 20260829);

const { categories } = JSON.parse(readFileSync(join(root, "data/conn-categories.json"), "utf8"));
const bank = JSON.parse(readFileSync(join(root, "data/connections.json"), "utf8"));

// seeded RNG so re-runs are reproducible; bump the seed to get a fresh batch
let s = seed >>> 0;
function rnd() {
  s |= 0; s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// don't repeat a category combo or a word-set that's already in the bank
const comboUsed = new Set(bank.puzzles.map(p => p.groups.map(g => g.theme).sort().join("|")));
const wordsUsed = new Set(bank.puzzles.map(p => p.groups.flatMap(g => g.words).map(w => w.toUpperCase()).sort().join(",")));

const memberSets = categories.map(c => new Set(c.words));
const usage = new Array(categories.length).fill(0);
const USE_CAP = Math.max(10, Math.ceil((target * 4) / categories.length) + 4);

// how many distinct ways can these 16 words be partitioned into the 4
// categories? (each group = 4 words from that category's member list)
function countSolutions(chosen, words16) {
  const eligible = chosen.map(ci => words16.filter(w => memberSets[ci].has(w)));
  const order = eligible.map((e, i) => i).sort((a, b) => eligible[a].length - eligible[b].length);
  let count = 0;
  const taken = new Set();
  function combos(list, k, start, acc, cb) {
    if (acc.length === k) { cb(acc); return; }
    for (let i = start; i <= list.length - (k - acc.length); i++) {
      if (taken.has(list[i])) continue;
      acc.push(list[i]);
      combos(list, k, i + 1, acc, cb);
      acc.pop();
      if (count >= 2) return;
    }
  }
  (function place(gi) {
    if (count >= 2) return;
    if (gi === order.length) { count++; return; }
    const list = eligible[order[gi]].filter(w => !taken.has(w));
    combos(list, 4, 0, [], picked => {
      picked.forEach(w => taken.add(w));
      place(gi + 1);
      picked.forEach(w => taken.delete(w));
    });
  })(0);
  return count;
}

const out = [];
let attempts = 0;
while (out.length < target && attempts < target * 400) {
  attempts++;
  // 4 categories, all from different families, none overused
  const pool = shuffle(categories.map((c, i) => i).filter(i => usage[i] < USE_CAP && categories[i].words.length >= 4));
  const chosen = [];
  const fams = new Set();
  for (const i of pool) {
    if (fams.has(categories[i].family)) continue;
    chosen.push(i); fams.add(categories[i].family);
    if (chosen.length === 4) break;
  }
  if (chosen.length < 4) break;
  const sig = chosen.map(i => categories[i].theme).sort().join("|");
  if (comboUsed.has(sig)) continue;

  // pick 4 unique words per category (overlap words can only land in one)
  let picks = null;
  for (let t = 0; t < 30 && !picks; t++) {
    const taken = new Set(), attempt = [];
    let ok = true;
    for (const ci of shuffle([...chosen])) {
      const avail = shuffle(categories[ci].words.filter(w => !taken.has(w)));
      if (avail.length < 4) { ok = false; break; }
      const four = avail.slice(0, 4);
      four.forEach(w => taken.add(w));
      attempt.push({ ci, words: four });
    }
    if (ok) picks = attempt;
  }
  if (!picks) continue;

  const words16 = picks.flatMap(p => p.words);
  const wsig = [...words16].sort().join(",");
  if (wordsUsed.has(wsig)) continue;

  // demand at least one genuine trap: a chosen word that's listed in two of
  // the chosen categories
  const trapCount = w => chosen.filter(ci => memberSets[ci].has(w)).length;
  const traps = words16.filter(w => trapCount(w) >= 2);
  if (traps.length < 1) continue;

  if (countSolutions(chosen, words16) !== 1) continue; // ambiguous — reject

  // difficulty order: fewest traps first (yellow), trickiest last (purple);
  // wordplay "___ x" groups lean purple like NYT
  const score = p => p.words.filter(w => trapCount(w) >= 2).length + (categories[p.ci].family === "pattern" ? 0.5 : 0);
  picks.sort((a, b) => score(a) - score(b));

  comboUsed.add(sig);
  wordsUsed.add(wsig);
  chosen.forEach(i => usage[i]++);
  out.push({ groups: picks.map(p => ({ theme: categories[p.ci].theme, words: p.words })) });
}

// the acceptance loop drains rare categories late, so the raw tail clusters
// the same few themes — shuffle so consecutive days feel unrelated
bank.puzzles.push(...shuffle(out));
writeFileSync(join(root, "data/connections.json"), JSON.stringify(bank, null, 1));
const trapped = out.filter(p => p.groups.some(g => g.words.length)).length;
console.log(`accepted ${out.length}/${attempts} attempts — bank now ${bank.puzzles.length} puzzles`);
console.log(`category usage: min ${Math.min(...usage)} max ${Math.max(...usage)} (cap ${USE_CAP})`);
