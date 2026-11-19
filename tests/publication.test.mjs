import assert from "node:assert/strict";
import test from "node:test";
import { verifyPublication } from "../scripts/verify-edition.mjs";

const expected = "2026-11-18T19:40:00Z";
const now = () => Date.parse("2026-11-18T20:00:00Z");
function digest(generatedAt) {
  return { generatedAt, markets: { items: [] }, news: { categories: [{ stories: [{ headline: "Morning news" }] }] } };
}

test("Sydney midnight on either side of the daylight-saving transitions", () => {
  for (const midnight of [
    "2026-04-04T13:00:00Z", "2026-04-05T14:00:00Z",
    "2026-10-03T14:00:00Z", "2026-10-04T13:00:00Z",
  ]) {
    const time = Date.parse(midnight);
    const old = digest(new Date(time - 1).toISOString());
    assert.equal(MorningBriefEdition.inspect(old, time).state, "previous");
    assert.equal(MorningBriefEdition.inspect(digest(midnight), time).state, "current");
  }
});

test("legacy and partial editions can be readable, empty or future editions cannot", () => {
  const data = digest(expected);
  data.news = { stories: [{ headline: "A legacy headline" }] };
  assert.equal(MorningBriefEdition.inspect(data, now()).state, "current");
  for (const broken of [
    { ...data, news: { categories: [{ stories: [null, {}, { headline: " " }] }] } },
    { ...data, generatedAt: "2026-11-18T20:10:00Z" }, { ...data, generatedAt: "2026-11-19" },
    { ...data, markets: {} }, null,
  ]) assert.equal(MorningBriefEdition.inspect(broken, now()).state, "invalid");
});

function verify(responses) {
  const pauses = [];
  const reads = [];
  const result = verifyPublication("https://brief.example/morning-brief", expected, {
    now, log() {}, sleep: ms => pauses.push(ms),
    request: async (url, options) => {
      reads.push(url.href);
      assert.equal(url.pathname, "/morning-brief/data/data.json");
      assert.ok(url.searchParams.has("verify"));
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  });
  return { result, reads, pauses };
}

test("publication verification tolerates propagation and a newer same-day publication", async () => {
  const { result, reads, pauses } = verify([
    Response.json(digest("2026-11-18T19:39:59Z")), new Response("offline", { status: 503 }),
    Response.json(digest("2026-11-18T19:41:00Z")),
  ]);
  await result;
  assert.equal(reads.length, 3);
  assert.deepEqual(pauses, [5000, 15000]);
});

test("publication verification stops after four unsuccessful reads", async () => {
  const { result, reads, pauses } = verify([
    new Error("timeout"), new Response("<html>"), Response.json({ ...digest(expected), news: { stories: [] } }),
    Response.json(digest("2026-11-17T19:40:00Z")),
  ]);
  await assert.rejects(result, /after four reads/);
  assert.equal(reads.length, 4);
  assert.deepEqual(pauses, [5000, 15000, 30000]);
});

test("a matching edition verifies immediately and a missing expectation fails before reading", async () => {
  const { result, reads } = verify([Response.json(digest(expected))]);
  await result;
  assert.equal(reads.length, 1);
  await assert.rejects(verifyPublication("https://brief.example", "", {
    request: assert.fail,
  }), /Missing expected/);
});
