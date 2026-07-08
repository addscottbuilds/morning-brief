# Morning Brief

A personal daily-brief PWA for the iPhone home screen. Fully standalone — no
paid services required once deployed to GitHub Pages.

**Sections:** GPS-local weather (Open-Meteo) · ASX/FX watchlist (Yahoo Finance)
· cross-spectrum news digest with narrative-split detection · time-sensitive
countdowns · focus checklist · daily Wordle · daily 5×5 mini crossword.

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
  Wordle list and a validated bank of 5×5 word squares
  (`data/crosswords.json` — every row *and* column is a real word).

## Deploy (once)

1. Create a GitHub repo and push this directory:
   ```
   gh repo create morning-brief --public --source . --push
   ```
2. Enable Pages: repo → Settings → Pages → Source: "Deploy from a branch" →
   Branch `main`, folder `/ (root)`. Or:
   ```
   gh api repos/{owner}/morning-brief/pages -X POST -f "source[branch]=main" -f "source[path]=/"
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

## Customising

Everything personal lives in `js/config.js`: fallback city, countdown
deadlines/targets, and the puzzle epoch. News feeds and market symbols are at
the top of `scripts/build-data.mjs`.
