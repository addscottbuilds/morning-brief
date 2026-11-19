import "../js/edition-health.js";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

// A newer publication can overtake the one this job prepared.
export async function verifyPublication(pageUrl, expected, {
  request = fetch, sleep = delay, now = Date.now, log = console.log,
} = {}) {
  const minimum = Date.parse(expected);
  if (!Number.isFinite(minimum)) throw new Error("Missing expected edition timestamp");
  const url = new URL("data/data.json", pageUrl.replace(/\/?$/, "/"));
  for (const pause of [0, 5000, 15000, 30000]) {
    if (pause) await sleep(pause);
    url.searchParams.set("verify", now());
    try {
      const response = await request(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      const edition = MorningBriefEdition.inspect(data, now());
      if (edition.state !== "current" || edition.preparedAt < minimum) {
        throw new Error(edition.reason + " · public " + (data?.generatedAt ?? "unknown"));
      }
      log("Verified public edition " + data.generatedAt);
      return;
    } catch (error) {
      log("Public edition check failed · " + error.message);
    }
  }
  throw new Error("Public edition was not verified after four reads. Expected " + expected + " or newer.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [pageUrl, expected] = process.argv.slice(2);
  if (process.argv.length > 2) {
    await verifyPublication(pageUrl, expected);
  } else {
    const data = JSON.parse(await readFile(new URL("../data/data.json", import.meta.url), "utf8"));
    const edition = MorningBriefEdition.inspect(data);
    if (edition.state !== "current") throw new Error(edition.reason);
    console.log(data.generatedAt);
  }
}
