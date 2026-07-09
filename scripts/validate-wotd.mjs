// Check every word-of-the-day candidate resolves in the free dictionary API
// (api.dictionaryapi.dev). Prints failures so they can be pruned from the list.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { words } = JSON.parse(readFileSync(join(root, "data/wotd-words.json"), "utf8"));

const failures = [];
let ok = 0;
for (const w of words) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { failures.push(`${w} (HTTP ${res.status})`); }
    else {
      const d = await res.json();
      const def = d?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      if (def) ok++;
      else failures.push(`${w} (no definition in response)`);
    }
  } catch (e) {
    failures.push(`${w} (${e.message})`);
  }
  await new Promise(r => setTimeout(r, 250)); // be polite to the free API
}

console.log(`ok: ${ok}/${words.length}`);
if (failures.length) {
  console.log("failures:");
  for (const f of failures) console.log("  -", f);
  process.exit(1);
}
