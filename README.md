# Morning Brief

A personal daily-brief PWA for the iPhone home screen. Fully standalone — no
paid services required once deployed to GitHub Pages.

**Sections:** GPS-local weather with rain chart (Open-Meteo) · ASX/FX watchlist
+ big-mover board (Yahoo Finance) · cross-spectrum news digest with genre tabs
and narrative-split detection · sport scores, fixtures and ladders (AFL,
Premier League, F1 — ESPN) · word of the day with pronunciation audio ·
OzBargain deals sheet (pull down) · time-sensitive countdowns · focus
checklist · daily Wordle, 5×5 mini crossword and Connections.

## How it works

- The **app** is static (HTML/CSS/JS + service worker). Weather is fetched
  live on-device using the phone's location.
- A **GitHub Actions workflow** (`.github/workflows/refresh.yml`) runs every
  morning (~5:45–6:45 Melbourne time), pulls market prices and RSS news from
  outlets across the political spectrum, clusters matching stories, and
  commits `data/data.json`, which the app loads.
- With an optional `ANTHROPIC_API_KEY` repo secret, Claude writes neutral
  summaries and flags stories where left/right coverage genuinely diverges
  (who believes what + common ground). Without it, the digest still works with
  clustered headlines grouped by outlet lean.
- Puzzles are fully offline: answers rotate daily through a pre-shuffled
  Wordle list, a validated bank of 5×5 word squares (`data/crosswords.json` —
  every row *and* column is a real word), and a Connections bank
  (`data/connections.json`) assembled from a curated category set with a
  uniqueness proof per puzzle.

## Deploy (once)

1. Create a GitHub repo and push this directory:
   ```
   gh repo create morning-brief --public --source . --push
   ```
2. Enable Pages with GitHub Actions as the source (the deploy workflows upload
   a Pages artifact — no branch build): repo → Settings → Pages → Source:
   "GitHub Actions". Or:
   ```
   gh api repos/{owner}/morning-brief/pages -X POST -f build_type=workflow
   ```
3. (Optional) Add the `ANTHROPIC_API_KEY` secret for AI news summaries:
   repo → Settings → Secrets and variables → Actions.
4. On the iPhone: open `https://<user>.github.io/morning-brief/` in Safari →
   Share → **Add to Home Screen**. Allow location when asked.

## Local development

```
npm install
node scripts/build-data.mjs     # rebuild data/data.json
node scripts/validate-puzzles.mjs
npx serve .                     # then open http://localhost:3000
```

The local app uses the checked-in digest. On a phone, swipe between **News**,
**Today**, and **Games**, or tap their labels. **More** holds Markets, Deals,
Data status, and Settings. Use Settings to change appearance or the Today
section order. A saved edition includes its original preparation time.

The Games lobby shows progress from the same daily games. The extra
Connections challenge is a separate practice board that resets on reload.

The redesigned interface lives in `edition-v34.html`. The root document keeps
the previous interface available until the new service worker has cached the
entire new shell. The worker then serves the redesigned edition at the same
root URL. Test the installed iPhone app and an interrupted upgrade before
changing this fallback or retiring its assets.

## Customising

Everything personal lives in `js/config.js`: fallback city, countdown
deadlines/targets, and the puzzle epoch. News feeds and market symbols are at
the top of `scripts/build-data.mjs`.
