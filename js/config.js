// Personal configuration — edit freely; the app reads everything from here.
// Keep this file free of sensitive detail: amounts you track are entered on
// the phone and stored in localStorage, never in the repo.
window.MB_CONFIG = {
  // Fallback location when GPS is unavailable or denied
  fallback: { lat: -37.8136, lon: 144.9631, name: "Melbourne" },

  // Time-sensitive items. progressKey items show a tap-to-update progress bar
  // (amount stored on-device); plain items show a countdown only.
  deadlines: [
    {
      id: "card-bonus",
      title: "Card bonus — spend target",
      deadline: "2026-10-05",
      target: 5000,
      progressKey: "mb_qantas_spent",
      sub: "Tap the tracker to update progress (saved on this device).",
      stripLabel: "Bonus days",
    },
    {
      id: "invest-plan",
      title: "Investment plan — next tranche unexecuted",
      deadline: null,
      badge: "waiting on you",
      sub: "Smallest next step: place the first order.",
    },
    {
      id: "card-fee",
      title: "Card annual-fee decision",
      deadline: "2027-06-01",
      sub: "Reconsider keeping the card before the year-2 fee lands.",
      hideUntilDays: 120,
    },
  ],

  // Wordle epoch: puzzle #1 was this date; index advances daily
  gameEpoch: "2026-07-09",

  // Sport section: ESPN scoreboard leagues, rendered in order. Match leagues
  // show recent results + upcoming fixtures; race leagues show last podium +
  // next race. A league with no events in its window hides itself.
  sports: [
    { key: "wc", label: "World Cup", type: "match", path: "soccer/fifa.world", pastH: 40, futureD: 4, results: 3, upcoming: 4 },
    { key: "afl", label: "AFL", type: "match", path: "australian-football/afl", pastH: 36, futureD: 6, results: 3, upcoming: 4 },
    { key: "epl", label: "Premier League", type: "match", path: "soccer/eng.1", pastH: 36, futureD: 7, results: 3, upcoming: 4 },
    { key: "f1", label: "Formula 1", type: "race", path: "racing/f1", pastH: 120, futureD: 24 },
  ],

  // Web Push public key (safe to publish; the private half lives in repo secrets)
  vapidPublicKey: "BEQjlu7uRVc0lYBo6VQc6ZNneQH7kmKN3GBYE98ls59esm36AaXnBdnTP09KIb31WqOJYY36B_UBFp2d4bkYpVg",
};
