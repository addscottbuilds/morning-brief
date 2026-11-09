import assert from "node:assert/strict";
import { test } from "node:test";
import timer from "./worker.mjs";

const env = { GITHUB_ACTIONS_TOKEN: "test-secret" };
const previous = "2026-11-08T23:57:45Z";
const morning = "2026-11-09T19:40:00Z";
const deadline = "2026-11-09T20:00:00Z";
const retry = "2026-11-09T20:05:00Z";
const firstHourly = "2026-11-09T21:00:00Z";
const lastHourly = "2026-11-10T00:00:00Z";

function fixture(t, { generatedAt = previous, hasNews = true, runs = [], digestStatus = 200 } = {}) {
  const logs = t.mock.method(console, "log", () => {});
  const requests = t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.includes("/data/data.json?")) {
      assert.equal(options.headers, undefined);
      assert.equal(options.cache, "no-store");
      return Response.json({
        generatedAt,
        news: { categories: [{ stories: hasNews ? [{}] : [] }] },
      }, { status: digestStatus });
    }
    assert.equal(options.headers.Authorization, "Bearer test-secret");
    if (url.includes("/runs?")) return Response.json({ workflow_runs: runs });
    assert.ok(url.endsWith("/dispatches"));
    return Response.json({ workflow_run_id: 42 });
  });
  return {
    tick: timestamp => timer.scheduled({ scheduledTime: Date.parse(timestamp) }, env),
    dispatched: () => requests.mock.calls
      .filter(call => call.arguments[1].method === "POST")
      .map(call => JSON.parse(call.arguments[1].body)),
    eventNames: () => logs.mock.calls.map(call => JSON.parse(call.arguments[0]).event),
    requests,
  };
}

test("dispatches at 6:40 Sydney in summer and winter, ignoring the other UTC slot", async t => {
  const { tick, dispatched } = fixture(t);
  await tick(morning);
  await tick("2026-11-09T20:40:00Z");
  await tick("2026-07-09T19:40:00Z");
  await tick("2026-07-09T20:40:00Z");
  assert.deepEqual(dispatched(), [
    { ref: "main", inputs: { notify: true, source: "Cloudflare · 2026-11-10 06:40 Sydney" } },
    { ref: "main", inputs: { notify: true, source: "Cloudflare · 2026-07-10 06:40 Sydney" } },
  ]);
});

test("7:00 checks the live edition without dispatching, and 7:05 retries a stale edition", async t => {
  const { tick, dispatched, eventNames } = fixture(t);
  await tick(deadline);
  assert.deepEqual(dispatched(), []);
  assert.deepEqual(eventNames(), ["edition-stale"]);
  await tick(retry);
  assert.equal(dispatched()[0].inputs.notify, true);
  assert.equal(eventNames().at(-1), "dispatch-accepted");
});

test("a fresh edition with news needs no morning retry", async t => {
  const { tick, requests, eventNames } = fixture(t, { generatedAt: morning });
  await tick(retry);
  assert.equal(requests.mock.callCount(), 1);
  assert.deepEqual(eventNames(), ["edition-fresh"]);
});

test("a fresh timestamp with empty news or an unavailable digest can still retry", async t => {
  const empty = fixture(t, { generatedAt: morning, hasNews: false });
  await empty.tick(retry);
  assert.equal(empty.dispatched().length, 1);
  empty.requests.mock.restore();
  const unavailable = fixture(t, { digestStatus: 503 });
  await unavailable.tick(retry);
  assert.equal(unavailable.dispatched().length, 1);
  assert.equal(unavailable.eventNames().at(-3), "edition-unavailable");
});

test("a running refresh or an already attempted slot prevents another dispatch", async t => {
  const runs = [{ id: 1, status: "in_progress" }];
  const { tick, dispatched, eventNames } = fixture(t, { runs });
  await tick(retry);
  runs[0] = { id: 2, status: "completed", display_title: "Cloudflare · 2026-11-10 07:05 Sydney" };
  await tick(retry);
  assert.equal(dispatched().length, 0);
  assert.equal(eventNames().filter(event => event === "dispatch-skipped").length, 2);
});

test("hourly slots run quietly through 11:00 Sydney only", async t => {
  const { tick, dispatched } = fixture(t);
  for (const slot of [firstHourly, "2026-11-09T22:00:00Z", "2026-11-09T23:00:00Z", lastHourly]) {
    await tick(slot);
  }
  await tick("2026-11-10T01:00:00Z");
  assert.deepEqual(dispatched().map(({ inputs }) => [inputs.source.split(" ")[3], inputs.notify]), [
    ["08:00", false], ["09:00", false], ["10:00", false], ["11:00", false],
  ]);
});

test("an edition prepared within the hourly slot already satisfies the refresh", async t => {
  const { tick, requests } = fixture(t, { generatedAt: firstHourly });
  await tick(firstHourly);
  assert.equal(requests.mock.callCount(), 1);
});
