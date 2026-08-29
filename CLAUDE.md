# Morning Brief

Personal daily-brief PWA for the iPhone home screen: GPS weather, ASX/FX markets, cross-spectrum news digest, sport, word of the day, deals, and three daily puzzles.

## Stack and layout
Vanilla browser JS (no framework, no bundler) served as static files; Node 22 ESM for the data pipeline. Deps are build-time only: `rss-parser`, `@anthropic-ai/sdk`, `web-push`. Data lands in `data/data.json`, committed.
- `index.html`: single page, three swipe pages (news, main, games).
- `js/app.js`: everything except puzzles (weather, markets, news, sport, focus, push).
- `js/config.js`: all personal config (fallback city, deadlines, `gameEpoch`, sport leagues, VAPID public key).
- `scripts/build-data.mjs`: the whole data pipeline; feeds and symbols at the top.
- `sw.js`: service worker, offline shell plus push handler.

## How to run
```
npm install
npx --yes http-server -p 8123 -c-1 .   # matches .claude/launch.json ("morning-brief", port 8123)
node scripts/build-data.mjs            # rebuild data/data.json (npm run build-data)
```
`ANTHROPIC_API_KEY` is optional: without it the digest ships clustered headlines only. Puzzle bank generators are manual, not CI: `gen-crosswords.mjs`, `gen-connections.mjs`, `gen-icons.mjs` under `scripts/`.

## How to verify changes
No test framework. The checks are validators and manual use:
```
node scripts/validate-puzzles.mjs      # npm run validate; rows+columns are real words
node scripts/validate-connections.mjs  # 4 groups of 4, unique words
node scripts/validate-wotd.mjs         # network; hits dictionaryapi.dev, slow and rate-limit prone
```
Validators exit non-zero and print `puzzle N: <problem>` per failure. For app changes: serve locally, check the browser console (`js/app.js` degrades per section rather than throwing). For pipeline changes: run `build-data.mjs` and read stderr; every source failure prints `... fail <name>: <message>` and the section is skipped, so a green run with a shrunken `data.json` is the failure mode to watch for. Hard-refresh or unregister the service worker when a change does not appear.

## Constraints and invariants
- Never rename localStorage keys: `mb_qantas_spent` and `mb_focus` hold user data with no backup. Same for `mb_wordle`, `mb_wordle_stats`, `mb_xword`, `mb_xword_stats`, `mb_conn`, `mb_conn_stats`, `mb_loc`, `mb_push_enabled`.
- `gameEpoch` in js/config.js is puzzle day zero. Changing it renumbers every puzzle.
- Puzzle banks are append-only: `data/crosswords.json` and `data/connections.json` are indexed by day modulo bank length, so reordering or removing entries changes past and present puzzles. Generators append.
- `data/data.json` is a build artifact but is committed and deployed; do not gitignore it.
- Secrets stay in repo secrets (`ANTHROPIC_API_KEY`, `VAPID_*`, `PUSH_SUBSCRIPTION`). js/config.js is public: only the VAPID public key belongs there.

## Gotchas
- Bump `CACHE` in sw.js (currently `morning-brief-v22`) and add any new file to `SHELL`, or iOS keeps serving the old shell.
- The daily refresh runs on four staggered crons (GitHub crons fire late). `.github/last-push` is the committed marker preventing duplicate 6am push sends.
- refresh.yml deploys itself rather than relying on deploy.yml, because `GITHUB_TOKEN` commits do not trigger push-triggered workflows.
- The app reads `data/data.json` with `cache: "no-cache"`; the service worker is network-first for that path only, stale-while-revalidate for everything else.

## Pointers
- Live: https://addscottbuilds.github.io/morning-brief/ (repo `addscottbuilds/morning-brief`).
- Workflows: `.github/workflows/refresh.yml` (data, deploy, push), `deploy.yml` (push to main), `push.yml` (manual test send).

## Decisions
- Deploy straight from the workflow to skip the shared Pages build queue and Jekyll.
- News clustering uses greedy seed linkage with a stronger threshold for cross-lean merges, so unrelated stories stop chaining (see build-data.mjs).
- Connections puzzles come from a curated bank with an exact-cover uniqueness proof: traps mislead but never make a puzzle unsolvable.
