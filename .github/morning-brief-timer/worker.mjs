const workflow = "https://api.github.com/repos/addscottbuilds/morning-brief/actions/workflows/refresh.yml";
const digest = "https://addscottbuilds.github.io/morning-brief/data/data.json";
const sydneyClock = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function sydneyTime(timestamp) {
  const parts = Object.fromEntries(sydneyClock.formatToParts(timestamp).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

async function readLiveEdition() {
  const response = await fetch(`${digest}?timer-check=${Date.now()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Digest HTTP ${response.status}`);
  const { generatedAt, news } = await response.json();
  const preparedAt = Date.parse(generatedAt);
  if (!Number.isFinite(preparedAt)) throw new Error("Digest preparation time is missing");
  const hasNews = news?.categories?.some(category => category.stories?.length > 0) ?? false;
  return { generatedAt, preparedAt, hasNews };
}

export default {
  async scheduled({ scheduledTime }, env) {
    const { date, time } = sydneyTime(scheduledTime);
    const morning = time === "06:40" || time === "07:05";
    const deadline = time === "07:00";
    const hourly = ["08:00", "09:00", "10:00", "11:00"].includes(time);
    if (!morning && !deadline && !hourly) return;

    const log = (event, details = {}) => console.log(JSON.stringify({
      event, date, time, checkedAt: new Date().toISOString(), ...details,
    }));
    let edition;
    try {
      edition = await readLiveEdition();
    } catch (error) {
      log("edition-unavailable", { reason: error.message });
    }

    const fresh = edition?.hasNews && (hourly
      ? edition.preparedAt >= scheduledTime
      : sydneyTime(edition.preparedAt).date === date);
    log(fresh ? "edition-fresh" : "edition-stale", {
      generatedAt: edition?.generatedAt ?? null,
      hasNews: edition?.hasNews ?? false,
    });
    if (deadline || fresh) return;
    if (!env.GITHUB_ACTIONS_TOKEN) throw new Error("GITHUB_ACTIONS_TOKEN is missing");

    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "morning-brief-timer",
      "X-GitHub-Api-Version": "2026-03-10",
    };
    // Cloudflare supports manual redirects. The status checks below reject them.
    const request = (path, options) => fetch(`${workflow}${path}`, {
      headers, redirect: "manual", signal: AbortSignal.timeout(10000), ...options,
    });
    const source = `Cloudflare · ${date} ${time} Sydney`;
    const runs = await request("/runs?branch=main&per_page=10");
    if (!runs.ok) throw new Error(`GitHub run list HTTP ${runs.status}`);
    const { workflow_runs: recent } = await runs.json();
    const existing = recent.find(run => run.status !== "completed" || run.display_title === source);
    if (existing) {
      log("dispatch-skipped", { runId: existing.id, status: existing.status });
      return;
    }

    const dispatch = await request("/dispatches", {
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { notify: morning, source } }),
    });
    if (!dispatch.ok) throw new Error(`GitHub dispatch HTTP ${dispatch.status}`);
    const run = dispatch.status === 204 ? {} : await dispatch.json();
    log("dispatch-accepted", { runId: run.workflow_run_id ?? null, notify: morning });
  },
};
