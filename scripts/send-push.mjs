// Send the morning push notification. Runs in GitHub Actions after the data
// refresh. Requires secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and
// PUSH_SUBSCRIPTION (the JSON the app copies when notifications are enabled).
// Missing config exits quietly so the workflow stays green until set up.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import webpush from "web-push";

// trim: secrets set via shell pipes often carry a trailing newline
const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || "").trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || "").trim();
const PUSH_SUBSCRIPTION = (process.env.PUSH_SUBSCRIPTION || "").trim();
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !PUSH_SUBSCRIPTION) {
  console.log("push not configured (missing secrets) — skipping");
  process.exit(0);
}

webpush.setVapidDetails("mailto:support@rudimentallabs.com.au", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "data/data.json"), "utf8"));

// Compose a compact summary: ASX move + top headline
const parts = [];
const asx = data.markets?.items?.find(i => i.sym === "^AXJO");
if (asx && asx.chgPct != null) parts.push(`ASX ${asx.chgPct >= 0 ? "+" : "−"}${Math.abs(asx.chgPct).toFixed(1)}%`);
const top = data.news?.categories?.find(c => c.key === "top")?.stories?.[0];
if (top) parts.push(top.headline);

const payload = JSON.stringify({
  title: "Morning Brief is ready ☀",
  body: parts.join(" · ").slice(0, 170) || "Your daily brief is ready.",
});

try {
  await webpush.sendNotification(JSON.parse(PUSH_SUBSCRIPTION), payload, { TTL: 4 * 3600 });
  console.log("push sent");
} catch (e) {
  if (e.statusCode === 404 || e.statusCode === 410) {
    console.error("subscription expired or revoked — re-enable notifications in the app and update the PUSH_SUBSCRIPTION secret");
  } else {
    console.error(`push failed: ${e.statusCode || ""} ${e.message}`);
  }
  process.exit(0); // never fail the workflow over a push hiccup
}
